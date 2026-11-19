# 28: A Crewmate's question is answered to that Crewmate, not to a new Spec Run

**Status:** done
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

- [x] `qd-spec-run` describes the question path above, using FirstMate's own commands (`fm-send.sh`, `fm-control.sh ... relaunch --note`). Its step 10 no longer ends the run on `needs-decision`.
- [x] `qd-first-mate` tells the First Mate to send an answer to the Second Mate for the same slug, never as a new handoff. The First Mate still never chooses an answer.
- [x] The rules that stay are still stated: the Crewmate never guesses, a failed ticket gets one retry and then ends the run, and a dead Crewmate ends the run with a report.
- [x] A stub-Crewmate test drives the question path: the stub writes `needs-decision`, an answer is delivered, and the same record, worktree and branch continue to `done`. No second record or branch exists afterwards.
- [x] The final report format (`references/report.md`) says how a run that was stopped by a question and then answered is reported.
- [x] `quarterdeck/CHECKLIST.md`'s SC-12 rows and ticket 18's question run expect a continuation after the answer, not a stop.
- [x] `npm run test:quarterdeck` passes, followed by `npm run test:cleanup` with no test containers left. The full suite is not run.

## Technical context

- **Modules:** `quarterdeck/skills/qd-spec-run/` (SKILL.md and references), `quarterdeck/skills/qd-first-mate/SKILL.md`, and the stub-loop tests in `tests/quarterdeck.test.mjs` (ticket 11's fixture).
- **Reuse:** FirstMate's steer and relaunch commands, unpatched (ADR 0008).
- **Must not introduce:** resuming a Claude session by id (FirstMate refuses it: "resuming an exited agent is not deterministic"), a new state machine outside FirstMate, or an answer chosen by any mate.
- **Related:** the Errands spec already assumes the same behaviour for a stopped Errand (its Further Notes). Keep the wording consistent.

## Blocked by

None.

## Comments

### Resolution (implementing agent, 2026-11-17)

Built in one commit (this ticket's commit on `feat/quarterdeck`):

- `qd-spec-run`: a new "Question: wait for the answer, then continue" section. The Second Mate appends `needs-decision [key=<slug>] [corr=…]` to its parent channel and ends its turn. The answer arrives as `Answer to Spec Run <slug>`. It sends `fm-send.sh <slug> "Answer: …"`; if `fm-send.sh` reports `doorbell not typed because the agent in <pane> has exited`, it runs `fm-control.sh <slug> relaunch --model <same> --note "Ticket NN: …. Start commit <start>. Answer: …"` (`Plan. Answer: …` for planning). Steps 4, 6, 8 and 10 no longer end the run on `needs-decision`; one retry and the dead-Crewmate stop are kept. The Brief gains an **Answer:** rule and the `Plan.` note; the Charter's stop rule matches.
- `qd-first-mate` §2: relay the question verbatim, then `fm-send.sh sm-<project> --resolve-key <slug>` with `Answer to Spec Run <slug>` plus the user's words. No new handoff, and no answer chosen by a mate.
- `report.md`: `Answered:` line, eight lines at most; `Question:` only for an answer that could not be delivered.
- CHECKLIST: the SC-12 precursor row and new "Ticket 18 / ticket 28" rows expect continuation. Ticket 18 itself is immutable, so its SC-12 case is superseded there.
- Test `ticket loop question`: ticket 01 asks and gets the answer through `fm-send.sh` in the same session. Ticket 02 asks, its Crewmate is stopped with `fm-control.sh exit`, `fm-send.sh` reports it exited, and the relaunch with the answer note finishes it. Same worktree (uncommitted work kept), branch and start commit. Exactly one `.meta` record and branches `[feat/<slug>, main]`.

Finding from the pinned FirstMate: `fm-crew-state.sh` cannot show whether a Crewmate has exited. After an exit it read `unknown · source: pane · harness state unavailable (unknown missing)`, not `backend target gone`, because the pane stays readable. `fm-send.sh`'s own liveness check is the signal the skill uses.

Not covered token-free: the planning-question relaunch (the stub accepts `Plan.` notes but the loop does not ask in planning), the First Mate's `--resolve-key` send, and real mates following the text. These are in the CHECKLIST rows for a real run. Existing provisioned Second Mates keep their old Charter text until they are provisioned again.

Review (three fresh agents: standards, design, spec):
- Repeated duplication of the "question is not a stop" rule (standards): fixed. Step 8 now points to the Question section.
- CHECKLIST label overstated the evidence (standards, design): fixed. The row is now "not run under decision 97".
- `**Answer.**` punctuation (standards): fixed.
- The fixture's ticket-01 check was loosened (standards): fixed. It is exact again.
- `inbox` naming (standards): fixed. It is now `drainInbox`, with the source of the format named.
- No string guard for `--resolve-key`/`Answer to Spec Run` (standards): fixed in the mate-procedures test.
- Stub could not take a `Plan.` note (standards, design): fixed in the stub. A planning-question loop is declined for cost; the manual row covers it.
- Repeated `mode` switches in the test (standards): declined. There are three lookups in one function, and a table adds indirection for no extra protection.
- "No second record" not checked (spec, design): declined. The unchanged final assertion `state/*.meta` equals `<slug>.meta` ("one FirstMate record") runs in question mode too.
- First Mate fallback without `--resolve-key` (spec): fixed. It now uses the resend that `fm-send.sh` prints, keyed when a decision is open.
- Step 6 done criterion dropped the dead-Crewmate exit (spec): fixed.
- `spec.md` SC-12 wording and the Errands wording differ (spec): declined. Grill-notes decision 97 overrides the spec. The Errands "fresh Crewmate on the same branch" is that spec's own decision, and these skills do not cover it.
- Planning path not driven, answer delivered twice after a relaunch (design): noted. The second delivery is harmless under the Brief's Answer rule.


Tests: `npm run test:quarterdeck` 41/41 pass after the review fixes (41/41 before them too), each followed by `npm run test:cleanup` with no test containers left. The full suite was not run.
