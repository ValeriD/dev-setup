# Quarterdeck: grilling notes

Working notes from the grilling session that started on 2026-11-13. This is not a spec and not a ticket list. The spec is written from it when the grilling ends. Picture of the design: `helm-architecture.html` at the repo root (Draft 2, drawn before the rename to Quarterdeck and before the FirstMate source was read; see "Facts" below for what it gets wrong).

## Decided

1. **Repo.** Built in this repo, under its own directory. Split out only if it outgrows the catalogue.
2. **Name.** Quarterdeck, not Helm (clashes with the Kubernetes tool).
3. **Role words.** First Mate, Second Mate, Crewmate, as in FirstMate upstream. "Worker" is retired.
4. **Shape.** One Quarterdeck container with Herdr, the First Mate and one Second Mate per active project. One container per Consuming Project. Mates run in the Quarterdeck; coding Crewmates run in the project's container.
5. **One Crewmate per ticket.** The Second Mate is the orchestrator that starts them, one after another. No sub-agent loop inside a single Crewmate, because sub-agents cannot be tracked.
6. **MVP is done when:** in the Quarterdeck you tell the First Mate to ship one spec with two tickets on pomoplan; the Second Mate gets both tickets implemented in the project container with Claude, one commit per ticket on the spec branch; the branch is pushed and a PR is opened; you get one report and touched nothing in between.
7. **Work root.** `/home/valeri/work`, a plain host folder that can be backed up. The Second Mate's own clone is the working copy. Existing checkouts stay untouched.
8. **Test project.** pomoplan.
9. **GitHub in the MVP.** One fine-grained token for the pomoplan repo, passed by name to the Quarterdeck only. Project containers get no GitHub credential.
10. **Docker access in the MVP.** Off-the-shelf socket proxy that filters by API endpoint. Known risk: it cannot stop the Quarterdeck from creating a container that mounts any host path.
11. **No yolo in the Quarterdeck.** Mates prompt. Crewmates run with prompts skipped inside the hardened project container.
12. **Tickets** stay in `.scratch/` for the first version. Spec, design and tickets are committed on the spec branch before dispatch.
13. **Project path** stays `/workspace` in the project container, with a link from the host-style path.
14. **Anthropic traffic** is never proxied. Claude logs in with a `claude setup-token` token passed by name.

## Later (accepted as out of the MVP)

Each of these becomes its own feature when picked up.

- **Git gate.** A container that holds the GitHub token and adds it to outgoing git traffic, with repo and branch rules. Removes the token from the Quarterdeck.
- **Custom socket proxy.** Only labelled containers, only mounts under the work root, no privileged containers. Closes the known risk in decision 10. First hardening item.
- **Rootless Docker.** Steps and the five things to test are in `helm-architecture.html`. Likely blocker: files written by `node` into the work root are owned by a high host id.
- **Pi and OMP as Crewmates.** OMP has an auth broker made for containers (`omp auth-broker serve`, `OMP_AUTH_BROKER_URL`). Pi keeps its login in one `auth.json` that can be shared under its file lock.
- **More than one project at a time**, and **two specs in parallel on one project.**
- **Surviving a Quarterdeck restart.** Today agent sessions end and the spec is restarted by hand.
- **Backup job** for the work root (tool, target, exclusions).
- **GitHub Issues as the tracker.** The mate fetches the issue, so project containers still need no token.
- **MCP server tokens through the gate.**
- **Quota-aware model rules.** FirstMate's `config/crew-dispatch.json` supports quota floors through `quota-axi`.
- **Seeding logins** into new project containers.
- **Moving existing projects** into the work root.

## Facts from the sources (read 2026-11-13, nothing run)

FirstMate `427056c`, plus treehouse, Herdr, pi-mono and oh-my-pi at their heads on that date.

- A FirstMate task always gets a clean pooled worktree and its own branch `<prefix><task-id>`. The worktree is reset on teardown. There is no "work in this folder" mode.
- `fm-spawn.sh` takes `--branch-prefix` and `--base-branch` per spawn. A `direct-PR` task with a base branch starts from `origin/<base>` and opens its PR against that branch.
- A Second Mate always clones its projects fresh from origin into `<home>/projects/`. It cannot use an existing checkout and refuses `local-only` projects.
- Hooks are wired only when the launch command's name is `claude`, `pi` or `omp`. A raw `docker exec` command gets none. Plan: a launcher named `claude` on the Quarterdeck's path that execs into the project's container.
- The Claude hooks and the Pi and OMP extensions run a bash script and touch a file. They do not call Herdr or tmux, so they should work in a project container that mounts the mate's home at the same path.
- Folder trust is written to `.claude.json` under the launching side's Claude config. The project container's Claude config needs the same entries.
- Treehouse keeps worktrees under `~/.treehouse/` by default; the root is configurable.
- Herdr has built-in detection for Claude Code, Codex, Pi and OMP, and a CLI that FirstMate's Herdr backend uses. `HERDR_AGENT` must be set on the command Herdr itself sees.
- `config/crew-dispatch.json` holds natural-language rules that pick harness, model and effort per task. It is inherited into Second Mate homes.
- FirstMate is MIT licensed and changes daily. `bin/fm-spawn.sh` is 8,318 lines; `bin/` holds 261 files.

## Not yet verified by running anything

- The whole chain. No container has been started.
- That environment variables FirstMate types into the tab reach the agent through `docker exec`.
- That Herdr's screen detection holds when the tab's process is `docker exec`.
- Whether a Second Mate may merge a ticket's PR into the spec branch on its own.

## Round 2 (2026-11-13)

Decided:

15. **Target workflow.** You grill with the First Mate. The Second Mate then owns the spec, the design and the tickets, and manages one Crewmate per ticket. Each ticket is one commit on the spec's branch.
16. **MVP input.** The MVP starts from a spec branch that is already pushed with spec, design and tickets on it. Grilling and planning inside the Quarterdeck come after.
17. **Review.** The ticket's Crewmate implements and reviews as today. No extra review per spec. Passing tests are enough to open the final PR.
18. **Fork.** `ValeriD/firstmate`, forked from `kunchenguid/firstmate` on 2026-11-13. The Quarterdeck image pins an exact commit. No edits to upstream files in the MVP. Updates happen on your schedule after reading the diff.
19. **Model rules.** Tickets about skills, prompts or agent tools use Opus; other tickets use Sonnet. First Mate on Opus, Second Mates on Sonnet. No quota rules yet.

More facts from the FirstMate source:

- `fm-spawn.sh <task-id> --relaunch` starts a replacement agent for an existing task in that task's own worktree, without fetching or resetting it. Harness, model and effort may change on a relaunch. It is the launch half of `bin/fm-control.sh relaunch`, and it is built for replacing a stopped agent.
- FirstMate's first hard rule: a mate never writes to a project. Crewmates change projects. So spec, design and ticket files have to be written by a Crewmate, not by the Second Mate itself.
- Outside its `no-mistakes` pipeline, FirstMate tells mates not to add a review gate of their own unless you ask for one.
- A brief has two sections, `## Captain's intent` and `## Firstmate spec`. That "spec" is a few build notes, not a product spec.
- FirstMate has two kinds of Crewmate: a ship changes code, a scout investigates and writes a report.

Word clashes to settle:

| FirstMate's word | Means there | Your workflow |
|---|---|---|
| captain | you | you |
| task | one Crewmate's job, with an id, a brief, a worktree and a branch | undecided: the whole spec, or one ticket |
| brief | the instruction file a Crewmate starts from | no equivalent; the ticket is the nearest |
| Firstmate spec | build notes inside a brief | clashes with your spec (the product document) |
| charter | a Second Mate's standing instructions | no equivalent |
| backlog | FirstMate's own list of waiting work | clashes with tickets in `.scratch/` |
| ship / scout | Crewmate that changes code / that only investigates | no equivalent |
| delivery mode | how a task's work lands: `no-mistakes`, `direct-PR`, `local-only` | your branch-per-spec rule |

## Round 3 (2026-11-13)

Decided:

20. **One task per spec.** A spec is one FirstMate task with one branch and one worktree. The Second Mate starts a fresh Crewmate session in that worktree for each ticket, through FirstMate's relaunch. No ticket branches, no per-ticket PRs. The branch is `feat/<spec>`, `fix/<spec>` or `chore/<spec>` (prefix plus task name). Unverified: relaunch was built to replace a stopped agent. The spike tests this first; the fallback is a small change in the fork.
21. **Planning (after the MVP).** The Second Mate directs it; a planning Crewmate writes spec, design and tickets in the spec's worktree and commits them first. Input is the grilling summary.
22. **Plan approval.** The Second Mate carries on into implementation by default. A hold for your approval is opt-in per spec.
23. **"Spec"** always means your product spec. FirstMate's `## Firstmate spec` section is called brief notes.
24. **Trackers.** Tickets live only in `.scratch/`. FirstMate's backlog is your idea store: things you thought of for a project that have had no grilling or research yet, to decide on later.

Facts that bear on these:

- FirstMate's backlog is a work queue. It re-checks queued items after every teardown and dispatches them when their dependencies and capacity clear. An item FirstMate must not start on its own has to be held for the captain (`bin/fm-captain-hold.sh hold <id> --reason …`, optionally `--until <date>`).
- FirstMate files a backlog item for work it dispatches, and work routed to a Second Mate is recorded in that Second Mate home's own backlog.
- In `direct-PR` mode the Crewmate itself pushes and opens the PR. Project containers have no GitHub credential (decision 9), so the push and PR step has to run in the Quarterdeck.

Design risk found while tracing the mounts:

- The project container must mount the Second Mate's home, because the clone and the worktrees live there. The Template's read-only overlays (`.git/hooks`, `.git/config`, `.devcontainer`, `.vscode`) protect `/workspace` only. Through the home mount, a Crewmate could write git hooks or config into the clone, and those would later run in the Quarterdeck, where the GitHub token is.

## Round 4 (2026-11-13)

Decided:

25. **Words.** Spec Run, Brief, Charter, Scout and Idea are in `CONTEXT.md`. "Task" and "ship" (as a noun) stay out of our own docs.
26. **PRs.** The Second Mate manages the push and the PR through a Crewmate that runs in the Quarterdeck, where the GitHub token is.
27. **Ideas.** Every Idea is a held item in the First Mate's backlog, tagged with its project. It leaves that state only through a grilling.
28. **Ticket failure.** One retry with a fresh Crewmate, then the Spec Run stops and you get a report. A question the spec and design do not answer also pauses the run. The Second Mate never guesses and never skips ahead.
29. **Finding out.** Herdr's attention mark on the First Mate's tab is enough for the MVP.
30. **Not a Variant.** The Quarterdeck is built on Base but is not a Variant. Base now covers both.
31. **Project container access.** Your direction: the project container reaches the worktree and as little else as possible, with the committer name and email passed in. The exact mount set is open (a worktree cannot commit without the clone's git store). Two rules hold either way: git in the Quarterdeck never runs hooks from a project folder, and a project container is always created from the configuration on the project's main branch.
32. **Starting it.** One host command, `quarterdeck`, shipped in this repo. It starts the containers if needed and attaches to Herdr.
33. **Spike first.** A throwaway spike tests four links before the spec is written: the `claude` launcher with hooks firing back, Herdr's state through `docker exec`, a relaunch per ticket in one worktree, and a Second Mate in the same container as the First Mate.

Added to Later:

- **Desktop or phone notifications** when a report is waiting.

## Round 5 (2026-11-13)

Decided:

34. **What a project container can reach.** Four things, nothing else from the Second Mate's home: the spec's worktree (read and write); the clone's git store (read and write, hooks and config read-only); FirstMate's scripts (read-only); that Second Mate's signal files (read and write). Committer name and email arrive as environment variables. This replaces decision 31's open mount set. Known limit: a Crewmate could forge a "done" signal for its own project. The spike checks that commits work under these mounts.
35. **Spike conditions.** A throwaway private repo `ValeriD/quarterdeck-spike`. The Docker socket mounted directly, for the spike only, run attended and torn down afterwards. A Claude token (`claude setup-token`) and a GitHub token scoped to the spike repo, set by you in a file outside this repo that only Docker reads. The tokens are needed only when the first agent starts and when the Second Mate first clones, not before.
36. **ADRs after the spike.** Candidates: mates live in the Quarterdeck; project containers hold no GitHub credential; FirstMate is a pinned fork with no upstream edits.

The design tree has no open branch left. Next: your confirmation, then the spike.

## After the spike (2026-11-13)

Spike result: all four links proven against a local stand-in repository. Details and commands: `spike/FINDINGS.md`. No FirstMate file was patched. The spike containers were removed afterwards; `/home/valeri/qd-spike` and the two images remain.

Decided:

37. **GitHub part not spiked.** The spike's GitHub token could not reach the spike repo, so cloning from GitHub, pushing and opening a PR were not run. Accepted: the MVP build proves them.
38. **Permission mode.** FirstMate has one permission setting per home, shared by a mate and its Crewmates. "auto" for both is accepted for now. This replaces the second half of decision 11 (Crewmates skipping prompts).

Changes the spike forces on earlier decisions:

- **Decision 16 (MVP input).** A pre-pushed spec branch collides with the branch the Spec Run creates. The spec and tickets must reach the Spec Run another way: on `main`, or as the first commit on the Spec Run's own branch.
- **Decision 20 (one task per spec).** Confirmed. The next ticket is delivered in the relaunch's progress note, and the Brief stays ticket-neutral.
- **Decisions 9 and 26 (push and PR in the Quarterdeck).** FirstMate's PR mode tells the Crewmate to push and open a PR. That wording has to become "commit only", and FirstMate shows the Spec Run as blocked until something pushes.
- **Decision 34 (mounts).** Enough as written, but a Crewmate sees its home's whole signal folder and the worktree pool is shared by every home.
- **Decision 35 (tokens).** The token file was root-owned, so Docker could not pass it directly; a root entrypoint in the container loaded it. Token delivery needs a proper design.
- **Launcher.** It must set `HERDR_AGENT=claude`, mark Claude's first-run setup complete in the project container, and register trust for the exact worktree folder before each launch.
- **One project container serves one home.** Only the Second Mate starts that project's Crewmates. Seed a Second Mate's home at an explicit path, never inside the worktree pool.
- **Treehouse 2.0.1** always uses `~/.treehouse`.

Still untested: real GitHub, the hardened Node image as the project container, Pi and OMP.

## Round 6: answers to the spec's open questions (2026-11-13)

These override the spec draft and any earlier decision they touch.

39. **Planning is in the MVP.** This replaces decision 16. The First Mate gives the grilling handoff to the project's Second Mate. The Second Mate gets the Spec, the design and the tickets created and committed, then the ticket flow continues as decided. Per decision 21 and FirstMate's rule that a mate never writes to a project, a planning Crewmate does the writing and makes the first commit on the Spec Run's own branch. This also removes the branch-name clash the spike found.
40. **Branch prefix.** The First Mate picks it, from `feat/`, `fix/` and `chore/` only.
41. **"Tests pass"** means the project's build, lint and tests all pass. A ticket is not done, and the pull request is not opened, until all three do.
42. **The final report** is undecided; it should be small. The design proposes a minimal one.
43. **Pause and resume** (how a paused question reaches you and how you restart the run) is deferred. The MVP only has to stop and report.

Still unanswered, flagged to the user: whether keeping Ideas belongs in the MVP, and what replaces decision 13 (`/workspace`), which the spike did not use.

## Round 7: answers to the design's open questions (2026-11-13)

These override the design where they differ.

44. **Private skills fetch.** You will provide a GitHub token limited to the `ValeriD/skills` repository, so a project container can fetch its Agent Extensions at start. This is the one GitHub credential a project container may hold: read-only, one repository, not the project's own. It narrows ADR 0007, which must be amended to say so.
45. **FirstMate's hooks in a project container come as an Agent Extension**, not as part of Base or the Node Variant. Rule: a Consuming Project's dev container works with and without the Quarterdeck, depending on configuration. Anything FirstMate-specific is opt-in and leaves a container opened by hand unchanged.
46. **`/workspace` replacement** is still undecided. The design's proposal (code at the worktree's own path; `/workspace` holds only the main branch's container configuration, read-only) stays a working assumption.
47. **Token file.** You will fix it. The design must not depend on a root-owned file or on a root entrypoint reading it. The exact delivery mechanism needs your confirmation. The Named Secret definition is not widened.
48. **Models.** Sonnet for now, including the planning Crewmate. This replaces the design's Opus recommendation for planning.
49. **Worktree link risk accepted for the MVP.** A Crewmate could edit the small file that links a worktree to its git store and point it elsewhere. Accepted now, to be fixed when we can. Goes on the Later list.
50. **Egress in the Quarterdeck.** The Base egress allowlist mechanism applies there too.

Added to Later:

- **Protect the worktree's link file** from being redirected by a Crewmate (decision 49).

## Round 8: after the MVP (2026-11-14)

This round plans what follows the MVP. Nothing here changes the MVP's tickets.

Decided:

51. **Hardening first.** The custom socket proxy and the worktree link fix (decision 49) are the first feature after the MVP, ahead of new capability.
52. **Git gate covers git and the GitHub API**, with a per-repo allow list, so no agent container holds a GitHub token. It also carries the skills token and MCP server tokens, which ends the compromise in ticket 20. Second feature.
53. **No cap on projects running at once.** You manage the load yourself. Two specs in parallel on one project stays later.
54. **Restart, pause and resume are one mechanism**: continue from the first ticket without a commit. Comes right after several projects.
55. **Pi is not deferred until a quota problem.** You run more than one subscription and want Pi in from the start. Replaces the Later entry's timing. Exact place in the order: open.
56. **A project does not have to use Spec Runs.** A project is a container with the skills you picked for it. You choose per piece of work between three ways of using it: a Spec Run through the mates; connecting to the container directly with no Quarterdeck involved (decision 45); or a Herdr session on it where you manage the agents yourself. Non-coding work (school materials, content) is such a project in a light container.
57. **Skill library in the Quarterdeck.** You pick skills, your own or downloaded, and attach them per project so each project gets only what it needs. How this relates to Presets and Agent Extensions: open.
58. **Backup** is planned later. **Rootless Docker** is last, together with the uid-1000 limit.
59. **Pi comes after the MVP is done**, as the next feature. It is for Codex (ChatGPT subscription) agents for now, and it is not limited to Crewmates: any role may run on it.
60. **The skill library is a folder in the work root**, reachable from inside the Quarterdeck. It is not the same thing as the Presets in this repo. Layout, how skills are attached, and who may write to it: open.
61. **One clone per project.** Crewmates work in worktrees of it and the main folder stays free for you. Merges are resolved when they come up. This rejects the two-clone proposal.
62. **A project without Spec Runs has no Second Mate.** Creating a project is a folder, a container and its skills. A Second Mate appears on the first Spec Run. To be adjusted as we learn.

Facts read from the FirstMate source at `427056c` for decision 61:

- `bin/fm-home-seed.sh` `clone_project` accepts a folder that already exists at `<home>/projects/<name>` when it is a git repo whose origin matches. So one clone is possible without editing the fork.
- `bin/fm-fleet-sync.sh` acts on that clone's main folder: it fetches, fast-forwards the default branch, deletes local branches that are already merged, and can check out the default branch when the folder is clean and its branch is merged. It checks for uncommitted changes first.
- FirstMate lists `codex`, `pi` and `omp` among its harness adapters, and passes Pi a Codex effort setting.
63. **One Herdr, one container per project.** A command (working name `qd-open <project>`) opens a Herdr workspace in the Quarterdeck whose panes run inside that project's container. No Herdr in project containers. The same container serves Spec Runs, your own Herdr session and a direct connection. `/workspace` is your main folder and Spec Run worktrees are mounted beside it. This closes decision 46.
64. **Pi login storage is not decided.** You want more research first.
65. **The library is not a folder of checkouts.** You do not want to download every skill, track it and pull its updates. What a library entry is: open.

Still unanswered from this round: whether FirstMate's sync may act on your main folder; whether the library is skills only; who may write to the library.
66. **The skill library is withdrawn** (decisions 57, 60 and 65). You will work the idea out before it comes back. Its open questions are dropped with it.
67. **Direction for the Quarterdeck: like Rex from the first video, with the First Mate as the main orchestrator.** What that adds beyond the MVP: open.

## After the MVP: features taken from `helm-architecture.html` (Draft 2), 2026-11-14

Each item is in the architecture page and not in the MVP. "Helm" on the page is the Quarterdeck.

Security
- A1 **Git gate.** Its own container. Holds the GitHub token, allows listed repos and never `main`, adds the token to outgoing git traffic. After it, no agent can read the GitHub token (MVP: Quarterdeck panes hold it).
- A2 **MCP server tokens through the gate** for HTTP servers; by name otherwise.
- A3 **Socket proxy rules.** Only labelled containers and only mounts under the work root (MVP: an endpoint allow list only).
- A4 **Rootless Docker**, with the page's six steps and five checks. Last.

Agents and scale
- A5 **Pi as an agent** in project containers, with its provider on the Egress Allowlist. Next after the MVP (decision 59).
- A6 **OMP as an agent**, same shape.
- A7 **Pi and OMP logins**: one login volume per container; open whether a new container is seeded from the Quarterdeck's login. Needs research (decision 64).
- A8 **Several projects at once**, one Second Mate each, each with its own home and its own egress list. No cap (decision 53).
- A9 **Two specs at once on one project**, each in its own worktree, possibly on different agents.
- A10 **Restart.** Sessions end when the Quarterdeck restarts and are resumed from the mates' state on disk (decision 54 joins this with pause and resume).

The Quarterdeck as your own workplace
- A11 **The Quarterdeck's own folder** in the work root (`helm/` on the page): school, writing, other work. It reads and writes inside the work root and uses skills for non-project work. No yolo.
- A12 **All your skills in the Quarterdeck** (MVP: its extension list is empty).
- A13 **Agent memory and session history kept in the work root**, one folder per container (`memory/<container>/`), so it is backed up.

Workflow
- A14 **Review gate.** Open on the page: a code review after each ticket, or once per spec before the PR (MVP: the ticket's own Crewmate reviews; passing checks open the PR).
- A15 **GitHub Issues as the tracker.** The mate fetches the issue in the Quarterdeck, so project containers still need no token.
- A16 **Backup** of the work root: tool, target, what it skips. Planned later (decision 58).

Added by the grilling, not on the page
- B1 Worktree link fix (decision 49). B2 Pause and resume (43, 54). B3 Using a project without the mates: a direct connection, or your own Herdr session through `qd-open` (56, 63). B4 Ideas held in the First Mate's backlog (27). B5 Notifications when a report waits. B6 Quota-aware model rules. B7 Moving existing projects into the work root. B8 The uid-1000 limit. B9 Skill library (withdrawn, decision 66).

## Round 9: what the workplace is for (2026-11-14)

Context you gave: you are a security researcher (manual and AI audits), a freelance developer, you run a shop selling physical products, and you teach. Around these you do marketing, research, SEO, content and sales. Pains, in your order: babysitting agents is what kills your capacity; keeping track of everything across areas is second. You also work in the workplace yourself, and nothing should be installed on the host.

Decided:

68. **Every area of work is a project with its own container**: each client, each audit, the shop, teaching, marketing. Full isolation between them. This makes decision 56 the centre of the design, not a side feature.
69. **The Quarterdeck is the control room only.** Non-code work is not done inside it. This replaces architecture item A11 (the Quarterdeck's own folder for school and writing) and round-1 questions about a `desk/` folder and own-work tabs.
70. **Agents do not act in outside systems for now.** They prepare work and you publish it. When you allow one, its tool and credential go into that project's container only, never the Quarterdeck.

Open: how the First Mate hands non-code work to a project (FirstMate's unit is a branch in a git repo, and a Second Mate refuses a project with no remote); how tracking across areas works; where this sits in the order relative to Pi.
71. **What babysitting is:** mostly quality (the agent says done and you have to check and send it back) and questions (it stops because it is unsure what you meant). The answer is the Spec Run's pattern everywhere: decide up front, then a fixed check the agent must pass before it reports.
72. **Project is widened** to one area of work with its own folder and container, with or without code or a GitHub repo. In `CONTEXT.md`.
73. **A non-code Project is a git repo with no remote.** The First Mate manages it directly, with no Second Mate. Each piece of handed-off work is a branch you read, then accept or send back. No change to FirstMate.
74. **Errand** is the name for handed-off work without a Spec. In `CONTEXT.md`. Every Project has two ways to delegate: a Spec Run for development, an Errand for everything else.
75. **Organising is one list** across all Projects in the First Mate's backlog: Ideas, work in progress, work waiting for your decision, plus a summary when you ask. Deadlines, lessons and orders stay in the tools you already use.
76. **Order after the MVP:** Errands with a light container; then Pi; then the hardening pair; then the Git gate. This replaces the order in decisions 51, 52 and 59.

## Round 10: Errands (2026-11-14)

77. **No agent reviews an Errand.** You check most results yourself. Any verification step is defined per Project, because each has its own rules for what good means; a Project may have none. This rejects the proposed built-in review by a second agent.
78. **Questions come before the work.** An Errand starts with a short grilling by the First Mate so the Brief is complete. A Crewmate that meets something undecided stops and puts the question on your list; it never guesses.
79. **Accept or send back through the First Mate.** Accept merges the Errand's branch into the Project's main folder. Send back, with your comment, continues on the same branch with a fresh Crewmate. You run no git for non-code work.
80. **Images are chosen per Project.** The first light image holds Markdown tooling only and exists to test Errands. When a Project needs more, you build its image and ask the First Mate to set the Project up on it.
81. **You create a Project by asking the First Mate**, which runs the existing `/dev-container` onboarding from the Quarterdeck.
82. **Every Project image is a Variant in this repo**, the Markdown one included, so each keeps Base's Egress Allowlist and hardening.
83. **An Errand on a Project with a GitHub repo ends in a pull request**, opened from the Quarterdeck. You merge it yourself. On a Project with no remote, accept is a local merge. The First Mate never merges into a GitHub `main`.
84. **Several Errands may run at once in one Project**, each on its own branch and working folder, with no limit.

The Errands feature has no open branch left. Not yet grilled from the post-MVP list: Pi (login storage needs research, decision 64), the hardening pair, the Git gate, several Projects with restart and resume, project containers' memory in the work root, skills in the Quarterdeck, the review gate for Spec Runs, GitHub Issues, backup, rootless Docker.

## Round 11: Pi (2026-11-14)

Facts read from the Pi docs and source (pi-mono checkout of 2026-11-13) and the FirstMate source at `427056c`:

- Pi does not ask for approval before tool calls and has no built-in sandbox (`docs/security.md`). Its docs tell you to isolate it in a container.
- Pi keeps everything in one agent folder, `~/.pi/agent` by default, moved with `PI_CODING_AGENT_DIR`: `auth.json` (API keys and subscription logins), settings, extensions and sessions. Its docs warn that mounting that folder exposes all of them.
- A subscription login is made with `/login`; on a machine without a browser you paste the redirect URL back. Only API keys can come from environment variables. `auth.json` is written under a file lock (`src/core/auth-storage.ts`).
- FirstMate lists `pi` as verified for Crewmate and Second Mate launches, and supervises it through an extension, not screen reading.
- Your host already runs Pi 1.5.2 with a login in `~/.pi/agent/auth.json` (not read).

More facts, from the OMP docs (oh-my-pi checkout `5de4b03`, 2026-11-13):

- OMP is a fork of Pi with far more built in (31 tools, language-server and debugger support, memory, hooks, a Rust core). It installs as a prebuilt binary from the vendor's build server, or from npm with bun.
- It has approval modes: `always-ask`, `always-ask-cached`, `write` (asks only before running commands), and `yolo` (the default).
- `omp auth-broker serve` holds the logins and does the refreshes; clients get access tokens and never the refresh token. `omp auth-gateway serve` is a forward proxy that adds the credential itself, so a client holds no provider login. Both need a bearer token and a network path.
- FirstMate lists `omp` as verified for Crewmate and Second Mate launches.
- Not verified: whether a ChatGPT subscription works through the gateway.

Decided:

85. **OMP, not Pi.** Pi is too raw for you. This replaces decision 59 and every "Pi" in the order. The Pi questions of this round are dropped and re-asked for OMP.
86. **OMP is not next after the MVP.** Other features come before it. Its exact place: open.
87. **OMP is deferred as a whole.** Nothing about it is settled beyond decision 85. One leaning recorded, not a decision: you would allow OMP's yolo mode for now. Open when it returns: its place in the order, the login behind the gateway, which roles use it, the default agent per Project, whether it goes in Base, and removing Pi from the host.

## Round 12: what blocks the MVP (2026-11-14)

State read from the branch: tickets 01 to 06, 10 and 19 are done. 07 to 09 and 11 to 18 have code but are open. Seven review tickets sit in `.scratch/quarterdeck-security-review/issues/`. Decisions are recorded for implementers in ticket 21; the code is tickets 22 and 23.

88. **FirstMate ships with its full history** in the image, at the pinned commit. The shallow fetch made FirstMate's lineage guard refuse every dispatch. Ticket 22.
89. **`quarterdeck start` gets an option that launches no agent.** Ticket 13 needs it. Ticket 23.
90. **The skills token in the project container's `/etc/environment` is accepted until the Git gate.** The "no file" requirement is narrowed to files outside that container.
91. **SC-19 is narrowed**: an outside `docker exec` shell gets no token variables. That it can read the mounted secrets file is accepted.
92. **Devcontainer Features are accepted for the MVP**, on the rule that the Quarterdeck only starts Projects whose `main` you control. Other repositories wait for the custom socket proxy.
93. **Credentials in a clone's git configuration**: accepted for the MVP; a refusing check joins the hardening feature.
94. **The publish session reading Crewmate-written files, and worktree git redirection**: accepted for the MVP, limited by a GitHub token scoped to one repository; fixed by the hardening pair and the Git gate.

2026-11-14: the Errands summary was confirmed with the corrected order (MVP, Errands, hardening pair, Git gate; OMP unplaced). The Errands spec draft is `.scratch/errands/spec.md`. It covers Claude Code only and includes a Markdown test Project you can try by hand.

2026-11-14: the Errands spec and design (`.scratch/errands/spec.md`, `.scratch/errands/design.md`) are approved. Design choices you confirmed: the Markdown Variant is built locally and not published; a Project with no remote gets its container from a recorded configuration, not from its `main`; the shared signal folder across the First Mate's Projects is an accepted risk.

## Round 13: findings from the manual runs (2026-11-17)

Decided by the user during tasks B and C of `your-tasks.md`.

95. **A repository's default branch may be `main` or `master`.** Wherever the spec, the design and decision 92 say "`main`", read "the repository's default branch, as origin reports it". The trust rule is unchanged. Ticket 24.
96. **The launcher also trusts the Project clone's root** (`<home>/projects/<project>`), besides the exact worktree, because Claude checks trust on a worktree's main repository. This widens ticket 09's rule by that one path. Ticket 25.
97. **A Crewmate's question is answered to that Crewmate.** This amends decision 43 for questions only. After the user answers, the Second Mate sends the answer to the Crewmate that asked, if it is still running. If it has exited, the same record is relaunched in the same worktree and branch with the answer as its note. The answer never starts a new Spec Run. A failed ticket still ends the run after its one retry. Ticket 28.
98. **Planning stays with a Crewmate** in the project container (decision 39 confirmed). The mates never write a project's files, and the project's planning skills exist only in its container.
99. **Mates read the Quarterdeck's own skill files without a permission prompt.** Ticket 27.
