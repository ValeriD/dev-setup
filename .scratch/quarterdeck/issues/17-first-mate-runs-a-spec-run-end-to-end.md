# 17: One sentence to the First Mate runs a Spec Run to a pull request and a report

**Status:** ready-for-human
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

## Comments

### Resumed steps 1–5 handoff — end-to-end validation remains blocked

Fixed point and starting HEAD: `cf3b4490845dfd6a972a5f317666a3079562cdb0`. Inspected the previous worker's pending `quarterdeck/CHECKLIST.md` addition and `/tmp/qd17-quarterdeck.log`; retained the ticket-specific procedure and added its exact test-evidence limitation. Read the implementation skill, tracker/triage docs, spec, full design, dependencies 12/13/16 and conditional 15, and their upstream 11/14 evidence. Inspected the shipped mate procedures, Charter, report reference and test manifest. No independent review dispatched; parent owns review after this commit.

**Sketch/build:** change only this ticket and `quarterdeck/CHECKLIST.md`. Reuse existing First Mate handoff → Second Mate procedure → FirstMate commands → launcher/project container → Quarterdeck publish route → correlated report (reuse rung 1: no new runtime component). Extend the existing manual checklist in place (rung 2). No new abstraction, dependency, interface, module ownership or dependency direction; no architecture reconciliation needed. Existing token-free Quarterdeck coverage remains the regression seam, not a substitute for live observations. The checklist covers owned SC-02/SC-10, real-agent SC-03–09/SC-14, watcher/auto-arm and SC-20 restore evidence. No new runtime behavior requires a red-green cycle. No skill, Brief or Charter correction is attributed to a run: **none; no live run occurred**.

**Dependencies: implementation versus evidence:**

- **12:** private-marker publish routing, hooks/fsmonitor overrides, publisher and prepared-home local-origin/stub-gh proof exist. Real Claude settings/instruction loading, automatic watcher/PR registration and autonomous supervision remain unobserved. Do not replace working plumbing merely because live evidence is absent.
- **13:** human-only real GitHub clone/seed/push/PR proof has not run. Its separately recorded execution blockers are normal startup automatically launching Claude (no approved agent-free procedure) and concern 07's mounted-secret readability contradicting outside-exec unreadability. Environment absence does not resolve the latter. Those prerequisite dispositions and real throwaway-repository evidence remain required before pomoplan publication.
- **16/14:** managed planning procedures and creator/launcher code exist; real planning/private skill installation, prompt-free states, gate and hook evidence are missing. The stock shallow-home lineage-guard failure in ticket 11 is an actual provisioning gap, not missing authentication; prepared-history fixtures do not fix shipped startup. The CLI's extensions-token persistence in `/etc/environment` is an actual contract failure (08/security-review 05), not waived by accepted inspect visibility. Resolve it or obtain explicit acceptance of that specific failure before real-token validation. Neither prerequisite is repaired under ticket 17.
- **15:** ticket 14 records no actual busy/turn-end hook or supervision results. Conditional need cannot yet be established or waived. No speculative extension, policy relaxation or FirstMate patch is authorized.
- **Human inputs and authorization:** an authorized fresh owning home/clone with fetched pomoplan main, supported scoped-token/Claude provisioning, committer identity and fully decided product work yielding the two required ticket categories are needed for the measured run. This session permits only Quarterdeck tests, not the pomoplan gate or implementation of its tickets. No credential contents were examined; no claim is made about credentials existing elsewhere. Earlier tickets' missing local fleet/main observations are historical, not freshly reproduced here.

**Validation actually available:** the previous worker's `/tmp/qd17-quarterdeck.log` contains a completed `test:quarterdeck` summary: **32 tests, 31 pass, 0 ordinary failures, 0 cancelled/skipped, 1 failing TODO**. The TODO assertion reports the dummy token at `/etc/environment`; this is a real known assertion failure, not a successful absence check. The log does not record the process exit status, so none is inferred. Prepared-home loop and structural tests passed within their fixture limitations. No tests rerun by this resumed worker for the documentation-only completion. Broader regression intentionally not run: no full suite, skill/installer/unrelated suites or pomoplan gate. No real agent, GitHub project operation, restore, secret probe or manual acceptance run was performed.

**Next validation:** follow the new ticket 17 checklist after the specific prerequisites above. Capture startup through the single instruction and final report without steering; correlate session/model/route sequence, ordered commits and identity, final-tree gate, real PR, verbatim report, attention and autonomous supervision. Inventory preexisting branches so they are not misclassified as run-created branches. Validate SC-20 separately on a quiescent authorized copy with isolated path mapping; byte equality alone does not prove absolute worktree links resolve. Record interventions as failures of unattended operation, never erase them with a retry. Any machinery escalation requires the documented separate `working` experiment and approval before a FirstMate patch.

All nine acceptance criteria remain unchecked; instructions are not observations. Ticket remains open, `ready-for-human`. Existing numbered security concerns remain separate human follow-up, not blanket policy gates; no new distinct concern was identified or duplicated. Unsupported `runArgs` rejection, retained Features and Opus/Sonnet product dispatch remain unchanged. Only ticket 17 and its checklist changes are staged/committed; preexisting grill notes, ticket 07, `CONTEXT.md`, and untracked security-review 01 are preserved outside this work. No other ticket implementation or review was started.
