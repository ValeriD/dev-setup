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
| Acceptance suite | `tests/` (`lib.mjs`, `global-setup.mjs`, one file per area) | `npm test`: builds the image once per run, starts real containers and probes them as `node` | Teardown removes only what the run labelled or created; no prune, ever (`cleanup.test.mjs` proves it). The `@devcontainers/cli` pin lives in `tests/lib.mjs` and must match `ci.yml` and the skill (ci-efficiency 08). |
| CI/release | `.github/workflows/ci.yml`, `scripts/check-pins.mjs`, `renovate.json` | The `changes` job picks which jobs run. The image is built and tested once, then that same image is published, signed and attested. The Template is published after it. | The job that runs tests never gets `id-token` or registry write access. After the Template publish, a guard fails the run unless `node:latest` is still the image. Every `uses:` needs a full SHA and every base image a digest. |

Egress details: ADR 0002. VS Code trade-offs: ADR 0003.

## dev-container host skill

| Module | Where | Owns | Rules that aren't obvious |
|---|---|---|---|
| Skill prompt | `skills/dev-container/SKILL.md`, `references/<operation>.md` | The conversation: routing, confirmations, guardrails | No commits. Secret values are never asked for, read or written. A digest is written only after `verify-image` passes. `docs/agents/` and `.scratch/` are left alone. |
| Skill helper | `skills/dev-container/scripts/` (`dev-container.mjs`, `commands.mjs`, `manifests.mjs`, `image-layers.mjs`, `inspect.mjs`, `status.mjs`) | All exact steps, as a JSON CLI (`--help` lists them): detecting the Variant, rendering the Template, validating, verifying the image, planning a removal, inspecting an extension, reporting status | Plans and `inspect` are read-only. Only `render-template` and the lockfile commands write project files. The image layers are read from the image with `docker create` and `docker cp`, never by starting or pulling it. `verify-image` accepts only `ci.yml` on `main` and fails closed. |
| Variant metadata | `variants/<name>/variant.json` | Description and the files that identify a project's toolchain | |
| Presets | `presets/<name>.json` | Named sets of Agent Extensions, copied into a project with a `preset` tag | Copied, not referenced (ADR 0005). None exist yet; format in `presets/README.md`. |
