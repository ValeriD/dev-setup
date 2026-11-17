# 25: The launcher also trusts the Project clone's root, so no trust dialog appears

**Status:** closed
**Model:** Sonnet
**Design slice:** 4 (Crewmate in the project container)

## Problem

In task B on 2026-11-17 (ticket 14's comment), a Crewmate started through the launcher stopped at Claude's folder-trust dialog. The launcher had written `hasTrustDialogAccepted: true` for the exact worktree, `/home/node/.treehouse/pomoplan-748f0a/1/pomoplan`. Claude also created an entry for the clone's root, `/home/valeri/work/fleet/sm-pomoplan/projects/pomoplan`, with trust `false`, and showed the dialog. For a git worktree, Claude evidently checks trust on the repository the worktree belongs to. Any prompt breaks SC-10, so every Crewmate needs a person to press a key.

## Decision

The user decided on 2026-11-17 that the launcher may also trust the Project's clone root, `<home>/projects/<project>`, for the worktree it launches in. This widens ticket 09's rule ("never writes a path other than the exact worktree into trust") by exactly that one path. Parent folders, the pool root and the Second Mate's home stay untrusted.

## What to build

Before each launch into the project container, the launcher writes trust for the exact worktree, as it does now, and also for the main repository that worktree belongs to. It finds that repository from the worktree's git data. It does not guess from the path.

## Acceptance criteria

- [x] For a pool worktree of `<home>/projects/<project>`, the project container's `$CLAUDE_CONFIG_DIR/.claude.json` has `hasTrustDialogAccepted: true` for both the worktree path and `<home>/projects/<project>`. The existing file is merged, not replaced.
- [x] No other path gets trust: not the pool root, not `<home>`, not any parent folder. A trust entry that is already `true` for another path is left as it is.
- [x] The repository root is taken from the worktree's git data, and only when it is the clone of the home's own Project (`<home>/projects/<project>`, with the home taken from the launch). A worktree whose git data points anywhere else gets trust for the worktree only, plus one line in `launch.log` saying so. A Crewmate can redirect a worktree's `.git` file (ADR 0009), and this rule keeps that from earning trust for an arbitrary folder.
- [x] The existing launcher tests pass. The stub-Claude test is extended to check both entries.
- [x] `quarterdeck/CHECKLIST.md`'s SC-10 row for a Crewmate notes that a re-run of ticket 14 step 5 must show no trust dialog.
- [x] `npm run test:quarterdeck` passes, followed by `npm run test:cleanup` with no test containers left. The full suite is not run.

## Technical context

- **Modules:** `quarterdeck/bin/claude` (the launcher) and its tests in `tests/quarterdeck.test.mjs`.
- **Reuse:** the launcher's existing `node -e` merge of `.claude.json`, and the home and project it already knows for the route.
- **Must not introduce:** any trust outside the project container, a change to the Quarterdeck's own Claude config, or anything FirstMate-specific in Base or the Variant.
- **Validation seam:** the project container's `.claude.json` after a stub launch. The real dialog is checked by the user in the ticket 14 re-run.

## Blocked by

None.

## Comments

Resolved (one commit). The launcher finds the repository with `git rev-parse --git-common-dir` and, only when it is `<home>/projects/<x>/.git` (home from the launch), trusts that folder along with the worktree; otherwise it trusts the worktree and appends a `note` record to `launch.log`. The test covers a pre-existing config and a redirected worktree. `npm run test:quarterdeck` 39/39, then `test:cleanup`. Review findings: ADR 0006 line updated (fixed); a sibling `<home>/projects/<other>` is accepted because the launch carries no project name (declined, noted for a later ticket); the logging helper duplication and the heavy `script` wrapper in the new test (declined, minor).
