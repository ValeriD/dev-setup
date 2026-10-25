# 04: Egress domains and secrets

**What to build:**
- "Allow <domain>" adds it to the project's egress.
- "Add secret FOO" adds a `remoteEnv` `FOO: ${localEnv:FOO}` entry and the manifest reference, and tells me to export `FOO` on the host.
- The skill never asks for, reads or writes the value.

**Blocked by:** 01 (Skill foundation and onboarding); node-devcontainer 09 (MCP servers and secrets)

**Status:** ready-for-agent

## Technical context

**Design:** `.scratch/dev-container-skill/design.md` (approved), with spec `.scratch/dev-container-skill/spec.md`. Glossary: `CONTEXT.md`. ADRs 0001, 0003, 0004, 0005. Ticket rule: never edit tickets other than your own; new needs go into new tickets.

- **Modules:** skill prompt flows; `validate` checks that every named secret has a matching `remoteEnv` entry.
- **Reuse:** the MCP `env` naming from node-devcontainer 09's schema.
- **Must not introduce:** any code path that accepts a secret value.
- **Validation seam:** `validate` integration tests, plus checklist entries.
- **Coverage:** SC-07.

- [ ] A domain added through the skill appears in the project's egress, and `validate` passes
- [ ] Adding a secret writes `remoteEnv` and the manifest reference; the checklist confirms the value is never requested
- [ ] `validate` flags a named secret that has no `remoteEnv` entry
