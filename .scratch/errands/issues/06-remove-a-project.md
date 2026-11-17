# 06: Remove a Project

**Status:** ready-for-agent
**Model:** Sonnet
**Design slice:** 6 (Removal)

Terms such as Project, Errand, Crewmate, First Mate, Second Mate, Brief, Variant, Template, Preset and Spec Run are defined in `CONTEXT.md`. Spec: `.scratch/errands/spec.md` (scenarios are cited as `SC-NN`). Design: `.scratch/errands/design.md`.

## What to build

A tool that removes what the Quarterdeck created for one Project: its container, its rendered config exports and its config record. It refuses while the Project still has open work. Removing the folder and the FirstMate registry entry is left to the First Mate's skill (ticket 07), after this tool has succeeded and the user has confirmed.

## Acceptance criteria

- [ ] `qd-project-rm <name>` removes the container labelled for that Project and home, the exports under `<work root>/quarterdeck/config/<name>/` and the Project's config record (SC-20).
- [ ] A second Project's container, exports and record are untouched, and the Quarterdeck keeps running (SC-20).
- [ ] The tool refuses, changing nothing, while FirstMate has an open record for that Project.
- [ ] The tool never deletes the Project's folder or its git repository, and never removes a container that does not carry the creator, home and Project labels.
- [ ] An unknown name exits non-zero and changes nothing.
- [ ] `npm run test:errands` passes.

## Technical context

**Design:** `.scratch/errands/design.md`, "Responsibility map" row for `qd-project-rm`.

- **Modules:** `qd-project-rm` owns the Quarterdeck-side leftovers only. The registry entry and the folder belong to the `qd-project` skill.
- **Implementation anchors:** The label filters and the replacement loop in `quarterdeck/bin/qd-project-up`; the labelled cleanup in `quarterdeck/bin/quarterdeck` (`stop`); `ARCHITECTURE.md`'s teardown rule for the acceptance suite.
- **Reuse:** The existing labels; no new way to identify containers.
- **Dependency direction:** Tool -> Docker through the proxy and the work root. If the proxy refuses a call, add the endpoint to `quarterdeck/docker-proxy.conf` with a test and say why.
- **Must not introduce:** Any `prune`, deletion by name pattern, removal of Claude or Codex volumes, a force flag that skips the open-record check.
- **Validation seam:** The tool run in a real Quarterdeck with two Projects from ticket 02.
- **Coverage:** SC-20 (tool half).

## Rules for whoever implements this

- **Tests.** Run only the commands this ticket names. The full acceptance suite (`npm test`, or any glob over all files in `tests/`) is never run by an agent, not while building, not before committing and not in review.
- **No real agent session, no GitHub contact, no secrets.** Use the stub Crewmate fixture, a local bare origin, a stub `gh` and dummy token values. Never read a token file.
- **The FirstMate fork is never edited** (ADR 0008). If something FirstMate is assumed to do proves false, stop at the furthest sound point, leave this ticket open with a comment saying what was seen, and report. Do not patch and do not redesign.
- **Docker.** Act only on containers, volumes and images this work creates and labels. Never any `prune`.

## Blocked by

- 02: Create a Project with no remote

## Comments
