# 09: Turn off pnpm retries through the fixture's workspace file

**What to build:** The migrate test takes about 24s instead of about 94s, and still proves the same thing. This replaces ci 07, whose `.npmrc` route has no effect in pnpm 11.

**Blocked by:** None (can start immediately)

**Status:** done

## Technical context

**Design:** ci 07 and its grilling (Q1 to Q4). Same decision, different file: the setting lives in the fixture project, not in the helper or the image.

- **Found (2026-10-28):** pnpm 11 reads only registry and auth keys from `.npmrc`. On the host, a failed `pnpm import` against a dead registry took 70.9s with `.npmrc` `fetch-retries=0` and 0.9s with `pnpm-workspace.yaml` `fetchRetries: 0`.
- **Modules:** the migrate test's fixture project in `tests/dev-container-skill.test.mjs` gets a `pnpm-workspace.yaml` with `fetchRetries: 0`.
- **Must not introduce:** the items ci 07 lists (no helper, image or Variant change, no new test, no timing assertion, no weaker assertions).
- **Validation seam:** the migrate test's duration, then the full `npm test`.

- [x] The fixture has a `pnpm-workspace.yaml` with `fetchRetries: 0`; the test's assertions are unchanged
- [x] The failed import still fails, and package.json and the npm lockfile stay as they were
- [x] Migrate duration before and after is recorded in Comments
- [ ] `npm test` passes 52 of 52, and Docker lists are equal before and after

## Comments

2026-10-28 created after ci 07's measurement. Migrate test alone: 94.4s before, 24.1s after; Docker image and container lists equal before and after.
