# 14: The hardened project container on pomoplan runs the full gate for a hand-spawned Crewmate

**Status:** ready-for-human
**Model:** Sonnet
**Design slice:** 3 (Hardened project container), the real half

## Human step: the user supplies the token

pomoplan's Project layer pulls 14 skills from the private repository `ValeriD/skills` when the container starts. The user has decided to provide a GitHub token limited to that one repository (read-only) so the project container can fetch them. That token is delivered by ticket 08. The user must supply its value before this ticket's real run; it is a human step, not a design decision. The project container still gets no credential for pomoplan's own repository and nothing that can push.

## What to build

`qd-project-up` on pomoplan's real main-branch `.devcontainer/`, then one Crewmate spawned by hand with FirstMate's own commands (as in spike link 1). It runs `pnpm install --frozen-lockfile` and the full gate inside the container with no prompt, and with no credential in the container other than the read-only extensions token.

## Working assumptions and decisions

- DECISION (user): if the hardened policy's `allowManagedHooksOnly` stops FirstMate's Crewmate hooks, the fix is a hook delivered as an Agent Extension, opt-in, added only by the Quarterdeck when it creates the container (ticket 15). Do not relax the policy and do not put anything FirstMate-specific in Base or the Node Variant. This ticket only measures whether it is needed.
- ASSUMPTION, undecided by the user ("will see"): `/workspace` holds only the main-branch `.devcontainer/`, read-only (as in ticket 07).

## Acceptance criteria

- [ ] `qd-project-up` on pomoplan's `origin/main` leaves a running container from its pinned image, egress ready, with the Project layer installed (skills fetched from `ValeriD/skills` with the read-only token), and no GitHub credential in the container other than that token: nothing that can push and no credential for pomoplan's own repository.
- [ ] A Crewmate spawned by hand (`fm-spawn.sh <slug> projects/pomoplan --mode direct-PR --yolo off --branch-prefix <prefix> --harness claude --model sonnet` in the Second Mate's home) starts through the launcher with no prompt, trust dialog or login, and Herdr shows its real state (working, blocked, done), not "not found" (SC-02, SC-10 part).
- [ ] That Crewmate runs `pnpm install --frozen-lockfile`, `pnpm run build`, `pnpm run lint` and `pnpm test` in the container under the Egress Allowlist, and all four pass (SC-07 part).
- [ ] Recorded in a comment: which destinations `next build` and `/implement` needed beyond the Base list and pomoplan's layer (any addition goes to pomoplan's own layer; a Base change is a new ticket).
- [ ] Recorded in a comment: whether FirstMate's busy and turn-end hooks fired under the hardened policy, and whether supervision worked without them.
- [ ] Recorded in a comment: the final list of proxy endpoints the devcontainer CLI needed for pomoplan's local Feature `playwright-deps`, and the proxy list (ticket 04) updated to match.
- [ ] The rows for SC-02, SC-07 and ticket 08's token-scope row (the `ValeriD/skills` token reads that repository only, and a push is refused) in `quarterdeck/CHECKLIST.md` are run and noted.

## Technical context

**Design:** `.scratch/quarterdeck/design.md`, "Project container" (all rows, especially "Project-layer fetch" and "Crewmate hooks under the hardened policy"), "Existing shape" (pomoplan), "Risky integration points".

- **Modules touched:** tickets 04, 07 and 09's outputs; possible small fixes there (note them).
- **Implementation anchors:** `.scratch/pat-container-env/issues/01` (the private-repository fact), `spike/FINDINGS.md` link 1 (the commands), pomoplan's `.devcontainer/`.
- **Must not introduce:** a GitHub credential in the project container, a relaxed Claude policy, a change to the Variant, Template or Base.
- **Validation seam:** real Claude session, real pomoplan; a human is present for the first run.
- **Coverage:** proves the unproven items of SC-02, SC-07, SC-10, SC-15 to SC-17 on the real image.

## Blocked by

- 03: Tokens reach only the processes that need them, by name (its mechanism awaits the user's confirmation, so this ticket cannot run a real Claude until then)
- 05: The First Mate's home is seeded and its tab opens on start
- 07: `qd-project-up` creates the project container from the project's main branch
- 08: The project container receives a read-only token for fetching Agent Extensions
- 09: The `claude` launcher runs a Crewmate in the project container with the right environment
- The user supplying the read-only `ValeriD/skills` token (human step)

## Comments

### Steps 1–5 handoff — real slice blocked, no acceptance claimed

Fixed point: `43c12bb8fffa90367d138afc639458604e986d94` (also HEAD at start). Read tracker, spec, design including Project container/Docker access/risky integrations, dependencies 03/05/07/08/09 and mechanism decision 20, proxy ticket 04, spike links 1–2, creator/launcher, operating docs, architecture and test manifest. The historical `.scratch/pat-container-env/issues/01` anchor is absent here, as already recorded by ticket 08.

**Sketch and work:** reuse existing creator → devcontainer CLI → proxy and FirstMate → launcher → project-container flow, unchanged (reuse ladder rung 1: no additional runtime component needed for this handoff). Add ticket-specific attended instructions and evidence rows to `quarterdeck/CHECKLIST.md`; record precise dependency and validation gaps here. No new abstraction, external interface, module ownership or dependency direction, so no architecture reconciliation is needed. Existing Quarterdeck fixture coverage is reused; no new runtime behavior or red-green cycle is claimed. All owned real scenarios (SC-02/07/10 and SC-15–17 coverage), destinations, hooks, endpoints and token-scope evidence are explicitly not run. No other implementation ticket or conditional ticket 15 was built.

**Dependency disposition:**

- 03/20: non-root named parser and Herdr delivery exist; the original mechanism-choice blocker is superseded. Concern 07 separately records mounted-secret readability from outside exec: environment absence does not prove unreadability.
- 05: seeded home/tab code exists; real Claude prompt-free startup remains manual evidence. Ticket 11 additionally records stock shallow-home dispatch failing FirstMate's lineage guard. Its tests prepare history first; a supported production provisioning fix/decision remains outstanding. This is not merely a missing token or an instruction to weaken the guard.
- 07/04: main export, restricted arguments, retained Features, mounts, readiness and proxy implementation exist. The ordinary fixture passes. Concerns 01/03 leave arbitrary Feature/configuration trust and shared-Git-store credential guarantees unresolved; no blanket Feature rejection is introduced.
- 08: creation transport exists, but the pinned CLI persists the dummy token in `/etc/environment` (concern 05). This is an observed implementation-contract failure, not missing human evidence; accepted inspect visibility does not accept disk persistence. Real private-source startup and token permissions are separate uncollected human evidence (concern 04).
- 09: launcher code is now present despite historical ticket 08 comments saying otherwise. Its fixtures cover routing, trust shape and forwarding, not real Herdr states or prompt-free vendor behavior.
- Actual pomoplan main input is unavailable locally: `git -C ../pomoplan rev-parse refs/remotes/origin/main` and `ls-tree origin/main .devcontainer` fail because the ref does not exist. No fetch, remote credential access, developer-checkout modification or substitution of working files occurred. Obtain a fresh authorized Second Mate clone and fetched main revision before any real validation.
- The user permits only Quarterdeck tests in this session, explicitly excluding pomoplan tests. Thus no real gate/spawn was attempted; no token was requested, inspected or probed.

**Validation actually run:** `npm run test:quarterdeck` exited 0: **32 tests, 31 pass, 0 ordinary failures, 0 skipped, 1 failing TODO**. The TODO reports only the path `/etc/environment`; it does not prove token-file absence. The main-only project fixture, benign local Feature, unsupported-runArgs rejection and launcher fixture pass. Prepared-home stub loop results are not stock-home or real-agent evidence. Broader regression intentionally not run: no full suite, skill suite, unrelated suite or pomoplan gate. Test output: `/tmp/quarterdeck-ticket14-tests.log` (ephemeral, not committed).

**Exact next steps:** keep concerns 01/03/04/07 logged for human follow-up and continue otherwise authorized work under the existing design; pending security-policy reviews are not universal prerequisites. Follow the new ticket 14 section of `quarterdeck/CHECKLIST.md` after resolving the demonstrated concern 05 `/etc/environment` persistence failure (or obtaining explicit human acceptance of that specific failure), resolving the stock-home provisioning blocker, obtaining an authorized fresh clone and token provisioning, and receiving explicit authorization for the real gate. It specifies main/image revisions, the owning-home brief/spawn commands, commit-only/no-publication intent, separate gate exit statuses, Herdr observations, hook generation/timestamps, sanitized egress destinations and proxy method/path evidence. Do not broaden endpoints or egress without observations; additions to pomoplan's layer require separately authorized work and Base changes a new ticket. No `/implement` execution is implied by the gate-only Brief; its destination evidence remains pending. Do not implement ticket 15 unless observed hook/supervision behavior establishes the need.

No new distinct security concern was identified; existing individually numbered ready-for-human concerns already carry evidence, impact, pointers and review criteria. None was duplicated or modified. No destinations, final pomoplan Feature endpoint list, hook firing, supervision outcome, private fetch, permission denial or real Herdr state is claimed observed. All acceptance criteria remain unchecked and status remains ready-for-human.

Only this ticket and `quarterdeck/CHECKLIST.md` are committed. Preexisting changes in `grill-notes.md`, ticket 07 and `CONTEXT.md`, and untracked security concern 01 are preserved outside the commit. Product model dispatch, policy, Base, Variant and Template remain unchanged. Stop after step 5: parent independent review and any closure remain pending.

### Independent review closeout — ticket 14 remains open

Commits: `bc56722` (reviewed handoff), `107ab27` (targeted policy-gate corrections). This closeout is recorded in the subsequent `docs(ticket14): record independent review closeout` commit. Only the quoted blanket-policy hunks in this ticket and `quarterdeck/CHECKLIST.md` were corrected; no runtime behavior or structure changed.

**Disposition:** Design finding 1 — **Fixed**. Spec finding 1 — **Fixed**. Standards — **none (0 findings)**. Pending policy reviews remain logged follow-up, not universal prerequisites; otherwise authorized work continues under the existing design.

**Validation:** prior `npm run test:quarterdeck` result remains **31 pass plus 1 failing TODO, exit 0** (32 total, no ordinary failures). Documentation-only corrections did not rerun tests. Broader regression intentionally unrun: full suite, skill suite, unrelated suites and pomoplan gate. `git diff --check` passed for the targeted corrections.

**Remaining blockers and evidence:** concern 05's demonstrated `/etc/environment` token persistence still requires resolution or explicit acceptance of that specific failure; stock shallow-home lineage-guard provisioning still requires a supported resolution. Authorized fresh owning-home/clone and fetched `origin/main`, scoped extensions token and Claude authentication are absent runtime inputs; explicit real-gate authorization is still required. No real gate, Herdr states, prompt-free startup, private fetch/token scope, hooks/supervision, destinations or proxy endpoints were observed. The gate-only Brief cannot satisfy `/implement` destination evidence. Ticket 15 remains conditional on observed need. Ticket 14 stays open, ready-for-human, with all unmet acceptance criteria unticked. Preexisting grill-notes, ticket 07, CONTEXT and security concern 01 changes remain untouched and uncommitted.

The independent reports below are preserved verbatim; their findings describe the reviewed handoff before `107ab27`.

#### `/tmp/qd14-review-Standards.log`

```text
## Standards

No documented-standard violations or applicable baseline smells found in committed diff `43c12bb8fffa90367d138afc639458604e986d94...HEAD` (`bc56722`).

- Ticket 14’s handoff follows the tracker’s append-only `## Comments` convention and retains unchecked acceptance criteria.
- Documentation distinguishes missing prerequisite implementation from pending human evidence, without claiming real gate, hook, endpoint or credential results.
- No runtime code or tests changed; no test duplication or implementation-coupling findings apply.
- Unsupported `runArgs` rejection and retained Features remain intact; ticket 15 stays conditional on observations.

No tests run during this review. Broader regression intentionally not run. No edits or credential probes performed; unrelated working changes were excluded.

**Standards: 0 findings.**
```

#### `/tmp/qd14-review-Design.log`

```text
## Design

**1. Medium — Blanket security-disposition prerequisite adds an unintended policy gate.**  
`quarterdeck/CHECKLIST.md:37–42` requires “human dispositions for security-review concerns 01…03…04…05…07” before proceeding; ticket 14’s new **Exact next steps** repeats this restriction.

The design explicitly retains `features` and describes configuration/Features and shared-Git-store concerns as “security-review concerns 01 and 03, not proven isolation.” Your instruction further requires work to continue under the existing design rather than halt solely for policy decisions. Making every concern’s disposition a prerequisite introduces a stronger operational constraint.

Separate policy-review follow-up from actual execution blockers. Preserve the documented `/etc/environment` contract failure, stock-home provisioning blocker, missing authorized inputs, and permission requirement for the real gate. Keep concerns logged without making all policy decisions mandatory prerequisites for otherwise permitted work.

Otherwise, the documentation preserves module ownership, existing FirstMate/devcontainer/proxy reuse, unsupported-`runArgs` rejection, retained Features, and conditional ticket 15. It correctly distinguishes missing prerequisite implementation from pending real-agent evidence and does not claim acceptance.

Reviewed committed diff `43c12bb...HEAD` (`bc56722`) only. No edits, tests, or credential probes performed.

**Design: 1 finding; worst: unintended blanket policy gate.**
```

#### `/tmp/qd14-review-Spec.log`

```text
## Spec

**1. Blanket security-disposition prerequisite contradicts the requested continuation policy.**  
`quarterdeck/CHECKLIST.md:37–42` and ticket 14’s comment at line 69 require human disposition of *all* listed security concerns before proceeding. Your constraint says security concerns should be “logged for human review and work continue under existing design rather than halt solely for policy decisions.” Separate policy-review concerns from demonstrated implementation failures and actual authorization requirements. Retain the token-persistence and stock-home provisioning blockers without making every outstanding security-policy decision a universal prerequisite.

**Completion assessment:** This commit is a documented handoff, not ticket 14 acceptance. The ticket requires that the Crewmate’s four gate commands “all four pass,” plus observed Herdr states, hook/supervision behavior, destinations and proxy endpoints. All remain explicitly unobserved. In particular, the gate-only Brief does not exercise `/implement`, so even successful execution of that Brief cannot satisfy the requirement to record “which destinations `next build` and `/implement` needed.”

The handoff correctly distinguishes reported prerequisite implementation failures—token persistence and stock-home provisioning—from pending human evidence such as private fetch, permission scope and real Claude behavior. It does not falsely claim acceptance or justify ticket 15 without hook evidence.

Reviewed committed diff `43c12bb...HEAD` (`bc56722`) directly. No edits, tests or credential probes performed.

**Summary: 1 Spec finding; ticket 14 remains incomplete, explicitly acknowledged.**
```
