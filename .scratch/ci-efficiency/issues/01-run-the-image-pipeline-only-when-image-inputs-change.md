# 01: CI runs only what the change needs

**What to build:** A first CI job works out what a push or pull request changed, and the other jobs run only when needed:

| What changed | What runs |
|---|---|
| Docs or tickets only | Pins and unit tests |
| Tests only | Pins, unit tests and acceptance; nothing is published |
| `templates/` only, on `main` | Acceptance, then the Template alone, pointing at the cosign-verified image now at `latest` |
| Image inputs, the weekly schedule, or a manual run | Everything, as today |

A force push, a first push or an unreachable base counts as "everything changed".

**Blocked by:** node-devcontainer 15 (same `template` job, and the guard the template-only path relies on)

**Status:** done

## Technical context

**Design:** `.scratch/ci-efficiency/design.md` (the `changes`, `acceptance` and `template` rows; "Changed flows").

- **Modules:** `.github/workflows/ci.yml`:
  - a new `changes` job;
  - the `needs`/`if` of `acceptance`, `publish` and `template`;
  - the template-only digest source in `template`.
  - Also the `ARCHITECTURE.md` CI/release row (rewrite in place) and the README CI paragraph.
- **Path groups (Q1):**
  - `image`: `base/`, `installer/`, `extensions/`, `variants/node/`.
  - `tests`: `tests/`, `templates/`, `skills/dev-container/`, `package.json`, `.github/`, `renovate.json`.
  - `template`: `templates/`.
- **Base (Q2):** for a PR, the merge base with `github.base_ref`; for a push, `github.event.before`. `schedule`, `workflow_dispatch`, an all-zero or missing `before`, and an unreachable base count as everything changed.
- **Template-only path (Q8):** the `template` job resolves `${IMAGE}:latest`. It verifies it with `cosign verify` using the publish job's `--certificate-identity-regexp` and issuer (cosign-installer is already pinned), then fills in that digest. The node 15 guard then checks `latest` is unchanged.
- **Reuse:** `git diff --name-only` in shell; job-level `if` with `!cancelled()` and explicit `needs.<job>.result` checks (skipped counts as passed).
- **Must not introduce:** workflow-level `paths` filters, a path-filter or other third-party action, new permissions on `acceptance` or `pins`, signing on the template-only path, or extra workflows.
- **Validation seam:** job lists of real CI runs; `actionlint` locally (the `rhysd/actionlint` image is present).
- **Coverage:** no suite change. Check the `changes` logic locally by running its shell against a few commit ranges of this repo: docs-only, test-only, image, and `templates/`-only, if one exists, or a constructed diff list.

- [ ] A docs-only change runs only `changes` and `pins`
- [x] A test-only change runs acceptance and publishes nothing
- [ ] An image change, the weekly schedule and `workflow_dispatch` publish as before
- [ ] A `templates/`-only change on `main` publishes only the Template, pointing at the verified current `latest` (left unticked until such a change runs)
- [ ] Force push, first push and unreachable base count as everything changed

## Comments

2026-10-28 grilling, all recommendations accepted:
- Q1: image inputs are `base/`, `installer/`, `extensions/` and `variants/node/`. Test inputs are `tests/`, `templates/`, `skills/dev-container/`, `package.json` and `.github/`.
  - A change to image inputs builds, tests and publishes.
  - A change to test inputs only builds and tests.
  - Any other change runs only pins and the unit tests.
  - The weekly schedule and a manual run always publish.
- Q2: a first `changes` job compares against the base with `git diff` and outputs the groups. Later jobs skip on its output. No workflow-level `paths` filter and no third-party action.
- Q8 (round 2): a change to `templates/` alone builds and tests. It then publishes only the Template, pointing at the digest of the image now published as `latest`, with no new image. This needs node-devcontainer 15's separate Template name and its guard that `latest` is the image.
- The design adds `renovate.json` to the test inputs, because `tests/renovate.test.mjs` reads it.

Rewritten as ready-for-agent through `/to-tickets` on 2026-10-28.

2026-10-28 implemented (`ci.yml`, `ARCHITECTURE.md` CI row, README CI paragraph). No box is ticked: each needs a real CI run, which was not possible from a worktree.

- `changes` job: `fetch-depth: 0`, one shell step; outputs `image`, `tests`, `template`, `publish_image`, `publish_template_only` (the last two `main` only). `acceptance` runs on any group; it saves and uploads the image only when `publish_image`. `publish` and `template` use `!cancelled()` plus explicit `result == 'success'` checks on `pins`, `acceptance` and `publish`.
- Template-only path: `template` logs in, installs cosign, resolves `${IMAGE}:latest` to a digest, runs `cosign verify` on that digest (same identity regexp and issuer as `publish`), fills in that digest, publishes, and the guard compares `latest` with that same resolved digest (not `needs.publish.outputs.digest`). No new permissions; nothing is signed.
- `actionlint` 1.7.7 on a copy of `ci.yml`: clean (exit 0). `npm run test:installer` 52/52, `npm run test:skill` 51/51, `node scripts/check-pins.mjs` and `tests/pins.test.mjs` pass.

Local evidence: the run block of the `changes` step was extracted from `ci.yml` and run unmodified. Result format: `image tests template publish_image publish_template_only`.

Real commit ranges of this repo (push to `main`, `before` = parent, tip = the commit):

| Range | Result |
|---|---|
| `9c67f48` (tickets and design only) | false false false false false (only `changes` and `pins`) |
| `2f5af2e` (`tests/acceptance.test.mjs`) | false true false false false (acceptance, no publish) |
| `06d4a39` (`skills/dev-container/`, docs) | false true false false false |
| `04318c9` (`ci.yml`, README, ARCHITECTURE) | false true false false false (the rollout commit publishes nothing) |
| `1e80ad8` (`extensions/`, `installer/`, `templates/`) | true true true true false (everything) |

Constructed file lists (`git diff` stubbed):

| Case | Result |
|---|---|
| docs only, push or PR | false false false false false |
| test only (`tests/lib.mjs`) | false true false false false |
| `installer/` + README, push | true false false true false |
| `variants/node/Dockerfile`, PR | true false false false false (no publish on a PR) |
| `templates/` only, push to `main` | false true true false **true** |
| `templates/` only, PR | false true true false false (acceptance, nothing published) |
| `templates/` + `base/`, push | true true true true false (full publish; `template` follows `publish`) |
| `renovate.json` only | false true false false false |
| all-zero `before` | true true true true false |
| empty `before` | true true true true false |
| `schedule` | true true true true false |
| `workflow_dispatch` on `main` | true true true true false |
| `workflow_dispatch` on another branch | true true true false false (tests, but no publish) |
| real unreachable base (`deadbeef...`, `git cat-file` fails) | true true true true false |

Not run locally, to confirm in CI: the PR merge-base branch (`origin/$BASE_REF` after `fetch-depth: 0`), `github.event.before` on a real force push, the `if` expressions with skipped `needs`, and the template-only `cosign verify` and guard against GHCR. Rollout per the design: `ci.yml` is a test input, so merging it publishes nothing; run `workflow_dispatch` once on `main`.

2026-10-28 first runs on GitHub (e2a1e97):
- Push run 40742878096 (test inputs changed, no image inputs): `changes`, `pins` and `acceptance` ran; `publish` and `template` were skipped. Acceptance job 3m38s, against 8m21s before.
- Manual run 40742897800 (`workflow_dispatch`): everything ran and published. Image `ghcr.io/valerid/dev-setup/node@sha256:7691d5c9…79c1`, signed and attested; Template published from the publish digest (`TEMPLATE_ONLY: false`).
- Still unproven: docs-only, image-change and schedule paths, template-only path, force/first push.
