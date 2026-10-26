---
name: dev-container
description: Wire a project to a hardened dev-setups dev container from the host. Use when the user wants to onboard a project (a local folder, a GitHub URL, or a new repo) onto a dev container, migrate an existing project (its own dev container, npm or yarn lockfile) onto one, update its dev container image, add or remove an Agent Extension (skill, plugin, hook, MCP server) after reviewing it, or adopt, remove, save or edit a Preset of Agent Extensions.
---

# dev-container

You run on the host and change a **Consuming Project**'s `.devcontainer/` so it develops inside a published **Variant**. Speak in the `CONTEXT.md` terms of the dev-setups repository: Variant, Template, Preset, Extension Manifest, Extension Layer, Pinned Ref, Egress Allowlist, Consuming Project.

## The helper

`H` means `node <this skill's base directory>/scripts/dev-container.mjs`. It prints one JSON document; a non-zero exit is a failure to report, never to work around. Every exact step goes through `H`: Variant detection, Template rendering, validation, image verification, container start. `H --help` lists the subcommands.

Run `H check` first, every time:

- Exit 3 (`relink: true`): show its `message` and stop. The skill is not linked to a valid dev-setups checkout, so its Variants and schema would be stale.
- The file is missing (Node reports "Cannot find module"): the skill's symlink is broken. Tell the user to re-link it with `ln -sfn <path-to-dev-setups>/skills/dev-container ~/.claude/skills/dev-container`, then stop.
- `setup: true`: show the install commands from `message` and stop.

## Guardrails

These hold in every operation:

- **The user commits.** Leave every change uncommitted and end with a summary of the changed files. Never run `git commit`, `git push` or anything that creates commits.
- **Confirm before anything outside the project folder or hard to undo.** Each confirmation is one explicit question, asked once: creating a GitHub repository (always `--private`), writing the host VS Code settings, starting or recreating the container (warn that sessions running in it will end).
- **The project's `docs/agents/` and `.scratch/` belong to `/setup-matt-pocock-skills`.** Leave them as they are. That skill is user-invoked; remind the user to run it, never run it yourself.
- **Secret values stay with the user.** Only names of host environment variables pass through you.
- **Image digests come from `H verify-image`.** Write a digest to a project only when `verify-image` returned `verified: true` for it. A failed verification is reported and ends the operation with nothing written.
- **Edits are followed by `H validate <dir>`.** When you edit `devcontainer.json` or `extensions.json` by hand, validate before saying it is done.

## Operations

- **Onboard** a local folder, a GitHub URL or a new repo: read [references/onboard.md](references/onboard.md) and follow it.
- **Migrate** a project that has its own `.devcontainer/` or an npm or yarn lockfile: read [references/migrate.md](references/migrate.md) and follow it.
- **Update** the image ("update my dev container", a newer image, new Agent versions): read [references/update.md](references/update.md) and follow it.
- **Presets**: adopt one in a project, remove one from a project, save a project's extensions as a Preset, or edit a Preset: read [references/presets.md](references/presets.md) and follow the matching section.
- **Add or remove one Agent Extension** (a skill, plugin, hook or MCP server, by name, repository, package or URL): read [references/extensions.md](references/extensions.md) and follow the matching section.

Other operations (egress, secrets, Preset resync, status) are not built yet. Say so plainly and stop.
