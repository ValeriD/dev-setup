# Architecture

Current-state index. Details for each area live in `docs/architecture/<area>.md` when needed. See `docs/agents/architecture.md` for the reading rules.

## Node devcontainer (walking skeleton)

Proposed design: `.scratch/node-devcontainer/design.md`. Implemented so far: image, Template, egress start-up step, acceptance suite. Not yet: pnpm policy, credential scrubbing, installer, CI.

| Module | Anchor | Owns |
| --- | --- | --- |
| Base material | `base/` | Files copied to fixed root-owned system paths: `bin/claude-yolo`, `bin/codex-yolo`, `claude/managed-settings.json` (to `/etc/claude-code`), `codex/config.toml` (to `/etc/codex`, lowest layer so yolo flags still win). `egress/` (to `/usr/local/share/egress`): `allowlist.txt` (one domain per line; the Base Egress Allowlist and its verified login hosts), `start.sh` (root start-up step, fails closed by `kill -TERM 1`), `render.sh` (dnsmasq conf + nftables ruleset), `selftest.sh`. Later hardening lands here. |
| Node Variant | `variants/node/` | `Dockerfile` (the one place for the base digest and pinned pnpm/Claude Code/Codex versions); `.devcontainer/features/egress/` is a local Feature carrying only the root `entrypoint` (the devcontainer CLI requires local Features under `.devcontainer/`); `devcontainer.json` is build-time only and becomes the image's `devcontainer.metadata` (`containerUser` root for the entrypoint, `remoteUser` node, `capAdd` NET_ADMIN/NET_RAW, `no-new-privileges`, init, env, login volumes). Build context is the repo root, filtered by `.dockerignore`. |
| Node Template | `templates/node/` | Only what image metadata cannot carry: `--cap-drop=ALL`, limits, `initializeCommand`, read-only mounts of `.git/hooks`, `.git/config`, `.devcontainer`, `.vscode`. Option `image` selects the image. |
| Acceptance suite | `tests/` | `npm test`: builds the image, publishes the Template to a throwaway local registry, applies and starts it with the devcontainer CLI, probes as `node`. |

Egress: the start-up step consumes an allowlist file (override with env `EGRESS_ALLOWLIST`) and knows nothing of manifests. Test seam: `tests/` probes as `node` and asserts the container stopped on a broken allowlist.

Dependency direction: Template references the image; the image never references the Template; tests depend on everything.
