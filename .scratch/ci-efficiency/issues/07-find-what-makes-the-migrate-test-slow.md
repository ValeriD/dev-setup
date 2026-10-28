# 07: Find what makes the migrate test slow

**What to build:** The migrate test (`tests/dev-container-skill.test.mjs`, "migrate: an npm project with its own dev container moves to the Template…") takes much less than its current ~97s, and still proves the same thing.

**Blocked by:** None. It needs grilling first.

**Status:** needs-triage

## Found (2026-10-28, ci-efficiency 03)

- With 3 files at once on the local machine, migrate took 101.1s before ci 03, 97.3s with the CLI resolved once, and 96.5s with pnpm `fetch-retries=0` on the expected-failure import. The retry guess was wrong, so that change was not kept.
- It is the slowest test by far. The next slowest are about 30s.
- The test calls the skill helper. The helper runs the devcontainer CLI through its own `npx -y @devcontainers/cli@0.89.0` (`skills/dev-container/scripts/commands.mjs` `DEVCONTAINER_CLI`): `up --recreate`, `import-lockfile` twice and `frozen-install`, each with `npx` start-up and possibly a container exec with `userEnvProbe`.
- ci-efficiency 03 was not allowed to change the helper's `npx` use.

## Open questions for grilling

- Measure first: which steps take the time? Candidates are `up --recreate` (a full container start with egress), the two `import-lockfile` calls, `frozen-install`, and `npx` start-up in the helper.
- May the helper take the CLI path from an env variable (as the suite now does with `DEV_SETUP_TEST_CLI`), or must it always use `npx` because it runs on the user's host?
- Is the failed-import half (stub killed, files untouched) worth its own, cheaper test?
