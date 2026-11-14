# 09: The `claude` launcher runs a Crewmate in the project container with the right environment

**Status:** ready-for-agent
**Model:** Sonnet
**Design slice:** 3 (Hardened project container), launcher

## What to build

A launcher named `claude`, first on the Quarterdeck's path, that FirstMate's spawn calls like the real Claude. Under the worktree pool it runs Claude inside the project container for that home; elsewhere it runs the real Claude. In the project container Herdr still sees the agent, Claude's first-run state and folder trust are in place, and only allowed variables cross by name. The publish route (ticket 12) is not part of this ticket.

## Acceptance criteria

- [ ] With the working directory under `/home/node/.treehouse`, the launcher runs `docker exec -u node -it <project container> claude <same argv>`; elsewhere it execs the real Claude with the same argv (SC-02).
- [ ] The `docker` process carries `HERDR_AGENT=claude` (asserted through a recording `docker` shim in the test); real Herdr state through the project container is a manual checklist row (SC-02).
- [ ] Forwarded by name only: `FM_*`, `GIT_CONFIG_*`, `CLAUDE_CODE_*`, `GIT_AUTHOR_*`, `GIT_COMMITTER_*`, `COMPACT_ADVISER_DISABLE`, `TRACEPARENT`. With `GH_TOKEN`, `GITHUB_TOKEN` and `DEV_SETUP_GITHUB_PAT` set in the launcher's environment, none reaches the project container through the launcher. The one GitHub credential a project container may hold, the read-only single-repository extensions token, is delivered at creation by ticket 08, never by the launcher (SC-16, SC-19).
- [ ] `CLAUDE_CODE_OAUTH_TOKEN` reaches the exec by name from the launcher's own environment (the test sets a dummy; how a pane gets it is ticket 03's decision), and `docker inspect` of the project container shows no token (SC-19, project-container half).
- [ ] Before each launch the launcher writes into the project container's `$CLAUDE_CONFIG_DIR/.claude.json`, as user `node` and with `node -e` (the hardened image has no `jq`): `hasCompletedOnboarding: true` if the file is empty or missing, and `projects[$PWD].hasTrustDialogAccepted: true` for the exact worktree path; an existing valid file is merged, not replaced; a trust entry for a parent folder is not relied on.
- [ ] Committer identity: `quarterdeck` passes the host's `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME` and `GIT_COMMITTER_EMAIL` into the Quarterdeck, and a commit made by a stub in the project container carries them (SC-04, identity half).
- [ ] Each launch appends one line to `<work root>/quarterdeck/logs/launch.log` (route, project container, working directory, model argument).
- [ ] The launcher never writes a path other than the exact worktree into trust and never touches the Quarterdeck's own Claude config when routing into the project container.

## Technical context

**Design:** `.scratch/quarterdeck/design.md`, "Modules" (Launcher), "Project container" rows "First-run state and trust", "Exec user and env", "Committer identity". Spike lessons: `spike/FINDINGS.md` "Design consequences" 2 and "Link 2". ADR 0006.

- **Modules:** `quarterdeck/bin/claude` (installed at `/opt/qd/bin/claude`); the host command passes the identity variables.
- **Implementation anchors:** `spike/bin/` (the working launcher), FirstMate `bin/fm-claude-trust.sh` (what it writes and where), `base/claude/` policy.
- **Reuse:** the spike launcher's routing; FirstMate's trust entry shape.
- **Dependency direction:** FirstMate's spawn -> `claude` launcher -> `docker exec` -> project container. FirstMate never knows the Quarterdeck exists.
- **Must not introduce:** a wrapper over `fm-*` commands, baking `.claude.json` into the image (the Claude volume would shadow it), forwarding any GitHub variable, a login step.
- **Validation seam:** `tests/quarterdeck.test.mjs` using the fixture project container from ticket 07, a stub `claude` inside it, and a recording `docker` shim. The `$CLAUDE_CONFIG_DIR` path of the first-run state is unproven in the spike (it used `$HOME`); the test proves it.
- **Coverage:** owns the "Launcher" row of the Validation plan (except the publish marker), the project-container half of SC-19, and the identity half of SC-04. Manual rows for real Herdr state go in `quarterdeck/CHECKLIST.md`.

## Blocked by

- 07: `qd-project-up` creates the project container from the project's main branch

## Comments

### Implementation handoff (steps 1–5 only)

Fixed point: `2590e60e6fd972ae1fba9ef764405c132468ef07`. Implemented the launcher, image wiring, host identity forwarding, hardened-fixture/stub coverage, operating docs and manual checklist. No publish route or other implementation ticket was built; product dispatch is unchanged. Acceptance checkboxes and status are deliberately unchanged pending the parent's independent reviews and closure decision.

The launcher resolves the canonical home from `FM_TASK_INBOX`, requires exactly one running creator/home-labelled container, prepares its own Claude config as `node`, forwards allowlisted names only, and execs interactive Claude with the same argv. Local launches exec the real binary. JSONL logs contain route/container/cwd/model, not prompts. Tests cover missing/empty/merged/malformed config, exact-folder trust without pool-root trust, untouched Quarterdeck config, Docker's Herdr hint, dummy OAuth forwarding without container-config persistence, GitHub-variable exclusion, host-derived commit identity, local argv/exit status, and missing/ambiguous routing refusal.

Validation actually run:
- Initial targeted attempt timed out because the absent launcher reached the real Claude binary with a dummy token; no real token was used and no successful live-agent observation is claimed. The run's labelled containers were removed. Added an explicit installed-launcher assertion and a 30-second execution bound.
- Targeted red: installed-launcher assertion failed. Targeted green: hardened fixture passed after implementation and test-shim path correction.
- Second red: pool-root trust was written. Green after refusing the pool root; local stub formatting was corrected before the final targeted pass.
- Final `npm run test:quarterdeck`: exit 0; **29 tests, 28 pass, 0 fail, 1 todo**. The existing todo assertion still fails on ticket 08's dummy extensions token in `/etc/environment`; it is not evidence of file absence.
- `bash -n` on both changed shell scripts, `node --check tests/quarterdeck.test.mjs`, and `git diff --check` passed.
- Broader regressions intentionally not run: `npm test`, `test:skill`, and all unrelated suites. No real secrets or unsafe credential probes were used.

Exact outstanding evidence/policy limitations:
- Real Herdr working/blocked/done states and prompt-free Claude behavior through the hardened container remain unrun manual evidence: `quarterdeck/CHECKLIST.md`, ticket 09 row. The recording shim proves only the Docker process hint; the stub proves config shape, not the vendor UI.
- Dependency 07's implementation is present and usable. Its outstanding arbitrary Feature/configuration trust and shared Git-store guarantees remain security-review concerns **01** and **03**, not missing launcher code. Existing concern **05** tracks creation-time extensions-token file persistence, unrelated to the launcher's OAuth exec-only delivery. No new distinct security concern was identified, and no preexisting concern was edited or committed.
- This routing assumes FirstMate's supplied home and the single-container-per-home model; it does not establish a new isolation boundary or validate arbitrary project Features.

Independent-review pointers: this ticket and `.scratch/quarterdeck/{spec,design}.md`; implementation `quarterdeck/bin/claude`, `quarterdeck/bin/quarterdeck`, `quarterdeck/Dockerfile`; validation `testLauncherFixture` in `tests/quarterdeck.test.mjs` (runs within `qd-project-up fixture`); current architecture `ARCHITECTURE.md` and `quarterdeck/PROJECT-CONTAINERS.md`. No independent review or final closure was performed here.

Preserved outside this commit: preexisting changes to `grill-notes.md`, ticket 07, `CONTEXT.md`, and untracked security-review concern 01.
