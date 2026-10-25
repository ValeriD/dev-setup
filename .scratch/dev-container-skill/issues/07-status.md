# 07: `status`

**What to build:** `/dev-container status` shows for a project:
- the Variant and digest, and whether a newer verified image exists;
- the Presets in use and whether they drifted, with a resync that shows a diff and applies it after I confirm;
- each extension with its Pinned Ref and age;
- the egress domains;
- named secrets, and `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL`, missing from the host env;
- whether a container recreate is pending.

**Blocked by:** 02 (Presets); 06 (Verified image updates); node-devcontainer 07 (Consuming Project layer at container start)

**Status:** ready-for-agent

## Technical context

**Design:** `.scratch/dev-container-skill/design.md` (approved), with spec `.scratch/dev-container-skill/spec.md`. Glossary: `CONTEXT.md`. ADRs 0001, 0003, 0004, 0005. Ticket rule: never edit tickets other than your own; new needs go into new tickets.

- **Modules:**
  - Start-up step: also write a hash of the merged applied manifest to a path `node` can read. This is a new change; don't edit node-devcontainer tickets.
  - Skill helper: `status`. It finds the container by its `devcontainer.local_folder` label and reads the hash through `docker exec`.
  - Skill prompt: rendering and Preset resync.
- **Reuse:** `verify-image` from 06; Pinned Ref ages from git commit dates via the installer's fetch.
- **Validation seam:** helper integration tests on fixtures (Preset drift, ages, missing env, a fixture container whose hash differs), plus checklist entries for resync.
- **Coverage:** SC-09, SC-11.

- [ ] The start-up step writes the applied-manifest hash, and an acceptance assertion checks it
- [ ] `status` reports all six items as JSON, and the skill renders them
- [ ] Preset drift shows up after a Preset edit; resync applies only after confirmation and only to that project
- [ ] A pending recreate is reported when the manifest changed after the container started
