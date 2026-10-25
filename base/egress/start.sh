#!/bin/sh
# Root start-up step: apply the Egress Allowlist, or stop the container.
# Runs as the Feature entrypoint, before any dev-user process, with only
# NET_ADMIN and NET_RAW. A non-zero exit does not stop a container, and
# `devcontainer up` still reports success, so on any failure we SIGTERM PID 1
# (the keep-alive shell traps 15 and exits). There is no fail-open path.
set -eu

DIR=/usr/local/share/egress
ALLOWLIST=${EGRESS_ALLOWLIST:-$DIR/allowlist.txt}
RUN=/run/egress

fail() {
  echo "egress: FAILED: $*" >&2
  kill -TERM 1
  exit 1
}

main() {
  [ "$(id -u)" = 0 ] || fail "not running as root"
  mkdir -p "$RUN" || fail "cannot create $RUN"
  # Render conf + ruleset from the allowlist and /etc/resolv.conf (validates both).
  sh "$DIR/render.sh" "$ALLOWLIST" /etc/resolv.conf "$RUN" || fail "cannot render config from $ALLOWLIST"
  # Ruleset first, so the set exists before dnsmasq fills it.
  nft -f "$RUN/ruleset.nft" || fail "cannot load nftables ruleset"
  # dnsmasq cannot drop privileges here (no SETUID/SETGID): root, foreground, backgrounded.
  setsid dnsmasq --no-daemon --conf-file="$RUN/dnsmasq.conf" >"$RUN/dnsmasq.log" 2>&1 &
  DNSMASQ_PID=$!
  printf 'nameserver 127.0.0.1\n' >/etc/resolv.conf || fail "cannot point resolv.conf at dnsmasq"
  sh "$DIR/selftest.sh" "$DNSMASQ_PID" || fail "self-test failed: $(tail -n 5 "$RUN/dnsmasq.log" | tr '\n' ' ')"
  echo "egress: allowlist applied ($(grep -c . "$RUN/domains") domains)"
}

main || fail "start-up step aborted"
