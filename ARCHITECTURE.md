# Architecture

Current-state index. Details for each area live in `docs/architecture/<area>.md` when needed. See `docs/agents/architecture.md` for the reading rules.

## Node devcontainer (walking skeleton)

Proposed design: `.scratch/node-devcontainer/design.md`. Implemented so far: image, Template, acceptance suite, credential isolation, CI. Not yet: egress start-up step, pnpm policy, installer, Renovate.

| Module | Anchor | Owns |
| --- | --- | --- |
| Base material | `base/` | Files copied to fixed root-owned system paths: `bin/claude-yolo`, `bin/codex-yolo`, `claude/managed-settings.json` (to `/etc/claude-code`), `codex/config.toml` (to `/etc/codex`, lowest layer so yolo flags still win). Host-credential isolation: `vscode/dev-setup-scrub.sh` (to `/etc/profile.d`, hooked into `/etc/bash.bashrc`, run by `postStartCommand`), `git/gitconfig` (to `/etc/dev-setup`, read-only target of `GIT_CONFIG_GLOBAL`), `bin/git-credential-dev-setup` (PAT from `DEV_SETUP_GITHUB_PAT`, github.com only). Later hardening lands here. |
| Node Variant | `variants/node/` | `Dockerfile` (the one place for the base digest and pinned pnpm/Claude Code/Codex versions); `devcontainer.json` is build-time only and becomes the image's `devcontainer.metadata` (user, `no-new-privileges`, init, env, login volumes). Build context is the repo root, filtered by `.dockerignore`. |
| Node Template | `templates/node/` | Only what image metadata cannot carry: `--cap-drop=ALL`, limits, `initializeCommand`, read-only mounts of `.git/hooks`, `.git/config`, `.devcontainer`, `.vscode`. `remoteEnv` passes the PAT (host var named by option `patEnvVar`) and git identity (`GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL`) from the host. Option `image` selects the image. |
| Acceptance suite | `tests/` | `npm test`: builds the image, publishes the Template to a throwaway local registry, applies and starts it with the devcontainer CLI, probes as `node`. `credentials.test.mjs` covers host-credential isolation with fake tokens; manual VS Code checklist in `docs/manual/vscode-reopen-in-container.md`. |
| CI/release | `.github/workflows/ci.yml`, `scripts/check-pins.mjs` | PR pin check and acceptance run; on `main`: build and push, cosign keyless sign, SBOM and provenance attestations (pushed to the registry), Template publish with the `image` option default rewritten to the digest. |

Dependency direction: Template references the image; the image never references the Template; tests depend on everything.
