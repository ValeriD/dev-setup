# 13: Removal plans consider the Base and Variant layers

**What to build:** When I remove an extension or a Preset, the plan says which of its domains the Base or Variant layer still allows. I then know whether the domain stays reachable after the removal.

**Blocked by:** 10 (`status` shows which layer covers secrets and egress)

**Status:** needs-triage

## Context

Found while building 11:
- `plan-remove` and `plan-remove-preset` look only at the project manifest. An empty `stillAllowedBy` means "the project layer stops allowing it". The design's "Removing an MCP entry" flow says domains a Base or Variant layer still needs are kept, but no ticket owns that part: 09 adds only secrets to `plan-remove`, and 10 covers `status`.
- `status` matches top-level domains to entries exactly, while `egressGoing` uses `covers` (subdomains). These should agree.

## Open questions (for grilling)

- Should `egressGoing` take the image layers from 10, and answer "unknown" when the image isn't local, the same as `status`?
- Should this fold into 09 when it's implemented, or stay separate?
