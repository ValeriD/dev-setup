# 06: Remove a Project

**Status:** done
**Model:** Sonnet
**Design slice:** 6 (Removal)

Terms such as Project, Errand, Crewmate, First Mate, Second Mate, Brief, Variant, Template, Preset and Spec Run are defined in `CONTEXT.md`. Spec: `.scratch/errands/spec.md` (scenarios are cited as `SC-NN`). Design: `.scratch/errands/design.md`.

## What to build

A tool that removes what the Quarterdeck created for one Project: its container, its rendered config exports and its config record. It refuses while the Project still has open work. Removing the folder and the FirstMate registry entry is left to the First Mate's skill (ticket 07), after this tool has succeeded and the user has confirmed.

## Acceptance criteria

- [x] `qd-project-rm <name>` removes the container labelled for that Project and home, the exports under `<work root>/quarterdeck/config/<name>/` and the Project's config record (SC-20).
- [x] A second Project's container, exports and record are untouched, and the Quarterdeck keeps running (SC-20).
- [x] The tool refuses, changing nothing, while FirstMate has an open record for that Project.
- [x] The tool never deletes the Project's folder or its git repository, and never removes a container that does not carry the creator, home and Project labels.
- [x] An unknown name exits non-zero and changes nothing.
- [x] `npm run test:errands` passes.

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

### Resolution (Sonnet agent)

Built in the commit "errands 06: remove a Project". New `quarterdeck/bin/qd-project-rm` (baked into the Quarterdeck image beside `qd-project-new`). Order: refusals first, then the labelled container(s), the exports, the `projects/<name>` link, and the config record last so a failed run can be repeated. A container is listed only by all three labels (creator `qd-project-up`, this home, this Project), with `docker rm -f` through the existing proxy (no proxy change); no volumes, no prune, no name patterns. Open work is any `<home>/state/*.meta` whose `project=` resolves to the Project's folder or its link (FirstMate's own record of live tasks); there is no force option. An unknown name (no container, exports or record) exits non-zero and changes nothing. The folder, its git repository and the registry entry are never touched. `tests/errands.test.mjs` has one new test (SC-20, tool half): two Projects, look-alike containers (other home, other creator, no creator) that survive, refusal for open records (also via the link path) with an unchanged snapshot, the other Project's and Secondmate records ignored, unknown and bad names, the folder kept, the other Project's files and container untouched, the Quarterdeck still running, the name reusable. `npm run test:errands` 8/8 green; cleanup clean. `ARCHITECTURE.md` and `quarterdeck/PROJECT-CONTAINERS.md` updated.

Decisions and caveats:
- The tool also removes the `<work root>/projects/<name>` link, but only when it is a symlink to the Project's folder. Without this a dangling link would make `qd-project-new` report "exists" after the skill removes the folder. The ticket does not list the link; it is Quarterdeck-made and the folder is untouched.
- Exports are removed per home (`config/<name>/<home hash>`), and `config/<name>` only if then empty, so a same-named Project of another home keeps its exports.
- A Project container can write `state/`, so a Crewmate could delete its own `.meta` and defeat the refusal. The user's confirmation in the `qd-project` skill (ticket 07) is the other guard.
- `qd-project-rm` does not remove the container's anonymous volumes (same as `qd-project-up`'s replacement), and never Claude or Codex volumes.
- Not run: `test:quarterdeck`, `test:skill`, pins and Renovate tests (nothing they cover changed except the Dockerfile COPY line; the Quarterdeck image was rebuilt by the errands test).

Review: reviewer agents not spawned; careful self-review against the design and spec. Findings: none requiring change.
