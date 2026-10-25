# 11: Renovate and weekly rebuild

**What to build:**
- Renovate opens update PRs for the base image digest, the Agent CLI versions, pnpm, GitHub Action SHAs and Extension Manifest Pinned Refs.
- PRs that bump a Pinned Ref or an Agent version are never auto-merged.
- A scheduled weekly workflow rebuilds and republishes the image, so OS security patches arrive without my involvement.

**Blocked by:** 06 (Extension installer tracer), 10 (CI release pipeline)

**Status:** done

## Technical context

**Design:** `.scratch/node-devcontainer/design.md`. Use the "CI/release" row, the Reuse decisions (Renovate native managers plus custom regex managers), and the Constraints (never auto-merge Pinned Ref or Agent version PRs).

- **Modules:**
  - CI/release: `renovate.json`, using native Docker digest, npm and github-actions managers, plus custom regex managers for the Agent version pins and the manifest `sha` fields (git-refs datasource).
  - CI/release: a weekly `schedule:` trigger on the release workflow.
- **Must not introduce:** auto-merge for Pinned Refs or Agent versions, or a self-hosted Renovate.
- **Validation seam:** `renovate-config-validator` and a config test that asserts the no-auto-merge rules. The schedule is checked in the workflow file. Real PRs are observed after the user installs the Renovate GitHub App (human step, listed in the README).
- **Coverage:** SC-21.

- [x] `renovate-config-validator` passes
- [x] A test asserts that Pinned Ref and Agent version updates have auto-merge disabled
- [x] The regex managers match the actual pin locations, with a test running them against the repo files
- [x] The release workflow has a weekly schedule
- [x] The README lists the Renovate App installation step
