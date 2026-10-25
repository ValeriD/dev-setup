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

- [ ] `presets` lists `presets/*.json` with descriptions, and invalid Preset files are reported
- [ ] Picking a Preset at onboarding copies its entries with `preset` tags and its egress, and `validate` passes
- [ ] Removing a Preset deletes exactly its tagged entries and any egress no remaining entry needs
- [ ] "Save as Preset X" writes `presets/X.json` with a description. Editing a Preset changes only that file.
