# 11: The ticket loop runs plan, ticket 1, ticket 2 with a stub Crewmate

**Status:** ready-for-agent
**Model:** Sonnet
**Design slice:** 5 (Ticket loop)

## What to build

A token-free run of the real FirstMate loop in the Quarterdeck, with a stub standing in for Claude, that proves the per-ticket mechanics end to end before any real model is involved: a Second Mate home, a project container, one FirstMate record for the Spec Run, a planning session, one relaunch per ticket, the model chosen by the dispatch rule, one retry for a failing ticket, and a stop with no further relaunch. A test script plays the Second Mate, following `qd-spec-run`'s steps 2 to 8.

## Acceptance criteria

- [ ] A test image derived from the node image replaces `claude` with a script that reads the latest `## Progress note` in the Brief, makes the planned commit or the ticket commit (or fails on a marked ticket), and appends the status line (`done [at=...]: ...` or `failed [at=...]: ...`).
- [ ] The run on a fixture project with a local bare origin goes plan -> ticket 1 -> ticket 2 using FirstMate's own `fm-brief.sh`, `fm-spawn.sh`, `fm-control.sh relaunch` with `FM_HOME` set, and no FirstMate file edited. The branch is `<prefix><slug>`; it has one plan commit and then exactly one commit per ticket in ticket order, on top of `origin/main`; no other branches; no push happened (SC-03, SC-04, SC-13).
- [ ] Each session is a new one in the same worktree (same path in `launch.log`, no resume argument), and ticket 2 sees ticket 1's commit (SC-05).
- [ ] `launch.log` shows the model of each session: the dispatch rule's Opus for a ticket marked as about skills, prompts or agent tools, Sonnet for another (SC-06, launch half).
- [ ] The ticket check of step 7 is applied by the test script: a `done` naming build, lint and test, one new commit since the start commit, clean `git status --porcelain`; a `done` missing a gate result fails the check.
- [ ] Between tickets `fm-crew-state.sh` reports "blocked: named head ... unreachable"; the test records it and the run continues (SC-14).
- [ ] A ticket marked to fail gets exactly one relaunch with the `Retry of ticket NN` note; the stub saves the failed attempt as `refs/quarterdeck/failed/NN-1` and resets to the start sha; after a second failure no further relaunch happens and nothing is pushed (SC-11, SC-13, token-free half).
- [ ] `quarterdeck/CHECKLIST.md` gains rows for the real-agent half of this slice: whether FirstMate's own machinery (not the model) escalates the interim blocked state to the First Mate, and what `working [key=<slug>]` for interim tickets does. No FirstMate patch is made here (ADR 0008); a needed patch is reported to the user instead.

## Technical context

**Design:** `.scratch/quarterdeck/design.md`, "Spec Run procedure" (steps 2 to 8, "Resolved items" and the closing paragraph about interim blocked), "Validation plan" (stub-Crewmate row). The spike's phase 1 is the model.

- **Modules:** `tests/quarterdeck.test.mjs` plus a stub-Crewmate image definition in `tests/fixtures/` (name free), the launcher (ticket 09), `qd-project-up` (ticket 07), the skill text (ticket 10). If the run shows the skill text is wrong or incomplete, correct it in the same change and say so in a comment on this file.
- **Implementation anchors:** `spike/FINDINGS.md` "Link 1" and "Link 3" (commands and what fights this use: `fm-control.sh` needs an explicit `FM_HOME`; `relaunch` requires `--note`; notes pile up in `brief.md`), `tests/acceptance.test.mjs` and `tests/lib.mjs` for fixtures and cleanup.
- **Reuse:** the real FirstMate commands at the pin; the node image built in the run.
- **Dependency direction:** test -> FirstMate commands -> launcher -> `docker exec` -> project container (stub Claude).
- **Must not introduce:** a wrapper over `fm-*`, a checker script in the product code (the check lives in the test and in the skill text), per-ticket mounts, publish (ticket 12), pause and resume.
- **Validation seam:** `tests/quarterdeck.test.mjs` through `npm test`; Docker, Herdr and FirstMate are real, Claude is the stub.
- **Coverage:** owns the token-free halves of SC-03, SC-04, SC-05, SC-06, SC-11, SC-13, SC-14 and the "stub-Crewmate run" row of the Validation plan up to (not including) publish.

## Blocked by

- 05: The First Mate's home is seeded and its tab opens on start
- 07: `qd-project-up` creates the project container from the project's main branch
- 09: The `claude` launcher runs a Crewmate in the project container with the right environment
- 10: Mate skills, Charter and Brief conventions
