# Architecture

Current-state index. Details for each area live in `docs/architecture/<area>.md` when needed. See `docs/agents/architecture.md` for the reading rules.

## Node devcontainer (walking skeleton)

Proposed design: `.scratch/node-devcontainer/design.md`. Implemented so far: image, Template, egress start-up step, credential isolation, acceptance suite, CI. Not yet: pnpm policy, installer, Renovate.

| Module | Anchor | Owns |
| --- | --- | --- |
| Base material | `base/` | Files copied to fixed root-owned system paths: `bin/claude-yolo`, `bin/codex-yolo`, `claude/managed-settings.json` (to `/etc/claude-code`), `codex/config.toml` (to `/etc/codex`, lowest layer so yolo flags still win). Host-credential isolation: `vscode/dev-setup-scrub.sh` (to `/etc/profile.d`, hooked into `/etc/bash.bashrc`, run by `postStartCommand`), `git/gitconfig` (to `/etc/dev-setup`, read-only target of `GIT_CONFIG_GLOBAL`), `bin/git-credential-dev-setup` (PAT from `DEV_SETUP_GITHUB_PAT`, github.com only). `egress/` (to `/usr/local/share/egress`): `allowlist.txt` (one domain per line; the Base Egress Allowlist and its verified login hosts), `start.sh` (root start-up step, fails closed by `kill -TERM 1`), `render.sh` (dnsmasq conf + nftables ruleset), `selftest.sh`. Later hardening lands here. |
| Node Variant | `variants/node/` | `Dockerfile` (the one place for the base digest and pinned pnpm/Claude Code/Codex versions); `.devcontainer/features/egress/` is a local Feature carrying only the root `entrypoint` (the devcontainer CLI requires local Features under `.devcontainer/`); `devcontainer.json` is build-time only and becomes the image's `devcontainer.metadata` (`containerUser` root for the entrypoint, `remoteUser` node, `capAdd` NET_ADMIN/NET_RAW, `no-new-privileges`, init, env, login volumes). Build context is the repo root, filtered by `.dockerignore`. |
| Node Template | `templates/node/` | Only what image metadata cannot carry: `--cap-drop=ALL`, limits, `initializeCommand`, read-only mounts of `.git/hooks`, `.git/config`, `.devcontainer`, `.vscode`. `remoteEnv` passes the PAT (host var named by option `patEnvVar`) and git identity (`GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL`) from the host. Option `image` selects the image. |
| Acceptance suite | `tests/` | `npm test`: builds the image, publishes the Template to a throwaway local registry, applies and starts it with the devcontainer CLI, probes as `node`. `credentials.test.mjs` covers host-credential isolation with fake tokens; manual VS Code checklist in `docs/manual/vscode-reopen-in-container.md`. |
| CI/release | `.github/workflows/ci.yml`, `scripts/check-pins.mjs` | PR pin check and acceptance run; on `main`: build and push, cosign keyless sign, SBOM and provenance attestations (pushed to the registry), Template publish with the `image` option default rewritten to the digest. |

Egress: the start-up step consumes an allowlist file (override with env `EGRESS_ALLOWLIST`) and knows nothing of manifests. Test seam: `tests/` probes as `node` and asserts the container stopped on a broken allowlist.

Dependency direction: Template references the image; the image never references the Template; tests depend on everything.
