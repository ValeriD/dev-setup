# 02: Run the acceptance suite's test files in parallel

**What to build:** The acceptance suite runs several test files at once, locally and in CI. The run gets much shorter, and runs stay isolated from each other and from other projects' Docker resources.

**Blocked by:** None. It needs grilling first.

**Status:** needs-triage

## Found (2026-10-28)

- `package.json` runs `node --test ... --test-concurrency=1`, so the 52 tests run one after another.
- In CI run 40568688924 the suite took 8m21s: 407s inside tests, about 95s of harness overhead.
- The GitHub `ubuntu-24.04` runner has 4 vCPUs and 16 GB of memory, and the suite uses about one CPU at a time.
- Node 12 already isolates runs: a run id, run label, run tag and run root, plus a test that two runs at once don't remove each other's resources. The pieces shared within one run are the registry stub and the published Template. They'd need checking for parallel files in the same run.

## Open questions for grilling

- What concurrency should it use (2, 3 or 4), and should CI and local runs use the same value?
- Do tests that measure time-sensitive behaviour, such as the egress timeouts in SC-04 and fail closed, need their own serial group?
- Should the test timeout per file change?

## Comments

2026-10-28 grilling, all recommendations accepted:
- Q3: run 3 test files at once in CI and locally. An env variable overrides it, for example 1 for debugging.
- Q9 (round 2): no serial group at the start. SC-04 and fail closed run in parallel like the rest. A file moves to serial only after it is seen to flake.
