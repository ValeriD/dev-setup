# 11: Per-entry egress for skills, plugins and hooks

**What to build:** Each Extension Manifest entry carries the egress it needs, whatever its kind. Then "remove an extension" drops exactly that egress, with no need to fetch the pinned content and guess.

**Blocked by:** 03 (Add and remove extensions after review)

**Status:** needs-triage

## Context

Found while building 03:
- Skill, plugin and hook entries have no `egress` field, so their domains go into the project's shared top-level `egress`.
- On removal, `plan-remove` decides what to drop from the content it fetches and heuristic host detection.
- The installer already merges per-entry egress for any kind. The schema allows it only on `mcp-remote`.

## Open questions (for grilling)

- Allow an optional `egress` on every kind? This is a public schema change and an ADR 0004 amendment.
- Migrate existing top-level domains onto entries, or leave them where they are?
- Does 08 (secrets no MCP server needs) want the same "per-entry vs top-level" decision, made together?
