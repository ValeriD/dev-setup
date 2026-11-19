# 27: The mates read the Quarterdeck's skill files without a permission prompt

**Status:** ready-for-human
**Model:** Opus
**Design slice:** 5 (Mate skills)

## Problem

In task C on 2026-11-17, pomoplan's Second Mate stopped at a Claude permission prompt to read `qd-spec-run/references/`. The Quarterdeck installs its mate skills as managed skills in `/etc/claude-code/.claude/skills/` (`qd-first-mate`, `qd-spec-run`). That folder is outside every mate's working folder (`<work root>/fleet/<home>`), so Claude in auto mode asks before reading a skill's `references/` files. A prompt breaks SC-03 and SC-10: the run is not unattended. The First Mate reads its skill's files the same way.

## Decision

Decision 99 (`grill-notes.md`): the mates read the Quarterdeck's own skill files without a prompt. Read only: no write, no execute.

## What to build

A Claude session in the Quarterdeck may read every file under the Quarterdeck's managed skills folder without asking. Prefer the Quarterdeck's own managed policy, `quarterdeck/claude-policy.json`, for example a read-only directory or a `Read(...)` allow rule for that folder, if Claude supports it there. Otherwise use the narrowest other place the Quarterdeck owns. FirstMate's per-home settings are written by FirstMate and must not be edited (ADR 0008).

## Acceptance criteria

- [ ] In a Quarterdeck session started in a mate home, reading `/etc/claude-code/.claude/skills/qd-spec-run/references/brief.md` causes no permission prompt. A token-free check of Claude's effective settings or permission rules shows this, and the user's re-run of task C confirms it.
- [x] Writing to that folder is still refused or still asks. No new read access is granted outside the managed skills folder, nothing is granted in a project container, and nothing like `bypassPermissions` is turned on.
- [x] `quarterdeck/claude-policy.json` keeps its existing keys (`disableSkillShellExecution`, `disableSideloadFlags`, `disableCommandPluginSources`, `DISABLE_AUTOUPDATER`).
- [x] `npm run test:quarterdeck` passes, followed by `npm run test:cleanup` with no test containers left. The full suite is not run.

## Technical context

- **Modules:** `quarterdeck/claude-policy.json`, where the Quarterdeck image installs it, and its tests in `tests/quarterdeck.test.mjs`.
- **Must not introduce:** a copy of the skills into each home, a change to FirstMate, or a change to Base's or the Variant's policy.
- **Validation seam:** Claude's managed settings inside the Quarterdeck image. The real prompt is checked in the user's task C re-run.

## Blocked by

None.

## Comments

### Resolution — 2026-11-17

**Built.** `quarterdeck/claude-policy.json` gains one key, `"permissions": {"allow": ["Read(//etc/claude-code/.claude/skills/**)"]}` (`//` is Claude's absolute-path form). The installer merges it into `/etc/claude-code/managed-settings.json` unchanged. Base's and the Variant's policy, FirstMate and the homes are untouched, so nothing is granted in a project container. No `additionalDirectories` (that would make the folder a working directory, which also lets edits through in acceptEdits mode) and no `defaultMode`. The existing keys stay. Also: a new `CHECKLIST.md` row for the task C re-run, one line in `docs/architecture/quarterdeck.md`, and the test fixture `tests/fixtures/claude-mock-server.mjs`.

**What I verified, token-free.** The new test runs the image's real Claude Code (2.1.310) inside a test Quarterdeck. It talks to a fake Messages endpoint with a dummy API key: the fake asks for one tool call and records the tool result Claude returns, so the result is Claude's own permission decision, with no login and no model.
- With the rule, these run without asking: `Read` of `qd-spec-run/references/brief.md`, plus `cat` of it and `ls` of the skills folder in `--permission-mode auto` (the mates' mode).
- Still refused with "requested permissions": `Read` of `/opt/qd/fleet/charter.md`, `Write` into the folder, and `touch` into the folder. A `Write` in auto mode is refused too, and no file appears.
- Red run: without the rule, the same `Read` came back "Claude requested permissions to read from /etc/claude-code/.claude/skills/qd-spec-run/references/brief.md".
- On the host's Claude 2.1.325 I checked the same rule through `--settings`. Without it, `cat` and `ls` outside the working folder need permission, and auto mode sends them to the classifier. That is the likely source of the prompt in task C. In auto mode the `Read` tool itself was allowed without the rule on 2.1.325. The rule covers both paths.

**Why the ticket stays open.** The first criterion is unticked: its token-free half is met (above), but it also requires the user's re-run of task C, which has not happened. Status is `ready-for-human`. Set it to `done` and tick the box once the re-run shows no prompt.

**Only the user's re-run of task C can confirm** that no prompt appears in an interactive auto-mode session. The fake endpoint cannot reach auto mode's classifier, so the test refuses rather than prompts there. The managed settings are also loaded from the real `/etc/claude-code` path only in the real image session. See the `CHECKLIST.md` row "Ticket 27 / decision 99". Before that re-run, rebuild the image (`quarterdeck stop`, then remove or rebuild `dev-setup-quarterdeck:local`). The live container still has the old policy.

**Tests.** `npm run test:quarterdeck`: 40/40 pass, before the review fixes. After the fixes I re-ran only the test, using the pattern `builds the image|policy keeps|managed skills without a prompt`: 3/3 pass. `npm run test:cleanup` left nothing behind. The full suite was not run.

**Review findings and dispositions.**
- Spec, a: the test starts Claude in a temporary folder, not `<work root>/fleet/<home>`. **Declined.** The rule is an absolute path, so the folder Claude starts in does not change the decision, and a fleet folder would add teardown risk.
- Spec, a and Design, 2: the write refusals were checked only in default mode. **Fixed.** Added a `Write` in auto mode.
- Spec, a: `Edit` and `NotebookEdit` are not probed. **Declined.** Only `Read(...)` is allowed. `Write` and `touch` show that edits still ask, and the folder is root-owned.
- Design, 1 and Standards, a: the docs do not mention the new test seam. **Fixed** in `docs/architecture/quarterdeck.md`.
- Standards, b: unclear names in the fixture (`log`, `main`, `ev`) and a whitespace-only line. **Fixed.**
- Standards, b: the helper's exit code hid Claude failures, and a fixed `sleep 1` raced the server start. **Fixed.** The helper now exits 1 with stderr when there is no result, and it waits for a ready file.
- Standards, c: the exact `permissions` assertion is a change-detector. **Declined.** It is the only check that no other allow rule, directory or mode was added, and it now carries a comment saying so.
- Standards, c: the `ls` probe was in default mode while the comment said auto. **Fixed.** It now runs in auto mode.
- Standards, c: name the Claude version in the fixture. **Fixed.**
- Spec, b: the fixture goes beyond a check of the settings alone. **Declined.** It checks Claude's real decision, and it follows the pattern of `codex-mock-server.mjs`.

