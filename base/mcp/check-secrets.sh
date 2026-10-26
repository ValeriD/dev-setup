#!/bin/sh
# Runs as `node` from postStartCommand. Warns (never fails) for each Named
# Secret the Extension Manifests declare (an MCP server's, or a container-wide
# one from a top-level `secrets`) that is unset or empty in this environment.
# Each line of the list is `NAME<TAB>declarers`; only names and declarers are
# read and printed, values never are.
LIST=${DEV_SETUP_SECRETS_LIST:-/etc/dev-setup/secrets}
[ -r "$LIST" ] || exit 0
TAB=$(printf '\t')
while IFS="$TAB" read -r name by; do
  [ -n "$name" ] || continue
  if [ -z "$(printenv "$name")" ]; then
    echo "dev-setup: WARNING: secret $name (${by:-declared by an Extension Manifest}) is not set. Export it on the host and add \"$name\": \"\${localEnv:$name}\" to remoteEnv in .devcontainer/devcontainer.json; until then, what needs it in the container will not get it." >&2
  fi
done <"$LIST"
exit 0
