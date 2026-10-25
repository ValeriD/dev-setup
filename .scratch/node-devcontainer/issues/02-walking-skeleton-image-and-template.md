# 02: Walking skeleton — hardened Node image and Template, built locally

**What to build:** A developer can apply the Node Template to an empty project folder with the devcontainer CLI, start the container, and land in a shell as `node`. That user has no sudo, no capabilities and no setuid escalation. Claude Code and Codex are installed at pinned versions with auto-update off. `claude-yolo` and `codex-yolo` exist. Login state lives in per-project volumes. `.git/hooks`, `.git/config`, `.devcontainer/` and `.vscode/` are read-only inside. An automated acceptance harness proves all of this against the locally built image.

**Blocked by:** 01 (Spike — verify the design's risky integration points)

**Status:** done

## Technical context

**Design:** `.scratch/node-devcontainer/design.md`. Use the "Proposed shape" rows for Base material, Node Variant, Node Template and Acceptance suite; the "Image build" and "Agents" flows; and the Constraints. Read the ticket 01 Answer first and follow its findings.

- **Modules:**
  - Base material (`base/`): the Agent wrappers and the policy files used at this stage.
  - Node Variant (`variants/node/`): Dockerfile and the build-time `devcontainer.json` that produces the image metadata label.
  - Node Template (`templates/node/`): the project `devcontainer.json` with `runArgs` (`--cap-drop=ALL`, limits), `initializeCommand` that creates missing mount sources, and the workspace read-only mounts.
  - Acceptance suite (`tests/`).
- **Also:** run `git init` for the repository, with a `.gitignore` (keep `.scratch/` tracked unless CLAUDE.md says otherwise).
- **Reuse:**
  - Dev Container spec image metadata for users, volumes (`claude-${devcontainerId}`, `codex-${devcontainerId}`), env (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `DISABLE_AUTOUPDATER`), `securityOpt` and `init`.
  - The devcontainer CLI for building and starting.
  - `node:test` for the harness.
- **Pinning:** Node 24 base image by digest; pnpm, Claude Code and Codex at exact versions in one obvious place.
- **Codex defaults:** `sandbox_mode = "danger-full-access"` and `approval_policy = "on-request"`, in Codex's root-owned config layer as the spike found it.
- **Dependency direction:** the Template references the image; the image never references the Template.
- **Must not introduce:**
  - sudo or any setuid helper;
  - a Docker socket mount;
  - third-party devcontainer Features;
  - a shared base image;
  - hardening in the Template that image metadata can carry;
  - the firewall (ticket 03), pnpm policy (04) or credential scrubbing (05).
- **Validation seam:** the container started by `devcontainer up` from the locally applied Template, probed with `devcontainer exec` as `node`.
- **Coverage:**
  - SC-01 (local Template variant).
  - SC-06, privilege part only: no sudo, `CapEff` = 0, no runnable setuid binaries.
  - SC-09, SC-11, SC-12.
  - SC-10: volume persistence and per-project separation, using marker files. Add a manual checklist for real login and Codex device auth.
  - SC-18.
  - All at container acceptance level.

- [x] `devcontainer templates apply` from the local template path, then `devcontainer up`, yields a running container in a fresh folder that has a `.git` directory
- [x] As `node`: `sudo` is absent, `CapEff` is 0, and there is no setuid path to root
- [x] `claude --version` and `codex --version` equal the pinned values in the repo; auto-update is disabled
- [x] `claude`/`codex` start in normal modes; `claude-yolo`/`codex-yolo` pass the full-autonomy flags
- [x] Codex runs a shell command without sandbox-startup errors and without extra container privileges
- [x] A marker in `~/.claude` and `~/.codex` survives a rebuild; a second project starts with empty volumes
- [x] Writes to `.git/hooks`, `.git/config`, `.devcontainer/` and `.vscode/` fail; editing a source file and `git commit` succeed
- [x] The acceptance suite runs with one command and is documented in the repo README

## Spike findings to apply (from ticket 01 Answer)

- Claude Code's `postinstall` (`node install.cjs`) is required. Without it the native binary is missing. With install scripts disabled, run it explicitly (or symlink the platform binary) as one deliberate Dockerfile step. Codex needs no scripts.
- Codex defaults (`sandbox_mode`, `approval_policy`) go in `/etc/codex/config.toml`, not `managed_config.toml`, because the managed file overrides the `codex-yolo` flags.
- Inputs that root reads at start must be world-readable, and its outputs root-owned. Root has no `DAC_OVERRIDE` or `CHOWN`.

## Comments

- Implemented. `npm test` passes 7/7 (SC-01, SC-06 privilege, SC-09, SC-10, SC-11, SC-12, SC-18). Real logins and VS Code remain manual (README checklist).
- Template "apply from local path": the CLI only applies OCI refs, so the suite publishes `templates/` to a throwaway `registry:2.8.3` and applies from there. Template option `image` carries the image ref (CI rewrites its default with the digest in ticket 10).
- SC-12 uses a mock Responses endpoint inside the container; Codex's bwrap sandbox cannot start under `--cap-drop=ALL`, which is why `danger-full-access` is the default.
- Files under `/etc/claude-code` and `/etc/codex` must be world-readable (repo files are 660); the Dockerfile normalises modes.
- Not done here: npm 12, `containerUser: root`/Feature entrypoint (ticket 03). pnpm is pinned at 11.0.0.
