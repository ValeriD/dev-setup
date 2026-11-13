# 20: Token delivery mechanism decided

**Status:** ready-for-agent
**Model:** Sonnet
**Design slice:** 1 (Quarterdeck up), credentials

## Decision

This ticket records the user's answer to the blocker in ticket 03 (token delivery) and the confirmation that ticket 08 asked for. Ticket 03 is not edited; whoever implements 03 builds it to this ticket.

1. **Mechanism for ticket 03: a file the user owns, mounted read-only.** This is candidate B in ticket 03. The user keeps one file on the host, owned by their own user, not by root, with mode `0600`, at a path the user chooses. The `quarterdeck` command receives that path (an environment variable or a flag; the implementer picks one and documents it). The file is bind-mounted read-only into the Quarterdeck. A non-root process reads it **by name**: it takes only the names it is asked for, parses `NAME=value` lines without executing anything, and hands the values to Herdr's server so that only processes started from Herdr's panes hold them. A missing file or a missing name is reported by name, never by value.
2. **The same file holds the read-only skills token(s)** for private Agent Extension repositories (ticket 08, decision 44). One file, several names.
3. **Ticket 08's visibility trade-off is accepted for the MVP.** The read-only skills token passed by name into a project container is readable through `docker inspect` of that container on this laptop. The user accepts this until the git proxy (the "Git gate" on the Later list) replaces it. Record this acceptance in the ADR that ticket 08 already requires.
4. **Models.** No change to the tickets as written. The standing rule applies: Opus for tickets about skills, prompts or agent tools, Sonnet for the rest. Decision 48 ("Sonnet for now") applies to the planning Crewmate inside the product, not to building the tickets.

## What to build

Nothing beyond ticket 03 and ticket 08. This ticket only fixes their open choices. It is done when both are implemented to it.

## Acceptance criteria

- [ ] Ticket 03 is implemented with the mechanism in decision 1, and its acceptance criteria hold.
- [ ] No root-owned secrets file, no root process reading a secrets file, no `--env-file`, nothing sourced as shell.
- [ ] The file's path, the names it may hold, and the warning for a missing name are documented where the `quarterdeck` command is documented.
- [ ] Ticket 08's ADR records decision 3, with the Git gate named as the fix.

## Technical context

- **Notes:** `.scratch/quarterdeck/grill-notes.md`, decisions 44 and 47.
- **Spike:** the spike's root-owned `~/.config/spike.env` and the root entrypoint that read it are the approach this ticket rules out.
- **Glossary:** the Named Secret definition in `CONTEXT.md` is not changed by this ticket.

## Blocked by

- 01: Quarterdeck image and the `quarterdeck` host command
