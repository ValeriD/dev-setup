# 09: An Errand on a Project with a GitHub repository

**Status:** ready-for-agent
**Model:** Opus
**Design slice:** 8 (GitHub Projects)

Terms such as Project, Errand, Crewmate, First Mate, Second Mate, Brief, Variant, Template, Preset and Spec Run are defined in `CONTEXT.md`. Spec: `.scratch/errands/spec.md` (scenarios are cited as `SC-NN`). Design: `.scratch/errands/design.md`.

## What to build

An Errand on a Project that lives on GitHub. The First Mate hands it to the Project's Second Mate, which runs it as its own FirstMate record in the Project's existing container, separate from any Spec Run. When it is done, the branch is pushed from the Quarterdeck and a pull request is opened, with its text taken from the Errand's Brief because the branch has no tickets. Nothing is merged by a mate. This ticket uses a local bare origin and a stub `gh`; real GitHub stays a checklist row.

## Acceptance criteria

- [ ] `qd-publish` can be told, explicitly, to build the pull request text from the Errand's Brief. Without that, its behaviour for Spec Runs is unchanged and a branch with no tickets still fails before the push.
- [ ] With the stub Crewmate, an Errand handed to a Second Mate's home ends with exactly its branch pushed to the local origin and one pull request opened against the default branch through the stub `gh`; nothing is merged (SC-15).
- [ ] The Project's container held no GitHub variable and no GitHub credential file at any point of the Errand (SC-15).
- [ ] An Errand record and a Spec Run record in the same Project have separate branches and worktrees in the same container, and neither changes the other's (SC-18).
- [ ] `qd-errand` states the Second Mate's part (dispatch as a `direct-PR` record, the stop rule, the check, the publish relaunch through the existing private marker) and `qd-first-mate` states the hand-off of an Errand to a Second Mate, with the report relayed to the user.
- [ ] `quarterdeck/CHECKLIST.md` has a row for the same run against real GitHub with a real Claude, to be done by the user.
- [ ] `npm run test:errands` and `npm run test:quarterdeck` pass.

## Technical context

**Design:** `.scratch/errands/design.md`, "Flow: an Errand on a Project with a GitHub repository"; "Responsibility map" row for `qd-publish`; Validation plan row for SC-15.

- **Modules:** `qd-publish` owns the push and the pull request; it gains one explicit way to name the body source. `qd-errand` and `qd-first-mate` own the wording. The launcher's publish route is used as it is.
- **Implementation anchors:** `quarterdeck/bin/qd-publish` (where the body is built from ticket titles), the publish tests in `tests/quarterdeck.test.mjs` (`qd-publish pushes exactly the named branch…`), `quarterdeck/skills/qd-spec-run/SKILL.md` (the publish relaunch and marker), ADR 0007.
- **Reuse:** The MVP's publish route, marker and `qd-publish`; the local bare origin and stub `gh` fixtures.
- **Dependency direction:** First Mate -> Second Mate -> FirstMate commands -> launcher; publish session -> `qd-publish` -> git and `gh`.
- **Must not introduce:** A second publisher, any GitHub credential in a Project container, a merge by a mate, a guess at the body source when the caller did not name one.
- **Validation seam:** The stub Errand through a Second Mate's home in a real Quarterdeck, with the local origin and stub `gh`.
- **Coverage:** SC-15 and SC-18. Real GitHub and real Claude are a checklist row.

## Rules for whoever implements this

- **Tests.** Run only the commands this ticket names. The full acceptance suite (`npm test`, or any glob over all files in `tests/`) is never run by an agent, not while building, not before committing and not in review.
- **No real agent session, no GitHub contact, no secrets.** Use the stub Crewmate fixture, a local bare origin, a stub `gh` and dummy token values. Never read a token file.
- **The FirstMate fork is never edited** (ADR 0008). If something FirstMate is assumed to do proves false, stop at the furthest sound point, leave this ticket open with a comment saying what was seen, and report. Do not patch and do not redesign.
- **Docker.** Act only on containers, volumes and images this work creates and labels. Never any `prune`.

## Blocked by

- 07: The `qd-project` and `qd-errand` skills
- `.scratch/quarterdeck/issues/22-firstmate-ships-with-its-full-history.md`
- `.scratch/quarterdeck/issues/12-publish-relaunch-routed-into-the-quarterdeck.md` (the publish route this reuses)

## Comments
