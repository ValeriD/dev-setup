# 27: The mates read the Quarterdeck's skill files without a permission prompt

**Status:** ready-for-agent
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
- [ ] Writing to that folder is still refused or still asks. No new read access is granted outside the managed skills folder, nothing is granted in a project container, and nothing like `bypassPermissions` is turned on.
- [ ] `quarterdeck/claude-policy.json` keeps its existing keys (`disableSkillShellExecution`, `disableSideloadFlags`, `disableCommandPluginSources`, `DISABLE_AUTOUPDATER`).
- [ ] `npm run test:quarterdeck` passes, followed by `npm run test:cleanup` with no test containers left. The full suite is not run.

## Technical context

- **Modules:** `quarterdeck/claude-policy.json`, where the Quarterdeck image installs it, and its tests in `tests/quarterdeck.test.mjs`.
- **Must not introduce:** a copy of the skills into each home, a change to FirstMate, or a change to Base's or the Variant's policy.
- **Validation seam:** Claude's managed settings inside the Quarterdeck image. The real prompt is checked in the user's task C re-run.

## Blocked by

None.

## Comments
