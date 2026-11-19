## Standards

Reviewed `1d2908f...04d3a7f` directly. No files modified or agents spawned.

**Documented rules:** No new, unambiguous documented-standard violation found. The recorded Feature-trust and shared-Git-store credential limitations remain deferred security concerns, not newly resolved guarantees.

**Judgment calls**

1. **Changed test can pass without making a commit** — `tests/quarterdeck.test.mjs:146–148`  
   The probe uses `git ... commit -qm proof; git rev-parse HEAD`. Because commands are separated by semicolons, a failed commit followed by a successful `rev-parse` returns success. Comparing HEAD across containers then passes because both still see the old commit. This weakens the test’s unique protection: proving that a Crewmate can commit through these mounts and that the Quarterdeck immediately sees that commit. Preserve that integration check, but fail on intermediate errors (`set -e` or `&&`) and verify HEAD changed.

2. **Possible Mysterious Name / positional data coupling** — `quarterdeck/bin/qd-project-up:50–65`  
   `const sources = [...]` becomes `bind(sources[2], sources[2], true)` and corresponding `[3]`/`[4]` accesses. The numbers hide which security-sensitive directory is mounted and whether it should be writable; changing array order can silently change the mount policy. Use named paths or named mount descriptors while retaining the existing ownership validation. This is the **Mysterious Name** heuristic from `/home/valeri/.agents/skills/code-review/SMELLS.md`, not a repository rule.

The new exact-mount assertions, read-only write probes, Feature build check, and rejected-configuration survivor checks provide distinct protection; I would retain them rather than classify them as redundant.

**Summary:** 0 hard violations; 1 baseline smell; 1 changed-test value problem. Most consequential: the commit test’s false-positive path.
