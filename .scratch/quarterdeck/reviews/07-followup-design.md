## Design

No material design-axis violations found in `04d3a7f...4e3f113` (commits `55b917c`, `4e3f113`).

- **Reuse preserved:** The design specifies “Base's read-only gitconfig and credential helper already answer for `github.com`.” Adding `GIT_CONFIG_GLOBAL: '/etc/dev-setup/gitconfig'` restores that existing capability after filtering inherited `GIT_*` variables, while retaining hooks/fsmonitor overrides.
- **Responsibilities and interfaces unchanged:** Naming mount sources `pool`, `hooks`, `bin`, and `state` preserves the approved mount set, ownership checks, creator interface, and dependency direction.
- **Validation strengthened at the planned seam:** Ticket 07 requires “a commit on a worktree in the pool succeeds and is visible in the Quarterdeck at once.” The existing integration probe now uses `set -e` and `assert.notEqual(commit.out.trim(), beforeCommit, ...)`, preventing a failed commit from passing merely because both containers read the existing HEAD. No redundant test layer or custom infrastructure was introduced.

Previously recorded security limitations and coverage gaps were not introduced by this diff.

**Summary:** 0 Design findings. Static review only; no tests run, modifications, or subagents.
