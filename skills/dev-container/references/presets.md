# Presets

A Preset is `presets/<name>.json` in the dev-setups checkout (`repo` from `H check`): an Extension Manifest with a one-line `description`. A project adopts a Preset by **copying** its entries into its own `.devcontainer/extensions.json`, each tagged `"preset": "<name>"`. The tag is the only link back: nothing resolves Presets at container start, and editing a Preset changes no project (ADR 0005).

`H presets` lists every Preset with `description`, `extensions`, `egress` and `problems`. Offer only Presets whose `problems` is empty; name the others with their problems so the user can fix them. `H presets --name <name>` checks one.

Branch on what the user asked for, then follow that section. Each ends on the condition in **bold**.

## Adopt (during onboarding, or later in a project)

1. Run `H presets`. With no valid Presets, say so and skip the pick. Otherwise show each valid Preset's name and `description` and ask which to adopt (any number, or none).
2. For each picked Preset, append every entry of its `extensions` to the project's `extensions` array, each with `"preset": "<name>"` added and nothing else changed. Add each domain of its `egress` to the project's top-level `egress` (create the array if needed), skipping domains already there.

**Done when `H validate <dir>` returns `ok: true` and its `presets` counts equal the picked Presets' entry counts.** If `validate` reports a skill name declared twice (two Presets ship the same skill), show it and ask which Preset to leave out.

## Remove a Preset from a project

1. Run `H plan-remove-preset <dir> <name>`. It is read-only and says:
   - `remove`: every entry tagged with the Preset (by index in `extensions`);
   - `egress`: top-level domains the Preset file lists that nothing staying needs. Top-level egress carries no tag, so this is a proposal: the user may have allowed some of them independently, or the Preset may have changed since it was adopted;
   - `keepEgress`: Preset domains that stay, with what still needs them;
   - `note`: present when the Preset file is gone; then show the project's `egress` and ask which domains to drop.
2. Show that plan in words, list the `egress` domains by name, and ask once to apply it (the user may keep any of those domains).
3. On yes, delete the `remove` entries and the agreed domains from `.devcontainer/extensions.json`. Everything else stays untouched.

**Done when `H validate <dir>` returns `ok: true` and `presets` no longer lists `<name>`, or the user declined.**

## Save a project's extensions as a Preset

1. Ask for the Preset name (lower case, digits, `.`, `_`, `-`) and a one-line description. If `presets/<name>.json` exists, this is an edit: ask whether to replace it.
2. Write `presets/<name>.json` in the checkout: `$schema` copied from the project manifest, the `description`, the project's `extensions` with every `preset` field removed, and the project's top-level `egress` if any.
3. The project stays as it is: its entries keep their current tags (or none).

**Done when `H presets --name <name>` returns `ok: true`.**

## Edit a Preset

Change only `presets/<name>.json`: its description, removing entries or egress domains, or adding an entry. Adding goes through the review in [extensions.md](extensions.md) (Add, steps 1 to 5, run without `--project`), then appends the entry, untagged, and the agreed domains to the Preset file instead of a project. Projects that adopted the Preset keep their copies until they are resynced one at a time; say so.

**Done when `H presets --name <name>` returns `ok: true` and that file is the only one you changed.**

Saving and editing leave `presets/<name>.json` uncommitted in the dev-setups checkout; name it in the summary for the user to commit.
