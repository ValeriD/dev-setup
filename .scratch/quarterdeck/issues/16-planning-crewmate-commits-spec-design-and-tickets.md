# 16: A planning Crewmate commits the Spec, design and tickets on the Spec Run's branch

**Status:** ready-for-human
**Model:** Opus (the ticket exercises and corrects skill text and the planning Brief; the planning Crewmate itself runs on Sonnet)
**Design slice:** 4 (Planning Crewmate)

## Note on private extension sources

pomoplan's Project layer pulls its skills from the private `ValeriD/skills`. The user will provide a read-only token limited to that repository (ticket 08, proven in ticket 14). This is no longer an open question. The planning Crewmate needs the project's own `/to-spec`, `/to-design` and `/to-tickets` skills from that layer.

## What to build

The Second Mate is steered by hand with one handoff (grilling decisions verbatim, a slug and a prefix). It starts the project container, writes the Brief, and spawns a planning Crewmate that, in the project container, creates `<prefix><slug>`, writes `.scratch/<slug>/spec.md`, `design.md` and `issues/NN-*.md` with the project's skills, makes exactly one commit, and appends `done [at=...]: plan committed <sha>; <N> tickets`. A decision the handoff does not make goes to `needs-decision` and stops the run.

## Working assumptions and decisions

- DECISION (user): the planning Crewmate runs on Sonnet, not Opus.
- Working assumption, not yet confirmed: design open question 9, the handoff is the user's decisions as told to the First Mate.
- Planning is in the MVP (grill decision 39); this overrides the spec's "planning is out of scope" and decision 16's pre-pushed spec branch.

## Acceptance criteria

- [ ] After one handoff to pomoplan's Second Mate, the Second Mate's clone has `<prefix><slug>` with exactly one commit on top of `origin/main`, containing `.scratch/<slug>/spec.md`, `design.md` and `issues/NN-*.md`; the status line `plan committed <sha>; <N> tickets` is present; nothing was pushed.
- [ ] `launch.log` shows the planning session on Sonnet, launched through the container route.
- [ ] A handoff that leaves a needed decision open produces a `needs-decision` line and no commit, and the Second Mate stops without choosing for the user (SC-12 precursor).
- [ ] The Second Mate wrote the Brief from `references/brief.md` and the plan session did exactly the one job named by the Brief (plan), nothing else.
- [ ] The `qd-first-mate` and `qd-spec-run` text (ticket 10) is corrected where this run showed it wrong; each correction is listed in a comment on this file.
- [ ] The SC-planning row in `quarterdeck/CHECKLIST.md` is run and noted.

## Technical context

**Design:** `.scratch/quarterdeck/design.md`, "Spec Run procedure" steps 1 to 4, "Validation plan" (Planning row). `grill-notes.md` decisions 21, 39, 40.

- **Modules touched:** the mate skills (ticket 10), the Brief reference, possibly the Charter.
- **Implementation anchors:** `spike/FINDINGS.md` link 4 (steering a Second Mate with `fm-send`), FirstMate's rule that a mate never writes to a project (a Crewmate writes the plan).
- **Must not introduce:** grilling in the Quarterdeck as a dependency, a plan-approval hold (decision 22 is later), pause and resume, a plan written by the Second Mate itself.
- **Validation seam:** real Claude, real pomoplan; manual checklist.
- **Coverage:** proves the planning link; precursor of SC-03 and SC-12.

## Blocked by

- 10: Mate skills, Charter and Brief conventions
- 14: The hardened project container on pomoplan runs the full gate for a hand-spawned Crewmate

## Comments

### Steps 1–5 handoff — planning runtime blocked, acceptance unclaimed

Fixed point and starting HEAD: `5649e5c229ab01089044f6f685ee2c9b942613dd`. Read tracker/domain/architecture instructions, relevant ADRs 0006–0010, spec/design, decisions 21/39/40, spike link 4, dependency tickets 10/14, mate procedures/Brief, architecture and test manifest. Planning remains Sonnet; no dispatch configuration changed.

**Sketch/build:** reuse the existing Second Mate → FirstMate commands → launcher → project-container flow and project planning skills (reuse rung 1: no new runtime component). Added the missing SC-planning checklist section with a concrete bounded handoff procedure and separate success, missing-decision and no-publication evidence rows. No new abstraction, external interface, ownership or dependency direction; architecture reconciliation is unnecessary. No runtime behavior or skill text changed, so no new uncovered behavior requiring TDD and no skill-edit writing workflow. Corrections to `qd-first-mate`, `qd-spec-run`, Brief or Charter attributed to a live run: **none**; no live run occurred.

**Dependencies and precise blockers:**

- Ticket 10 is done: managed procedures, Charter, Brief and structural coverage exist. Planning is not missing implementation merely because live proof is absent.
- Ticket 14 remains ready-for-human with all real criteria unchecked. Its creator/launcher/token delivery implementations exist, but private-source installation, real prompt-free Claude, gate, hooks and Herdr observations remain pending manual evidence.
- Ticket 14/11 records an actual stock shallow-home lineage-guard dispatch failure. Prepared-home stub tests fetch full history; that is not a supported production provisioning fix or proof of stock startup. Resolving that prerequisite is separate work, not silently implemented here.
- Ticket 08/ADR 0010 records an actual implementation-contract failure: the CLI persists the extensions token in `/etc/environment`. This session reproduced it with a dummy token. Resolution or explicit acceptance of that specific failure is needed before real-token validation; accepted inspect visibility does not satisfy it.
- Non-secret local checks: `docker ps --format '{{.Names}}'` showed only unrelated containers, no running Quarterdeck; `/home/valeri/work/fleet` does not exist; `git -C ../pomoplan rev-parse --verify refs/remotes/origin/main` failed. No authorized fresh owning-home clone, fetched main or live handoff was supplied. No claim is made that credentials do not exist elsewhere: their values/files were not examined. No fetch or developer-checkout modification occurred.
- Human inputs still needed: an authorized fresh home/clone and main revision, scoped private-skills token and Claude authentication via supported delivery, plus actual grilling decisions for the complete and deliberately undecided cases. Do not invent a product request or secret scope. Existing security concerns remain individually tracked; no new distinct concern was identified. Pending policy reviews alone do not halt otherwise authorized work. Unsupported `runArgs` rejection and retained Features are unchanged.

**Useful next validation:** follow `quarterdeck/CHECKLIST.md`, “Ticket 16 — SC-planning”. Use one handoff per fresh case, including the user's explicit planning-only stop boundary so normal Spec Run continuation does not implement another ticket. Observe the Second Mate writing the Brief and dispatching Sonnet through the container route. Capture the main base before spawn; verify branch ancestry, exactly one commit, committed artifacts/count, matching timestamped status, clean tree and no publication. Separately leave a necessary decision unanswered and require `needs-decision`, no commit and no further dispatch. Record sanitized evidence and only then correct any observed skill errors. No pomoplan gate, `/implement`, credential probe, upstream patch, lineage bypass or speculative hook extension is authorized by this handoff.

**Validation actually run:** `npm run test:quarterdeck` exited 0: **32 tests, 31 pass, 0 ordinary failures, 1 failing TODO** (known dummy extensions-token persistence, security-review 05). Log: `/tmp/qd16-quarterdeck.log` (ephemeral). Structural mate tests and prepared-home stub loop pass; neither proves real planning, real project skills or stock-home dispatch. `git diff --check` passed. Broader coverage intentionally not run: no `npm test`, full suite, `test:skill`, unrelated suite or pomoplan gate.

All six acceptance criteria remain unchecked, including the checklist-run criterion: instructions now exist but SC-planning was **not run**. Ticket remains open, ready-for-human. No reviewers launched and no other implementation ticket begun. Only this ticket and the checklist are committed; the preexisting grill notes, ticket 07, CONTEXT and untracked security concern 01 are preserved outside the commit. Independent review follows below; live validation remains with the human.

### Independent review and final disposition

Implementation/validation-instructions commit: `fb7b2b8`. Three fresh independent agents ran with `pi -p --model openai-codex/gpt-6-astra --thinking low`, reviewing `git diff 5649e5c229ab01089044f6f685ee2c9b942613dd...HEAD`. Each received the Quarterdeck-only test restriction and source references, without an implementation rationale. Reports follow verbatim.

#### Standards

No findings in `git diff 5649e5c229ab01089044f6f685ee2c9b942613dd...HEAD` (commit `fb7b2b8`).

- Ticket comments follow `docs/agents/issue-tracker.md`: “append to the bottom of the file under a `## Comments` heading.”
- The checklist and ticket retain explicit blocked/not-run outcomes and leave all six acceptance criteria unchecked.
- No documented-standard violations or applicable baseline code smells found. No production code or automated tests changed; no test-value findings.

Read the standards, full smell baseline, and relevant design sections directly. No tests rerun; broader coverage intentionally not run. Recorded runtime evidence was not independently reproduced, and live planning acceptance remains open.

**Standards: 0 findings.**

#### Design

No material design violations found in `fb7b2b8` against `5649e5c229ab01089044f6f685ee2c9b942613dd`.

The documentation-only diff preserves Second Mate ownership, FirstMate command reuse, project-skill reuse, and container-routed planning. The planning-only boundary limits validation without introducing a plan-approval hold or changing normal Spec Run continuation.

**Validation remains open:** `design.md` requires a manual check that “One handoff gives a Spec, a design and tickets, all in one commit.” The added ticket hunk explicitly states “SC-planning was **not run**,” and the checklist marks all three scenarios “not run.” These are acknowledged blockers, not evidence of completion; all six acceptance criteria correctly remain unchecked.

No tests run during this review. The recorded test results were not independently reproduced; broader coverage intentionally not run.

**Design: 0 findings; real planning validation remains blocked and unproven.**

#### Spec

No new spec violations found in `fb7b2b8`. The diff adds validation instructions and records blockers; it does not establish completed planning acceptance.

**Open acceptance gap — explicitly acknowledged, not a newly introduced defect:** Ticket 16 requires “After one handoff … exactly one commit on top of `origin/main`” and “The SC-planning row … is run and noted.” The added ticket hunk states: “All six acceptance criteria remain unchecked … SC-planning was **not run**.” Real Sonnet container routing, planning artifacts/status, the missing-decision stop, and any resulting skill corrections therefore remain unverified.

The checklist covers those outcomes without substituting stub evidence. Its planning-only boundary is explicitly a “bounded validation request, not a change to normal Spec Run continuation,” consistent with reviewing this slice independently.

Planning is not scope creep: ticket 16 explicitly says “Planning is in the MVP … this overrides the spec’s ‘planning is out of scope’.”

Recorded runtime/security blockers and missing authorized inputs remain open, as requested. I did not independently reproduce those historical observations or rerun tests; broader coverage was intentionally not run.

**Summary:** 0 new spec findings; ticket 16’s six acceptance criteria remain open.

**Disposition:** no findings to fix or decline. The acknowledged acceptance gap remains blocked, not waived. Ticket stays `ready-for-human`, with every criterion unchecked. Only planning-validation documentation was built; no runtime/skill correction was justified without the real run. Validation: Quarterdeck suite only (31 pass, 1 known failing TODO, exit 0); broader regression coverage intentionally not run. Remaining blockers and human validation instructions are recorded above and in `quarterdeck/CHECKLIST.md`. No other implementation ticket was started.
