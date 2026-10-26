# Presets

A Preset is a named, reusable set of Agent Extensions. Each `<name>.json` here is one Preset: an Extension Manifest (`installer/extensions.schema.json`) with a required one-line `description`. The file name is the Preset's name (lower case, digits, `.`, `_`, `-`).

```json
{
  "$schema": "https://raw.githubusercontent.com/valerid/dev-setup/main/installer/extensions.schema.json",
  "description": "What this set is for, in one line.",
  "extensions": [
    { "kind": "skill", "agents": ["claude", "codex"], "source": { "github": "owner/repo", "path": "skills/x", "sha": "<40-char commit SHA>" }, "egress": ["example.com"] }
  ]
}
```

Projects copy a Preset's entries into their own `.devcontainer/extensions.json`, each tagged `"preset": "<name>"` (ADR 0005); nothing reads this directory at container start. Editing a Preset changes no project until that project is resynced. Entries in a Preset file carry no `preset` tag. A Preset has no top-level `egress`: each domain goes on the entry that needs it, so a resync or removal carries every egress change. Create and edit Presets through the `dev-container` skill; `node skills/dev-container/scripts/dev-container.mjs presets` checks them.
