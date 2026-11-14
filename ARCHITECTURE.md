# Architecture

What exists now, one row per module. The code is the detail; this page says where to look and which rules aren't obvious from the code. Reading rules: `docs/agents/architecture.md`. Terms: `CONTEXT.md`.

## How the pieces fit

```
extensions/base.json ─┐
variants/node/        ├─ image build ─► ghcr.io/valerid/dev-setup/node ◄── Template (templates/node/)
installer/  ──────────┘   (Base + Variant layers baked in)                  │
                                                                            ▼
                               Consuming Project: .devcontainer/ + extensions.json (Project layer,
                               installed by base/egress/start.sh at every container start)

skills/dev-container/ (host) ─► writes a project's .devcontainer/, reads this repo and the image
```

Dependency direction: the Template references the image, never the reverse. The skill imports the installer library; the installer and image never know about the skill. Tests depend on everything.

## Node devcontainer

| Module | Where | Owns | Rules that aren't obvious |
|---|---|---|---|
| Base material | `base/` | Files copied to root-owned system paths: Agent policy (`claude/`, `codex/`), yolo wrappers, host-credential scrubbing (`vscode/`, `git/`), egress start-up (`egress/`), missing-secret warning (`mcp/`) | `egress/start.sh` runs as root at start: it locks the Base allowlist, installs the Project layer, then re-locks with the full allowlist. On any failure it stops the container (fail closed). `wait-ready.sh` exists because `devcontainer up` doesn't wait for the entrypoint. |
| Extension installer | `installer/` (`src/index.mjs`, `src/cli.mjs`), schema `installer/extensions.schema.json`, layers `extensions/base.json`, `variants/node/extensions.json` | Validates Extension Manifests, fetches by exact SHA, merges layers, installs skills, Claude plugins and hooks, and MCP servers, and writes the egress allowlist and the secret-name list | Build mode installs the Base and Variant layers into the image. Start mode validates all layers but installs only the Project layer, with no state file: recreating the container is the uninstall. It writes secret names only, never values (ADR 0004). Codex plugins and hooks are unsupported. |
| Node Variant | `variants/node/` | `Dockerfile` (the only place that pins the base digest, pnpm, Claude Code and Codex) and the build-time `devcontainer.json` that becomes image metadata | Most hardening lives in image metadata (`devcontainer.metadata`), so it ships with the image and each project's Template copy stays small. pnpm policy: ADR 0001. |
| Node Template | `templates/node/` | Only what image metadata can't carry: `--cap-drop=ALL`, limits, read-only mounts, `remoteEnv` for the token and git identity, a starter `extensions.json` | CI rewrites the `image` option default to the published digest. |
| Acceptance suite | `tests/` (`lib.mjs`, `global-setup.mjs`, one file per area) | `npm test`: builds the image once per run, starts real containers and probes them as `node` | Teardown removes only what the run labelled or created; no prune, ever (`cleanup.test.mjs` proves it). The `@devcontainers/cli` pin lives in `tests/lib.mjs` and must match `ci.yml`, the skill and `quarterdeck/Dockerfile` (ci-efficiency 08, quarterdeck 02). |
| CI/release | `.github/workflows/ci.yml`, `scripts/check-pins.mjs`, `renovate.json` | The `changes` job picks which jobs run. The image is built and tested once, then that same image is published, signed and attested. The Template is published after it. | The job that runs tests never gets `id-token` or registry write access. After the Template publish, a guard fails the run unless `node:latest` is still the image. Every `uses:` needs a full SHA and every base image a digest. The acceptance job also builds the Quarterdeck image (never pushed); `check-pins.mjs` fails when its base digest, Claude Code or pnpm pin drifts from the Node Variant's. |

Egress details: ADR 0002. VS Code trade-offs: ADR 0003.

## Quarterdeck

Quarterdeck depends on Base material and the extension installer; nothing in `base/`, `installer/`, `variants/` or `templates/` depends on it. Its image also reuses the host skill's JSONC dependency manifest and lockfile, not its application code. CI build and non-publication are owned by the CI/release row above.

| Module | Code anchors | Responsibility |
|---|---|---|
| Image | `quarterdeck/Dockerfile`, `quarterdeck/extensions.json`, `quarterdeck/claude-policy.json` | Base plus mate tools and pinned FirstMate; not a Variant or Template. |
| Host command | `quarterdeck/bin/quarterdeck`, `quarterdeck/docker-proxy.conf` | Build, start, attach and labelled cleanup; Docker access through an endpoint-filtering Unix-socket proxy. |
| Entrypoint | `quarterdeck/bin/qd-entry`, `quarterdeck/bin/qd-server` | Root egress setup, then non-root token parsing and Herdr server. |
| FirstMate configuration | `quarterdeck/bin/qd-first-mate`, `quarterdeck/fleet/config/` | Seed the home, preserve existing configuration, open the First Mate workspace. |
| Claude launcher | `quarterdeck/bin/claude` | Route FirstMate launches into the owning project container or the Quarterdeck publish session. |
| Project-container creator | `quarterdeck/bin/qd-project-up` | Render fetched main-branch configuration and manage the home's container through the devcontainer CLI. |
| Publisher | `quarterdeck/bin/qd-publish` | Push from the clone's Git directory with hooks/fsmonitor disabled; open a PR listing committed tickets. |
| Mate skills | `quarterdeck/skills/qd-first-mate/`, `quarterdeck/skills/qd-spec-run/`, `quarterdeck/fleet/charter.md` | First Mate handoff; Second Mate planning, ordered tickets, one retry, stop/publish and report procedures through FirstMate commands. |

For startup, dependency flow and validation limits, read [Quarterdeck architecture](docs/architecture/quarterdeck.md). For container rendering, launcher routing or trust boundaries, read [project containers](quarterdeck/PROJECT-CONTAINERS.md). Real-agent/GitHub evidence belongs in the [manual checklist](quarterdeck/CHECKLIST.md), not an assumption that shipped procedures have passed end to end.

Decisions: [0006 — mate placement](docs/adr/0006-mates-run-in-the-quarterdeck.md), [0007 — publication credentials](docs/adr/0007-project-containers-hold-no-github-credential.md) (narrowed by [0010 — extensions token](docs/adr/0010-read-only-agent-extensions-token.md)), [0008 — unpatched FirstMate](docs/adr/0008-firstmate-is-a-pinned-fork-without-upstream-edits.md), [0009 — accepted Git redirection](docs/adr/0009-accept-worktree-git-redirection-for-the-mvp.md).

## dev-container host skill

| Module | Where | Owns | Rules that aren't obvious |
|---|---|---|---|
| Skill prompt | `skills/dev-container/SKILL.md`, `references/<operation>.md` | The conversation: routing, confirmations, guardrails | No commits. Secret values are never asked for, read or written. A digest is written only after `verify-image` passes. `docs/agents/` and `.scratch/` are left alone. |
| Skill helper | `skills/dev-container/scripts/` (`dev-container.mjs`, `commands.mjs`, `manifests.mjs`, `image-layers.mjs`, `inspect.mjs`, `status.mjs`) | All exact steps, as a JSON CLI (`--help` lists them): detecting the Variant, rendering the Template, validating, verifying the image, planning a removal, inspecting an extension, reporting status | Plans and `inspect` are read-only. Only `render-template` and the lockfile commands write project files. The image layers are read from the image with `docker create` and `docker cp`, never by starting or pulling it. `verify-image` accepts only `ci.yml` on `main` and fails closed. |
| Variant metadata | `variants/<name>/variant.json` | Description and the files that identify a project's toolchain | |
| Presets | `presets/<name>.json` | Named sets of Agent Extensions, copied into a project with a `preset` tag | Copied, not referenced (ADR 0005). None exist yet; format in `presets/README.md`. |
