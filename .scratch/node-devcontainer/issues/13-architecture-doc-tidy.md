# 13: Tidy the Node rows in ARCHITECTURE.md

**What to build:**
- Each Node-area row in `ARCHITECTURE.md` describes only the current state, once. That includes the Extension installer and Node Variant rows, plus Base material, CI and tests.
- `docs/agents/architecture.md` tells agents and merges to rewrite a row, never append a new version next to the old one.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

## Technical context

**Design:** `.scratch/manifest-followups/design.md` (the "Docs" capsule bullet; Q4, Q5).

- **Modules:** `ARCHITECTURE.md` (the index) and `docs/agents/architecture.md` (the rules).
- **Implementation anchors:** the skill rows ticket 04 rewrote are the model to follow. Check every claim against the code as it is now.
- **Reuse:** the `writing-for-agents` skill, as `docs/agents/architecture.md` already requires.
- **Must not introduce:** a split into `docs/architecture/<area>.md` files, proposed (unbuilt) architecture, or changes to the skill rows beyond fixing wrong facts.
- **Validation seam:** review. Every code anchor named in the index exists.
- **Coverage:** docs only.

- [ ] No Node-area row holds two versions of the same fact, and each row matches the code
- [ ] Every path the index names exists
- [ ] `docs/agents/architecture.md` has the "rewrite the row, never append" rule
