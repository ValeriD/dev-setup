# 07: The `qd-project` and `qd-errand` skills

**Status:** ready-for-agent
**Model:** Opus
**Design slice:** 5 (Mate skills)

Terms such as Project, Errand, Crewmate, First Mate, Second Mate, Brief, Variant, Template, Preset and Spec Run are defined in `CONTEXT.md`. Spec: `.scratch/errands/spec.md` (scenarios are cited as `SC-NN`). Design: `.scratch/errands/design.md`.

## What to build

The First Mate's written procedures for everything tickets 02 to 06 proved by script. `qd-project` creates and removes a Project on the user's request. `qd-errand` takes an Errand from the user's sentence to a report, and handles accept, send back, an answered question and "what is waiting for me". After this ticket a First Mate that follows the skills performs the flow with FirstMate's own commands and the Quarterdeck tools, and nothing else.

## Acceptance criteria

- [ ] `quarterdeck/skills/qd-project/` and `quarterdeck/skills/qd-errand/` are installed as managed skills in the Quarterdeck image, beside `qd-first-mate` and `qd-spec-run`.
- [ ] `qd-project` states: confirm name, Variant and Presets with the user; run `qd-project-new`; register the Project as `local-only`, yolo off, through FirstMate's own procedure; start the container with `qd-project-up`; report what exists. An existing name is reported, not overwritten (SC-01, SC-03).
- [ ] `qd-project` states removal: confirm with the user, run `qd-project-rm`, and only after it succeeds remove the registry entry and the folder (SC-20).
- [ ] `qd-errand` states that every question is asked before dispatch, in the same conversation, and that the user's answers go into the Brief verbatim (SC-04).
- [ ] A Brief reference under `qd-errand` carries: the one job, the stop rule (an undecided point ends the session with a `needs-decision` line and no guess), the instruction to follow `.quarterdeck/errand-check.md` when `main` has it, and the required final `check:` line. FirstMate's generated safety and delivery lines in the Brief are kept.
- [ ] `qd-errand` states the report: Project, branch, files changed and the check result, relayed when FirstMate holds the record; a failed check is reported as failed and not offered for accept (SC-07, SC-10).
- [ ] `qd-errand` states accept (release the hold, run `fm-merge-local.sh`, relay a refusal as it is and force nothing) and send back or answer (`fm-control.sh relaunch --note` with the user's words) (SC-12, SC-13, SC-14, SC-08).
- [ ] `qd-errand` states how to answer "what is waiting for me" from FirstMate's own state: every Errand across Projects that is running, stopped on a question, or finished and not accepted, with its Project (SC-17).
- [ ] `qd-first-mate`'s rule that the First Mate never starts a project Crewmate is narrowed in one place: it may dispatch Errands in Projects with no remote; a Project with a Second Mate is still handed to that Second Mate.
- [ ] The structural skill tests the MVP uses (every command a skill names exists in the image; every referenced file is installed) cover both new skills. `npm run test:errands` and `npm run test:quarterdeck` pass.

## Technical context

**Design:** `.scratch/errands/design.md`, "Responsibility map" rows for the two skills; both "Flow" sections; "Constraints".

- **Modules:** The skills own procedure and wording. They own no state and write no Project file. FirstMate owns lifecycle; the tools own files and containers.
- **Implementation anchors:** `quarterdeck/skills/qd-first-mate/SKILL.md`, `quarterdeck/skills/qd-spec-run/` and its `references/brief.md` and `references/report.md` (style and the Brief contract), the test `mate procedures: managed skills, Charter and Brief contract are installed with real FirstMate commands` in `tests/quarterdeck.test.mjs`, the test scripts of tickets 04 and 05 (the exact command sequences that were proven). Call the `writing-for-agents` skill before writing skill text.
- **Reuse:** The command sequences proven in tickets 04 to 06, copied into the skills. FirstMate's own skills (`project-management`, its landing and hold procedures) are loaded by name, not restated.
- **Dependency direction:** Skills -> FirstMate commands and Quarterdeck tools. No tool depends on a skill.
- **Must not introduce:** A list of Errands kept by the skill, a review or retry step, any instruction for a mate to edit a Project file, any command that tickets 04 to 06 did not prove.
- **Validation seam:** Structural tests of the installed skills. Behaviour with a real Claude is ticket 08.
- **Coverage:** The written half of SC-01, SC-03, SC-04, SC-07, SC-08, SC-10, SC-12, SC-13, SC-14, SC-17 and SC-20. Add the manual rows for SC-04, SC-07, SC-17 and SC-19 to `quarterdeck/CHECKLIST.md`.

## Rules for whoever implements this

- **Tests.** Run only the commands this ticket names. The full acceptance suite (`npm test`, or any glob over all files in `tests/`) is never run by an agent, not while building, not before committing and not in review.
- **No real agent session, no GitHub contact, no secrets.** Use the stub Crewmate fixture, a local bare origin, a stub `gh` and dummy token values. Never read a token file.
- **The FirstMate fork is never edited** (ADR 0008). If something FirstMate is assumed to do proves false, stop at the furthest sound point, leave this ticket open with a comment saying what was seen, and report. Do not patch and do not redesign.
- **Docker.** Act only on containers, volumes and images this work creates and labels. Never any `prune`.

## Blocked by

- 04: An Errand runs and is accepted, with a stub Crewmate
- 05: Stops, send back, and several Errands at once
- 06: Remove a Project

## Comments
