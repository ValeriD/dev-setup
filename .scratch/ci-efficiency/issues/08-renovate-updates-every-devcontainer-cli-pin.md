# 08: Renovate updates every devcontainer CLI pin together

**What to build:** A new `@devcontainers/cli` version arrives as one Renovate PR that updates every place the version is pinned, and that PR passes CI. A new pin location that Renovate doesn't track fails a test.

**Blocked by:** None (can start immediately)

**Status:** done

## Technical context

**Design:** `renovate.json` custom managers and `tests/renovate.test.mjs` (node-devcontainer 11). No separate design document.

- **Found (2026-10-28):** the version `0.89.0` is pinned in four places:
  - `.github/workflows/ci.yml` `CLI_VERSION`;
  - `tests/lib.mjs` `CLI_SPEC`;
  - `skills/dev-container/scripts/commands.mjs` `DEVCONTAINER_CLI`;
  - `README.md`, the two "By hand" commands.

  The only manager matches `CLI_VERSION:`. `helper.test.mjs` asserts that the first three agree, so a Renovate PR would fail today.
- **Modules:**
  - `renovate.json`: one regex manager for `@devcontainers/cli` replaces the `CLI_VERSION:` one. It matches `CLI_VERSION: X` in workflows and `@devcontainers/cli@X` in `tests/lib.mjs`, `skills/dev-container/scripts/commands.mjs` and `README.md`.
    - Renovate puts every update of the same dependency and version on one branch.
    - If the native npm manager or the workflow manager would also pick up a location, avoid a duplicate update, for example by restricting files.
  - `tests/renovate.test.mjs`:
    - The manager's regex hits each of the four files, and every version found is the same.
    - A repo-wide search for `@devcontainers/cli@<version>` and `CLI_VERSION:` (excluding `.git`, `node_modules`, `.scratch` and the test itself) finds no file that the manager doesn't cover.
  - `skills/dev-container/scripts/test/helper.test.mjs`: the agreement check also covers `README.md`.
  - `tests/lib.mjs`: correct the comment on `CLI_SPEC` (it is not "the one pin"); no code change.
- **Reuse:** Renovate custom regex managers; the existing `run`/`patternMatches` helpers in `tests/renovate.test.mjs`.
- **Must not introduce:**
  - a shared pins file read by code or CI (Q5);
  - unpinned CLI commands in the README (Q6);
  - auto-merge.
- **Validation seam:** `npm run test:skill`, `node --test tests/pins.test.mjs tests/renovate.test.mjs`, and `npx -y -p renovate@44.181.6 renovate-config-validator --strict renovate.json`.

- [x] One Renovate manager covers all four pin locations
- [x] `tests/renovate.test.mjs` proves each location is matched with the same version, and fails on an untracked location
- [x] `helper.test.mjs`'s agreement check includes the README
- [x] The `tests/lib.mjs` comment is accurate
- [x] The test commands above pass, and the validator passes with `--strict`

## Comments

2026-10-28 grilling, all recommendations accepted:
- Q5: separate literal pins, one manager over all four files.
- Q6: the README stays pinned and is kept in sync.
- Q7: a per-file match test plus a repo-wide search for untracked locations.
- Q8: Sonnet agent, in parallel with ci 07.
Rewritten from needs-triage to ready-for-agent.

2026-10-28: Implemented. One `@devcontainers/cli` regex manager (two matchStrings) now covers `.github/workflows/*.yml`, `tests/lib.mjs`, `skills/dev-container/scripts/commands.mjs` and `README.md`. `tests/renovate.test.mjs` proves it matches all four with one version and scans the repo for uncovered pins (it fails on a scratch file holding a pin). The helper agreement test now includes `README.md`. The `CLI_SPEC` comment is corrected. No shared pins file, README stays pinned, no auto-merge.
