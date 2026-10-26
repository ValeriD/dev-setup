# 04: Egress domains and secrets

**What to build:**
- "Allow <domain>" adds it to the project's egress.
- "Add secret FOO" adds a `remoteEnv` `FOO: ${localEnv:FOO}` entry and the manifest reference, and tells me to export `FOO` on the host.
- The skill never asks for, reads or writes the value.

**Blocked by:** 01 (Skill foundation and onboarding); node-devcontainer 09 (MCP servers and secrets)

**Status:** done

## Technical context

**Design:** `.scratch/dev-container-skill/design.md` (approved), with spec `.scratch/dev-container-skill/spec.md`. Glossary: `CONTEXT.md`. ADRs 0001, 0003, 0004, 0005. Ticket rule: never edit tickets other than your own; new needs go into new tickets.

- **Modules:** skill prompt flows; `validate` checks that every named secret has a matching `remoteEnv` entry.
- **Reuse:** the MCP `env` naming from node-devcontainer 09's schema.
- **Must not introduce:** any code path that accepts a secret value.
- **Validation seam:** `validate` integration tests, plus checklist entries.
- **Coverage:** SC-07.

- [x] A domain added through the skill appears in the project's egress, and `validate` passes
- [x] Adding a secret writes `remoteEnv` and the manifest reference; the checklist confirms the value is never requested
- [x] `validate` flags a named secret that has no `remoteEnv` entry

## Comments

**Built (agent, 2026-10-26):**
- `validate` (`skills/dev-container/scripts/commands.mjs`) now reports the manifest's top-level `egress` and a `secrets` list. Every secret the project manifest names (installer `secretNames`: stdio `env`, `mcp-remote` `bearerTokenEnv`) must have a `remoteEnv` key in `devcontainer.json` whose value is a `${localEnv:VAR}` reference with no default; a missing key, or any other value (a literal, `${localEnv:X:default}`, `${containerEnv:…}`), is a problem. Problems name the secret and the entry, never the value.
- Skill flow `skills/dev-container/references/egress-and-secrets.md`, routed from `SKILL.md`: "Allow <domain>" (normalise to a hostname, skip when the project or Base layer already covers it, add to top-level `egress`) and "Add secret FOO" (name to the MCP entry's `env` / `bearerTokenEnv`, `"FOO": "${localEnv:FOO}"` text-edited into `remoteEnv`, then the export instruction), followed by one recreate question. No helper subcommand takes a value.
- Tests: three helper integration tests in `scripts/test/helper.test.mjs` (domain reported / URL rejected; named secrets with `${localEnv:}` pass and the Template comments survive; missing entry or value flagged without echoing it). Checklist rows E1–E5 in `docs/manual/dev-container-skill-checklist.md` cover the conversation, including that the value is never requested and a pasted value is not written.

**Deviations / decisions for the product owner:**
- The manifest reference for a secret is the MCP entry's `env` or `bearerTokenEnv` (the schema has no other place). A secret no MCP server needs gets only the `remoteEnv` line, after the skill says that the start-up warning and `status` will not cover it. A top-level named-secret list in the schema would close that gap; that is a schema change and belongs elsewhere (installer) if wanted.
- `validate` checks only the project layer's named secrets. Secrets named by the Base or Variant layer (none today) are still warned about at container start by `base/mcp/check-secrets.sh`; checking them in `validate` from the local checkout could disagree with the image actually pinned. Belongs elsewhere (`status`, ticket 07) if wanted.
- Removing an allowed domain or a secret was not built (not in this ticket's requirements).
- `ARCHITECTURE.md`: the skill section's Skill prompt and Skill helper rows held several concatenated stale versions; each was rewritten as one current row. The Node section's Extension installer and Node Variant rows have the same duplication and were left alone (belongs elsewhere).
