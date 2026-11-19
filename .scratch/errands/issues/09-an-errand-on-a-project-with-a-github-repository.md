# 09: An Errand on a Project with a GitHub repository

**Status:** done
**Model:** Opus
**Design slice:** 8 (GitHub Projects)

Terms such as Project, Errand, Crewmate, First Mate, Second Mate, Brief, Variant, Template, Preset and Spec Run are defined in `CONTEXT.md`. Spec: `.scratch/errands/spec.md` (scenarios are cited as `SC-NN`). Design: `.scratch/errands/design.md`.

## What to build

An Errand on a Project that lives on GitHub. The First Mate hands it to the Project's Second Mate, which runs it as its own FirstMate record in the Project's existing container, separate from any Spec Run. When it is done, the branch is pushed from the Quarterdeck and a pull request is opened, with its text taken from the Errand's Brief because the branch has no tickets. Nothing is merged by a mate. This ticket uses a local bare origin and a stub `gh`; real GitHub stays a checklist row.

## Acceptance criteria

- [x] `qd-publish` can be told, explicitly, to build the pull request text from the Errand's Brief. Without that, its behaviour for Spec Runs is unchanged and a branch with no tickets still fails before the push.
- [x] With the stub Crewmate, an Errand handed to a Second Mate's home ends with exactly its branch pushed to the local origin and one pull request opened against the default branch through the stub `gh`; nothing is merged (SC-15).
- [x] The Project's container held no GitHub variable and no GitHub credential file at any point of the Errand (SC-15).
- [x] An Errand record and a Spec Run record in the same Project have separate branches and worktrees in the same container, and neither changes the other's (SC-18).
- [x] `qd-errand` states the Second Mate's part (dispatch as a `direct-PR` record, the stop rule, the check, the publish relaunch through the existing private marker) and `qd-first-mate` states the hand-off of an Errand to a Second Mate, with the report relayed to the user.
- [x] `quarterdeck/CHECKLIST.md` has a row for the same run against real GitHub with a real Claude, to be done by the user.
- [x] `npm run test:errands` and `npm run test:quarterdeck` pass.

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

### Resolution (Sonnet agent)

Built in the commit "errands 09: an Errand on a Project with a GitHub repository". `quarterdeck/bin/qd-publish` takes an explicit first argument `--body-from-brief`: the pull request title is `Errand: <slug>` and its body is the Captain's intent of `<home>/data/<slug>/brief.md` (a FirstMate record no Project container mounts), and the branch's tickets are not looked at. Without the flag nothing changed, and a branch with no tickets still fails before the push; a missing Brief or an empty Captain's intent fails before the push too. The push, the hooks-off handling and the publish route are untouched. `qd-errand` gained section 7 (the Second Mate's part: ready the container, the direct-PR Brief, dispatch, the stop rule, the check, the publish relaunch through the existing private `qd-route` marker, the report), `references/brief.md` gained the GitHub Project Brief (including the `- **Publish.** Run ...` line), and `qd-first-mate` gained section 1b (the `Errand:` / `Branch prefix:` / `Project:` handoff to `sm-<project>`, questions through its section 2, the report relayed verbatim). The errands stub Crewmate learned the `Publish.` job and records any GitHub-named variable in its environment. `quarterdeck/CHECKLIST.md` has the real-GitHub row; `ARCHITECTURE.md`'s Publisher row names the new option.

Tests: one new `tests/quarterdeck.test.mjs` test for the flag (no-flag failure, missing and empty Brief, one `gh` call with the right base, head, title and body, only the named branch pushed) and one new `tests/errands.test.mjs` test (SC-15 and SC-18). That test seeds a Second Mate home on a local bare origin, runs a Spec Run record (plan only, the MVP stub) and an Errand record (the Errands stub) in one container, checks they have separate branches and worktrees and that neither moved the other, publishes the Errand through the real marker and launcher route with a stub `gh` in the Quarterdeck, and asserts the origin holds exactly `main` and the Errand branch, one `pr create` call against `main`, no merge, and (before the report, after it and after the PR) no GitHub-named variable and no credential file or helper in the container. `npm run test:errands` 11/11 and `npm run test:quarterdeck` 47/47 pass; cleanup clean.

Not checked: real GitHub with a real Claude (the checklist row, for the user), so the real `gh` output format and the real Crewmate's reading of the publish bullet are unproven. `test:skill`, pins and Renovate tests were not run (nothing they cover changed). A revision after the pull request opened is a new Errand (stated in the skill); no follow-up machinery was added for GitHub Projects.

Review: reviewer agents not spawned; careful self-review against the design, the spec and ADR 0007. Findings: (1) the flag must be explicit and first, with no guessing: kept, and tested both ways. (2) The Brief path is built from the validated slug and a home path, and is not Crewmate-writable: no change needed. (3) The skill's wording of the publish bullet is matched by the stub's parser, so the test would catch a drift in the convention's shape only through the structural test: accepted.
