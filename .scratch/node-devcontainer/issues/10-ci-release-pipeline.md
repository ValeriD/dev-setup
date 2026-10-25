# 10: CI release pipeline

**What to build:**
- Every push to the default branch builds the Node image and runs the acceptance suite against it.
- If the suite passes, the image is published to public GHCR, signed with cosign keyless, and given SBOM and provenance attestations.
- The Node Template is published with the new image digest filled in.
- Anyone can pull the image anonymously and verify it.
- PRs fail when an Action or image isn't pinned.

**Blocked by:** 02 (Walking skeleton)

**Status:** ready-for-agent

**Human prerequisite:** the user creates the GitHub repository `ValeriD/dev-setup`, pushes the local repo, and makes the GHCR packages public after the first publish. The agent writes the workflows and verifies them as far as is possible locally (e.g. `actionlint`), then lists the exact remaining steps for the user.

## Technical context

**Design:** `.scratch/node-devcontainer/design.md`. Use the "CI/release" row, the Reuse decisions (devcontainer CLI build and push, cosign, `anchore/sbom-action`, `actions/attest-build-provenance`, `devcontainers/action`), and the Constraints (every Action pinned by SHA). Ticket 01 Answer question 7 gives the digest substitution approach.

- **Modules:** CI/release (`.github/workflows/`), the Node Template's publish metadata.
- **Image names:** `ghcr.io/valerid/dev-setup/node` and the Template at `ghcr.io/valerid/dev-setup/node` (Templates namespace per `devcontainers/action` conventions).
- **Order:** build → acceptance → push → sign and attest → publish Template. Nothing is pushed if acceptance fails.
- **Must not introduce:** long-lived registry tokens (use `GITHUB_TOKEN` with `packages: write` and `id-token: write`), unpinned Actions, or auto-merge.
- **Validation seam:** the workflow run, plus `cosign verify`, `gh attestation verify` and an anonymous `docker pull`.
- **Coverage:** SC-20, SC-01 (published Template variant), and the mechanical check for unpinned Actions and images.

- [ ] Workflows exist for build, acceptance, publish and Template publish, and pass `actionlint`
- [ ] Every `uses:` is pinned to a full commit SHA; a check fails the PR otherwise
- [ ] After a run on the default branch: `cosign verify` and `gh attestation verify` succeed for the pushed digest, and an anonymous pull works
- [ ] `devcontainer templates apply -t ghcr.io/valerid/dev-setup/node` produces a config referencing that digest
- [ ] The remaining manual steps for the user are listed in the README

## Spike findings to apply (from ticket 01 Answer)

- The Template declares an `imageDigest` option, used as `${templateOption:imageDigest}`. A pre-publish `jq` step rewrites its default to the multi-arch index digest and bumps the Template version, then `devcontainers/action` publishes.
