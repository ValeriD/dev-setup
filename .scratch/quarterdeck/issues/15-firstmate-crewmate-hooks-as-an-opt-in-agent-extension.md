# 15: FirstMate's Crewmate hooks reach a Quarterdeck-created container as an opt-in Agent Extension

**Status:** needs-info
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

## Comments

### Conditional prerequisite missing — no implementation authorized by evidence

Fixed point and starting HEAD: `952cbd8bf25bd224d232fbbd026aaac5ef6a4574`. Read tracker instructions, domain/architecture context, spec, full design, dependencies 07 and 14 (including its independent-review closeout), ADRs 0004/0008/0010, creator and installer hook delivery, Base policy, test manifest and ticket 14's checklist.

**Actual deciding result:** ticket 14 explicitly says no real hooks or supervision behavior was observed; its hook-result criterion is unchecked. `quarterdeck/CHECKLIST.md`, “Ticket 14 / hooks and supervision”, likewise says not run. The design's expectation that `allowManagedHooksOnly` suppresses local hooks is not an observed result. Neither a simulated Stop hook nor a passing prepared-home stub loop establishes that real Claude suppresses these hooks. Thus neither the “hooks fired, build nothing” branch nor the conditional implementation branch has been established.

**Sketch / scope:** change only this ticket's status and append this handoff. Reuse the existing ticket 14 checklist rather than add a speculative ticket 15 hook row (reuse ladder rung 1: no new component yet). No independently valid runtime portion exists before this condition is established: even the script and its stub tests would presume that the extension is needed. No script, manifest entry, pinned-source commit, placeholder test or checklist claim was added. No new abstraction, interface, module ownership or dependency direction; no architecture reconciliation required. All six criteria remain unchecked, including the SC-02/SC-10 supervision support.

**Blockers, separated by kind:**

- **Missing manual evidence (direct blocker):** observed busy and turn-end hook firing under the unchanged hardened policy, plus whether supervision works without those hooks. This is the mandatory ticket 14 result, not missing ticket 15 implementation to fill speculatively.
- **Existing implementation-contract/provisioning failures upstream:** ticket 08/security-review 05 records the pinned devcontainer CLI persisting the extensions token in `/etc/environment`; ticket 11, as reported in ticket 14, records stock shallow-home dispatch failing FirstMate's lineage guard. A real token does not fix either; prepared-history fixture success does not prove stock-home dispatch. These are not merely missing manual evidence and are not repaired under ticket 15.
- **Missing operational inputs/authorization reported by ticket 14:** authorized fresh owning home/clone with fetched pomoplan `origin/main`, human-provisioned scoped extensions token and Claude authentication, and explicit permission for the real gate. Ticket 14's absent adjacent `origin/main` is its recorded observation, not a new check in this session. No remote fetch, real credential access or real-agent run was attempted here.
- **Not missing creator implementation:** ticket 07's creator, main export, restricted Template arguments, retained Features, mounts and readiness exist. Its remaining config/Feature and shared-Git-store trust concerns (security-review 01/03), and concerns 04/07, remain logged human follow-up, not blanket gates on otherwise authorized work. Unsupported `runArgs` rejection remains approved; no blanket Feature rejection or new isolation guarantee is introduced.

**Precise resumption instructions:**

1. Follow `quarterdeck/CHECKLIST.md` → “Ticket 14 — pomoplan and a hand-spawned Crewmate”, including its distinction between actual execution blockers and pending policy reviews. Resolve the demonstrated token-persistence failure or obtain explicit acceptance of that specific failure before real-token validation; resolve stock-home provisioning without patching FirstMate or bypassing its guard. Obtain the authorized inputs and real-gate permission there. Do not run that gate as part of this restricted session.
2. In that attended ticket 14 run, record date, repository/main/config/image and FirstMate/Claude revisions, container identity, unchanged effective hardened policy, and whether FirstMate generated the local hook commands. Record sanitized before/after generation, sequence and timestamps for `state/<slug>.busy-state` and `.turn-ended`, correlated with actual busy/turn-end events, status lines and Herdr states. Never source state/worktree content or dump secret-bearing environments/logs. Record busy and turn-end results separately and supervision with/without their signals. A missing signal alone does not establish policy suppression; inconclusive results remain blocked, with the missing observation identified.
3. Append those actual results to ticket 14 and link them here. If the hooks fired, record that here and build nothing as this ticket directs. Only if observations establish the specified hardened-policy suppression/need should ticket 15 resume implementation. Preserve the existing Extension mechanism and two-commit source-pin requirement; do not relax policy, alter product dispatch, patch FirstMate, or modify Base/Variant/Template. If observations do not settle the condition, keep this ticket open rather than guessing.
4. After that condition is established, validate the installed entry and stub behavior through `tests/quarterdeck.test.mjs` (including unset FirstMate variables and data-only generation handling), unchanged hand-opened settings/hook list, and the real-Claude checklist row required above. These are future validation instructions, not acceptance claims. Broader acceptance coverage needs separate authorization under this session's suite restrictions.

**Validation actually run:** `npm run test:quarterdeck` exited 0: **32 tests, 31 pass, 0 ordinary failures, 0 skipped, 1 failing TODO**. The TODO reports the existing ticket 08 failure at `/etc/environment`; it is not evidence of token-file absence. Output: `/tmp/quarterdeck-ticket15-tests.log` (ephemeral). This is unchanged-runtime regression evidence only, not proof of ticket 15's prerequisite or criteria. No new behavior was built, so no red-green cycle is claimed. Broader regression coverage intentionally not run: full acceptance suite, skill suite, installer suite, unrelated suites and pomoplan gate. No real secrets or credential probes were used.

No new distinct security concern was identified; existing concerns are not duplicated or modified. Initial dirty `grill-notes.md`, ticket 07, `CONTEXT.md`, and untracked security-review 01 remain outside this work. Only this ticket is committed, with its path in the commit message. Independent review is deliberately not launched: the parent will dispatch a fresh review after this handoff; no review findings or closure are claimed. Ticket remains open, **needs-info**, with all criteria unticked. No other ticket was started.
