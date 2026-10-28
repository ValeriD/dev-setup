# 05: Publish the Template only when it or the image changes

**What to build:** A new Template version is published only when the Template's files change or a new image is published. Its version number means something, rather than counting CI runs.

**Blocked by:** node-devcontainer 15 (the Template's registry name). It needs grilling first.

**Status:** needs-triage

## Found (2026-10-28)

- The `template` job sets the version to `0.1.<run number>` and publishes on every successful publish. Run 40681113721 published `0.1.5`.
- `devcontainers/action` also pushes a git tag per version (`template_node_0.1.5`), so every run on `main` adds a tag to the repository.
- Today the Template must republish whenever the image changes, because its `image` default is the new digest.

## Open questions for grilling

- Once 01 stops publishing images for doc-only changes, is anything left to fix here?
- Should the action's git tag per version be turned off (`disable-repo-tagging`)?
- What should the version scheme be: keep `0.1.<run>`, or bump on Template file changes only?

## Comments

2026-10-28 grilling, all recommendations accepted:
- Q7: set `disable-repo-tagging: true` and keep the version as `0.1.<run number>`. Once ticket 01 is in, a new version appears only when the image or the Template really changed.
