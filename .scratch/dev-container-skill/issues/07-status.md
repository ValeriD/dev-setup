# 07: `status`

**What to build:** `/dev-container status` shows for a project:
- the Variant and digest, and whether a newer verified image exists;
- the Presets in use and whether they drifted, with a resync that shows a diff and applies it after I confirm;
- each extension with its Pinned Ref and age;
- the egress domains;
- named secrets, and `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL`, missing from the host env;
- whether a container recreate is pending.

**Blocked by:** 02 (Presets); 06 (Verified image updates); node-devcontainer 07 (Consuming Project layer at container start)

**Status:** done

## Technical context

**Design:** `.scratch/dev-container-skill/design.md` (approved), with spec `.scratch/dev-container-skill/spec.md`. Glossary: `CONTEXT.md`. ADRs 0001, 0003, 0004, 0005. Ticket rule: never edit tickets other than your own; new needs go into new tickets.

- **Modules:**
  - Start-up step: also write a hash of the merged applied manifest to a path `node` can read. This is a new change; don't edit node-devcontainer tickets.
  - Skill helper: `status`. It finds the container by its `devcontainer.local_folder` label and reads the hash through `docker exec`.
  - Skill prompt: rendering and Preset resync.
- **Reuse:** `verify-image` from 06; Pinned Ref ages from git commit dates via the installer's fetch.
- **Validation seam:** helper integration tests on fixtures (Preset drift, ages, missing env, a fixture container whose hash differs), plus checklist entries for resync.
- **Coverage:** SC-09, SC-11.

- [x] The start-up step writes the applied-manifest hash, and an acceptance assertion checks it
- [x] `status` reports all six items as JSON, and the skill renders them
- [x] Preset drift shows up after a Preset edit; resync applies only after confirmation and only to that project
- [x] A pending recreate is reported when the manifest changed after the container started

## Comments

**Implementation notes (agent, 2026-10-26):**

- Start-up step (`base/egress/start.sh`): writes `/run/dev-setup/applied-manifest` (root-owned, mode 644, `node` cannot rewrite it) with `sha256:<hex>` of the project manifest bytes, or `none` when there is none. The hash is taken before the installer reads the file and written just before `/run/egress/ready`. Acceptance assertions in `tests/project-layer.test.mjs`: the hash matches after `up` and after a recreate, and `node` cannot write it.
- Helper: `status DIR [--skip-image-check]` in a new `scripts/status.mjs`, read-only. It reuses `validate` (problems, image, Variant, named secrets with their `remoteEnv` host variable), `verify-image --current` from 06 (newer verified image: `newerVerified`, plus `latest.upToDate`, `latest.newer` and version changes; a failed check is reported, never treated as "no newer image"), `listPresets`/`readProjectManifest` from 02/03, and the installer's `fetchBySha` for Pinned Ref ages (committer date read with `git --git-dir`, nothing in the tree runs). npm entries get their age from the npm publish time (`npmView` from 03, now exported). `mcp-remote` entries report no Pinned Ref (D2).
- Preset drift: per adopted tag it compares the tagged entries (tag stripped) with `presets/<name>.json` as multisets. It reports `changed` (same extension at another Pinned Ref or with other fields), `added`, `removed` and Preset domains missing from the top-level egress, plus `resync.entries`: the exact tagged entries to write at the tagged `indexes`. A Preset that is gone or invalid is reported as `missing` or `invalid`, with no resync. The resync itself is an agent edit in `references/status.md`: one Preset, one project, one confirmation, then `validate` and `status` again.
- Host env: `env.secrets` and `env.gitIdentity` (`GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL` through their `remoteEnv` `${localEnv:…}` references) report `hostEnv` and `set` only. `env.missing` lists the unset names. A test asserts that a set secret's value never appears in the output.
- Container: found by `devcontainer.local_folder`; `pendingRecreate` is `true` with `reasons`, `false`, or `null` with `unknown` lines (no container, stopped, image without the hash file).
- Tests: `scripts/test/status.test.mjs` (ages from dated bare-git commits and the npm registry stub, Preset drift and resync, missing or invalid Preset, unset env names without values, unreachable Pinned Ref). `tests/dev-container-skill.test.mjs` adds a real-container test: nothing pending after `up`, then pending after a manifest edit, a `remoteEnv` edit and an image change, and nothing pending again once the config is restored. Checklist rows S1–S5 in `docs/manual/dev-container-skill-checklist.md`, and row 10 updated. The conversation rows (rendering, the resync confirmation, only that project) were written but not run in this session, because they cost model calls.

**Deviations:**

- The hash covers the project manifest bytes the start applied, not the merged three-layer manifest the ticket's wording names. The host cannot rebuild the Base and Variant layers of the image the project runs (the local checkout can differ: this is the open question in 10). Those layers are fixed by the image, which `status` compares separately. So this hash plus the image check detects every manifest change that needs a recreate.
- A pending recreate also covers two things the ticket did not list but SC-12's "several changes" needs:
  - a different image. The devcontainer CLI runs a derived `vsc-…-uid` image, so the check is that the configured image's layers are a prefix of the container image's;
  - a changed `remoteEnv` (a secret or git identity line), compared with the config entry the CLI records last in the container's `devcontainer.metadata` label. This depends on how CLI 0.89.0 records that label; if no metadata is found, the result goes under `unknown`.
- `--skip-image-check` skips only the registry check. It is there for the helper tests (no network) and for a quick view, and the skill says when it was used.
- Stopped container: the hash is read with `docker cp` instead of `docker exec`, so a pending recreate is still reported.

**Review follow-up (same day):**

- The circular import is gone: `readJsonc` and `LOCAL_ENV_REF` moved to `manifests.mjs`, and `commands.mjs` passes `validate` and `verifyImage` to `status`.
- `newerVerified` is now `true` only when the verified image is a later revision. It is `false` when up to date, and `null` (with a note) when revisions cannot be compared or the check failed. A new test covers the failed check through `status`, using a checkout whose Template points at an unreachable registry.
- A configured image missing from the local store is still reported as pending (the usual case after an image update), with wording that says so.
- `egress.topLevel` now lists each domain with `neededBy` (entries and adopted Presets, via `egressNeededBy`). This meets the design's note that pruning is checked through `status`'s "egress needed by" output.
- The resync test now applies `resync.entries` in place, as `references/status.md` says, and checks the entry order. The mechanical check (no `cwd`, no `import(`) now covers `status.mjs`.
- Still open: a domain dropped from a Preset's top-level egress is not detected as drift (top-level egress has no tag; see "Belongs elsewhere").

**Belongs elsewhere:**

- Base and Variant layer egress and secrets in `status`: ticket 10.
- The PAT host variable (`DEV_SETUP_GITHUB_PAT` through `patEnvVar`) is not reported as missing. The ticket names only secrets and git identity. If it should be, that needs a new ticket.
- Resync cannot drop a top-level domain that a Preset no longer lists, because top-level egress has no tag. The skill points to the Preset-remove flow instead; per-entry egress for all kinds (ticket 11) would remove this gap.
