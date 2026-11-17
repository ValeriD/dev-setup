# 03: The launcher picks the container by home and Project

**Status:** ready-for-agent
**Model:** Sonnet
**Design slice:** 3 (Launcher)

Terms such as Project, Errand, Crewmate, First Mate, Second Mate, Brief, Variant, Template, Preset and Spec Run are defined in `CONTEXT.md`. Spec: `.scratch/errands/spec.md` (scenarios are cited as `SC-NN`). Design: `.scratch/errands/design.md`.

## What to build

The `claude` launcher currently expects exactly one running project container per FirstMate home. The First Mate's home will hold many Projects, so a launch must reach the container of the Project it belongs to. After this ticket two Projects in the First Mate's home each receive their own Crewmate launches.

## Acceptance criteria

- [ ] With two Projects created in the First Mate's home and both containers running, a launch from each Project's pool worktree runs inside that Project's container and not the other (asserted through `launch.log` and the recording `docker` shim).
- [ ] The launcher takes the Project from FirstMate's record for the launching id, read from a location that a Project container cannot write. A value planted in the Project-writable `state/` folder or in the worktree does not change which container is chosen.
- [ ] A missing container, or more than one container for the same home and Project, fails with a message; the launcher never falls back to running Claude in the Quarterdeck.
- [ ] A Second Mate's home with one Project behaves as before: the existing launcher and ticket-loop tests pass unchanged, and the publish route is untouched.
- [ ] Two launches into the same container that overlap in time both end with their worktree trusted in that container's Claude config.
- [ ] `npm run test:errands` and `npm run test:quarterdeck` pass.

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
