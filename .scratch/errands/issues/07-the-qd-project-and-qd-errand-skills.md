# 07: The `qd-project` and `qd-errand` skills

**Status:** done
**Model:** Opus
**Design slice:** 5 (Mate skills)

Terms such as Project, Errand, Crewmate, First Mate, Second Mate, Brief, Variant, Template, Preset and Spec Run are defined in `CONTEXT.md`. Spec: `.scratch/errands/spec.md` (scenarios are cited as `SC-NN`). Design: `.scratch/errands/design.md`.

## What to build

The First Mate's written procedures for everything tickets 02 to 06 proved by script. `qd-project` creates and removes a Project on the user's request. `qd-errand` takes an Errand from the user's sentence to a report, and handles accept, send back, an answered question and "what is waiting for me". After this ticket a First Mate that follows the skills performs the flow with FirstMate's own commands and the Quarterdeck tools, and nothing else.

## Acceptance criteria

- [x] `quarterdeck/skills/qd-project/` and `quarterdeck/skills/qd-errand/` are installed as managed skills in the Quarterdeck image, beside `qd-first-mate` and `qd-spec-run`.
- [x] `qd-project` states: confirm name, Variant and Presets with the user; run `qd-project-new`; register the Project as `local-only`, yolo off, through FirstMate's own procedure; start the container with `qd-project-up`; report what exists. An existing name is reported, not overwritten (SC-01, SC-03).
- [x] `qd-project` states removal: confirm with the user, run `qd-project-rm`, and only after it succeeds remove the registry entry and the folder (SC-20).
- [x] `qd-errand` states that every question is asked before dispatch, in the same conversation, and that the user's answers go into the Brief verbatim (SC-04).
- [x] A Brief reference under `qd-errand` carries: the one job, the stop rule (an undecided point ends the session with a `needs-decision` line and no guess), the instruction to follow `.quarterdeck/errand-check.md` when `main` has it, and the required final `check:` line. FirstMate's generated safety and delivery lines in the Brief are kept.
- [x] `qd-errand` states the report: Project, branch, files changed and the check result, relayed when FirstMate holds the record; a failed check is reported as failed and not offered for accept (SC-07, SC-10).
- [x] `qd-errand` states accept (release the hold, run `fm-merge-local.sh`, relay a refusal as it is and force nothing) and send back or answer (`fm-control.sh relaunch --note` with the user's words) (SC-12, SC-13, SC-14, SC-08).
- [x] `qd-errand` states how to answer "what is waiting for me" from FirstMate's own state: every Errand across Projects that is running, stopped on a question, or finished and not accepted, with its Project (SC-17).
- [x] `qd-first-mate`'s rule that the First Mate never starts a project Crewmate is narrowed in one place: it may dispatch Errands in Projects with no remote; a Project with a Second Mate is still handed to that Second Mate.
- [x] The structural skill tests the MVP uses (every command a skill names exists in the image; every referenced file is installed) cover both new skills. `npm run test:errands` and `npm run test:quarterdeck` pass.

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

### Resolution (Opus agent)

Built in 96ace45 ("errands 07: the qd-project and qd-errand skills"). New `quarterdeck/skills/qd-project/SKILL.md` covers create (confirm name, Variant and Presets, `qd-project-new`, registration through `project-management` checked with `fm-project-mode.sh` printing `local-only off`, `qd-project-up`, report; an existing name is reported) and remove (explicit yes, `qd-project-rm`, then the folder and registry line only after it succeeds). New `quarterdeck/skills/qd-errand/SKILL.md` and `references/brief.md` cover the grilling before dispatch, the Brief (answers verbatim, one job, stop rule, check file, final `check:` line, generated sections kept), dispatch with ticket 04's sequence, the report, accept, send back, answer, follow-up, drop, and what is waiting. `qd-first-mate`'s rule is narrowed in its opening paragraph. Both skills are installed by the existing `COPY quarterdeck/skills/`. A new structural test in `tests/quarterdeck.test.mjs` checks four things: every FirstMate command named exists in `/opt/firstmate/bin`, every `qd-project-*` tool named exists in `/opt/qd/bin`, every linked reference is installed, and the FirstMate skills loaded by name are installed. It also checks the proven sequences and guards. The ticket 05 test in `tests/errands.test.mjs` now also proves the teardown the skill names. A plain `fm-teardown.sh` closes the landed follow-up. The replaced Errand's teardown is refused as unlanded, and `--force` closes it, which deletes `fm/<old-id>`. Main and the other open Errand are untouched. `quarterdeck/CHECKLIST.md` has rows for SC-04, SC-07, SC-17 and SC-19. `ARCHITECTURE.md`'s Mate skills row names the two skills. `npm run test:quarterdeck` passed 46/46 and `npm run test:errands` 10/10; cleanup left nothing.

How the findings from tickets 04 to 06 were handled:
- No captain hold. `qd-errand` says the user's explicit word is the whole approval, never runs `fm-captain-hold.sh`, and calls `fm-merge-local.sh` only on that word and only for a **ready** report. I ticked the "release the hold" criterion on this basis: there is no hold to release.
- Relaunch or follow-up. The rule is `grep -q '^done' state/<id>.status`. Before a `done`, the Errand is relaunched with `Answer:` or `Comment:` and the `model=` from its meta. After a `done`, a follow-up Errand is dispatched by the same section 2. Its Brief carries `Errand follow-up: fm/<old-id>` and a cherry-pick of `main..fm/<old-id>`. The user is told that the landing is the follow-up's.
- Closing the old task. FirstMate's only close for unlanded work is `fm-teardown.sh <id> --force`, and `ship-landing` requires explicit discard authority for it. It also deletes the task branch. The old task therefore stays open until the follow-up lands (its branch is the source), and closes on the follow-up's accept, after the user has been told the branch is deleted. This differs from the design's "its branch stays as a record". I recorded it as an addendum to the design decision; no spec line depends on keeping the branch.
- Dead Crewmate. It is detected only by `fm-send.sh`'s "has exited" notice, and the skill says `fm-crew-state.sh` keeps reading `working · harness busy`.
- A refused accept. The skill explains `dirty working tree` (any uncommitted change, tracked or untracked), `not a fast-forward of main` and `differs from the recorded local done head`, and says nothing is forced.
- Config update. It fits the design's record row ("replaced only by an explicit user-requested update through `qd-project`"), so it is included. The change reaches `main` as an accepted Errand. The First Mate shows the user `git diff <recorded tree> <main:.devcontainer tree>`, and after the user confirms, writes that exact tree id to the record and reruns `qd-project-up`. This is not covered by a new test; ticket 02's test proves the same record rewrite.
- Removal confirmation is the second guard, as stated in the skill.

Not checked: the skills' behaviour with a real Claude (ticket 08 is wontfix; the checklist rows are the user's). "What is waiting" covers Errands in the First Mate home only. Errands in Second Mate Projects arrive with ticket 09, and until then `qd-errand` tells the user they are not offered. `test:skill`, pins and Renovate tests were not run (nothing they cover changed).

Review: reviewer agents were not spawned. I did a careful self-review against the design, the spec and the decision of 2026-11-19. Findings:
- The skills name only commands that were proven, plus `fm-teardown.sh`, which this ticket's test now proves. No change needed.
- The record-update instruction writes the tree id the user saw, and `qd-project-up` trims and validates it. No change needed.
- The old branch is deleted on close, which differs from the design. Recorded in the design addendum; no code change.
