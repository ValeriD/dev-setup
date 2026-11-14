# 19: ARCHITECTURE.md describes the Quarterdeck as built

**Status:** done
**Model:** Sonnet
**Design slice:** after slice 8 (design: "ARCHITECTURE.md gets a Quarterdeck section when the implementation lands, not before")

## What to build

`ARCHITECTURE.md` lists the Quarterdeck as an implemented module, in the index's own style: responsibilities, code anchors, dependency direction, and links to ADRs 0006 to 0008. Only what exists when this ticket is picked up is described; anything the build left out or changed from the design is described as built.

## Acceptance criteria

- [x] `ARCHITECTURE.md` has one row or short section for the Quarterdeck with its modules (image, host command, entrypoint, launcher, project-container creator, publisher, FirstMate configuration, mate skills), their code anchors under `quarterdeck/`, and the dependency direction (Quarterdeck depends on Base and the installer; nothing in `base/`, `installer/`, `variants/` or `templates/` depends on it).
- [x] It links ADR 0006, 0007 and 0008 and `quarterdeck/CHECKLIST.md`, and states that the Quarterdeck image is built in CI and not published.
- [x] No claim in it is false against the repository at the time: every path named exists.
- [x] Each fact appears once; an existing row that the Quarterdeck changes (for example "Base: what every Variant has in common") is rewritten, not appended to.
- [x] The file stays an index: detail that would make it long goes to `docs/architecture/quarterdeck.md`, linked from the index.

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

### Resolution — documentation only

Closed ticket 19 for implementation `ce9e9ec`, reviewed against fixed point `5bad0d4bcca3d677df6890eaf65f617763cf1881`. All five documentation acceptance criteria are satisfied. Independent Standards, Design and Spec reviews report zero findings; no dispositions are needed. Their reports are preserved verbatim below.

Validation: `npm run test:quarterdeck` completed with exit 0 in `/tmp/qd19-review/tests-complete.log`: 32 tests, 31 pass, 0 fail, 1 TODO. The TODO is the known token persistence in `/etc/environment` (security-review 05), not a pass or resolved security concern. The earlier `/tmp/qd19-review/tests.log` attempt timed out at 200 seconds; the rerun completed. No tests were rerun for closure. Broader regression intentionally not run.

Per user direction, dependency 18 and other tickets awaiting manual evidence do not block truthful as-built documentation; they remain pending and unchanged. Stock shallow-home dispatch, credential persistence/outside-exec readability, real-Claude loading and unattended supervision remain limitations or unproven behavior, not validated passes. This closes neither the design nor the spec and implements no other ticket. No implementation edits were needed. Unrelated grill notes, issue 07, `CONTEXT.md` and untracked security-review 01 are preserved and excluded from the closure commit.

Independent report: `/tmp/qd19-review/Standards.log`

```markdown
## Standards

No findings in committed diff `5bad0d4...ce9e9ec`.

The changes follow the architecture-index and progressive-disclosure conventions; the issue handoff is appended under `## Comments`. No applicable baseline smells or changed-test concerns found. No `CODING_STANDARDS.md` or `CONTRIBUTING.md` was found.

Pending manual evidence is explicitly distinguished from shipped implementation and is not represented as passing validation.

No tests run for this documentation-only review; broader regression intentionally not run. No edits, commits, or credential probes performed; unrelated working-tree changes preserved.

**Standards: 0 findings.**
```

Independent report: `/tmp/qd19-review/Design.log`

```markdown
## Design

No material findings in `git diff 5bad0d4bcca3d677df6890eaf65f617763cf1881...HEAD` (`ce9e9ec`).

The documentation preserves the designed module ownership, dependency direction, existing-tool reuse and explicit non-goals. Moving detail behind the architecture index matches ticket 19’s documentation-only validation seam.

Pending real-agent evidence and existing security limitations are explicitly distinguished from implemented mechanisms; they are not presented as passed acceptance checks.

No tests run. No files edited or committed; unrelated working-tree changes preserved.

**Summary: Design — 0 findings.**
```

Independent report: `/tmp/qd19-review/Spec.log`

```markdown
## Spec

No findings in committed diff `5bad0d4...ce9e9ec`.

Ticket 19’s requirements are covered: all eight modules and code anchors, dependency direction, required ADR/checklist links, CI build/non-publication, and detail moved behind an architecture-page link.

Pending real-agent evidence is explicitly distinguished from shipped implementation; this documentation change does not claim to complete ticket 18.

No tests run for this documentation-only review. No files edited or committed; unrelated working-tree changes preserved.

**Spec: 0 findings.**
```
