# 09: Remove egress domains and secrets

**What to build:** "Disallow <domain>" and "remove secret FOO" undo what 04 adds. Each removes the manifest entry and the matching `remoteEnv` line, with one question before recreating the container.

**Blocked by:** 04 (Egress domains and secrets)

**Status:** needs-triage

## Context

Ticket 04 built only the add direction.

## Open questions (for grilling)

- Disallowing a domain an extension still needs: refuse it, warn, or remove the extension too? (Ticket 03 removes egress "only it needed".)
- Disallowing a domain the Base layer allows: refuse with a reason?
- Removing a secret that an MCP entry still references: refuse it, or remove the reference too?
- Should removing it from `remoteEnv` also tell the user they can unset the host variable?
