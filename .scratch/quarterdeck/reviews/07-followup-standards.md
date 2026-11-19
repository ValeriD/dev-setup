## Standards

Reviewed `git diff 04d3a7f...HEAD` directly at `4e3f113`, including commits `55b917c` and `4e3f113`, against the requested standards and full `SMELLS.md`.

**No documented-standard violations, baseline smells, or changed-test value problems found in this diff.**

- `quarterdeck/bin/qd-project-up:49–69`: named `pool`, `hooks`, `bin`, and `state` paths replace positional `sources[n]` accesses, resolving the earlier **Mysterious Name** concern while preserving ownership checks and mount permissions.
- `tests/quarterdeck.test.mjs:146–151`: `set -e` and the before/after HEAD assertion close the false-positive commit probe. The assertions retain distinct protection: intermediate commands must succeed, a new commit must exist, and the Quarterdeck must immediately observe that same commit. No removal or replacement recommended.
- `quarterdeck/bin/qd-project-up:23–24`: explicitly selecting Base’s image-owned Git configuration retains its credential helper without restoring caller-selected `GIT_*` configuration.

These smell and test-value assessments are **judgment calls**, not tooling-enforced rules.

Static review only; no tests run, files modified, or subagents used.

**Summary:** Standards: 0 findings.
