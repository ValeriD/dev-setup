# 12: Test suite cleans up its Docker leftovers

**What to build:** After `npm test`, whether it passed or failed, no test project images, containers or registry-stub volumes are left on the host.

**Blocked by:** None (can start immediately)

**Status:** needs-triage

## Context

- One full run on 2026-10-26 left about 15 `vsc-dev-setup-proj-*` images, around 1.4 GB each.
- Earlier runs left 108 anonymous `registry:2` volumes and stray `/tmp/dev-setup-proj-*` containers. Together these filled the disk (ENOSPC).
- Parallel agents also overwrote the shared `dev-setup-node:test` tag.

## Open questions (for grilling)

- Clean up per test (`after` hooks), or with one global teardown that removes everything labelled by the run?
- Label test resources (for example `dev-setup.test-run=<id>`) so cleanup never touches other projects' resources?
- Give each run a unique image tag by default, so parallel runs (agents, CI) can't collide?
- Keep the resources on failure for debugging, behind an env flag?
