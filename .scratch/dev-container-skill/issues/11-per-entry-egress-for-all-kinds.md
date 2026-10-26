# 11: Per-entry egress for every kind

**What to build:**
- Any Extension Manifest entry (skill, plugin, hook, mcp, mcp-remote) can carry the egress it needs, and that egress reaches the Egress Allowlist.
- "Add <extension>" puts the domains the extension needs on its entry.
- "Remove <extension>" drops exactly that entry's domains, unless something else still needs them, and never fetches content.
- A domain in the top-level `egress` means "the project needs it", so removing an extension never drops it.
- A Preset file carries egress only on its entries. A Preset with top-level `egress` is refused, so resync and Preset removal catch every egress change exactly.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

## Technical context

**Design:** `.scratch/manifest-followups/design.md`. Use the "Schema", "Helper: `presets`" and "Helper: removal plans" rows (except the secrets parts, which are 08 and 09), and Q6, Q13, Q14.

- **Modules:**
  - Schema: optional `egress` on every kind.
  - ADR 0004 amendment.
  - Skill helper:
    - `inspect` targets the entry for every kind;
    - `plan-remove` becomes a pure manifest computation;
    - `egressNeededBy` and Preset drift lose the Preset top-level egress branch;
    - `presets` refuses top-level `egress`.
  - Skill references (`extensions.md`, `presets.md`, `status.md`): their egress wording.
- **Implementation anchors:**
  - `installer/src/install.mjs` `mergeLayers` already merges `entry.egress` for every kind.
  - `skills/dev-container/scripts/inspect.mjs`: `takesEntryEgress` reads the schema; `planRemove` fetches content today.
  - `manifests.mjs` `egressNeededBy`.
  - `status.mjs` `presetStatus` (`egressMissing`).
- **Reuse:** `mergeLayers`, `takesEntryEgress` and `covers`, with no installer code change for the merge.
- **Dependency direction:** the skill helper imports from the installer, never the reverse.
- **Must not introduce:** a migration of existing top-level domains, per-entry secrets (08), or a manifest-editing helper.
- **Validation seam:** the installer's `installBuild`/`validateManifest` with fixture manifests; the helper CLI JSON.
- **Coverage:**
  - installer integration: entry egress on a skill, plugin and hook reaches the allowlist;
  - helper integration: replace the content-fetch removal tests; Preset refusal; drift with entry egress;
  - the manual checklist rows for add and remove updated.

- [ ] A skill, plugin or hook entry with `egress` validates, and its domains appear in the assembled allowlist
- [ ] `inspect` proposes the entry with its domains on the entry, for every kind
- [ ] `plan-remove` lists only the entry's own domains, keeps any that another entry or the top level needs, and makes no network call
- [ ] A Preset with top-level `egress` fails `presets` with a clear reason; a Preset entry's changed `egress` shows as drift in `status`
- [ ] ADR 0004 records per-entry egress and "top-level means the project needs it"
