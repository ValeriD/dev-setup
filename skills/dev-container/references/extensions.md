# Add or remove an Agent Extension

An Agent Extension is added to a project only after the user has seen what it contains at the commit it will be pinned to. `H inspect` resolves that commit, fetches the content into a temp directory, reads it without running anything, and proposes the manifest entry. You write the entry; `H` never edits the manifest.

## Add

1. Work out the source. If the user gave only a name ("the Playwright MCP"), find its repository, npm package or URL, say which one you found, and ask the user to confirm it before inspecting. Pass it to `H inspect <source> --project <dir>`:
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
   - egress: `egress.onEntry`, the domains already on the proposed entry (the content certainly reaches them, or the remote server's host), and `egress.detected` domains, labelled as a heuristic (hosts seen in the files). Mark those whose `allowedBy` is set as already allowed (by any layer: the Base and Variant layers are read from the project's pinned image); an extension's domains still go on its entry, so they leave with it. When `project.layers.known` is `false`, say Base coverage couldn't be checked (`project.layers.reason`);
   - `warnings`, and `project.alreadyDeclared` if the project already has this extension.
4. Ask once: add it, and which more domains it needs. The `onEntry` domains come with it; offer the `detected` ones without recommending them. For a stdio MCP server npm declares no domains, so ask which ones it reaches.
5. If the user declines, stop. Nothing has been written.
6. On yes, edit `.devcontainer/extensions.json`:
   - append `entry` exactly as returned, untagged (no `preset` field);
   - add each agreed extra domain to that entry's own `egress` (create the array if needed). Never put an extension's domain in the top-level `egress`: that list is what the project itself needs, and removing an extension never touches it.
7. If the entry names secrets (`env`, `bearerTokenEnv`), the entry already holds the manifest reference: for each name, do step 3 of **Add a secret** in [egress-and-secrets.md](egress-and-secrets.md) (the `remoteEnv` line), and tell the user what to export, as that section says. Never ask for a value.

**Done when `H validate <dir>` returns `ok: true`, or the user declined.**

## Remove

1. Read `.devcontainer/extensions.json` and find the entry's index in `extensions`. If several entries match what the user said, ask which.
2. Run `H plan-remove <dir> <index>`. It is read-only and says:
   - `remove`: the entry. With `presetNote`, the entry came from a Preset: say that the project will differ from that Preset, and offer removing the whole Preset instead ([presets.md](presets.md));
   - `dropsWithEntry`: the entry's own egress domains, which go with it. Each has `stillAllowedBy`: a staying entry's egress or the top-level `egress` (what the project itself needs) that keeps it allowed; empty means the project layer stops allowing it;
   - `secretsWithEntry`: the Named Secrets the entry declares, which go with it. Each has `stillDeclaredBy` (a staying MCP entry, or `container-wide` for the top-level `secrets`) and `remoteEnv`: `delete` when nothing else declares it, `keep` when something does, `none` when there is no line.
3. Show the plan and ask once to apply it.
4. On yes, delete the entry. Its domains and secret names go with it; the top-level `egress` and `secrets` stay untouched. For each secret with `remoteEnv: delete`, delete its `"NAME": …` line from `remoteEnv` in `.devcontainer/devcontainer.json`, editing the text so every other line and comment stays; never show the value. Then tell the user they can unset `unsetOnHost` on the host if nothing else of theirs uses it.

**Done when `H validate <dir>` returns `ok: true`, or the user declined.**

## Finish

The project layer is installed when the container is created. After all the user's changes, ask once: "Recreate the dev container now to apply them? Recreating ends any agent sessions running inside." On yes, run `H up <dir> --recreate`. On no, say the changes apply at the next recreate. Print the changed files (uncommitted, for the user to review and commit), the entries added or removed with their Pinned Refs, the domains allowed or dropped, the host variables to export, and those now free to unset.
