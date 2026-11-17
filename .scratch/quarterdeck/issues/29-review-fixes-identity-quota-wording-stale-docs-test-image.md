# 29: Fixes from the branch review: committer identity, quota wording, stale docs, test image switch

**Status:** done
**Model:** Opus
**Design slice:** cross-cutting

## Problem

The review of `main...feat/quarterdeck` (2026-11-16, recorded in PR #1's body) found four should-fix items. The first one also stopped the user in task A on 2026-11-17: a commit failed with "unable to auto-detect email address".

1. **Committer identity:** `quarterdeck/bin/quarterdeck` passes `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME` and `GIT_COMMITTER_EMAIL` by name only. When the host has its identity only in `~/.gitconfig`, they arrive empty and every commit in the Quarterdeck and in project containers fails, or carries no identity (SC-04).
2. **Quota wording:** `quarterdeck/skills/qd-spec-run/SKILL.md` says to keep "shared-quota mode ... off", but `quarterdeck/fleet/config/crew-dispatch.json` ships `"shared_quota": true`, which means "no quota calls" (design, decision 19). A mate following the skill literally would turn quota calls on.
3. **Stale docs:** `docs/architecture/quarterdeck.md` still says the extensions-token check "remains a TODO" and that security concern 07 is unmet. Ticket 21 settled both.
4. **Test image switch:** `quarterdeck/bin/qd-project-up` accepts any image named by `QD_PROJECT_TEST_IMAGE`. A process in any Herdr pane can set it and start an unpinned, unhardened image.

## What to build

1. When an identity variable is unset or empty on the host, the host command fills it from the host's `git config user.name` and `user.email`. The variables set on the host still win. If neither source has a name and an email, start prints a warning that names both and says how to set them. Start is not refused.
2. The skill text matches the shipped config: shared-quota mode stays **on**, so mates make no quota calls. Fix the sentence, not the config.
3. The architecture page states the current security position from ticket 21.
4. The test image cannot be selected from inside a running Quarterdeck. One possible way: the switch is honoured only when the Quarterdeck was started by the test suite, for example tied to `QD_RUN_LABEL`, which only the host command sets. Prefer the simplest form that the existing tests can still use.

## Acceptance criteria

- [x] With the identity variables unset on the host and an identity in a test `HOME`'s `.gitconfig`, a stub commit in the project container carries that identity. With the variables set, they win. With neither, start warns by name and still starts.
- [x] `qd-spec-run`'s shared-quota sentence agrees with `crew-dispatch.json`, and a test checks that the two agree.
- [x] `docs/architecture/quarterdeck.md` no longer calls settled items open. It links ticket 21 for them.
- [x] Setting `QD_PROJECT_TEST_IMAGE` from a Herdr pane in a normally started Quarterdeck does not let `qd-project-up` accept an unpinned image. The existing fixture tests still pass.
- [x] `.scratch/quarterdeck/your-tasks.md` step 0.1 (identity in `~/.bashrc`) is marked optional.
- [x] `npm run test:quarterdeck` passes, followed by `npm run test:cleanup` with no test containers left. The full suite is not run.

## Technical context

- **Modules:** `quarterdeck/bin/quarterdeck`, `quarterdeck/bin/qd-project-up`, `quarterdeck/skills/qd-spec-run/SKILL.md`, `docs/architecture/quarterdeck.md`, `tests/quarterdeck.test.mjs`.
- **Must not introduce:** reading the host's whole `~/.gitconfig` into the Quarterdeck (only the two values), or any change to Base or FirstMate.
- **Review nits, optional, only if trivial:**
  - `qd-publish`'s `git show | head -n 1` under `pipefail`.
  - The launcher removes the publish marker before `exec`.
  - The `/home/valeri/work` fallback in `bin/claude` and `qd-project-up`.

## Blocked by

None.

## Comments

### Resolution — done (2026-11-17)

Fixed point `59c21e9`. One commit (this one) holds the implementation, review fixes and closing edits.

Built:
- `quarterdeck/bin/quarterdeck` `fill_identity_args`: each `GIT_AUTHOR_*`/`GIT_COMMITTER_*` that is unset or empty on the host is filled from `git -C / config --get user.name`/`user.email` (only those two values; system and global files, not a repository's). Host variables win. Anything still missing is warned about by name with the `git config --global` fix; start goes on. Values go in as `-e NAME=value`; a missing one is not passed at all.
- Test-image switch: `qd-entry` (root) writes `/run/quarterdeck-test-run` only when the host command set `QD_RUN_LABEL` (that is, `QUARTERDECK_RUN_LABEL`), and removes it on every start. `qd-project-up` honours `QD_PROJECT_TEST_IMAGE` only while that file is a root-owned regular file. A pane setting both variables in a normally started Quarterdeck still gets "image must be a digest-pinned published Variant". The variable stays the test seam that Errands relies on.
- `qd-spec-run` now says shared-quota mode stays **on** (no quota calls), matching `crew-dispatch.json`; the config is unchanged. `docs/architecture/quarterdeck.md` links ticket 21 for the settled items (SC-19 narrowing, `/etc/environment` acceptance, decisions 3-5) and no longer calls them TODO or unmet. `PROJECT-CONTAINERS.md`, the design's committer-identity row and `your-tasks.md` step 0.1 (now optional) are updated.
- Optional nits done: no `/home/valeri/work` fallback in `bin/claude` and `qd-project-up` (they require `QD_WORK_ROOT`, which the host always sets); `qd-publish` reads the title line with `sed -n 1p` (not `head` under pipefail). The launcher's marker removal before `exec` is not changed.

Tests (`tests/quarterdeck.test.mjs`): the shared `quarterdeck()` helper now runs with a test `HOME` whose `.gitconfig` differs from the variables. Author variables are set, committer name is empty and committer email unset. The existing launcher stub commit, made inside the project container, must carry `Host Author <author@…>|Config Identity <config@…>`, so variables win and empty and unset ones are filled. The manual-start test runs with no identity anywhere: it asserts the named warning, a successful start and no `GIT_*` in the container env. A new static test checks that the skill's shared-quota sentence agrees with the config. A new test proves the marker is root-owned and that `node` cannot create it. With the marker, the test image passes the image check (the run is then refused on `runArgs`, so no container is made). With the marker moved aside, the same pane command is refused as unpinned.

Validation: `npm run test:quarterdeck` passed twice, 37/37 (before and after review fixes), each followed by `npm run test:cleanup` with 0 test containers left. The full suite was not run.

Not checked / risk: "normally started" is simulated by moving the root-owned marker aside in a labelled test container. Starting an unlabelled container would break the label-only teardown rule. That a host start without `QUARTERDECK_RUN_LABEL` writes no marker rests on `qd-entry`'s one-line condition and the host passing `QD_RUN_LABEL=` empty, not on a test. In a test-started Quarterdeck any pane can still select a test image (test only, by design).

Review (fresh Standards, Design, Spec reviewers):
- Standards: `identity()` hides that it fills a global. **Fixed**: renamed `fill_identity_args`.
- Standards: the marker path is repeated in bash, Node and the test. **Declined**: the copies are in two languages and a test; a shared constant would cost more than the duplicate.
- Standards: the quota test's off-branch is dead and too weak. **Fixed**: it now asserts the config is `true` and the sentence says "on" and "no quota calls".
- Standards: the warning regex pins the message's order. **Fixed**: it now checks each name and command separately.
- Standards: the positive path is coupled to `qd-project-up`'s check order. **Declined**: this is commented, and it avoids creating a container.
- Standards: an assert in `finally` could hide the original failure. **Fixed**: the restore result is asserted after the `try`.
- Design: the design row for committer identity was stale. **Fixed** (design table row updated).
- Design: the helper's `HOME` change reaches every test. **Declined**: it is intended, `DOCKER_CONFIG` is kept, and both runs passed.
- Spec: the test-run evidence was missing. **Fixed**: it is recorded here.
- Spec: "normally started" is simulated. **Declined**: an unlabelled container would break the teardown rule; see the risk above.
- Spec: whether the stub commit runs in the project container was unconfirmed. **Declined** as a non-issue: the stub is installed into the project container (`cid`) and the launcher execs there.

