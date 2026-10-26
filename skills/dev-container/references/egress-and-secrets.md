# Egress domains and secrets

Both change a Consuming Project's `.devcontainer/`: egress lives in the Extension Manifest `.devcontainer/extensions.json`, secrets in `.devcontainer/devcontainer.json` plus the manifest (on an MCP entry, or in the top-level `secrets`). Follow the section for what the user asked, then **Finish**. Each section ends on the condition in **bold**.

## Allow a domain

1. Reduce what the user gave to a plain lower-case hostname: drop the scheme, credentials, port, path and a leading `*.`. `https://API.Example.com:443/v1` becomes `api.example.com`. A domain also allows all its subdomains, so say so when the user asked for one host and you write its parent. The Egress Allowlist works by hostname: refuse IP addresses, `localhost` and single-label names, and explain why.
2. If the project's top-level `egress`, or the Base layer's `egress` in `extensions/base.json` of the dev-setups checkout (`repo` from `H check`), already holds the domain or a parent of it, say it is already allowed and write nothing.
3. Otherwise add the domain to the top-level `egress` array of `.devcontainer/extensions.json` (create the array if needed): that list is what the project itself needs, and removing an extension never drops it. If the user says the domain is for one extension, add it to that entry's own `egress` instead, so it leaves with the entry. Leave every other entry's `egress` alone.

**Done when `H validate <dir>` returns `ok: true` and its `egress` lists the domain (or the entry's `egress` does, when the user named an extension).**

## Add a secret

A secret (Named Secret) is a host environment variable the container receives by name. Only its **name** passes through you. Never ask for the value, never read it (no `printenv`, `echo $NAME`, shell profiles or `.env` files), never write it anywhere. If the user pastes a value anyway, do not repeat or store it; tell them it is now in this conversation and that they may want to rotate it.

1. The name must match `^[A-Z_][A-Z0-9_]*$`. If the user gave something else, propose the upper-case form and ask.
2. Decide who declares it in `.devcontainer/extensions.json`. List the project's `mcp` and `mcp-remote` entries.
   - The user named an MCP server, or said the secret is for one: declare it on that entry, so it goes with the server when the server is removed.
     - `mcp`: add the name to the entry's `env` array (create it if needed).
     - `mcp-remote`: set `bearerTokenEnv` to the name. It holds one name: if it already names another, ask before replacing it.
     - The entry has a `preset` tag: say that the project's copy now differs from the Preset, and that a later resync would show the difference.
   - No MCP server needs it (the project has none, or the user says the variable is for something else, such as a CLI or a test run): add the name to the top-level `secrets` array (create it if needed). It is container-wide: every process in the container gets it, and removing an extension never removes it. Never put it on a skill, plugin or hook entry; those have no secrets field.
   - The user did not say, and the project has MCP servers: ask whether one of them needs it, or the container as a whole.
   - The name is already declared there: write nothing in the manifest. It may be declared both on an MCP entry and at the top level; one `remoteEnv` line serves both.
3. Add `"NAME": "${localEnv:NAME}"` to the `remoteEnv` object of `.devcontainer/devcontainer.json`. Edit the text: keep every other line and comment. If the key is already there as a `${localEnv:…}` reference, leave it. If it is there with anything else, show only the key, never its value, and replace it with the reference.

**Done when `H validate <dir>` returns `ok: true` and its `secrets` lists the name with a `hostEnv`, and its `neededBy` names the MCP entry or `container-wide`.** `validate` fails while any secret the manifest declares, on an entry or at the top level, has no `remoteEnv` entry, or has a value instead of a `${localEnv:…}` reference.

Then tell the user, with the `hostEnv` from `validate` filled in for `NAME` (it differs from the secret's name only when an existing `remoteEnv` line already mapped another host variable) and the value left to them:

> Export `NAME` on the host before the container starts, e.g. in your shell profile: `export NAME=<your value>`. VS Code and `devcontainer up` read it from the environment they were started from. The value stays on your machine; only the reference is in the repository. While it is unset, the container start prints a warning naming it (and the MCP server that needs it, or "container-wide").

## Finish

Egress and `remoteEnv` take effect when the container is created. Ask once, after all the user's changes: "Recreate the dev container now to apply them? Recreating ends any agent sessions running inside." On yes, run `H up <dir> --recreate`. On no, say the changes apply at the next recreate (VS Code "Rebuild Container").

Print the changed files (uncommitted, for the user to review and commit), the domains allowed, the secret names added with the server that needs each (or "container-wide"), the host variables still to export, and whether the container was recreated.
