---
type: technical-design
feature: errands
status: approved
base-commit: fa65e1a
touches:
  - quarterdeck
  - variants
  - templates
  - test-suite
  - architecture-docs
changes-architecture: true
spec: .scratch/errands/spec.md
---

## Design capsule

- **FirstMate already has the whole Errand lifecycle; we configure it, we do not build it.** A Project with no remote is a FirstMate `local-only` project in the First Mate's own home. FirstMate's own commands create it, dispatch a Crewmate on a branch, hold the result for the captain's approval, and land it with `fm-merge-local.sh` (a guarded fast-forward). ADR 0008 holds: no edit to the fork.
- **New mate skills carry the procedure.** `qd-project` (create and remove a Project) and `qd-errand` (short grilling, Brief, dispatch, report, accept, send back, what is waiting). They sit beside `qd-first-mate` and `qd-spec-run` under `quarterdeck/skills/` and only call FirstMate commands and Quarterdeck tools.
- **One new Quarterdeck tool, `qd-project-new`,** creates the Project's git repository with its first commit: the Variant's Template rendered into `.devcontainer/`, plus copied Presets. It also records the Project's container configuration outside the Project (see next bullet). `qd-project-rm` removes a Project's container, exports and record.
- **Two existing tools change.** `qd-project-up` learns to take a Project's configuration from a Quarterdeck-owned record when the Project has no remote, because a Crewmate can write the local `main` ref. The `claude` launcher learns to pick the container by home *and* Project, because the First Mate's home now holds many Projects.
- **A Markdown Variant, built locally, not published.** `variants/markdown/` and `templates/markdown/` follow the Node Variant's shape. The host `quarterdeck` command builds it and records it as an allowed local image. Publishing a second Variant through CI is deliberately left out.
- **A Project on GitHub goes through its Second Mate** (the last slice). The Errand is one more FirstMate record in the Second Mate's home, in the Project's existing container. `qd-publish` gains a way to build the pull request text from the Errand's Brief when the branch has no tickets.
- **The per-Project check is a file in the Project** that the Brief tells the Crewmate to follow. The Crewmate's final line says `check: passed`, `check: failed` or `check: none`.
- **Testing** mirrors the MVP: a token-free test file with the existing stub Crewmate drives real FirstMate commands, and a manual checklist covers what needs a real Claude. A new `npm run test:errands` keeps it out of other runs. The full suite is never run.
- **Deliberately not built:** agent review, automatic retry, `qd-open`, OMP or Pi, any wrapper around FirstMate's lifecycle, a second published Variant, outside-system tools, a planner.

## Existing shape

Read `ARCHITECTURE.md` (Quarterdeck section), `docs/architecture/quarterdeck.md` and `quarterdeck/PROJECT-CONTAINERS.md` for the current mechanisms. What this design builds on:

- **`quarterdeck/bin/qd-project-up <home> <project>`** expects the clone at `<home>/projects/<project>`. It fetches `origin main`, reads `.devcontainer/` from `refs/remotes/origin/main`, accepts only a digest-pinned published Variant image (or the test seam `QD_PROJECT_TEST_IMAGE`), renders a Quarterdeck-owned config, and creates the container through the devcontainer CLI. It mounts the pool, the clone's git store (hooks and config read-only), `<home>/bin` read-only and `<home>/state`. Containers are labelled with creator, Project and home.
- **`quarterdeck/bin/claude`** (the launcher) routes a launch from a pool worktree into the one running container labelled with the launching home. It reads the home from `FM_TASK_INBOX`. It assumes one container per home, which is true for a Second Mate's home and false for the First Mate's.
- **`quarterdeck/skills/qd-first-mate`** registers a GitHub Project as `direct-PR` in the First Mate's home and provisions its Second Mate at `<work root>/fleet/sm-<project>`. It forbids the First Mate from starting a project Crewmate.
- **`quarterdeck/bin/qd-publish`** pushes one named branch from the clone's git store with hooks off and opens the pull request. It builds the body from ticket files on the branch and fails if there are none.
- **`quarterdeck/bin/quarterdeck`** (host) builds the Quarterdeck image, starts the proxy and the container, and mounts the work root at the same path.
- **`variants/node/` and `templates/node/`** are the only Variant and Template. CI (`.github/workflows/ci.yml`) is written for that one Variant.
- **`tests/quarterdeck.test.mjs`** with `tests/fixtures/quarterdeck-crewmate/` runs real FirstMate and Herdr commands against a stub Crewmate and a local origin.
- **FirstMate at `427056c` (read, not run for this design):**
  - Its `project-management` skill creates a `local-only` project as a local git repository under `projects/<name>` with a registry entry and no GitHub call. Spawn refuses a repository with no commit.
  - `local-only` work stays in the main home; a Second Mate refuses it (`fm-home-seed.sh`).
  - A `local-only` Crewmate stops with a clean, ready branch. With yolo off, the captain approves every landing. `bin/fm-merge-local.sh <id>` then fast-forwards the default branch to the recorded head, and refuses a missing head, a moved branch or a diverged default branch.
  - `config/spawn-base-primary-checkout` makes a fresh `local-only` worktree start from the primary checkout's default branch.
  - `bin/fm-control.sh relaunch --note` starts a fresh session in the same worktree (proven in the MVP spike).

Dependencies on unfinished MVP tickets: 22 (FirstMate with full history; nothing can be dispatched without it), 09 (launcher) and 07 (creator) as they stand on the branch.

## Proposed shape

### Responsibility map

| Module | Owns | Does not own | Interface |
|---|---|---|---|
| `qd-project` skill (new, First Mate) | Asking for and confirming a Project's name, Variant and Presets; calling `qd-project-new`; registering the Project in FirstMate as `local-only`, yolo off; starting its container; removal | Writing any Project file itself; GitHub Projects' registration (stays in `qd-first-mate`) | The user's request in chat |
| `qd-project-new` (new tool) | Creating `<First Mate home>/projects/<name>` as a git repository; rendering the Variant's Template and copying the Presets into `.devcontainer/`; the first commit; writing the Project's config record | FirstMate's registry; starting containers | `qd-project-new <name> <variant> [preset…]`; fails if the name exists (SC-03) |
| Project config record (new, data) | For a Project with no remote: the git tree of `.devcontainer/` that its container may be built from. Kept under `<work root>/quarterdeck/`, which no Project container mounts | Projects that have a remote (their `origin/main` stays the source) | Written by `qd-project-new`; replaced only by an explicit user-requested update through `qd-project` |
| `qd-project-up` (changed) | As today, plus: with no `origin` remote, take the config from the recorded tree and skip the fetch; accept an image listed in the local Variant record | Deciding trust; it only follows the record | Unchanged command line |
| Local Variant record (new, data) | Which locally built Variant images `qd-project-up` may use, by image id | Published images (unchanged rule) | Written by the host `quarterdeck` command when it builds a Variant |
| `quarterdeck` host command (changed) | Building `variants/markdown` locally and recording it | Publishing | A build subcommand; documented in its header and the README |
| `claude` launcher (changed) | Choosing the container by home and Project | Any new route | Unchanged for callers. The Project comes from FirstMate's record for the launching id, read from a place a Project container cannot write |
| `qd-errand` skill (new, First Mate, and used by a Second Mate for GitHub Projects) | The short grilling; writing the Brief from a reference; dispatch; reading the done line; relaying the report; accept; send back; answering "what is waiting" from FirstMate's own state | Planning, tickets, retry, review | The user's request in chat; FirstMate commands underneath |
| `variants/markdown`, `templates/markdown` (new) | Base plus Markdown tooling, same image metadata and hardening as the Node Variant | A development toolchain | Same shape as `variants/node` and `templates/node` |
| `qd-publish` (changed, last slice) | Pull request text from the Errand's Brief when the branch carries no tickets | Any change to how it pushes | One added, explicit way to name the body source |
| `qd-project-rm` (new tool) | Removing the labelled container, the config exports and the record for one Project; refusing while that Project has open FirstMate records | The registry entry and the folder (the skill does those, after the tool succeeds and the user confirms) | `qd-project-rm <name>` |

Dependency direction is unchanged: skills call FirstMate commands and Quarterdeck tools; tools call git, the devcontainer CLI and Docker through the proxy. Nothing under `base/`, `installer/` or `variants/node/` depends on the new parts.

### Flow: an Errand on a Project with no remote

1. **Hand-off.** The First Mate, following `qd-errand`, asks its questions, then writes a FirstMate Brief for a `local-only` ship in that Project. The Brief carries the user's answers verbatim, the one job, the stop rule ("an undecided point ends the session with a `needs-decision` line and no guess", as in the MVP), and the instruction to follow the Project's check file if `main` has one.
2. **Dispatch.** `fm-spawn.sh` gives the record its own branch and pool worktree, based on the Project's `main`. The launcher routes the Crewmate into the Project's container. The First Mate makes sure the container is up with `qd-project-up` first.
3. **Done.** The Crewmate commits, leaves the worktree clean and reports. FirstMate records the ready head and holds the record for the captain. The First Mate relays a short report: Project, branch, files changed, check result.
4. **Accept.** On the user's word, the First Mate releases the hold and runs `fm-merge-local.sh`. A refusal (uncommitted changes in the way, or a `main` that moved) is relayed as it is; nothing is forced (SC-13).
5. **Send back, or answer a question.** `fm-control.sh relaunch --note` with the user's comment or answer starts a fresh session in the same worktree. A `main` that moved since dispatch is handled the same way: the note asks for a rebase, and a new report follows.

### Flow: an Errand on a Project with a GitHub repository (last slice)

The First Mate hands the Errand to the Project's Second Mate, as it hands a Spec Run today. The Second Mate uses `qd-errand` to run it as its own FirstMate record, separate from any Spec Run record, in the Project's existing container. Publication reuses the MVP's marker route and `qd-publish`. The First Mate merges nothing.

### Where things are

- A Project with no remote lives at `<work root>/fleet/firstmate/projects/<name>`. That is the user's main folder for it. A link at `<work root>/projects/<name>` points there for convenience.
- The per-Project check is `.quarterdeck/errand-check.md` on the Project's `main`. Its text is instructions for the Crewmate: a command to run, or rules to hold the result against.
- The main folder's files are not mounted into the Project's container. Only the git store and the pool are, as in the MVP. This is what keeps the user's own files untouched while Errands run (SC-06).

## Reuse decisions

| Capability | Supplied by | Why |
|---|---|---|
| Creating and registering a local Project | FirstMate's `project-management` procedure, plus `qd-project-new` for the files | FirstMate owns the registry; a mate must not write Project files, and a deterministic first commit is better made by a tool than by an agent |
| Branch, worktree, session, supervision | FirstMate `fm-brief.sh`, `fm-spawn.sh`, the pool, Herdr | Already proven in the MVP |
| Holding a result for the user, and the merge | FirstMate's captain hold and `fm-merge-local.sh` | It is the fork's own sanctioned merge path, with the checks SC-13 needs |
| Send back, and continuing after an answer | `fm-control.sh relaunch --note` | Proven in the spike; same mechanism as a ticket retry |
| Question stop | The MVP's `needs-decision` convention in the Brief | One convention for Spec Runs and Errands |
| "What is waiting for me" | FirstMate's own state and backlog commands, read by the skill | No list of our own to keep in step |
| Container creation | `qd-project-up`, with two added inputs | The renderer, mount set and labels stay one implementation |
| Template rendering and Preset copying | The existing Template files and `presets/` (copied, ADR 0005) | Same content a host onboarding produces |
| Markdown tooling in the image | Packages from the base image's own package manager, pinned as the Node Variant pins its tools | No new mechanism |
| Pull request for a GitHub Errand | `qd-publish` and the publish route | One place holds the GitHub token |
| Tests | `tests/quarterdeck.test.mjs`'s helpers and the stub Crewmate fixture, in a new `tests/errands.test.mjs` | Same real collaborators, separate run |

No new dependency is added.

## Constraints

- **No edit to the FirstMate fork** (ADR 0008). If `local-only` dispatch does not work from the Quarterdeck as read, stop and report; do not patch.
- **A mate writes no Project file.** Project files come from `qd-project-new`, from Crewmates, or from `fm-merge-local.sh`.
- **yolo stays off** for every Project. Every landing needs the user's word.
- **A local Project's container is built only from its recorded config tree,** never from whatever `main` holds at the time. The Project's git store is writable from its container, so its `main` ref is not a trusted source. The record lives where no Project container can write.
- **The launcher takes the Project from FirstMate's record, not from a path or file a Project container can write.** A missing or ambiguous container still fails; it never falls back to launching in the Quarterdeck.
- **The published-image rule is not loosened in general.** A local image is accepted only when its id is in the local Variant record. `QD_PROJECT_TEST_IMAGE` stays a test seam.
- **`.github/workflows/ci.yml` is not changed to publish the Markdown Variant.** No second Variant goes through release in this feature.
- **The Markdown Variant keeps the Node Variant's image metadata**: root entrypoint for egress, dropped capabilities, the managed Claude policy, the same Egress Allowlist source.
- **Project containers get no GitHub credential** (ADR 0007). The test Project names no private skill, so it needs no extensions token.
- **Never the full suite.** `npm run test:errands`, `npm run test:quarterdeck`, and the pin tests when a pin is touched.
- **Not introduced:** a wrapper around FirstMate's lifecycle, a store of Errands of our own, a general "project type" abstraction, a plugin point for checks, retry logic, any review step.

### Risks accepted in this design

- **Signal files are shared across the First Mate's Projects.** Every local Project's container mounts the First Mate home's `state/`, so a Crewmate in one Project could forge a "done" for another. This widens the MVP's known limit (D34), where a Crewmate could forge its own Project's signal. The landing still needs the user's approval and `fm-merge-local.sh`'s pinned head.
- **A Crewmate can move any ref in its own Project's git store,** `main` included. The config record keeps that from changing the container. It does not stop unaccepted commits appearing on `main`; the user's checked-out files do not change, and `git status` would show it.
- **`fm-merge-local.sh` is fast-forward only.** If the user commits on `main` while an Errand runs, accept is refused and the Errand needs a rebase through a send-back.

## Validation plan

Token-free tests run real FirstMate, Herdr, the launcher, `qd-project-up` and the devcontainer CLI through the proxy, with the stub Crewmate. Manual rows go in `quarterdeck/CHECKLIST.md`.

| Scenario | Seam and level | Notes |
|---|---|---|
| SC-01, SC-02, SC-03 | Integration: `qd-project-new` then `qd-project-up` in a real Quarterdeck with the locally built Markdown Variant | Asserts the repository, first commit, record, running container, egress ready, no Second Mate home, no remote; a second create with the same name changes nothing |
| SC-05, SC-06 | Integration: one stub Errand dispatched through FirstMate | Process is inside the Project container; the main folder's files and branch are byte-identical before and after |
| SC-08, SC-09 | Integration: stub writes `needs-decision`; stub is killed mid-run | No landing, branch unchanged, then a relaunch continues on the same branch |
| SC-10, SC-11 | Integration: Project with and without the check file | The done line carries `check: passed`, `failed` or `none`; a failed check is not offered for accept |
| SC-12, SC-13, SC-14 | Integration: `fm-merge-local.sh` after approval; with a conflicting uncommitted file; relaunch with a note | Real FirstMate guards, not re-implemented checks |
| SC-16, SC-18 | Integration: two records in one Project container at once, and one beside a Spec Run record | Also covers the launcher's Project selection and the trust-file write when two launches overlap |
| SC-15 | Integration with the local bare origin and stub `gh`, as the MVP publish test | Real GitHub stays a checklist row |
| SC-20 | Integration: `qd-project-rm` | Only that Project's labelled container, exports and record go; another Project's are untouched |
| Launcher and creator rules | Focused cases in the same file | Config comes from the record even after the stub moves `main`; an unlisted local image is refused; a published-image Project behaves as before |
| Markdown Variant hardening | A small targeted test of the built image | Egress fails closed, the managed policy is in place, capabilities are dropped. Not the Node acceptance files |
| SC-04, SC-07, SC-17, SC-19 | Manual checklist with a real Claude | Skill behaviour: questions asked first, nothing asked afterwards, the report, the attention mark, the waiting list. Skill text is corrected from what the run shows, as in MVP ticket 16 |

Mechanical checks worth keeping: `scripts/check-pins.mjs` and Renovate cover the Markdown Variant's pins the same way as the Node Variant's.

**Revisit the design if:**

- FirstMate's `local-only` dispatch needs something the Quarterdeck cannot give it without a fork edit.
- FirstMate's record for an id does not name the Project anywhere outside the Project-writable `state/` folder. The launcher then needs another trusted source.
- The First Mate's context grows too large when it supervises many Errands itself. The answer then is a helper mate, which FirstMate does not offer for local projects today.

## Suggested build order

1. Markdown Variant and Template, built and recorded locally; the creator accepts a recorded local image.
2. `qd-project-new`, the config record, and the creator's no-remote path. Creates a Project and its container (SC-01 to SC-03).
3. The launcher picks the container by home and Project.
4. Token-free Errand loop with the stub: dispatch, done, check line, accept, refusal, send back, stop, two at once.
5. `qd-project` and `qd-errand` skills and the Brief reference.
6. `qd-project-rm`.
7. Manual run on the test Project with a real Claude; skill corrections.
8. Errands on a GitHub Project through the Second Mate, with the `qd-publish` change.

Slices 1 to 7 give the test environment the user asked for. Slice 8 can follow after that has been tried.

## Decision 2026-11-19: revised work is a follow-up Errand

FirstMate latches the first observed `done` head of a local-only task as `local_done_head` (`bin/fm-dod-lib.sh`: "Observing done again never changes that identity. Revised work needs a new task/approval record"), and `bin/fm-merge-local.sh` fast-forwards only to that exact head ("A diverged branch needs a rebase and a new task/approval record under bin/fm-dod-lib.sh's head-latching contract before landing"). Ticket 05 confirmed it: after a send-back that adds a commit, or a rebase, the merge refuses with "differs from the recorded local done head". The FirstMate fork is not edited (ADR 0008), so the design follows the contract instead of working around it.

Decision: revised work after the first `done` never re-lands the old task.

- A send-back that adds commits after `done`, or a rebase onto a `main` that moved, becomes a **follow-up Errand**: a NEW task id (`fm-brief.sh` and `fm-spawn.sh` as usual), branch `fm/<new-id>` from today's `main`. Its Brief names the old branch; its Crewmate brings that branch's commits over (merge or cherry-pick), adds the revision, and reports `done`. It lands through `fm-merge-local.sh` like any Errand, on the user's word.
- The old Errand is closed without landing. Its branch stays as a record and is never merged.
- A send-back BEFORE the first `done` stays a relaunch of the same task (SC-14 as written; SC-08 and SC-09 are unchanged).
- `main` moves once, by the follow-up's fast-forward.

Consequences: the First Mate skill (`qd-errand`) must decide, from whether the old task has an observed `done`, between `fm-control.sh relaunch --note` and a follow-up Errand, and must close the old task without calling its merge.

Addendum (ticket 07): "closed without landing" is FirstMate's `bin/fm-teardown.sh <old-id> --force`, its only close for unlanded work. It needs the user's explicit discard word, and it deletes `fm/<old-id>` (best-effort `branch -D`). So the old branch survives only until the old task is closed. `qd-errand` keeps the old task open until the follow-up has landed, because its branch is the follow-up's source. It closes the old task on the follow-up's accept, after telling the user that this deletes the branch. The landed follow-up closes with a plain `fm-teardown.sh <new-id>`. The ticket 05 test asserts both closes. Nothing in the spec relies on the old branch being kept.
