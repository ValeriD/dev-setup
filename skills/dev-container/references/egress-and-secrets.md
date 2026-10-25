# Egress domains and secrets

Both change a Consuming Project's `.devcontainer/`: egress lives in the Extension Manifest `.devcontainer/extensions.json`, secrets in `.devcontainer/devcontainer.json` plus the manifest. Follow the section for what the user asked, then **Finish**. Each section ends on the condition in **bold**.

## Allow a domain

1. Reduce what the user gave to a plain lower-case hostname: drop the scheme, credentials, port, path and a leading `*.`. `https://API.Example.com:443/v1` becomes `api.example.com`. A domain also allows all its subdomains, so say so when the user asked for one host and you write its parent. The Egress Allowlist works by hostname: refuse IP addresses, `localhost` and single-label names, and explain why.
2. If the project's top-level `egress`, or the Base layer's `egress` in `extensions/base.json` of the dev-setups checkout (`repo` from `H check`), already holds the domain or a parent of it, say it is already allowed and write nothing.
3. Otherwise add the domain to the top-level `egress` array of `.devcontainer/extensions.json` (create the array if needed). Leave every entry's own `egress` alone: those belong to the entry.

**Done when `H validate <dir>` returns `ok: true` and its `egress` lists the domain.**

## Add a secret

A secret is a host environment variable that an MCP server needs. Only its **name** passes through you. Never ask for the value, never read it (no `printenv`, `echo $NAME`, shell profiles or `.env` files), never write it anywhere. If the user pastes a value anyway, do not repeat or store it; tell them it is now in this conversation and that they may want to rotate it.

1. The name must match `^[A-Z_][A-Z0-9_]*$`. If the user gave something else, propose the upper-case form and ask.
2. Find the manifest reference. List the project's `mcp` and `mcp-remote` entries in `.devcontainer/extensions.json`. Use the one the user named; if they named none, ask which server needs the secret.
   - `mcp`: add the name to the entry's `env` array (create it if needed).
   - `mcp-remote`: set `bearerTokenEnv` to the name. It holds one name: if it already names another, ask before replacing it.
   - The entry has a `preset` tag: say that the project's copy now differs from the Preset, and that a later resync would show the difference.
   - No MCP server needs it (the project has none, or the user says the variable is for something else): the Extension Manifest has no place to name it. Say that the container start-up warning and `status` will therefore not report it when unset, and on the user's go-ahead add only the `remoteEnv` line of step 3.
3. Add `"NAME": "${localEnv:NAME}"` to the `remoteEnv` object of `.devcontainer/devcontainer.json`. Edit the text: keep every other line and comment. If the key is already there as a `${localEnv:…}` reference, leave it. If it is there with anything else, show only the key, never its value, and replace it with the reference.

**Done when `H validate <dir>` returns `ok: true` and its `secrets` lists the name with a `hostEnv`.** `validate` fails while any secret named in the manifest has no `remoteEnv` entry, or has a value instead of a `${localEnv:…}` reference.

Then tell the user, with the `hostEnv` from `validate` filled in for `NAME` (it differs from the secret's name only when an existing `remoteEnv` line already mapped another host variable) and the value left to them:

> Export `NAME` on the host before the container starts, e.g. in your shell profile: `export NAME=<your value>`. VS Code and `devcontainer up` read it from the environment they were started from. The value stays on your machine; only the reference is in the repository.

## Finish

Egress and `remoteEnv` take effect when the container is created. Ask once, after all the user's changes: "Recreate the dev container now to apply them? Recreating ends any agent sessions running inside." On yes, run `H up <dir> --recreate`. On no, say the changes apply at the next recreate (VS Code "Rebuild Container").

Print the changed files (uncommitted, for the user to review and commit), the domains allowed, the secret names added with the server that needs each, the host variables still to export, and whether the container was recreated.
