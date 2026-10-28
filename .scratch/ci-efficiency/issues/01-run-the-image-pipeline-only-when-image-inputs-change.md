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

**Status:** ready-for-agent

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
- [ ] A test-only change runs acceptance and publishes nothing
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
