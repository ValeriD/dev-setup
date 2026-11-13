# 12: The publish relaunch runs in the Quarterdeck and FirstMate accepts the pull request

**Status:** ready-for-agent
**Model:** Sonnet
**Design slice:** 6 (Publish relaunch), the token-free half

## What to build

After the last ticket the Second Mate writes a route marker and relaunches the same FirstMate record with the note `Publish.`. The launcher sees the marker and runs the real Claude in the Quarterdeck instead of the project container. That session runs `qd-publish`, appends `done: PR <url>`, and FirstMate's own done gate accepts it because the head is now on origin. Extends ticket 11's stub run through publish to a local bare origin with a stub `gh`.

## Decisions

- Design open question 8 (accepted by the user for the MVP, recorded in ticket 07's ADR): a Crewmate redirecting a worktree's `.git` file is an accepted MVP risk; the publish route's overrides only stop hooks and fsmonitor.

## Acceptance criteria

- [ ] The launcher chooses the publish route only when `<home>/data/<id>/qd-route` exists, with the home taken from `FM_TASK_INBOX`; the marker is deleted when used. The same marker placed in `<home>/state/`, or one that the project container could write, is ignored (the project container cannot write `data/`) (launcher row of the Validation plan).
- [ ] In the publish route the launcher runs the real Claude in the Quarterdeck with `--setting-sources user`, and re-appends `core.hooksPath=/dev/null` and `core.fsmonitor=false` `GIT_CONFIG_*` entries after FirstMate's own entries.
- [ ] The extended stub run: after ticket 2 the test writes the marker and relaunches with `--note "Publish."`; the stub session (in the Quarterdeck) runs `qd-publish`, the branch reaches the local origin, the stub `gh` receives the pull request, and the stub appends `done [at=...]: PR <url>` (SC-08 token-free half).
- [ ] After that, `fm-crew-state.sh` no longer reports the head as unreachable and FirstMate's done gate accepts the line; what FirstMate does with the PR through its normal PR path is recorded in a comment on this file (SC-14).
- [ ] The origin has exactly one commit per ticket after the plan commit, in order, and the PR body lists the tickets (SC-04, SC-08).
- [ ] The failing-ticket run of ticket 11 still publishes nothing.
- [ ] `quarterdeck/CHECKLIST.md` gains a row: with a real Claude in the publish route, do `CLAUDE.md` and worktree skills still load (the design flags this as unverified), and do worktree-written settings not load.

## Technical context

**Design:** `.scratch/quarterdeck/design.md`, "Constraints" (publish route), "Spec Run procedure" step 9, "Resolved items" (push step, blocked-until-pushed).

- **Modules:** `quarterdeck/bin/claude` (marker route), `tests/quarterdeck.test.mjs` (stub run extended), `quarterdeck/bin/qd-publish` (ticket 06).
- **Implementation anchors:** FirstMate `fm-dod-lib.sh` (a `done:` is accepted when HEAD is reachable outside the worktree) and `fm-crew-state.sh`; the existing launcher from ticket 09.
- **Reuse:** one FirstMate record and relaunch, as in ticket 11; `qd-publish` unchanged.
- **Dependency direction:** FirstMate relaunch -> launcher -> (marker) real Claude in the Quarterdeck -> `qd-publish` -> git, gh.
- **Must not introduce:** a separate FirstMate record or worktree for the push, the Second Mate running `qd-publish` itself, a local backup remote, a FirstMate patch.
- **Validation seam:** `tests/quarterdeck.test.mjs`; manual row for `--setting-sources user`.
- **Coverage:** owns the publish half of the stub-Crewmate row; token-free halves of SC-08 and SC-14; the "Launcher" row's marker behaviour.

## Blocked by

- 06: `qd-publish` pushes a branch and opens a pull request without running project hooks
- 11: The ticket loop runs plan, ticket 1, ticket 2 with a stub Crewmate
