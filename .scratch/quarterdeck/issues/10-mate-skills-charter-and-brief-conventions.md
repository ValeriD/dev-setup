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
