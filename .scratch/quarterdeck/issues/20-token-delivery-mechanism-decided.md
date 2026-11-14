# 20: Token delivery mechanism decided

**Status:** ready-for-human
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

- [x] Ticket 03 is implemented with the mechanism in decision 1, and its acceptance criteria hold.
- [x] No root-owned secrets file, no root process reading a secrets file, no `--env-file`, nothing sourced as shell.
- [x] The file's path, the names it may hold, and the warning for a missing name are documented where the `quarterdeck` command is documented.
- [ ] Ticket 08's ADR records decision 3, with the Git gate named as the fix.

## Technical context

- **Notes:** `.scratch/quarterdeck/grill-notes.md`, decisions 44 and 47.
- **Spike:** the spike's root-owned `~/.config/spike.env` and the root entrypoint that read it are the approach this ticket rules out.
- **Glossary:** the Named Secret definition in `CONTEXT.md` is not changed by this ticket.

## Blocked by

- 01: Quarterdeck image and the `quarterdeck` host command

## Comments

2026-11-13: Ticket 03 is done to decision 1. Ticked: ticket 03 implemented; no root-owned secrets file, root reader, `--env-file` or sourcing; the path, names and missing-name warning are documented in the `quarterdeck` header and `README.md`. Still open: the ADR criterion (decision 3), which belongs to ticket 08. Ticket 20 stays open until 08 is done.

### Implementation handoff at 8f61970 — review and closure deferred

Fixed point: `8f61970e79d34e172c5cdc3053b3a40384a18ca8`. Read tickets 01, 03 and 08, the spec, design capsule and credential/project-container sections, decisions 44/47/48, and the implementation anchors. The historical comment above predates ticket 08's implementation: [ADR 0010](../../../docs/adr/0010-read-only-agent-extensions-token.md) now explicitly records decision 3 and names the Git gate as its replacement. No duplicate ADR or credential implementation is needed.

**Pre-change sketch:** reuse the existing host path-only mount, non-root `qd-server` parser, manifest names, Base secret warning/helper, and `qd-project-up` creation-only transport unchanged (reuse ladder rung 1: no new code needed for the recorded choice). Update this ticket's evidence/handoff only. No abstraction, dependency direction, interface or architecture change. Reuse `tests/quarterdeck.test.mjs` for SC-19 and ticket 08's SC-16 exception; real private-source startup and permission checks remain manual. No other implementation ticket begins.

**Validation:** ran only `npm run test:quarterdeck`: **31 passed, 0 ordinary failures, 1 failing TODO**, 32 tests total. The retained dummy-token assertion again found `/etc/environment` (path only); exit success is not full acceptance. Quarterdeck-side Herdr inheritance, plain-exec absence, inspect/history checks, missing-file handling and the extensions transport fixture passed. No real credentials or private permission probes were used. Broader regression intentionally not run. Existing test coverage was reused; no new behavior was introduced requiring a red-green cycle.

**Remaining work, distinguished by kind:**

- **Missing implementation-contract compliance:** ticket 08's no-file requirement remains violated by the pinned devcontainer CLI's `/etc/environment` persistence. Existing [security concern 05](../../quarterdeck-security-review/issues/05-devcontainer-cli-persists-extensions-token.md), `ready-for-human`, owns this exact concern; no duplicate is created. A supported prevention mechanism or explicit human narrowing is still required. Accepted inspect visibility is not acceptance of disk persistence. No marker workaround, after-the-fact deletion, or invented isolation guarantee was added.
- **Missing human evidence:** ticket 08 still lacks actual private Project-layer installation, absent-token private-source failure, and verification that the supplied token can read only `ValeriD/skills` and cannot push. Follow `quarterdeck/CHECKLIST.md` and `quarterdeck/PROJECT-CONTAINERS.md` after concern 05 is resolved or explicitly accepted: provision the restricted token outside the repository, restart Herdr to reload it, recreate only the label-verified project container, and record only statuses/denial categories and value-free installer diagnostics. Do not record raw environment, inspect, or credential-helper output. No real token is required to establish the existing dummy transport evidence.
- **Historical dependency note:** ticket 08's older comments say the ticket 09 launcher was absent. It exists at this fixed point; that historical absence is no longer a missing implementation. This ticket does not reopen or implement ticket 09, nor claim its real-agent/manual evidence complete.
- **Existing security limits:** concerns 01 (config/Feature trust), 03 (shared Git store), 04 (permission provisioning) and 05 remain separately tracked. No new distinct concern was identified. Unsupported `runArgs` rejection and retained Features are unchanged; no product dispatch/model change.

**Review handoff:** parent to dispatch fresh independent reviewers against the fixed point above, with this ticket, `.scratch/quarterdeck/spec.md`, `.scratch/quarterdeck/design.md`, tickets 03/08 and ADR 0010 as references. Historical ticket 08 reports are [implementation review](../reviews/08-independent-review.md) and [revalidation review](../reviews/08-revalidation-review.md); neither is a fresh review of this handoff. No independent review or final closure performed here. Acceptance checkboxes are deliberately unchanged for the parent's review, including the now-present ADR criterion. Ticket 20 remains open because ticket 08 is not complete; status is `ready-for-human` for its outstanding decision/evidence.

Only this ticket's documentation is committed, with its path in the commit message. Existing edits to `grill-notes.md`, ticket 07 and `CONTEXT.md`, and untracked security concern 01 are preserved and excluded.
