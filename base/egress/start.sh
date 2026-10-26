#!/bin/sh
# Root start-up step: apply the Egress Allowlist and install the Consuming
# Project layer, or stop the container.
# Runs as the Feature entrypoint, before any dev-user process, with only
# NET_ADMIN, NET_RAW and DAC_READ_SEARCH. A non-zero exit does not stop a container, and
# `devcontainer up` still reports success, so on any failure we SIGTERM PID 1
# (the keep-alive shell traps 15 and exits). There is no fail-open path.
#
# Order: lock the Base allowlist (image-built: Base + Variant), then, if the
# project has an Extension Manifest, run the installer in start mode (it fetches
# project sources, reachable only under the Base allowlist), then re-lock with
# the full allowlist it assembled.
set -eu

DIR=/usr/local/share/egress
ALLOWLIST=${EGRESS_ALLOWLIST:-$DIR/allowlist.txt}
RUN=/run/egress
MANIFESTS=/opt/dev-setup/manifests
INSTALLER=/opt/dev-setup/installer/src/cli.mjs
PROJECT_MANIFEST=${DEV_SETUP_WORKSPACE:-/workspace}/.devcontainer/extensions.json
# Hash of the project manifest this start applied ("none" without one), read by the
# host skill's `status` to tell whether the manifest changed since (recreate pending).
# The Base and Variant layers are fixed by the image. World-readable, no secrets.
APPLIED=/run/dev-setup/applied-manifest

# Status files for wait-ready.sh (the postStartCommand): `devcontainer up` does not
# wait for the entrypoint, so the lifecycle command is what makes `up` fail with
# the reason. $RUN is world-readable; messages carry no secrets.
fail() {
  echo "egress: FAILED: $*" >&2
  # Best effort: nothing leaves while the failure is reported and the container stops.
  printf 'table inet closed { chain output { type filter hook output priority 0; policy drop; } }\n' | nft -f - 2>/dev/null || true
  mkdir -p "$RUN" 2>/dev/null || true
  printf '%s\n' "$*" >"$RUN/failed" 2>/dev/null || true
  sleep 3 # let wait-ready.sh read the reason before the container stops
  kill -TERM 1
  exit 1
}

DNSMASQ_PID=

# apply ALLOWLIST RESOLV_CONF: render, load the ruleset, (re)start dnsmasq, self-test.
apply() {
  # Render conf + ruleset from the allowlist and the upstream resolv.conf (validates both).
  sh "$DIR/render.sh" "$1" "$2" "$RUN" || fail "cannot render config from $1"
  # Ruleset first, so the set exists before dnsmasq fills it.
  nft -f "$RUN/ruleset.nft" || fail "cannot load nftables ruleset"
  if [ -n "$DNSMASQ_PID" ]; then
    kill "$DNSMASQ_PID" 2>/dev/null || true
    wait "$DNSMASQ_PID" 2>/dev/null || true
  fi
  # dnsmasq cannot drop privileges here (no SETUID/SETGID): root, foreground, backgrounded.
  setsid dnsmasq --no-daemon --conf-file="$RUN/dnsmasq.conf" >"$RUN/dnsmasq.log" 2>&1 &
  DNSMASQ_PID=$!
  printf 'nameserver 127.0.0.1\n' >/etc/resolv.conf || fail "cannot point resolv.conf at dnsmasq"
  sh "$DIR/selftest.sh" "$DNSMASQ_PID" || fail "self-test failed: $(tail -n 5 "$RUN/dnsmasq.log" | tr '\n' ' ')"
}

main() {
  [ "$(id -u)" = 0 ] || fail "not running as root"
  mkdir -p "$RUN" || fail "cannot create $RUN"
  rm -f "$RUN/ready" "$RUN/failed" # a restarted container reuses its filesystem
  # Keep Docker's resolv.conf: dnsmasq's upstreams come from it, and /etc/resolv.conf is replaced below.
  cp /etc/resolv.conf "$RUN/resolv.orig" || fail "cannot read /etc/resolv.conf"
  apply "$ALLOWLIST" "$RUN/resolv.orig"
  echo "egress: base allowlist applied ($(grep -c . "$RUN/domains") domains)"

  # Consuming Project layer. An existing but invalid manifest is fatal; absence is normal.
  # Absence is only believed if the directory itself is readable (never fail open on EACCES).
  ls -A "$(dirname "$PROJECT_MANIFEST")" >/dev/null || fail "cannot read $(dirname "$PROJECT_MANIFEST")"
  mkdir -p "$(dirname "$APPLIED")" && rm -f "$APPLIED" || fail "cannot prepare $APPLIED"
  applied=none
  if [ -e "$PROJECT_MANIFEST" ]; then
    # Hashed before the installer reads it, so a later edit always shows as a difference.
    sum=$(sha256sum <"$PROJECT_MANIFEST") || fail "cannot hash $PROJECT_MANIFEST"
    applied="sha256:${sum%% *}"
    gitbase=
    [ -z "${DEV_SETUP_GIT_BASE:-}" ] || gitbase="--git-base $DEV_SETUP_GIT_BASE" # test seam: local git fixtures
    # shellcheck disable=SC2086
    node "$INSTALLER" install --mode start $gitbase \
      --manifest "$MANIFESTS/base.json" --manifest "$MANIFESTS/node.json" \
      --project "$PROJECT_MANIFEST" --egress-out "$RUN/allowlist.full" 2>"$RUN/installer.log" \
      || fail "project layer rejected: $(tr '\n' ' ' <"$RUN/installer.log")"
    apply "$RUN/allowlist.full" "$RUN/resolv.orig"
    echo "egress: full allowlist applied ($(grep -c . "$RUN/domains") domains)"
  fi
  printf '%s\n' "$applied" >"$APPLIED.tmp" && chmod 644 "$APPLIED.tmp" && mv "$APPLIED.tmp" "$APPLIED" || fail "cannot write $APPLIED"
  touch "$RUN/ready"
}

main || fail "start-up step aborted"
