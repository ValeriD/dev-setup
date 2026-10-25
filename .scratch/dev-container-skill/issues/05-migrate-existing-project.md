# 05: Migrating an existing project

**What to build:** For an existing npm or yarn project, possibly with its own `.devcontainer/`, the skill:
1. creates a `chore/dev-container` branch;
2. replaces `.devcontainer/` with the onboarding output;
3. after I confirm, converts the lockfile with `pnpm import` and sets `packageManager` inside the container;
4. runs `pnpm install --frozen-lockfile` inside the container and reports which build scripts pnpm blocked.

If I decline the conversion, the lockfile is left alone, and the skill says installs will fail until the project is converted.

**Blocked by:** 01 (Skill foundation and onboarding)

**Status:** ready-for-agent

## Technical context

**Design:** `.scratch/dev-container-skill/design.md` (approved), with spec `.scratch/dev-container-skill/spec.md`. Glossary: `CONTEXT.md`. ADRs 0001, 0003, 0004, 0005. Ticket rule: never edit tickets other than your own; new needs go into new tickets.

- **Modules:** skill prompt migration flow; helper reuse of `render-template` and `validate`.
- **Constraints:**
  - `pnpm import` and the installs run only inside the container through `devcontainer exec`, never on the host.
  - The branch is the only git write.
- **Validation seam:** checklist run against a fixture npm project with an existing `.devcontainer/`, using the real container.
- **Coverage:** SC-03.

- [x] The branch is created and the old `.devcontainer/` is replaced; nothing is committed beyond creating the branch
- [x] After confirmation, `pnpm-lock.yaml` and `packageManager` are produced inside the container
- [x] The frozen install runs, and blocked build scripts are listed by package
- [ ] Declining leaves the lockfile untouched, with the explanation shown (prompt-only path: manual checklist row 13, not run headlessly)

## Comments

**Implementation notes (agent, 2026-10-25):**

- Helper: `render-template --replace` (deletes the old `.devcontainer/` only after everything that can fail is checked, reports `replaced`), `import-lockfile`, `frozen-install`. The branch is created by the agent with `git switch -c` (prompt step), not the helper.
- `pnpm import` honours the image's `pnpm_config_frozen_lockfile=true` and fails with `ERR_PNPM_NO_LOCKFILE`; `--no-frozen-lockfile` is not a valid `import` option in pnpm 11.0.0, so the helper runs it with `pnpm_config_frozen_lockfile=false` for that one command.
- `packageManager` is set (with `npm pkg set`, format-preserving) before `pnpm import`, because pnpm refuses a project that declares another package manager. Value: `pnpm@<container pnpm --version>`, no hash.
- The converted npm/yarn lockfile is removed after a successful import (conversion, not two lockfiles). A failed import restores `package.json` (the `packageManager` write) and keeps the old lockfile.
- With `strictDepBuilds` the frozen install exits non-zero with `ERR_PNPM_IGNORED_BUILDS` although the dependencies are installed; `frozen-install` treats that as success and parses the list into `blockedBuilds: [{name, version}]`.
- Migration starts the container with `up --recreate`: a container from the old configuration carries the same `devcontainer.local_folder` label and would otherwise be reused.
- Finding outside this ticket: pnpm puts its store at `/workspace/.pnpm-store` (same filesystem as the workspace), so migrated and onboarded projects get an untracked `.pnpm-store/`. The skill mentions it in the summary; moving the store belongs to the Node Variant.
- Automated: `npm run test:skill` (replace, refusals) and `tests/dev-container-skill.test.mjs` (fixture npm project with an old dev container, real container, registry stub). The decline path and the conversation are rows 11-13 of `docs/manual/dev-container-skill-checklist.md`, not run (no headless Claude login).
