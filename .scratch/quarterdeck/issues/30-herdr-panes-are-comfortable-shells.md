# 30: Herdr panes in the Quarterdeck are comfortable bash shells

**Status:** ready-for-agent
**Model:** Sonnet
**Design slice:** 1 (Quarterdeck up)

## Problem

A Herdr pane in the Quarterdeck runs `/bin/sh`, which is dash on this image. Herdr's server starts with no `SHELL` set: `quarterdeck/bin/qd-server` execs `herdr --session default server`, and `SHELL=` is empty in the container, although `node`'s login shell is bash. The user has no arrow-up history, no Ctrl+R, no line editing and no tab completion. In task A on 2026-11-17, `git log` also opened `less`, and the user could not leave it.

## Decision

Decisions 100–102 (`grill-notes.md`):
- Panes run bash.
- History is **not** persistent. It lives in the container and is gone after `quarterdeck stop`.
- Within a run, all panes share one history: commands are written as soon as they run, duplicates are removed, and commands starting with a space are not saved.
- The pager is `less -FRX`.

## What to build

1. `SHELL=/bin/bash` in the environment Herdr's server starts with, so new panes get an interactive bash.
2. A Quarterdeck shell profile, for interactive bash only, that sets the history and pager behaviour above. Suggested values: `HISTCONTROL=ignorespace:erasedups`, `HISTSIZE` and `HISTFILESIZE` 50000, `shopt -s histappend`, `PROMPT_COMMAND` appending with `history -a` and reading other panes' lines with `history -n`, `PAGER` and `GIT_PAGER` set to `less -FRX`. The history file stays in `/home/node`, nowhere under the work root.

## Acceptance criteria

- [ ] A new Herdr pane's shell is bash (`ps` shows `bash` for the pane, not `/bin/sh`).
- [ ] In that pane, a command run in one pane appears in another pane's history (for example through `history`) without either pane closing. A command typed with a leading space does not appear.
- [ ] The history file is under `/home/node`, and nothing is written under `QD_WORK_ROOT`. After `quarterdeck stop` and a new start, the history is empty.
- [ ] `PAGER` and `GIT_PAGER` are `less -FRX` in a pane. `git log -1` in a clone prints and returns to the prompt without waiting.
- [ ] Token delivery is unchanged: tokens reach Herdr panes only, and a plain `docker exec` shell still has none. Agents launched by FirstMate behave as before.
- [ ] `npm run test:quarterdeck` passes, followed by `npm run test:cleanup` with no test containers left. The full suite is not run.

## Technical context

- **Modules:** `quarterdeck/bin/qd-server` or `quarterdeck/Dockerfile` (where `SHELL` comes from), a profile file shipped in the image, and `tests/quarterdeck.test.mjs`. Reuse the pane-environment test pattern from ticket 03: compare a real Herdr pane with a `docker exec` shell.
- **Must not introduce:** history or any shell state under the work root, any change to Base or the Variant, or any access to the host clipboard (decision 103).

## Blocked by

None.

## Comments
