# 13: Removal plans consider the Base and Variant layers

**What to build:**
- When I remove an extension or a Preset, the plan says which of its domains the Base or Variant layer still allows, so I know whether each domain stays reachable.
- A secret's `remoteEnv` line is kept when the Base or Variant layer also declares that name.
- When the pinned image isn't local, the plan goes ahead and says the Base and Variant layers couldn't be checked.

**Blocked by:** None (10 is done)

**Status:** ready-for-agent

## Technical context

**Design:** `.scratch/manifest-followups/design.md`, "Second follow-up decisions" Q1 and Q2, plus the "Removing an MCP entry" flow.

- **Modules:** the skill helper's `plan-remove` and `plan-remove-preset`; skill references `extensions.md` and `presets.md` (how to say "still allowed by Base/Variant" and the unknown note).
- **Implementation anchors:**
  - `skills/dev-container/scripts/image-layers.mjs` `projectLayers`;
  - `manifests.mjs` `egressGoing`, `secretsGoing`, `egressDeclarations`, `allowing` and `secretDeclarations`;
  - `commands.mjs` `plan-remove-secret`'s `remoteEnvKeptFor` (the pattern to follow);
  - the fixture image in `scripts/test/status.test.mjs`.
- **Reuse:** ticket 10's image-layer read and coverage functions; `covers`.
- **Dependency direction:** unchanged.
- **Must not introduce:** running or pulling the image; reading the Base or Variant layers from the checkout; a refusal when the layers are unknown; any value handling.
- **Validation seam:** the helper CLI JSON.
- **Coverage:** helper integration with the shared fixture image (a domain still allowed by Base or Variant, a secret also declared by Base, and the unknown case); checklist rows X-series and P-series for removal updated.

- [ ] `plan-remove` names Base or Variant in `stillAllowedBy` for a dropped domain those layers still allow
- [ ] `plan-remove-preset` does the same for every entry it removes
- [ ] A removed MCP entry's secret that a Base or Variant layer also declares keeps its `remoteEnv` line, naming that layer
- [ ] With the pinned image not local, both plans succeed with a note and pull nothing
