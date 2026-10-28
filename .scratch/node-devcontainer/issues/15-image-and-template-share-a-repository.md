# 15: The Template gets its own registry name, and `latest` stays the image

**What to build:** CI publishes the Template as `ghcr.io/valerid/dev-setup/templates/node`, separate from the image `ghcr.io/valerid/dev-setup/node`. After the Template publish, a guard fails the run unless `ghcr.io/valerid/dev-setup/node:latest` resolves to the image digest this run published. Publishing a Template version no longer adds a git tag to the repository. The README and the manual checklist use the new Template name.

**Blocked by:** None (can start immediately)

**Status:** done

## Technical context

**Design:** `.scratch/ci-efficiency/design.md` (capsule, `template` job row, Rollout).

- **Found (CI run 40681113721):** the Template publish moved the image's `latest` to the Template artifact, and also pushed `0`, `0.1` and `0.1.5`. The skill reads `options.image.default` (`…/node:latest`) to find the newest image, so `verify-image` and onboarding would read the Template.
- **Modules:**
  - `.github/workflows/ci.yml` `template` job: `TEMPLATE_NAMESPACE` becomes `valerid/dev-setup/templates`, `disable-repo-tagging: "true"`, and a final guard step.
  - `README.md`: Template commands and names.
  - `docs/manual/dev-container-skill-checklist.md`: any Template reference.
  - `ARCHITECTURE.md` CI/release row: rewrite the row, never append.
- **Implementation anchors:** the existing `publish` step "Resolve digest", which uses `docker buildx imagetools inspect … --format '{{.Manifest.Digest}}'`. The guard compares `${IMAGE}:latest` against `needs.publish.outputs.digest`.
- **Reuse:** `devcontainers/action` inputs (already pinned); `imagetools`.
- **Dependency direction:** the Template references the image, never the reverse.
- **Must not introduce:** a change to the image's name, tags or labels; a change to `verify-image`'s identity; new workflows or actions.
- **Rollout:** ci-efficiency 01 is not in yet, so the push of this ticket publishes. That run moves `latest` back to the image. Cleanup is ci-efficiency 06.
- **Validation seam:** the CI run on `main` after the push, plus the guard's shell check tried locally against a wrong digest. Run `actionlint` locally (the `rhysd/actionlint` image is present) if available.
- **Coverage:** no acceptance-suite change; the suite applies the Template from its own local registry.

- [x] The Template publishes under namespace `valerid/dev-setup/templates`, with no git tag per version
- [x] A guard step fails the run when `node:latest` is not the digest just published (shell check shown failing locally against a wrong digest)
- [x] README, checklist and `ARCHITECTURE.md` name `ghcr.io/valerid/dev-setup/templates/node`
- [ ] After the CI run on `main`: `node:latest` is an image manifest, and `templates apply -t ghcr.io/valerid/dev-setup/templates/node` gives that digest

## Comments

2026-10-28: the user answered "yes" to the first round of recommendations:
- Q1: move the Template to namespace `valerid/dev-setup/templates`; the image keeps its name.
- Q2: the next publish moves `latest` back to the image, and the user deletes the stray `0`, `0.1` and `0.1.5` tags by hand.
- Q3: CI checks after the Template job that `node:latest` is still the image it just published.

ci-efficiency Q7 folds in here: `disable-repo-tagging: true`, with the version staying `0.1.<run number>`. Rewritten as ready-for-agent through `/to-tickets` on 2026-10-28.

2026-10-28: implemented. The last box needs a CI run on main after the push and is still open. The checklist names no Template package, so it needed no change. Added a docker/login-action step (already pinned) before the guard so imagetools can read a private package.

2026-10-28 manual run 40742897800:
- `node:latest` and `sha-e2a1e9784289` both point to image manifest `sha256:7691d5c9…79c1`. The guard step ("latest is still the image") passed.
- The Template went to `ghcr.io/valerid/dev-setup/templates/node` with tags `0`, `0.1`, `0.1.7` and `latest` (`sha256:862f7a8e…6f6a`). Collection metadata went to `ghcr.io/valerid/dev-setup/templates:latest`. No git tag was pushed.
- The `templates apply` half of the box is not checked yet, because the packages are still private (ci 06).
