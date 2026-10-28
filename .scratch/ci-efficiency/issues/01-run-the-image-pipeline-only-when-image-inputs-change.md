# 01: Build, test and publish only when the image or its tests change

**What to build:** A push or pull request that changes only tickets, docs or other files that don't go into the image or its tests runs the cheap checks only. It builds no image, runs no acceptance suite and publishes nothing. Projects stop seeing a "newer verified image" that has no real change in it.

**Blocked by:** None. It needs grilling first.

**Status:** needs-triage

## Found (2026-10-28)

- `.github/workflows/ci.yml` runs every job on every push to `main` and on every pull request, with no `paths` filter.
- Of the last 5 pushes to `main`, 3 changed only tickets or docs: "Mark merged tickets as done", the ADR update, and this ticket's own commit.
- Each push runs about 11 minutes of acceptance, then publish and Template. It also keeps a 714 MB `tested-image` artifact for a day.
- The image records `org.opencontainers.image.revision` = the commit, so every publish has a new digest, even when nothing that goes into the image changed. `status` in Consuming Projects then reports a newer verified image whose only change is the revision label.
- What goes into the image: `variants/node/Dockerfile` COPYs from `base/`, `installer/` and `extensions/`, and `variants/node/extensions.json`. The build also reads `variants/node/devcontainer.json` and the local Feature under `variants/node/.devcontainer/`. The acceptance suite also depends on `tests/`, `templates/` and `skills/dev-container/`.
- The weekly scheduled rebuild exists for OS patches and must keep publishing even when no file changed.

## Open questions for grilling

- Which paths count as image inputs and which as test inputs? Does a change to the tests alone re-run acceptance without publishing?
- Are workflow-level `paths` filters enough, or does the workflow need a job that decides what changed? Required status checks on PRs break when a filtered workflow doesn't run.
- Should the Template still publish when only `templates/` changed?

## Comments

2026-10-28 grilling, all recommendations accepted:
- Q1: image inputs are `base/`, `installer/`, `extensions/` and `variants/node/`. Test inputs are `tests/`, `templates/`, `skills/dev-container/`, `package.json` and `.github/`.
  - A change to image inputs builds, tests and publishes.
  - A change to test inputs only builds and tests.
  - Any other change runs only pins and the unit tests.
  - The weekly schedule and a manual run always publish.
- Q2: a first `changes` job compares against the base with `git diff` and outputs the groups. Later jobs skip on its output. No workflow-level `paths` filter and no third-party action.
- Q8 (round 2): a change to `templates/` alone builds and tests. It then publishes only the Template, pointing at the digest of the image now published as `latest`, with no new image. This needs node-devcontainer 15's separate Template name and its guard that `latest` is the image.
