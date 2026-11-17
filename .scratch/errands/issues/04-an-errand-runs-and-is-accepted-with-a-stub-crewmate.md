# 04: An Errand runs and is accepted, with a stub Crewmate

**Status:** ready-for-agent
**Model:** Sonnet
**Design slice:** 4 (Errand loop), first half

Terms such as Project, Errand, Crewmate, First Mate, Second Mate, Brief, Variant, Template, Preset and Spec Run are defined in `CONTEXT.md`. Spec: `.scratch/errands/spec.md` (scenarios are cited as `SC-NN`). Design: `.scratch/errands/design.md`.

## What to build

The whole Errand path on a Project with no remote, driven by a test script with the stub Crewmate and FirstMate's real commands: the Project is registered as a local project, a Brief is written, a Crewmate is dispatched on its own branch into the Project's container, it commits and reports, the result is held, and the accept lands it on `main` through FirstMate's own merge. This is the first time FirstMate's local-project support runs here; the design relies on it as read from the source, not as run.

## Acceptance criteria

- [ ] A Project from ticket 02 is registered in the First Mate's home as `local-only` with yolo off, using FirstMate's own procedure, and a record is dispatched with `fm-brief.sh` and `fm-spawn.sh` from a normally seeded home.
- [ ] The stub Crewmate's process runs inside the Project's container, on a new branch in a pool worktree based on the Project's `main` (SC-05).
- [ ] While the Errand runs and after it reports, the files and checked-out branch of the Project's main folder are identical to before (SC-06).
- [ ] The Brief tells the Crewmate to follow `.quarterdeck/errand-check.md` when `main` has it. The stub's final line carries `check: passed`, `check: failed` or `check: none`; with the file present the check ran, with the file absent the line says `none` (SC-10, SC-11).
- [ ] A result reported with `check: failed` is not landed by the test script's accept step (SC-10).
- [ ] After the hold is released, `fm-merge-local.sh` fast-forwards `main` and the main folder shows the result (SC-12).
- [ ] With an uncommitted file in the main folder that the merge would overwrite, the accept is refused, the file is unchanged and `main` has not moved. With a `main` that moved after dispatch, the accept is refused the same way (SC-13).
- [ ] `npm run test:errands` passes.

## Technical context

**Design:** `.scratch/errands/design.md`, "Flow: an Errand on a Project with no remote" steps 1 to 4; "Existing shape" (FirstMate facts); "Reuse decisions"; "Risks accepted in this design".

- **Modules:** FirstMate owns the branch, worktree, session, hold and merge. The launcher and `qd-project-up` are used as they are after tickets 02 and 03. The test script stands in for the First Mate's skill, which is ticket 07.
- **Implementation anchors:** `tests/quarterdeck.test.mjs` `testTicketLoop` and `tests/fixtures/quarterdeck-crewmate/` (the pattern to reuse), FirstMate `bin/fm-merge-local.sh` (header), its `project-management` skill (local project creation and registration), `config/spawn-base-primary-checkout` in FirstMate's `docs/configuration.md`.
- **Reuse:** FirstMate's captain hold and `fm-merge-local.sh` for the landing; the MVP's stub Crewmate and helpers.
- **Dependency direction:** Test script -> FirstMate commands -> launcher -> `docker exec` -> Project container.
- **Must not introduce:** Our own merge, our own hold or approval record, retry logic, a review step, a wrapper around FirstMate's lifecycle.
- **Validation seam:** FirstMate's real commands in a real Quarterdeck, with the stub Crewmate in the Project's container.
- **Coverage:** SC-05, SC-06, SC-10, SC-11, SC-12, SC-13. Add manual rows to `quarterdeck/CHECKLIST.md` for anything only a real Claude can show.

## Rules for whoever implements this

- **Tests.** Run only the commands this ticket names. The full acceptance suite (`npm test`, or any glob over all files in `tests/`) is never run by an agent, not while building, not before committing and not in review.
- **No real agent session, no GitHub contact, no secrets.** Use the stub Crewmate fixture, a local bare origin, a stub `gh` and dummy token values. Never read a token file.
- **The FirstMate fork is never edited** (ADR 0008). If something FirstMate is assumed to do proves false, stop at the furthest sound point, leave this ticket open with a comment saying what was seen, and report. Do not patch and do not redesign.
- **Docker.** Act only on containers, volumes and images this work creates and labels. Never any `prune`.

## Blocked by

- 02: Create a Project with no remote
- 03: The launcher picks the container by home and Project
- `.scratch/quarterdeck/issues/22-firstmate-ships-with-its-full-history.md` (FirstMate cannot dispatch from a normally seeded home without it)

## Comments
