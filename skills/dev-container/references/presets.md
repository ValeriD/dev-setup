# Presets

A Preset is `presets/<name>.json` in the dev-setups checkout (`repo` from `H check`): an Extension Manifest with a one-line `description`. A Preset carries egress only on its entries (each entry's own `egress`), never a top-level `egress`, and secrets only on its MCP entries, never a top-level `secrets`, so its entries carry everything it brings in. A project adopts a Preset by **copying** its entries into its own `.devcontainer/extensions.json`, each tagged `"preset": "<name>"`. The tag is the only link back: nothing resolves Presets at container start, and editing a Preset changes no project (ADR 0005).

`H presets` lists every Preset with `description`, `extensions` and `problems`. Offer only Presets whose `problems` is empty; name the others with their problems so the user can fix them. `H presets --name <name>` checks one.

Branch on what the user asked for, then follow that section. Each ends on the condition in **bold**.

## Adopt (during onboarding, or later in a project)

1. Run `H presets`. With no valid Presets, say so and skip the pick. Otherwise show each valid Preset's name and `description` and ask which to adopt (any number, or none).
2. For each picked Preset, append every entry of its `extensions` to the project's `extensions` array, each with `"preset": "<name>"` added and nothing else changed. Their domains come with them; the project's top-level `egress` stays as it is.

**Done when `H validate <dir>` returns `ok: true` and its `presets` counts equal the picked Presets' entry counts.** If `validate` reports a skill name declared twice (two Presets ship the same skill), show it and ask which Preset to leave out.

## Remove a Preset from a project

1. Run `H plan-remove-preset <dir> <name>`. It is read-only and says:
   - `remove`: every entry tagged with the Preset (by index in `extensions`);
   - `dropsWithEntries`: the domains on those entries, which go with them, each with `stillAllowedBy` (a staying entry's egress or the top-level `egress`); empty means the project layer stops allowing it.
2. Show that plan in words, naming the domains that stop being allowed, and ask once to apply it.
3. On yes, delete the `remove` entries from `.devcontainer/extensions.json`. Everything else stays untouched, the top-level `egress` included: it is what the project itself needs.

**Done when `H validate <dir>` returns `ok: true` and `presets` no longer lists `<name>`, or the user declined.**

## Save a project's extensions as a Preset

1. Ask for the Preset name (lower case, digits, `.`, `_`, `-`) and a one-line description. If `presets/<name>.json` exists, this is an edit: ask whether to replace it.
2. Write `presets/<name>.json` in the checkout: `$schema` copied from the project manifest, the `description`, and the project's `extensions` with every `preset` field removed. Leave out the project's top-level `egress`: a Preset has none. If the project has some, name those domains and ask, for each, which entry needs it; add it to that entry's `egress` in the Preset file, or leave it out. Leave out the top-level `secrets` too: container-wide secrets are the project's own. Name them, and say a secret an MCP server needs belongs on that entry (`env` or `bearerTokenEnv`).
3. The project stays as it is: its entries keep their current tags (or none).

**Done when `H presets --name <name>` returns `ok: true`.**

## Edit a Preset

Change only `presets/<name>.json`: its description, an entry's `egress` domains, removing entries, or adding an entry. Adding goes through the review in [extensions.md](extensions.md) (Add, steps 1 to 5, run without `--project`), then appends the entry, untagged and with the agreed domains on its own `egress`, to the Preset file instead of a project. Never add a top-level `egress`. Projects that adopted the Preset keep their copies until they are resynced one at a time ([status.md](status.md), **Resync a Preset**); say so.

**Done when `H presets --name <name>` returns `ok: true` and that file is the only one you changed.**

Saving and editing leave `presets/<name>.json` uncommitted in the dev-setups checkout; name it in the summary for the user to commit.
