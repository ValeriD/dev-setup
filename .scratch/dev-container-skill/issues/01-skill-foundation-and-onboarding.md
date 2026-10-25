# 01: Skill foundation and onboarding to a Variant

**What to build:** From my host Claude Code, `/dev-container` onboards a project in three cases:
- a local folder;
- a GitHub URL, cloned under `~/Documents/Work/dev/<name>`;
- a new repo: `git init`, with `gh repo create --private` only after I confirm.

For each, the skill:
1. proposes a Variant, detected from the project's files;
2. writes `.devcontainer/` rendered from this repo's local Template, with the registry digest;
3. writes an empty Extension Manifest, then validates both files;
4. creates the first lockfile when a project has none;
5. offers once to set the host VS Code settings;
6. asks once before recreating the container;
7. never commits;
8. reminds me about `/setup-matt-pocock-skills` when `docs/agents/` is missing.

A broken install symlink makes it stop with a re-link message.

**Blocked by:** node-devcontainer 06 (Extension installer tracer). The installer library provides validation.

**Status:** ready-for-agent

## Technical context

**Design:** `.scratch/dev-container-skill/design.md` (approved), with spec `.scratch/dev-container-skill/spec.md`. Glossary: `CONTEXT.md`. ADRs 0001, 0003, 0004, 0005. Ticket rule: never edit tickets other than your own; new needs go into new tickets.

- **Modules:**
  - Skill prompt (`skills/dev-container/SKILL.md` + per-operation reference files): onboarding flow, confirmations, guardrails.
  - Skill helper (`skills/dev-container/scripts/`, Node ESM): `variants`, `render-template`, `validate`, repo discovery.
  - Variants: a new `variants/node/variant.json` (description + detection files).
- **Implementation anchors:**
  - `templates/node/` (options `image`, `patEnvVar`; `${templateOption:…}` placeholders).
  - `tests/lib.mjs` (devcontainer CLI pin, `up` and cleanup helpers).
  - The installer's exported library from node-devcontainer 06.
  - Existing host skill symlinks in `~/.claude/skills`.
  - The `writing-for-agents` skill.
- **Reuse:**
  - `jsonc-parser` for strict JSONC parsing (the agent edits; the helper validates).
  - `docker buildx imagetools inspect` for the digest. Signature verification arrives in ticket 06; until then, say clearly that the digest is unverified.
  - devcontainer CLI via `npx` at the suite's pinned version.
- **First lockfile:** a new repo, or a project without a lockfile, gets its first lockfile from `pnpm install --no-frozen-lockfile` inside the container, because the image sets `pnpm_config_frozen_lockfile=true`. Tell the user this happened.
- **Dependency direction:** prompt → helper → installer library and repo data. The installer never imports the skill.
- **Must not introduce:** host installs, commits, a skill state file, a manifest-editing command set, or invoking `/setup-matt-pocock-skills`.
- **Validation seam:** helper integration tests through its CLI (`node:test`, no network: local bare git, local `registry:2.8.3`), plus headless `claude -p` checklist entries for the conversational parts.
- **Coverage:** SC-01 (without Presets), SC-02, SC-12, SC-13, SC-14, SC-15.

- [ ] Symlinking `skills/dev-container` into `~/.claude/skills` makes `/dev-container` available. The install step is documented in the README.
- [ ] `variants` proposes node for a folder with `package.json` and reports "ambiguous" for an empty folder
- [ ] `render-template` produces a `.devcontainer/` that `validate` accepts and `devcontainer up` starts
- [ ] A broken symlink, or one pointing outside a valid checkout, makes the helper exit with the re-link message and change nothing
- [ ] Checklist: URL clone, local folder and new-repo flows; repo creation only after confirmation and private; one recreate prompt; VS Code settings written only after confirmation (tested against a temporary settings file); no commits; the reminder appears; `docs/agents/` and `.scratch/` untouched
