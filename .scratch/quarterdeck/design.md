---
type: technical-design
feature: quarterdeck
status: proposed
base-commit: 41f75c3
touches:
  - quarterdeck
  - base-material
  - extension-installer
  - ci-release
  - test-suite
  - architecture-docs
changes-architecture: true
spec: .scratch/quarterdeck/spec.md (draft), overridden by grill-notes.md decisions 37-43 and spike/FINDINGS.md
---

## Design capsule

Ticket 08 / [ADR 0010](../../docs/adr/0010-read-only-agent-extensions-token.md) narrows SC-16/SC-19 and ADR 0007: only the read-only `ValeriD/skills` token may enter a project container at creation. Ticket 20 supersedes the original root-owned-file delivery mechanism below; ticket 03 implements its user-owned file and non-root parser. Other proposed behavior is unchanged.

- **New top-level module `quarterdeck/`.** It holds the Quarterdeck image, the host `quarterdeck` command, four in-container tools (`qd-entry`, the `claude` launcher, `qd-project-up`, `qd-publish`), the FirstMate configuration we ship, the Charter template, and two mate skills (`qd-first-mate`, `qd-spec-run`). Nothing in `base/`, `installer/`, `variants/`, `templates/` or `skills/dev-container/` depends on it.
- **Built on Base, not a Variant.** `quarterdeck/Dockerfile` starts from the same pinned `node` digest as `variants/node/Dockerfile`. It copies the same Base material and runs the installer in build mode with `extensions/base.json` plus a Quarterdeck layer. It has no `devcontainer.json` and no Template. It ships its own Claude policy, without `allowManagedHooksOnly`, because FirstMate's mates need their hooks (see Open question 4).
- **FirstMate stays unpatched.** We use only its own commands: `fm-brief.sh`, `fm-home-seed.sh`, `fm-spawn.sh`, `fm-control.sh relaunch`, `fm-send.sh`. "Commit only" is a Brief edit, which FirstMate's own Brief contract allows. The push is a relaunch that the launcher routes into the Quarterdeck. A marker that only the Second Mate can write triggers that route. The interim "blocked: head unreachable" state is expected, and the Spec Run procedure says so. No FirstMate patch is needed on current evidence.
- **One FirstMate record per Spec Run.** It has one branch (`<prefix><slug>`) and one worktree. Session 1 is the planning Crewmate. Sessions 2 to N+1 are one relaunch per ticket. The last session is the publish relaunch. The next job always arrives in the relaunch's `--note`. The Brief does not change between tickets.
- **The project container comes from the project's main-branch `.devcontainer/`, through the devcontainer CLI.** That keeps the image metadata hardening: egress entrypoint, capabilities, `containerEnv`. `qd-project-up` writes a Quarterdeck-owned config that keeps the image and features, drops host-side commands and every GitHub variable, and mounts exactly the decision-34 set at identical paths. `/workspace` holds only that main-branch `.devcontainer/`, read-only.
- **Credentials.** A root-owned 0600 file is bind-mounted read-only. `qd-entry` reads only the allowed names as root, drops to `node`, and starts Herdr. Only Herdr's panes hold the tokens. The launcher passes `CLAUDE_CODE_OAUTH_TOKEN` to each `docker exec` by name. GitHub variables are never forwarded.
- **Docker** is reached through an off-the-shelf socket proxy (`wollomatic/socket-proxy`, digest-pinned) on a Unix socket in a shared volume. It allows the endpoints listed under Docker access. Accepted gap: the body of a container-create request is not inspected.
- **Testing** has two parts. A token-free acceptance file (`tests/quarterdeck.test.mjs`) covers the plumbing, with a stub-Crewmate image that drives the real FirstMate loop. A manual checklist covers everything that needs a real Claude session or real GitHub. CI builds the Quarterdeck image in the existing acceptance job and does not publish it.
- **Deliberately not built:** pause and resume (D43), Ideas (undecided scope), anything on the spec's Out of Scope or the notes' Later list, a backup job, publishing the Quarterdeck image, per-ticket mounts, any wrapper around FirstMate's lifecycle.

## Existing shape

- **This repo at `41f75c3`:**
  - `variants/node/Dockerfile` pins the base digest and the Claude, Codex and pnpm versions. It copies `base/` to system paths and runs `installer/src/cli.mjs install --mode build`.
  - Image metadata (`variants/node/devcontainer.json`) carries `containerUser: root`, the egress Feature entrypoint, `capAdd`, `containerEnv` (`CLAUDE_CONFIG_DIR=/home/node/.claude`, `DEV_SETUP_WORKSPACE=/workspace`), and the per-container Claude and Codex volumes.
  - The Claude policy (`base/claude/managed-settings.json`) sets `allowManagedHooksOnly`, `disableSkillShellExecution`, `disableSideloadFlags` and `disableCommandPluginSources`. Managed skills go in `/etc/claude-code/.claude/skills`.
  - `base/egress/start.sh` runs as root. It reads `$DEV_SETUP_WORKSPACE/.devcontainer/extensions.json` and fails closed. Its ruleset (`render.sh`) allows only DNS to the upstream resolvers and ports 80 and 443 to allowlisted IPs.
  - `base/git/gitconfig` and `git-credential-dev-setup` answer only for `github.com`, from `DEV_SETUP_GITHUB_PAT`.
  - `tests/lib.mjs` pins `@devcontainers/cli@0.89.0`, and Renovate updates every copy of that pin together. The tests label and clean up only what they create.
  - In `ci.yml`, the `changes` job decides which jobs run, and `acceptance` builds the node image once and runs `npm test`.
- **pomoplan (the test project).** Its `main` has a Template-shaped `.devcontainer/`: the image digest, a local Feature `playwright-deps`, `initializeCommand`, `DEV_SETUP_GITHUB_PAT` in both `containerEnv` and `remoteEnv`, and the read-only overlays. Its Project layer pulls 14 skills from `ValeriD/skills`, which is private (`.scratch/pat-container-env/issues/01`), and two from `pbakaus/impeccable`. Its scripts include `build`, `lint` and `test`.
- **FirstMate `427056c` (read, not run):**
  - FirstMate's code-change Briefs have a `Delivery contract: mode=…` line and a `Ship branch:` line. `fm-spawn.sh` checks both. AGENTS.md section 11 allows altering other generated sections "when the task genuinely differs".
  - In `direct-PR` the Definition of done says to push and open a PR. A `done:` is accepted only when HEAD is reachable outside the worktree (`fm-dod-lib.sh`). Otherwise `fm-crew-state.sh` reports blocked.
  - `local-only` is refused for Second Mate homes (`fm-home-seed.sh`).
  - Crewmate panes receive `FM_TASK_ID` and `FM_TASK_INBOX=<home>/state/<id>.inbox` in the pane.
  - Crewmate busy hooks are written to `<worktree>/.claude/settings.local.json`. Second Mate busy hooks go through `--settings`. The primary's Stop guard, watcher and auto-arm live in the home's tracked `.claude/settings.json`.
  - `fm-claude-trust.sh` writes to `${CLAUDE_CONFIG_DIR:-$HOME}/.claude.json`.
  - `fm-home-seed.sh <id> <explicit-path> <project>` clones the home from the First Mate's checkout, and the project from the First Mate clone's `origin` URL.
  - `config/claude-permission-mode`, `config/backend`, `config/secondmate-harness` and `config/crew-dispatch.json` are documented in `docs/configuration.md`.
- **Spike (`spike/`).** It proved four links:
  1. The launcher with hooks.
  2. Herdr state through `docker exec`, with `HERDR_AGENT=claude`.
  3. One relaunch per ticket.
  4. A Second Mate in the Quarterdeck.

  It used a plain stand-in project image, a local origin, `docker run`, a root entrypoint that sources the token file, and the raw Docker socket.

## Proposed shape

Paths are navigation hints.

### Modules

| Module | Where | Owns | Does not own | Interface |
|---|---|---|---|---|
| **Quarterdeck image** | `quarterdeck/Dockerfile`, `quarterdeck/extensions.json`, `quarterdeck/claude-policy.json` | Same base digest and Claude pin as the Node Variant. Base material: egress, the git config and credential helper, setuid removal. The installer in build mode (Base + Quarterdeck layer). Pinned extras: Docker CLI, `gh`, devcontainer CLI, Herdr and treehouse through FirstMate's own `fm-install-herdr.sh` and `fm-install-treehouse.sh` (SHA-256 checked), `jq`, FirstMate at the pinned commit in `/opt/firstmate` (read-only), the mate skills in `/etc/claude-code/.claude/skills`, and `/opt/qd/bin` first on `PATH` | Project toolchains; any Variant metadata | `docker run` by `quarterdeck` only |
| **Host command** | `quarterdeck/bin/quarterdeck`, symlinked into `~/.local/bin` (the host-skill convention) | Builds the image from the checkout if it is missing. Creates the network, the proxy and the Quarterdeck container if they are not running, then `docker exec -it -u node quarterdeck herdr` to attach. `quarterdeck stop` removes only labelled containers | Projects, homes, tokens' values (it passes a path, never reads the file) | `quarterdeck [attach\|stop\|rebuild]` |
| **Entrypoint** | `quarterdeck/bin/qd-entry` | As root: runs `base/egress/start.sh` with an empty `DEV_SETUP_WORKSPACE`, then reads the allowed names from `/run/quarterdeck/secrets.env` by parsing, not sourcing. Then it drops to `node` with `setpriv`. As `node`: seeds the First Mate home on first start, starts `herdr --session default server`, and opens the First Mate tab | Anything after start | Container entrypoint |
| **Launcher** | `quarterdeck/bin/claude` | Routing: under the pool, run Claude in the project container; with a publish marker, run the real Claude in the Quarterdeck; otherwise run the real Claude. Its other duties: `HERDR_AGENT=claude`, `-u node`, the env allowlist, the first-run state, folder trust, and the launch log | Which session runs (FirstMate decides) | Same argv as `claude` |
| **Project-container creator** | `quarterdeck/bin/qd-project-up` (Node, reuses `jsonc-parser`) | Exports `origin/main:.devcontainer/` and renders a Quarterdeck-owned `devcontainer.json`. Runs `devcontainer up` with the decision-34 mounts, recreates the container when the main-branch config hash changes, and labels it | The image (the project pins it) and the Project layer (the start-up step installs it) | `qd-project-up <home> <project>` (idempotent) |
| **Publisher** | `quarterdeck/bin/qd-publish` | Push and pull request, with hooks and fsmonitor forced off. Works against the clone's git directory, never the worktree's `.git` file. Writes the PR body from the ticket list | When to publish (the Spec Run procedure decides) | `qd-publish <home> <project> <branch> <slug>`. Prints the PR URL |
| **FirstMate configuration** | `quarterdeck/fleet/config/*`, `quarterdeck/fleet/charter.md` | `backend`=`herdr`, `claude-permission-mode`=`auto`, `secondmate-harness`=`claude sonnet`, and `crew-dispatch.json` (see below). The Charter template | FirstMate's code | Copied into the First Mate home's `config/` on first seed and inherited by Second Mate homes |
| **Mate skills** | `quarterdeck/skills/qd-first-mate/`, `quarterdeck/skills/qd-spec-run/` (+ `references/brief.md`, `references/report.md`) | First Mate: onboarding a project, provisioning its Second Mate at an explicit path, and the Spec Run handoff. Second Mate: the whole Spec Run procedure below | Grilling (an existing skill), Spec, design and ticket formats (the project's own skills) | Loaded by Claude from the managed skills directory |

`crew-dispatch.json`: `"shared_quota": true` (no quota calls) and one rule. `when`: "the ticket is about skills, prompts or agent tools", `use`: `claude`, `opus`. `default`: `claude`, `sonnet`. Typed dispatch resolution stays off (no `FM_DISPATCH_*` in `.env`), as in the spike. The First Mate tab is launched as `claude --model opus --permission-mode auto`.

**Dependency direction:**

```
host quarterdeck ─► Quarterdeck image (quarterdeck/ + base/ + installer/ + extensions/base.json)
                       │
mate skills ─► FirstMate commands ─► `claude` launcher ─► docker exec ─► project container
           └─► qd-project-up ─► devcontainer CLI ─► socket proxy ─► Docker
           └─► qd-publish ─► git, gh ─► GitHub
qd-project-up ─► project's origin/main .devcontainer ─► published Variant image
```

FirstMate never knows the Quarterdeck exists. It only runs `claude`. Tests depend on everything.

### Spec Run procedure (owned by `qd-spec-run`; the commands are FirstMate's)

`$M` = `/home/valeri/work/fleet/firstmate`, `$S` = `/home/valeri/work/fleet/sm-<project>`, `$WT` = the Spec Run's worktree. Every Second Mate command runs with `FM_HOME=$S`.

| # | Who | Step | Proven? |
|---|---|---|---|
| 0 | First Mate, once per project | Registers the project as `direct-PR`, yolo off, through FirstMate's `project-management` skill. That clones it from GitHub into `$M/projects/`. Then `FM_SECONDMATE_CHARTER="<Charter template, filled>" bin/fm-brief.sh sm-<project> --secondmate <project>`, then `bin/fm-home-seed.sh sm-<project> $S <project>` (always an explicit path, never `-`), then `bin/fm-spawn.sh sm-<project> $S --secondmate` | Seed and spawn: link 4 (local origin). A GitHub clone: unproven, slice 2 |
| 1 | First Mate | Handoff. It picks the slug and the prefix (`feat/`, `fix/` or `chore/` only, D40). Then `FM_HOME=$M bin/fm-send.sh sm-<project> '<handoff>'`. The handoff has header lines `Spec Run: <slug>`, `Branch prefix: <prefix>`, `Project: <project>`, then the grilling decisions verbatim. The First Mate never spawns a project Crewmate | `fm-send` to a Second Mate: link 4 |
| 2 | Second Mate | `qd-project-up $S <project>` | Unproven against the hardened image, slice 3 |
| 3 | Second Mate | `bin/fm-brief.sh <slug> <project> --mode direct-PR --branch-prefix <prefix>`, then fills it from `references/brief.md` (next table) | Brief edit: link 3 |
| 4 | Second Mate | Planning Crewmate: `bin/fm-spawn.sh <slug> projects/<project> --mode direct-PR --yolo off --branch-prefix <prefix> --harness claude --model <planning model, Open question 7>`. In the project container it creates the branch, writes `.scratch/<slug>/spec.md`, `design.md` and `issues/NN-*.md` with the project's `/to-spec`, `/to-design` and `/to-tickets` skills, makes exactly one commit, and appends `done [at=…]: plan committed <sha>; <N> tickets`. A decision the handoff does not make goes to `needs-decision` and stops the run | Spawn through the launcher: link 1. Planning: unproven, slice 4 |
| 5 | Second Mate | For each ticket in number order: reads the ticket from `$WT` (read only) and picks the model by the dispatch rule. Then `FM_HOME=$S bin/fm-control.sh <slug> relaunch --model <m> --note "Ticket NN: .scratch/<slug>/issues/NN-….md. Start commit <sha>."` | Link 3 (Sonnet only; Opus unproven) |
| 6 | Crewmate | Implements and reviews as today (`/implement`). Runs `pnpm install --frozen-lockfile`, then the three gate commands that the Charter names for the project (pomoplan: `pnpm run build`, `pnpm run lint`, `pnpm test`). Commits once. Appends `done [at=…]: ticket NN committed <sha>; build ok, lint ok, test ok`. If the gate fails or the ticket cannot be finished, it appends `failed [at=…]: ticket NN: <reason>`. A question goes to `needs-decision` | Commit and test: link 3. The gate under egress: unproven, slice 3 |
| 7 | Second Mate | Checks the ticket. It needs a `done` line naming all three gate results, exactly one new commit on the branch since the start commit, and a clean `git status --porcelain`. It reads crew-state's "blocked: named head … unreachable" as expected and does not recover or escalate it | The reading of "blocked": link 4 |
| 8 | Second Mate | One retry. It relaunches with the note `Retry of ticket NN. Save the failed attempt as refs/quarterdeck/failed/NN-1, then reset to <start sha>.` After a second failure, a `needs-decision`, or a Crewmate that dies, the run stops: no further relaunch, no publish | Unproven, slice 8 |
| 9 | Second Mate | Publish. It writes `quarterdeck` to `$S/data/<slug>/qd-route`, then `bin/fm-control.sh <slug> relaunch --model sonnet --note "Publish."`. The launcher consumes the marker and runs the real Claude in the Quarterdeck. The Crewmate runs `qd-publish`, then appends `done [at=…]: PR <url>`. FirstMate's gate now finds HEAD on origin and accepts the done | Unproven, slices 2 and 6 |
| 10 | Second Mate | Writes `$S/data/<slug>/report.md` and appends one parent-channel line, `done [key=<slug>]: <outcome>; report <path>` with the handoff's `corr` token. The First Mate reads it and relays it to the captain in chat, which raises Herdr's attention mark | Parent channel: link 4. Attention mark: unproven, slice 7 |

After step 10 FirstMate keeps the record open until the captain merges. Then its normal landing and teardown run.

**Brief conventions (`references/brief.md`).**

| Section | Content |
|---|---|
| `## Captain's intent` | The handoff's decisions, verbatim |
| `## Firstmate spec` (brief notes) | "Each session does exactly one job, named by the latest `## Progress note`. No note: plan. `Ticket NN`: implement only that ticket. `Retry of ticket NN`: as written. `Publish.`: run `qd-publish <args>` and nothing else." Also the gate commands and the one-commit rule |
| `# Setup`, `# Rules` | Unchanged, including the worktree-isolation check. The publish session runs in the worktree too, so the check still passes |
| `# Definition of done` | Keep the `Delivery contract: mode=direct-PR` and `Ship branch:` lines as generated. Replace the push and PR lines with: "commit, run the gate, append `done: ticket NN committed <sha>; …`. Do not push and do not open a PR, except in a `Publish.` session." |

**Resolved items.**

| Item | Chosen | Why | Rejected |
|---|---|---|---|
| "Commit only" without upstream edits | The Second Mate edits the generated Definition of done in `data/<slug>/brief.md`. That file is private home data, not an upstream file | FirstMate's AGENTS.md section 11 allows the edit. The spike did the same | `local-only` mode: FirstMate refuses it for Second Mate homes. A fork patch: not needed |
| "Blocked until pushed" | Expected between tickets. The Charter and `qd-spec-run` say so, and the publish session makes the head reachable, so FirstMate's own gate then accepts the final `done: PR` | Uses the gate as designed. The PR is then registered through FirstMate's normal PR path | A local "backup" remote that makes every ticket's done land at once: it would end the record after ticket 1 |
| Push step | A relaunch of the same record, routed by the launcher | One record, one branch, and FirstMate's done gate and PR tracking keep working | A separate record, which would get its own worktree and branch. The Second Mate running `qd-publish` itself, which breaks FirstMate's rule 1 and decision 26 |
| Tests at the end | The last ticket's gate is the final gate. Tickets run in order in one worktree, so it ran on the final tree | No extra session | A separate final gate session |

If slice 5 shows FirstMate's machinery itself, not the model, escalating the interim blocked state to the First Mate, the smallest patch would be in how `fm-crew-state.sh` and the parent channel classify a refused `done`. That breaks ADR 0008's MVP rule and needs the user's approval. Before patching, try the non-terminal `working [key=<slug>]` status for interim tickets.

### Project container

| Item | Chosen | Why / rejected | Proven? |
|---|---|---|---|
| Who and when | The Second Mate runs `qd-project-up` at the start of every Spec Run, before the planning Crewmate. The command is idempotent: it recreates the container only when the hash of `origin/main:.devcontainer/` changed or the container is missing | The creator needs the Second Mate home's paths. `quarterdeck` does not know them. Rejected: the host command (no home yet) and the First Mate (D34: one container per home) | Unproven |
| Image and config | `git -C <clone> fetch origin`, then export `origin/main:.devcontainer/` to `/home/valeri/work/quarterdeck/config/<project>/<home-hash>/<sha>/` (home discriminator prevents mount collisions). A Quarterdeck-owned `devcontainer.json` there keeps from main: `image` (must be `ghcr.io/valerid/dev-setup/<variant>@sha256:…`), `features`, validated Template `runArgs` only (`--cap-drop=ALL`, positive memory and PID limits; user-approved ticket 07 restriction), and literal non-secret `containerEnv`. It drops `initializeCommand`, every other host-side lifecycle command, `remoteEnv`, and any `DEV_SETUP_GITHUB_PAT` or GitHub-named variable. It sets `updateRemoteUserUID: false`. Then `devcontainer up --workspace-folder <export> --id-label quarterdeck.project=<project>` | Image metadata (the egress entrypoint, caps, `containerEnv`, volumes) is applied only by the devcontainer CLI. Rejected: `docker run` as in the spike, which loses all of it. Using the project file as is would run `initializeCommand` in the Quarterdeck and pass the PAT. The digest was verified when it was committed, by the `dev-container` skill's `verify-image` | Unproven |
| Mounts (decision 34, identical paths) | The pool, read-write: host `/home/valeri/work/pool` at `/home/node/.treehouse`. `<clone>/.git` read-write, with `hooks` and `config` read-only. `<home>/bin` read-only. `<home>/state` read-write. The export, read-only, as the workspace at `/workspace`. Plus the image's own Claude and Codex volumes. The creator `mkdir -p`s every source first | Same set as the spike (proven). Docker creates missing sources as root-owned folders | Proven, stand-in image |
| Pool location | Treehouse 2.0.1 always uses `~/.treehouse`. The host folder is mounted at `/home/node/.treehouse` in both containers | A worktree's `.git` points at the clone by absolute path | Proven |
| Replacement for D13 | `/workspace` holds only the main-branch `.devcontainer/`, read-only. The start-up step reads the Project layer from there. Crewmates work at the pool path, identical in both containers. No link. **Flagged: Open question 1** | The Template's `/workspace` would break absolute worktree paths and FirstMate's trust paths | Unproven |
| First-run state and trust | The launcher, before each launch, writes `hasCompletedOnboarding` if the file is empty and `projects[$PWD].hasTrustDialogAccepted` into `$CLAUDE_CONFIG_DIR/.claude.json` inside the container. It runs as `node` and uses `node -e`, because the hardened image has no `jq` | Keeps the Variant and the Template unchanged. Rejected: baking the file into the image, which the Claude volume would shadow anyway | Proven in the spike with `$HOME`. The `CLAUDE_CONFIG_DIR` path is unproven |
| Exec user and env | `docker exec -u node` (the container's default user is root). Forwarded by name only: `FM_*`, `GIT_CONFIG_*`, `CLAUDE_CODE_*`, `GIT_AUTHOR_*`, `GIT_COMMITTER_*`, `COMPACT_ADVISER_DISABLE`, `TRACEPARENT`. Never `GH_TOKEN`, `GITHUB_TOKEN` or `DEV_SETUP_GITHUB_PAT` | `containerEnv` reaches `docker exec`, `remoteEnv` does not | Forwarding: proven |
| Committer identity | `GIT_AUTHOR_*` and `GIT_COMMITTER_*` come from the host environment through `quarterdeck`, then from the pane through the launcher | One source. They are not secrets | Proven, spike |
| Egress for a Crewmate | The Base list already has `anthropic.com`, `claude.ai`, `claude.com`, `github.com`, `githubusercontent.com` and `registry.npmjs.org`, plus the project's own layer | Verified against the pinned Claude binary (`extensions/base.json` notes) | Whether `next build` and `/implement` need more: unproven, slice 3 |
| Project-layer fetch | Ticket 08: `qd-project-up` maps `QUARTERDECK_EXTENSIONS_TOKEN` to `DEV_SETUP_GITHUB_PAT` only in the creation CLI environment, with name-only `-e DEV_SETUP_GITHUB_PAT` in generated `runArgs`. It warns when absent and leaves installer failure unchanged | Read-only, `ValeriD/skills` only; ADR 0010 narrows ADR 0007. Container-level delivery reaches startup; user verifies scope. Tree-based reuse does not rotate tokens | Dummy delivery/helper fixture tested; CLI persists token in `/etc/environment` (ticket 08 blocker / security-review 05). Real private fetch/permissions remain manual |
| Crewmate hooks under the hardened policy | `allowManagedHooksOnly` should stop FirstMate's Crewmate busy and turn-end hooks from firing, because they live in `settings.local.json`. That is unverified. Herdr's screen state and the status file still work. **Open question 3** | | Unproven, slice 3 |

### Credentials

| Item | Chosen |
|---|---|
| Source | `~/.config/quarterdeck/secrets.env`, owned by root with mode 0600, holding `CLAUDE_CODE_OAUTH_TOKEN` and `QUARTERDECK_GITHUB_TOKEN` (fine-grained, scoped to the project's repository). The path can be overridden with `QUARTERDECK_SECRETS`. The names are declared as container-wide `secrets` in `quarterdeck/extensions.json`, so `check-secrets.sh` warns about a missing one by name |
| Into the Quarterdeck | The file is bind-mounted read-only at `/run/quarterdeck/secrets.env`. `qd-entry`, as root, parses only those two names, exports `CLAUDE_CODE_OAUTH_TOKEN`, `GH_TOKEN` and `DEV_SETUP_GITHUB_PAT` (for Base's credential helper), drops to `node`, and starts the Herdr server. Every pane inherits them. `docker exec` shells and `docker inspect` see none of them. Nothing is written to disk: no `gh auth setup-git`, because Base's read-only gitconfig and credential helper already answer for `github.com` |
| Into the project container | `CLAUDE_CODE_OAUTH_TOKEN` per `docker exec`, by name through the launcher, never in container config. Separately, ticket 08's read-only Agent Extensions token enters at creation as `DEV_SETUP_GITHUB_PAT`; its visibility in project-container `docker inspect` is accepted (ticket 20, ADR 0010). No project-repository/push token and no GitHub variable forwarded by the launcher |
| Replaces the spike's | Sourcing the file as shell (now parsed by name), `gh auth setup-git` (now Base's helper), `docker run -e` for the project container (now per exec) |
| Rejected | `--env-file`: puts the values in `docker inspect` and in every `docker exec`, which breaks SC-19. A user-readable file: breaks D35's "only Docker reads the file". Compose secrets: the same bind mount, plus a compose dependency |

### Docker access

- **Proxy.** `wollomatic/socket-proxy`, digest-pinned, with the host socket mounted read-only. It listens on a Unix socket in the volume `quarterdeck-docker`, and the Quarterdeck uses `DOCKER_HOST=unix:///run/docker-proxy/docker.sock`. Using a Unix socket means Base's egress ruleset needs no change. Chosen over Tecnativa's `docker-socket-proxy`, which only listens on TCP, so the Quarterdeck's own egress ruleset would block it. It also allows only whole API sections. **Unverified:** the Unix-socket listener and the per-method path rules have to be confirmed against the pinned release in slice 1. Fallback: Tecnativa on TCP, plus one fixed local address in the ruleset. That is a `base/egress/render.sh` change, and Open question 5 covers it.
- **Allowed:**
  - `GET`: `_ping`, `version`, `info`, `containers/json`, `containers/{id}/json`, `exec/{id}/json` (ticket 04: exec exit status), `images/{name}/json`, `volumes`, `events`.
  - `POST`: `containers/create`, `start`, `stop`, `kill`, `wait`, `exec`, `exec/{id}/start`, `exec/{id}/resize`, `containers/{id}/attach` (ticket 07: CLI's attached `docker run` otherwise fails with 403), `images/create` (pull), `build` (the project's Features), `volumes/create`.
  - `DELETE`: `containers/{id}` (labelled ones only, by `quarterdeck stop` and `qd-project-up`).
  - The exact list the devcontainer CLI needs is set in slice 3 by running it.
- **Denied:** everything else, including swarm, services, secrets, configs, plugins, nodes, `system/df`, prune, `commit`, `auth`, and container archive.
- **Accepted gap (D10):** the proxy cannot see a `containers/create` body. A process in a Herdr pane can create a privileged container with any host mount. The custom proxy (Later) closes this.

### Work root (`/home/valeri/work`, same path in the Quarterdeck)

| Path | Holds | Back up |
|---|---|---|
| `fleet/firstmate/` | The First Mate home: a fork checkout at the pin, with `data/`, `state/`, `config/`, `projects/` | Yes |
| `fleet/sm-<project>/` | The Second Mate home. `projects/<repo>/.git` holds every Spec Run commit | Yes |
| `pool/` → `/home/node/.treehouse` | Treehouse worktrees and pool metadata | Yes while a Spec Run is open (uncommitted work). Otherwise it can be rebuilt |
| `quarterdeck/claude/` → `/home/node/.claude` (`CLAUDE_CONFIG_DIR`) | The mates' Claude config, sessions, memory and trust entries | Yes. It should hold no token, because the token arrives by environment (unverified) |
| `quarterdeck/config/<project>/<home-hash>/<sha>/` | Exports of the main-branch `.devcontainer/` | No, they are regenerated |
| `quarterdeck/logs/` | `launch.log`, the Herdr server log | Optional |

Outside the work root: the secrets file, the project container's Claude volume, the images, and Herdr's runtime state. A restart loses Herdr's runtime state, which is accepted. Nothing secret lives under the work root.

### Final report (D42)

The Second Mate writes `data/<slug>/report.md`. The First Mate relays it verbatim. At most these lines:

```
Spec Run <slug> on <project>: PR opened | stopped at ticket NN | stopped: question
PR: <url>                                  (opened only)
Branch: <prefix><slug> at <sha>, pushed | local only
Plan: <sha>, <N> tickets
NN <ticket title>: <sha> | failed twice: <reason 1>; <reason 2>
Gate on the last commit: build ok, lint ok, test ok
Question: <text>                           (question stop only)
```

## Reuse decisions

| Capability | Supplied by | Why |
|---|---|---|
| Hardening, egress, git credential helper | `base/` copied by `quarterdeck/Dockerfile` | D30. One copy of the Base material |
| Egress list and secret names | `installer` build mode with `extensions/base.json` + `quarterdeck/extensions.json` | The same schema, rules and missing-secret warning |
| Claude policy | Installer rendering from `quarterdeck/claude-policy.json` | The installer is unchanged. Only the template differs |
| Mate procedures | Managed skills directory, copied in the Dockerfile | No edit to the fork. Every Claude in the Quarterdeck sees them |
| Herdr, treehouse | FirstMate's pinned, checksum-verified install scripts | Keeps the versions FirstMate is tested against (Herdr 0.7.4, flat layout) |
| Orchestration, briefs, relaunch, PR tracking | FirstMate at the pin | ADR 0008 |
| Spec, design, tickets, implementation | The project's own skills from the `engineering-workflow` Preset | Already in pomoplan's layer. Nothing new to add |
| Project container start | devcontainer CLI at the repo's shared pin (`0.89.0`) | Applies image metadata. Renovate already updates every copy of the pin together, so the Quarterdeck Dockerfile joins that group and `helper.test.mjs`'s agreement check |
| JSONC parsing in `qd-project-up` | `jsonc-parser` (already used by the skill helper) | Strict JSONC, MIT, no new kind of dependency |
| Image digest trust | The `dev-container` skill's `verify-image` when the digest was committed | Not repeated per start |
| Docker filter | `wollomatic/socket-proxy` (off-the-shelf, D10) | See Docker access |
| Tests | `node:test`, `tests/lib.mjs`, the label-and-run-id cleanup | Repo convention |

## Constraints

- No file in the FirstMate fork is edited. Ours sit in `config/`, `data/` and the managed skills directory.
- The project container receives no project-repository/push credential. The only allowed GitHub variable is creation-time `DEV_SETUP_GITHUB_PAT` from the read-only Agent Extensions token (ticket 08 / ADR 0010). Tests use dummy values; real permission scope is a human check. Retained Features/configuration and the shared Git store remain security-review concerns 01 and 03, not proven isolation.
- Git in the Quarterdeck never runs project hooks. The Quarterdeck's environment sets `GIT_CONFIG_COUNT` entries for `core.hooksPath=/dev/null` and `core.fsmonitor=false`. Environment config overrides repo config. The launcher re-appends them after FirstMate's entries in the publish route. `qd-publish` also passes `-c` and `--no-verify` and uses `--git-dir <clone>/.git`.
- The publish route is chosen only by `<home>/data/<id>/qd-route`. The home comes from `FM_TASK_INBOX`, which FirstMate sets on the Quarterdeck side. The project container cannot write `data/`. The launcher deletes the marker when it uses it. In that route it adds `--setting-sources user`, so settings written into the worktree do not load in the Quarterdeck. Whether this also skips CLAUDE.md and worktree skills is unverified, and slice 6 must check it.
- Only the Second Mate that owns a home starts that project's Crewmates. A project container serves one home.
- Second Mate homes are always seeded at an explicit path outside the pool.
- `quarterdeck` and the tests remove only containers they labelled. No prune.
- Not introduced: a database, a daemon of our own, a wrapper over `fm-*` commands, per-ticket mounts, the Quarterdeck as a devcontainer, publishing the Quarterdeck image, pause and resume, Ideas.
- `ARCHITECTURE.md` gets a Quarterdeck section when the implementation lands, not before.

## Validation plan

**Automated, token-free (`tests/quarterdeck.test.mjs`).** The Quarterdeck image is built once per run, like the node image. Each test uses a temporary work root and a dummy secrets file. The model is the spike's phase 1.

| Scenarios | Check | Real dependencies |
|---|---|---|
| SC-01 | `quarterdeck` twice: one container, one proxy, attach works. `stop` removes only labelled containers | Docker, Herdr |
| SC-19 | A `docker exec` shell has no token variables. A Herdr pane has them (compared by hash). `docker inspect` of the Quarterdeck shows no values; the project container exposes only ticket 08's allowed extensions token, never the Claude/project-repository token. A missing name produces the warning | Docker, Herdr |
| SC-15, SC-16, SC-17 | `qd-project-up` on a fixture project (node image from the run, rendered from the Template). The container's mounts are exactly the decision-34 set plus `/workspace`. Writes to `hooks` and `config` fail. The fixture's main-config `DEV_SETUP_GITHUB_PAT` is dropped; only ticket 08's separately supplied extensions token may appear, with a hash comparison and export/log/history scans. Egress is ready. A `.devcontainer` change on a non-main branch has no effect. A change on main recreates the container | Docker, devcontainer CLI, local bare origin |
| Launcher | The env allowlist, `-u node`, `HERDR_AGENT`, the trust entry in `$CLAUDE_CONFIG_DIR/.claude.json`. The publish marker in `data/` routes to the Quarterdeck. The same marker in `state/` is ignored | Docker |
| SC-18 | `qd-publish` against a local bare origin with a stub `gh`. Hooks planted in the clone, `state/<id>.git-hooks` and a redirected worktree `.git` never run | git |
| Docker access | A denied endpoint (`docker system df`, `docker swarm init`) returns 403. The allowed lifecycle works | Proxy |
| SC-03, SC-04, SC-05, SC-11, SC-13, SC-14 (loop) | **Stub-Crewmate run.** A test image derived from the node image replaces `claude` with a script. The script reads the latest Progress note, makes the planned commit or the ticket commit (or fails on a marked ticket), and appends the status line. The real FirstMate commands drive plan → ticket 1 → ticket 2 → publish to a local origin. One commit per ticket, the order and the branch name are asserted. A failing ticket gets exactly one retry, then nothing is published | FirstMate at the pin, Herdr, Docker |

**Manual checklist (needs a real Claude session, GitHub, or both).** Kept in `quarterdeck/CHECKLIST.md`, and run per slice.

| Scenarios | Check |
|---|---|
| SC-02, SC-10 | Herdr tabs and states through the hardened container. No prompt, trust dialog or login across a whole run. The attention mark on the First Mate tab |
| SC-06 | Opus for a skills ticket, Sonnet otherwise. Second Mate on Sonnet. First Mate on Opus |
| SC-07, SC-08 | Real gate in the hardened container. A real push and PR to a throwaway private repo, then to pomoplan |
| SC-09, SC-11, SC-12 | The report for success, for two failures, and for a question |
| SC-20 | Copy the work root, restore it, and confirm the clones and homes are intact |
| Planning | One handoff gives a Spec, a design and tickets, all in one commit |

**CI.** The `changes` job adds `quarterdeck/` to a new `quarterdeck` output. The `acceptance` job builds the Quarterdeck image after the node image when that output or `tests` changed, and runs the whole suite. CI holds no tokens and runs no real agent. `scripts/check-pins.mjs` checks that the Quarterdeck Dockerfile's base digest and Claude pin equal the Node Variant's. Nothing is published.

**Risky integration points:**
- The devcontainer CLI through the proxy (exec hijack, `build`, `events`).
- `allowManagedHooksOnly` against FirstMate's Crewmate hooks.
- `--setting-sources user` in the publish route.
- FirstMate escalating the interim blocked state.
- The watcher and auto-arm keeping the First Mate and Second Mate supervising while the captain is away.
- `next build` under the Egress Allowlist.

**Revisit this design if:**
- FirstMate needs a patch.
- A second project runs at once.
- The Git gate lands, which takes the token out of the Quarterdeck.
- Treehouse gains a working root setting.

## Build order (input for tickets)

Each slice can be proven on its own. Unproven links come first.

1. **Quarterdeck up.** The image, `quarterdeck`, `qd-entry`, the proxy, token delivery, egress in the Quarterdeck, and the First Mate tab with no prompts. Token-free tests for SC-01 and SC-19. Proves the proxy's Unix socket and Herdr's tab-opening call (the spike only used `herdr pane run`).
2. **Real GitHub, no agents.** The First Mate home registers a throwaway private repo, which is cloned from GitHub. `fm-home-seed` makes a Second Mate home with a fresh GitHub clone. `qd-publish` pushes a hand-made branch and opens a PR. Proves D37.
3. **Hardened project container.** `qd-project-up` on pomoplan's real `.devcontainer/` (needs Open question 2 answered first). One Crewmate spawned by hand with FirstMate's commands, as in spike link 1. It runs the full gate. Proves the first-run state under `CLAUDE_CONFIG_DIR`, `-u node`, the Crewmate's egress, the effect of `allowManagedHooksOnly`, and the proxy's endpoint list.
4. **Planning Crewmate.** The Second Mate is steered by hand with one handoff, and the result is spec, design and tickets in one commit on `<prefix><slug>`.
5. **Ticket loop.** The `qd-spec-run` skill through step 8, the dispatch rule, the gate check, the interim blocked state, and the stub-Crewmate test.
6. **Publish relaunch.** The marker route, `--setting-sources`, `done: PR` accepted by FirstMate, and the report.
7. **First Mate as a session, end to end.** One sentence starts the run and a report comes back. The watcher, auto-arm and attention mark (SC-10 in full).
8. **Failure paths.** A ticket built to fail, retried once and then stopped. A ticket that raises a question.

## Open questions for the user

1. **What replaces D13 (`/workspace` with a link).** Recommendation: `/workspace` in a Quarterdeck-created container holds only the main-branch `.devcontainer/`, read-only. Code lives at the pool path, which is identical in both containers. No link. Containers opened by hand keep the Template's `/workspace`.
2. **Resolved by tickets 08 and 20 / ADR 0010: read-only single-repository token, inspect visibility accepted until the Git gate.** Original alternatives for private extension sources against ADR 0007: Pomoplan's Project layer fetches `ValeriD/skills` (private) at container start. That needs a GitHub credential in the project container, and both D9 and ADR 0007 forbid one. Recommendation: make `ValeriD/skills` public, or publish a public mirror of the pinned skills. Second choice: the Quarterdeck mirrors the pinned sources (its token then needs read access to that repo too) and serves them read-only through the installer's existing `--git-base` path. That turns a test seam into a feature.
3. **The hardened policy blocks FirstMate's Crewmate hooks.** `allowManagedHooksOnly` should ignore the busy and turn-end hooks FirstMate writes into the worktree (unverified). Recommendation: prove in slice 3 whether supervision works from status lines and Herdr state alone. If it does not, mount a read-only managed drop-in from the Quarterdeck that reads FirstMate's generation value as data and calls `fm-busy-event.sh`. Do not relax the policy.
4. **The Quarterdeck cannot use Base's `allowManagedHooksOnly`.** FirstMate's First Mate and Second Mates depend on hooks: the Stop guard, auto-arm and busy hooks. Recommendation: the Quarterdeck ships its own Claude policy without that key. That is a deliberate departure from "Base covers both". Worktree-written settings are kept out of the Quarterdeck through the publish route's `--setting-sources user`.
5. **Egress in the Quarterdeck.** No decision covers it. Recommendation: apply Base's Egress Allowlist, and reach the proxy over a Unix socket, so `base/` does not change. If the proxy cannot do that, the fallback is one fixed local address in `render.sh`.
6. **Named Secrets for the Quarterdeck.** Per D35 the values come from a root-owned file, not from host environment variables as `CONTEXT.md` defines Named Secrets. Recommendation: keep the file and declare the names in the Quarterdeck manifest. Widen the `CONTEXT.md` definition when this lands.
7. **The planning Crewmate's model.** D19 covers only tickets. Recommendation: Opus.
8. **A new risk: a Crewmate can redirect a worktree's `.git` file.** Git run in the Quarterdeck in that worktree, including FirstMate's own status reads, would then read a config the Crewmate wrote. Environment-level overrides stop hooks and fsmonitor. `qd-publish` never uses the worktree's `.git`. Other keys, such as a credential helper, are still possible, and egress limits the damage. Recommendation: accept it for the MVP beside spec risk 4, and close it with the Git gate.
9. **Grilling's place.** D39 says the First Mate hands the grilling over, but the spec lists grilling in the Quarterdeck as out of scope. Recommendation: the MVP input is the user's decisions as told to the First Mate. The grilling skill may be used there, but nothing depends on it.
10. **Keeping Ideas.** Undecided scope. Nothing is designed for it.
