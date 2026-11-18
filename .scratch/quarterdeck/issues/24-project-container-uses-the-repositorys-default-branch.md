# 24: The project container uses the repository's default branch, `main` or `master`

**Status:** done
**Model:** Sonnet
**Design slice:** 3 (Project container)

## Problem

`qd-project-up` always fetches `refs/heads/main` and reads `.devcontainer/` from `origin/main`. A repository whose default branch is `master` fails with `couldn't find remote ref refs/heads/main`. This happened on 2026-11-17 in task B of `.scratch/quarterdeck/your-tasks.md`: pomoplan's default branch is `master`. The user works with repositories of both kinds.

## Decision

The user decided on 2026-11-17 that the Quarterdeck supports a repository whose default branch is `main` or `master`. Wherever the spec, the design and decision 92 say "`main`", read "the repository's default branch, as origin reports it". The trust rule is unchanged: only Projects whose default branch the user controls are started.

## What to build

`qd-project-up` asks origin which branch is its default, the same way `qd-publish` already does (`git ls-remote --symref origin HEAD`). It then fetches that branch and takes `.devcontainer/` from it. For a repository whose default branch is `main`, everything behaves exactly as before.

## Acceptance criteria

- [x] With a fixture origin whose `HEAD` points at `master`, `qd-project-up` creates the container from `master`'s `.devcontainer/`, with the same mounts, labels and checks as a `main` origin (SC-16).
- [x] A change to `.devcontainer/` on the default branch recreates the container. A change on any other branch, `main` included when the default is `master`, changes nothing.
- [x] When origin reports no default branch, `qd-project-up` fails before creating anything, with a message naming the problem. It does not guess `main`.
- [x] Every existing `qd-project-up` case with a `main` origin passes unchanged.
- [x] The branch is read through the same git environment `qd-project-up` already uses: hooks and fsmonitor off, the image's credential helper, no caller-chosen global config.
- [x] `quarterdeck/PROJECT-CONTAINERS.md`, the `qd-project-up` header and `docs/architecture/quarterdeck.md` say "default branch" where they now say "main".
- [x] `npm run test:quarterdeck` passes, followed by `npm run test:cleanup` with no test containers left. The full suite is not run.

## Technical context

- **Modules:** `quarterdeck/bin/qd-project-up`, plus its tests in `tests/quarterdeck.test.mjs`. `qd-publish` already handles any default branch and does not change.
- **Reuse:** the `ls-remote --symref` line in `quarterdeck/bin/qd-publish`. No new dependency.
- **Must not introduce:** a per-Project setting naming the branch, a fallback list (`main`, then `master`), or any change to FirstMate (ADR 0008). FirstMate already follows the clone's default branch.
- **Out of scope:** Projects with no remote (the Errands spec), which are created with `main`.

## Blocked by

None.

## Comments

### Resolution (ticket agent)

`qd-project-up` reads origin's default branch with `git ls-remote --symref origin HEAD` through its existing hardened git environment, fetches and exports that branch, and fails before creating anything when origin reports none (no `main` fallback). New acceptance test covers `master`, no default branch, non-default-branch change (no recreate) and default-branch change (recreate). Docs updated (PROJECT-CONTAINERS.md, header, docs/architecture/quarterdeck.md, ARCHITECTURE.md, CHECKLIST.md wording). `npm run test:quarterdeck`: 43/43; cleanup clean. Review: no blockers; CHECKLIST wording fixed; the quoted security-review ticket left unedited (immutable).
