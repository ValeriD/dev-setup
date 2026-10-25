# 03: Add and remove extensions after review

**What to build:** I ask "add <extension> from <owner/repo>". The skill resolves the commit SHA and shows me what the extension contains:
- hooks, MCP servers, scripts and `bin/`;
- skill shell injection and `allowed-tools`;
- detected hosts, labelled as heuristic.

It writes the pinned entry and its egress only after I approve. Removing an extension deletes its entry and any egress only it needed. Codex plugins and unpinnable entries are refused with a reason.

**Blocked by:** 01 (Skill foundation and onboarding); node-devcontainer 08 (Claude plugins and hooks)

**Status:** ready-for-agent

## Technical context

**Design:** `.scratch/dev-container-skill/design.md` (approved), with spec `.scratch/dev-container-skill/spec.md`. Glossary: `CONTEXT.md`. ADRs 0001, 0003, 0004, 0005. Ticket rule: never edit tickets other than your own; new needs go into new tickets.

- **Modules:** Skill helper `inspect <source> [--ref]`; the skill prompt's add/remove flows.
- **Reuse:** the installer's fetch-by-SHA and its kind × Agent table, where Codex `plugin` is rejected (node design D3).
- **Constraints:**
  - Fetched content goes into a fresh `mkdtemp` directory and is only read, never executed.
  - Include a mechanical test asserting the helper never spawns anything under a fetch directory.
- **Validation seam:** helper integration tests against fixture plugins and skills in local bare git repos (with hooks, MCP, `bin/`, shell injection), plus checklist entries for approve and decline.
- **Coverage:** SC-04, SC-05, SC-06 (extension removal).

- [ ] `inspect` reports the resolved SHA and the full inventory for fixture sources, and fails for unreachable refs
- [ ] Declining writes nothing; approving writes a pinned entry plus egress, and `validate` passes
- [ ] Codex `plugin`, floating refs, and `mcp-remote` without egress are refused with a reason
- [ ] Removal prunes only egress that no remaining entry needs
- [ ] A test proves no fetched file is executed
