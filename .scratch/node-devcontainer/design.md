---
type: technical-design
feature: node-devcontainer
status: approved
base-commit: none (repository not yet initialised; only agent docs, CONTEXT.md, ADRs 0001-0004 and research exist)
touches:
  - image-build
  - egress
  - agent-extensions
  - templates
  - ci-release
changes-architecture: true
spec: .scratch/node-devcontainer/spec.md
---

## Design capsule

- **One image per Variant, no separate Base image.** The Node image is built from a Dockerfile, using the repo root as build context. Base material (hardening scripts, the extension installer, policy templates, `extensions/base.json`) is copied in. A shared base image waits until a second Variant exists.
- **Hardening travels with the image digest.** Everything the devcontainer spec allows in image metadata (users, mounts, volumes, env, caps, securityOpt, lifecycle commands, the start-up entrypoint) is baked into the image's `devcontainer.metadata` label. The Template's `devcontainer.json` carries only what metadata can't hold: `runArgs` (`--cap-drop=ALL`, limits), `initializeCommand`, the workspace-relative read-only mounts, and per-project `remoteEnv`.
- **A root start-up step, before any dev-user process.** It's a local Feature `entrypoint`, with `containerUser: root` and `remoteUser: node`. In order, it:
  1. merges the three Extension Layers;
  2. installs the Consuming Project layer into root-owned system paths;
  3. renders Agent policy;
  4. starts a filtering DNS resolver;
  5. locks the egress firewall.

  The dev user never has sudo, capabilities or setuid paths. This replaces the in-container sudo pattern (ADR 0002, amended; see decision D1).
- **Egress is domain-based through DNS.** dnsmasq answers only allowlisted names and adds their resolved IPs to an nftables set. Only that set is reachable on TCP 443, everything else is dropped, and only the resolver may reach Docker's DNS. IPv6 is dropped. This removes the stale-CDN-IP problem of static allowlists.
- **One extension installer CLI**, Node ESM with no build step, is shipped in the image and runs in two modes:
  - *build*: Base + Variant, at image build;
  - *start*: Consuming Project, in the root start-up step.

  It validates manifests against the published JSON Schema, rejects entries without a Pinned Ref, fetches pinned sources, and renders native config for each Agent. Its only third-party dependencies are `ajv` (schema validation) and `smol-toml` (Codex config), installed under the same pnpm policy.
- **Claude delivery uses Claude's native mechanisms:**
  - two plugin seeds, the image seed for Base + Variant and a container-filesystem seed for the project layer, chained through `CLAUDE_CODE_PLUGIN_SEED_DIR`;
  - a generated sha-pinned marketplace per seed;
  - `managed-settings.json` from the image plus a `managed-settings.d/` drop-in rendered at start;
  - managed skills under `/etc/claude-code/.claude/skills`.
- **Codex delivery:** admin skills in `/etc/codex/skills`, and MCP and plugin config in Codex's system-level config, rendered at start.
- **Removal comes from where things live.** Project-layer extensions are written to the container filesystem, never to login volumes, so recreating the container is the uninstall. There is no state file and no reconcile logic.
- **Template and CI:** the Node Template is published as an OCI Dev Container Template with the image digest substituted at publish time. GitHub Actions (actions pinned by SHA) builds with the devcontainer CLI, pushes to GHCR, signs with cosign keyless, attaches SBOM and provenance attestations, and runs the container acceptance suite against the built image before it is tagged.
- **Deliberately not built:** a proxy sidecar, a shared base image, a manifest lockfile or reconcile state, our own sandbox for Agents, an npm fallback policy beyond environment defaults, or a plugin "upgrade" command. Upgrades are Renovate edits to Pinned Refs.

## Existing shape

The repository has no implementation yet. It has `CLAUDE.md`/`AGENTS.md`, `docs/agents/*`, an empty-index `ARCHITECTURE.md`, `CONTEXT.md` (the glossary for Variant, Base, Consuming Project, Template, Egress Allowlist, Agent, Agent Extension, Extension Layer, Extension Manifest and Pinned Ref), ADRs 0001–0004, and `docs/research/secure-node-devcontainer.md`. That research is the source for the reference implementations this design draws on: Anthropic's devcontainer, Trail of Bits' read-only mounts, and OpenAI's no-sudo firewall. There is no git history, no tests and no CI.

## Proposed shape

Paths are navigation hints, not requirements.

| Module | Owns | Does not own | Interface callers use |
| --- | --- | --- | --- |
| **Base material** (`base/`) | Hardening scripts (start-up step, firewall, DNS config renderer), Agent policy templates (Claude managed settings, Codex system config), shell wrappers (`claude-yolo`, `codex-yolo`), the git credential helper, the VS Code bridge scrubber, global pnpm/npm config, `extensions/base.json` | Anything Node-specific; image build orchestration | Files copied into a Variant image at fixed system paths |
| **Node Variant** (`variants/node/`) | Dockerfile (Node 24 digest, pinned pnpm, pinned Agents, installer), build-time `devcontainer.json` that produces the image metadata label, the local start-up Feature, `extensions.json` (Variant layer) | Project-specific config | The published image `ghcr.io/valerid/dev-setup/node@sha256:…` and its metadata |
| **Extension installer** (`installer/`) | Manifest schema (published), validation, Pinned Ref enforcement, layer merge, fetching sources by Pinned Ref, per-Agent rendering, the kind × Agent capability table, Egress Allowlist assembly | Network enforcement (it only emits the allowlist); choosing what goes in a layer | CLI `install --mode build\|start`; JSON Schema file referenced by manifests' `$schema` |
| **Egress** (part of Base material) | dnsmasq config from the assembled allowlist, nftables ruleset (v4 allow-set on 443/80, resolver-only DNS, v6 drop, loopback), self-test | Deciding which domains are allowed (manifests own that) | Invoked once by the start-up step with the allowlist file |
| **Node Template** (`templates/node/`) | `devcontainer-template.json` with options (e.g. the host env var name for the repo PAT), the project `devcontainer.json`, a starter `.devcontainer/extensions.json` with `$schema` | Hardening that image metadata can carry | `devcontainer templates apply -t ghcr.io/valerid/dev-setup/node` / VS Code "Add Dev Container Configuration" |
| **CI/release** (`.github/`, `renovate.json`) | Build, acceptance run, push, sign, attest, Template publish with digest substitution, weekly schedule, Renovate rules (Pinned Ref PRs never auto-merge; custom regex managers for Agent versions and manifest SHAs) | Local developer builds | Workflows triggered on push to default branch, schedule and PRs |
| **Acceptance suite** (`tests/`) | Starting a real container from the built image and Template with the devcontainer CLI, then probing it; installer integration tests against local git fixtures | Unit tests of rendering helpers unless a rule needs case coverage | `node --test` |

**Dependency direction.** The Template depends on a published image. The image depends on the Base material, the Variant files and the installer. The installer depends on nothing in the image except Node and git. The acceptance suite depends on everything and nothing depends on it.

### Changed flows

**Image build.** Dockerfile steps:
1. Install OS packages: git, nftables, dnsmasq, ca-certificates, tini through `init`.
2. Install pinned pnpm (and npm 12) with scripts disabled.
3. Install the pinned Claude Code and Codex. Whether their packages need install scripts is checked at implementation; any needed exception is explicit.
4. Copy the Base material and the installer, then install the installer's own deps with frozen lockfile.
5. Run `installer install --mode build` over `extensions/base.json` + `variants/node/extensions.json`. This writes:
   - the image Claude seed (`/opt/dev-setup/claude-seed`);
   - Claude managed skills;
   - Codex admin skills;
   - pre-installed MCP server packages (`/opt/dev-setup/mcp/<name>`);
   - the build-layer Agent policy fragments;
   - the build-layer egress list.
6. Pre-create `/home/node/.claude` and `/home/node/.codex` owned by `node`, so the new named volumes inherit that ownership.
7. No sudo, and remove setuid bits from binaries that aren't needed.

**Container start** (root, before VS Code/CLI exec as `node`):
1. Read `${containerWorkspaceFolder}/.devcontainer/extensions.json` (the project layer) if present. It is under a read-only mount, so the dev user can't have edited it inside the container.
2. Run `installer install --mode start`. It validates all three layers together and fetches project-layer sources while egress is still open only to the Base allowlist. That is done by locking the firewall with the Base allowlist first, then extending it with the full allowlist. Outputs:
   - the project Claude seed in a container-filesystem path;
   - a `managed-settings.d/50-project.json` drop-in (`enabledPlugins`, `extraKnownMarketplaces` for both generated marketplaces, `strictKnownMarketplaces` naming only those two `directory` sources, `allowManagedHooksOnly`, manifest-declared hooks, MCP servers);
   - Codex system config;
   - the full Egress Allowlist.
3. Reload dnsmasq and nftables with the full allowlist and self-test: a non-allowlisted host is blocked and the registry is reachable.
4. Hand over to the devcontainer keep-alive. If any step fails, the container exits non-zero and does not run open.

**Attach** (`postStartCommand` as `node`, from image metadata):
- The VS Code bridge scrubber clears `SSH_AUTH_SOCK`, `VSCODE_IPC_HOOK_CLI`, git askpass/IPC env vars and `BROWSER`, through `/etc/profile.d` and the bashrc hook, and removes `/tmp/vscode-*.sock`.
- It warns for each secret named in the manifests that is missing from the environment.

**Git.**
- `GIT_CONFIG_GLOBAL` points at an image-owned read-only file, so VS Code can't install its credential helper.
- The system credential helper answers only for `github.com` and only from the PAT env var. With no PAT it returns nothing.
- Git identity comes from host env vars passed through `remoteEnv`.

**Agents.**
- `claude` runs normally. Managed settings set `disableSkillShellExecution` and leave bypass mode allowed, so the `claude-yolo` wrapper (`--dangerously-skip-permissions`) works.
- `codex` runs from system config with `sandbox_mode = "danger-full-access"` and `approval_policy = "on-request"`. The `codex-yolo` wrapper is `--dangerously-bypass-approvals-and-sandbox`.
- Both have auto-update disabled through env and managed config.
- Login state uses per-project volumes `claude-${devcontainerId}` / `codex-${devcontainerId}`, with `CLAUDE_CONFIG_DIR` and `CODEX_HOME` set.

### Extension Manifest shape (decision-level)

```jsonc
{
  "$schema": "https://…/dev-setup/extensions.schema.json",
  "extensions": [
    { "kind": "skill",  "agents": ["claude", "codex"], "source": { "github": "owner/repo", "path": "skills/x", "sha": "<40 hex>" } },
    { "kind": "plugin", "agents": ["claude"], "source": { "github": "owner/repo", "path": "plugins/y", "sha": "<40 hex>" } },
    { "kind": "plugin", "agents": ["claude"], "source": { "marketplace": "anthropics/claude-plugins-official", "plugin": "z", "sha": "<40 hex>" } },
    { "kind": "mcp", "agents": ["claude", "codex"], "name": "gh", "source": { "npm": "@scope/server", "version": "1.2.3" },
      "env": ["GITHUB_TOKEN_THIS_REPO"], "egress": ["api.github.com"] },
    { "kind": "hook", "agents": ["claude"], "event": "PostToolUse", "matcher": "Edit", "source": { "github": "owner/repo", "path": "hooks/fmt.sh", "sha": "<40 hex>" } }
  ],
  "egress": ["registry.example.com"]
}
```

- A marketplace-referenced plugin is resolved by reading that marketplace at the given SHA. The plugin's own source is then re-pinned. An external plugin source in the marketplace must itself carry a SHA, or the entry is rejected.
- Combinations an Agent doesn't support (for example a `hook` for Codex) are rejected at validation, with an error naming the entry.

## Reuse decisions

| Capability | Supplied by | Why |
| --- | --- | --- |
| Container lifecycle, metadata, variables, volumes | Dev Container spec and CLI (native) | The platform already carries hardening in image metadata, so it updates with the digest |
| Start-up as root | Local Feature `entrypoint` (native) | The supported way to run at start-up; survives `overrideCommand` |
| Domain allowlist enforcement | dnsmasq `--nftset` + nftables (mature OS packages) | Domain-level enforcement without a proxy, a sidecar or a compose file; handles CDN IP churn |
| Claude plugins at build and start | Plugin seeds, multiple seeds via `:`, `directory` marketplace sources, managed settings with `managed-settings.d/` (native) | Read-only, auto-update forced off, no runtime clone, policy-checked |
| Claude/Codex skills | Managed skills dir / Codex admin skills dir (native) | Outside the login volumes; root-owned |
| Manifest validation and editor UX | JSON Schema + `ajv` | One schema serves both editor autocomplete and installer validation, so they can't drift |
| Codex TOML rendering | `smol-toml` | Small, zero-dependency, maintained; hand-writing TOML escaping isn't worth it |
| Fetching pinned sources | `git` fetch of an exact SHA (already in image) | No new tool; GitHub serves fetch-by-SHA |
| MCP stdio servers | pnpm install of an exact version into `/opt/dev-setup/mcp` | Install-time cooldown and script policy apply; no `npx` fetch at runtime |
| Test runner | `node:test` (stdlib) | No extra framework |
| Build, push | devcontainer CLI `build --push` (spec constraint) | Writes the metadata label from the build `devcontainer.json` |
| Sign, SBOM, provenance | cosign keyless, `anchore/sbom-action`, `actions/attest-build-provenance` | Verifiable with `cosign verify` / `gh attestation verify` |
| Template publishing | `devcontainers/action` (publish-templates) | Standard OCI Template distribution |
| Updates | Renovate (Docker digest, npm, custom regex managers for Agent versions and manifest SHAs) | Native managers already cover most of it |

## Constraints

- Nothing running as `node` may be able to:
  - change nftables or dnsmasq;
  - write to `/etc/claude-code`, `/etc/codex`, `/opt/dev-setup` or the project seed;
  - read the project manifest from a writable location.

  The container holds only `NET_ADMIN` and `NET_RAW`, for the root start-up step. No `SYS_ADMIN`, no seccomp/AppArmor relaxation, no Docker socket.
- The start-up step fails closed. If any step fails, there is no keep-alive and the container stops.
- Project-layer artefacts never go into the login volumes or `~/.agents`.
- The Template must not duplicate hardening that image metadata can carry. Anything in the Template is frozen in each Consuming Project until it is re-applied.
- The installer must not run fetched content during install. Fetching is git and pnpm with scripts blocked; hooks and MCP servers run only when an Agent invokes them.
- The installer must not support floating refs, even behind a flag.
- No shared base image, no proxy sidecar, no compose-based Template, no manifest lockfile, no reconcile state, no plugin upgrade command.
- Every GitHub Action and the base image are pinned by SHA or digest. The Renovate config never auto-merges Pinned Ref or Agent version PRs.
- `ARCHITECTURE.md` is updated when the implementation lands, not before.

## Validation plan

Default level: **container acceptance**. The real image is started from the real Template with the devcontainer CLI, and probes run through `devcontainer exec` as `node`. This needs Docker in CI. The installer gets **integration tests** through its CLI against local bare-git fixtures and a local npm registry stub, so they run without network.

| Scenarios | Seam / level | Real dependencies | Notes |
| --- | --- | --- | --- |
| SC-01, SC-02 | Acceptance: `templates apply` → `up` → exec; VS Code path is a manual checklist | devcontainer CLI, Docker, GHCR image | VS Code attach can't be automated cheaply; the manual checklist covers SC-02 and the VS Code half of SC-03 |
| SC-03 | Acceptance probes (`ssh-add -l`, credential helper output, absence of host paths and socket) + simulated VS Code bridge env/sockets | Container | Simulates the env vars and sockets VS Code injects, to test the scrubber |
| SC-04, SC-05, SC-06 | Acceptance probes: blocked host, IPv6, arbitrary resolver, allowed hosts; project-domain added then recreated; `sudo`/`nft`/setuid attempts as `node` | Container, real internet | One test per risk: v4, v6, DNS tunnel, privilege |
| SC-07, SC-08 | Acceptance: pnpm in a fixture project with a postinstall dep, a too-new version, a lockfile drift; then a project-level `allowBuilds` | Container, local registry stub with controlled publish times | A registry stub (e.g. Verdaccio in CI only) makes "published < 7 days ago" deterministic |
| SC-09, SC-11 | Acceptance: version strings vs pinned values in the repo; wrapper flags; permission mode reported by each Agent | Container | No login needed |
| SC-10 | Acceptance for volume persistence and separation (marker file per volume); manual check for actual Agent logins and Codex device auth | Container, volumes | Real login requires accounts and can't run in CI |
| SC-12 | Acceptance: `codex exec` of a shell command, without login, if possible; otherwise manual | Container | Revisit if Codex requires auth for local exec |
| SC-13, SC-15, SC-16 | Acceptance with fixture manifests: skill visible to both Agents' listing commands; Variant plugin present; project plugin appears after recreate and disappears after removal; foreign marketplace refused; repo `SessionStart` hook ignored, manifest hook runs | Container, local git fixture served over the allowlist | Uses `claude plugin list` / `-p --output-format stream-json` init event, so no model call is needed |
| SC-14 | Installer integration test (floating ref, tag, missing ref, unsupported kind × Agent) + schema check in a test that runs a JSON-Schema-aware validator over fixtures | Installer CLI | Consequential rule, cheap to cover with many cases |
| SC-17 | Acceptance: secret via host env reaches MCP config at runtime; `docker history`/image layer grep and repo grep show no value | Container | |
| SC-18 | Acceptance: writes to the four paths fail; source edit + commit succeed | Container, fixture project with `.git` | |
| SC-19 | Acceptance with a fake PAT against a local credential probe (helper output for github.com and other hosts); real push manual | Container | |
| SC-20, SC-21 | CI: `cosign verify`, `gh attestation verify`, anonymous pull; Renovate config validated with `renovate-config-validator`; schedule present | GitHub Actions, GHCR | Pinned Ref auto-merge rule checked by config test |

**Architectural constraints to enforce mechanically.**
- An acceptance test asserts that `node` has no capabilities (`CapEff` = 0), that no setuid binaries can be run, and that the root-owned paths are not writable.
- A CI check fails on any unpinned Action or base image.

**Risky integration points to verify first** (first ticket, a spike before building on them):
1. That a Feature `entrypoint` runs as root from image metadata under the devcontainer CLI and VS Code with `overrideCommand` defaults.
2. dnsmasq `--nftset` behaviour with `--cap-drop=ALL` + `NET_ADMIN`/`NET_RAW`.
3. Whether hooks inside managed-enabled plugins run under `allowManagedHooksOnly`. If not, plugin-supplied hooks are rejected or surfaced as manifest hooks.
4. The location and precedence of Codex's system config, and whether it can set MCP servers and plugins.
5. Whether the Agent npm packages install with scripts disabled.
6. Whether `managed-settings.d` drop-ins merge `enabledPlugins` and `extraKnownMarketplaces` maps with the base file.
7. Whether `devcontainer templates apply` can substitute the image digest at publish time.

**Revisit this design if:**
- the Feature `entrypoint` can't run as root before attach (then fall back to a proxy sidecar, decision D1);
- Codex has no root-owned config layer;
- a second Variant arrives (then reconsider a shared base image);
- a microVM runtime replaces Docker.

## Resolved decisions

- **D1 — how the firewall and project layer get root.** A root start-up step runs before any dev-user process, and the dev user has no privileges. ADR 0002 was amended to match. An egress proxy sidecar was rejected: it needs a compose Template, depends on every tool honouring proxy env, and leaves no root step to install the project layer into protected paths. It remains the fallback if the spike shows a Feature `entrypoint` can't run as root.
- **D2 — remote (HTTP) MCP servers.** They are allowed as a distinct `mcp-remote` entry that must declare its `egress` domains. They are exempt from the Pinned Ref rule because there is no code to pin.
- **D3 — Codex plugins (decided after the spike).** Unsupported. Codex installs plugins only into `$CODEX_HOME`, which is the login volume, and that breaks the rule that project-layer artefacts never go into login volumes. Codex skills and MCP servers remain supported. The kind × Agent table rejects `plugin` for `codex`.
