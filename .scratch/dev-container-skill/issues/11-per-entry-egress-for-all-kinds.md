# 11: Per-entry egress for every kind

**What to build:**
- Any Extension Manifest entry (skill, plugin, hook, mcp, mcp-remote) can carry the egress it needs, and that egress reaches the Egress Allowlist.
- "Add <extension>" puts the domains the extension needs on its entry.
- "Remove <extension>" drops exactly that entry's domains, unless something else still needs them, and never fetches content.
- A domain in the top-level `egress` means "the project needs it", so removing an extension never drops it.
- A Preset file carries egress only on its entries. A Preset with top-level `egress` is refused, so resync and Preset removal catch every egress change exactly.

**Blocked by:** None (can start immediately)

**Status:** done

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

- [x] A skill, plugin or hook entry with `egress` validates, and its domains appear in the assembled allowlist
- [x] `inspect` proposes the entry with its domains on the entry, for every kind
- [x] `plan-remove` lists only the entry's own domains, keeps any that another entry or the top level needs, and makes no network call
- [x] A Preset with top-level `egress` fails `presets` with a clear reason; a Preset entry's changed `egress` shows as drift in `status`
- [x] ADR 0004 records per-entry egress and "top-level means the project needs it"

## Comments

**Implementation notes (agent, 2026-10-26):**

- Schema: skill, plugin and hook entries gain an optional `egress`, and `mcp` uses the same `entryEgress` definition. The top-level `egress` description now says "what the layer itself needs". No installer code changed: `mergeLayers` already merged entry egress. Covered by `installer/test/claude.test.mjs` (skill, plugin and hook in build and start mode).
- `inspect` puts the hosts the content certainly reaches (a plugin's MCP server URLs, a remote server's host) on the proposed entry's `egress`. `egress.onEntry` is now `[{domain, allowedBy}]`. `egress.target` and `egress.needed` were removed: with entry egress on every kind, `takesEntryEgress` was always true, so it was deleted rather than kept as dead code.
- `plan-remove` moved from `inspect.mjs` to `commands.mjs`, beside `plan-remove-preset`. Both are pure manifest computations through the new `manifests.mjs` `egressGoing`, which returns each removed entry's own domains with `stillAllowedBy` (a staying entry's egress or the top-level egress, both matched with `covers`). The old fields `egress`, `heuristicEgress`, `keepEgress` and `note` are gone, and `plan-remove-preset` now returns `dropsWithEntries`. A test puts a recording `git` first on PATH and asserts `plan-remove` never calls it.
- `presets` refuses a top-level `egress`. `egressNeededBy` takes entries only (the `repo` parameter is gone). Preset drift loses `egressMissing`, and `resync` is just `{ entries }`.
- References: `extensions.md`, `presets.md` (adopt, remove, save: a project's top-level domains are moved to entries or left out, edit), `status.md`, and one clause in `egress-and-secrets.md` (a domain for one extension goes on its entry). Updated `presets/README.md` example, ADR 0004 consequence, ARCHITECTURE.md rows (installer, skill helper, Presets) rewritten in place, and checklist rows P1-P3, X1, X3, X6, S2 and S4.
- Tests: `npm run test:installer` 49/49, `npm run test:skill` 45/45, `node scripts/check-pins.mjs` ok, `npm test` 52/52 with no container, volume or image left behind.

**Belongs elsewhere:**

- `plan-remove` and `plan-remove-preset` do not consider the Base/Variant layers. An empty `stillAllowedBy` means "the project layer stops allowing it", and the references say exactly that. The design's changed flow ("minus any domain ... a Base/Variant layer still needs") is not owned by 09 (which adds only secrets to `plan-remove`) or 10 (status). The image-layer read from 10 could feed `egressGoing`. This needs a new ticket or a decision.
- `status` `egress.topLevel[].neededBy` matches domains exactly, while `egressGoing` uses `covers`. This is harmless, but should be unified when 10 adds layer coverage.
