# 15: The image and the Template share one registry repository

**What to build:** `ghcr.io/valerid/dev-setup/node:latest` always means the signed image, and the Template is published under a name of its own. Onboarding, `status` and updates resolve the newest image from that name.

**Blocked by:** None. It needs grilling first.

**Status:** needs-triage

## Found

In CI run 40681113721 (2026-10-28, commit 1f7afa5), the first successful publish:
- The `publish` job pushed the image to `ghcr.io/valerid/dev-setup/node` with tags `sha-<12>` and `latest`, with digest `sha256:2033c430…3d4d`.
- The `template` job then ran `devcontainer templates publish -r ghcr.io -n valerid/dev-setup ./templates`. That pushed the Template `node` to the same repository with tags `0`, `0.1`, `0.1.5` and `latest`, with digest `sha256:854795c6…e8cd`.
- `latest` now points to the Template artifact, not the image.
- The skill helper resolves the newest image from `templates/node/devcontainer-template.json` `options.image.default`, which is `ghcr.io/valerid/dev-setup/node:latest` (`commands.mjs` `variantSource`). So `verify-image`, onboarding and the newer-image check in `status` read the Template artifact.
- Ticket 10 chose both names on purpose ("Image names"). Nothing in the acceptance suite publishes both to one registry repository, so no test caught this.
- The Template's `image` default that CI writes is a digest (`…/node@sha256:2033…`). Applying the Template is therefore not affected.

## Open questions for grilling

- Which one moves: the Template (for example namespace `valerid/dev-setup/templates`, giving `ghcr.io/valerid/dev-setup/templates/node`) or the image (for example `ghcr.io/valerid/dev-setup/images/node`)?
- What happens to the already published `latest`, `0`, `0.1` and `0.1.5` tags on `ghcr.io/valerid/dev-setup/node`?
- Should the acceptance suite or CI check that the image's `latest` is an image after publishing?

## Comments

2026-10-28: the user answered "yes" to the first round of recommendations:
- Q1: move the Template to namespace `valerid/dev-setup/templates`; the image keeps its name.
- Q2: the next publish moves `latest` back to the image, and the user deletes the stray `0`, `0.1` and `0.1.5` tags by hand.
- Q3: CI checks after the Template job that `node:latest` is still the image it just published.

The user asked for this ticket to go through grilling together with the `ci-efficiency` tickets.
