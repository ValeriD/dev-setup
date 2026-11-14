Status: draft

# Spec: Quarterdeck MVP — run a Spec on a Consuming Project and leave

Terms such as Quarterdeck, First Mate, Second Mate, Crewmate, Spec, Spec Run, Brief, Charter, Scout, Idea, Consuming Project, Variant, Base, Template, Named Secret and Egress Allowlist are defined in `CONTEXT.md`. This spec uses them as defined there.

Sources: `.scratch/quarterdeck/grill-notes.md` (decisions are cited as "D<number>") and `.scratch/quarterdeck/spike/FINDINGS.md`. Where this spec says "unproven", the spike did not run it.

## Problem Statement

I work alone, on one laptop, on several small projects. My best thinking happens in a grilling: I decide what a feature must do, and the Spec and its tickets follow from that. Turning those tickets into commits and a pull request is mechanical, but today I still sit through it. I start an agent per ticket, watch for prompts, copy results between sessions, and push the branch myself.

I want to make the decisions in the grilling and then leave. When I come back, I want one report and a pull request, not a pile of half-finished sessions.

I also do not want to give up the hardening this repository exists for. The agents that write code must run inside the project's hardened container, not on my host.

## Solution

The Quarterdeck: one long-lived container I start with one command and work from. Inside it, Herdr (the session manager) shows the First Mate, one Second Mate per active project, and their Crewmates.

For the MVP the input is a Spec and its tickets for a Consuming Project (pomoplan). I tell the First Mate to run it. It hands the Spec Run to that project's Second Mate. The Second Mate gets each ticket implemented by a fresh Crewmate inside the project's container. Each ticket becomes one commit on one branch. When tests pass, a Crewmate in the Quarterdeck pushes the branch and opens the pull request. I get one report. I touch nothing in between.

Everything else in the larger design (planning inside the Quarterdeck, Ideas through grilling, a Git gate, more than one project, and so on) is later. See Out of Scope.

## User Stories

1. As the only user, I want to start the whole system with one host command, so that I do not manage containers by hand.
2. As the only user, I want to tell the First Mate "run this Spec on pomoplan" and then walk away, so that I spend my time on decisions, not on dispatching.
3. As the only user, I want each ticket implemented by a fresh Crewmate in the project's own container, so that code is written and tested where the project's hardening and toolchain are.
4. As the only user, I want one commit per ticket on a single branch named `feat/…`, `fix/…` or `chore/…`, so that the pull request reads as one reviewable history.
5. As the only user, I want the push and the pull request to be done from the Quarterdeck, so that the project container never holds a GitHub credential.
6. As the only user, I want the Spec Run to retry a failing ticket once with a fresh Crewmate and then stop with a report, so that a bad ticket never burns hours or damages later tickets.
7. As the only user, I want the Spec Run to pause when a ticket raises a question the Spec and design do not answer, so that nobody guesses on my behalf.
8. As the only user, I want to find out that a report is waiting from Herdr's attention mark on the First Mate's tab, so that I need no extra notification setup in the MVP.
9. As the only user, I want my working files, tickets and clones to live in a plain host folder, so that I can back them up with ordinary tools.
10. As the only user, I want an Idea I mention to be kept on hold with the First Mate, tagged with its project, and never started until I grill it, so that thoughts are not lost and nothing runs unasked.
11. As the only user, I want credentials to be passed by name and readable only by the processes that need them, so that no secret lands in a repository, an image or the project container.
12. As the only user, I want the cost-sensitive model choice to follow simple rules, so that I do not pick models per ticket.

## Known Technical Constraints

Already decided. This section does not design anything new.

- **Shape (D4, D30).** One Quarterdeck container, built on Base, not a Variant. It holds Herdr, the First Mate and one Second Mate per active project. Each Consuming Project has its own container. Mates run in the Quarterdeck; coding Crewmates run in the project's container.
- **One Crewmate per ticket (D5, D20).** A Spec Run is one unit of work with one branch and one working copy. The Second Mate starts a fresh Crewmate session for each ticket, one after another, in that same working copy. There are no ticket branches and no per-ticket pull requests. There is no sub-agent loop inside one Crewmate.
- **Upstream tool (D18).** The mates and Crewmates are driven by FirstMate, through the fork `ValeriD/firstmate`. The Quarterdeck image pins an exact commit. The MVP edits no upstream file. Updates happen on my schedule after I read the diff. The spike used commit `427056c`.
- **Branch names (D20).** The branch is `feat/<spec>`, `fix/<spec>` or `chore/<spec>`.
- **Work root (D7).** `/home/valeri/work`, a plain host folder. The Second Mate's own fresh clone of the project is the working copy. Existing checkouts of the project stay untouched. Project path inside the project container stays `/workspace` with a link from the host-style path (D13).
- **Test project (D8).** pomoplan.
- **Tickets (D12, D24).** Tickets stay as files under `.scratch/` in the project. GitHub Issues as the tracker is later.
- **Starting it (D32).** One host command, `quarterdeck`, shipped in this repository. It starts the containers if they are not running and attaches to Herdr.
- **Docker access (D10).** The Quarterdeck reaches Docker through an off-the-shelf socket proxy that filters by API endpoint. It cannot restrict which host paths a new container mounts. Accepted risk, see Known Risks.
- **Anthropic traffic (D14).** Never proxied. Claude logs in with a long-lived token created by `claude setup-token`, passed by name.
- **Permission mode (D38, replacing the second half of D11).** One setting per home, shared by a mate and its Crewmates. Both use "auto" mode. Neither skips prompts altogether. The spike showed "auto" ran Crewmates with no prompt waiting.
- **Model rules (D19).** The First Mate uses Opus. Second Mates use Sonnet. A ticket about skills, prompts or agent tools uses Opus; every other ticket uses Sonnet. No quota-aware rules.
- **Failure rule (D28).** One retry with a fresh Crewmate, then stop and report. A question the Spec and design do not answer also pauses the run. The Second Mate never guesses and never skips ahead.
- **Review (D17).** Each ticket's Crewmate implements and reviews as it does today. No extra per-Spec review. Passing tests are enough to open the final pull request.
- **Project container access (D34).** Four things and nothing else from the Second Mate's home: the Spec Run's working copy (read and write); the clone's git store (read and write, with hooks and config read-only); FirstMate's scripts (read-only); that Second Mate's signal files (read and write). Committer name and email arrive as environment variables. Two rules hold: git in the Quarterdeck never runs hooks from a project folder (D31), and a project container is always created from the configuration on the project's main branch (D31). The spike proved commits work under these mounts, with the limits listed in Known Risks.
- **One home per project container (spike).** A project container serves one Second Mate's home. Only that Second Mate starts that project's Crewmates. The First Mate does not dispatch project Crewmates itself.
- **Terms (D25).** "Task" and "ship" (as a noun) stay out of our own docs. FirstMate's "Firstmate spec" section is called brief notes (D23).

## Acceptance Scenarios

Each scenario is stated from the outside. "Unproven" means the spike did not run it.

### Starting and watching

- **SC-01** (story 1). From a host terminal, `quarterdeck` starts the Quarterdeck if it is not running, then attaches me to Herdr. Running it again while it is running attaches without starting a second one. I do not run any other command to start the system. (The attach and no-duplicate behaviour are unproven; the spike used its own scripts.)
- **SC-02** (stories 2, 8). In Herdr I can see the First Mate's tab, the project's Second Mate in its own workspace, and each running Crewmate as a tab in that workspace. The tab for a Crewmate running inside the project container shows the Crewmate's real state (working, blocked, done), not "not found". When a report is waiting, the First Mate's tab carries Herdr's attention mark. (State detection through the project container was proven only when the launch command carried the hint that names Claude. The attention mark on the First Mate's tab was not run: the First Mate was not run as a session.)

### The Spec Run

- **SC-03** (stories 2, 3, 4). Given a Spec and two tickets for pomoplan, I say one sentence to the First Mate. It hands the Spec Run to pomoplan's Second Mate. The Second Mate has ticket 1 implemented by a Crewmate in the project container, then ticket 2 by a new Crewmate, in the same working copy. I send no further message.
- **SC-04** (story 4). The finished branch has exactly one commit per ticket, in ticket order, on top of the point the branch started from. The branch name starts with `feat/`, `fix/` or `chore/`. Each commit carries my committer name and email. There are no other branches and no per-ticket pull requests.
- **SC-05** (stories 3, 4). Each Crewmate session is new: it does not resume the previous one. Both sessions use the same working copy and the same branch. A ticket that depends on an earlier ticket sees that ticket's commit. (Proven in the spike with two tickets, one dependent.)
- **SC-06** (story 12). A ticket about skills, prompts or agent tools is implemented by an Opus Crewmate. Any other ticket is implemented by a Sonnet Crewmate. The First Mate runs on Opus and the Second Mate on Sonnet. (Opus for tickets was not tested; the spike used Sonnet only.)
- **SC-07** (stories 3, 5). The project's tests run inside the project container before the push. The push and the pull request happen only when they pass.

### Push, pull request, report

- **SC-08** (story 5). After the tests pass, a Crewmate running in the Quarterdeck pushes the branch to GitHub and opens a pull request against the project's default branch. The pull request lists the tickets that were implemented. Nothing in the project container performs the push. (Unproven: the spike's GitHub token could not reach the repository, so no clone, push or pull request was run against real GitHub, D37.)
- **SC-09** (stories 2, 8). When the Spec Run ends, I get one report: the pull request link, each ticket with its commit, and the test result. I did not have to answer any question to get here.
- **SC-10** (story 2). Between my one instruction and the report I am never asked to approve a tool call, answer a trust dialog, log in, or press a key in any session. (Proven for Crewmates and one Second Mate in the spike. Not proven for the First Mate as a Claude session or for a run from start to finish.)

### Failure paths

- **SC-11** (story 6). If a ticket's Crewmate fails (its tests fail, or it reports it cannot finish), the Second Mate starts one fresh Crewmate for the same ticket. If that one also fails, the Spec Run stops. No later ticket starts. No push and no pull request happens. I get a report that names the failed ticket, shows what was tried twice, and says what state the branch is in. (Unproven; the spike had no failing ticket.)
- **SC-12** (story 7). If a ticket needs a decision the Spec and design do not make, the Spec Run pauses and the report states the question. The Second Mate does not pick an answer and does not start the next ticket. (Unproven.)
- **SC-13** (story 6). A stopped or paused Spec Run leaves its commits so far in place. Nothing is pushed.
- **SC-14** (stories 5, 11). A Spec Run that has finished its commits but has not yet pushed is not treated as a failure. The mates do not stop it or report it as broken because the branch is not on GitHub yet. (The spike showed FirstMate reads this state as "blocked: head unreachable". See Open Questions.)

### What the project container can and cannot reach

- **SC-15** (story 11, D34). Inside the project container, a Crewmate can: read and write files in its working copy and make commits; read and write the clone's git store; read FirstMate's scripts; write to that Second Mate's signal files. It cannot: change git hooks or git config in the clone (a write fails as read-only); see the Second Mate's own instruction files, data folders or the clone's working files outside the working copy; see the Quarterdeck's credentials. (All proven in the spike except the final point against the real hardened image.)
- **SC-16** (story 11). The GitHub token is absent from the project container's environment and files. The container is created from the project's main-branch configuration. (The absence was proven in the spike. The main-branch rule is unproven.)
- **SC-17** (story 11). The project container is the hardened image from this repository, with the Egress Allowlist applied. (Unproven: the spike used a plain stand-in image, not the hardened Node Variant.)
- **SC-18** (story 11). Git in the Quarterdeck, run for the push and the pull request, does not execute hooks that live in the project's folders. (Unproven.)

### Credentials

- **SC-19** (story 11, D9, D14, D35). Two credentials exist for the MVP: a Claude token, and a GitHub token scoped to the pomoplan repository. Both are given by name from a file or variable outside this repository. Their values never appear in this repository, in an image, or in the project container's files. The Quarterdeck holds both. The project container receives the Claude token only (the spike's project container got the Claude token and no GitHub token). Processes started from Herdr in the Quarterdeck inherit the token variables; a plain `docker exec` shell does not. The host user's ability to read the mounted source file from that shell is accepted (ticket 21 decision 2); this is environment non-inheritance, not filesystem isolation. Mates and Crewmates running in the Quarterdeck can therefore read the GitHub token (accepted risk). How the tokens are delivered is open.

### Where things are kept

- **SC-20** (story 9, D7). Clones, worktrees, the mates' homes and their notes live under the work root on the host. Copying that one folder is enough to back up the work. Existing project checkouts outside it are not read or changed. No backup job is part of the MVP.
- **SC-21** (story 10, D24, D27). When I mention an Idea for a project to the First Mate, it is stored as a held item in the First Mate's backlog, tagged with the project. It is never started on its own, however long it waits and whatever capacity is free. It leaves the held state only through a grilling that I start. (Unproven; the spike did not run the backlog.)

## Out of Scope

From the "Later" list (each becomes its own feature when picked up), D3 and D16, and the spike:

- **Git gate.** A container that holds the GitHub token and adds it to outgoing git traffic, with repo and branch rules. Would remove the token from the Quarterdeck.
- **Custom socket proxy.** Only labelled containers, only mounts under the work root, no privileged containers. Closes the first accepted risk below. First hardening item.
- **Rootless Docker.**
- **Pi and OMP as Crewmates.** The MVP uses Claude only.
- **More than one project at a time.**
- **Two Specs in parallel on one project.**
- **Surviving a Quarterdeck restart.** Today sessions end and the Spec Run is restarted by hand.
- **Backup job** for the work root (tool, target, exclusions).
- **GitHub Issues as the tracker.**
- **MCP server tokens through the gate.**
- **Quota-aware model rules.**
- **Seeding logins** into new project containers.
- **Moving existing projects** into the work root.
- **Desktop or phone notifications** when a report is waiting.
- **Grilling and planning inside the Quarterdeck** (D16, D21, D22): the First Mate and Second Mate writing the Spec, design and tickets, and an opt-in hold for plan approval. The MVP starts from a finished Spec and tickets.
- **Ideas becoming work.** The MVP keeps Ideas (SC-21); turning one into a Spec is a grilling, outside this spec.
- **Scouts** and any investigation Crewmate in the MVP.
- **Crewmates that skip permission prompts altogether** (D38 replaced this).
- **Per-ticket narrowing of what the project container can reach** (one working copy, one signal file set) and hiding other homes' folders; Docker cannot add mounts to a running container.
- **Automatic merging** of the pull request. I review and merge it myself.

## Known Risks Accepted for the MVP

1. **The socket proxy cannot restrict mounts (D10).** A process in the Quarterdeck that can reach Docker could create a container that mounts any host path. The proxy filters by endpoint only. The custom proxy is the first hardening item.
2. **The GitHub token is readable by mates and Crewmates running in the Quarterdeck** (D9; spike finding: only Herdr-started processes hold the tokens, which includes every mate and every Crewmate that runs in the Quarterdeck). A prompt-injected mate could push to the pomoplan repository. The token is scoped to that repository to limit the damage. The Git gate removes it.
3. **A Crewmate can forge signals within its own project (D34, spike).** The project container sees the whole signal folder of its Second Mate's home, so a Crewmate can write "done" for another ticket's Crewmate or write into its steering inbox. It also sees every slot of the shared worktree pool. The damage stays within one project and one Second Mate.
4. **Writes through the project container reach the Quarterdeck.** The Crewmate writes in the clone's git store and in the working copy. Hooks and config are read-only, which blocks the first route. The Crewmate's tests and scripts still run with the Crewmate's rights inside the project container. (Hook and config blocking proven in the spike.)
5. **GitHub flow not spiked (D37).** Cloning from GitHub, the push and the pull request have not been run. The MVP build is where they are proven.
6. **The hardened image not spiked.** The project container in the spike was a plain image. First-run state, folder trust, and the Egress Allowlist's effect on Crewmates are unproven there.
7. **A Quarterdeck restart ends all sessions.** A Spec Run in progress is lost and restarted by hand. Commits already made stay on disk.
8. **"auto" permission mode is not "ask before everything".** It was accepted for the MVP (D38). It is weaker than prompting and stronger than skipping prompts.
9. **FirstMate is a fast-moving upstream (D18).** The pinned fork protects against surprise, but upgrades need a diff review.
10. **Not tested in the spike:** messages sent to a Crewmate behind the project container; a Herdr restart with such a Crewmate running; two Second Mates for one project; the watcher and away mode; the First Mate as a Claude session.

### Ticket 21 — explicit MVP security decisions (supersede older stronger wording)

These are risk acceptances, not evidence of isolation. Published ticket and review bodies remain historical; [ticket 21](issues/21-mvp-security-review-decisions.md) is authoritative.

11. **Extensions-token persistence (decision 1).** The read-only skills token may persist in the project container's `/etc/environment`, as it already reaches every process's environment and Docker inspect. It must not appear in rendered configuration, work-root exports, logs or image layers. The user-owned source file is intentional. [ADR 0010](../../docs/adr/0010-read-only-agent-extensions-token.md) records this narrowing; the **Git gate** removes the exposure.
12. **Outside-exec source-file access (decision 2).** SC-19 requires no inherited token variables in a plain Quarterdeck `docker exec` shell, not an unreadable secrets mount. The host user can already read that file on the host. The **Git gate** removes the repository token from the Quarterdeck; host-user access to the user's own source file is not a boundary the MVP promises to remove.
13. **Trusted main configuration (decision 3).** The Quarterdeck only starts Projects whose `main` branch the user controls. Features and retained configuration from that branch are trusted input, not proven mount/egress/credential isolation. Unsupported `runArgs` rejection remains. Repositories outside the user's control wait for the **custom socket proxy**, the planned hardening boundary; no blanket Features ban is introduced.
14. **Shared clone credentials (decision 4).** Credentials already stored in the clone's Git configuration remain readable through the required shared Git store, even with read-only config overlays. This is accepted, not proof of credential exclusion. A refusal check for credential-bearing clones belongs to the **post-MVP hardening feature**.
15. **Misled publication and redirected Git (decision 5).** Worktree content can influence the credential-bearing publish session; `--setting-sources user` does not prove instruction isolation. Worktree `.git` redirection can influence other Quarterdeck Git reads despite hooks/fsmonitor overrides and `qd-publish`'s explicit clone directory. Both fall under risk 2's misled-mate acceptance, limited by the repository-scoped token. The **hardening pair (custom socket proxy and worktree link fix)** and then the **Git gate** are the planned fixes (decisions 49, 51, 52); the Git gate removes the token and constrains repository/branch operations. See ADR 0009. No real-agent isolation observation is claimed.

## Open Questions

The sources leave these undecided. The design or the tickets need an answer.

1. **How do the Spec and tickets reach the Spec Run?** D12 and D16 say the spec branch is already pushed with spec, design and tickets on it. The spike showed that this branch collides with the branch the Spec Run creates under its own name (the Spec Run's branch is the prefix plus the Spec's name). D16 as revised after the spike offers two ways: put the Spec and tickets on `main`, or make them the first commit on the Spec Run's own branch. The sources do not choose. This matters for SC-04: if the first commit carries the Spec and tickets, "one commit per ticket" needs a clear statement that the branch also has that first commit.
2. **How are tokens delivered properly (D35)?** The spike's file was root-owned and Docker could not pass it directly; a root entrypoint loaded it. D35 also names a different file location than the spike used. The sources do not say who owns the token file, whether the Quarterdeck starts as root and drops privileges, or how the `quarterdeck` command finds the tokens. Also open: whether a token delivered this way satisfies "only Docker reads the file".
3. **Is the push step a relaunch that runs in the Quarterdeck, or something else?** D26 says a Crewmate in the Quarterdeck pushes and opens the PR. FirstMate's relaunch starts a replacement for an existing Crewmate in that Crewmate's own working copy. The sources do not say whether the push Crewmate is a relaunch (which the launcher would currently route into the project container, where there is no GitHub credential), a separate Crewmate, or another mechanism. D20 says FirstMate's PR mode tells the Crewmate itself to push and open the pull request; the spike's workaround was to edit the Brief to "commit and report done", which is an edit to a Brief and not to an upstream file. Whether that is allowed under "no edits to upstream files" (D18) is not stated.
4. **How is the "blocked until pushed" state handled (D20, spike)?** FirstMate shows the Spec Run as "blocked: head unreachable" until something pushes. The sources say a Second Mate "must learn to treat" it as expected. They do not say how that is taught (the Charter?) or how the First Mate and my report avoid showing it as a failure (SC-14).
5. **Where does the Spec Run's name come from, and which prefix is chosen?** D20 gives `feat/<spec>`, `fix/<spec>`, `chore/<spec>`. The sources do not say who picks the prefix or how the name derives from the Spec.
6. **What does "tests pass" mean for the final pull request (D17)?** Whose command runs the project's tests (each Crewmate, the Second Mate, a final Crewmate), and what happens if the tests pass per ticket but fail at the end. The sources only say passing tests are enough.
7. **What does the one report contain and who writes it?** D6 says one report. The sources do not say whether the Second Mate or the First Mate writes it, where I read it, or how a failure report differs.
8. **How do I see a question the Spec does not answer?** D28 says the run pauses. D29 says only the attention mark on the First Mate's tab is the MVP signal. The sources do not say how the question reaches me, or how I answer it and resume (after a pause the Second Mate must not guess).
9. **Mount set versus worktree commits (D31, D34).** D31 says the exact mount set is open; D34 decides it and the spike confirmed it. They agree, but the spike showed that narrowing to one ticket's folders is not possible with a running container (D34's "Known limit"). Whether the MVP wants the container recreated per Spec Run to narrow the set is not stated.
10. **Who creates the project container, and when?** The spike created it by hand from a Herdr pane. D32 says `quarterdeck` starts the containers "if needed". The sources do not say whether that includes each project's container, or whether the Second Mate does it (which would need Docker access for a mate).
11. **Which Herdr version?** FirstMate pins 0.7.4, below its own 0.8.0 floor for the presentation layout. The spike worked with the flat layout. Whether the MVP accepts that is not stated.
12. **The Egress Allowlist for Crewmates.** The sources do not say which destinations the project container's allowlist needs for a Crewmate to work (the Anthropic API at least), nor whether the existing hardening already allows them.
13. **How is each Claude first-run state provided in the hardened image?** The spike showed the project image must ship a completed-onboarding setting and the launcher must register folder trust for each working copy. Whether these belong in the Variant image, the Template, or the Quarterdeck is not stated.

## Further Notes

- **Words.** "Worker" is retired (D3). "Spec" is always the product document; FirstMate's build notes are brief notes (D23).
- **What exists today in this repository.** Base, the Node Variant, the Node Template, the extension installer and the `dev-container` host skill (see `ARCHITECTURE.md`). The Quarterdeck is built on Base but is not a Variant. The host skill onboards pomoplan onto its project container; the Quarterdeck does not replace it.
- **Candidate ADRs after the MVP (D36).** Mates live in the Quarterdeck; project containers hold no GitHub credential; FirstMate is a pinned fork with no upstream edits.
- **Order of proof.** The MVP build must prove the unproven parts in this order of risk: real GitHub clone, push and pull request; the hardened image as project container; the First Mate as a session; a failing ticket; a question pause.
