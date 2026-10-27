---
type: technical-design
feature: manifest-followups
status: approved
base-commit: 7f6363c
touches:
  - extension-installer
  - base-material
  - dev-container-skill
  - test-suite
  - architecture-docs
changes-architecture: true
spec: >
  Placeholder tickets .scratch/dev-container-skill/issues/08-12 and
  .scratch/node-devcontainer/issues/12-13, with grilling decisions Q1-Q20
  (2026-10-26, all recommendations accepted; summarised under "Product intent")
---

## Design capsule

- **Schema.** Every entry kind gets an optional `egress`. The manifest gets a top-level `secrets` list of Named Secret names. A Preset file is refused if it has top-level `egress` or `secrets`. These go in one schema change, amending ADR 0004.
- **Installer.** `mergeLayers` already merges each entry's `egress` for every kind, so only the schema changes there. The merge also unions top-level `secrets`. The secrets list is written by every install, in both modes, not only when an MCP server exists. It holds both MCP and container-wide names.
- **Attach-time warning.** `check-secrets.sh` keeps its warn-never-fail behaviour. Its message now names the declarer: an MCP server, or "container-wide".
- **Skill helper.** It keeps its read-only "plan" pattern. The agent makes the text edits.
  - New plan commands for disallowing a domain and removing a secret.
  - `plan-remove` stops fetching content, because a top-level domain now means "the project needs it" (Q13).
  - `egressNeededBy` and Preset drift lose their Preset top-level branch.
- **`status`.**
  - Reads the Base and Variant manifests out of the pinned image with `docker create` + `docker cp`, never running it. It reports "unknown" when the image isn't local.
  - Reports layer coverage for egress and secrets.
  - Shows a missing PAT as a note.
- **Tests.** Each run gets a run id. Its temp projects live under one per-run root, the registry stub gets a run label, and the built image gets a run tag. A global teardown (`--test-global-setup`) removes only what the run created, unless `DEV_SETUP_TEST_KEEP=1` is set.
- **Docs.** `ARCHITECTURE.md` stays one file. The Node rows are rewritten to current state only, and `docs/agents/architecture.md` gains the rule "rewrite the row, never append".
- **Not designed:**
  - no migration of existing top-level domains;
  - no per-entry secrets on skill, plugin or hook entries;
  - no new manifest-editing helper (edits stay with the agent);
  - no Docker-wide prune.

## Product intent (from grilling)

| Ticket | Decisions |
|---|---|
| node 12 | Q1 the run's resources are identified and swept, never other projects'; Q2 a unique image tag per run by default (the env var still overrides it); Q3 `DEV_SETUP_TEST_KEEP=1` keeps everything for debugging |
| node 13 | Q4 one file, rows rewritten; Q5 a "rewrite, never append" rule for agents and merges |
| skill 11 | Q6 optional `egress` on every kind; Q13 no migration, and a top-level domain means "the project needs it"; Q14 Presets carry egress on entries only |
| skill 08 | Q7 top-level `secrets` (any layer, `validate` requires `remoteEnv`, warned at attach and in `status`); Q15 MCP secrets stay on the MCP entry and container-wide ones go top-level, so removing an MCP server never edits the global list; Q20 the same name may be declared in both, and its `remoteEnv` line goes only with the last declaration |
| skill 09 | Q8 disallowing a domain the Base/Variant layer or a remaining entry needs is refused, naming who needs it; Q9 removing a secret an MCP entry still names is refused, otherwise the declaration and its `remoteEnv` line go and the user is told they can unset it |
| skill 10 | Q10 Base/Variant read from the pinned image, "unknown" if not local; Q11 one ticket |
| skill 12 | Q12 a missing PAT is a `status` note only; it stays its own ticket |
| all | Q16 08 and 11 are separate and run in sequence (both edit the schema), 09 and 10 are blocked by 08 and 11, the rest are unblocked; Q17 placeholders are rewritten in place; Q19 Opus for skill tickets, Sonnet for node tickets, node 12 first |

## Existing shape

- **`installer/extensions.schema.json`:**
  - `egress` exists only on `mcp` (optional) and `mcp-remote` (required).
  - MCP secrets are `env` (stdio) and `bearerTokenEnv` (remote).
  - The top level has only `egress`.
- **`installer/src/install.mjs` `mergeLayers`:** already pushes `entry.egress` for every entry, whatever its kind, plus the top-level egress.
- **`installer/src/mcp.mjs` `writeMcpConfig`:**
  - writes the secrets list (`/etc/dev-setup/mcp-secrets`) from `secretNames`;
  - returns early when there is no MCP entry, so a container-wide secret would never be listed.
- **`base/mcp/check-secrets.sh`:** reads that list from `postStartCommand` and warns with MCP-specific text.
- **Skill helper (`skills/dev-container/scripts/`):**
  - `commands.mjs` `validate` → `checkSecrets` (MCP names only).
  - `manifests.mjs` `egressNeededBy` (entries' `egress` plus adopted Presets' top-level egress) and `covers`.
  - `inspect.mjs`:
    - `takesEntryEgress` reads the schema, so it flips to "entry" for every kind once the schema changes, with no code change;
    - `planRemove` fetches pinned content to guess top-level domains.
  - `status.mjs`: `presetStatus` (`egressMissing`), `hostEnv`, and `copyRead` (`docker cp` from a container).
- **Image:** ships `/opt/dev-setup/manifests/base.json` and `node.json`.
- **Template:** `remoteEnv` maps `DEV_SETUP_GITHUB_PAT` → `${localEnv:<patEnvVar>}`.
- **Tests (`tests/lib.mjs`):**
  - `IMAGE` defaults to the shared `dev-setup-node:test`.
  - Projects are created with `mkdtemp(tmpdir()/dev-setup-*)`.
  - The registry stub is started with `docker run -d --rm` and stopped with `docker rm -f`. Without `-v` this leaves its anonymous volume behind, which is where the 108 leaked volumes came from.
  - `removeProject` removes the container and its named volumes, but not the derived `vsc-…-uid` image the CLI builds.
- **Node version:** 24.15, so `node --test --test-global-setup` is available.

## Proposed shape

| Module | Owns | Does not own |
|---|---|---|
| Schema | Optional `egress` on every kind; top-level `secrets` (env-name pattern); descriptions explaining both | Preset-specific rules (those are the helper's `presets` check, as today) |
| Installer merge | Union of every layer's entry `egress`, top-level egress and top-level `secrets`, plus the MCP names (`secretNames`). Writes the secrets list in both install modes, whether or not MCP exists | Deciding who needs what (the skill does that) |
| `check-secrets.sh` | Warns for each unset name and says who declared it | Failing the start |
| Helper: `validate` | `checkSecrets` covers top-level `secrets` with declarer "container-wide" and the same `remoteEnv` rules | Base/Variant secrets (that's `status`) |
| Helper: `presets` | Refuses top-level `egress`/`secrets` in a Preset file | — |
| Helper: removal plans | `plan-remove` is a pure manifest computation: the entry's own egress, the domains other entries or layers still need, and its secrets with "still declared by" and whether `remoteEnv` stays. New read-only `plan-disallow <dir> <domain>` and `plan-remove-secret <dir> <name>` return refusal reasons or the edits to make | Writing files |
| Helper: `status` | Reads the image layers (see below); per-domain and per-secret layer coverage; PAT note | Running the image |
| Image layer read | `docker create` + `docker cp /opt/dev-setup/manifests` + `docker rm`; "unknown" when the image isn't local | Pulling |
| SKILL references | `egress-and-secrets.md` gains the disallow/remove flows. "Allow <domain>" checks coverage from `status`; when the layers are unknown it says Base coverage couldn't be checked | — |
| Test harness | Run id; per-run temp root `tmpdir()/dev-setup-test-<id>/` under which every project folder goes; `--label dev-setup.test-run=<id>` on the registry stub; run image tag `dev-setup-node:test-<id>`; global teardown | Removing an image the caller supplied via `DEV_SETUP_TEST_IMAGE` |

**Dependency direction is unchanged:** the skill helper imports from the installer, the installer imports nothing from the skill, and the tests drive both.

**Changed flows:**
- **Removing an MCP entry:**
  - its entry `egress` goes, minus any domain another entry, the top level or a Base/Variant layer still needs;
  - each of its secret names goes, and its `remoteEnv` line goes only when no other MCP entry or top-level `secrets` declares that name.
- **Disallowing a domain:**
  - refused, naming the needer, when a layer (from the image), an entry's `egress`, or a domain covering it requires it;
  - otherwise it's removed from the top level.
- **Test teardown:**
  1. containers whose `devcontainer.local_folder` label is under the run root;
  2. the images those containers ran (the derived `vsc-…-uid` images);
  3. their volumes;
  4. containers with the run label (`rm -fv`);
  5. the run image tag, unless it was supplied by the caller;
  6. the run root.

## Reuse decisions

- Per-entry egress: the existing `mergeLayers` and `takesEntryEgress`. No code, only the schema.
- Secret names: the installer's `secretNames` plus the new top-level list. `validate` keeps its single `checkSecrets`.
- Image read: the same `docker cp` approach as `status.mjs` `copyRead`, on a created (never started) container.
- Test sweep: Node's built-in `--test-global-setup` (Node 24) and the label the devcontainer CLI already sets (`devcontainer.local_folder`).
  - Not `--id-label`: it replaces the CLI's own identifying labels and would break `containerFor` and `status`.
  - Not adding `runArgs` to test projects: that would change what the tests exercise.
- Coverage: the existing `covers(domain, host)`, which matches dnsmasq's subdomain behaviour.

## Constraints

- A Named Secret's value never enters the helper's output, any file, or the tests' assertions on output, as today.
- Teardown never removes a resource it can't attribute to the run: no global prune, no name-prefix guessing.
- `DEV_SETUP_TEST_SKIP_BUILD` plus a supplied `DEV_SETUP_TEST_IMAGE` (the CI path) must leave the image in place, because CI pushes it after the tests.
- The image-revision test compares against the revision the run recorded at build time, not `HEAD` at assertion time. A commit during a run must not fail it.
- Skill 08 and 11 both edit the schema and ADR 0004, so they are implemented one after the other, not in parallel.
- The placeholder tickets are rewritten in place (Q17). No other ticket changes.

## Validation plan

| Scenario | Seam | Level |
|---|---|---|
| Entry `egress` on skill/plugin/hook validates and reaches the allowlist | installer `validateManifest` / `installBuild` with fixture manifests | installer integration (extend `installer/test`) |
| Top-level `secrets` merged and listed without any MCP; the attach warning names "container-wide" | container `postStartCommand` output | container acceptance (extend `tests/mcp.test.mjs` SC-17 warn test) |
| `validate` requires `remoteEnv` for top-level secrets; the value is never shown | helper CLI JSON | helper integration (extend `helper.test.mjs`) |
| Preset with top-level `egress`/`secrets` refused | helper `presets` | helper integration |
| `plan-remove` of an MCP entry keeps a shared secret's `remoteEnv` (Q20) and keeps the top-level domains; no fetch happens | helper CLI, no network | helper integration (replace the content-fetch removal tests) |
| `plan-disallow` refuses Base-, Variant- and entry-needed domains, naming the needer; `plan-remove-secret` refuses an MCP-named secret | helper CLI with a fixture image | helper integration, fixture image built from `scratch` with the two manifest files |
| `status` layer coverage; "unknown" without the image; PAT note | helper CLI | helper integration (same fixture image) |
| Suite leaves nothing behind; `KEEP=1` keeps it; a supplied image survives | Docker state before and after a minimal run | one end-to-end test that runs the harness on a tiny test file in a child `node --test` |
| Conversation flows (allow, disallow, add/remove secret) | manual checklist rows | manual, `docs/manual/dev-container-skill-checklist.md` |

**Revisit if:**
- a later devcontainer CLI adds arbitrary container labels, which would allow a simpler sweep;
- Codex gains a non-exclusive way to receive container-wide secrets that we'd want to wire into its config.

## Resolved decisions (2026-10-26)

- **D1:** test runs are identified by a per-run folder for their projects, a run label on the registry stub and a run tag on the image. We don't label every resource, because the devcontainer CLI can't add arbitrary container labels without replacing its own.
- **D2:** a Preset file is refused if it has top-level `secrets`, the same as for top-level `egress`.
- **D3:** the image-revision test compares against the revision recorded at build time. This is in scope for node 12.

## Second follow-up decisions (2026-10-27)

Grilled after tickets 08–12 and node 12–13 landed. These need no new modules; they reuse ticket 10's image-layer read and coverage functions.

- **Q1 (skill 13):**
  - `plan-remove` and `plan-remove-preset` take the Base and Variant layers from the pinned image (`projectLayers`).
  - A dropped domain's `stillAllowedBy` names the layer.
  - When the layers are unknown, the plan goes ahead with a note, as `plan-disallow` does (E1).
- **Q2 (skill 13):** their secrets part keeps a `remoteEnv` line that a Base or Variant layer also declares (Q20, as `plan-remove-secret` does).
- **E2 (skill 14):** `plan-disallow` of a domain that appears in the project's own top-level `egress` but is also covered by a parent domain removes the redundant line. It notes that the domain stays reachable through the parent. A domain still needed by the Base or Variant layer, or by an entry, is still refused.
- **Q4 and Q5 (node 14):**
  - The run's image build gets `--label dev-setup.test-run=<id>`; the devcontainer CLI's `build` supports `--label`, and labels pass down to derived images.
  - Teardown removes every image carrying that run label, untagged ones included.
  - The cleanup test asserts none survive.
  - A supplied `DEV_SETUP_TEST_IMAGE` is still never removed.
