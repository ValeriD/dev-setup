# Presets are copied into projects, not referenced

A Consuming Project adopts a Preset by copying the Preset's entries into its own Extension Manifest, with each entry tagged `preset: "<name>"`. It does not reference the Preset by name for the installer to resolve. With copying, every change to what runs in a project is an explicit, reviewable diff in that project, which matches the Pinned Ref rule. It also leaves the installer design unchanged. The cost is that editing a Preset doesn't propagate on its own: the `dev-container` skill detects drift through the tag and offers a resync, one project at a time.

## Considered Options

- Reference by name (`"presets": ["web-app"]`) resolved at container start: rejected because editing a Preset would silently change every project on its next image.
