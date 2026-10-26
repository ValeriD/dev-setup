# 14: Teardown removes the run's untagged build images

**What to build:** A test run that builds the image leaves no untagged (dangling) images from that build behind.

**Blocked by:** None (can start immediately)

**Status:** needs-triage

## Context

Found while building skill 08. After `npm test`, four untagged images labelled with the checkout's revision were left. All were created during the image build, probably the devcontainer CLI's intermediate feature-layer images. Node 12's teardown removes the run tag and the derived `vsc-…` images, but not these. Under the design's constraint ("never remove what can't be attributed to the run") they were left alone.

## Open questions (for grilling)

- Can the build attribute them to the run? For example, pass a `dev-setup.test-run=<id>` label into the build, or record the image IDs present before and after the build step.
- Or is this the BuildKit layer cache, which belongs to `docker builder prune` rather than to the suite?
