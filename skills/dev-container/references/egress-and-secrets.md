# Egress domains and secrets

Allowing or disallowing a domain and adding or removing a secret all change a Consuming Project's `.devcontainer/`: egress lives in the Extension Manifest `.devcontainer/extensions.json`, secrets in `.devcontainer/devcontainer.json` plus the manifest (on an MCP entry, or in the top-level `secrets`). Follow the section for what the user asked, then **Finish**. Each section ends on the condition in **bold**.

## Allow a domain

1. Reduce what the user gave to a plain lower-case hostname: drop the scheme, credentials, port, path and a leading `*.`. `https://API.Example.com:443/v1` becomes `api.example.com`. A domain also allows all its subdomains, so say so when the user asked for one host and you write its parent. The Egress Allowlist works by hostname: refuse IP addresses, `localhost` and single-label names, and explain why.
2. Run `H status <dir> --skip-image-check --domain <domain>` and read `egress.check`. It covers all three layers; the Base and Variant layers are read from the image the project pins, never from this checkout.
   - `allowed: true`: say it is already allowed and write nothing. Name each `allowedBy` domain with its `layer` (Base, Variant or Consuming Project) and `neededBy`, and say when it is a parent domain of the one asked for. If `note` is present, add that Base coverage couldn't be checked.
   - `allowed: false`: no layer allows it; go on.
   - `allowed: null`: the project does not allow it, and Base coverage couldn't be checked (show `note`: usually the pinned image is not local yet). Say so, then go on: an extra project domain is harmless.
3. Otherwise add the domain to the top-level `egress` array of `.devcontainer/extensions.json` (create the array if needed): that list is what the project itself needs, and removing an extension never drops it. If the user says the domain is for one extension, add it to that entry's own `egress` instead, so it leaves with the entry. Leave every other entry's `egress` alone.

**Done when `H validate <dir>` returns `ok: true` and its `egress` lists the domain (or the entry's `egress` does, when the user named an extension).**

## Disallow a domain

Only the project's own domains, the top-level `egress` of `.devcontainer/extensions.json`, can be disallowed. Reduce what the user gave to a plain lower-case hostname as in **Allow a domain**, step 1.

1. Run `H plan-disallow <dir> <domain>`. It is read-only, and reads the Base and Variant layers from the image the project pins.
   - `ok: true`: show the plan: `remove` takes the domain out of the top-level `egress`. Name each `subdomainsStayAllowed` domain with its `layer` and `neededBy`: it stays reachable on its own. If `coveredBy` is present, the line is redundant: say the domain stays reachable through each covering `domain` (`coveredNote`), so removing it changes nothing reachable. If `note` is present, say Base and Variant coverage couldn't be checked, so one of those layers may still allow the domain.
   - `ok: false` with `neededBy`: refuse, and write nothing. Name each needer with its `domain`, `layer` and `neededBy`, and say what would disallow it instead: a Base or Variant domain can't be removed from a project; a domain on an entry goes when that entry is removed ([extensions.md](extensions.md)); a parent domain on an entry or in a layer (a different `domain`) keeps all its subdomains allowed, so disallowing it means disallowing that parent.
   - `ok: false` with `allowedBy`: the domain isn't in the top-level `egress`. Say who allows it, as above, and write nothing.
2. Ask once to apply the plan. On yes, delete the domain from the top-level `egress` array (drop the array if it is now empty). Leave every entry's `egress` alone.

**Done when `H validate <dir>` returns `ok: true` and its `egress` no longer lists the domain, or the plan was refused or declined.**

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

## Remove a secret

Only a container-wide secret, a name in the top-level `secrets` of `.devcontainer/extensions.json`, is removed this way. A secret an MCP server declares goes when that server is removed ([extensions.md](extensions.md)). Only names pass through you, as in **Add a secret**.

1. Run `H plan-remove-secret <dir> <NAME>`. It is read-only.
   - `ok: false` with `neededBy`: an MCP entry still declares the name. Refuse, write nothing, name each entry, and say the secret goes when that entry is removed.
   - `ok: false` otherwise: the name isn't declared in the project manifest. Say so and write nothing.
   - `ok: true`: `remove` takes the name out of the top-level `secrets`. `remoteEnv` says what happens to its line in `.devcontainer/devcontainer.json`: `delete` (nothing else declares it), `keep` (`remoteEnvKeptFor` names the Base or Variant layer that declares it too) or `none` (there is no line). If `note` is present, say Base and Variant secrets couldn't be checked: if one of those layers declares the name, the container still needs the line.
2. Show the plan and ask once to apply it. On yes, delete the name from the top-level `secrets` array (drop the array if it is now empty). On `delete`, also delete the `"NAME": …` line from `remoteEnv`, editing the text so every other line and comment stays. Never show the line's value.

**Done when `H validate <dir>` returns `ok: true` and its `secrets` no longer lists the name (or lists it only for a declarer that remains), or the plan was refused or declined.**

Then, when the `remoteEnv` line was deleted, tell the user they can unset `unsetOnHost` on the host (remove its `export` from their shell profile) if nothing else of theirs uses it. Never ask for, read or check its value.

## Finish

Egress and `remoteEnv` take effect when the container is created. Ask once, after all the user's changes: "Recreate the dev container now to apply them? Recreating ends any agent sessions running inside." On yes, run `H up <dir> --recreate`. On no, say the changes apply at the next recreate (VS Code "Rebuild Container").

Print the changed files (uncommitted, for the user to review and commit), the domains allowed or disallowed, the secret names added with the server that needs each (or "container-wide") or removed, the host variables still to export or now free to unset, and whether the container was recreated.
