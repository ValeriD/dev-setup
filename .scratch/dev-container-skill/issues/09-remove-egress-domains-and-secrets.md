# 09: Remove egress domains and secrets

**What to build:**
- "Disallow <domain>" removes a domain from the project's top-level `egress`. It refuses, naming who needs it, when the Base or Variant layer, a remaining entry, or a covering domain requires it.
- "Remove secret FOO" removes a container-wide Named Secret and its `remoteEnv` line, then tells me I can unset `FOO` on the host. It refuses, naming the entry, when an MCP entry still names `FOO`.
- Removing an MCP entry removes its secret names. Its `remoteEnv` line goes only when no other MCP entry or top-level `secrets` still declares the name.
- Each flow ends with one question before recreating the container.

**Blocked by:** 10 (`status` shows which layer covers secrets and egress), and through it 08 and 11

**Status:** done

## Technical context

**Design:** `.scratch/manifest-followups/design.md`. Use the "Helper: removal plans" row, the "Removing an MCP entry" and "Disallowing a domain" flows, and Q8, Q9, Q20.

- **Modules:**
  - Skill helper: new read-only `plan-disallow <dir> <domain>` and `plan-remove-secret <dir> <name>`; `plan-remove` gains the secrets part.
  - Skill references: `egress-and-secrets.md` gains the disallow and remove flows.
  - Checklist rows.
- **Implementation anchors:**
  - `inspect.mjs` `planRemove` and `commands.mjs` `planRemovePreset` (the read-only plan pattern);
  - the image layer read and coverage from 10;
  - `checkSecrets` from 08.
- **Reuse:** the coverage computation from 10; `covers`; `secretNames`.
- **Dependency direction:** unchanged.
- **Must not introduce:** a helper that writes files; reading the Base or Variant layers from the checkout; any value handling.
- **Validation seam:** the helper CLI JSON.
- **Coverage:** helper integration with the fixture image from 10; manual checklist rows for disallow, the refusal, and secret removal.

- [x] `plan-disallow` refuses a Base-, Variant- or entry-needed domain and names the needer; otherwise it returns the top-level removal
- [x] `plan-remove-secret` refuses a name an MCP entry still declares; otherwise it returns the top-level removal and the `remoteEnv` line to delete
- [x] `plan-remove` of an MCP entry whose secret is also declared at the top level keeps the `remoteEnv` line; one declared nowhere else drops it
- [ ] The skill never asks for or shows a value, and mentions unsetting the host variable after a removal

## Comments

**Implementation notes (agent, 2026-10-26):**

- Helper (`commands.mjs`): `plan-disallow <dir> <domain>` and `plan-remove-secret <dir> <name>`, both read-only, JSON only.
  - `plan-disallow` reuses `projectLayers`, `egressDeclarations` and `allowing` from 10. It refuses (`ok: false`, `neededBy`) when any declaration other than the project's own top-level line allows the host: a Base or Variant domain (from the pinned image), an entry's `egress` (any layer), or a parent domain (any layer, top-level included). A domain that is not in the top-level `egress` gets `ok: false` with `allowedBy`. On success it returns `remove` and `subdomainsStayAllowed` (subdomains declared elsewhere that stay reachable on their own).
  - When the image layers are unknown, `plan-disallow` goes ahead and adds a `note` ("could not be checked"), rather than refusing. Disallowing a domain that a layer still allows only has no effect; it never widens egress.
  - `plan-remove-secret` refuses (`neededBy`) while any MCP entry declares the name, also when the top level declares it too (Q9). Otherwise it returns `remove` and `remoteEnv`: `delete`, `keep` or `none`, plus `unsetOnHost` (the host variable from the `${localEnv:…}` reference, never a value) on `delete`. When the Base or Variant layer of the pinned image declares the name too, it returns `keep` with `remoteEnvKeptFor`, because the line serves that layer as well. When the layers are unknown, it returns a `note`.
  - `plan-remove` gains `secretsWithEntry`: the entry's names, each with `stillDeclaredBy` and the same `remoteEnv` fate (Q20). It stays a pure project-manifest computation and does not read the image (ticket 13). `plan-remove-preset` gains the same as `secretsWithEntries`, because a Preset's MCP entries carry secrets too and the rule is the same.
- `manifests.mjs`: new pure `secretsGoing(manifest, indexes)`, built on `secretsNeededBy`.
- Docs: `egress-and-secrets.md` gains "Disallow a domain" and "Remove a secret" (both end in the existing **Finish**, one recreate question). `extensions.md` and `presets.md` removal steps now delete the `remoteEnv` line on `delete` and mention unsetting the host variable. Also updated: the `SKILL.md` description and routing, the ARCHITECTURE.md skill rows (rewritten in place), and new checklist rows E8 to E11 and X7.
- Tests: in `scripts/test/status.test.mjs`, the fixture image from 10 is now built once and shared. Two new tests: plan-disallow (Base, Variant, entry, Base-parent and project-parent refusals, success, subdomains, not-top-level, unknown layers, writes nothing, apply then `status --domain`); and plan-remove-secret with plan-remove Q20 (MCP refusal, also when declared in both places, container-wide delete with a different host variable, Base-declared keep, undeclared, no value in any output, apply then `validate`). One exact-match assertion in `inspect.test.mjs` was extended for `secretsWithEntry`.
- Verified: `npm run test:skill` 50/50, `npm run test:installer` 52/52, `node scripts/check-pins.mjs` ok. The fixture image is removed by the file's `after`. `npm test` was not run, because the container suite does not cover the plan commands.
- The last box (the conversation never asks for or shows a value, and mentions unsetting) is unticked, so Status is left unchanged, as in 08. The helper never emits a value (asserted), and it gives `unsetOnHost`. The references tell the agent to say it. Checklist rows E10, E11 and X7 cover it, but they were not run. Set `done` once they pass.

- Review follow-up: `readRemoteEnv` and `localEnvName` moved from `status.mjs` to `manifests.mjs`, so `status` and the plans share them. `TOP_LEVEL_EGRESS` is now a constant. Tests now also cover `plan-remove-preset`'s `secretsWithEntries`, `remoteEnv: none`, and that the applied `remoteEnv` line is gone. `npm run test:skill` passes 50/50.

**Belongs elsewhere:**

- 13: `plan-remove`/`plan-remove-preset` also ignore Base and Variant secret declarations. A secret an MCP entry and the Base layer both declare would get `remoteEnv: delete`. Today no Base or Variant manifest declares secrets. If 13 makes removal plans read the image layers, the secrets part should use them too (`remoteEnvKeptFor`, as `plan-remove-secret` does).
