# 31: Herdr shows a working agent as working

**Status:** ready-for-agent
**Model:** Sonnet
**Design slice:** 1 (Quarterdeck up)

## Problem

In task C on 2026-11-17, the user saw Herdr tick agents as done while they were still working. Ticket 15's agent found the cause (`qd-carryover.md`). Herdr 0.7.4's bundled Claude manifest marks an agent as working only when the terminal title starts with a braille spinner. Claude Code 2.1.310 sets its title to `◑ Claude Code` instead. So `herdr agent get` reports `idle` for the whole turn. This was checked without a token, against a fake Messages endpoint, both with and without Docker. The First Mate, the Second Mates and the Crewmates all run the same Claude pin, so every pane is affected. You can see Herdr's rules with `herdr agent explain --file F --agent claude --verbose`.

FirstMate's own busy state (ticket 15's hook) is not affected. Only what Herdr shows is wrong. Even so, the user cannot tell from Herdr which agents need them, and that is the Quarterdeck's main promise: less babysitting.

## Decision

The user decided on 2026-11-18 that Herdr must show a working agent as working. The pins that make this true are chosen in this ticket, based on evidence.

## What to build

Make Herdr's state detection and the Claude Code pin agree, using the first option below that works:

1. Herdr's own way to override or extend an agent manifest, if it has one: a Quarterdeck-shipped manifest that also accepts Claude's current title.
2. A Herdr version whose bundled Claude manifest matches the pinned Claude.
3. A Claude Code pin whose title Herdr 0.7.4 recognises, but only if nothing the Quarterdeck relies on breaks.

Herdr is installed by FirstMate's `fm-install-herdr.sh` at FirstMate's pin. FirstMate is not edited (ADR 0008). If option 2 needs a different Herdr version than FirstMate's script installs, install it in the Quarterdeck image, SHA-256 checked, and record the reason.

## Acceptance criteria

- [ ] While a stub or token-free Claude in a Herdr pane is mid-turn, `herdr agent get` reports it as working. Once the turn ends, it reports idle or done.
- [ ] The same holds for an agent launched into the project container through the launcher (`quarterdeck/bin/claude`), because Herdr watches the pane in the Quarterdeck.
- [ ] Every pin that changes is exact, checked (SHA-256 or digest), and passes `node scripts/check-pins.mjs`. Renovate either covers it or the reason it can't is written down.
- [ ] FirstMate is not edited, and its busy state and Stop-hook behaviour are unchanged.
- [ ] `quarterdeck/CHECKLIST.md` has a row in which the user checks, in a real run, that a working Crewmate shows as working and a finished one does not.
- [ ] `npm run test:quarterdeck` passes, followed by `npm run test:cleanup` with no test containers left. The full suite is not run.

## Technical context

- **Modules:** `quarterdeck/Dockerfile` (the Herdr and Claude pins), and possibly a shipped Herdr manifest or config file under `quarterdeck/`. Tests go in `tests/quarterdeck.test.mjs`.
- **Reuse:** the token-free fake Messages endpoint used by tickets 15 and 27 to drive a real Claude turn.
- **Must not introduce:** a FirstMate patch, a real Claude session that uses the subscription, or a token in any file.
- **Revisit when:** Herdr or Claude Code changes its title or manifest format.

## Blocked by

None.

## Comments
