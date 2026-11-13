# 02: CI builds the Quarterdeck image and keeps its pins in step

**Status:** done
**Model:** Sonnet
**Design slice:** 1 (support), "CI" in the Validation plan

## What to build

A change under `quarterdeck/` runs the acceptance job, which builds the Quarterdeck image after the node image and runs the whole suite. The Quarterdeck Dockerfile's base digest and Claude version are checked against the Node Variant's. The `@devcontainers/cli` pin in the Quarterdeck Dockerfile is updated by Renovate together with every other copy. Nothing is published, and CI holds no tokens and runs no real agent.

## Acceptance criteria

- [x] The `changes` job in `.github/workflows/ci.yml` has a `quarterdeck` output that is true when `quarterdeck/` changed, and the `acceptance` job runs when that output is true.
- [x] The `acceptance` job builds the Quarterdeck image after the node image when `quarterdeck` or `tests` changed, and no publish job or step pushes it.
- [x] `scripts/check-pins.mjs` covers `quarterdeck/Dockerfile` (base image pinned to a digest) and fails when its base digest or Claude version differs from `variants/node/Dockerfile`; a test shows both failures.
- [x] `renovate.json` and `tests/renovate.test.mjs` cover the CLI pin inside `quarterdeck/Dockerfile`, so one Renovate PR updates it with the other copies and the repo-wide untracked-pin scan passes.
- [x] `skills/dev-container/scripts/test/helper.test.mjs`'s agreement check includes the Quarterdeck Dockerfile's CLI version.

## Technical context

**Design:** `.scratch/quarterdeck/design.md`, "Validation plan / CI" and "Reuse decisions" (devcontainer CLI at the shared pin).

- **Modules:** `.github/workflows/ci.yml` (the `changes` and `acceptance` jobs), `scripts/check-pins.mjs`, `renovate.json`, `tests/renovate.test.mjs`, `tests/pins.test.mjs`.
- **Implementation anchors:** `.scratch/ci-efficiency/issues/08-renovate-updates-every-devcontainer-cli-pin.md` (how the four existing pin locations are matched and tested); the existing `tests` and `template` outputs in `ci.yml`.
- **Reuse:** the existing jobs and Renovate custom manager; add a location, not a new mechanism.
- **Dependency direction:** CI reads `quarterdeck/`; nothing in `quarterdeck/` reads CI.
- **Must not introduce:** an image publish for the Quarterdeck, tokens or secrets in CI, a shared pins file read by code, auto-merge.
- **Validation seam:** `node --test tests/pins.test.mjs tests/renovate.test.mjs`, `npm run test:skill`, and the `renovate-config-validator --strict` command used in ci-efficiency 08. The workflow change is read, not run.
- **Coverage:** no acceptance scenario; this carries the design's CI and pin-agreement rules. Extends `tests/pins.test.mjs`, `tests/renovate.test.mjs` and the helper agreement test.

## Blocked by

- 01: Quarterdeck image and the `quarterdeck` host command

## Comments

Resolution. Built: `quarterdeck` output in `changes`; the acceptance job builds `dev-setup-quarterdeck:ci` (local, never pushed) after the node image when `quarterdeck`, `tests` or `image` changed; `check-pins.mjs` scans `quarterdeck/Dockerfile` and `findDrift` compares base digest, Claude Code and pnpm pins with the Node Variant's; Renovate matches the CLI, Claude and pnpm ARGs in `quarterdeck/Dockerfile`; the helper agreement test includes the Quarterdeck CLI version. The Quarterdeck test opens its own work-root folders when the host uid is not 1000 (CI runners are 1001). Not run: the workflow itself (read only). `npm test` 66 pass; `npm run test:skill` 51 pass; renovate-config-validator --strict ok.

Review: Design 1 (image-only changes to base/installer/extensions skipped the Quarterdeck build) fixed by adding `image` to the build condition. Standards 1-3 (ARCHITECTURE.md rows) fixed: stale CLI-pin sentence updated, rows shortened. Standards smell on names `a`/`b` fixed. Redundant test lines (literal FROM, message-format assertion) removed. Declined: removing the helper agreement assertion (ticket criterion 5 requires it); dedup of `arg` helper (one-line, in a different module); pnpm drift check kept (the Dockerfile says it shares that pin); multi-stage FROM concern (single-stage today).

Later tickets: the uid-1000 limit is a real host limitation of the work root (rootless Docker / other uid), still unsolved in the product.
