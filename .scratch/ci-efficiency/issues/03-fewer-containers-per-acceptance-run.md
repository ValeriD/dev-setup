# 03: Start fewer containers per acceptance run

**What to build:** Checks that only read a running container share one container per test file, instead of each starting its own. The slowest tests are cut down to what they actually prove. Coverage of the acceptance scenarios stays the same.

**Blocked by:** None. It needs grilling first. Interacts with 02.

**Status:** needs-triage

## Found (2026-10-28)

Durations per test from CI run 40568688924:

| Test | Time |
|---|---|
| migrate (npm project → Template, pnpm lockfile in the container) | 92s |
| SC-17 missing secret warns at attach | 30s |
| SC-04 egress allowlist / IPv6 / DNS | 30s |
| SC-05/13 project skill and egress on recreate | 30s |
| SC-13/15 project plugin and hook after recreate | 24s |
| SC-10 login volumes across a rebuild | 21s |
| SC-19 PAT helper | 18s |
| render-template validates and starts | 16s |

- Together these take about 260s of the 407s.
- Read-only checks (SC-06 privilege, SC-09, SC-12, SC-18, SC-03) each take 3–10s, mostly starting a container.
- The migrate test's time is mostly a pnpm install from the public registry inside the container.

## Open questions for grilling

- Which tests may share a container? A shared container means one test's leftovers can affect another.
- Can migrate use a smaller fixture project, or a pre-filled pnpm store, without weakening what it proves?
- Do SC-17 and SC-05/13 need a full recreate, or is that the behaviour under test?

## Comments

2026-10-28 grilling, all recommendations accepted:
- Q4: only read-only checks in the same file share one container. Those are SC-06 privilege, SC-09, SC-12, SC-18 and the SC-03 host-exposure checks.
- Tests that recreate or rebuild keep their own containers, SC-17 and SC-05/13 included.
- Migrate keeps the same steps but uses a fixture project with fewer dependencies.
