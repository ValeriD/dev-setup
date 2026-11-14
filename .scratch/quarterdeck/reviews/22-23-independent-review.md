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

## Dispositions

- Standards ownership probe: **Fixed** in `9ec9f87`; the shallow-history assertion now shares the existing command-scoped ownership-safe image-pin seam.
- Standards duplicate HEAD assertion (test-value judgement): **Fixed** in `9ec9f87`; removed the duplicate while retaining the existing pin assertion and unique shallow-history protection.
- Design ownership-safe seam: **Fixed** in `9ec9f87`, as above.
- Spec pre-upgrade running-container attachment: **Fixed** in `9ec9f87`; normal reuse no longer requires the new startup marker. The existing no-duplicate attachment test now also covers a running container without that marker.
- No findings declined.

Verification also exposed a detached-HEAD fixture assumption (fixed in `9ec9f87`) and upload-pack's ownership check against `/opt/firstmate/.git` rather than the worktree path (fixed in `0520424`). The offline, network-disabled migration case subsequently passed.

## Correction review — fixed point `123c573`

### Standards

### [P2] Preserve startup gating for running containers still initializing
**quarterdeck/bin/quarterdeck:96 — Confidence: 0.96**

A second normal invocation while the first container is still initializing now skips `wait_ready` and immediately queries Herdr. Docker reports the container as running before `qd-entry` finishes egress setup or starts Herdr, so this invocation can fail with “could not inspect First Mate workspace” instead of waiting and attaching. Preserve marker-free attachment for older containers without removing readiness gating for current containers still starting. This contradicts the startup contract documented in `docs/architecture/quarterdeck.md`; it is a behavioral defect, not a hard coding-standard violation.

**Documented coding-standard violations:** None found.

**Baseline smells:** No actionable patch-introduced smells found.

**Changed-test value:** Moving the shallow-image assertion preserves its unique image-history protection while removing the duplicate HEAD assertion. The marker-removal scenario uniquely protects attachment to older running containers, but does not exercise attachment during current-image initialization; retain that compatibility protection when adding startup-race coverage. `HOME=/home/node` aligns the migration fixture with production startup, and `local-history22` strengthens the existing refs-preservation assertion. No test removal recommended.

**Overall correctness:** Incorrect. The compatibility correction introduces a concurrent-start attachment failure. No builds, tests, linters, or formatters were run.

**Confidence:** 0.96.

### Design

### [P2] Preserve readiness waiting for normal reuse during startup
**quarterdeck/bin/quarterdeck:96 — Confidence: 0.97**

**Constraint:** Ticket 23’s implementation plan states, “Readiness follows completed seeding; later normal start activates the First Mate, including in the same running container.”

**Hunk:** `if [ "$first_mate" = no ]; then wait_ready; fi`

A normal `quarterdeck` invocation now skips readiness waiting whenever Docker reports the container running. If invoked while another start is still initializing that container, execution immediately reaches `herdr … workspace list`. However, `qd-entry` completes egress setup before launching Herdr, so that query can fail and terminate the second invocation with “could not inspect First Mate workspace” instead of waiting and attaching. The previous unconditional wait protected this path. Preserve readiness synchronization for normal invocations while allowing attachment to legacy containers without the new marker; add coverage for reuse during initialization, alongside the markerless-running-container case.

**Overall correctness:** incorrect. The legacy-attachment correction introduces a startup synchronization regression. No other material design-axis violations found; no builds or tests run.

**Confidence:** 0.97.

### Spec

**[P2] Preserve readiness waiting for containers still starting**
`quarterdeck/bin/quarterdeck:96` — Confidence: 0.97

**Contract:** SC-01 (`spec.md:68`): “Running it again while it is running attaches without starting a second one.” Ticket 23:17: “Without it, behaviour is unchanged”; its implementation plan requires “Readiness follows completed seeding.”

**Hunk:** `if [ "$first_mate" = no ]; then wait_ready; fi`

The correction bypasses readiness for every normal invocation, not just already-ready legacy containers. Docker reports a container as running while `qd-entry` is still applying egress and starting Herdr and the home-seeding process. A second normal invocation during that interval immediately inspects workspaces: before Herdr answers it can fail with “could not inspect First Mate workspace”; after Herdr answers but before seeding finishes, it can launch another `qd-first-mate` against the same home. Previously, `wait_ready` prevented both paths. Preserve the legacy-container attachment fix while retaining the startup barrier for current containers.

**Overall correctness:** incorrect. One patch-introduced SC-01/readiness regression; no additional findings against ticket 22 or decisions 88/89. No builds or tests were run.
