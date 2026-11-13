# 05: The First Mate's home is seeded and its tab opens on start

**Status:** ready-for-agent
**Model:** Sonnet
**Design slice:** 1 (Quarterdeck up), last part

## What to build

On first start the Quarterdeck seeds the First Mate's home under the work root with the FirstMate configuration this repository ships, starts Herdr, and opens the First Mate's tab running `claude --model opus --permission-mode auto` in that home. On later starts nothing in the home is overwritten. This ticket also creates the manual checklist file and writes the rows for this slice.

## Working assumptions (design recommendations, not yet confirmed by the user)

- Design open question 4 (the Quarterdeck's own Claude policy, a working assumption) is already applied by ticket 01.
- Herdr's tab-opening call is unproven (the spike used `herdr pane run` only). If no call opens a named tab running a command, STOP and report what Herdr 0.7.4 offers; do not patch FirstMate.

## Acceptance criteria

- [ ] After the first start, `/home/valeri/work/fleet/firstmate` (work root overridable) is a checkout of the pinned FirstMate commit; its `git status` shows nothing beyond ignored `config/`, `data/`, `state/`, `projects/`.
- [ ] `config/backend` is `herdr`, `config/claude-permission-mode` is `auto`, `config/secondmate-harness` is `claude sonnet`, and `config/crew-dispatch.json` has `"shared_quota": true`, one rule (when "the ticket is about skills, prompts or agent tools" use `claude`, `opus`) and default `claude`, `sonnet`, with no `FM_DISPATCH_*` in `.env`.
- [ ] Herdr has a workspace for the First Mate whose pane is running `claude --model opus --permission-mode auto` with the home as its working directory (a test stub stands in for the real `claude` on the path).
- [ ] A second start, and a start after the config files were edited by hand, keeps the edited files and does not open a second First Mate tab.
- [ ] No file in the FirstMate checkout is tracked-modified (ADR 0008).
- [ ] `quarterdeck/CHECKLIST.md` exists with rows for SC-02 and SC-10 (First Mate tab opens and Claude starts with no prompt, trust dialog or login) so a human can run them with real tokens; the rows state what to look at and what a pass is.

## Technical context

**Design:** `.scratch/quarterdeck/design.md`, "Modules" (Entrypoint, FirstMate configuration), "Work root", "Validation plan / Manual checklist".

- **Modules:** `quarterdeck/bin/qd-entry` (as `node`: seed the home on first start, start Herdr, open the tab), `quarterdeck/fleet/config/*` (shipped configuration), `quarterdeck/CHECKLIST.md`. The Charter template is ticket 10.
- **Implementation anchors:** FirstMate `docs/configuration.md` (`config/backend`, `claude-permission-mode`, `secondmate-harness`, `crew-dispatch.json`), `fm-home-seed.sh`, `spike/FINDINGS.md` "Link 1" for the home layout and the `config/` values that worked.
- **Reuse:** FirstMate's own commands and Herdr's CLI. The home is a clone of `/opt/firstmate` plus our `config/` files.
- **Dependency direction:** `qd-entry` -> FirstMate commands; FirstMate never knows the Quarterdeck exists.
- **Must not introduce:** an edit to any FirstMate file, quota rules, typed dispatch resolution, a wrapper around FirstMate's lifecycle.
- **Validation seam:** `tests/quarterdeck.test.mjs` (config files, Herdr workspace and pane command) plus the manual checklist rows.
- **Coverage:** the token-free part of SC-02 (First Mate tab exists) and the First Mate half of SC-06's model setting; SC-10's real-Claude half is manual and is run per `CHECKLIST.md`.

## Blocked by

- 01: Quarterdeck image and the `quarterdeck` host command
