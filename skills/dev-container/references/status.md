# Status and Preset resync

`H status <dir>` is read-only and returns one JSON document about what the Consuming Project runs and what is out of date. It checks the registry through `verify-image` (a minute or so). Pass `--skip-image-check` only when the user wants a quick view without the image check, and then say the image was not checked.

## Show the status

1. Run `H status <dir>`. On `ok: false`, show `error` and `problems` and stop: the Extension Manifest has to be fixed first.
2. Render the six parts in this order, in `CONTEXT.md` terms, then list `problems` if there are any (the same as `H validate`):
   - **Image**: `image.variant` and `image.current`. Then say what `image.latest` found:
     - `newerVerified: true`: a newer verified image exists (`latest.image`, `latest.revision`, the `latest.versions` changes). Offer the update operation ([update.md](update.md)); do not write the digest from here.
     - `upToDate: true`: the newest verified image is in use.
     - `latest.ok: false`: say the check failed and show `failed` and `error`. A failure means no newer image could be verified, not that none exists.
     - `latest.newer: false`: the published image is older than the one in use; say so.
     - `latest.ok: true` and `newerVerified: null`: a different verified image exists, but whether it is newer cannot be told; show `latest.note`.
   - **Presets**: each `presets[]` item with `name`, `entries` and `state`. `in-sync` needs no more. For `drifted`, show `diff`: `changed` (entry, `from` Pinned Ref → `to` Pinned Ref, or the fields that differ), `added`, `removed` and `egressMissing`. For `missing` or `invalid`, show the `note` (and `problems`); there is nothing to resync from.
   - **Agent Extensions**: one line per `extensions[]` item: `entry`, its `preset` tag if any, the Pinned Ref (`pinnedRef.value`, a SHA shortened to 12 characters, or the exact version) and its age (`ageDays` days, from `date`). Show `error` when the age could not be read, and the `note` for an entry without a Pinned Ref.
   - **Egress domains**: each `egress.topLevel` domain with its `neededBy` (entries and adopted Presets that list it; empty means only the project allowed it), then `egress.entries` with the entry each one belongs to. These are the Consuming Project layer only; the Base and Variant layers add their own.
   - **Host environment**: `env.missing` as the variables to export on the host before the next container start, with what needs each (`env.secrets[].neededBy`, or git identity for `GIT_AUTHOR_NAME` and `GIT_AUTHOR_EMAIL`). Only names: never ask for, read or print a value. When `missing` is empty, say every named variable is set. Then, if `env.pat.note` is present, add it as a note after the list, not as a variable to export: `git push` from the container needs it, nothing else does. Show the name only, as with the others.
   - **Container**: `container.found: false`: no container yet. Otherwise its `state` and `pendingRecreate`: `true` with every `reasons` line, `false` (it runs the current config), or `null` with the `unknown` lines (why it could not tell).
3. If a Preset is `drifted`, offer to resync it (below). If `pendingRecreate` is `true`, offer the recreate (step 5 of [update.md](update.md), the same question and warning).

**Done when the status is shown and each offer was answered.**

## Resync a Preset

One Preset in one project at a time: never touch other projects, even if the user names several.

1. From `H status <dir>`, take the Preset's `diff` and `resync`. Show the diff as in step 2 above and ask once: "Resync Preset `<name>` in this project?"
2. On no, nothing is written; stop.
3. On yes, edit `.devcontainer/extensions.json`:
   - remove the entries at the Preset's `indexes`, and put `resync.entries` (exactly as returned, already tagged) where the first of them was;
   - add each `resync.egressAdd` domain to the top-level `egress` (create the array if needed), skipping domains already there.

   Leave every other entry and domain as it is. Top-level egress carries no tag, so a domain the Preset no longer lists is not removed: say so, and name the remove-a-Preset flow in [presets.md](presets.md) if the user wants it gone.
4. If a new or changed entry names secrets (`env`, `bearerTokenEnv`), add the `remoteEnv` line for each, as step 7 of **Add** in [extensions.md](extensions.md) says.
5. Run `H validate <dir>` and then `H status <dir> --skip-image-check`: the Preset must be `in-sync`.
6. Ask once whether to recreate the container (step 5 of [update.md](update.md)); on no, say the change applies at the next recreate and `status` shows it as pending.

**Done when `validate` returns `ok: true`, `status` shows the Preset `in-sync`, and only this project's `.devcontainer/` changed (or the user declined).**
