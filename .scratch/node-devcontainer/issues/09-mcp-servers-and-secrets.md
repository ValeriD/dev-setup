# 09: MCP servers and secrets

**What to build:**
- MCP servers declared in manifests are available to the Agents they target, as either kind:
  - a local stdio server from an npm package at an exact version;
  - a remote HTTP server (`mcp-remote`) with declared egress domains.
- Secrets an MCP server needs come from host environment variables named in the manifest. They never appear in an image layer or committed file.
- A missing secret produces a clear warning at attach.

**Blocked by:** 07 (Consuming Project layer installed at container start)

**Status:** ready-for-agent

## Technical context

**Design:** `.scratch/node-devcontainer/design.md`. Use the "Extension Manifest shape" section (mcp entry), decision D2, the Reuse decisions (MCP stdio servers pre-installed under `/opt/dev-setup/mcp`), and the "Attach" flow (missing-secret warning). Ticket 01 Answer question 4 tells you where Codex MCP config goes.

- **Modules:**
  - Extension installer: the `mcp` and `mcp-remote` kinds.
    - stdio servers are pre-installed with pnpm at exact versions, under the pnpm policy.
    - It renders Claude MCP config (managed) and Codex `mcp_servers` (system config, through `smol-toml`).
    - Secrets are passed by env var name only.
    - `mcp-remote` entries without `egress` are rejected.
  - Node Template: documents how to add `remoteEnv` entries with `${localEnv:…}` for the named secrets.
  - Base material: a `postStartCommand` check that warns about each missing named secret.
- **Must not introduce:** `npx` fetching at runtime, secret values in manifests, rendered files or images, or Pinned Ref exemptions for anything except `mcp-remote`.
- **Validation seam:** container acceptance with a fixture stdio MCP package served from the local registry stub, and Agents' MCP listing commands.
- **Coverage:** SC-17.

- [ ] A stdio MCP server entry appears in both Agents' MCP listings, running from the pre-installed path
- [ ] An `mcp-remote` entry without `egress` is rejected; with `egress`, its domain is reachable
- [ ] A secret set in the host env reaches the MCP server's environment; `docker history` and a repo grep show no value
- [ ] A named but missing secret prints a warning at attach
