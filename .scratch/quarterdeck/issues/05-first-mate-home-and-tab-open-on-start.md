# 05: The First Mate's home is seeded and its tab opens on start

**Status:** done
**Model:** Sonnet
**Design slice:** 1 (Quarterdeck up), last part

## What to build

On first start the Quarterdeck seeds the First Mate's home under the work root with the FirstMate configuration this repository ships, starts Herdr, and opens the First Mate's tab running `claude --model opus --permission-mode auto` in that home. On later starts nothing in the home is overwritten. This ticket also creates the manual checklist file and writes the rows for this slice.

## Working assumptions (design recommendations, not yet confirmed by the user)

- Design open question 4 (the Quarterdeck's own Claude policy, a working assumption) is already applied by ticket 01.
- Herdr's tab-opening call is unproven (the spike used `herdr pane run` only). If no call opens a named tab running a command, STOP and report what Herdr 0.7.4 offers; do not patch FirstMate.

## Acceptance criteria

- [x] After the first start, `/home/valeri/work/fleet/firstmate` (work root overridable) is a checkout of the pinned FirstMate commit; its `git status` shows nothing beyond ignored `config/`, `data/`, `state/`, `projects/`.
- [x] `config/backend` is `herdr`, `config/claude-permission-mode` is `auto`, `config/secondmate-harness` is `claude sonnet`, and `config/crew-dispatch.json` has `"shared_quota": true`, one rule (when "the ticket is about skills, prompts or agent tools" use `claude`, `opus`) and default `claude`, `sonnet`, with no `FM_DISPATCH_*` in `.env`.
- [x] Herdr has a workspace for the First Mate whose pane is running `claude --model opus --permission-mode auto` with the home as its working directory (a test stub stands in for the real `claude` on the path).
- [x] A second start, and a start after the config files were edited by hand, keeps the edited files and does not open a second First Mate tab.
- [x] No file in the FirstMate checkout is tracked-modified (ADR 0008).
- [x] `quarterdeck/CHECKLIST.md` exists with rows for SC-02 and SC-10 (First Mate tab opens and Claude starts with no prompt, trust dialog or login) so a human can run them with real tokens; the rows state what to look at and what a pass is.

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

## Comments

**Resolution (ticket 05 agent).** Done. Herdr 0.7.4 offers `workspace create --label --cwd` (returns the root pane) and `pane run <pane> <cmd>`; the First Mate gets a workspace labelled `firstmate` and `pane run` types `claude --model opus --permission-mode auto` into it. No FirstMate file was touched.

- New `quarterdeck/bin/qd-first-mate`, started by `qd-entry` as `node` once Herdr's server answers. It seeds `<work root>/fleet/firstmate` only when `.git` is missing, copies each shipped `config/*` file only when absent (so hand edits survive), writes onboarding-done and folder trust for the home into `$CLAUDE_CONFIG_DIR/.claude.json` with `jq`, and opens the workspace only when none labelled `firstmate` exists.
- The home is a `cp -a` of `/opt/firstmate`, not a `git clone`: `/opt/firstmate` is root-owned and git's dubious-ownership check also runs in the local clone's child process, where no environment or `-c` setting reaches. The copy is built beside the home and moved in. Its `origin` is set to `https://github.com/ValeriD/firstmate`.
- `quarterdeck` passes `QD_WORK_ROOT` to the container and now also waits for the `firstmate` workspace before reporting ready.
- Shipped config in `quarterdeck/fleet/config/`, copied into the image at `/opt/qd/fleet`.
- Tests (`tests/quarterdeck.test.mjs`): a derived image replaces `claude` with a stub, so no real session ran. The existing tests start the real image, so their First Mate pane runs the real `claude` with a dummy token (it fails to log in; nothing is spent).
- `npm test`: 81 pass. `npm run test:skill`: 51 pass.

Remains for a human with real tokens: the SC-02 and SC-10 rows in `quarterdeck/CHECKLIST.md` (real Claude start with no onboarding, trust or login prompt, Opus shown, tab idle not blocked). Whether Claude accepts `hasCompletedOnboarding` plus the trust entry for the home under `CLAUDE_CONFIG_DIR` is unverified without a real session.

**Code review (three fresh-context reviewers, fixed point 5b48cbe).** shellcheck is not installed on this machine and was not installed; `qd-first-mate` is unlinted.

Fixed:
- `ARCHITECTURE.md` Quarterdeck image and Host command rows were stale: updated.
- The host readiness check and the test matched any `"firstmate"` string: both now match the `label` field.
- A background `qd-first-mate` failure was silent: an ERR trap names the line, and a Herdr server that never answers now exits with a message.
- `CLAUDE_CONFIG_DIR` fell back to a path Claude does not use: now required (the image always sets it).
- The CHECKLIST SC-02 row lacked the attention mark (design validation plan, decision 29); SC-10 row now says it covers the start only and the whole-run check belongs to slice 7.
- Small: duplicated `basename` path, reused `tmp` name, two redundant test assertions, a convoluted `.env` assertion.

Declined:
- Use `fm-home-seed.sh`: it seeds a Second Mate home from an active home and project list (needs a registry, charter and projects), not the First Mate's own checkout.
- Hand-deleted config files reappear: matches "keeps edited files"; per-file `cp` is the simplest rule.
- Remove the checklist-format test: it is the only check for the ticket's file-exists criterion.
- Test for jq merging into an existing `.claude.json`, for a modified checkout surviving a restart, and for the uid-not-1000 teardown: low value for the cost.
- Trust ownership versus the future launcher: a later ticket must decide it; the Quarterdeck's own config is written here for now.
- Ticket edited in place: status, ticks and a resolution comment are what the brief allows; the body is unchanged.
- Attention mark not asserted by a test: it needs a real session (manual row).
