# 10: The architecture index and docs describe Errands

**Status:** ready-for-agent
**Model:** Sonnet
**Design slice:** Documentation

Terms such as Project, Errand, Crewmate, First Mate, Second Mate, Brief, Variant, Template, Preset and Spec Run are defined in `CONTEXT.md`. Spec: `.scratch/errands/spec.md` (scenarios are cited as `SC-NN`). Design: `.scratch/errands/design.md`.

## What to build

The current-state documents say what now exists: Projects with no remote, the two new tools, the two new skills, the Markdown Variant and how it is built, the changed launcher and creator rules, and the risks this design accepted. A reader of `ARCHITECTURE.md` can find each new part and its code.

## Acceptance criteria

- [ ] `ARCHITECTURE.md`'s Quarterdeck table has current rows for `qd-project-new`, `qd-project-rm`, the two skills and the Markdown Variant, and its launcher and creator rows are rewritten, not appended to. The index stays an index.
- [ ] `docs/architecture/quarterdeck.md` describes the Errand flow for a Project with no remote and for a Project on GitHub, and says what is proven by tests and what only by the manual checklist.
- [ ] `quarterdeck/PROJECT-CONTAINERS.md` describes the config record, the local Variant record and the launcher's Project selection, each stated once.
- [ ] The three risks in the design's "Risks accepted in this design" are recorded in an ADR or beside the existing accepted risks, each with what limits it.
- [ ] `README.md` tells the user how to build the Markdown Variant and where the checklist for trying Errands is.
- [ ] The design's frontmatter `status` is set to `implemented` only if every other ticket in `.scratch/errands/issues/` is done; otherwise it is left and a comment here says which tickets remain.

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
