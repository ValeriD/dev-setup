# 12: `status` reports a missing PAT

**What to build:** `status` warns when the project's GitHub PAT host variable is unset. It shows the variable's name only, never its value.

**Blocked by:** 07 (`status`)

**Status:** needs-triage

## Context

Found while building 07. `status` reports missing named secrets and `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL`, but not the PAT variable used by the github.com credential helper (node ticket 05). Without it, `git push` fails inside the container with no early hint.

## Open questions (for grilling)

- Is a missing PAT a warning, or just information? Some projects never push from the container.
- Should the container's attach-time check (`check-secrets.sh`) warn too, or only `status`?
- Should this fold into 10 (layer coverage), or into 08 (secrets no MCP server needs)?
