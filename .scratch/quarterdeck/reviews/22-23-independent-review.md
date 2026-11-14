# Tickets 22 and 23 — independent review

Fixed point: `e1d439ac694ce41094d5de1670346029dd254418`. Reviewed implementation commit: `123c573`. Reports below are preserved as returned.

## Standards

**[P2] Add the ownership exception to image-history probes**
`tests/quarterdeck.test.mjs:534–535` — confidence: 1.0

The new `okInside('git -C /opt/firstmate …')` assertions execute as `node`, but the Dockerfile explicitly makes `/opt/firstmate` root-owned. Neither the image environment nor its Git configuration trusts that directory, so Git rejects these probes for dubious ownership, failing the startup acceptance test. Follow the existing probe at line 630: use command-scoped `-c safe.directory=/opt/firstmate`.

**Documented-standard violations:** None found.

**Baseline smells / test-value judgement:** The new HEAD assertion duplicates the existing pin assertion at line 630. The shallow-history assertion provides unique protection and must remain; move it alongside the existing ownership-safe pin probe if consolidating these checks. No other actionable baseline smells or redundant changed tests found.

**Verdict:** Incorrect: the added acceptance assertions fail against the image’s intentional ownership configuration. No builds or tests were run.

## Design

### [P1] Reuse the ownership-safe image-history probe
**tests/quarterdeck.test.mjs:534–535 — Confidence: 1.0**

Ticket 22’s validation plan requires “Reuse pinned/fresh-home checks and ticket 11/12 dispatch loops.” The added hunk calls `okInside('git -C /opt/firstmate rev-parse --is-shallow-repository')` and the equivalent HEAD probe without an ownership exception. `okInside` executes as `node`, but the Dockerfile explicitly makes `/opt/firstmate` root-owned, and the global Git configuration grants no exception. Git therefore rejects these commands as dubious ownership, failing the initial acceptance case before its remaining assertions. Reuse the existing image-pin probe’s `git -c safe.directory=/opt/firstmate` invocation for both assertions.

**Overall correctness:** incorrect. The new image-history assertions violate the existing ownership-safe validation seam and fail the acceptance case. No other material design-axis violations found.

**Confidence:** 0.99.

## Spec

**[P2] Preserve attachment to an already-running pre-upgrade container**
File: `quarterdeck/bin/quarterdeck`, lines 94–95
Confidence: 0.99

Ticket 23:17 requires “Without it, behaviour is unchanged”; SC-01 (`spec.md:68`) says “Running it again while it is running attaches without starting a second one.” The new running-container branch unconditionally calls `wait_ready`, which requires `/run/quarterdeck-ready`. The previous committed entrypoint never creates that file, so updating this checkout while its existing container runs makes ordinary `quarterdeck`/`quarterdeck attach` time out instead of attaching. Rebuilding the image does not update that running container; stopping it sacrifices its live sessions. Preserve attachment to an otherwise-ready existing container without requiring the newly introduced marker.

Overall correctness: incorrect. One code-proven acceptance regression; no tests were run, and runtime acceptance results remain unverified.
