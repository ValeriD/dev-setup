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

- [ ] The branch is created and the old `.devcontainer/` is replaced; nothing is committed beyond creating the branch
- [ ] After confirmation, `pnpm-lock.yaml` and `packageManager` are produced inside the container
- [ ] The frozen install runs, and blocked build scripts are listed by package
- [ ] Declining leaves the lockfile untouched, with the explanation shown
