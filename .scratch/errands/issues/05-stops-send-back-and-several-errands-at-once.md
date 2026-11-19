# 05: Stops, send back, and several Errands at once

**Status:** ready-for-agent
**Model:** Sonnet
**Design slice:** 4 (Errand loop), second half

Terms such as Project, Errand, Crewmate, First Mate, Second Mate, Brief, Variant, Template, Preset and Spec Run are defined in `CONTEXT.md`. Spec: `.scratch/errands/spec.md` (scenarios are cited as `SC-NN`). Design: `.scratch/errands/design.md`.

## What to build

The paths around the happy one, again with the stub Crewmate and FirstMate's real commands: an Errand that stops on an undecided point and continues after an answer, a Crewmate that dies, an Errand sent back with a comment, and Errands running side by side.

## Acceptance criteria

- [ ] A stub that ends with a `needs-decision` line leaves no landed result and no change to `main`; the question is readable from FirstMate's record. A relaunch with the answer in its note continues in the same worktree and branch (SC-08).
- [ ] A stub killed mid-run leaves the branch as it was and nothing landed, and the state FirstMate reports lets a mate say so (SC-09).
- [ ] A relaunch with a comment in its note starts a new session in the same worktree and branch, which sees the earlier commit and the comment, and reports again (SC-14).
- [ ] Two records dispatched in one Project run at the same time on separate branches and worktrees in the same container, and each reports on its own (SC-16).
- [ ] A record on a `main` that moved since dispatch can be brought up to date by a relaunch whose note asks for a rebase, after which the accept of ticket 04 succeeds.
- [ ] `npm run test:errands` passes.

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
