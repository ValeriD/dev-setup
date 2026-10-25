# Architecture docs

When creating or editing `ARCHITECTURE.md` or a linked `docs/architecture/<area>.md`, call the Skill tool with "writing-for-agents" and apply its guidance.

Architecture is read with progressive disclosure:

- `ARCHITECTURE.md` at the repository root is a short index of the architecture that is implemented now. It lists modules, responsibilities, code anchors, dependency direction, and links to details.
- `docs/architecture/<area>.md` holds details for an area only when the root index cannot stay short without them.
- `docs/adr/` records durable decisions. Read only ADRs linked from a relevant architecture entry.
- A proposed feature design lives in the issue tracker. It does not change the current-state index until implementation lands.

When looking for overlapping proposed work, search open tracker items for `type: technical-design` and the relevant `touches` value. Read the design capsule first and load the full design only when the capsule shows a real overlap.

Keep `ARCHITECTURE.md` an index, not a store. An unlisted area has no indexed architecture; do not assume that it has no architecture.
