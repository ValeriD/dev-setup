# 17: One sentence to the First Mate runs a Spec Run to a pull request and a report

**Status:** ready-for-agent
**Model:** Opus (the First Mate's skill and handoff are what is proven and corrected)
**Design slice:** 7 (First Mate as a session, end to end)

## Note on private extension sources

pomoplan's Project layer pulls its skills from the private `ValeriD/skills` with the read-only token the user supplies (ticket 08, proven in ticket 14). No longer an open question. The first run is attended by the user.

## What to build

The MVP's definition of done (grill decision 6, with decision 39): in the Quarterdeck you tell the First Mate one sentence with the grilling decisions; the Second Mate plans, has two tickets implemented one commit each in the project container, the gate passes on the last commit, a Crewmate in the Quarterdeck pushes the branch and opens a pull request on pomoplan, and you get one report. You touch nothing in between.

## Working assumptions and decisions

- DECISION (user): the planning Crewmate runs on Sonnet. Working assumption, not yet confirmed: design open question 9 (handoff = the user's decisions as told).
- If FirstMate's own machinery escalates the interim "blocked: head unreachable" state, first try the non-terminal `working [key=<slug>]` status for interim tickets. A patch to `fm-crew-state.sh` or the parent channel breaks ADR 0008's MVP rule: STOP and ask the user; do not patch.

## Acceptance criteria

- [ ] One sentence to the First Mate starts the run; no further message is sent, and no prompt, trust dialog, login or key press happens in any session until the report (SC-03, SC-10).
- [ ] The branch on pomoplan's origin has the plan commit and exactly one commit per ticket in order, carrying the user's committer identity; the branch name starts with `feat/`, `fix/` or `chore/`; there are no other branches and no per-ticket pull requests (SC-04, SC-05).
- [ ] An Opus Crewmate implemented a ticket about skills, prompts or agent tools and a Sonnet Crewmate any other; the Second Mate runs on Sonnet and the First Mate on Opus, read from `launch.log` and Herdr (SC-06).
- [ ] The gate (`pnpm run build`, `pnpm run lint`, `pnpm test`) passed in the project container on the last commit before the push; the pull request lists the tickets (SC-07, SC-08).
- [ ] The First Mate relays `report.md` verbatim in chat, the First Mate's tab carries Herdr's attention mark, and the report is one the user did not have to answer anything to get (SC-09, SC-10).
- [ ] The interim blocked state was not escalated to the First Mate or shown as a failure in the report (SC-14).
- [ ] The watcher and auto-arm kept the First Mate and Second Mate supervising while the user was away (observed, noted).
- [ ] The work root copied and restored on a second host path leaves the clones and homes intact (SC-20, manual row).
- [ ] Every skill or Charter correction made during the run is listed in a comment on this file.

## Technical context

**Design:** `.scratch/quarterdeck/design.md`, whole "Spec Run procedure", "Final report (D42)", "Validation plan / Manual checklist". `grill-notes.md` decisions 6, 29, 39 to 43.

- **Modules touched:** the mate skills, Charter, launcher and publish route, as needed for fixes.
- **Must not introduce:** a FirstMate patch without approval, a Git gate, Ideas, pause and resume, notifications beyond Herdr's attention mark (decision 29).
- **Validation seam:** the real thing, attended by the user for the first run and then left alone; `quarterdeck/CHECKLIST.md` rows SC-02, SC-06, SC-07, SC-08, SC-09, SC-10, SC-20.
- **Coverage:** owns SC-02 and SC-10 in full, and the real-agent halves of SC-03 to SC-09 and SC-14. Pull request goes to pomoplan, after ticket 13 proved GitHub on a throwaway repository.

## Blocked by

- 12: The publish relaunch runs in the Quarterdeck and FirstMate accepts the pull request
- 13: Prove real GitHub clone, push and pull request by hand
- 16: A planning Crewmate commits the Spec, design and tickets on the Spec Run's branch
- 15: FirstMate's Crewmate hooks reach a Quarterdeck-created container as an opt-in Agent Extension (only if ticket 14 shows it is needed)
