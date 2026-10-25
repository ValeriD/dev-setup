#!/bin/sh
# Runs as `node` from postStartCommand. Warns (never fails) for each secret an
# MCP server names in the Extension Manifests that is unset or empty in this
# environment. Only names are read from the list and printed; values never are.
LIST=${DEV_SETUP_MCP_SECRETS:-/etc/dev-setup/mcp-secrets}
[ -r "$LIST" ] || exit 0
while IFS= read -r name; do
  [ -n "$name" ] || continue
  if [ -z "$(printenv "$name")" ]; then
    echo "dev-setup: WARNING: MCP secret $name is not set. Export it on the host and add \"$name\": \"\${localEnv:$name}\" to remoteEnv in .devcontainer/devcontainer.json; the MCP server that needs it will not authenticate." >&2
  fi
done <"$LIST"
exit 0
