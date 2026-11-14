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

## Comments

### Implementation handoff — independent review and closure pending

Fixed point: `5bad0d4bcca3d677df6890eaf65f617763cf1881`. Implement skill steps 1–5 only; parent owns review and closure. Status and acceptance checkboxes are unchanged.

Sketch: extend the existing index (reuse rung 2), disclose startup/flow/validation details in `docs/architecture/quarterdeck.md`, and reuse `quarterdeck/PROJECT-CONTAINERS.md` for container and launcher contracts. No new runtime abstraction, interface, dependency direction or dispatch change. Documentation inspection is the validation seam; no executable scenarios or TDD cycle belong to this ticket.

Replaced the long existing Quarterdeck rows with eight module anchors and responsibilities, explicit dependency direction, ADR links and checklist/area pointers. CI build/non-publication remains in the existing CI row rather than being repeated. The area page distinguishes shipped procedures from unproven real-agent behavior and preserves known trust limitations. Inspected the actual Dockerfile, host/startup/launcher/creator/publisher scripts, mate skills/configuration, CI workflow and prepared-home test setup rather than copying proposed design behavior.

Validation: all eight root Markdown links and five area-page links resolve; all Quarterdeck index code anchors exist. `git diff --check` passed. Static dependency search found no Quarterdeck reference in `base/`, `installer/`, `variants/` or `templates/`. No runtime tests were run for this documentation-only change. Broader coverage intentionally not run: `npm test`, full acceptance suite, `test:skill`, installer/unrelated suites and pomoplan gate. No live agents, GitHub operations or credential probes occurred.

No documentation implementation blocker remains. Dependency 18 remains ready-for-human with real-agent failure/question/death runs unperformed; this work does not satisfy or close it. Stock shallow-home dispatch, credential persistence/outside-exec readability, real-Claude loading and unattended supervision remain existing limitations, not claimed passes. No new distinct security concern was identified; existing numbered concerns are linked rather than duplicated. Unsupported `runArgs` rejection and retained Features are unchanged.

Only this ticket, `ARCHITECTURE.md` and `docs/architecture/quarterdeck.md` belong to this implementation commit. Preexisting grill notes, issue 07, `CONTEXT.md` and untracked security-review 01 remain outside it.
