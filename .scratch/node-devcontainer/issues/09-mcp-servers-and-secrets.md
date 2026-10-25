# 09: MCP servers and secrets

**What to build:**
- MCP servers declared in manifests are available to the Agents they target, as either kind:
  - a local stdio server from an npm package at an exact version;
  - a remote HTTP server (`mcp-remote`) with declared egress domains.
- Secrets an MCP server needs come from host environment variables named in the manifest. They never appear in an image layer or committed file.
- A missing secret produces a clear warning at attach.

**Blocked by:** 07 (Consuming Project layer installed at container start)

**Status:** done

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

- [x] A stdio MCP server entry appears in both Agents' MCP listings, running from the pre-installed path
- [x] An `mcp-remote` entry without `egress` is rejected; with `egress`, its domain is reachable
- [x] A secret set in the host env reaches the MCP server's environment; `docker history` and a repo grep show no value
- [x] A named but missing secret prints a warning at attach

## Comments

- Implemented: `installer/src/mcp.mjs` (pnpm install of stdio servers into `/opt/dev-setup/mcp/<name>` under the pnpm policy, which the installer sets in the child env itself; rendering for Claude and Codex; secret-name list), hooks in `installBuild`/`installStart` (start mode renders from all layers, installs only project packages), `base/mcp/check-secrets.sh` run by the image `postStartCommand`, Template comment on `remoteEnv`, `tests/mcp.test.mjs`, and `smol-toml@1.9.1`.
- Deviation 1: Claude has no non-exclusive managed MCP file. `managed-settings.d` has no MCP key (`managedMcpServers` and `mcpServers` there were ignored, verified with `claude mcp list`); only `/etc/claude-code/managed-mcp.json` works, and it gives the policy exclusive control: `claude mcp add` is refused. It is written only when some layer declares an MCP server, so projects without MCP are unaffected. Product owner: confirm that locking MCP to the manifest is wanted.
- Deviation 2: schema for `mcp-remote` drops `env` and adds optional `bearerTokenEnv` (one host env var name), since a remote server needs a header mapping, not a process env. Rendered as Claude `Authorization: Bearer ${NAME}` and Codex `bearer_token_env_var`. Remote servers use each Agent native HTTP transport, not the `mcp-remote` npm bridge.
- Deviation 3: Codex block is a marker-delimited generated section appended to `/etc/codex/config.toml` (hand-written defaults and comments untouched, rewritten whole on each run); `smol-toml` only serialises the table. Codex stdio servers receive secrets through `env_vars` (names only). Codex listing is verified at config level; the secret reaching a running Codex server is not exercised (no model call).
- Duplicate MCP server names across layers are rejected. The kind `mcp` start-mode install needs the npm registry, which the Base allowlist already covers.
- Belongs elsewhere: ticket 08 also edits `installBuild`/`installStart` and Claude managed settings; merge conflicts in `install.mjs` are expected (my lines: the `mcp` import, `SYSTEM_PATHS` additions, `installMcpPackages`/`writeMcpConfig` calls, the early `return` for MCP kinds in `installSkills`). The skill tickets may want to offer `mcp`/`mcp-remote` in add/remove and the secrets operation, using `bearerTokenEnv`/`env` and the Template `remoteEnv` pattern.
