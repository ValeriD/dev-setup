# 05: Stops, send back, and several Errands at once

**Status:** done
**Model:** Sonnet
**Design slice:** 4 (Errand loop), second half

Terms such as Project, Errand, Crewmate, First Mate, Second Mate, Brief, Variant, Template, Preset and Spec Run are defined in `CONTEXT.md`. Spec: `.scratch/errands/spec.md` (scenarios are cited as `SC-NN`). Design: `.scratch/errands/design.md`.

## What to build

The paths around the happy one, again with the stub Crewmate and FirstMate's real commands: an Errand that stops on an undecided point and continues after an answer, a Crewmate that dies, an Errand sent back with a comment, and Errands running side by side.

## Acceptance criteria

- [x] A stub that ends with a `needs-decision` line leaves no landed result and no change to `main`; the question is readable from FirstMate's record. A relaunch with the answer in its note continues in the same worktree and branch (SC-08).
- [x] A stub killed mid-run leaves the branch as it was and nothing landed, and the state FirstMate reports lets a mate say so (SC-09).
- [x] A relaunch with a comment in its note starts a new session in the same worktree and branch, which sees the earlier commit and the comment, and reports again (SC-14).
- [x] Two records dispatched in one Project run at the same time on separate branches and worktrees in the same container, and each reports on its own (SC-16).
- [x] A record on a `main` that moved since dispatch can be brought up to date by a relaunch whose note asks for a rebase, after which the accept of ticket 04 succeeds.
- [x] `npm run test:errands` passes.

## Technical context

**Design:** `.scratch/errands/design.md`, "Flow: an Errand on a Project with no remote" step 5; "Risks accepted in this design" (fast-forward only); Validation plan rows for SC-08, SC-09, SC-14, SC-16.

- **Modules:** FirstMate owns relaunch and state. Nothing new is added to the Quarterdeck tools by this ticket.
- **Implementation anchors:** The failure variant of `testTicketLoop` in `tests/quarterdeck.test.mjs`; FirstMate `bin/fm-control.sh relaunch --note`; the MVP's `needs-decision` convention in `quarterdeck/skills/qd-spec-run/`.
- **Reuse:** `fm-control.sh relaunch --note` for send back, for the answer to a question and for the rebase; the stub Crewmate's existing failure modes.
- **Dependency direction:** Unchanged from ticket 04.
- **Must not introduce:** An automatic retry (the spec's Further Notes rule it out for Errands), a queue or limit on concurrent Errands.
- **Validation seam:** As ticket 04.
- **Coverage:** SC-08, SC-09, SC-14, SC-16. SC-18 (an Errand beside a Spec Run in one Project) belongs to ticket 09, because both only share a container on a Project with a Second Mate.

## Rules for whoever implements this

- **Tests.** Run only the commands this ticket names. The full acceptance suite (`npm test`, or any glob over all files in `tests/`) is never run by an agent, not while building, not before committing and not in review.
- **No real agent session, no GitHub contact, no secrets.** Use the stub Crewmate fixture, a local bare origin, a stub `gh` and dummy token values. Never read a token file.
- **The FirstMate fork is never edited** (ADR 0008). If something FirstMate is assumed to do proves false, stop at the furthest sound point, leave this ticket open with a comment saying what was seen, and report. Do not patch and do not redesign.
- **Docker.** Act only on containers, volumes and images this work creates and labels. Never any `prune`.

## Blocked by

- 04: An Errand runs and is accepted, with a stub Crewmate

## Comments

### Resolution (Sonnet agent): partly built, ticket stays open

Built in the commit "errands 05: stops, send back and several Errands at once". The stub (`tests/fixtures/errands-crewmate/claude.mjs`) now reads the latest Progress note of a relaunch and has Brief-driven modes: `Errand question:` (ends with a `needs-decision` line, no commit, half-done file kept), `Errand hang:` (never reports, for the kill), `Errand gate:` (waits for a file, so two Errands can be shown running at once), and relaunch notes `Answer:`, `Comment:` and `Rebase onto main`. It draws an empty composer so FirstMate's relaunch can end it. The ticket-04 test's setup moved into `errandFixture` (no behaviour change). One new test in `tests/errands.test.mjs` covers SC-08, SC-09, SC-14 and SC-16 through FirstMate's real `fm-control.sh relaunch --note`, `fm-send.sh`, `fm-crew-state.sh` and `fm-merge-local.sh`. `npm run test:errands` 10/10 green; cleanup clean.

Ticked: SC-08, SC-09, SC-14 (new session, same worktree and branch, sees the earlier commit and the comment, reports again), SC-16 (two Errands up at once in one container, separate worktrees and branches, own reports) and `test:errands`.

NOT satisfied, left unticked: "a relaunch whose note asks for a rebase ... after which the accept of ticket 04 succeeds". The relaunch and the rebase work (branch sits on the moved `main`), but `fm-merge-local.sh` then refuses: "branch fm/<id> differs from the recorded local done head". FirstMate latches the first observed done head as `local_done_head` (documented in `fm-dod-lib.sh`: "Observing done again never changes that identity. Revised work needs a new task/approval record"). So any head change after the first observed `done` (a rebase, and equally a send-back that adds a commit) cannot be accepted through FirstMate's merge. The test records this as observed behaviour (nothing lands, `main` unmoved). Nothing was patched (ADR 0008). The design and tickets 07 and 09 must decide: a new FirstMate record for revised work (new task id on the same branch), or an unlatch FirstMate does not offer. This also bears on SC-14 followed by an accept.

Other findings:
- A dead Crewmate: `fm-crew-state.sh` keeps reading `working · harness busy (fm-spawn)` (the unadvanced busy seed, up to an hour). What FirstMate reports that lets a mate say the Crewmate died is `fm-send.sh`'s notice "doorbell not typed because the agent in <pane> has exited" (as the Spec Run question path already uses). The skill (ticket 07) should use that, not `fm-crew-state.sh`, to detect death.
- `fm-merge-local.sh` with a `needs-decision` record or a dead Crewmate exits non-zero and moves nothing.

Not checked: `test:quarterdeck`, `test:skill`, pins and Renovate tests (no production file changed).

Review: reviewer agents not spawned; careful self-review against the design and spec. Findings: none requiring change. The test's finding assertions would need updating if the latch question is resolved.

### Resolution, second part (Sonnet agent): revised work is a follow-up Errand

The user decided (recorded in `design.md`, "Decision 2026-11-19: revised work is a follow-up Errand"): a send-back that adds commits after done, or a rebase onto a moved `main`, never re-lands the old FirstMate task, because of FirstMate's head latch (`bin/fm-dod-lib.sh`, `bin/fm-merge-local.sh` header; fork unchanged, ADR 0008). It becomes a follow-up Errand with a new task id and a branch from today's `main`; its Brief names the old branch and its Crewmate brings those commits over and adds the revision; it lands through `fm-merge-local.sh`. A send-back before the first done stays a relaunch.

Under that decision the rebase criterion is satisfied: the test (`tests/errands.test.mjs`, the ticket 05 test) keeps the SC-14 relaunch, asserts the old task's merge is refused ("differs from the recorded local done head"), dispatches a follow-up Errand on the moved `main` (the stub's new `Errand follow-up:` mode cherry-picks the old branch's commits), and asserts: its branch starts from today's `main` and holds the old commits plus the revision; `main` does not move until the accept; the accept fast-forwards `main` once, to the follow-up's head; the old branch's tip is not in `main` and its merge stays refused. The stub's `Rebase onto main` mode was removed. `npm run test:errands` 10/10; cleanup clean.

Ticket 07 (`qd-errand`) must: choose between `fm-control.sh relaunch --note` (no observed done yet: answer, send-back before done) and a follow-up Errand (after an observed done: send-back with commits, or a moved `main`); write the follow-up's Brief to name the old branch (`fm/<old-id>`) and tell the Crewmate to bring its commits over (cherry-pick or merge) onto the new branch from today's `main`; close the old task without calling its merge; and tell the user the landing is the new task's. Detect a dead Crewmate with `fm-send.sh`'s "has exited" notice, not `fm-crew-state.sh`.
