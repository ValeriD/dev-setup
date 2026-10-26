# 06: Verified image updates

**What to build:** "Update my dev container":
1. finds the newest published digest for the project's Variant;
2. verifies its cosign keyless signature (this repo's release workflow identity) and its provenance attestation;
3. shows the Agent version changes and the `git log` between the two image revisions;
4. writes the new digest only after I confirm.

A verification failure writes nothing. Onboarding (ticket 01) also starts verifying the digest it uses.

**Blocked by:** 01 (Skill foundation and onboarding)

**Status:** done

## Technical context

**Design:** `.scratch/dev-container-skill/design.md` (approved), with spec `.scratch/dev-container-skill/spec.md`. Glossary: `CONTEXT.md`. ADRs 0001, 0003, 0004, 0005. Ticket rule: never edit tickets other than your own; new needs go into new tickets.

- **Modules:**
  - Image build: add OCI labels for `org.opencontainers.image.revision` and the Claude Code, Codex and pnpm versions. Use whichever of the Dockerfile and CI fits; this is a new change, so don't edit node-devcontainer tickets.
  - Skill helper: `verify-image <ref>`.
  - Skill prompt: the update flow.
- **Reuse:**
  - cosign from a digest-pinned container (`ghcr.io/sigstore/cosign/cosign@sha256:…`) through host Docker. The host has no cosign, and its `gh` 2.45 lacks `gh attestation`.
  - Attestations are already pushed to the registry by `.github/workflows/ci.yml`.
- **Constraints:** fail closed, with no override flag; the identity is pinned to `ValeriD/dev-setup`'s workflow.
- **Validation seam:** helper integration test against a local registry, where an unsigned image fails. A manual check covers the success path once CI has run on GitHub.
- **Coverage:** SC-08.

- [x] The image carries revision and version labels, checked by an acceptance assertion
- [x] `verify-image` fails closed for an unsigned image or an identity mismatch, and nothing is written
- [ ] The update flow shows the version and git-log diff and writes the digest only after confirmation
- [x] Manual steps for verifying a real signed image are documented

## Comments

**Implementation notes (agent, 2026-10-25):**

- Labels: `io.github.valerid.dev-setup.{claude-code,codex,pnpm}.version` from the Dockerfile ARGs; `org.opencontainers.image.revision` from a `REVISION` build arg that `variants/node/devcontainer.json` fills from host env `DEV_SETUP_REVISION` (set in CI to `github.sha`, by `tests/lib.mjs` to `git rev-parse HEAD`). `devcontainer build --label` was tried first: CLI 0.89.0 drops it on the Features build path. The LABEL sits last in the Dockerfile so a new commit keeps the layer cache.
- `verify-image VARIANT [--ref IMAGE] [--current IMAGE]` (Variant-first like `image-digest`, rather than a bare ref): resolves the tag with `docker buildx imagetools`, then cosign v3.1.3 (`ghcr.io/sigstore/cosign/cosign:v3.1.3@sha256:9e5c…`, tracked by a new Renovate regex manager) runs `verify` and `verify-attestation --type slsaprovenance1` with identity `^https://github\.com/(?i:valerid/dev-setup)/\.github/workflows/ci\.yml@refs/heads/main$` and the GitHub Actions issuer. Stricter than README/CI (`^https://github.com/ValeriD/dev-setup/`): other workflows and branches are rejected. No skip option exists (tested). `--current` adds `changes.versions` and `changes.log`, the `git log` restricted to the image's source paths (`base installer extensions variants/<v>`); a revision missing from the checkout yields a fetch note instead.
- Automated failure path (`tests/dev-container-skill.test.mjs`): unsigned image in the local registry fails with "no signatures found"; the same digest signed with a throwaway cosign key fails too (a signature exists, not from the workflow identity). Manually confirmed against a real keyless signature: the cosign image itself verifies with its own identity and is rejected with ours ("expected SAN value to match regex ..."); this is listed in the checklist.
- Not verifiable until CI publishes: whether cosign v3 finds the `actions/attest-build-provenance` bundle pushed as an OCI referrer (`push-to-registry`). Manual steps in `docs/manual/dev-container-skill-checklist.md` ("Verifying a real signed image") and checklist rows 11 and 12.
- Onboarding now uses `verify-image` and stops when verification fails, so onboarding cannot complete until a signed image is published (by design). `image-digest` is kept (tests use it for local images) but labelled unverified and no flow uses it.
- Host note: this host's `docker login ghcr.io` credential is stale (ghcr returns 403 even for public images), so `imagetools inspect` of ghcr images fails here until `docker logout ghcr.io`; the helper's error says so. The cosign image is pulled with an empty Docker config (on the current context's daemon) and cosign runs with no config mounted, so verification itself never depends on host registry logins.
- Review follow-up: `validate` now also returns the project's `variant` (from the image repository), so the update flow does not derive it by hand. `verify-image --current` adds `changes.newer` (`git merge-base --is-ancestor`), and the flow stops on an older image (rollback). `publish` in `ci.yml` is gated to `refs/heads/main`, matching the pinned identity, so a manual run on another branch cannot move `:latest` to an image that cannot be verified. Two focused helper tests are deliberate: the signer regexp (the design's risky integration point; JS regexp semantics, with real cosign covered by the integration and manual checks) and `imageChanges` (the success-path change summary, which cannot run through the CLI without a keyless-signed image).
- Still open, needing a published image: the update-flow box (confirm then write is prompt-enforced, checklist rows 11 and 12), and whether cosign v3's `verify --output json` for new-format bundles carries `critical.image.docker-manifest-digest` (if not, verification fails closed and the check needs adjusting).
