# 07: Turn off pnpm retries in the migrate test

**What to build:** The migrate test (`tests/dev-container-skill.test.mjs`, "migrate: an npm project with its own dev container moves to the Template…") takes about 22s instead of about 94s, and still proves the same thing.

**Blocked by:** None (can start immediately)

**Status:** wontfix

## Technical context

**Design:** `.scratch/ci-efficiency/design.md` (migrate row). The grilling below replaces its "once measuring confirms" condition.

- **Measured (2026-10-28):**
  - Per step: the expected-failure `import-lockfile` call takes 73.2s of 94.4s; `up --recreate` 9.7s; the other 12 steps about 11s together.
  - Run directly on the host against a dead registry, `pnpm import` takes 70.9s with default retries and 0.9s with `pnpm_config_fetch_retries=0`. The cost is pnpm's retry backoff (10s, then 60s).
  - ci 03's attempt did not reach pnpm: `devcontainer exec` does not pass host env into the container.
- **Modules:** only the migrate test's fixture project.
- **Change:** add `fetch-retries=0` to the fixture's `.npmrc`, next to `registry=`. It applies to the successful import too; that is harmless because the stub runs then.
- **Must not introduce:**
  - changes to the skill helper (it keeps `npx`, Q2);
  - changes to the image or the Variant's pnpm env;
  - a separate test for the failed import (Q3);
  - a timing assertion;
  - weaker assertions.
- **Docker safety:** never prune globally. Only this run's labelled or tagged resources may be removed. Other projects' resources on this machine are never touched.
- **Validation seam:** the migrate test's duration in `npm test` output, before and after.

- [ ] The fixture `.npmrc` sets `fetch-retries=0`; the test's assertions are unchanged
- [ ] The failed import still fails, and package.json and the npm lockfile stay as they were
- [ ] Migrate duration before and after is recorded in Comments
- [ ] `npm test` passes 52 of 52, and Docker lists are equal before and after

## Comments

2026-10-28 grilling, all recommendations accepted:
- Q1: retries off through the fixture's `.npmrc`.
- Q2: the helper keeps `npx`; no env override for its CLI.
- Q3: the failed import stays in the migrate test with the same assertions, no timing assertion.
- Q4: ci 03 gets a correcting Comment.
Rewritten from needs-triage to ready-for-agent.

2026-10-28 implemented as written on a worktree branch (not merged): `fetch-retries=0` in the fixture `.npmrc`, full `npm test` 52 of 52, Docker lists equal, but migrate took 94.7s against 94.4s. pnpm 11 reads only registry and auth keys from `.npmrc`; measured on the host, `.npmrc` `fetch-retries=0` gives 70.9s and `pnpm-workspace.yaml` `fetchRetries: 0` gives 0.9s. Superseded by ci 09, which uses `pnpm-workspace.yaml`.
