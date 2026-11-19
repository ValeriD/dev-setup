---
name: qd-errand
description: Run an Errand in a Quarterdeck Project. As the First Mate on a Project with no remote, from the user's sentence to a report, accept, send back, answer or say what is waiting. As the Second Mate on a Project with a GitHub repository, run an Errand handed to you through to its pull request.
---

# First Mate: run an Errand

An Errand is one FirstMate ship record `<id>` in a Project registered `local-only` in the First Mate home: branch `fm/<id>`, its own pool worktree, a Crewmate in the Project's container. FirstMate's own state is the only record of Errands; read it fresh each time. In a Project with a Second Mate (a Project on GitHub), the Errand belongs to that Second Mate and the First Mate starts no Crewmate there: the First Mate does sections 1 and then hands it over as `qd-first-mate` says, and the Second Mate follows [section 7](#7-second-mate-an-errand-on-a-project-with-a-github-repository). Sections 2 to 6 are the First Mate's, for a Project with no remote.

Let `$M` be `$QD_WORK_ROOT/fleet/firstmate`. Run every FirstMate command from `$M` with `FM_HOME="$M"`. `$dir` is `$M/projects/<project>`, the user's main folder. Mates read Project files with read-only git; the Project's files change only through the Crewmate and `fm-merge-local.sh`.

## 1. Ask everything first

1. Name the Project. Done when `FM_HOME="$M" bin/fm-project-mode.sh <project>` prints `local-only off` (sections 2 to 6) or `direct-PR off` (a Project on GitHub: stop after step 2 and hand over as `qd-first-mate` says). Anything else is not an Errand Project: a Project the user wants created goes through `qd-project`.
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

Answer from FirstMate's state, read now. Every `$M/state/<id>.meta` with `kind=ship` is an open Errand in a Project with no remote; its `project=` line ends in the Project's name. Errands on a GitHub Project live in that Project's Second Mate home, `$QD_WORK_ROOT/fleet/sm-<project>/state/`, and are read the same way with `FM_HOME` set to it; their only report is the pull request, so one is open until its report arrives. For each:

1. `FM_HOME="$M" bin/fm-crew-state.sh <id>` and the last line of `$M/state/<id>.status`.
2. Sort it into one group. Crew-state `working` is **running** (a relaunched session runs under its old last line). Otherwise the last line decides: `needs-decision` is **waiting for your answer** (quote the question), `done` is **finished, not accepted** (give its check result), and `failed` or `blocked` is **stopped**. A dead Crewmate still reads as running; only section 3's check shows it.
3. An Errand named by another open Errand's `Errand follow-up: fm/<id>` line in `$M/data/*/brief.md` is replaced: list it under its follow-up, not on its own.

Give every entry its id and Project, grouped by Project. Done when every open record is listed or named as replaced.

## 7. Second Mate: an Errand on a Project with a GitHub repository

You are the Second Mate of the Project. `$S` is your home and `$dir` is `$S/projects/<project>`. The First Mate's handoff starts with these headers, then the user's Errand and answers verbatim:

```text
Errand: <id>
Branch prefix: <feat/, fix/ or chore/>
Project: <project>
```

Accept only this Charter's Project. Every command here carries `FM_HOME="$S"` and runs from `$S`. The Errand is one FirstMate record `<id>`, separate from any Spec Run record in this home, on its own branch `<prefix><id>` and its own pool worktree, in the Project's one container. Neither changes the other. Never invoke Docker or the Claude launcher yourself, and merge nothing: the pull request is the user's to merge.

1. **Ready the container.** `FM_HOME="$S" qd-project-up "$S" <project>`. On failure, stop and report its diagnostic.
2. **Brief.** `FM_HOME="$S" bin/fm-brief.sh <id> <project> --mode direct-PR --branch-prefix <prefix>`, then fill it as [Brief conventions](references/brief.md) says for a GitHub Project.
3. **Dispatch.** The model is Opus for an Errand about skills, prompts or agent tools and Sonnet otherwise, as `$S/config/crew-dispatch.json` says.

   ```sh
   FM_HOME="$S" bin/fm-dispatch-resolve.sh "$S/data/<id>/brief.md"
   FM_HOME="$S" bin/fm-spawn.sh <id> projects/<project> --mode direct-PR --yolo off --branch-prefix <prefix> --harness claude --model <model>
   ```

4. **Stop rule.** A `needs-decision` line is a question for the user: take the Question path of the `qd-spec-run` skill with `<id>` as the key. A dead Crewmate (`fm-send.sh`'s `has exited` notice, never `fm-crew-state.sh`) before its `done`: no publish; go to step 7 with the branch as it stands.
5. **Check.** When the Crewmate's last status line is `done ...`, read its `check:` result. `check: failed`: no publish; go to step 7. `check: passed` or `check: none`, and the branch holds the commits it reports (`git -C "$dir" log` on `<prefix><id>`), continue. Run no check yourself.
6. **Publish.** Only now write the route marker and relaunch the same record, as `qd-spec-run` does:

   ```sh
   FM_HOME="$S" sh -c 'printf "%s\n" quarterdeck > "$1/data/$2/qd-route"' sh "$S" <id>
   FM_HOME="$S" bin/fm-control.sh <id> relaunch --model sonnet --note "Publish."
   ```

   The launcher consumes the marker and routes that session into the Quarterdeck, where it runs only `qd-publish --body-from-brief`: the branch is pushed and a pull request is opened against the default branch, its text taken from the Errand's Brief because the branch has no tickets. A published Errand is complete. A change the user wants afterwards is a new Errand that names this branch. A publish failure stops and reports the real branch and push state; relaunch nothing.
7. **Report once.** Write `$S/data/<id>/report.md` from what you observed, then append one parent-channel line as `qd-spec-run` step 10 says, with `<id>` as the key. The report:

   ```text
   Errand <id> on <project>: pull request opened | check failed | the Crewmate died | failed | publish failed
   Pull request: <url>
   Branch: <prefix><id> at <sha>
   Check: passed | failed | none
   ```

   Leave out the lines that do not apply. Nothing was merged. The First Mate relays this file to the user verbatim.
