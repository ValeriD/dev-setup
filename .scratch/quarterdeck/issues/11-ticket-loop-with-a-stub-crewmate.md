# 11: The ticket loop runs plan, ticket 1, ticket 2 with a stub Crewmate

**Status:** ready-for-agent
**Model:** Sonnet
**Design slice:** 5 (Ticket loop)

## What to build

A token-free run of the real FirstMate loop in the Quarterdeck, with a stub standing in for Claude, that proves the per-ticket mechanics end to end before any real model is involved: a Second Mate home, a project container, one FirstMate record for the Spec Run, a planning session, one relaunch per ticket, the model chosen by the dispatch rule, one retry for a failing ticket, and a stop with no further relaunch. A test script plays the Second Mate, following `qd-spec-run`'s steps 2 to 8.

## Acceptance criteria

- [ ] A test image derived from the node image replaces `claude` with a script that reads the latest `## Progress note` in the Brief, makes the planned commit or the ticket commit (or fails on a marked ticket), and appends the status line (`done [at=...]: ...` or `failed [at=...]: ...`).
- [ ] The run on a fixture project with a local bare origin goes plan -> ticket 1 -> ticket 2 using FirstMate's own `fm-brief.sh`, `fm-spawn.sh`, `fm-control.sh relaunch` with `FM_HOME` set, and no FirstMate file edited. The branch is `<prefix><slug>`; it has one plan commit and then exactly one commit per ticket in ticket order, on top of `origin/main`; no other branches; no push happened (SC-03, SC-04, SC-13).
- [ ] Each session is a new one in the same worktree (same path in `launch.log`, no resume argument), and ticket 2 sees ticket 1's commit (SC-05).
- [ ] `launch.log` shows the model of each session: the dispatch rule's Opus for a ticket marked as about skills, prompts or agent tools, Sonnet for another (SC-06, launch half).
- [ ] The ticket check of step 7 is applied by the test script: a `done` naming build, lint and test, one new commit since the start commit, clean `git status --porcelain`; a `done` missing a gate result fails the check.
- [ ] Between tickets `fm-crew-state.sh` reports "blocked: named head ... unreachable"; the test records it and the run continues (SC-14).
- [ ] A ticket marked to fail gets exactly one relaunch with the `Retry of ticket NN` note; the stub saves the failed attempt as `refs/quarterdeck/failed/NN-1` and resets to the start sha; after a second failure no further relaunch happens and nothing is pushed (SC-11, SC-13, token-free half).
- [ ] `quarterdeck/CHECKLIST.md` gains rows for the real-agent half of this slice: whether FirstMate's own machinery (not the model) escalates the interim blocked state to the First Mate, and what `working [key=<slug>]` for interim tickets does. No FirstMate patch is made here (ADR 0008); a needed patch is reported to the user instead.

## Technical context

**Design:** `.scratch/quarterdeck/design.md`, "Spec Run procedure" (steps 2 to 8, "Resolved items" and the closing paragraph about interim blocked), "Validation plan" (stub-Crewmate row). The spike's phase 1 is the model.

- **Modules:** `tests/quarterdeck.test.mjs` plus a stub-Crewmate image definition in `tests/fixtures/` (name free), the launcher (ticket 09), `qd-project-up` (ticket 07), the skill text (ticket 10). If the run shows the skill text is wrong or incomplete, correct it in the same change and say so in a comment on this file.
- **Implementation anchors:** `spike/FINDINGS.md` "Link 1" and "Link 3" (commands and what fights this use: `fm-control.sh` needs an explicit `FM_HOME`; `relaunch` requires `--note`; notes pile up in `brief.md`), `tests/acceptance.test.mjs` and `tests/lib.mjs` for fixtures and cleanup.
- **Reuse:** the real FirstMate commands at the pin; the node image built in the run.
- **Dependency direction:** test -> FirstMate commands -> launcher -> `docker exec` -> project container (stub Claude).
- **Must not introduce:** a wrapper over `fm-*`, a checker script in the product code (the check lives in the test and in the skill text), per-ticket mounts, publish (ticket 12), pause and resume.
- **Validation seam:** `tests/quarterdeck.test.mjs` through `npm test`; Docker, Herdr and FirstMate are real, Claude is the stub.
- **Coverage:** owns the token-free halves of SC-03, SC-04, SC-05, SC-06, SC-11, SC-13, SC-14 and the "stub-Crewmate run" row of the Validation plan up to (not including) publish.

## Blocked by

- 05: The First Mate's home is seeded and its tab opens on start
- 07: `qd-project-up` creates the project container from the project's main branch
- 09: The `claude` launcher runs a Crewmate in the project container with the right environment
- 10: Mate skills, Charter and Brief conventions

## Comments

### Implementation handoff — steps 1–5, review and closure deferred

Fixed point: `4ac0f4b64f048f1021154086cdb99ca2bdd2617c`. Acceptance boxes and status deliberately remain unchanged for the parent's independent review. No other implementation ticket was started; no product dispatch, creator policy, or FirstMate source was changed.

Built:
- `tests/fixtures/quarterdeck-crewmate/{Dockerfile,claude.mjs}` derives from the test Node image and replaces Claude. It opens the exact operational-inbox record delivered by FirstMate, reads the latest Progress note, makes planning/ticket/failure commits and numeric stamped status lines, preserves the first failed commit under the requested ref before resetting, and stays interactive until FirstMate sends `/exit`. Session records contain fixture argv, worktree, start/head SHAs and unique IDs; no environment dump.
- `tests/quarterdeck.test.mjs` plays the Second Mate through real home seeding, `qd-project-up`, Brief, dispatch resolution (off), spawn and relaunch with explicit `FM_HOME`. Success proves one record, one branch/worktree, plan then two ordered commits, Sonnet/Opus/Sonnet launches, no resume argv, ticket 2's visibility of ticket 1, unchanged origin refs, clean status, gate-line rejection when lint is absent, and recorded `blocked … named head … unreachable` followed by continued dispatch. Failure proves plan then two Opus attempts, preservation/reset, no ticket 02, no fourth session and unchanged origin refs. Tests use only local project origins and dummy credentials.
- Cleanup removes this run's read-only FirstMate hook directories through a labelled root container; no prune or unrelated resource cleanup.
- `quarterdeck/CHECKLIST.md` adds separate unrun real-agent rows for machinery escalation and experimental interim `working [key=<slug>]`. `ARCHITECTURE.md` distinguishes fixture proof from outstanding runtime evidence. No skill text was changed: this test validates its loop with the prerequisites/limits below, not an autonomous mate interpreting the text.

Validation actually run:
- `DEV_SETUP_TEST_SKIP_BUILD=1 node --test --test-global-setup=tests/global-setup.mjs --test-timeout=900000 --test-name-pattern='ticket loop:' tests/quarterdeck.test.mjs`: initial red (missing fixture image definition); subsequent integration reds exposed shallow-history refusal, missing seeded backend configuration, record-doorbell parsing, interactive composer handling and busy-state completion. Final targeted run: **1 pass, 0 failures**. The composer capture showed literal `^[` from terminal echo of FirstMate's Escape; raw input handling fixes that fixture protocol rather than weakening FirstMate's check.
- `DEV_SETUP_TEST_SKIP_BUILD=1 node --test --test-global-setup=tests/global-setup.mjs --test-timeout=900000 --test-name-pattern='ticket loop failure:' tests/quarterdeck.test.mjs`: **1 pass, 0 failures**. This separate case passed on its first run using the already-built stub failure path; no separate retry-case red is claimed.
- Final `npm run test:quarterdeck`: **32 tests, 31 pass, 0 fail, 1 existing TODO**, exit 0. Both new cases passed together with existing Quarterdeck cases. The TODO still detects ticket 08's dummy extensions token in `/etc/environment` (security-review 05); it does not establish token-file absence.
- `node --check tests/quarterdeck.test.mjs`, `node --check tests/fixtures/quarterdeck-crewmate/claude.mjs`, `git diff --check`: pass. No root typecheck script. Local logs: `/tmp/qd11-red.log`, `/tmp/qd11-green.log`, `/tmp/qd11-failure.log`, `/tmp/qd11-quarterdeck.log`.
- Broader coverage intentionally not run: **no `npm test`, `test:skill`, or unrelated suites**. The restricted command reuses the supplied local Node test image and builds the derived stub image. No real agent, GitHub project clone/push, private fetch or unsafe credential probe was performed.

Blockers and limits (ticket stays open):
1. **Stock shallow-home dispatch:** the shipped FirstMate checkout is shallow. Real `fm-spawn.sh` refused the local fixture because `fm-role-lib.sh` could not establish unrelated repository lineage; maintainer-role configuration did not bypass that guard. The test fetches full public history at the unchanged pinned HEAD, with `credential.helper=` disabled, before seeding. This is an explicit fixture prerequisite, not a fix or proof that untouched stock startup can dispatch. A product provisioning decision/fix remains outstanding; no upstream patch was made.
2. **Lifecycle/policy evidence:** the stub invokes FirstMate's generated Stop hook to model turn completion and renders a minimal composer. Without that completion event, crew-state remained `working` from `fm-spawn`. This does not prove real Claude executes those hooks under the hardened policy. The test installs shipped configuration into the seeded home because no actual Second Mate pane is spawned to inherit it. Live mate supervision, automatic parent escalation, interim `working`, and prompt-free behavior remain manual and unobserved; checklist rows are unticked/unrun.
3. Existing security-review concerns **01** (config/Feature trust), **03** (shared Git-store credentials), and **05** (extensions-token persistence) remain unresolved. No new distinct security concern was found requiring another numbered ticket. No blanket Feature rejection, `runArgs` relaxation, credential-policy change or fabricated isolation claim was introduced.

Review was not dispatched and the ticket/design/spec were not closed. Preserved and excluded from staging: existing `grill-notes.md`, ticket 07, `CONTEXT.md`, and untracked security-review ticket 01.
