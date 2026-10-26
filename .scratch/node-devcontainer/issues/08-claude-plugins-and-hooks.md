# 08: Claude plugins and hooks (and Codex plugins if supported)

**What to build:**
- Plugins declared in any Extension Layer load in Claude Code, each pinned to the commit SHA in its manifest. Two forms are supported: a direct git source, or a plugin referenced from a marketplace at a pinned SHA.
- Claude refuses any marketplace other than the generated ones.
- Hooks declared in manifests run; hooks in a repository's own `.claude/settings.json` don't.
- Codex plugins are supported if the spike confirmed the mechanism. Otherwise they are rejected at validation with a clear error.

**Blocked by:** 07 (Consuming Project layer installed at container start)

**Status:** done

## Technical context

**Design:** `.scratch/node-devcontainer/design.md`. Use the "Claude delivery" capsule bullet, the "Extension Manifest shape" section (marketplace-referenced plugin rule), and the Reuse decisions. See ADR 0004. Ticket 01 Answer questions 3, 4 and 6 decide the details.

- **Modules:**
  - Extension installer: generates a sha-pinned `directory` marketplace per seed (image seed at build, project seed at start). It installs into the seeds with `CLAUDE_CODE_PLUGIN_CACHE_DIR`, and renders the managed settings base file (image) and the `managed-settings.d` drop-in (start). The drop-in carries:
    - `enabledPlugins`;
    - `extraKnownMarketplaces`;
    - `strictKnownMarketplaces`, set to only those two directories;
    - `allowManagedHooksOnly`, `disableSkillShellExecution`, `disableSideloadFlags` and `disableCommandPluginSources`;
    - manifest hooks.
  - Base material: the Claude policy template, and `CLAUDE_CODE_PLUGIN_SEED_DIR` chaining both seeds.
- **Reuse:** Claude Code's native seeds, `directory` marketplaces, managed settings and drop-ins. No plugin "upgrade" command.
- **Plugin hooks:** if the spike showed that plugin hooks don't run under `allowManagedHooksOnly`, the installer rejects plugins that contain hooks and tells the user to declare the hook as a manifest hook instead.
- **Must not introduce:** third-party marketplaces registered directly, floating marketplace refs, or a runtime clone of plugins.
- **Validation seam:** container acceptance using `claude plugin list` and `claude -p --output-format stream-json --verbose` init events (no model call needed); local git fixtures for plugin sources.
- **Coverage:** SC-13 (plugins), SC-15, SC-16.

- [x] A Variant-layer plugin is present at image start; a project-layer plugin appears after recreate and disappears after removal
- [x] Each loaded plugin's path resolves to the commit SHA from its manifest
- [x] Adding any other marketplace fails with the enterprise-policy error
- [x] A `SessionStart` hook in the fixture project's `.claude/settings.json` does not run; a manifest-declared hook does
- [x] A marketplace-referenced plugin whose external source lacks a SHA is rejected
- [x] Codex plugin entries are rejected at validation with a clear error (design decision D3)

## Spike findings to apply (from ticket 01 Answer)

- Hooks inside force-enabled managed plugins DO run under `allowManagedHooksOnly`, so plugins with hooks need no special case.
- `managed-settings.d` drop-ins merge `enabledPlugins`, `extraKnownMarketplaces` and `hooks`, and `strictKnownMarketplaces` lists union. Multiple seeds through `:` work.
- Loaded plugin paths resolve to the `directory` marketplace dirs, so those dirs must persist at runtime.
- Verify loading through the `claude -p --output-format stream-json --verbose` init event. `claude plugin list` showed "No plugins installed" even when plugins were loaded.

## Comments

- Implemented: `installer/src/claude.mjs` (plugin/hook install + managed-settings fragment), called from `installBuild`/`installStart`; policy template now installed at `/opt/dev-setup/claude-policy.json` and rendered to `/etc/claude-code/managed-settings.json` at build; `tests/plugins.test.mjs`, `installer/test/claude.test.mjs`.
- Deviation (approved): no plugin seeds and no `CLAUDE_CODE_PLUGIN_SEED_DIR`/`CLAUDE_CODE_PLUGIN_CACHE_DIR`. Force-enabled plugins from root-owned `directory` marketplaces load in place with no network (verified), so seeds added nothing and would need running `claude` as root in the start-up step. Claude only writes bookkeeping JSON into the login volume, no plugin content.
- Marketplace-referenced plugins: relative sources are pinned by the marketplace SHA; external `github`/`url`/`git-subdir` (github.com) sources must carry their own full SHA, else rejected; `npm` and other source types are rejected. Rejection happens at install (it needs the marketplace content), not in schema validation; at start it makes `up` fail naming the entry.
- Hook scripts must be a single file (`source.path`); copied root-owned, executable, to `/opt/dev-setup/hooks/<layer>/NN-<name>`.
- For ticket 09 (MCP): `assertInstallable` in `installer/src/install.mjs` currently rejects `mcp`/`mcp-remote`; remove those from `NOT_INSTALLABLE` and add MCP settings to the same fragment (`installClaude` result / drop-in) and policy template merge in `installBuild`.
- Restart note: marketplace/hook dirs and the drop-in are regenerated on each start; a removed entry is only cleaned up on recreate for skills, but plugins/hooks are fully rebuilt.
