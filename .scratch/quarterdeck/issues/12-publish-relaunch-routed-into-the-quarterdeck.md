# 12: The publish relaunch runs in the Quarterdeck and FirstMate accepts the pull request

**Status:** ready-for-agent
**Model:** Sonnet
**Design slice:** 6 (Publish relaunch), the token-free half

## What to build

After the last ticket the Second Mate writes a route marker and relaunches the same FirstMate record with the note `Publish.`. The launcher sees the marker and runs the real Claude in the Quarterdeck instead of the project container. That session runs `qd-publish`, appends `done: PR <url>`, and FirstMate's own done gate accepts it because the head is now on origin. Extends ticket 11's stub run through publish to a local bare origin with a stub `gh`.

## Decisions

- Design open question 8 (accepted by the user for the MVP, recorded in ticket 07's ADR): a Crewmate redirecting a worktree's `.git` file is an accepted MVP risk; the publish route's overrides only stop hooks and fsmonitor.

## Acceptance criteria

- [ ] The launcher chooses the publish route only when `<home>/data/<id>/qd-route` exists, with the home taken from `FM_TASK_INBOX`; the marker is deleted when used. The same marker placed in `<home>/state/`, or one that the project container could write, is ignored (the project container cannot write `data/`) (launcher row of the Validation plan).
- [ ] In the publish route the launcher runs the real Claude in the Quarterdeck with `--setting-sources user`, and re-appends `core.hooksPath=/dev/null` and `core.fsmonitor=false` `GIT_CONFIG_*` entries after FirstMate's own entries.
- [ ] The extended stub run: after ticket 2 the test writes the marker and relaunches with `--note "Publish."`; the stub session (in the Quarterdeck) runs `qd-publish`, the branch reaches the local origin, the stub `gh` receives the pull request, and the stub appends `done [at=...]: PR <url>` (SC-08 token-free half).
- [ ] After that, `fm-crew-state.sh` no longer reports the head as unreachable and FirstMate's done gate accepts the line; what FirstMate does with the PR through its normal PR path is recorded in a comment on this file (SC-14).
- [ ] The origin has exactly one commit per ticket after the plan commit, in order, and the PR body lists the tickets (SC-04, SC-08).
- [ ] The failing-ticket run of ticket 11 still publishes nothing.
- [ ] `quarterdeck/CHECKLIST.md` gains a row: with a real Claude in the publish route, do `CLAUDE.md` and worktree skills still load (the design flags this as unverified), and do worktree-written settings not load.

## Technical context

**Design:** `.scratch/quarterdeck/design.md`, "Constraints" (publish route), "Spec Run procedure" step 9, "Resolved items" (push step, blocked-until-pushed).

- **Modules:** `quarterdeck/bin/claude` (marker route), `tests/quarterdeck.test.mjs` (stub run extended), `quarterdeck/bin/qd-publish` (ticket 06).
- **Implementation anchors:** FirstMate `fm-dod-lib.sh` (a `done:` is accepted when HEAD is reachable outside the worktree) and `fm-crew-state.sh`; the existing launcher from ticket 09.
- **Reuse:** one FirstMate record and relaunch, as in ticket 11; `qd-publish` unchanged.
- **Dependency direction:** FirstMate relaunch -> launcher -> (marker) real Claude in the Quarterdeck -> `qd-publish` -> git, gh.
- **Must not introduce:** a separate FirstMate record or worktree for the push, the Second Mate running `qd-publish` itself, a local backup remote, a FirstMate patch.
- **Validation seam:** `tests/quarterdeck.test.mjs`; manual row for `--setting-sources user`.
- **Coverage:** owns the publish half of the stub-Crewmate row; token-free halves of SC-08 and SC-14; the "Launcher" row's marker behaviour.

## Blocked by

- 06: `qd-publish` pushes a branch and opens a pull request without running project hooks
- 11: The ticket loop runs plan, ticket 1, ticket 2 with a stub Crewmate

## Comments

### Implementation handoff — steps 1–5; independent review and closure deferred

Fixed point: `8438101911e7ab0268d89668a627f16cbf69b6bc`. Status and acceptance boxes intentionally remain unchanged for the parent's independent review. Only ticket 12 was implemented.

Sketch followed: extend the existing launcher and launcher/loop fixtures in place (reuse ladder rung 2), reuse unchanged `qd-publish` and real FirstMate/Herdr/Git, and add the manual settings-loading row. No new dependency, lifecycle wrapper, FirstMate patch, product model change, or separate publish record/worktree. Direction remains FirstMate relaunch → launcher → Claude in Quarterdeck → publisher → Git/gh. Architecture index and the linked `quarterdeck/PROJECT-CONTAINERS.md` now describe the implemented route and its limits.

Built and observed:
- Launcher derives home **and record id** from `FM_TASK_INBOX`, consumes `data/<id>/qd-route`, logs `route: publish`, and runs the real Claude path with appended `--setting-sources user`, final hooks/fsmonitor environment overrides, and `HERDR_AGENT=claude`. Without the private marker it retains project routing. The ordinary container fixture ignores state/worktree markers, cannot write the private marker, verifies effective Git settings despite conflicting earlier entries, and returns to project routing after consumption. This does not establish isolation for arbitrary Features/configuration (security-review 01) or shared Git stores (02/03).
- Extended prepared-home loop runs plan → ticket 01 → ticket 02 → `--note 'Publish.'` through the same FirstMate record/worktree. The publish Claude stub calls the unchanged publisher, the local bare origin receives exactly the plan and two ordered ticket commits, one stub `gh pr create` receives the correct base/head and ticket body, and the stub reports `done [at=...]: PR https://github.com/fixture/loop/pull/1`. No real forge call occurs.
- Observed crew-state before publication: `state: blocked · source: status-log · named head <sha> is unreachable outside the worker copy`. After publication: `state: done · source: status-log · PR https://github.com/fixture/loop/pull/1`. This exercises `fm-crew-state.sh` calling `fm_dod_accept_ship_done`; no backup remote or gate bypass was added. The failure loop still ends after two attempts at ticket 01 with origin refs unchanged and no publish session.

FirstMate's normal PR path (source inspection at pinned `427056c4181c41074ad24f051f79919330df0fa5`, distinguished from runtime evidence): `fm-pr-check.sh scan`, called by the watcher check sweep, recognizes a newest ready-shaped `done: PR <url>`. Registration rechecks named-head reachability, records canonical `pr=` and available forge `pr_head=`, refuses a known draft, and arms `fm-pr-poll.sh` merge monitoring. The fixture only observes accepted crew-state; it does **not** run a real watcher registration, forge read, merge poll or landing/teardown. The stub URL is not a real PR. Thus automatic PR tracking remains runtime/human evidence, not an observed consequence claimed by this test.

Validation:
- Targeted launcher fixture red: private marker incorrectly took project Docker route (exit 1 instead of local stub exit 23). Green after implementation: **1 pass**. Logs `/tmp/qd12-route-red.log`, `/tmp/qd12-route-green.log`.
- Targeted success loop red: missing publish behavior caused the replacement stub to die. Fixture correction recognizes the final `Publish.` instruction after FirstMate's Progress-note preamble. A later red reached `done: PR` but Herdr could not recognize the replacement; adding the launcher’s publish `HERDR_AGENT=claude` hint made it green: **1 pass**, log `/tmp/qd12-loop-green.log`. Earlier fixture setup also required stdin installation because the capability-dropped root process cannot read node-private home files; no product permission policy was relaxed.
- Final `npm run test:quarterdeck`: **32 tests, 31 pass, 0 fail, 1 existing TODO**, exit 0; `/tmp/qd12-quarterdeck.log`. Includes success, no-publication failure, launcher, publisher and project-container coverage. Existing TODO still detects the dummy extensions token in `/etc/environment` (ticket 08/security-review 05); it is not proof of token-file absence.
- `node --check tests/quarterdeck.test.mjs`, `node --check tests/fixtures/quarterdeck-crewmate/claude.mjs`, `bash -n quarterdeck/bin/claude`, `git diff --check`: pass. No root typecheck command exists.
- Broader regression coverage intentionally not run: **no `npm test`, `test:skill`, or unrelated suites**. No real Claude, GitHub project push, private fetch, secret inspection or unsafe credential probe was performed.

Remaining blockers and limits; criteria stay unticked:
1. **Missing implementation/provisioning (dependency 11):** stock shallow FirstMate homes fail their repository-lineage guard. This loop retains ticket 11's explicit full-public-history fixture prerequisite and seeded configuration. Passing prepared-home tests do not fix or prove normal shipped startup. Product provisioning remains unresolved outside ticket 12.
2. **Runtime/human evidence:** real Claude's `--setting-sources user` behavior for worktree settings, `CLAUDE.md` and skills is unobserved; the new checklist row is not run. The stub invokes generated Stop hooks itself, so real lifecycle/policy compatibility, autonomous watcher/PR registration and supervision remain unproven. The integration environment itself was available; no Docker runtime blocker prevented these token-free tests.
3. **Credentials:** local-origin/stub-gh publication requires no real credentials and is proven under the stated prerequisites. Real GitHub permissions/clone/push/PR remain ticket 13 evidence; no real credentials were used or validated here. Ticket 08's existing extensions-token persistence blocker remains separate.
4. **Security review:** added distinct ready-for-human concern `06-publish-session-worktree-instruction-trust.md` for project-authored instructions reaching a credential-bearing publish agent. Existing concerns 01–05 remain unresolved; approved unsupported-`runArgs` rejection and retained Features are unchanged. Hooks/fsmonitor overrides are not a general Git/configuration or prompt-injection isolation guarantee.

No review dispatched; ticket/design/spec remain open. Preserved and excluded from staging: existing grill notes, ticket 07, `CONTEXT.md`, and untracked security-review ticket 01.
