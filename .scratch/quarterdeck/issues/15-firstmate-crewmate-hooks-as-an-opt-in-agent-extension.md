# 15: FirstMate's Crewmate hooks reach a Quarterdeck-created container as an opt-in Agent Extension

**Status:** ready-for-agent
**Model:** Opus (the ticket is about an agent hook)
**Design slice:** 3 (Hardened project container), design open question 3

## What to build

Only if ticket 14 shows that the hardened Claude policy (`allowManagedHooksOnly`) stops FirstMate's Crewmate busy and turn-end hooks: a hook, delivered as an Agent Extension, that makes those signals work for a Crewmate in a Quarterdeck-created project container. The user's rule: a Consuming Project's dev container must keep working both with and without the Quarterdeck. So the hook is not baked into Base or the Node Variant. It is added only by `qd-project-up` when it creates the container, and a container opened by hand stays exactly as it is.

First step: read ticket 14's recorded result. If the hooks did fire under the hardened policy, write a comment on this file saying so and stop; build nothing.

## Working assumptions and decisions

- DECISION (user): managed hooks, yes, as an Agent Extension, opt-in; nothing FirstMate-specific in Base, the Variant or a hand-opened container; the policy is not relaxed.
- ASSUMPTION, mechanism to confirm with the user if it does not fit: the extension is an entry of kind `hook` (schema `installer/extensions.schema.json`: `event`, optional `matcher`, `source` as a pinned GitHub source) in a Quarterdeck-owned layer. `qd-project-up` writes that entry into the exported `.devcontainer/extensions.json` that becomes `/workspace/.devcontainer/extensions.json`, which the start-up installer already reads. The hook script lives in this repository; its entry pins a commit that already exists, so landing it takes two commits. The design's description of the script: read FirstMate's generation value as data and call `fm-busy-event.sh` from the read-only `<home>/bin` mount.
- Pomoplan's own Project layer does not change.

## Acceptance criteria

- [ ] The hook does nothing unless FirstMate's variables (`FM_TASK_ID`, `FM_TASK_INBOX`) are set, so the same extension, if present, is harmless in a container used without the Quarterdeck.
- [ ] A container made by `qd-project-up` has the hook installed in the way the installer installs hooks, and the hardened policy still has `allowManagedHooksOnly` and the rest of Base's keys.
- [ ] A container opened by hand from a Template, or made by `qd-project-up` from a project, differs only by that entry: `git diff` shows no change under `base/`, `variants/` or `templates/`, a hand-opened container's managed settings and hook list are byte-identical to before, and the existing acceptance suite passes.
- [ ] The script never executes content read from `state/` or from the worktree (both are Crewmate-writable); it reads the generation value as data and runs only `fm-busy-event.sh` from the read-only `<home>/bin`.
- [ ] Token-free test: with a stub invoking the installed hook command, FirstMate's busy-state and turn-ended files in `<home>/state` change as FirstMate expects, and with `FM_TASK_ID` unset nothing is written.
- [ ] `quarterdeck/CHECKLIST.md` gets a row for a human with a real Claude: under the hardened policy a Crewmate's turn end and busy state reach FirstMate through this hook.

## Technical context

**Design:** `.scratch/quarterdeck/design.md`, "Project container" (row "Crewmate hooks under the hardened policy"), open question 3 and "Risky integration points".

- **Modules:** a hook script under `quarterdeck/` (path free), `quarterdeck/bin/qd-project-up` (adds the entry to the Quarterdeck-owned export only), tests.
- **Implementation anchors:** `installer/extensions.schema.json` (hook kind), `installer/src/claude.mjs` (how hooks are installed), `base/claude/managed-settings.json`, FirstMate's `fm-busy-event.sh` and the busy hooks it writes into `<worktree>/.claude/settings.local.json`, ADR 0004 (unified manifest).
- **Reuse:** the existing Extension mechanism; no new one.
- **Dependency direction:** Quarterdeck adds an Agent Extension to a container it creates; nothing in Base, the Variant or a project depends on the Quarterdeck.
- **Must not introduce:** a relaxed Claude policy, FirstMate-specific content in Base or the Node Variant or Template, a baked-in hook, a FirstMate patch.
- **Validation seam:** `tests/quarterdeck.test.mjs` for the installed entry and the stub run; manual row for real Claude.
- **Coverage:** supports SC-02 and SC-10 (supervision of Crewmates in the project container).

## Blocked by

- 07: `qd-project-up` creates the project container from the project's main branch
- 14: The hardened project container on pomoplan runs the full gate for a hand-spawned Crewmate (its recorded hook result decides whether anything is built)
