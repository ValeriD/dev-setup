# One agent-neutral Extension Manifest, translated per Agent

Agent Extensions are declared in our own JSON format, with a schema, rather than in native Claude `settings.json` or Codex `config.toml` fragments. This way one entry can serve both Agents, and the installer can enforce a Pinned Ref on every entry. The installer generates a private Claude plugin marketplace with every plugin pinned by commit `sha`, because marketplace sources only accept a movable `ref`. Managed settings then lock things down:
- `strictKnownMarketplaces` allows only that generated marketplace.
- `allowManagedHooksOnly` ignores hooks from a repo's own `.claude/`. ChainDrop kept itself running through project `SessionStart` hooks.

## Consequences

- Every Agent feature we want to support needs translator code. A new kind of extension is not usable until the installer knows about it.
- A project that needs a hook must declare it in its Extension Manifest, not in `.claude/settings.json`.
- Each entry of any kind carries the egress domains it needs in its own `egress`, so removing it takes them along. A domain in a manifest's top-level `egress` means "this layer needs it" and is never dropped by removing an extension. Existing top-level domains were not migrated; they now count as the project's own. A Preset file has no top-level `egress`, so a resync or a Preset removal carries every egress change through its entries. (Amended 2026-10-26: egress had been on MCP entries only, with no owner for the domains other kinds needed.)
- A secret the container needs, but no MCP server does, is declared by name in a manifest's top-level `secrets` (container-wide). A secret an MCP server needs stays on that entry (`env`, `bearerTokenEnv`), so removing the server never edits the top-level list. The same name may be declared in both places; it has one `remoteEnv` line. Skill, plugin and hook entries carry no secrets. A Preset file has no top-level `secrets`. Every install writes the list of declared names, MCP or not, and an unset one is warned about at container start, never failing it. (Amended 2026-10-26: secrets could be declared only on MCP entries, so a secret for anything else went unreported when unset.)
- Claude's only managed MCP file, `managed-mcp.json`, is exclusive. So once any layer declares an MCP server, `claude mcp add` is refused in that container, and every MCP server has to come from a manifest. We accepted this lock. Containers whose layers declare no MCP server are unaffected.
