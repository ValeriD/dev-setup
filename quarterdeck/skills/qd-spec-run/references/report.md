# Final report

Write `data/<slug>/report.md` once, when the run opened a PR or stopped. A question the user answered is not an outcome: the run continued, and the report lists it on the `Answered:` line. The First Mate relays this file verbatim. Use at most the following eight lines; select the applicable alternatives and omit inapplicable lines. Keep all ticket entries on the single ticket-summary line, separated by semicolons, in number order.

```text
Spec Run <slug> on <project>: PR opened | stopped at ticket NN | stopped at planning
PR: <url>
Branch: <prefix><slug> at <sha>, pushed | local only
Plan: <sha>, <N> tickets
NN <ticket title>: <sha> | failed twice: <reason 1>; <reason 2>
Gate on the last commit: build ok, lint ok, test ok
Answered: <planning | ticket NN>: <question> -> <answer>; ...
Question: <text>
```

`PR:` appears only for an observed opened PR. `Answered:` appears when the user answered a question during the run: one entry per question, in the order asked, with the answer as delivered. `Question:` appears only when a question's answer could not be delivered because the Crewmate that asked was dead; the run then stopped at that job. The ticket-summary line includes every completed ticket and its SHA, plus the stopped ticket and both failure reasons when it failed twice. For a dead Crewmate or a first-attempt stop, state that actual reason instead of claiming two failures. Name unstarted tickets as not run if needed to distinguish them from completed work.

Report evidence, not guarantees. Use the actual HEAD and push state, not the last intended commit. If setup, planning or publish stopped outside a numbered ticket, name that stage in the outcome instead of inventing a ticket number. If no plan or branch was created, say `not created` in its field. If a push outcome is unknown, say `push state unverified` rather than `local only` or `pushed`.

The positive gate line is valid only for checks observed on the reported last commit. Otherwise replace its result with the actual failed, not-run or unverified checks; never copy an earlier commit's green gate onto the failed final tree. A local failed-attempt ref may be named on the ticket-summary line to locate retained evidence. Keep the report within eight lines even for a stop.
