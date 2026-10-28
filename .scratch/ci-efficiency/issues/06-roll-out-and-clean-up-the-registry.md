# 06: Roll out and clean up the registry

**What to build:** After node-devcontainer 15's CI run, the registry holds only what belongs there, and both packages can be pulled anonymously:
- The image `ghcr.io/valerid/dev-setup/node` has tags `sha-<12>` and `latest` only.
- The Template `ghcr.io/valerid/dev-setup/templates/node` has its own package.

**Blocked by:** node-devcontainer 15, and its CI run on `main` succeeding

**Status:** ready-for-human

## Technical context

**Design:** `.scratch/ci-efficiency/design.md` (Rollout).

- **The user (GitHub package settings):**
  - Delete the stray tags `0`, `0.1` and `0.1.5` on `dev-setup/node`.
  - Delete the `dev-setup` collection-metadata package (`ghcr.io/valerid/dev-setup:latest`).
  - Optionally, delete the git tag `template_node_0.1.5`.
  - Make `dev-setup/node` and `dev-setup/templates/node` (and its collection metadata) public.
- **Then the agent:**
  - Anonymous `docker buildx imagetools inspect` of `node:latest`.
  - `verify-image node` through the skill helper.
  - `templates apply` from the published Template.
  - Tick node-devcontainer 10's two open boxes.

- [x] Stray tags and the old metadata package are gone
- [x] Both packages are public, and an anonymous pull of `node:latest` works
- [x] `verify-image node` passes against the published image
- [ ] node-devcontainer 10's two CI boxes are ticked

2026-10-28 the user deleted the stray versions and the old `dev-setup` package and made the packages public. Checked anonymously (empty `DOCKER_CONFIG`) on 2026-10-28, against `sha256:7691d5c9…79c1` from run 40742897800:
- `node` tags: `latest`, `sha-*` and the `sha256-*` signature/attestation tags only; no `0`, `0.1` or `0.1.5`. The `dev-setup` repository now refuses an anonymous token (403).
- Anonymous token for `dev-setup/node`, `dev-setup/templates/node` and `dev-setup/templates`: 200. Anonymous `docker pull` of the digest works (the image was removed again afterwards; it was not local before).
- `verify-image node`: `verified: true`, revision e2a1e97.
- Last box waits on node 10 first box (`gh attestation verify`, needs `gh` 2.49 or later).
