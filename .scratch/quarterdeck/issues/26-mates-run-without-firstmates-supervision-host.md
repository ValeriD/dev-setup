# 26: The mates run without FirstMate's supervision host, which cannot log in

**Status:** ready-for-agent
**Model:** Sonnet
**Design slice:** 1 (Quarterdeck up)

## Problem

During task C on 2026-11-17, the First Mate reported that "the background helper that normally handles these routine notifications keeps failing". The helper is FirstMate's supervision host, `bin/fm-supervision-host.sh`. A Claude primary starts it from its Stop hook, and it runs short `claude -p` turns to handle wakes. Each turn failed at once (`state/.supervision-host.log`: `rc=1 ... output=0`, then `latch errors=2 cooldown=300s`). Every wake went to the main session instead (`to-main`).

The cause: the host process has no `CLAUDE_CODE_OAUTH_TOKEN`. The Quarterdeck delivers the Claude token as a Herdr pane variable only (ticket 03, ticket 20 decision 1). The host is started from a Claude hook, and its environment lacks the token: its variable names were checked in `/proc/<pid>/environ` for both the First Mate and `sm-pomoplan`. A token-free `claude -p` answers `Not logged in`. The same happens in every Second Mate home.

Nothing is lost: FirstMate's fallback hands each wake to the main session. But the mates show more chatter, and each failed turn costs time.

## Decision

Recommended, to confirm with the user: turn the supervision host off in Quarterdeck homes using FirstMate's own switch, `config/supervision-host-off` (FirstMate `docs/configuration.md`, "Supervision host"). Wakes are then handled by the Stop-hook auto-arm in the main session, which is FirstMate's normal path. The token delivery rule is not changed: no token goes into a file or into hook environments.

## What to build

The Quarterdeck ships `config/supervision-host-off` for the First Mate's home, and every Second Mate home the First Mate seeds gets it as well.

## Acceptance criteria

- [ ] `quarterdeck/fleet/config/supervision-host-off` exists and is copied into the First Mate's home `config/` on start, only if absent, like the other shipped config files.
- [ ] A Second Mate home seeded by the First Mate (`fm-home-seed.sh`) has `config/supervision-host-off`. Use FirstMate's config inheritance if it covers this file; otherwise, add a seeding step to `qd-first-mate`'s step 0. Either way, FirstMate itself is not edited (ADR 0008).
- [ ] With the file present, `fm_supervision_host_enabled` reports the host as off for that home. A stub-Claude test shows no `fm-supervision-host.sh` process after a Stop hook runs.
- [ ] Token delivery is unchanged: the Claude token reaches Herdr panes only.
- [ ] `quarterdeck/CHECKLIST.md`'s ticket 17 SC-14 row notes that away supervision runs through the Stop-hook auto-arm, not the supervision host.
- [ ] `npm run test:quarterdeck` passes, followed by `npm run test:cleanup` with no test containers left. The full suite is not run.

## Technical context

- **Modules:** `quarterdeck/fleet/config/`, `quarterdeck/bin/qd-first-mate`, possibly `quarterdeck/skills/qd-first-mate/SKILL.md` step 0.
- **Must not introduce:** the Claude token in a file, in the image or in a hook environment, or any FirstMate patch.
- **Revisit when:** the Quarterdeck gets a credential the host can use without breaking ticket 20's rule. That is the Git gate or later.

## Blocked by

None.

## Comments
