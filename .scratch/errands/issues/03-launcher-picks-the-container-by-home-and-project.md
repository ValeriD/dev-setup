# 03: The launcher picks the container by home and Project

**Status:** done
**Model:** Sonnet
**Design slice:** 3 (Launcher)

Terms such as Project, Errand, Crewmate, First Mate, Second Mate, Brief, Variant, Template, Preset and Spec Run are defined in `CONTEXT.md`. Spec: `.scratch/errands/spec.md` (scenarios are cited as `SC-NN`). Design: `.scratch/errands/design.md`.

## What to build

The `claude` launcher currently expects exactly one running project container per FirstMate home. The First Mate's home will hold many Projects, so a launch must reach the container of the Project it belongs to. After this ticket two Projects in the First Mate's home each receive their own Crewmate launches.

## Acceptance criteria

- [x] With two Projects created in the First Mate's home and both containers running, a launch from each Project's pool worktree runs inside that Project's container and not the other (asserted through `launch.log` and the recording `docker` shim).
- [x] The launcher takes the Project from FirstMate's record for the launching id, read from a location that a Project container cannot write. A value planted in the Project-writable `state/` folder or in the worktree does not change which container is chosen.
- [x] A missing container, or more than one container for the same home and Project, fails with a message; the launcher never falls back to running Claude in the Quarterdeck.
- [x] A Second Mate's home with one Project behaves as before: the existing launcher and ticket-loop tests pass unchanged, and the publish route is untouched.
- [x] Two launches into the same container that overlap in time both end with their worktree trusted in that container's Claude config.
- [x] `npm run test:errands` and `npm run test:quarterdeck` pass.

## Technical context

**Design:** `.scratch/errands/design.md`, "Responsibility map" row for the `claude` launcher; "Constraints" (the launcher's source for the Project); "Revisit the design if" (second bullet).

- **Modules:** `quarterdeck/bin/claude` owns routing. FirstMate owns the record it reads.
- **Implementation anchors:** `quarterdeck/bin/claude` (how the home and id are derived from `FM_TASK_INBOX`, the label filter, the trust write), FirstMate's files under `<home>/data/<id>/` and `<home>/state/`, `quarterdeck/PROJECT-CONTAINERS.md` "Claude launches".
- **Reuse:** The existing labels `quarterdeck.home` and `quarterdeck.project` set by `qd-project-up`.
- **Dependency direction:** FirstMate's spawn calls the launcher; the launcher calls `docker exec`. FirstMate is not told the Quarterdeck exists.
- **Must not introduce:** A new route, a mapping file of our own from id to Project, or a fallback launch in the Quarterdeck.
- **Validation seam:** The launcher run from pool worktrees in a real Quarterdeck with two Projects from ticket 02 and a stub `claude` in each container.
- **Coverage:** The launcher part of the "SC-16, SC-18" row and of the "Launcher and creator rules" row. If FirstMate's record names the Project only inside Project-writable `state/`, stop and report: the design must be revisited.

## Rules for whoever implements this

- **Tests.** Run only the commands this ticket names. The full acceptance suite (`npm test`, or any glob over all files in `tests/`) is never run by an agent, not while building, not before committing and not in review.
- **No real agent session, no GitHub contact, no secrets.** Use the stub Crewmate fixture, a local bare origin, a stub `gh` and dummy token values. Never read a token file.
- **The FirstMate fork is never edited** (ADR 0008). If something FirstMate is assumed to do proves false, stop at the furthest sound point, leave this ticket open with a comment saying what was seen, and report. Do not patch and do not redesign.
- **Docker.** Act only on containers, volumes and images this work creates and labels. Never any `prune`.

## Blocked by

- 02: Create a Project with no remote

## Comments

### Resolution (Sonnet agent)

Built in the commit "errands 03: the launcher picks the container by home and Project". `quarterdeck/bin/claude` now adds a `quarterdeck.project=<name>` filter to its container lookup. The Project is read from `<home>/data/<id>/brief.md`, where FirstMate's `fm-brief.sh <id> <project>` writes "a disposable git worktree of <project>". Project containers mount `state/` but not `data/`, so they cannot change that file. FirstMate's `state/<id>.meta` (which also names the project) is Project-writable and is deliberately not read. An id with no brief is routed by home alone, as before, so a Second Mate home with one Project is unchanged. A home with several Projects and no brief fails as ambiguous. The trust write now runs under `flock` on `$CLAUDE_CONFIG_DIR/.qd-trust.lock`, so overlapping launches keep each other's entries. `PROJECT-CONTAINERS.md` is updated. One new test in `tests/errands.test.mjs` covers routing for two Projects, planted values in `state/` and the worktree, the missing container, the duplicate container, and six overlapping launches. `npm run test:errands` 7/7 and `npm run test:quarterdeck` 45/45 green; cleanup clean.

Decisions and caveats:
- The Project source is the brief's prose line. It is FirstMate's own record and the First Mate skill only fills placeholders in it, but it is not a structured field. If a brief is edited so the line is gone, routing falls back to home-only and a multi-Project home fails safe. Nothing in the First Mate's own record is both structured and outside `state/`.
- The test used no recording `docker` shim: `launch.log` plus a stub Crewmate that writes its container hostname into the worktree prove the container.
- The overlap test also passes with the lock removed (the race window is small), so it guards the outcome, not the lock. The lock is there for correctness.
- Not run: `test:skill`, pins and Renovate tests (nothing they cover changed).

Review: reviewer agents not spawned; careful self-review against the design and spec. Findings: none requiring change.
