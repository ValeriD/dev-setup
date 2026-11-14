# 18: A failing ticket is retried once then stops; a question stops the run

**Status:** ready-for-human
**Model:** Opus (the stop rules and report text are skill content)
**Design slice:** 8 (Failure paths)

## Note on private extension sources

This requires ticket 17's real run on pomoplan, which uses the read-only `ValeriD/skills` token from ticket 08. The delivery choice is decided, but ticket 17's run and real private-source validation remain unperformed; see the dependency evidence below.

## What to build

Two real runs that end in a stop, and the report for each. Pause and resume is deferred (grill decision 43): the run only stops and reports. Nothing here builds a way to answer a question and carry on.

## Acceptance criteria

- [ ] A Spec with a ticket built to fail (its tests cannot pass): the Crewmate fails, the Second Mate starts exactly one fresh Crewmate for the same ticket, that one also fails, and the run stops. No later ticket starts, nothing is pushed, no pull request exists (SC-11, SC-13).
- [ ] The report names the failed ticket, shows what was tried twice (`failed twice: <reason 1>; <reason 2>`), and says the branch is local only with the sha it is at; commits so far stay in place (SC-11, SC-13).
- [ ] The failed first attempt is saved as `refs/quarterdeck/failed/NN-1` and the retry started from the start commit.
- [ ] A Spec with a ticket that needs a decision the Spec and design do not make: the Crewmate writes `needs-decision`, the Second Mate does not pick an answer and does not start the next ticket, and the report states the question in its `Question:` line (SC-12).
- [ ] In both runs the user answered nothing and pressed nothing before the report; the attention mark appeared on the First Mate's tab (SC-09, SC-10).
- [ ] A Crewmate that dies mid-ticket also ends the run with a report and no publish (the design's step 8 stop rule).
- [ ] Skill corrections made during the runs are listed in a comment on this file.

## Technical context

**Design:** `.scratch/quarterdeck/design.md`, "Spec Run procedure" step 8, "Final report (D42)", "Build order" slice 8. `grill-notes.md` decisions 28, 42, 43.

- **Modules touched:** `qd-spec-run` text and `references/report.md`; possibly the Charter.
- **Must not introduce:** pause and resume, a question-answering channel, a second retry, skipping ahead, a guessed answer.
- **Validation seam:** real Claude, real pomoplan (or a throwaway branch of it); manual rows SC-11, SC-12, SC-13 in `quarterdeck/CHECKLIST.md`. The token-free halves of SC-11 and SC-13 are already covered by ticket 11.
- **Coverage:** owns the real-agent halves of SC-11, SC-12 and SC-13.

## Blocked by

- 17: One sentence to the First Mate runs a Spec Run to a pull request and a report

## Comments

### Implementation handoff — real failure-path validation blocked

Fixed point and starting HEAD: `4b79f5955bb6b40b9f7b9bef73aab2922b2a0481`. Read the implement skill, tracker/triage instructions, spec, full design, decisions 28/42/43, architecture, checklist, dependency 17 and its dependencies 12/13/16/conditional 15, plus 11/14 and the shipped Spec Run skill, Brief, report and Charter. No live run occurred.

**Pre-change sketch:** reuse the existing First Mate → Second Mate → FirstMate spawn/relaunch → launcher flow unchanged (reuse rung 1). Extend only this ticket with precise blockers and future validation instructions (rung 2). Steps 7–8 already require current-session evidence, one retry from the original start, and immediate question/death stops; the Brief already preserves failed tracked/untracked work safely before reset; the report already requires actual HEAD/push state and both failure reasons. No missing runtime component is established by absent manual evidence. No new abstraction, dependency, interface or ownership change; architecture reconciliation and a new behavior/TDD cycle are not applicable. Existing structural and prepared-home failure-loop tests are the regression seam, not proof of an autonomous real mate. The future cases below cover SC-11/13, SC-12, SC-09/10 and the death criterion. No placeholder implementation or speculative skill correction was added.

**Dependencies: implementation versus pending evidence**

- **Direct prerequisite 17 remains open**, with every real-run criterion unchecked. Its successful unattended pomoplan run must precede this slice; a stub or direct human-controlled retry cannot substitute. Its statements about earlier runs are not proof those runs happened.
- **Actual upstream implementation/provisioning gaps:** ticket 11 records stock shallow-home dispatch failing FirstMate's lineage guard. Full-history fixture preparation is not a supported shipped fix. Ticket 08, as documented in 14/16/17, records the CLI persisting the extensions token in `/etc/environment` (security-review 05); accepted inspect visibility does not accept disk persistence. Resolve provisioning without bypassing the guard; resolve persistence or obtain explicit acceptance of that specific failure before real-token validation. Neither is repaired under ticket 18.
- **Pending manual evidence:** 12 has private-marker/local-origin publish implementation, not real Claude loading or autonomous watcher proof. 13 still requires the human-only throwaway GitHub flow, an approved agent-free startup procedure, and resolution or explicit requirement disposition of security-review 07's outside-exec secret-mount readability. 14/16 still need real main-based startup, private skills, prompt-free gate/hooks and planning evidence. These remain ticket 17 prerequisites, not new implementations to fabricate here.
- **Mandatory conditional prerequisite 15:** ticket 14 has no actual busy/turn-end hook or supervision result. Neither implementing the extension nor declaring it unnecessary is justified. Obtain the actual result and follow ticket 15's conditional branch before claiming downstream supervision is proven. Do not relax hardened policy or patch FirstMate.
- **Operational inputs/authorization:** the future run needs an authorized fresh owning home/clone and fetched pomoplan main, supported Claude/scoped-token provisioning, committer identity, approved disposable failure/decision fixtures and permission to execute their real project gate. This session allows Quarterdeck tests only, not pomoplan tests or implementation. No credentials were read or probed; no claim is made about whether credentials exist elsewhere. Prior tickets' local runtime/ref observations are historical, not freshly reproduced here.
- Existing numbered security concerns remain human follow-up, not a blanket gate on otherwise authorized independent work. No new distinct concern was identified or duplicated. Preserve unsupported `runArgs` rejection, retained Features and current Claude Opus/Sonnet dispatch; no general isolation guarantee follows from these tests.

**Safe future validation — not executed or authorized by this handoff**

First complete the prerequisite procedures in `quarterdeck/CHECKLIST.md` (tickets 13–17), including the conditional hook decision above. Use fresh, unique slugs and authorized disposable pomoplan branches/worktrees, never the developer checkout. Record code/image/FirstMate/Claude revisions, main/base SHA, owning home and branch/PR inventory before starting. Provision credentials outside measurement through the supported mechanism; keep tracing/debugging off. Never capture token files, raw environment/inspect output, credential-helper output or credential-bearing logs. Verify permissions privately in provider settings, not by probing credentials against other repositories.

Use normal real First Mate handoff and autonomous Second Mate supervision; do not manually drive spawns/relaunches or append status lines. Agree the fixture content before measurement. A question must arise in an implementation ticket: a planning-stage question alone proves only ticket 16's precursor. If planning stops early, record that result and leave the ticket-level criterion unproven rather than steering the same run past it. For both primary cases, observe from startup through the report with no further message, approval, trust response, login or key press. Any required intervention is failed unattended evidence, not something to hide with a rerun.

| Case | Approved fixture and observations | Required evidence |
|---|---|---|
| SC-11/13: two failures | Include a small earlier successful ticket, a deliberately unsatisfiable test requirement whose test/contract may not be weakened, and a later sentinel ticket. Keep failure local and deterministic: no credential, network, destructive or resource-exhaustion failure injection. Record the failing ticket's original start SHA before its first session. | Exactly two fresh sessions for that ticket, same worktree/model and original start; two observed failure reasons; no later ticket or publish session. Verify `refs/quarterdeck/failed/NN-1` resolves to the first attempt, including its safe snapshot if needed, and retry reset precedes new work. Retain earlier successful commits and final failed work; do not reset or tear down after the stop. |
| SC-12: unanswered decision | Use a separate Spec with an implementation ticket whose necessary product choice is explicitly unresolved, followed by a sentinel ticket. Neither Spec nor design nor handoff supplies an answer. | Current-session `needs-decision` and actual question; no guessed answer, retry, later ticket or publish. Report says `stopped: question` and has the exact question in `Question:`. Preserve commits already made. If only planning asks, this case remains unproven. |
| Step 8: dead Crewmate | Separate disposable run, with an explicitly human-approved, process-scoped fault-injection procedure. Identify the exact active ticket session and owning container before terminating only that Crewmate; never kill a shared container or use broad process matching. If safe targeting is unavailable, leave this case blocked. | Record injection time/target and observed death, no fabricated `failed` status. Normal supervision must stop without retry, later ticket or publish and deliver a report naming the actual death, not `failed twice`. This deliberate intervention is separate from the two unattended cases and cannot count as SC-10 proof. |

For each case, retain sanitized timestamped launch/session/model/route records and status/parent-channel events. Observe through final report delivery and the next normal supervision check; record the observation interval so “no later session” has an explicit bound. Read branch/ref/ancestry and status through the existing owning-home Git checks with `FM_HOME="$S"`; never source worktree/state content. Compare before/after branch and PR inventory in the authorized GitHub UI after measurement: absent remote-tracking refs alone do not prove nothing was pushed. If remote state cannot be verified, record `push state unverified` and leave local-only/no-PR acceptance unchecked.

Compare `$S/data/<slug>/report.md` against actual HEAD and the First Mate's verbatim relay. For the double failure require the failed ticket title and `failed twice: <reason 1>; <reason 2>`, branch `local only` with its actual SHA, preserved earlier commits and truthful gate results (not a copied earlier green gate). For both primary cases require exactly one correlated final pointer, report without any answer/input after the initial instruction, and the observed attention mark on the First Mate tab. Record report/start timestamps, intervention count, plan/earlier/start/failed-ref/final SHAs, gate outcomes, remote checks and attention/supervision observations. Missing evidence remains unchecked. Do not answer and resume, add a second retry, skip ahead or publish to clear FirstMate's expected unpublished-head blocked state.

Append actual results here and link them from the checklist when performed. List each skill/Brief/report/Charter correction supported by the run; **corrections in this session: none, because no live run occurred**. Instructions alone do not satisfy any of the seven acceptance criteria, all of which remain unchecked.

**Validation and scope:** documentation-only change; no runtime tests or live probes run. Existing structural and prepared-home retry coverage was inspected, not rerun or claimed as new evidence. `git diff --check` is the whitespace validation for this change. Broader regression coverage intentionally not run: full acceptance suite, `npm test`, `test:skill`, installer/unrelated suites and pomoplan gate. No real Claude, GitHub operation, secret probe or death injection was performed.

Only ticket 18 is changed and committed with its path reference. Preexisting grill notes, ticket 07, `CONTEXT.md` and untracked security-review 01 are preserved outside this work. No other ticket was started, no reviewer dispatched and no review performed; parent owns fresh independent review and any closure. Ticket remains open, **ready-for-human**.
