# 12: `status` notes a missing PAT

**What to build:** When the host variable behind the project's GitHub PAT is unset, `status` adds a note: "`<var>` unset: `git push` from the container will fail". It shows the name only, never a value. The attach-time check stays silent about the PAT.

**Blocked by:** None (can start immediately)

**Status:** done

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

- [x] With the PAT host variable unset, `status` includes a note naming the variable
- [x] With it set, there is no note, and the value never appears in the output
- [x] A `devcontainer.json` without a `DEV_SETUP_GITHUB_PAT` line produces no note

## Comments

- Output shape: `env.pat` is `{ name, hostEnv, set, note? }`. It is `null` when `devcontainer.json` has no `DEV_SETUP_GITHUB_PAT` line that is a `${localEnv:…}` reference. The PAT is deliberately left out of `env.missing`, so the skill shows it as a note after the list.
- The status tests now set `DEV_SETUP_GITHUB_PAT` (and the test's `MY_PAT`) to empty, so a PAT exported on the developer's host cannot change the results.
