# 09: Remove egress domains and secrets

**What to build:**
- "Disallow <domain>" removes a domain from the project's top-level `egress`. It refuses, naming who needs it, when the Base or Variant layer, a remaining entry, or a covering domain requires it.
- "Remove secret FOO" removes a container-wide Named Secret and its `remoteEnv` line, then tells me I can unset `FOO` on the host. It refuses, naming the entry, when an MCP entry still names `FOO`.
- Removing an MCP entry removes its secret names. Its `remoteEnv` line goes only when no other MCP entry or top-level `secrets` still declares the name.
- Each flow ends with one question before recreating the container.

**Blocked by:** 10 (`status` shows which layer covers secrets and egress), and through it 08 and 11

**Status:** ready-for-agent

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

- [ ] `plan-disallow` refuses a Base-, Variant- or entry-needed domain and names the needer; otherwise it returns the top-level removal
- [ ] `plan-remove-secret` refuses a name an MCP entry still declares; otherwise it returns the top-level removal and the `remoteEnv` line to delete
- [ ] `plan-remove` of an MCP entry whose secret is also declared at the top level keeps the `remoteEnv` line; one declared nowhere else drops it
- [ ] The skill never asks for or shows a value, and mentions unsetting the host variable after a removal
