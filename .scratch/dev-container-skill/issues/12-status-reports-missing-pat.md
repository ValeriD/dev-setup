# 12: `status` notes a missing PAT

**What to build:** When the host variable behind the project's GitHub PAT is unset, `status` adds a note: "`<var>` unset: `git push` from the container will fail". It shows the name only, never a value. The attach-time check stays silent about the PAT.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

## Technical context

**Design:** `.scratch/manifest-followups/design.md` (the "Helper: `status`" row; Q12).

- **Modules:** skill helper `status` (host env); skill reference `status.md` (how to render a note as opposed to a warning).
- **Implementation anchors:**
  - the Template's `remoteEnv` line `"DEV_SETUP_GITHUB_PAT": "${localEnv:<patEnvVar>}"`;
  - `status.mjs` `hostEnv` and `readRemoteEnv`;
  - `manifests.mjs` `LOCAL_ENV_REF`.
- **Reuse:** the existing `remoteEnv` parsing and `LOCAL_ENV_REF`.
- **Must not introduce:** a warning in `check-secrets.sh`, reading the value, or a new manifest field.
- **Validation seam:** the helper CLI JSON.
- **Coverage:** helper integration, extending `status.test.mjs`: unset, set (the value never appears in the output), and a project with no PAT line (no note).

- [ ] With the PAT host variable unset, `status` includes a note naming the variable
- [ ] With it set, there is no note, and the value never appears in the output
- [ ] A `devcontainer.json` without a `DEV_SETUP_GITHUB_PAT` line produces no note
