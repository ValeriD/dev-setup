# 16: A planning Crewmate commits the Spec, design and tickets on the Spec Run's branch

**Status:** ready-for-agent
**Model:** Opus (the ticket exercises and corrects skill text and the planning Brief; the planning Crewmate itself runs on Sonnet)
**Design slice:** 4 (Planning Crewmate)

## Note on private extension sources

pomoplan's Project layer pulls its skills from the private `ValeriD/skills`. The user will provide a read-only token limited to that repository (ticket 08, proven in ticket 14). This is no longer an open question. The planning Crewmate needs the project's own `/to-spec`, `/to-design` and `/to-tickets` skills from that layer.

## What to build

The Second Mate is steered by hand with one handoff (grilling decisions verbatim, a slug and a prefix). It starts the project container, writes the Brief, and spawns a planning Crewmate that, in the project container, creates `<prefix><slug>`, writes `.scratch/<slug>/spec.md`, `design.md` and `issues/NN-*.md` with the project's skills, makes exactly one commit, and appends `done [at=...]: plan committed <sha>; <N> tickets`. A decision the handoff does not make goes to `needs-decision` and stops the run.

## Working assumptions and decisions

- DECISION (user): the planning Crewmate runs on Sonnet, not Opus.
- Working assumption, not yet confirmed: design open question 9, the handoff is the user's decisions as told to the First Mate.
- Planning is in the MVP (grill decision 39); this overrides the spec's "planning is out of scope" and decision 16's pre-pushed spec branch.

## Acceptance criteria

- [ ] After one handoff to pomoplan's Second Mate, the Second Mate's clone has `<prefix><slug>` with exactly one commit on top of `origin/main`, containing `.scratch/<slug>/spec.md`, `design.md` and `issues/NN-*.md`; the status line `plan committed <sha>; <N> tickets` is present; nothing was pushed.
- [ ] `launch.log` shows the planning session on Sonnet, launched through the container route.
- [ ] A handoff that leaves a needed decision open produces a `needs-decision` line and no commit, and the Second Mate stops without choosing for the user (SC-12 precursor).
- [ ] The Second Mate wrote the Brief from `references/brief.md` and the plan session did exactly the one job named by the Brief (plan), nothing else.
- [ ] The `qd-first-mate` and `qd-spec-run` text (ticket 10) is corrected where this run showed it wrong; each correction is listed in a comment on this file.
- [ ] The SC-planning row in `quarterdeck/CHECKLIST.md` is run and noted.

## Technical context

**Design:** `.scratch/quarterdeck/design.md`, "Spec Run procedure" steps 1 to 4, "Validation plan" (Planning row). `grill-notes.md` decisions 21, 39, 40.

- **Modules touched:** the mate skills (ticket 10), the Brief reference, possibly the Charter.
- **Implementation anchors:** `spike/FINDINGS.md` link 4 (steering a Second Mate with `fm-send`), FirstMate's rule that a mate never writes to a project (a Crewmate writes the plan).
- **Must not introduce:** grilling in the Quarterdeck as a dependency, a plan-approval hold (decision 22 is later), pause and resume, a plan written by the Second Mate itself.
- **Validation seam:** real Claude, real pomoplan; manual checklist.
- **Coverage:** proves the planning link; precursor of SC-03 and SC-12.

## Blocked by

- 10: Mate skills, Charter and Brief conventions
- 14: The hardened project container on pomoplan runs the full gate for a hand-spawned Crewmate
