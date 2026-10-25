# 06: Verified image updates

**What to build:** "Update my dev container":
1. finds the newest published digest for the project's Variant;
2. verifies its cosign keyless signature (this repo's release workflow identity) and its provenance attestation;
3. shows the Agent version changes and the `git log` between the two image revisions;
4. writes the new digest only after I confirm.

A verification failure writes nothing. Onboarding (ticket 01) also starts verifying the digest it uses.

**Blocked by:** 01 (Skill foundation and onboarding)

**Status:** ready-for-agent

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

- [ ] The image carries revision and version labels, checked by an acceptance assertion
- [ ] `verify-image` fails closed for an unsigned image or an identity mismatch, and nothing is written
- [ ] The update flow shows the version and git-log diff and writes the digest only after confirmation
- [ ] Manual steps for verifying a real signed image are documented
