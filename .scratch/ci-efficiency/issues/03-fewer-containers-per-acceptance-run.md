# 03: Less overhead per test call

**What to build:** The acceptance suite stops paying about a second of devcontainer CLI start-up on every `up`, `exec` and `templates apply`. The migrate test stops waiting on pnpm's network retries in the step that is meant to fail. Every test still proves the same thing.

**Blocked by:** 02 (same harness files, and a stable baseline for timings)

**Status:** ready-for-agent

## Technical context

**Design:** `.scratch/ci-efficiency/design.md` ("Correction to Q4", `tests/global-setup.mjs` and migrate rows).

- **Found:**
  - `tests/lib.mjs` runs every CLI call as `npx -y @devcontainers/cli@0.89.0`, which takes about 1.3s to start, and a run makes about 200 calls.
  - Containers are already shared within files (`acceptance.test.mjs` `a`, `credentials.test.mjs`).
  - The migrate test (`dev-container-skill.test.mjs`, 92s in CI) kills its registry stub and expects `import-lockfile` to fail. pnpm's default fetch retries are the suspected cost; this is not yet measured.
- **Modules:**
  - `tests/global-setup.mjs`: resolve the pinned CLI once per run (into the run root, or a warmed `npx` cache with a recorded bin path) and hand the path to files by env.
  - `tests/lib.mjs`: `cli` uses that path, falling back to `npx` when the env is unset. The pin stays only in `tests/lib.mjs`, because `tests/renovate.test.mjs` and Renovate read it.
  - The migrate test: retries off only for the expected-failure step, through env or the fixture's `.npmrc`.
- **Reuse:** npm and npx with the existing exact pin; no new dependency.
- **Must not introduce:**
  - more container sharing;
  - a second copy of the CLI version;
  - changes to the skill helper's own `npx` use;
  - weaker assertions.
- **Docker safety:** never prune globally. Only this run's labelled or tagged resources may be removed. Other projects' resources on this machine are never touched.
- **Validation seam:** per-test durations from `npm test` output, before and after.
- **Coverage:** the existing suite. Keep the migrate change only if the measurement shows it helps; record both numbers.

- [ ] The CLI is resolved once per run, and the pin stays in one place
- [ ] SC-06, SC-09 and SC-12 durations before and after are recorded in Comments
- [ ] Migrate duration before and after is recorded; the retry change is kept only if it helps
- [ ] `npm test` passes 52 of 52, and Docker lists are equal before and after

## Comments

2026-10-28 grilling, all recommendations accepted:
- Q4: only read-only checks in the same file share one container. Those are SC-06 privilege, SC-09, SC-12, SC-18 and the SC-03 host-exposure checks.
- Tests that recreate or rebuild keep their own containers, SC-17 and SC-05/13 included.
- Migrate keeps the same steps but uses a fixture project with fewer dependencies.

During `/to-design`, Q4 turned out to describe today's state already; the user approved the replacement scope above (Q10). Rewritten as ready-for-agent through `/to-tickets` on 2026-10-28.
