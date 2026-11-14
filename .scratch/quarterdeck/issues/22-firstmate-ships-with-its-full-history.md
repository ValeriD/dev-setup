# 22: FirstMate ships with its full history

**Status:** ready-for-agent
**Model:** Sonnet
**Design slice:** 2 (First Mate home)

## Problem

`quarterdeck/Dockerfile` fetches the FirstMate fork with `--depth 1`. `qd-first-mate` seeds the First Mate's home by copying that checkout. FirstMate's lineage guard (`fm-role-lib.sh`) needs the repository's history and makes `fm-spawn.sh` refuse to dispatch from a shallow home. The loop tests in `tests/quarterdeck.test.mjs` pass only because they fetch the full history before seeding (ticket 11, blocker 1). So no Crewmate can be dispatched from a normally started Quarterdeck. This blocks tickets 11, 12, 16, 17 and 18.

## Decision

The user decided on 2026-11-14 (grill notes, decision 88): the image fetches the full history of `ValeriD/firstmate` at the pinned commit. No edit to the fork (ADR 0008).

## What to build

- The image holds FirstMate at `FIRSTMATE_COMMIT` with complete history, and still verifies that `HEAD` is exactly the pinned commit.
- A First Mate home that an earlier image already seeded shallow under the work root is repaired on start, from the image's own checkout and without network access.
- The loop tests stop preparing the home themselves and run on a home seeded the normal way.

## Acceptance criteria

- [ ] In the built image `git -C /opt/firstmate rev-parse --is-shallow-repository` prints `false` and `HEAD` equals the pinned commit.
- [ ] A home seeded by `qd-first-mate` on a fresh work root is not shallow.
- [ ] A work root holding a shallow home from an earlier image has a full-history home after start; its other files are untouched; no network is used for the repair.
- [ ] The loop tests of tickets 11 and 12 pass with their unshallow step removed: `fm-spawn.sh` dispatches from the normally seeded home.
- [ ] The pin and Renovate checks still cover `FIRSTMATE_COMMIT`; `node scripts/check-pins.mjs` and `node --test tests/pins.test.mjs tests/renovate.test.mjs` pass.
- [ ] `npm run test:quarterdeck` passes. The full suite is not run.

## Blocked by

None.

## Comments

### Implementation plan — 2026-11-14

Fixed point: `e1d439ac694ce41094d5de1670346029dd254418`. Extend the existing Dockerfile fetch and `qd-first-mate` seed path; use Git's local file transport to repair shallow history without resetting the home. Reuse ladder: existing repository flow (2), Git platform commands (4); no new dependency or abstraction. Share `--seed-only` with ticket 23; dependency direction and FirstMate fork remain unchanged.

Validation seam: existing real-container acceptance file. Reuse pinned/fresh-home checks and ticket 11/12 dispatch loops, removing their network preparation. Add offline root-owned-source migration coverage preserving HEAD, refs, index, config, staged/unstaged changes and home files. Run the required pin/Renovate checks, affected Quarterdeck cases, then only the Quarterdeck suite; never the full repository suite.
