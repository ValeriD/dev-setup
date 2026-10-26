# Add or remove an Agent Extension

An Agent Extension is added to a project only after the user has seen what it contains at the commit it will be pinned to. `H inspect` resolves that commit, fetches the content into a temp directory, reads it without running anything, and proposes the manifest entry. You write the entry; `H` never edits the manifest.

## Add

1. Work out the source and pass it to `H inspect <source> --project <dir>`:
   - a skill, plugin or hook script in a GitHub repository: `owner/repo`, plus `--path <dir-or-file>` inside it and `--ref <branch|tag|sha>` if the user named one (default: the default branch);
   - a plugin listed in a marketplace repository: `owner/repo --plugin <name>`;
   - a hook script: also `--event <Event>` and, if wanted, `--matcher <pattern>`. Ask for the event if the user did not say;
   - a stdio MCP server: `npm:<package>` or `npm:<package>@<range>`, `--name <name>` if the default is poor, and `--env NAME` for each secret it reads;
   - a remote MCP server: its `https://` URL, `--name <name>`, and `--bearer-token-env NAME` if it needs a token.

   Pass `--agents claude` or `--agents codex` only when the user restricts the Agents. Only names of environment variables go into these options, never values.
2. Read the result:
   - `error` with `candidates`: the path is not an extension. Show the candidates and ask which one, then inspect again.
   - any other `error` (an unreachable repository or ref): report it and stop.
   - `refused: true`: show every line of `reasons` and stop. Nothing is written. Do not offer a workaround such as a floating ref, an unpinned copy, or a Codex plugin.
3. Show the review, all of it, in this order:
   - the source and the resolved commit (`resolved.sha`, and `resolved.ref` it came from), or the exact npm version and its age, or the remote URL;
   - `inventory`: hooks (event, matcher, command), MCP servers (command or URL, env names), scripts, `bin/` files, skills, `allowedTools`, and every `shellInjection` line (say that the container disables skill shell execution, so these do not run there);
   - egress: `egress.needed` domains (the content certainly reaches them) and `egress.detected` domains, labelled as a heuristic (hosts seen in the files). Mark those whose `allowedBy` is set as already allowed;
   - `warnings`, and `project.alreadyDeclared` if the project already has this extension.
4. Ask once: add it, and which domains to allow. Propose the `needed` domains not yet allowed; offer the `detected` ones without recommending them.
5. If the user declines, stop. Nothing has been written.
6. On yes, edit `.devcontainer/extensions.json`:
   - append `entry` exactly as returned, untagged (no `preset` field);
   - when `egress.target` is `entry`, the entry already carries its domains; otherwise add each agreed domain to the top-level `egress` (create the array if needed), skipping domains already there.
7. If the entry names secrets (`env`, `bearerTokenEnv`), the entry already holds the manifest reference: for each name, do step 3 of **Add a secret** in [egress-and-secrets.md](egress-and-secrets.md) (the `remoteEnv` line), and tell the user what to export, as that section says. Never ask for a value.

**Done when `H validate <dir>` returns `ok: true`, or the user declined.**

## Remove

1. Read `.devcontainer/extensions.json` and find the entry's index in `extensions`. If several entries match what the user said, ask which.
2. Run `H plan-remove <dir> <index>`. It is read-only and says:
   - `remove`: the entry. With `presetNote`, the entry came from a Preset: say that the project will differ from that Preset, and offer removing the whole Preset instead ([presets.md](presets.md));
   - `dropsWithEntry`: the entry's own egress domains, which go with it;
   - `egress`: top-level domains that the entry named and nothing staying needs. Top-level egress carries no owner, so this is a proposal: the user may have allowed some of them for other reasons;
   - `keepEgress`: domains that stay, with what still needs them;
   - `note`: the pinned content could not be fetched; show the top-level `egress` and ask which domains to drop.
3. Show the plan and ask once to apply it (the user may keep any of the `egress` domains).
4. On yes, delete the entry and the agreed domains. Everything else stays untouched, including `remoteEnv` lines for secrets the entry named (removing those is not part of this operation; name them in the summary).

**Done when `H validate <dir>` returns `ok: true`, or the user declined.**

## Finish

The project layer is installed when the container is created. After all the user's changes, ask once: "Recreate the dev container now to apply them? Recreating ends any agent sessions running inside." On yes, run `H up <dir> --recreate`. On no, say the changes apply at the next recreate. Print the changed files (uncommitted, for the user to review and commit), the entries added or removed with their Pinned Refs, the domains allowed or dropped, and the host variables to export.
