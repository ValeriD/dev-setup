# One agent-neutral Extension Manifest, translated per Agent

Agent Extensions are declared in our own JSON format, with a schema, rather than in native Claude `settings.json` or Codex `config.toml` fragments. This way one entry can serve both Agents, and the installer can enforce a Pinned Ref on every entry. The installer generates a private Claude plugin marketplace with every plugin pinned by commit `sha`, because marketplace sources only accept a movable `ref`. Managed settings then lock things down:
- `strictKnownMarketplaces` allows only that generated marketplace.
- `allowManagedHooksOnly` ignores hooks from a repo's own `.claude/`. ChainDrop kept itself running through project `SessionStart` hooks.

## Consequences

- Every Agent feature we want to support needs translator code. A new kind of extension is not usable until the installer knows about it.
- A project that needs a hook must declare it in its Extension Manifest, not in `.claude/settings.json`.
- Claude's only managed MCP file, `managed-mcp.json`, is exclusive. So once any layer declares an MCP server, `claude mcp add` is refused in that container, and every MCP server has to come from a manifest. We accepted this lock. Containers whose layers declare no MCP server are unaffected.
