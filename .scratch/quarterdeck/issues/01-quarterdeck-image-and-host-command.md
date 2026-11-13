# 01: Quarterdeck image and the `quarterdeck` host command

**Status:** done
**Model:** Sonnet
**Design slice:** 1 (Quarterdeck up), first part

## What to build

One host command, `quarterdeck`, that builds the Quarterdeck image if it is missing, creates its network and container if they are not running, and attaches you to Herdr inside it. Running it again while the container runs attaches without starting a second one. `quarterdeck stop` removes only the containers it labelled. Inside the container the Egress Allowlist is active, Herdr's server is running, and no secret and no Docker access exist yet (tickets 03 and 04 add them).

The image is built on Base, not as a Variant (ADR 0006, `CONTEXT.md` "Quarterdeck").

## Working assumptions and decisions

- Design open question 4 (working assumption, not yet confirmed): the Quarterdeck ships its own Claude policy, without `allowManagedHooksOnly`. This concerns the Quarterdeck image only; the project container keeps Base's policy (see ticket 15).
- Design open question 5 (agreed by the user): Base's Egress Allowlist applies inside the Quarterdeck.
- Herdr 0.7.4 (below FirstMate's 0.8.0 floor) is accepted, as in the spike.

## Acceptance criteria

- [x] `quarterdeck` with no image and no container builds the image, starts one container, and attaches to Herdr (SC-01).
- [x] A second `quarterdeck` while the first runs starts no second container (one labelled Quarterdeck container exists afterwards) and attaches (SC-01).
- [x] `quarterdeck stop` removes the labelled Quarterdeck container and network and nothing else: an unlabelled container started beside it survives (SC-01, design constraint "no prune").
- [x] In the running container, the egress ruleset is ready, an allowlisted destination (for example `api.anthropic.com`) is reachable and a non-allowlisted one is not.
- [x] `herdr --session default server` is running as user `node`; Herdr, treehouse, `gh`, `docker`, `devcontainer` (0.89.0), `jq` and FirstMate at the pin exist at their paths; `/opt/firstmate` is read-only; `/opt/qd/bin` is first on `PATH`.
- [x] The container's Claude policy has none of `allowManagedHooksOnly`'s effect: the rendered `/etc/claude-code/managed-settings.json` has no `allowManagedHooksOnly` key but keeps the rest of Base's keys (`disableSkillShellExecution`, `disableSideloadFlags`, `disableCommandPluginSources`).
- [x] The container environment sets `GIT_CONFIG_COUNT` entries for `core.hooksPath=/dev/null` and `core.fsmonitor=false`.
- [x] `tests/quarterdeck.test.mjs` exists, builds the Quarterdeck image once per run, uses a temporary work root, labels what it creates with a run id and cleans up only that.

## Technical context

**Design:** `.scratch/quarterdeck/design.md` (base-commit `41f75c3`), sections "Proposed shape / Modules" (Quarterdeck image, Host command, Entrypoint), "Work root", "Constraints". Authority when sources disagree: `grill-notes.md` (latest section) over the design over the spec.

- **Modules:**
  - `quarterdeck/Dockerfile`, `quarterdeck/extensions.json`, `quarterdeck/claude-policy.json`: same pinned `node` digest and Claude pin as `variants/node/Dockerfile`; copy Base material the same way; run `installer/src/cli.mjs install --mode build` with `extensions/base.json` plus the Quarterdeck layer. No `devcontainer.json`, no Template.
  - Extras, pinned: Docker CLI, `gh`, `@devcontainers/cli@0.89.0`, `jq`, Herdr and treehouse through FirstMate's own `fm-install-herdr.sh` and `fm-install-treehouse.sh` (SHA-256 checked; copies are in `.scratch/quarterdeck/spike/`), FirstMate from `ValeriD/firstmate` at the exact commit in `/opt/firstmate` (spike used `427056c`; resolve and record the full SHA).
  - `quarterdeck/bin/quarterdeck`: `quarterdeck [attach|stop|rebuild]`. Attach is `docker exec -it -u node quarterdeck herdr`. It passes paths, never reads a secrets file. Make it reachable the way the `dev-container` host skill puts its command on the path (symlink into `~/.local/bin`; document the command, do not run it in tests).
  - `quarterdeck/bin/qd-entry`: as root runs `base/egress/start.sh` with an empty `DEV_SETUP_WORKSPACE` (check how `start.sh` and `render.sh` take the Quarterdeck's own allowlist in this case and make it fail closed), drops to `node` with `setpriv`, starts `herdr --session default server`, then waits. Seeding and the First Mate tab are ticket 05; secrets are ticket 03.
  - Mounts of the host work root (`/home/valeri/work`, overridable for tests) at the same path, the work root's `quarterdeck/claude` at `/home/node/.claude` (`CLAUDE_CONFIG_DIR`), the work root's `pool` at `/home/node/.treehouse`.
- **Implementation anchors:** `variants/node/Dockerfile`, `base/`, `installer/src/cli.mjs`, `extensions/base.json`, `tests/lib.mjs` (label-and-run-id cleanup, `CLI_SPEC`), `skills/dev-container/` (host command convention).
- **Reuse:** Base copied as is; the installer unchanged (only the policy template differs); FirstMate's install scripts for Herdr and treehouse.
- **Dependency direction:** host `quarterdeck` -> Quarterdeck image (`quarterdeck/` + `base/` + `installer/` + `extensions/base.json`). Nothing in `base/`, `installer/`, `variants/`, `templates/` or `skills/dev-container/` depends on `quarterdeck/`.
- **Must not introduce:** a `devcontainer.json` or Template for the Quarterdeck, publishing the image, a daemon of our own, a wrapper over `fm-*` commands, a prune, pause and resume, Ideas. No edit to `base/` and no edit to a FirstMate file. The egress list may need `ghcr.io` for the devcontainer CLI's Feature fetch: that is found in ticket 07, not guessed here.
- **Validation seam:** `tests/quarterdeck.test.mjs` through `npm test`; Docker and Herdr are real.
- **Coverage:** owns SC-01 (token-free, container level). Extends nothing existing; creates the new test file.

## Blocked by

None (can start immediately)

## Comments

**Resolution (implement, commit see `git log` for this ticket).** Built `quarterdeck/` (Dockerfile, claude-policy.json, extensions.json, `bin/qd-entry`, `bin/quarterdeck`), `.dockerignore` entry, `tests/quarterdeck.test.mjs`, an ARCHITECTURE.md section and a README paragraph. Full `npm test`: 63 pass, 0 fail.

- **No user-defined network (deviation).** The ticket says the command creates a network and `stop` removes it. Verified by running: on a user-defined network Docker's embedded DNS (127.0.0.11) relies on NAT rules inside the container, and Base's `egress/start.sh` ruleset starts with `flush ruleset`, which deletes them. DNS then fails and the self-test fails closed. The container therefore runs on the default bridge and there is no network to create or remove. Criterion 3 is ticked for what it protects (only the labelled container is removed). Tickets 03/04 must not assume a Quarterdeck network; the Docker proxy design already uses a socket.
- **Ownership label** goes on the container only; on the image every container started from it would inherit it and `stop` would remove them (found by the test).
- **Work root** defaults to `$HOME/work` (equal to `/home/valeri/work` here); `QUARTERDECK_WORK_ROOT` overrides. Mount sources are created by the host user, so the container's `node` (uid 1000) can write only if the host uid is 1000. Not handled; matters for CI (runner uid) and other hosts.
- **Not checked:** the real TUI attach (`docker exec -it ... herdr`); tests run a Herdr status probe through `QUARTERDECK_ATTACH_CMD`. The `~/.local/bin` symlink is documented, not created.
- **Pins not yet enforced:** the Dockerfile's base digest, Claude/pnpm pins and `DEVCONTAINER_CLI_VERSION` duplicate the Node Variant's; `scripts/check-pins.mjs`, `renovate.json` and `tests/renovate.test.mjs` do not cover `quarterdeck/Dockerfile` (CI ticket).
- **Review findings.** Fixed: ARCHITECTURE.md orphaned ADR 0003 line and over-long rows; empty-array expansion under old bash; Dockerfile comment claiming a nonexistent check; redundant test assertions (policy deepEqual, GIT_CONFIG_COUNT). Declined: duplicated COPY lines vs the Node Variant (ADR 0006, Quarterdeck is not a Variant; Base copied as is per ticket); `$HOME/work` vs literal path (override exists); real-TUI attach test (no terminal in the suite); uid mapping and a second fail-closed test for the ready-file check (out of ticket scope); extra `QUARTERDECK_*` variables (needed as test seams); name-only label matching (the label value is the per-name ownership key by design).
