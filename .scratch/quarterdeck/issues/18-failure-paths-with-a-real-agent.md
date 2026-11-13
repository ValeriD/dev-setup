# 18: A failing ticket is retried once then stops; a question stops the run

**Status:** ready-for-agent
**Model:** Opus (the stop rules and report text are skill content)
**Design slice:** 8 (Failure paths)

## Note on private extension sources

This builds on ticket 17's real run on pomoplan, which uses the read-only `ValeriD/skills` token from ticket 08. No longer an open question.

## What to build

Two real runs that end in a stop, and the report for each. Pause and resume is deferred (grill decision 43): the run only stops and reports. Nothing here builds a way to answer a question and carry on.

## Acceptance criteria

- [ ] A Spec with a ticket built to fail (its tests cannot pass): the Crewmate fails, the Second Mate starts exactly one fresh Crewmate for the same ticket, that one also fails, and the run stops. No later ticket starts, nothing is pushed, no pull request exists (SC-11, SC-13).
- [ ] The report names the failed ticket, shows what was tried twice (`failed twice: <reason 1>; <reason 2>`), and says the branch is local only with the sha it is at; commits so far stay in place (SC-11, SC-13).
- [ ] The failed first attempt is saved as `refs/quarterdeck/failed/NN-1` and the retry started from the start commit.
- [ ] A Spec with a ticket that needs a decision the Spec and design do not make: the Crewmate writes `needs-decision`, the Second Mate does not pick an answer and does not start the next ticket, and the report states the question in its `Question:` line (SC-12).
- [ ] In both runs the user answered nothing and pressed nothing before the report; the attention mark appeared on the First Mate's tab (SC-09, SC-10).
- [ ] A Crewmate that dies mid-ticket also ends the run with a report and no publish (the design's step 8 stop rule).
- [ ] Skill corrections made during the runs are listed in a comment on this file.

## Technical context

**Design:** `.scratch/quarterdeck/design.md`, "Spec Run procedure" step 8, "Final report (D42)", "Build order" slice 8. `grill-notes.md` decisions 28, 42, 43.

- **Modules touched:** `qd-spec-run` text and `references/report.md`; possibly the Charter.
- **Must not introduce:** pause and resume, a question-answering channel, a second retry, skipping ahead, a guessed answer.
- **Validation seam:** real Claude, real pomoplan (or a throwaway branch of it); manual rows SC-11, SC-12, SC-13 in `quarterdeck/CHECKLIST.md`. The token-free halves of SC-11 and SC-13 are already covered by ticket 11.
- **Coverage:** owns the real-agent halves of SC-11, SC-12 and SC-13.

## Blocked by

- 17: One sentence to the First Mate runs a Spec Run to a pull request and a report
