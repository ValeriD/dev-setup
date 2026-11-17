# 28: A Crewmate's question is answered to that Crewmate, not to a new Spec Run

**Status:** ready-for-agent
**Model:** Opus
**Design slice:** 5 (Mate skills)

## Problem

In task C on 2026-11-17, a planning Crewmate stopped with `needs-decision`. The Second Mate routed the question to the First Mate, and the user answered. The answer then started a new Spec Run (`tasks-today-count-backlog`) with a new Crewmate, worktree and branch, so the work and context of the Crewmate that asked were dropped. The cause is `quarterdeck/skills/qd-spec-run/SKILL.md` step 10: after a `needs-decision`, "no further relaunch", and the run ends with a report. FirstMate's own worker contract expects the parent to reply to the waiting worker ("Firstmate will reply with the decision").

## Decision

Decision 97 (`grill-notes.md`, amending decision 43 for questions only):

- The Second Mate sends the user's answer to the Crewmate that asked, if it is still running (`fm-send.sh <task-id>`).
- If that Crewmate has exited, the Second Mate relaunches the same FirstMate record with the answer as its note (`fm-control.sh <task-id> relaunch --note`). That keeps the same worktree and the same branch.
- The answer never starts a new Spec Run.
- A failed ticket still ends the run after its one retry. A dead Crewmate still ends the run with a report.

## What to build

The text of the `qd-spec-run` and `qd-first-mate` skills. On a question:

1. The Second Mate reports the question to the First Mate as a stop that is waiting for an answer. It does not end the Spec Run.
2. The First Mate relays the question to the user.
3. The First Mate sends the user's answer to the same Second Mate, naming the same Spec Run slug.
4. The Second Mate delivers the answer to the Crewmate that asked, or relaunches that same record, as decided above.
5. The run continues from there: planning, or the same ticket. The final report comes once, at the end.

## Acceptance criteria

- [ ] `qd-spec-run` describes the question path above, using FirstMate's own commands (`fm-send.sh`, `fm-control.sh ... relaunch --note`). Its step 10 no longer ends the run on `needs-decision`.
- [ ] `qd-first-mate` tells the First Mate to send an answer to the Second Mate for the same slug, never as a new handoff. The First Mate still never chooses an answer.
- [ ] The rules that stay are still stated: the Crewmate never guesses, a failed ticket gets one retry and then ends the run, and a dead Crewmate ends the run with a report.
- [ ] A stub-Crewmate test drives the question path: the stub writes `needs-decision`, an answer is delivered, and the same record, worktree and branch continue to `done`. No second record or branch exists afterwards.
- [ ] The final report format (`references/report.md`) says how a run that was stopped by a question and then answered is reported.
- [ ] `quarterdeck/CHECKLIST.md`'s SC-12 rows and ticket 18's question run expect a continuation after the answer, not a stop.
- [ ] `npm run test:quarterdeck` passes, followed by `npm run test:cleanup` with no test containers left. The full suite is not run.

## Technical context

- **Modules:** `quarterdeck/skills/qd-spec-run/` (SKILL.md and references), `quarterdeck/skills/qd-first-mate/SKILL.md`, and the stub-loop tests in `tests/quarterdeck.test.mjs` (ticket 11's fixture).
- **Reuse:** FirstMate's steer and relaunch commands, unpatched (ADR 0008).
- **Must not introduce:** resuming a Claude session by id (FirstMate refuses it: "resuming an exited agent is not deterministic"), a new state machine outside FirstMate, or an answer chosen by any mate.
- **Related:** the Errands spec already assumes the same behaviour for a stopped Errand (its Further Notes). Keep the wording consistent.

## Blocked by

None.

## Comments
