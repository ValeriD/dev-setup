---
name: qd-spec-run
description: Run a Quarterdeck Spec Run as the owning Second Mate after a First Mate handoff, through planning, ordered tickets, publish and the final report.
---

# Second Mate: run one Spec

Use one FirstMate record, one branch and one worktree for the entire Spec Run. Read the filled Charter and the handoff. `$S` is this Second Mate's absolute home; `$slug`, `$prefix`, `$project` come from the handoff headers. Accept only `feat/`, `fix/`, `chore/` as the prefix and only this Charter's project. Keep the `corr` token of the latest First Mate message for this run (the handoff, then each answer) for your next parent-channel line. A Crewmate's question waits for the user's answer and then continues in the same record ([Question](#question-wait-for-the-answer-then-continue)); never choose an answer.

Run commands from `$S`; **every Second Mate command carries `FM_HOME="$S"`**, including read-only checks. Use FirstMate's existing supervision protocol and home-local commands. Mates read project files; only Crewmates change them. Never invoke Docker or the Claude launcher directly.

## 2. Ready the project container

```sh
FM_HOME="$S" qd-project-up "$S" "$project"
```

Done when the command succeeds. On failure, stop and report the diagnostic; do not spawn.

## 3. Make the Brief

```sh
FM_HOME="$S" bin/fm-brief.sh "$slug" "$project" --mode direct-PR --branch-prefix "$prefix"
```

Before dispatch, read [Brief conventions](references/brief.md) and fill `$S/data/$slug/brief.md` exactly as specified, with concrete gate commands and publish arguments. Edit only this private Brief, never FirstMate source. Done when no fill-in fields remain and the generated contract lines, Setup and Rules are preserved.

## 4. Plan in one commit

Before the initial spawn, satisfy FirstMate's dispatch-record requirement with typed resolution left off (no `FM_DISPATCH_*` settings and no quota calls):

```sh
FM_HOME="$S" bin/fm-dispatch-resolve.sh "$S/data/$slug/brief.md"
FM_HOME="$S" bin/fm-spawn.sh "$slug" "projects/$project" --mode direct-PR --yolo off --branch-prefix "$prefix" --harness claude --model sonnet
```

If the resolver is not off as configured, stop and report the configuration mismatch rather than changing dispatch policy. The planning Crewmate creates the branch and uses the project's `/to-spec`, `/to-design`, `/to-tickets` to write `.scratch/<slug>/spec.md`, `design.md`, `issues/NN-*.md`. It makes exactly one commit and appends `done: plan committed <sha>; <N> tickets` (with the generated numeric `[at=…]` stamp).

Record `$WT` from FirstMate's spawn result and the branch's starting commit. Before advancing, verify the reported SHA is HEAD, the three planning artifacts exist, the numbered ticket count matches N, exactly one commit was added, and the worktree is clean. A missing decision is `needs-decision`: take the [Question](#question-wait-for-the-answer-then-continue) path, then verify the plan as above. An invalid plan stops and reports; the ticket retry below is not a planning retry.

## 5. Dispatch the next numbered ticket

Read each ticket in `$WT` in number order. Apply `$S/config/crew-dispatch.json`: a ticket about skills, prompts or agent tools uses Claude Opus; all other tickets use Claude Sonnet. Planning and publish use Sonnet. Keep shared-quota mode on (`"shared_quota": true`, so no quota calls) and typed resolution off; do not change the rules.

Record the current HEAD as `$start` before each ticket; set `$NN`, `$ticket` and `$model` from that ticket and rule. Launch exactly one fresh session for it:

```sh
FM_HOME="$S" bin/fm-control.sh "$slug" relaunch --model "$model" --note "Ticket $NN: $ticket. Start commit $start."
```

Done when the relaunch succeeds. A dead Crewmate or failed launch takes the stop path, not another ticket.

## 6. Let the Crewmate implement and check

The Brief directs the Crewmate to use the project's `/implement` for only the named ticket, including its review procedure, with exactly one new commit. It runs `pnpm install --frozen-lockfile`, then the Charter's build, lint and test commands inside the project container. Successful status is `done: ticket NN committed <sha>; build ok, lint ok, test ok`; a failed gate or unfinished ticket is `failed: ticket NN: <reason>`. An undecided question is `needs-decision`: the Crewmate ends its turn and the [Question](#question-wait-for-the-answer-then-continue) path brings it the user's answer. Status appends use the generated numeric time stamp.

Done when the current session has a terminal outcome for this ticket (`done`, `failed`, or a dead Crewmate); a `needs-decision` is not terminal; keep normal supervision while it works, without adding another review session.

## 7. Check the ticket before advancing

Reconcile current state through:

```sh
FM_HOME="$S" bin/fm-crew-state.sh "$slug"
FM_HOME="$S" git -C "$WT" rev-parse HEAD
FM_HOME="$S" git -C "$WT" merge-base --is-ancestor "$start" HEAD
FM_HOME="$S" git -C "$WT" rev-list --count "$start..HEAD"
FM_HOME="$S" git -C "$WT" status --porcelain
```

Accept only a current-session `done` line naming this ticket, HEAD's SHA and **build ok, lint ok, test ok**, exactly one new commit descended from the start commit, and empty `git status --porcelain`. An old status line is not evidence for this session. A missing or inconsistent result is a failure, not a pass.

FirstMate's crew-state may say `blocked: named head ... unreachable` between tickets because the branch is still local. This is expected: neither recover nor escalate it, and never push merely to clear it. It does not waive the checks above. Done when all ticket checks pass; then advance to the next number, or step 9 after the last ticket.

## 8. Retry once, otherwise stop

For a first ticket failure, retain its reason and relaunch once with the same model and original start SHA:

```sh
FM_HOME="$S" bin/fm-control.sh "$slug" relaunch --model "$model" --note "Retry of ticket $NN. Save the failed attempt as refs/quarterdeck/failed/$NN-1, then reset to $start."
```

The retry Crewmate preserves the failed attempt before resetting, as the Brief specifies. Reapply step 7 against the original start SHA. After a second failure, or a dead Crewmate: **no further relaunch, no publish**. Keep commits and failure evidence, skip all later tickets, and go straight to step 10. Do not guess, skip ahead, tear down unlanded work, or attempt automatic recovery of a dead Crewmate. A `needs-decision` is not a failure: take the Question path below.

## Question: wait for the answer, then continue

A Crewmate's `needs-decision` holds the run on the user's answer. The answer goes back to the same FirstMate record, worktree and branch, and that job continues: planning, or the same ticket (or its retry). The answer never starts a new Spec Run, slug, branch or Crewmate record.

1. Read the question from the current session's `needs-decision` line. Note the job that asked (`planning`, or ticket `$NN` with its `$start` and `$model`) and whether it was the retry.
2. Report it to the First Mate with the latest First Mate `corr` token, by appending this line, with its `key`, to the parent channel named by the generated Charter:

   ```text
   needs-decision [key=<slug>] [corr=<corr>] [at=<epoch>]: Spec Run <slug> waits for an answer at <planning | ticket NN>: <question verbatim>
   ```

   Then end your turn. Write no report, publish nothing, start no later ticket. Done when the line is appended.
3. The answer arrives as a First Mate message whose text, after FirstMate's marker and `corr` token, starts with the line `Answer to Spec Run <slug>`; the user's answer follows verbatim. Its `corr` token is now the latest. An answer naming another slug belongs to that run.
4. Send the answer to the Crewmate that asked:

   ```sh
   FM_HOME="$S" bin/fm-send.sh "$slug" "Answer: <the user's answer verbatim>"
   ```

   `fm-send.sh` checks that the agent is still running before it rings, and says so on stderr. Exit 0 with no `has exited` notice means the answer is recorded for the running Crewmate and its doorbell rang (or the watcher re-rings it). `fm-crew-state.sh` cannot tell you this: a Crewmate in the project container that has exited can still read `unknown · source: pane`.
   - Exit 0 with `doorbell not typed because the agent in <pane> has exited`: the Crewmate has exited. Relaunch the same record with its job's note plus the answer, on the same model:

     ```sh
     FM_HOME="$S" bin/fm-control.sh "$slug" relaunch --model "$model" --note "Ticket $NN: $ticket. Start commit $start. Answer: <the user's answer verbatim>"
     ```

     For planning, the note is `Plan. Answer: <answer>` with `--model sonnet`. For a retry whose attempt is already saved at `refs/quarterdeck/failed/$NN-1`, use the `Ticket $NN` note above, so the Crewmate keeps its worktree instead of resetting again.
   - `fm-send.sh` exits non-zero: nothing was delivered; send once more. A second non-zero exit, or a relaunch that exits non-zero, means the answer cannot reach a Crewmate. That is a dead Crewmate: take step 8's stop, and the report's `Question:` line carries the undelivered question.

   Done when the send or the relaunch succeeds.
5. Continue the job where it stands: step 6 for a ticket, or step 4's plan checks for planning. The ticket keeps its `$start`, so step 7 still expects exactly one commit above it. An answer is not a retry: a later failure of the first attempt still gets its one retry, and a failure of the retry still ends the run. Another question takes this path again. Record each answered question and its answer for the report.

## 9. Publish only after every ticket passed

The last ticket's gate is the final gate; there is no extra gate session. Write the route marker only now:

```sh
FM_HOME="$S" sh -c 'printf "%s\n" quarterdeck > "$1/data/$2/qd-route"' sh "$S" "$slug"
FM_HOME="$S" bin/fm-control.sh "$slug" relaunch --model sonnet --note "Publish."
```

The launcher is responsible for consuming that marker and routing this session into the Quarterdeck. The publish Crewmate runs only the concrete `qd-publish` command in the Brief and appends `done: PR <url>`. Check the observed PR result through FirstMate; a marker or relaunch alone is not evidence of a push or PR. A publish failure stops and reports the actual branch/push state without another relaunch.

## 10. Report once to the parent

Read [Final report](references/report.md) for every terminal outcome; a run is terminal only when it opened a PR or stopped, never on a question. Write `$S/data/$slug/report.md` from observed evidence. Append exactly one final parent-channel line to the destination named by the generated Charter (not a guessed status path):

```text
done [key=<slug>] [corr=<latest First Mate corr token>]: <outcome>; report <absolute report path>
```

Include the generated numeric time stamp. This `done` means the requested run has been reported, not that every ticket passed. The First Mate reads `report.md` and relays it verbatim. Done when the report exists and its correlated pointer has been appended. Keep the FirstMate record open until the user merges; normal landing and teardown follow that approval.
