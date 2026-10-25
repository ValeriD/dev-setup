# 02: Presets

**What to build:**
- During onboarding I can pick Presets from a list with descriptions. Their entries are copied into the project's Extension Manifest, tagged with the Preset name.
- I can remove a whole Preset from a project.
- I can save a project's extensions as a new Preset, or edit an existing Preset in this repo, without touching other projects.

**Blocked by:** 01 (Skill foundation and onboarding)

**Status:** ready-for-agent

## Technical context

**Design:** `.scratch/dev-container-skill/design.md` (approved), with spec `.scratch/dev-container-skill/spec.md`. Glossary: `CONTEXT.md`. ADRs 0001, 0003, 0004, 0005. Ticket rule: never edit tickets other than your own; new needs go into new tickets.

- **Modules:**
  - Installer schema: add the optional entry field `preset` and a Preset-file `description`. This is a new change to the schema; don't edit node-devcontainer tickets.
  - Skill helper: `presets` (list with descriptions).
  - Skill prompt: Preset pick/copy, remove-by-tag, create and edit flows.
  - Repo data: a new `presets/` directory (add one example Preset with real, pinned entries only if they are safe and small; otherwise document the format).
- **Reuse:** the installer's schema and validation (`validate` must accept `preset` and Preset files).
- **Must not introduce:** Preset references resolved at container start (ADR 0005), or bulk resync across projects.
- **Validation seam:** helper integration tests (`presets`, `validate` on tagged manifests and Preset files), plus checklist entries.
- **Coverage:** SC-01 (Presets part), SC-06 (Preset removal), SC-10.

- [x] `presets` lists `presets/*.json` with descriptions, and invalid Preset files are reported
- [ ] Picking a Preset at onboarding copies its entries with `preset` tags and its egress, and `validate` passes
- [ ] Removing a Preset deletes exactly its tagged entries and any egress no remaining entry needs
- [ ] "Save as Preset X" writes `presets/X.json` with a description. Editing a Preset changes only that file.

## Comments

**Implementation notes (agent, 2026-10-25):**

- Schema: optional `preset` on every entry kind (pattern `presetName`, one `"preset": {}` line per kind block) and optional top-level `description`. The schema does not require `description`; `presets` does, and also rejects `preset` tags inside a Preset file.
- Helper: `presets [--name]` (all files with `problems`; valid ones carry `extensions`/`egress` for copying). `validate` now also runs the installer's `mergeLayers` on the project layer (catches the same skill name from two Presets) and returns per-Preset tag counts. New read-only `plan-remove-preset DIR NAME` computes the removal exactly: entries to delete, entries to re-tag when another adopted Preset declares the identical entry, and manifest-level egress the Preset brought in that no remaining entry or adopted Preset needs. A domain the user added that also appears in the Preset is pruned; the agent shows the plan first. The helper still writes no manifests.
- `presets/` now exists (with `README.md` documenting the format) and is in the checkout check's `REQUIRED`. No example Preset: picking which real extensions to curate is the user's call.
- Prompt: `references/presets.md` (adopt, remove, save, edit); onboarding gains step 3a pointing at **Adopt** (no renumbering, to limit conflicts with tickets 05/06).
- Boxes 2-4: the helper parts are covered by `scripts/test/helper.test.mjs`; the edits themselves are the agent's and covered by checklist rows P1-P5 in `docs/manual/dev-container-skill-checklist.md`, not run (needs a Claude login in a throwaway config), so those boxes stay unchecked.
