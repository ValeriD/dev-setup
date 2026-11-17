# 29: Fixes from the branch review: committer identity, quota wording, stale docs, test image switch

**Status:** ready-for-agent
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

- [ ] With the identity variables unset on the host and an identity in a test `HOME`'s `.gitconfig`, a stub commit in the project container carries that identity. With the variables set, they win. With neither, start warns by name and still starts.
- [ ] `qd-spec-run`'s shared-quota sentence agrees with `crew-dispatch.json`, and a test checks that the two agree.
- [ ] `docs/architecture/quarterdeck.md` no longer calls settled items open. It links ticket 21 for them.
- [ ] Setting `QD_PROJECT_TEST_IMAGE` from a Herdr pane in a normally started Quarterdeck does not let `qd-project-up` accept an unpinned image. The existing fixture tests still pass.
- [ ] `.scratch/quarterdeck/your-tasks.md` step 0.1 (identity in `~/.bashrc`) is marked optional.
- [ ] `npm run test:quarterdeck` passes, followed by `npm run test:cleanup` with no test containers left. The full suite is not run.

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
