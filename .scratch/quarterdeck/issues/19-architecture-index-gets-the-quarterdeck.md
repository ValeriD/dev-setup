# 19: ARCHITECTURE.md describes the Quarterdeck as built

**Status:** ready-for-agent
**Model:** Sonnet
**Design slice:** after slice 8 (design: "ARCHITECTURE.md gets a Quarterdeck section when the implementation lands, not before")

## What to build

`ARCHITECTURE.md` lists the Quarterdeck as an implemented module, in the index's own style: responsibilities, code anchors, dependency direction, and links to ADRs 0006 to 0008. Only what exists when this ticket is picked up is described; anything the build left out or changed from the design is described as built.

## Acceptance criteria

- [ ] `ARCHITECTURE.md` has one row or short section for the Quarterdeck with its modules (image, host command, entrypoint, launcher, project-container creator, publisher, FirstMate configuration, mate skills), their code anchors under `quarterdeck/`, and the dependency direction (Quarterdeck depends on Base and the installer; nothing in `base/`, `installer/`, `variants/` or `templates/` depends on it).
- [ ] It links ADR 0006, 0007 and 0008 and `quarterdeck/CHECKLIST.md`, and states that the Quarterdeck image is built in CI and not published.
- [ ] No claim in it is false against the repository at the time: every path named exists.
- [ ] Each fact appears once; an existing row that the Quarterdeck changes (for example "Base: what every Variant has in common") is rewritten, not appended to.
- [ ] The file stays an index: detail that would make it long goes to `docs/architecture/quarterdeck.md`, linked from the index.

## Technical context

**Design:** `.scratch/quarterdeck/design.md`, "Constraints" (last bullet) and "Existing shape". Conventions: `docs/agents/architecture.md` (call the `writing-for-agents` skill before editing).

- **Modules:** `ARCHITECTURE.md`, optionally `docs/architecture/quarterdeck.md`.
- **Must not introduce:** anything not built, any proposed feature, a copy of the design.
- **Validation seam:** a read of the file against the tree; no code change.
- **Coverage:** none (documentation).

## Blocked by

- 18: A failing ticket is retried once then stops; a question stops the run
