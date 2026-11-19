# 10: The architecture index and docs describe Errands

**Status:** done
**Model:** Sonnet
**Design slice:** Documentation

Terms such as Project, Errand, Crewmate, First Mate, Second Mate, Brief, Variant, Template, Preset and Spec Run are defined in `CONTEXT.md`. Spec: `.scratch/errands/spec.md` (scenarios are cited as `SC-NN`). Design: `.scratch/errands/design.md`.

## What to build

The current-state documents say what now exists: Projects with no remote, the two new tools, the two new skills, the Markdown Variant and how it is built, the changed launcher and creator rules, and the risks this design accepted. A reader of `ARCHITECTURE.md` can find each new part and its code.

## Acceptance criteria

- [x] `ARCHITECTURE.md`'s Quarterdeck table has current rows for `qd-project-new`, `qd-project-rm`, the two skills and the Markdown Variant, and its launcher and creator rows are rewritten, not appended to. The index stays an index.
- [x] `docs/architecture/quarterdeck.md` describes the Errand flow for a Project with no remote and for a Project on GitHub, and says what is proven by tests and what only by the manual checklist.
- [x] `quarterdeck/PROJECT-CONTAINERS.md` describes the config record, the local Variant record and the launcher's Project selection, each stated once.
- [x] The three risks in the design's "Risks accepted in this design" are recorded in an ADR or beside the existing accepted risks, each with what limits it.
- [x] `README.md` tells the user how to build the Markdown Variant and where the checklist for trying Errands is.
- [x] The design's frontmatter `status` is set to `implemented` only if every other ticket in `.scratch/errands/issues/` is done; otherwise it is left and a comment here says which tickets remain.

## Technical context

**Design:** `.scratch/errands/design.md`, the whole document; `docs/agents/architecture.md` for how the index is kept.

- **Modules:** Documentation only. No product behaviour changes.
- **Implementation anchors:** `ARCHITECTURE.md` (Quarterdeck section), MVP ticket `.scratch/quarterdeck/issues/19-architecture-index-gets-the-quarterdeck.md` (the same job for the MVP), `docs/adr/0009-accept-worktree-git-redirection-for-the-mvp.md` (the form of an accepted-risk ADR). Call the `writing-for-agents` skill before editing `ARCHITECTURE.md` or `docs/architecture/`.
- **Reuse:** The existing index rows and ADR format.
- **Dependency direction:** Documents describe implemented state only; nothing proposed is written into `ARCHITECTURE.md`.
- **Must not introduce:** A second version of a fact beside the old one, or claims of isolation the tests do not prove.
- **Validation seam:** Reading the documents against the code on the branch. No test command is needed unless a tested document row changes; then `npm run test:quarterdeck`.
- **Coverage:** No scenario. It closes the feature's documentation.

## Rules for whoever implements this

- **Tests.** Run only the commands this ticket names. The full acceptance suite (`npm test`, or any glob over all files in `tests/`) is never run by an agent, not while building, not before committing and not in review.
- **No real agent session, no GitHub contact, no secrets.** Use the stub Crewmate fixture, a local bare origin, a stub `gh` and dummy token values. Never read a token file.
- **The FirstMate fork is never edited** (ADR 0008). If something FirstMate is assumed to do proves false, stop at the furthest sound point, leave this ticket open with a comment saying what was seen, and report. Do not patch and do not redesign.
- **Docker.** Act only on containers, volumes and images this work creates and labels. Never any `prune`.

## Blocked by

- 08: Try Errands on the test Project with a real Claude
- 09: An Errand on a Project with a GitHub repository

## Comments

Blocker 08 was dropped on 2026-11-19 (`wontfix`, a manual run the user does during normal work), so it no longer blocks this ticket.

### Resolution (Sonnet agent)

Built in the commit "errands 10: the docs describe Errands". Earlier tickets had already added the Quarterdeck table rows for `qd-project-new`, `qd-project-rm`, the two skills, the Markdown Variant and the Publisher. This ticket rewrote the launcher row (home and Project selection) in place and linked the new ADR. `docs/architecture/quarterdeck.md` gained an "Errands" section (no-remote flow with no captain hold and the user's word gating the merge; follow-up Errand for revised work; GitHub flow) and an evidence paragraph stating what `test:errands` proves and what only the manual checklist covers; the "only the owning Second Mate dispatches" sentence and the dependency flow were corrected. `quarterdeck/PROJECT-CONTAINERS.md` gained the local Variant record paragraph; the config record and launcher selection were already stated there once and were left alone. New `docs/adr/0011-accept-shared-state-and-ref-risks-for-errands.md` records the three design risks, each with its limit, plus the two work-root trust limits. `README.md` points to the checklist and tells the user to rebuild the Markdown Variant.

Design `status` set to `implemented` and the spec closed: every other ticket is done, and 08 is wontfix.

Not checked: no test run (documentation only; no tested row changed). The documents were read against ticket resolution comments and the code anchors, not re-run. The checklist rows remain "not run" (ticket 08 dropped).

Review: reviewer agents not spawned; careful self-review against the design and spec. Finding: one claim (the check file path) was verified in `references/brief.md`; no change needed.
