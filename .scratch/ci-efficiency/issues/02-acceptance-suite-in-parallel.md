# 02: Build the image once per run, and run test files 3 at a time

**What to build:** `npm test` builds the image once for the whole run, not once per test file. It then runs 3 test files at once, locally and in CI. `DEV_SETUP_TEST_CONCURRENCY` overrides the number, and `1` gives today's behaviour. Runs still clean up only what they own.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

## Technical context

**Design:** `.scratch/ci-efficiency/design.md` (the `tests/global-setup.mjs`, `tests/lib.mjs` and `package.json` rows; Q3, Q9).

- **Found:**
  - Every container test file calls `buildImage()` in `before`, so a local run builds once per file. Three files at once would build the same tag at the same time.
  - In CI, `DEV_SETUP_TEST_SKIP_BUILD` already makes it a no-op.
  - Files are already isolated: per-file Template registries on random loopback ports, registry stubs on container loopback, derived images tagged with `process.pid`, and the run id and run label from node 12 and 14.
- **Modules:**
  - `tests/global-setup.mjs`: builds the run's image once, still skipped by `DEV_SETUP_TEST_SKIP_BUILD` or a supplied `DEV_SETUP_TEST_IMAGE`.
  - `tests/lib.mjs`: `buildImage()` only checks that the run's image exists.
  - `package.json` `test`: `--test-concurrency=${DEV_SETUP_TEST_CONCURRENCY:-3}`.
  - `ARCHITECTURE.md`: acceptance-suite row, rewritten in place.
- **Reuse:** `node --test --test-concurrency` (built in); the existing run label on the build (node 14).
- **Must not introduce:**
  - a serial group (Q9), which is only allowed after a seen flake, recorded in Comments;
  - container sharing;
  - a prune or removal by name pattern;
  - removal of a supplied image.
- **Docker safety:** never prune globally. Only this run's labelled or tagged resources may be removed. Other projects' resources on this machine (Solana, audit-env, supabase, rippled) are never touched.
- **Validation seam:** `npm test` exit and duration; `docker images -a` and `docker ps -a` before and after.
- **Coverage:** the existing suite, `cleanup.test.mjs` included. Running one test file directly (`node --test tests/x.test.mjs`) still works, by building when no run image exists or by documenting `npm test` as the way.

- [ ] One image build per local `npm test` run, shown in the log
- [ ] `npm test` runs 3 files at once and passes 52 of 52; duration recorded in Comments
- [ ] `DEV_SETUP_TEST_CONCURRENCY=1 npm test` passes, serially
- [ ] Docker image and container lists are equal before and after the run

## Comments

2026-10-28 grilling, all recommendations accepted:
- Q3: run 3 test files at once in CI and locally. An env variable overrides it, for example 1 for debugging.
- Q9 (round 2): no serial group at the start. SC-04 and fail closed run in parallel like the rest. A file moves to serial only after it is seen to flake.

The design adds the build-once prefactor. Rewritten as ready-for-agent through `/to-tickets` on 2026-10-28.
