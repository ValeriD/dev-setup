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
