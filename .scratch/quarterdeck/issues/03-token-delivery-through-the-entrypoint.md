# 03: Tokens reach only the processes that need them, by name

**Status:** ready-for-agent
**Model:** Sonnet
**Design slice:** 1 (Quarterdeck up), credentials

## Blocker: the mechanism needs the user's confirmation

The spike delivered the tokens from a root-owned 0600 file read by a root entrypoint. The user has said that was not intended and will fix it, and that the design must not depend on a root-owned file or on a root entrypoint reading it. The design's "Credentials" section was written around that file, so its mechanism is withdrawn. Nothing replaces it yet. Do not start until the user confirms how the values reach the Quarterdeck. Candidates, none chosen:

- A: the host command passes host environment variables by name (the existing Named Secret meaning in `CONTEXT.md`) into Herdr's server only, so no file is involved.
- B: a file the user owns (not root-owned), bind-mounted read-only and parsed by name by a non-root process.
- C: something the user has in mind (the user said they will fix it).

A new ticket records the decision; this file is not edited. No glossary change is part of this work (the user ruled it out).

## What to build

Whatever the mechanism, the requirement is fixed: the Claude token and the GitHub token for the project repository reach the Quarterdeck so that the processes started from Herdr's panes (the First Mate, Second Mates, Crewmates running in the Quarterdeck, `gh`, git) have them by name. A plain `docker exec` shell does not. Neither an image, a repository, `docker inspect`, nor a file on disk in the container shows a value. A missing name produces a warning by name.

## Acceptance criteria (mechanism-independent)

- [ ] A process in a Herdr pane has `CLAUDE_CODE_OAUTH_TOKEN` and the GitHub token for the project repository (as `GH_TOKEN` and `DEV_SETUP_GITHUB_PAT`, which Base's credential helper reads); a `docker exec` shell does not; compared by hash of dummy values (SC-19).
- [ ] `docker inspect` of the Quarterdeck container, and `docker history` of the image, show no value (SC-19).
- [ ] No token is written to disk in the container: no `gh auth setup-git`, no `hosts.yml`; `git` for `github.com` answers through Base's credential helper from `DEV_SETUP_GITHUB_PAT`.
- [ ] A name that is missing produces a warning naming it, through Base's `check-secrets.sh` and `quarterdeck/extensions.json` (SC-19).
- [ ] The mechanism does not need root to read a secret file and does not source anything as shell.
- [ ] The read-only extensions token for the project container (ticket 08) has its name declared and its value delivered by the same confirmed mechanism, to the process that runs `qd-project-up`; the confirmed mechanism states which Herdr panes hold it.

## Technical context

**Design:** `.scratch/quarterdeck/design.md`, "Credentials" (the mechanism there is withdrawn; its "Into the project container" and "Rejected" rows still hold as requirements). Spike lessons: `spike/FINDINGS.md` "Design consequences" 1.

- **Modules:** `quarterdeck/bin/quarterdeck` and `quarterdeck/bin/qd-entry` (start Herdr with the values), `quarterdeck/extensions.json` (names).
- **Implementation anchors:** `base/mcp/check-secrets.sh`, `base/bin/git-credential-dev-setup`, `base/git/gitconfig`, `tests/credentials.test.mjs`.
- **Reuse:** Base's credential helper and secret check.
- **Dependency direction:** host passes names or a path; Herdr's children inherit.
- **Must not introduce:** a root-owned secrets file, a root entrypoint that reads secrets, `--env-file`, Compose secrets, a token on disk, any GitHub variable into a project container except through ticket 08, a `CONTEXT.md` change.
- **Validation seam:** `tests/quarterdeck.test.mjs` with dummy values; hash comparison inside a Herdr pane; `docker inspect`.
- **Coverage:** owns SC-19 (Quarterdeck side). The project-container half is owned by tickets 08 and 09.

## Blocked by

- The user's confirmation of the delivery mechanism. Status `needs-info`.
- 01: Quarterdeck image and the `quarterdeck` host command

## Comments

2026-11-13: The user answered the blocker. The mechanism is recorded in ticket 20 (`20-token-delivery-mechanism-decided.md`): a file the user owns, mounted read-only, read by name by a non-root process. Build this ticket to that decision. Status moved from `needs-info` to `ready-for-agent`.
