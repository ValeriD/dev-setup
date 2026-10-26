# 08: Secrets no MCP server needs

**What to build:** "Add secret FOO" for a variable no MCP server uses still leaves a manifest reference. Then the start-up warning and `status` report it when it is missing from the host env, the same as MCP secrets.

**Blocked by:** 04 (Egress domains and secrets)

**Status:** needs-triage

## Context

Found while building 04. The Extension Manifest's only place for a secret name is an MCP entry: `env` for stdio, `bearerTokenEnv` for `mcp-remote`. For any other variable, 04 adds only the `remoteEnv` line. This falls short of the spec's "and the manifest reference".

## Open questions (for grilling)

- Do non-MCP secrets belong in the Extension Manifest at all, for example as a top-level `secrets` list? Or should `remoteEnv` alone be the source?
- If they go in the manifest: which layers may declare them, and does the installer or `check-secrets.sh` warn about them?
- Is this a schema change to `installer/extensions.schema.json` (and an ADR 0004 amendment)?
