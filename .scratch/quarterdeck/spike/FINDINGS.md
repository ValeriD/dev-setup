# Quarterdeck spike: findings

Throwaway. Images are not hardened and the project container is a plain stand-in, not the hardened Node Variant. Runtime folder: `/home/valeri/qd-spike`. Spike repo: `ValeriD/quarterdeck-spike` (private). FirstMate: `ValeriD/firstmate` at `427056c`.

## Phase 1: plumbing, no tokens (2026-11-13)

Proven by running it:

- **Sibling containers.** The Quarterdeck container creates the project container through the Docker socket.
- **Commits under the restricted mounts.** With only the worktree pool, the clone's `.git`, FirstMate's `bin` and `state` mounted, a commit made in the project container lands on the branch and the Quarterdeck sees it at once.
- **Hooks and config are read-only.** Writing `.git/hooks/pre-commit` fails with "Read-only file system"; `git config` fails. Committer name and email come from environment variables.
- **Visibility.** From the mate's home the project container sees `bin` and `state` only. `AGENTS.md`, `data/` and the clone's files are not there.
- **The launcher.** A script named `claude`, first on the path, runs Claude inside the project container when the working directory is a worktree and the real Claude otherwise. It forwards `FM_*`, `GIT_CONFIG_*` and `CLAUDE_CODE_*` variables.
- **FirstMate's hook script runs in the project container** with bash alone. It answered "no armed busy-state gen", which is the expected reply for a task that no spawn armed. Touching `state/<id>.turn-ended` from the project container is visible in the Quarterdeck.

Learned:

- **Treehouse 2.0.1 ignores `TREEHOUSE_ROOT`.** That is the version FirstMate pins. The pool is always `~/.treehouse`. Worked around by mounting a work-root folder at `/home/node/.treehouse` in both containers.
- **Treehouse uses real git worktrees.** The worktree's `.git` file points at `<clone>/.git/worktrees/<name>` by absolute path, so the clone's `.git` must sit at the same path in both containers.
- **Docker creates a missing mount source as a root-owned folder.** The launcher has to create every folder before mounting it.
- **A pre-pushed spec branch clashes with FirstMate's naming.** A task creates its own branch `<prefix><id>`. If the spec branch already exists under that name, the names collide. For the spike the spec and tickets are on `main`. In the target flow the planning Crewmate makes the first commit on the task's own branch, so there is no clash.

## Phase 2: tokens, run by an agent (2026-11-13)

| Link | Verdict |
|---|---|
| 1. Launcher + hooks | PROVEN |
| 2. Herdr state through `docker exec` | PROVEN, only with `HERDR_AGENT=claude` on the `docker` process |
| 3. Relaunch per ticket | PROVEN |
| 4. Second Mate in the same container | PROVEN |
| Optional push and PR | NOT RUN: the GitHub repo was not reachable (see Setup) |

No FirstMate file was patched. `git status` in the fork clone is clean; all changes are in ignored `config/`, `data/` and `projects/`.

### Setup and workarounds

- **Token file.** It is at `~/.config/spike.env`, not `~/.config/quarterdeck/spike.env`. It is owned by root, mode 0600. The docker CLI runs as the user and cannot read it, so `--env-file` fails. `up.sh` now bind-mounts it read-only at `/run/qd/spike.env` and starts the container as root with `bin/qd-entry` as entrypoint. That script sources the file, prints only "set" or "MISSING" per name, runs `gh auth setup-git` as `node`, starts `herdr --session default server` as `node`, then sleeps as `node`.
- **Only Herdr panes have the tokens.** A plain `docker exec` does not. Commands that need a token (creating the project container, `gh`) run in a Herdr shell workspace `ops`, driven from the host by `ops.sh '<command>'`.
- **Every `docker exec` into `qd-spike` needs `-u node`**, because the container now starts as root.
- **GitHub repo not reachable.** The GitHub token works (`gh auth status`: logged in as ValeriD, 39 repos visible), but `gh api repos/ValeriD/quarterdeck-spike` returns 404 and `git clone` returns 403. Either the repo does not exist or the fine-grained token does not cover it. Workaround: a local bare repo `/home/valeri/qd-spike/origin/quarterdeck-spike.git` stands in for origin. Its content was re-created, not copied: tiny Node project, `npm test` = `node --test`, `.scratch/greeting/spec.md`, tickets 01 and 02 (02 depends on 01).
- **Permission mode.** `config/claude-permission-mode` = `auto` in the main home, so crewmates also ran in `auto`, not bypass. The agent's own permission classifier refused writing `bypass`. `auto` worked for crewmates: every tool call showed "Allowed by auto mode classifier", no prompt. The Second Mate inherited `auto`.
- **Herdr.** Started headless by the entrypoint (`herdr --session default server`, Herdr 0.7.4, protocol 16). FirstMate reused it. FirstMate warned that 0.7.4 is below the 0.8.0 floor for presentation spaces and used the flat layout.
- **Missing tools.** Nothing was installed or stubbed. Spawn, relaunch, exit, seed and the Second Mate's session start ran without `no-mistakes` or `chrome-devtools-axi`. Spawn warned "lsof is unavailable" at teardown and "WATCHER DOWN" on every command (no watcher was run).
- **Project container.** Created by `bin/qd-project-up <home> <clone>` from the `ops` pane. Mounts: pool (rw) at `/home/node/.treehouse`; `<clone>/.git` (rw) with `hooks` and `config` read-only; `<home>/bin` (ro); `<home>/state` (rw). `--cap-drop=ALL --security-opt no-new-privileges`, label `qd-spike=1`, `-e CLAUDE_CODE_OAUTH_TOKEN` by name, git author and committer by name. No `GH_TOKEN` (checked: empty in the container). No mount had to be added. `data/<id>` was not needed: the launch brief arrives inline in a message under `state/operational-inbox/`. `.agents/skills` was not needed. FirstMate passes `--add-dir` for `data/<id>` and `.agents/skills` anyway; Claude started without complaint although those paths do not exist in the container.
- **Claude first-run state in the project container.** Two things were needed. (1) `~/.claude.json` with `hasCompletedOnboarding: true`. The first seed was empty (`docker exec` without `-i`), and Claude then showed "configuration file … contains invalid JSON". (2) A folder-trust entry for the exact worktree path. A trust entry for the parent `/home/node/.treehouse` does not cover child paths; the dialog appeared and was answered once with `herdr pane send-keys Down Enter`. The launcher now writes the trust entry for `$PWD` into the project container's `~/.claude.json` with `jq` before each launch, mirroring `bin/fm-claude-trust.sh`. With that, the Second Mate's crewmate in a new slot showed no dialog. No login prompt appeared: `CLAUDE_CODE_OAUTH_TOKEN` is enough.

### Link 1: launcher + hooks: PROVEN

Main home `/home/valeri/qd-spike/fleet/firstmate`, `config/backend` = `herdr`, project registered as `- quarterdeck-spike [direct-PR branch=feat/] - …`.

```
bin/fm-brief.sh greeting quarterdeck-spike --mode direct-PR --branch-prefix feat/
bin/fm-spawn.sh greeting projects/quarterdeck-spike --mode direct-PR --yolo off --branch-prefix feat/ --harness claude --model sonnet
```

The brief's Definition of done was edited to "one commit, then `done`; no push, no PR", because the project container has no forge credential.

- `spawned greeting harness=claude kind=ship mode=direct-PR yolo=off window=default:w3:p2 worktree=/home/node/.treehouse/quarterdeck-spike-ee7154/1/quarterdeck-spike`
- `launch.log`: the routed launch with `--permission-mode auto --add-dir … --settings {…} --append-system-prompt … --model sonnet`.
- `ps` in `qd-spike-project`: `claude --permission-mode auto --add-dir …`. Herdr's `pane process-info`: foreground `docker`.
- The pane shows FirstMate typing `export FM_TASK_ID=greeting` and sourcing its launch file; the launcher forwarded `FM_*`, `GIT_CONFIG_*` and `COMPACT_ADVISER_DISABLE`.
- Hooks were written to `<worktree>/.claude/settings.local.json` and fired inside the project container: `state/greeting.turn-ended` touched at the turn end; `state/greeting.busy-state` = `v1 gen=… seq=3 state=idle source=claude-hook event=stop`. Files are owned by uid 1000 on the host.
- Commit 209823b by `spike <spike@example.invalid>` on `feat/greeting`. The trailer-strip `commit-msg` hook (`core.hooksPath` = `state/greeting.git-hooks`, via `GIT_CONFIG_*`) ran without error.

### Link 2: Herdr state through `docker exec`: PROVEN, with the hint

- `herdr agent get` on the crewmate pane: `{"agent":"claude","agent_status":"blocked"}` on the trust dialog, `working` during the turn, `done` after it. A 2-second poll during session 2 saw `working` ×5, then `done`.
- `herdr agent explain`: `agent: claude`, rule `live_prompt_box`, manifest `claude.toml`.
- Control test in a spare pane, same command, no prompt sent: with `env -u HERDR_AGENT docker exec -it … claude`, `agent get` returns `agent_not_found` (foreground `docker`). With `HERDR_AGENT=claude docker exec -it … claude`, it returns `claude idle`. So detection depends on the hint on the `docker` process. No other launcher variant was needed.

### Link 3: relaunch per ticket: PROVEN

1. Before the relaunch, the brief was made ticket-neutral (edited in `data/greeting/brief.md`): "Each session implements exactly one ticket from `.scratch/greeting/issues/`: ticket 01 unless the latest `## Progress note` below names another ticket."
2. `FM_HOME=/home/valeri/qd-spike/fleet/firstmate bin/fm-control.sh greeting relaunch --model sonnet --note "Ticket 01 is done and committed. This session: implement ticket 02 only (.scratch/greeting/issues/02-shout.md), as one new commit on top of feat/greeting. …"`
3. FirstMate appended the note to `brief.md` under `## Progress note (2026-11-13T14:37:32Z)`, after its own text "This task was relaunched. Continue from here; …". `state/greeting.control-relaunch`: `phase=complete`.

Result: same worktree path (both `launch.log` lines), same branch `feat/greeting`, commits 209823b then 565e4e2, `npm test` 6 pass 0 fail in the project container, status lines `done … ticket 01 committed 209823b` and `done … ticket 02 committed 565e4e2`. Session 2 is new: two session files (`c0ab33bb…`, `4fdc642b…`) in the project container's `~/.claude/projects/<worktree>/`, no `--resume`/`--continue` on the launch line, a new busy generation, and `turn-ended` touched again.

How the next ticket was delivered: the relaunch's required `--note`, which lands in the brief. Not `fm-send`.

What fights this use:
- `fm-control.sh` refuses without an explicit `FM_HOME`.
- `relaunch` requires a `--note`. That is the natural channel, but the brief's intent must be written to defer to the latest note, or it contradicts it. Notes pile up in `brief.md`, one per ticket.
- The ship Definition of done says push and open a PR. The brief had to be edited for a container with no forge credential.
- Nothing refused a relaunch of a crewmate that had reported `done`.

### Link 4: Second Mate in the same container: PROVEN

```
FM_SECONDMATE_CHARTER="Second mate for the quarterdeck-spike project. …" bin/fm-brief.sh spike-sm --secondmate quarterdeck-spike
bin/fm-home-seed.sh spike-sm /home/valeri/qd-spike/fleet/sm-spike quarterdeck-spike
qd-project-up /home/valeri/qd-spike/fleet/sm-spike /home/valeri/qd-spike/fleet/sm-spike/projects/quarterdeck-spike   # in the ops pane
bin/fm-spawn.sh spike-sm /home/valeri/qd-spike/fleet/sm-spike --harness claude --model sonnet --secondmate
FM_HOME=<main home> bin/fm-send.sh spike-sm '<routed ship task `hello`, direct-PR, feat/, claude, sonnet, commit only>'
```

- The home was seeded as a full fork clone at an explicit path (not a treehouse lease), with its own fresh clone of origin under `projects/`. `config/backend` and `config/claude-permission-mode` were inherited at launch.
- Herdr workspaces after the run: `ops`, `firstmate`, `2ndmate-spike-sm`. The Second Mate is pane `w4:p2`, cwd its home, `claude working` then `done`. It ran the real Claude in the Quarterdeck (no `launch.log` entry), in `auto` mode, with no prompt waiting.
- On the steer, the Second Mate wrote the brief and spawned the crewmate itself. The crewmate tab `w4:p3` is in the Second Mate's workspace; the launcher routed it into `qd-spike-project` (`launch.log` line for slot `…/2/quarterdeck-spike`); no trust dialog.
- Hooks fired back to the Second Mate's home: `/home/valeri/qd-spike/fleet/sm-spike/state/hello.turn-ended` and `hello.busy-state` = `state=idle source=claude-hook event=stop`. The main home's `state/` has no `hello` files. Commit 42f8c22 on `feat/hello` in the Second Mate's clone.
- The Second Mate reported back on its own: done, `npm test` 2/2. Its crew-state check read "blocked: head unreachable outside the worker copy", because nothing was pushed.

### Design consequences

1. **Token delivery (decision 35).** A root-owned 0600 token file cannot go through `docker run --env-file` from the user. Either the file is user-readable, or the Quarterdeck loads it in an entrypoint as root and drops privileges, as the spike does. Only processes under the Herdr server then hold the tokens, which is a good property: `quarterdeck` should start Herdr from the entrypoint.
2. **Launcher (decision 4).** The launcher must set `HERDR_AGENT=claude` on the `docker exec` process; without it Herdr sees no agent. It must also write folder trust for the exact worktree path into the project container's Claude config before each launch, and the project image must ship `~/.claude.json` with `hasCompletedOnboarding: true`. No login step is needed with the token.
3. **Mount set (decision 34) holds as written.** Worktree pool, clone `.git` with hooks and config read-only, home `bin` (ro), home `state` (rw). Nothing else was needed for a full turn.
4. **The mount set exposes more than decision 34 says.** `state/` is the whole home's signal folder, not just one Crewmate's files: a Crewmate can forge another task's signals or write into another task's steering inbox. And the pool is shared by every home: `~/.treehouse/quarterdeck-spike-<hash>/` held slot 1 (main home) and slot 2 (Second Mate), both visible in the one project container. Narrowing to the task's own slot and own `state/<id>.*` files needs per-task mounts, which Docker cannot add to a running container.
5. **One project container serves one home (decisions 4 and 34).** Its mounts name one home's `bin`, `state` and clone. Re-creating it for the Second Mate cuts off the main home's worktree, whose `.git` file points at the main clone (inferred from the paths, not run). In the real design only the Second Mate dispatches Crewmates for a project, so the container must be created for that Second Mate's home, and the First Mate must not dispatch project Crewmates itself.
6. **Ticket per session (decisions 5 and 20).** `fm-control.sh <id> relaunch --note '<next ticket>'` works as the per-ticket step. The Second Mate must write the brief ticket-neutral ("the latest Progress note names the ticket") and pass `FM_HOME` explicitly.
7. **Definition of done (decisions 9 and 26).** FirstMate's direct-PR brief tells the Crewmate to push and open the PR. With no credential in the project container, the brief must be edited at scaffold time to "commit and report done", and the push and PR become a separate step in the Quarterdeck. Mates' crew-state then reads "blocked: head unreachable" until the push, which a Second Mate must learn to treat as expected.
8. **Permission mode (decision 11).** `config/claude-permission-mode` is one value for the whole home and is inherited: Crewmates and Second Mates get the same mode. `auto` worked for both without prompts. Keeping Crewmates on bypass while mates use `auto` needs a per-kind setting FirstMate does not have.
9. **Herdr version.** FirstMate pins Herdr 0.7.4, below its own 0.8.0 floor for presentation spaces. Not a blocker; flat layout works.
10. **Second Mate home.** `fm-home-seed.sh` with an explicit path makes a full clone of the fork outside the pool. Prefer this over `-` (a treehouse lease), which would put the Second Mate's home inside the pool that every project container mounts.

### Not tested

- Push and PR from the Quarterdeck (GitHub repo not reachable with the token; local origin used).
- Real GitHub fetch and clone during spawn and seeding (local origin only).
- Crewmates on bypass (`--dangerously-skip-permissions`) in the project container.
- The FirstMate watcher, away mode, push-event supervision and the First Mate as a Claude session. Scripts were driven by hand; only the Second Mate ran as a session.
- `fm-send` steering into a Crewmate behind `docker exec` (only a Second Mate in the Quarterdeck was steered).
- A Herdr server restart with a Crewmate behind `docker exec`.
- The hardened Node Variant as project container; the socket proxy.
- Two Second Mates for one project, or two projects at once.
