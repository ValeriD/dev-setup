# 11: The ticket loop runs plan, ticket 1, ticket 2 with a stub Crewmate

**Status:** ready-for-agent
**Model:** Sonnet
**Design slice:** 5 (Ticket loop)

## What to build

A token-free run of the real FirstMate loop in the Quarterdeck, with a stub standing in for Claude, that proves the per-ticket mechanics end to end before any real model is involved: a Second Mate home, a project container, one FirstMate record for the Spec Run, a planning session, one relaunch per ticket, the model chosen by the dispatch rule, one retry for a failing ticket, and a stop with no further relaunch. A test script plays the Second Mate, following `qd-spec-run`'s steps 2 to 8.

## Acceptance criteria

- [x] A test image derived from the node image replaces `claude` with a script that reads the latest `## Progress note` in the Brief, makes the planned commit or the ticket commit (or fails on a marked ticket), and appends the status line (`done [at=...]: ...` or `failed [at=...]: ...`).
- [ ] The run on a fixture project with a local bare origin goes plan -> ticket 1 -> ticket 2 using FirstMate's own `fm-brief.sh`, `fm-spawn.sh`, `fm-control.sh relaunch` with `FM_HOME` set, and no FirstMate file edited. The branch is `<prefix><slug>`; it has one plan commit and then exactly one commit per ticket in ticket order, on top of `origin/main`; no other branches; no push happened (SC-03, SC-04, SC-13).
- [ ] Each session is a new one in the same worktree (same path in `launch.log`, no resume argument), and ticket 2 sees ticket 1's commit (SC-05).
- [ ] `launch.log` shows the model of each session: the dispatch rule's Opus for a ticket marked as about skills, prompts or agent tools, Sonnet for another (SC-06, launch half).
- [ ] The ticket check of step 7 is applied by the test script: a `done` naming build, lint and test, one new commit since the start commit, clean `git status --porcelain`; a `done` missing a gate result fails the check.
- [ ] Between tickets `fm-crew-state.sh` reports "blocked: named head ... unreachable"; the test records it and the run continues (SC-14).
- [ ] A ticket marked to fail gets exactly one relaunch with the `Retry of ticket NN` note; the stub saves the failed attempt as `refs/quarterdeck/failed/NN-1` and resets to the start sha; after a second failure no further relaunch happens and nothing is pushed (SC-11, SC-13, token-free half).
- [x] `quarterdeck/CHECKLIST.md` gains rows for the real-agent half of this slice: whether FirstMate's own machinery (not the model) escalates the interim blocked state to the First Mate, and what `working [key=<slug>]` for interim tickets does. No FirstMate patch is made here (ADR 0008); a needed patch is reported to the user instead.

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

### Supplied reviewer reports (verbatim; dispositions below)

## Standards review — `be01472`

Reviewed `git diff 4ac0f4b64f048f1021154086cdb99ca2bdd2617c...HEAD` directly, alongside the supplied references and repository guidance.

**Documented violations:** None found outside tooling-enforced rules.

**Judgment calls:**

1. **Test coupling to dispatch configuration layout** — `tests/quarterdeck.test.mjs:185–186`:
   ```js
   const model = /about skills, prompts or agent tools/.test(text)
     ? dispatch.rules[0].use.model : dispatch.default[0].model;
   ```
   This assumes the relevant rule occupies index zero and separately hardcodes its predicate. A semantically equivalent configuration reordering could break the fixture; changing the configured predicate could leave it exercising the old interpretation. Consider finding the intended rule explicitly and asserting its supported predicate rather than silently interpreting array position. Preserve the distinct protection supplied by observing actual Sonnet/Opus/Sonnet launches through FirstMate and the launcher. This is test-maintenance feedback, not a request for a product dispatch engine.

2. **Possible Duplicated Code** — new `tests/quarterdeck.test.mjs:114–117`:
   ```js
   const put = (p, content) => {
     const r = run('docker', ['exec', '-i', '-u', 'node', name,
       'sh', '-c', 'cat > "$1"', 'sh', p], { input: content });
     assert.equal(r.code, 0, r.err);
   };
   ```
   This duplicates `testProjectFixture`’s existing Docker file-writing helper. A shared file-local helper would keep user selection, argument-safe path handling, stdin delivery, and failure reporting consistent. Preserve all four properties; neither integration scenario should be removed. Baseline citation: `/home/valeri/.agents/skills/code-review/SMELLS.md`, **Duplicated Code**.

**Coverage worth retaining:** The loop’s routing assertions overlap launcher coverage but uniquely exercise real FirstMate spawn/relaunch. Success and failure cases protect different outcomes. The missing-lint negative assertion tests a test-local checker, but ticket 11 explicitly requires that protection; it is not gratuitous duplication.

No tests run during this read-only review. Broader coverage intentionally not run; no files changed.

## Design review — `be01472`

**1. Material validation gap: the loop requires provisioning absent from the shipped startup.**

- **Constraint:** Ticket 11 requires “a token-free run of the real FirstMate loop in the Quarterdeck”; the design’s validation plan specifies “FirstMate at the pin, Herdr, Docker” as real dependencies.
- **Hunk:** `tests/quarterdeck.test.mjs`, inside `testTicketLoop`:
  ```js
  if (okInside(`git -C ${parent} rev-parse --is-shallow-repository`).trim() === 'true') {
    okInside(`git -C ${parent} -c credential.helper= fetch --unshallow https://github.com/ValeriD/firstmate $(git -C ${parent} rev-parse HEAD)`);
  }
  ```
- **Impact:** Both loop tests repair the seeded FirstMate repository before exercising dispatch. The handoff confirms that without this preparation, stock `fm-spawn.sh` refuses the fixture because its lineage guard cannot establish unrelated repository history. Passing tests therefore establish the loop only with an additional provisioning prerequisite—not with the shipped home. This is an explicitly documented outstanding outcome, not an upstream-edit violation or a newly introduced product regression.
- **Needed outcome:** Resolve the provisioning decision and validate dispatch from a normally seeded home before treating stock loop integration as proven.

No other material ownership, dependency-direction, interface, reuse, or explicit non-design violations found. Publish is expressly excluded from ticket 11. Simulated Stop hooks and outstanding real-agent supervision checks are appropriately distinguished from automated proof.

Read-only review; no tests run.

## Spec review — `be01472`

No additional missing or incorrect implementations, or scope creep, found within ticket 11’s token-free scope.

The diff covers the requested planning/ticket sequence, fresh sessions in one worktree, model selection, gate-line validation, interim blocked-state observation, and preservation/reset followed by exactly one retry and no push.

**Outstanding implementation blocker—not merely pending manual evidence:**
- **SC-03:** “The Second Mate has ticket 1 implemented by a Crewmate in the project container, then ticket 2 by a new Crewmate.”
  `tests/quarterdeck.test.mjs` unshallows the FirstMate home before dispatch because stock shallow-home dispatch fails its lineage guard. Consequently, this proves the loop with that prerequisite, not dispatch from untouched shipped startup. The handoff and architecture documentation disclose this accurately; product provisioning remains unresolved, rather than falsely claimed complete.

**Honest pending manual evidence—not missing ticket-11 implementation:**
- **SC-14:** “The mates do not stop it or report it as broken because the branch is not on GitHub yet.” The scripted Second Mate continues despite the blocked state, but autonomous machinery escalation remains unobserved. Ticket 11 explicitly asks for checklist rows investigating this and interim `working`; both were added.
- **SC-02 / SC-10:** Real lifecycle/state detection and prompt-free operation remain unproven because the stub invokes Stop hooks itself. The change explicitly states this limitation.
- **SC-11:** The user-facing failure report remains manual evidence; this ticket implements its requested token-free retry/stop half, not reporting or publication.

Read-only review of the supplied diff and references. No tests run; broader coverage intentionally not run.

### Follow-up resolution — ticket remains open

Fixed point: `be01472d5f7dff8178a6ecc98a30cff6eedccede` (implementation). Follow-up: `3fcef3d` (test-only maintenance). This comment and acceptance accounting are committed separately with the full ticket path in the commit message. No review was dispatched.

Dispositions (separate from the unchanged reports):
- Standards 1 — **Fixed**, `3fcef3d`: locate the unique Claude/Opus rule, assert its supported natural-language predicate, derive the fixture topic from that predicate, and find the Claude default; actual launch-model assertions remain unchanged.
- Standards 2 — **Fixed**, `3fcef3d`: share the existing file-local Docker writer, retaining node user, positional path argument, stdin content and exit/error assertion; neither integration scenario was removed.
- Design 1 — **Declined for this implementation**: the blocker applies and remains unresolved; shipped shallow-home lineage refusal requires a product provisioning decision, expressly outside this follow-up's authorized scope, so the fixture prerequisite is retained and stock startup is not claimed proven.
- Spec SC-03 — **Declined for this implementation**: the same unresolved provisioning blocker prevents normal seeded-home proof; changing product provisioning is prohibited here, not excused by passing prepared-home tests.
- Spec SC-14, SC-02/SC-10, SC-11 manual evidence — **Declined for this implementation**: a scripted mate and simulated Stop hooks cannot establish autonomous supervision, prompt-free real lifecycle, or the user-facing failure report; the checklist remains unrun.

Exact acceptance accounting for committed implementation `be01472` plus `3fcef3d`:
- **Satisfied without the provisioning qualification: criteria 1 and 8**, now checked: the derived Node stub image implements the requested protocol; the checklist contains the two requested real-agent investigation rows, with no FirstMate patch.
- **Criteria 2–7 remain unchecked** because their execution evidence uses the prepared (unshallowed/configured) home, not untouched shipped startup. Within that explicit fixture prerequisite, the committed tests establish: plan → ticket 1 → ticket 2, ordered commits/branch and no push (2); fresh sessions, same worktree and predecessor visibility (3); actual Sonnet/Opus/Sonnet launches (4); three named gates, single commit, clean status and missing-lint rejection (5); recorded interim blocked state and scripted continuation (6); exactly one retry, saved failed ref/reset, no later launch or push (7). These conditional results do not assert full SC-03/04/05/06/11/13/14 completion.

Validation of the follow-up:
- `DEV_SETUP_TEST_SKIP_BUILD=1 node --test --test-global-setup=tests/global-setup.mjs --test-timeout=900000 --test-name-pattern='ticket loop:|ticket loop failure:|qd-project-up fixture:' tests/quarterdeck.test.mjs` — **3 passed, 0 failed**, exit 0; log `/tmp/qd11-followup-tests.log`.
- `git diff --check` passed before the code commit.
- Broader coverage intentionally omitted: no `npm test`, `test:skill`, unrelated suite, or additional credential/security probe. The extensions fixture was not rerun; its writer now uses the identical shared implementation exercised by the ordinary project fixture. No new security issue was found.
- Manual checks: inspected the diff for retained launch/gate/retry assertions and identical writer arguments. Real-agent checks were **not performed**: normal seeded-home dispatch, real Stop-hook execution under hardened policy, automatic parent escalation, interim `working`, prompt-free supervision, and user-facing failure reporting remain outstanding. Publication remains excluded.

Scope/structure: no product behavior, provisioning, model configuration, interfaces or dependency direction changed. Beyond the quoted hunks, the writer moved to file scope and its duplicate in `testProjectFixture` was removed; rule/default lookup and predicate assertions were added adjacent to routing. Thus test structure does extend beyond the quoted lines, deliberately to address the findings; no other behavior changed and no repeat review was dispatched per instruction. Unrelated grill notes, ticket 07, `CONTEXT.md`, and untracked security-review 01 remain untouched and excluded from commits. No new implementation ticket work was started; ticket/design/spec remain open.
