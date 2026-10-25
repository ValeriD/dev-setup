# 06: Extension installer tracer — skills for both Agents, Base and Variant layers at build

**What to build:**
- A skill declared once in the Base or Node Variant Extension Manifest, with a Pinned Ref, is available to both Claude Code and Codex in the built image.
- Manifests get editor autocomplete and validation from a published JSON Schema.
- Invalid entries fail the build with an error naming the entry: a floating ref, a tag, a missing ref, or an unsupported kind × Agent.
- The Egress Allowlist used by the start-up step is now assembled from the manifests.

**Blocked by:** 03 (Egress Allowlist enforced by the root start-up step)

**Status:** ready-for-agent

## Technical context

**Design:** `.scratch/node-devcontainer/design.md`. Use the "Extension installer" row, the "Extension Manifest shape" section, the "Image build" flow step 5, and the Reuse decisions. See ADR `docs/adr/0004-unified-extension-manifest.md` and the glossary in `CONTEXT.md` (Extension Manifest, Extension Layer, Pinned Ref).

- **Modules:**
  - Extension installer (`installer/`): a Node ESM CLI with no build step and an `install --mode build` command. It owns the schema, validation, Pinned Ref enforcement, layer merge, git fetch by SHA, the kind × Agent capability table, skill rendering, and egress assembly.
  - Base material: `extensions/base.json` (empty `extensions`, Base egress domains moved here from 03's static file).
  - Node Variant: `variants/node/extensions.json` and the Dockerfile step that runs the installer.
- **Reuse:**
  - `ajv` for validation against the same published schema.
  - `git` fetch of the exact SHA.
  - Native skill locations: `/etc/claude-code/.claude/skills` and `/etc/codex/skills`.
  - The installer's own deps installed with frozen lockfile under the pnpm policy.
- **Dependency direction:** the installer emits the allowlist file the start-up step already consumes. The start-up step stays unaware of manifests.
- **Must not introduce:** floating refs behind any flag, running fetched content, a manifest lockfile, reconcile state, or writes into `~/.claude` or `~/.codex`.
- **Validation seam:** installer CLI integration tests against local bare-git fixtures (no network); container acceptance for the built image.
- **Coverage:**
  - SC-14 (installer integration tests, with many cases, because this rule is consequential).
  - SC-13, skill-for-both-Agents part (acceptance).
  - Keeps SC-04 green.

- [ ] A skill entry targeting both Agents appears in Claude's and Codex's skill listings in the built image
- [ ] Entries with a branch, a tag, no ref, or an unsupported kind × Agent are rejected with an error naming the entry
- [ ] Manifests reference the schema via `$schema`, and VS Code validates them
- [ ] The Base allowlist now comes from `extensions/base.json`; the egress acceptance tests still pass
- [ ] The installer's tests run with `node --test` without network access

## Spike findings to apply (from ticket 01 Answer)

- Codex config goes in `/etc/codex/config.toml`; `mcp_servers` is unioned across the system, user and managed layers. Codex admin skills go in `/etc/codex/skills`.
- Codex `plugin` is **unsupported** in the kind × Agent table. Codex installs plugins only into `$CODEX_HOME` (the login volume), which the design forbids. Confirmed by the user (design decision D3).
