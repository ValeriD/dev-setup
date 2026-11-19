# 31: Herdr shows a working agent as working

**Status:** done
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

- [x] While a stub or token-free Claude in a Herdr pane is mid-turn, `herdr agent get` reports it as working. Once the turn ends, it reports idle or done.
- [x] The same holds for an agent launched into the project container through the launcher (`quarterdeck/bin/claude`), because Herdr watches the pane in the Quarterdeck.
- [x] Every pin that changes is exact, checked (SHA-256 or digest), and passes `node scripts/check-pins.mjs`. Renovate either covers it or the reason it can't is written down.
- [x] FirstMate is not edited, and its busy state and Stop-hook behaviour are unchanged.
- [x] `quarterdeck/CHECKLIST.md` has a row in which the user checks, in a real run, that a working Crewmate shows as working and a finished one does not.
- [x] `npm run test:quarterdeck` passes, followed by `npm run test:cleanup` with no test containers left. The full suite is not run.

## Technical context

- **Modules:** `quarterdeck/Dockerfile` (the Herdr and Claude pins), and possibly a shipped Herdr manifest or config file under `quarterdeck/`. Tests go in `tests/quarterdeck.test.mjs`.
- **Reuse:** the token-free fake Messages endpoint used by tickets 15 and 27 to drive a real Claude turn.
- **Must not introduce:** a FirstMate patch, a real Claude session that uses the subscription, or a token in any file.
- **Revisit when:** Herdr or Claude Code changes its title or manifest format.

## Blocked by

None.

## Comments

### Resolution

Option 1 worked, so options 2 and 3 were not needed. Herdr 0.7.4 reads local overrides from `~/.config/herdr/agent-detection/<agent>.toml` and they win over the bundled and cached remote manifests. The image ships `quarterdeck/herdr/claude.toml`, which is Herdr's own upstream manifest 2026.10.11.1 (`https://herdr.dev/agent-detection/claude.toml`, SHA-256 e8b816a7...aa1920), unchanged. Its working-title rule already includes the half-circle spinner (U+25D0-25D3) that Claude Code 2.1.310 uses. The Dockerfile checks the SHA-256 at build, and the file is root-owned. Herdr and Claude pins are unchanged, and FirstMate is not edited.

Evidence: with the override, a real Claude 2.1.310 turn against a fake Messages endpoint reads `working` for the whole turn and `idle` after. Bundled 0.7.4 reads `idle` all turn (`herdr agent explain --file`).

Tests (`tests/quarterdeck.test.mjs`): the shipped file matches the Dockerfile digest and the image; a real Claude turn in a pane goes working then idle; a stub through `quarterdeck/bin/claude` into the project container (half-circle title spinner) does the same. `npm run test:quarterdeck`: 45 of 45 pass. After the review fix, the digest test and the image build were re-run (2 pass). `npm run test:cleanup` ran; no test containers left. `node scripts/check-pins.mjs` ok; `tests/pins.test.mjs` and `tests/renovate.test.mjs` 16 pass.

Not covered: Renovate cannot track the manifest (a floating URL, not a versioned release), so drift is caught by the real-Claude test and the CHECKLIST row. The override shadows later Herdr manifest updates for Claude. A real Crewmate run is the new CHECKLIST row. The stale "needs its own ticket" text in the ticket 15 row is left.

Review findings:
- ARCHITECTURE.md lacked the override: **Fixed** (row added).
- A regex-literal assertion on the upstream file duplicated the digest pin: **Fixed** (removed).
- Repeated `docker exec herdr` prefix in the new tests: **Declined**, minor.
- Launcher test skipped in the extensions-token fixture and leaves its stub installed: **Declined**, same as the neighbouring tests; the fixture is torn down.
- Full manifest instead of a minimal override: **Declined**, merge semantics of overrides are undocumented; the full file is proven by the test.
- Root-owned override, "a pane cannot rewrite it": **Declined**, cheap hardening, kept.
