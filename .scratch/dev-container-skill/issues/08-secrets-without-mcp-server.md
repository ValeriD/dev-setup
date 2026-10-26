# 08: Container-wide Named Secrets

**What to build:**
- "Add secret FOO" for a variable no MCP server needs adds `FOO` to the manifest's top-level `secrets` and a `remoteEnv` line `"FOO": "${localEnv:FOO}"`, then tells me to export `FOO` on the host.
- When `FOO` is unset, the attach-time warning and `validate` report it, the same as an MCP secret, and say it is container-wide.
- An MCP server's own secrets stay on its entry. The same name may be declared in both places.
- A Preset file with top-level `secrets` is refused.

**Blocked by:** 11 (Per-entry egress for every kind), because both change the schema and ADR 0004

**Status:** done

## Technical context

**Design:** `.scratch/manifest-followups/design.md`. Use the "Schema", "Installer merge", "`check-secrets.sh`", "Helper: `validate`" and "Helper: `presets`" rows, and Q7, Q15, Q20, D2. Named Secret is defined in `CONTEXT.md`.

- **Modules:**
  - Schema: top-level `secrets`, using the env-name pattern.
  - Installer: the merge unions top-level `secrets` and the MCP names; the secrets list is written in both install modes, whether or not MCP exists.
  - `base/mcp/check-secrets.sh`: names who declared each secret.
  - Skill helper: `validate`'s `checkSecrets` covers top-level names; `presets` refuses top-level `secrets`.
  - Skill references: `egress-and-secrets.md` "add a secret" flow.
  - ADR 0004 amendment.
- **Implementation anchors:**
  - `installer/src/mcp.mjs` `writeMcpConfig`, which writes `/etc/dev-setup/mcp-secrets` and returns early without MCP;
  - `installer/src/install.mjs` `installBuild`/`installStart`;
  - `skills/dev-container/scripts/commands.mjs` `checkSecrets`.
- **Reuse:** `secretNames`, `checkSecrets` and `LOCAL_ENV_REF`.
- **Dependency direction:** unchanged.
- **Must not introduce:** a secrets field on skill, plugin or hook entries; any path that reads or writes a value; a failing start for an unset secret.
- **Validation seam:** container `postStartCommand` output; installer output files; helper CLI JSON.
- **Coverage:**
  - container acceptance: extend the `tests/mcp.test.mjs` SC-17 warn test with a container-wide secret and no MCP server;
  - installer integration;
  - helper integration;
  - manual checklist rows E-series updated.

- [x] A project manifest with only top-level `secrets` and no MCP entry gets a warning at attach naming the unset secret as container-wide; a set one gets none
- [x] `validate` fails when a top-level secret has no `remoteEnv` line, or a literal or default value, and never prints the value
- [x] A name declared both by an MCP entry and at the top level validates, and is listed once with both declarers
- [x] A Preset with top-level `secrets` fails `presets` with a clear reason
- [ ] The skill's "add secret" flow writes to top-level `secrets` when no MCP server needs it, and to the MCP entry when one does

## Comments

**Implementation notes (agent, 2026-10-26):**

- Schema: top-level `secrets` (env-name pattern, `uniqueItems`). Inline rather than `$ref` to `envNames`, because draft-07 ignores keywords beside a `$ref`.
- Installer: new `installer/src/secrets.mjs` holds `secretNames` (moved from `mcp.mjs`, still exported from `index.mjs`), `secretDeclarers` and `renderSecretsList`. `mergeLayers` now also returns `secrets`, the union of every layer's top-level list. `installBuild` and `installStart` write the list whether or not MCP exists. `writeMcpConfig` no longer writes it and no longer takes `secretsOut`. The CLI summary line counts secret names.
- The list moved from `/etc/dev-setup/mcp-secrets` to `/etc/dev-setup/secrets`, because it now holds container-wide names too. Each line is `NAME<TAB>declarers`: `MCP server "<name>"` and/or `container-wide`. `check-secrets.sh` (override env var renamed to `DEV_SETUP_SECRETS_LIST`) prints `WARNING: secret NAME (<declarers>) is not set ...`. A line without declarers still warns. Both are in-image paths; nothing outside the image reads them.
- Skill helper: `manifests.mjs` `secretsNeededBy(manifest)` (the installer's `secretDeclarers` with `describeEntry` labels plus `container-wide`) is the seam for 09's `plan-remove`/`plan-remove-secret` (the Q20 rule) and for 10. `validate`'s `checkSecrets` uses it, so `status` (which builds on `validate`) reports a project's container-wide secrets with no extra code. `presets` refuses a top-level `secrets`.
- Docs: `egress-and-secrets.md` "Add a secret" (MCP entry vs top-level, ask when unclear, both allowed), `presets.md` (intro, save), `SKILL.md` description/routing, `presets/README.md`, the Template comment, the ADR 0004 amendment, the ARCHITECTURE.md rows (base material, installer, Template, skill helper, Presets) rewritten in place, and checklist rows E4 (rewritten), E6 and E7 (new).
- Tests: installer integration (both modes with no MCP, declared in both places, name pattern and duplicates), helper integration (container-wide `validate` with missing, literal and default values, value never echoed, both declarers, Preset refusal), container acceptance (`tests/mcp.test.mjs`: a third project with only a container-wide secret and no MCP entry warns "container-wide"; the set project declares `T09_DOCS_TOKEN` in both places and gets no warning). The container-wide check in the set container is `test -n`, so the value is never read into output.
- Verified: `npm run test:installer` 52/52, `npm run test:skill` 47/47, `node scripts/check-pins.mjs` ok, `npm test` 52/52 with no container or volume left behind. The last box (the conversation flow) is unticked, so Status is left unchanged: the reference is rewritten and checklist rows E4, E6 and E7 cover it, but the manual checklist was not run. Set `done` once E4, E6 and E7 pass.

**Belongs elsewhere:**

- After `npm test`, four dangling (untagged) images labelled with this checkout's revision remained, all created during the image build. One from an earlier run was already there before this run. The teardown (node 12) removes the run tag and the derived `vsc-…` images, but not these untagged images. They were left in place, because they cannot be attributed to this run with certainty.
