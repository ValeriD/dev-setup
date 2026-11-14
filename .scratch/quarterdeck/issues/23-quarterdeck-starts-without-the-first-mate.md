# 23: The Quarterdeck can start without the First Mate

**Status:** ready-for-agent
**Model:** Sonnet
**Design slice:** 1 (Quarterdeck up)

## Problem

Ticket 13 must be run by hand "with no agent in the loop", but starting the Quarterdeck always launches the First Mate's Claude through `qd-first-mate` (ticket 13, review closeout). There is no way to bring the Quarterdeck up for manual work or debugging without spending a session and having an agent present next to the tokens.

## Decision

The user decided on 2026-11-14 (grill notes, decision 89): `quarterdeck start` gets an option that brings up the container, the Docker proxy and Herdr, and launches no agent.

## What to build

An option on the host command (a flag or an environment variable; the implementer picks one and documents it in the command's header and the README). With it, the First Mate's home is still seeded so ticket 13's steps can use it, but no Claude is started and no `firstmate` workspace is opened. Without it, behaviour is unchanged.

## Acceptance criteria

- [ ] With the option, start returns once Herdr answers; no `claude` process exists in the container and Herdr has no `firstmate` workspace.
- [ ] With the option, the First Mate's home is seeded exactly as in a normal start.
- [ ] Tokens are still delivered to Herdr panes only, as in ticket 03.
- [ ] Without the option, the existing start tests pass unchanged.
- [ ] A later normal start on the same work root opens the First Mate as usual.
- [ ] `quarterdeck/CHECKLIST.md`'s ticket 13 steps name the option.
- [ ] `npm run test:quarterdeck` passes. The full suite is not run.

## Blocked by

None.

## Comments

### Implementation plan — 2026-11-14

Fixed point: `e1d439ac694ce41094d5de1670346029dd254418`. Extend the existing host start/attach and entrypoint flow with `quarterdeck start --no-first-mate`, reusing ticket 22's common `qd-first-mate --seed-only` setup. Readiness follows completed seeding; later normal start activates the First Mate, including in the same running container. Reuse ladder: extend existing commands (2), shell/Docker/Herdr facilities (4); no new dependency or abstraction. Token delivery and dependency direction remain unchanged. Document the option in the header, README, ticket 13 checklist and current-state architecture.

Validation seam: existing container acceptance file and stub Claude. Reuse default-start and token-delivery coverage; add fresh manual startup, complete home/config/trust, no attachment/Claude/workspace, repeat reuse, later normal activation on the same container and work root, and safe refusal when a First Mate workspace already exists. Run affected Quarterdeck cases, then only the Quarterdeck suite; never the full repository suite.
