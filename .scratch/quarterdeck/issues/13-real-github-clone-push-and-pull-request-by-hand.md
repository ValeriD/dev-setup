# 13: Prove real GitHub clone, push and pull request by hand

**Status:** ready-for-human
**Model:** not an agent ticket (needs real credentials and a real GitHub repository)
**Design slice:** 2 (Real GitHub, no agents), the real half

## What to build

Run, attended and with no agent in the loop, the GitHub flow that the spike could not (grill decision 37). The spike's repository `ValeriD/quarterdeck-spike` was unreachable with the token. A human creates a throwaway private repository and a fine-grained token scoped to it, then runs the steps below on a started Quarterdeck. Results go into `quarterdeck/CHECKLIST.md` and as a comment here. A failure becomes a new ticket; this file is not edited.

Why a human: it needs a real GitHub repository and real tokens, and the implementing agent must not touch GitHub.

## Acceptance criteria

- [ ] The throwaway private repository has a tiny project and a default branch; the token in `~/.config/quarterdeck/secrets.env` is scoped to that repository only.
- [ ] In the First Mate's home the repository is registered as a `direct-PR` project with yolo off and cloned from GitHub into `projects/` through the Base credential helper (no `gh auth setup-git`, no token on disk) (SC-08, grill decision 37).
- [ ] `fm-home-seed.sh sm-<project> <explicit path> <project>` makes a Second Mate home with a fresh clone from GitHub (decision 37).
- [ ] A hand-made branch with one commit in that clone is pushed with `qd-publish` and a pull request is opened against the default branch; its body lists the tickets present under `.scratch/<slug>/issues/` (SC-08).
- [ ] `git config --show-origin -l` in the Quarterdeck and `docker inspect` of the Quarterdeck show no token value; a `docker exec` shell cannot read the token (SC-19).
- [ ] The result of each step (pass, fail, what was seen) is recorded in `quarterdeck/CHECKLIST.md` and in a comment here.

## Technical context

**Design:** `.scratch/quarterdeck/design.md`, "Build order" slice 2 and "Validation plan / Manual checklist" (SC-07, SC-08 rows). Notes: `grill-notes.md` decision 37 (accepted: the MVP build proves GitHub).

- **Modules touched:** none to build; uses tickets 03, 05 and 06.
- **Implementation anchors:** `spike/FINDINGS.md` "Setup and workarounds" (the unreachable repository), ADR 0007.
- **Must not introduce:** a pull request to pomoplan (that is ticket 17), any agent session, a token in a repository, image or project container.
- **Validation seam:** a real throwaway private GitHub repository, real PR, observed by the human.
- **Coverage:** owns the real-GitHub half of SC-08 and the real half of SC-19's "no value in git config".

## Blocked by

- 03: Tokens reach Herdr's panes and nothing else
- 05: The First Mate's home is seeded and its tab opens on start
- 06: `qd-publish` pushes a branch and opens a pull request without running project hooks

## Comments

### Static implementation/evidence handoff — ticket remains open

Fixed point: `acb9336fc52075a45f3de63431a7537442a0f309` (HEAD when work began). The latest user direction explicitly permits this comment despite the original body's no-edit instruction. Status remains `ready-for-human`; all six criteria remain unchecked. No GitHub contact, real-secret inspection, credential probe, attended flow or agent session was performed.

**Pre-edit sketch:** reuse tickets 03/05/06 unchanged (reuse ladder rung 1: no duplicate implementation). Update only this comment and `quarterdeck/CHECKLIST.md`, plus a separately numbered security concern if local evidence warrants it. No new abstraction, dependency direction, public interface, architecture or product model/dispatch change. Validation covers the existing checklist format only; actual repository provisioning, First Mate registration/clone, explicit-path Second Mate seed, hand-made commit/publish/PR body, SC-19 visibility and per-step evidence remain human-only. SC-07's hardened gate is not owned by this ticket.

**Read and traced:** tracker conventions/triage labels; spec SC-08/SC-19 and SC-07 boundary; design capsule, modules, credentials (superseded by ticket 20), constraints, manual checklist and build-order slice 2; decision 37; spike `Setup and workarounds`; ADR 0007 and its ADR 0010 exception; prerequisites 03/05/06 and ticket 20; host command → `qd-entry` → `qd-server` / `qd-first-mate`; Base gitconfig/helper; `qd-publish`; Quarterdeck tests and dependency/test manifest. The spike's local-origin workaround is not GitHub proof and its `gh auth setup-git` must not be repeated.

**Existing implementation, not missing code:**

- 03 is marked done: the host mounts a user-owned file by path; non-root `qd-server` parses declared names, aliases the project token to `GH_TOKEN` / `DEV_SETUP_GITHUB_PAT`, and starts Herdr. Base's helper supplies HTTPS GitHub credentials without storing them. Historical dummy tests cover inheritance and config/inspect absence, not all read-access paths.
- 05 is marked done: the pinned home is seeded and its workspace opens. This is not proof of real GitHub registration/clone or an agent-free startup.
- 06 is marked done: `qd-publish` uses the clone Git directory, disables hooks/fsmonitor, reads issue titles from the named branch commit in numeric order, discovers origin's default branch, pushes, then creates the PR through `gh`. Local bare-origin/stub-gh coverage is already present. Real authentication, push and PR remain unobserved; no placeholder publisher is needed.

**Precise blockers:**

1. **Implementation-contract discrepancy, not merely pending evidence:** the secrets file remains mounted at `/run/quarterdeck/secrets.env`, readable by the same uid 1000 used by `docker exec -u node`; default exec is root. Read-only does not mean unreadable. Existing SC-19 tests check empty exec environment and scan disk paths excluding `/run`. They do not establish “a docker exec shell cannot read the token.” New [security concern 07](../../quarterdeck-security-review/issues/07-quarterdeck-secrets-mount-readable-from-exec.md), `Status: ready-for-human`, records evidence, impact and review criteria. Resolve the boundary or obtain an explicit requirement narrowing; do not tick this criterion based on env absence or test history. No real-token probe is appropriate.
2. **No-agent operating procedure unresolved:** normal startup unconditionally calls `qd-first-mate`, which runs real Claude. `QUARTERDECK_ATTACH_CMD` affects attachment only. Starting normally and killing Claude afterward violates this ticket's no-agent requirement. A human-approved agent-free procedure or separately scoped startup change is required; this ticket does not add an undocumented bypass or change product startup/model dispatch.
3. **Pending human evidence:** no throwaway private repository/scope/settings, First Mate direct-PR/yolo-off registration and helper-backed clone, explicit-path fresh Second Mate clone, one-commit branch, real PR/default branch/body, or sanitized real config/inspect result has been observed. The completed prerequisite tickets do not waive these checks. Follow the gated human-only section in `quarterdeck/CHECKLIST.md` only after blockers 1/2 have an approved disposition; record every result there and here. Failures require separate tickets. Do not create a project container or run the ticket 14/17 flow here.

**Validation:** ran the existing `tests/quarterdeck.test.mjs` checklist-format test in isolation via `node --input-type=module` and `node:test` (read/evaluate that exact test block with its filesystem/assert imports, without the file's global hooks): **1 passed, 0 failed**. This checks the existing SC-02/SC-10 table contract only, not new human outcomes or runtime security. Full `npm run test:quarterdeck` intentionally not run: the file includes an allowlisted-host network test and a GitHub FirstMate fetch in loop fixtures, conflicting with the no-GitHub instruction. Broader regression intentionally not run; neither `npm test`, `test:skill`, nor unrelated suites ran. No behavior change requiring a red-green implementation cycle.

**Handoff:** documentation and concern 07 only; parent performs independent review after the commit, against the fixed point above. No reviewer dispatched and no fresh independent-review result claimed. The design/spec and this ticket remain open. Existing edits to `grill-notes.md`, issue 07 and `CONTEXT.md`, plus untracked security concern 01, remain untouched and excluded from the commit. Existing security concerns are not subsumed into config trust; unsupported `runArgs` rejection, retained Features and all product dispatch settings remain unchanged.

### Independent review closeout — implementation commit `140b85d`

Independent review reports are appended verbatim below. Zero findings; no review dispositions required. Ticket stays `ready-for-human`, all six acceptance criteria remain unchecked, and all existing blockers remain. This is documentation closeout only, not acceptance completion. No tests needed or run for this comment-only closeout; no GitHub contact or credentials access.

## Standards

No findings in `git diff acb9336fc52075a45f3de63431a7537442a0f309...HEAD` (commit `140b85d`).

- Ticket comments and the separate `ready-for-human` security issue follow tracker conventions.
- Unmet criteria remain unchecked; documentation distinguishes static evidence from unperformed validation.
- No applicable baseline code smells; no production code or tests changed.

Reviewed directly, without delegation. No tests run, GitHub contact, credential access, edits, or commits. Unrelated dirty files preserved.

**Standards: 0 findings.**

## Design

No material design violations found in `acb9336...HEAD` (`140b85d`).

- Documentation preserves existing module ownership, interfaces, dependency direction and reuse choices.
- The checklist follows build-order slice 2’s attended, agent-free GitHub flow without claiming unattended or hardened-container validation.
- Missing real-GitHub and SC-19 evidence remains explicitly unproven. Startup and credential-boundary blockers are recorded without introducing an unapproved implementation or narrowing requirements.
- No tests or custom infrastructure were added.

Tests not run; broader regression intentionally not run. No edits, GitHub contact or credential access performed.

**Design: 0 findings.**

## Spec

No new findings in `acb9336...HEAD` (`140b85d`) under the user-authorized blocker-documentation scope.

Outstanding acceptance gaps are accurately recorded, not claimed complete:

- **SC-08 / ticket 13:** “fresh clone from GitHub” and a branch “pushed with `qd-publish`” remain unobserved. All six criteria stay unchecked.
- **SC-19:** “a plain shell entered into the Quarterdeck from outside cannot” read tokens remains unsatisfied by the documented mount boundary. Security concern 07 separately records this for human review.
- **No-agent constraint:** “Run, attended and with no agent in the loop” remains blocked by automatic Claude startup.

The checklist preserves these limitations and does not substitute local/stub coverage for real-GitHub evidence. No scope creep identified.

No tests run, GitHub contact, credential access, edits, or commits. Broader regression intentionally not run.

**Summary: Spec — 0 new findings; real-GitHub acceptance remains open.**
