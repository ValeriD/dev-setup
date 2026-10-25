# Architecture

Current-state index. Details for each area live in `docs/architecture/<area>.md` when needed. See `docs/agents/architecture.md` for the reading rules.

## Node devcontainer (walking skeleton)

Proposed design: `.scratch/node-devcontainer/design.md`. Implemented so far: image, Template, acceptance suite, pnpm policy. Not yet: egress start-up step, credential scrubbing, installer, CI.

| Module | Anchor | Owns |
| --- | --- | --- |
| Base material | `base/` | Files copied to fixed root-owned system paths: `bin/claude-yolo`, `bin/codex-yolo`, `claude/managed-settings.json` (to `/etc/claude-code`), `codex/config.toml` (to `/etc/codex`, lowest layer so yolo flags still win). Later hardening lands here. |
| Node Variant | `variants/node/` | `Dockerfile` (the one place for the base digest and pinned pnpm/Claude Code/Codex versions); `devcontainer.json` is build-time only and becomes the image's `devcontainer.metadata` (user, `no-new-privileges`, init, env, login volumes). The pnpm supply-chain policy (ADR 0001) lives in its `containerEnv` as `pnpm_config_*` (pnpm 11.0 honours only some keys from global `config.yaml`, not `trustPolicy`/`strictDepBuilds`/`frozenLockfile`) plus `NPM_CONFIG_*` defaults for ad-hoc npm; a project loosens builds only via `allowBuilds`. Build context is the repo root, filtered by `.dockerignore`. |
| Node Template | `templates/node/` | Only what image metadata cannot carry: `--cap-drop=ALL`, limits, `initializeCommand`, read-only mounts of `.git/hooks`, `.git/config`, `.devcontainer`, `.vscode`. Option `image` selects the image. |
| Acceptance suite | `tests/` | `npm test`: builds the image, publishes the Template to a throwaway local registry, applies and starts it with the devcontainer CLI, probes as `node`. `pnpm-policy.test.mjs` runs pnpm in fixture projects against `fixtures/registry-stub.mjs`, a dependency-free registry stub on container loopback with controlled publish times. |

Dependency direction: Template references the image; the image never references the Template; tests depend on everything.
