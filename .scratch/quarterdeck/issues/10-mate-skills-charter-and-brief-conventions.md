# 10: Mate skills, Charter and Brief conventions

**Status:** ready-for-agent
**Model:** Opus (the ticket is about skills and prompts)
**Design slice:** 4 and 5 (content of the procedure), proof follows in tickets 11, 12, 16, 17, 18

## What to build

The written procedure the mates follow. Two managed skills, `qd-first-mate` and `qd-spec-run`, with the Brief and report references, and the Charter template, all installed in the Quarterdeck image so every Claude there sees them. They state the Spec Run procedure of the design (steps 0 to 10), the Brief conventions and the final report format. Later tickets prove each part by running it and may correct the text; this ticket makes the text exist, complete and checkable.

## Working assumptions and decisions

- DECISION (user): the planning Crewmate runs on Sonnet. Opus is not assigned to it. The Opus rule for tickets about skills, prompts or agent tools (grill decision 19) is unchanged.
- Working assumption, not yet confirmed: design open question 9: the input to the First Mate is the user's decisions as told to it; the grilling skill may be used there but nothing depends on it.
- Pause and resume is deferred (grill decision 43): the procedure only stops and reports. Write no resume path and no question-answering path.
- Ideas are undecided scope: the skills say nothing about Ideas.

## Acceptance criteria

- [ ] `/etc/claude-code/.claude/skills/qd-first-mate/SKILL.md` and `/etc/claude-code/.claude/skills/qd-spec-run/SKILL.md` exist in the image with `name` and `description` frontmatter, plus `qd-spec-run/references/brief.md` and `references/report.md`.
- [ ] `qd-first-mate` covers: registering a project as `direct-PR`, yolo off, through FirstMate's `project-management` skill; making the Second Mate with `FM_SECONDMATE_CHARTER=... fm-brief.sh sm-<project> --secondmate <project>`, `fm-home-seed.sh sm-<project> /home/valeri/work/fleet/sm-<project> <project>` (always an explicit path, never `-`) and `fm-spawn.sh sm-<project> <that path> --secondmate`; the handoff via `FM_HOME=<first mate home> fm-send.sh` with header lines `Spec Run: <slug>`, `Branch prefix: <prefix>`, `Project: <project>` and the grilling decisions verbatim; the prefix is one of `feat/`, `fix/`, `chore/` only; the First Mate never spawns a project Crewmate; it relays `report.md` verbatim.
- [ ] `qd-spec-run` has steps 2 to 10 of the design's table: `qd-project-up`; `fm-brief.sh` with `--mode direct-PR --branch-prefix`; the planning Crewmate (`fm-spawn.sh ... --harness claude --model sonnet`) making exactly one commit and appending `done: plan committed <sha>; <N> tickets`; one `fm-control.sh <slug> relaunch --model <m> --note "Ticket NN: ... Start commit <sha>."` per ticket in number order with the model from the dispatch rule; the check of a ticket (a `done` line naming build, lint and test ok, exactly one new commit since the start commit, clean `git status --porcelain`); one retry with the note `Retry of ticket NN. Save the failed attempt as refs/quarterdeck/failed/NN-1, then reset to <start sha>.`; the stop rule (second failure, `needs-decision`, a dead Crewmate: no further relaunch, no publish); the publish step (write `quarterdeck` to `$S/data/<slug>/qd-route`, then relaunch with `--model sonnet --note "Publish."`); `report.md` and one parent-channel `done [key=<slug>]` line. Every Second Mate command carries `FM_HOME=$S`.
- [ ] `references/brief.md` states the Brief sections of the design: the handoff verbatim under `## Captain's intent`; brief notes (each session does exactly one job named by the latest `## Progress note`; no note means plan; `Ticket NN`, `Retry of ticket NN`, `Publish.`); the gate commands and the one-commit rule; `# Setup` and `# Rules` unchanged; `# Definition of done` keeping the `Delivery contract: mode=direct-PR` and `Ship branch:` lines and replacing the push and PR lines with "commit, run the gate, append `done: ticket NN committed <sha>; ...`; do not push, do not open a PR, except in a `Publish.` session".
- [ ] `references/report.md` holds the design's final report format (at most the seven lines for PR opened, stopped at ticket NN, and stopped on a question), and the skill says the First Mate relays it verbatim.
- [ ] The text says that "blocked: named head ... unreachable" from FirstMate's crew-state is expected between tickets and is neither recovered nor escalated.
- [ ] The Charter template `quarterdeck/fleet/charter.md` names the project, the three gate commands (as fill-in fields), who starts Crewmates (only this Second Mate), and the stop rules; the First Mate fills it into `FM_SECONDMATE_CHARTER`.
- [ ] A structural test in `tests/quarterdeck.test.mjs` checks: the files exist in the image at the paths above; every `fm-*.sh` command the skills name exists in `/opt/firstmate/bin`; the Brief reference contains the required lines; neither skill contains "Helm" or "worker"; no skill text mentions pause, resume, or Ideas.
- [ ] The skills were written following the `writing-for-agents` skill.

## Technical context

**Design:** `.scratch/quarterdeck/design.md`, "Spec Run procedure" (all three tables), "Final report (D42)", "Resolved items". Authority: `grill-notes.md` Round 6 over the design over the spec (the spec's "planning is out of scope" is overridden by decision 39).

- **Modules:** `quarterdeck/skills/qd-first-mate/`, `quarterdeck/skills/qd-spec-run/` (+ `references/`), `quarterdeck/fleet/charter.md`, the Dockerfile copy into `/etc/claude-code/.claude/skills`.
- **Implementation anchors:** FirstMate's `AGENTS.md` section 11 (what Brief edits it allows), `docs/configuration.md`, `fm-brief.sh`, `spike/FINDINGS.md` links 3 and 4 (a Brief edited to "commit only" and made ticket-neutral worked). `CONTEXT.md` glossary: Spec, Spec Run, Brief, Charter, First Mate, Second Mate, Crewmate; "task" is not our word for a ticket or a Spec Run; "Firstmate spec" is called brief notes.
- **Reuse:** FirstMate's own commands only; the project's own `/to-spec`, `/to-design`, `/to-tickets` and `/implement` skills for planning and implementation.
- **Dependency direction:** mate skills -> FirstMate commands -> `claude` launcher; skills never call the launcher or Docker directly.
- **Must not introduce:** an edit to a FirstMate file, a new `fm-*` wrapper, a pause or resume path, Ideas, grilling inside the Quarterdeck, anything from the spec's Out of Scope.
- **Validation seam:** the structural test above. Behavioural proof is the later tickets: 11 (loop, stub), 12 (publish), 16 (planning), 17 (First Mate end to end), 18 (failures).
- **Coverage:** supports SC-03, SC-04, SC-06, SC-09, SC-11, SC-12, SC-13, SC-14 by being the text they run; owns none of them alone.

## Blocked by

- 05: The First Mate's home is seeded and its tab opens on start

## Comments

### Implementation handoff (review and closure deferred)

Fixed point: `84e32ef7a5fa20633663b4a615ac3e63ed4c0758`. Implementation-only scope per user; status and acceptance boxes remain unchanged for independent reviewers. The implementation-model override does not change product dispatch.

Built the two managed skills, Brief/report references and filled-field Charter template; Dockerfile installs them at the required image paths. `ARCHITECTURE.md` now indexes mate-procedure ownership and explicitly separates structural coverage from later runtime proof. No FirstMate source, dispatch config, launcher or project-container policy was changed.

Criteria evidence:

- Image/content/frontmatter and structural checks: new `mate procedures: managed skills, Charter and Brief contract are installed with real FirstMate commands` test in `tests/quarterdeck.test.mjs` reads the built image, checks both skills and references plus `/opt/qd/fleet/charter.md`, and verifies every named `fm-*.sh` is executable in `/opt/firstmate/bin`.
- First Mate procedure: `quarterdeck/skills/qd-first-mate/SKILL.md` steps 0–1 cover registration, explicit-home provisioning, verbatim handoff, prefix selection, sole Second Mate project dispatch and verbatim report relay.
- Second Mate procedure: `quarterdeck/skills/qd-spec-run/SKILL.md` steps 2–10 cover planning on Sonnet, numbered-ticket dispatch by the unchanged Opus/Sonnet rule, gate/commit/clean-tree checks, one preserved retry, terminal stop rules, publish marker/relaunch, and correlated parent report. Commands carry explicit `FM_HOME`. Initial spawn also records typed resolution as off using the pinned FirstMate command required by its configuration contract; it does not enable typed resolution.
- Brief: `references/brief.md` preserves generated Setup/Rules and delivery/branch lines, fills verbatim intent and ticket-neutral brief notes, and replaces intermediate publishing with commit-and-gate completion. Report: `references/report.md` defines the seven-line maximum, including honest unavailable/failed evidence rather than invented success. The Charter names the project, home fields, gate commands, exclusive Crewmate ownership and stop rules. Both Charter and procedure explain expected unreachable-head state.
- Writing method: loaded `writing-for-agents` and `SKILL-MECHANICS.md`; used model-invoked role-specific triggers, ordered steps with completion bounds, and mandatory pointers to the Brief/report references. No forbidden role/scope terms in shipped text (structural assertion).

Validation:

- RED: targeted Quarterdeck test failed on ENOENT for `/etc/claude-code/.claude/skills/qd-first-mate/SKILL.md` before implementation.
- GREEN: `DEV_SETUP_TEST_SKIP_BUILD=1 node --test --test-global-setup=tests/global-setup.mjs --test-timeout=900000 --test-name-pattern='mate procedures:' tests/quarterdeck.test.mjs` — 1 pass, 0 failures.
- End-of-implementation: `npm run test:quarterdeck` — 29 pass, 0 failures, 1 existing TODO (30 tests). The TODO reproduces ticket 08's known dummy extensions-token persistence in `/etc/environment`, already tracked by `.scratch/quarterdeck-security-review/issues/05-devcontainer-cli-persists-extensions-token.md`. No real credentials were used. Local command logs: `/tmp/qd10-red.log`, `/tmp/qd10-green.log`, `/tmp/qd10-quarterdeck.log` (not committed).
- Broader regression intentionally not run: no `npm test`, `test:skill`, or unrelated suites. No separate typecheck script exists in the root manifest; changes are Markdown, Dockerfile copy wiring and the exercised JavaScript test.

Dependencies/limits: ticket 05 implementation is present and marked done; its real-Claude SC-02/SC-10 evidence remains human work, not missing prerequisite code. No blocker to this ticket's structural/content slice was observed. Publish routing is still missing implementation owned by ticket 12; loop, planning, First Mate end-to-end and failure behavior remain proof for 11/16/17/18. No live agent or real GitHub run was performed, and these documents do not establish behavioral guarantees. Existing security concern 05 was reproduced, not a new distinct concern. Review was not dispatched and this ticket was not closed, as requested.
