---
name: qd-errand
description: Run an Errand in a Quarterdeck Project with no remote, as the First Mate, from the user's sentence to a report; accept it, send it back, carry a question's answer, or say what is waiting for the user.
---

# First Mate: run an Errand

An Errand is one FirstMate ship record `<id>` in a Project registered `local-only` in the First Mate home: branch `fm/<id>`, its own pool worktree, a Crewmate in the Project's container. FirstMate's own state is the only record of Errands; read it fresh each time. In a Project with a Second Mate, the Errand belongs to that Second Mate and the First Mate starts no Crewmate there; tell the user that Errands on GitHub Projects are not offered yet.

Let `$M` be `$QD_WORK_ROOT/fleet/firstmate`. Run every FirstMate command from `$M` with `FM_HOME="$M"`. `$dir` is `$M/projects/<project>`, the user's main folder. Mates read Project files with read-only git; the Project's files change only through the Crewmate and `fm-merge-local.sh`.

## 1. Ask everything first

1. Name the Project. Done when `FM_HOME="$M" bin/fm-project-mode.sh <project>` prints `local-only off`. Anything else is not an Errand Project: a Project the user wants created goes through `qd-project`.
2. Grill the user, in this conversation, until the Errand is complete: what the result is, which files it goes in, who it is for, its length and tone, what must stay as it is, and every point a Crewmate would otherwise have to guess. Ask in as few messages as you can. Done when you can see no open point. From dispatch until the report the user is asked nothing, except a Crewmate's own question.

## 2. Brief and dispatch

1. Pick `<id>`: lowercase letters, digits and `-`, at most 64 characters, starting with the Project's name, with no `$M/data/<id>` yet.
2. Pick the model by `$M/config/crew-dispatch.json`: `opus` when the Errand is about skills, prompts or agent tools, `sonnet` otherwise.
3. Ready the container. On failure, stop and report its diagnostic.

   ```sh
   FM_HOME="$M" qd-project-up "$M" <project>
   ```

4. Make the Brief, then read [Brief conventions](references/brief.md) and fill `$M/data/<id>/brief.md` as it says.

   ```sh
   FM_HOME="$M" bin/fm-brief.sh <id> <project> --mode local-only
   ```

5. Dispatch. If the resolver says typed resolution is configured, stop and report the mismatch instead of changing dispatch policy.

   ```sh
   FM_HOME="$M" bin/fm-dispatch-resolve.sh "$M/data/<id>/brief.md"
   FM_HOME="$M" bin/fm-spawn.sh <id> projects/<project> --mode local-only --yolo off --harness claude --model <model>
   ```

   Done when `fm-spawn.sh` prints `spawned <id>`. Tell the user in one line: Errand `<id>` on `<project>` has started on `fm/<id>`, and they can leave.

## 3. Report

FirstMate's supervision wakes you when the Crewmate appends to `$M/state/<id>.status`. Run `FM_HOME="$M" bin/fm-crew-state.sh <id>` first: it is how FirstMate records the finished head. Then relay to the user, from what you observed:

```text
Errand <id> on <project>: ready | check failed | waiting for your answer | the Crewmate died | failed
Branch: fm/<id> at <sha>
Files: <git -C "$dir" diff --name-status main...fm/<id>, on one line>
Check: passed | failed | none
Question: <the needs-decision text, verbatim>
```

Leave out lines that do not apply. The cases, by the last status line:

- `done ...; check: passed` or `check: none`, and crew-state reads `done`: **ready**. Offer accept or send back.
- `done ...; check: failed`: **check failed**. Report it as failed and offer only a send back (a follow-up, see 5) or dropping it. It is never offered for accept.
- `needs-decision`: **waiting for your answer**. Relay the question verbatim with its id and Project. Offer no answer, ranking or default.
- `failed` or `blocked`: relay its text as the outcome.
- No report yet while supervision says the Crewmate is stale, or the user asks about it: `fm-crew-state.sh` keeps reading `working · harness busy` for a dead Crewmate, so ask FirstMate's delivery check instead.

  ```sh
  FM_HOME="$M" bin/fm-send.sh <id> "Append your current status line."
  ```

  Exit 0 with `doorbell not typed because the agent in <pane> has exited` means **the Crewmate died**: report it, with the branch as it is and nothing landed. Without that notice the Crewmate is alive and was asked.

## 4. Accept

Accept only on the user's explicit word in this conversation for this Errand, and only when its report was **ready**. That word is the whole approval: this Quarterdeck has no `tasks-axi`, so FirstMate's captain hold records nothing and `fm-merge-local.sh` merges whenever it is called. Never run `fm-captain-hold.sh`.

```sh
FM_HOME="$M" bin/fm-merge-local.sh <id>
```

- `merged fm/<id> into local main`: tell the user their main folder now shows the result. Then close the record by FirstMate's `ship-landing` procedure (load it): tear down after a confirmed landing, `FM_HOME="$M" bin/fm-teardown.sh <id>`. If this Errand is a follow-up, also close the Errand it replaced (section 5).
- A refusal is relayed as it is. `fm-merge-local.sh` moved nothing and the user lost nothing. Run no other git or merge command and pass no force option. What the common refusals mean:
  - `dirty working tree`: FirstMate refuses while the main folder has any uncommitted change, tracked or untracked, even one the merge would not touch. The user commits or moves those changes, then accepts again.
  - `not a fast-forward of main`: `main` moved since dispatch. The Errand lands as a follow-up (section 5).
  - `differs from the recorded local done head`: the branch changed after its report. It lands as a follow-up (section 5).

## 5. Send back, answer, or follow up

FirstMate latches an Errand's first reported head: anything that changes the branch after its `done` can land only as a new record. So decide by the status file:

```sh
grep -q '^done' "$M/state/<id>.status"
```

**No `done` yet** (an answer to its question, or a comment before it finished): a fresh session in the same worktree and branch, on the model recorded as `model=` in `$M/state/<id>.meta`. The note carries the user's words verbatim:

```sh
FM_HOME="$M" bin/fm-control.sh <id> relaunch --model <model> --note "Answer: <the user's answer verbatim>"
FM_HOME="$M" bin/fm-control.sh <id> relaunch --model <model> --note "Comment: <the user's comment verbatim>"
```

Done when it exits 0; the next report follows section 3. A Crewmate that died before `done` is sent back the same way, with the user's comment or `Comment: continue`.

**After a `done`** (a comment on a finished result, a failed check, or a `main` that moved): a **follow-up Errand**. Dispatch a new record `<new-id>` by section 2 from today's `main`, with the follow-up Brief in [Brief conventions](references/brief.md): it names `fm/<old-id>`, and its Crewmate brings those commits over and makes the revision. Tell the user that `<old-id>` will not land, that the landing is `<new-id>`'s, and that `<old-id>` is closed once `<new-id>` lands.

**Closing the replaced Errand.** Its branch is the follow-up's source, so it stays open until the follow-up has landed. When you offer the follow-up for accept, say that accepting it also closes `<old-id>` without landing and that FirstMate's teardown then deletes `fm/<old-id>`. On that accept, after the merge succeeds:

```sh
FM_HOME="$M" bin/fm-teardown.sh <old-id> --force
```

Never call `fm-merge-local.sh` for a replaced Errand. A follow-up that is itself sent back after `done` gets its own follow-up, naming the newest branch; every Errand it replaced closes when the last one lands.

**Dropping an Errand** the user explicitly says to discard (a failed check, a dead Crewmate, a change of mind): `FM_HOME="$M" bin/fm-teardown.sh <id> --force`. Without that explicit word, nothing is discarded.

## 6. What is waiting

Answer from FirstMate's state, read now. Every `$M/state/<id>.meta` with `kind=ship` is an open Errand; its `project=` line ends in the Project's name. For each:

1. `FM_HOME="$M" bin/fm-crew-state.sh <id>` and the last line of `$M/state/<id>.status`.
2. Sort it into one group. Crew-state `working` is **running** (a relaunched session runs under its old last line). Otherwise the last line decides: `needs-decision` is **waiting for your answer** (quote the question), `done` is **finished, not accepted** (give its check result), and `failed` or `blocked` is **stopped**. A dead Crewmate still reads as running; only section 3's check shows it.
3. An Errand named by another open Errand's `Errand follow-up: fm/<id>` line in `$M/data/*/brief.md` is replaced: list it under its follow-up, not on its own.

Give every entry its id and Project, grouped by Project. Done when every open record is listed or named as replaced.
