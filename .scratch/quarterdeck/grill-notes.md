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
