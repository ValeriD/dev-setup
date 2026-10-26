# 13: Tidy the Node rows in ARCHITECTURE.md

**What to build:** Each Node-area row in `ARCHITECTURE.md`, including the Extension installer and Node Variant rows, describes only the current state, once.

**Blocked by:** None (can start immediately)

**Status:** needs-triage

## Context

Merging parallel tickets with a sentence-union left several old versions of each row run together. Ticket 04 already rewrote the skill rows.

## Open questions (for grilling)

- Keep the current one-file index, or move details to per-area files, as `docs/agents/architecture.md` allows?
- Add a merge rule for future agents (for example "rewrite the row, never append") to `docs/agents/architecture.md`?
