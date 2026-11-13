# 06: `qd-publish` pushes a branch and opens a pull request without running project hooks

**Status:** ready-for-agent
**Model:** Sonnet
**Design slice:** 2 (Real GitHub, no agents), the token-free half

## What to build

`qd-publish <home> <project> <branch> <slug>` runs in the Quarterdeck, pushes the branch from the Second Mate's clone, opens a pull request against the project's default branch whose body lists the Spec Run's tickets, and prints the PR URL. It never runs a hook from a project folder, whatever the Crewmate planted. Proven here against a local bare origin and a stub `gh`; the real GitHub proof is ticket 13.

## Decisions

- Design open question 8 (accepted by the user for the MVP, recorded in ticket 07's ADR): the risk that a Crewmate redirects a worktree's `.git` file, so other git config keys (for example a credential helper) could be read, is accepted. This ticket stops hooks and fsmonitor and uses the clone's git directory; it does not try to stop other keys.

## Acceptance criteria

- [ ] `qd-publish` against a local bare origin pushes exactly the named branch, and `gh pr create` (a stub on the path) is called once with the project's default branch as base, the branch as head and a body that lists every ticket title from `.scratch/<slug>/issues/` in number order (SC-08, token-free half). The URL the stub returns is printed.
- [ ] A hook planted in `<clone>/.git/hooks`, a `core.hooksPath` pointing at `state/<id>.git-hooks`, a `core.fsmonitor` command in the clone's config, and a worktree `.git` file redirected to an attacker directory holding a config with hooks and fsmonitor: none of them runs during `qd-publish` (SC-18).
- [ ] `qd-publish` uses `git --git-dir <clone>/.git` with `-c core.hooksPath=/dev/null -c core.fsmonitor=false` and `--no-verify` explicitly, and never reads the worktree's `.git` file (asserted by a planted marker file that must stay absent).
- [ ] With `GIT_CONFIG_COUNT` entries present in the environment (as FirstMate sets them), the hooks and fsmonitor overrides still win.
- [ ] A missing or failing push exits non-zero and prints nothing that looks like a PR URL.

## Technical context

**Design:** `.scratch/quarterdeck/design.md`, "Modules" (Publisher), "Constraints" (git never runs project hooks), "Validation plan" (SC-18 row).

- **Modules:** `quarterdeck/bin/qd-publish` (Node or shell, the implementer's choice, no new dependency kind), installed in the image at `/opt/qd/bin`.
- **Implementation anchors:** `base/git/gitconfig` and `base/bin/git-credential-dev-setup` (the credential path it will use against GitHub), `tests/lib.mjs`.
- **Reuse:** `git` and `gh` as installed by ticket 01.
- **Dependency direction:** `qd-publish` -> git, gh -> GitHub. It does not call FirstMate commands; the Spec Run procedure decides when it runs (ticket 10, 12).
- **Must not introduce:** pushing from a worktree, running the project's own scripts, a retry loop, merging the pull request.
- **Validation seam:** `tests/quarterdeck.test.mjs` running `qd-publish` in the Quarterdeck image against a local bare origin with a stub `gh`.
- **Coverage:** owns SC-18 and the token-free half of SC-08.

## Blocked by

- 01: Quarterdeck image and the `quarterdeck` host command
