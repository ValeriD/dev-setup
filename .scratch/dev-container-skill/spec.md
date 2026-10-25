Status: ready-for-agent

# Spec: `dev-container` skill — onboard and maintain Consuming Projects from the host

## Problem Statement

The Node Variant (see `.scratch/node-devcontainer/spec.md`) gives me a hardened container, but wiring a project to it and keeping it right are still manual work. For each project I have to:
- pick the Template and image digest;
- hand-write Extension Manifest entries with commit SHAs;
- look up which domains each extension needs;
- add `remoteEnv` lines for secrets;
- verify image signatures before updating;
- remember the host VS Code settings that ADR 0003 relies on;
- recreate the container at the right moment.

Migrating an existing npm or yarn project also means converting the lockfile and finding which build scripts pnpm now blocks.

I want to tell my host Claude Code what I want ("set up this repo with the web-app preset", "add the Playwright MCP", "update the container") and have it done correctly, so the hardening and pinning rules are never skipped. Typically I do this next to `/setup-matt-pocock-skills` when I start or adopt a project.

## Solution

A `dev-container` skill, kept in this repository and installed on the host by symlinking it into `~/.claude/skills`. It covers three things:
- **Onboarding** a new repo, an existing local folder, or a GitHub URL (cloned first). I pick a **Variant** (proposed from the project's contents) and any **Presets**.
- **Maintenance**: add or remove Agent Extensions after showing me what each one contains and pinning it, allow egress domains, add secrets by name, update the image after verifying its signature, resync Presets, create or edit Presets, and a `status` view.
- **Migration** of existing projects onto a branch, including the pnpm lockfile conversion.

It never commits (apart from creating the migration branch), never handles secret values, and never recreates the container without asking. It runs only on the host, because the project's `.devcontainer/` is read-only inside the container by design.

## User Stories

1. As a developer, I want to point the skill at a new repo, an existing local folder, or a GitHub URL, so that any project can be onboarded the same way.
2. As a developer, I want a GitHub URL target to be cloned under my projects root (default `~/Documents/Work/dev/<name>`), so that clones land where my projects live.
3. As a developer, I want a new repo to be initialised locally, with creating a private GitHub repository offered as a separate step I confirm, so that nothing is created publicly without my say-so.
4. As a developer, I want the skill to propose a Variant from the project's contents and ask only when that's ambiguous, using whatever Variants exist in this repository, so that new Variants appear without changing the skill.
5. As a developer, I want to choose one or more Presets from a list with descriptions, so that I can reuse sets of Agent Extensions I've already curated.
6. As a developer, I want an adopted Preset's entries copied into my project's Extension Manifest and tagged with the Preset name, so that what runs in my project is always visible there.
7. As a developer migrating an existing project, I want the skill to work on a `chore/dev-container` branch, replace any existing `.devcontainer/`, and (after asking) convert npm or yarn lockfiles to pnpm and set `packageManager`, so that the project ends up on the enforced package manager without surprises on my main branch.
8. As a developer migrating a project, I want the skill to prove the result with a frozen install inside the new container and report which build scripts pnpm blocked, so that I can decide which ones to allow.
9. As a developer, I want to ask for an extension by name or repository, see what it contains (hooks, MCP servers, scripts, executables, needed domains) at a resolved commit, and approve it before a pinned entry is written, so that I review everything that will run.
10. As a developer, I want to remove an extension or a whole Preset from a project, so that dropping experiments is as easy as adding them.
11. As a developer, I want to allow an egress domain for a project, so that I don't have to edit manifest JSON by hand.
12. As a developer, I want to add a secret by name and be told which host environment variable to export, so that secret values never pass through the skill or the repository.
13. As a developer, I want "update my dev container" to fetch the latest published image for my Variant, verify its signature and provenance, show me what changed, and only then write the new digest, so that updates can't bypass supply-chain checks.
14. As a developer, I want the skill to tell me when a Preset I use has changed and offer to resync it with a diff, one project at a time, so that Preset edits never propagate silently.
15. As a developer, I want to create a Preset from a project's extensions or edit an existing Preset through the skill, so that curating Presets doesn't mean hand-editing JSON.
16. As a developer, I want a `status` view for a project, so that I know what I'm actually running and what is out of date. It shows:
    - the Variant and digest, and whether a newer verified image exists;
    - the Presets in use and their sync state;
    - each extension with its Pinned Ref and age;
    - the egress domains;
    - missing host secrets;
    - whether a container recreate is pending.
17. As a developer, I want the skill to batch its changes and ask once before recreating the container, warning that running sessions will end, so that I never lose agent sessions unexpectedly.
18. As a developer, I want the skill to check the host VS Code settings that ADR 0003 relies on and offer once to set them, so that the VS Code mitigations don't depend on my memory.
19. As a developer, I want the skill to leave changes uncommitted with a summary, so that I review and commit them myself.
20. As a developer, I want the skill to remind me to run `/setup-matt-pocock-skills` when `docs/agents/` is missing, and to leave existing `docs/agents/` and `.scratch/` untouched, so that the two skills fit together.
21. As a developer, I want a clear message telling me to re-link the skill when its symlink into this repository is broken, so that it never runs against stale Variants, Presets or schema.

## Known Technical Constraints

- **Where it runs:** on the host only. It is not installed in Variant images, because `.devcontainer/` is read-only inside containers (Node spec SC-18).
- **Where it lives:** source at `skills/dev-container/` in this repository, installed by symlinking it into `~/.claude/skills/dev-container`. It finds this repository by resolving its own symlink; there is no separate config. Follow the `writing-for-agents` guidance when authoring it.
- **Invocation:** `/setup-matt-pocock-skills` has `disable-model-invocation: true`, so this skill must not try to invoke it. The intended order is `dev-container` first, then `/setup-matt-pocock-skills`.
- **Data it reads from this repository:** `variants/<name>/` (the available Variants), `presets/<name>.json` (Presets, in the Extension Manifest schema plus a one-line `description`), and the published Extension Manifest JSON Schema.
- **Schema addition:** an optional `preset` string field on manifest entries (ADR 0005). It needs to be added to the schema owned by the Node feature's installer (ticket 06 of `node-devcontainer`).
- **Presets are copied, not referenced** (ADR 0005).
- **Pinned Ref rule:** every entry the skill writes carries a Pinned Ref, except `mcp-remote` entries, which declare egress domains instead (Node design D2). Codex `plugin` entries are never written (Node design D3).
- **Project wiring:** onboarding always renders the Template from the local checkout of this repository, with the image digest fetched and verified from the registry. (Amended during design, decision D1.)
- **Image updates:** require successful `cosign verify` and `gh attestation verify` of the new digest before it is written.
- **Secrets:** only as `remoteEnv` entries with `${localEnv:NAME}` plus named-secret references in the manifest. Values are never requested, read or written.
- **Git:** no commits, except creating the `chore/dev-container` branch during migration. `gh repo create` only with explicit confirmation, and private by default.
- **Container recreation:** `devcontainer up --remove-existing-container`, only after confirmation.
- **Host VS Code settings:** `dev.containers.copyGitConfig: false` and `dev.containers.dockerCredentialHelper: false` in the host user settings, written only with confirmation.
- **Terminology:** use the `CONTEXT.md` terms (Variant, Template, Preset, Extension Manifest, Extension Layer, Pinned Ref, Egress Allowlist, Consuming Project).

## Acceptance Scenarios

- **SC-01** (stories 1, 2, 4, 5, 6): Given a GitHub URL, the skill clones it under the projects root, proposes the node Variant for a repo with `package.json`, and lets me pick Presets. It then writes a `.devcontainer/` wired to the Node Template, and an Extension Manifest whose entries carry the Preset tags.
- **SC-02** (stories 1, 3): Given a new project name, the skill runs `git init` locally, asks which Variant to use (no signals), and creates no GitHub repository unless I confirm. When I confirm, the repository is private.
- **SC-03** (stories 7, 8): Given an existing npm project with its own `.devcontainer/`:
  - the skill creates `chore/dev-container` and replaces `.devcontainer/`;
  - after my confirmation, it converts `package-lock.json` with `pnpm import` and sets `packageManager`;
  - it runs a frozen install inside the new container and lists the blocked build scripts.
  - If I decline the conversion, the lockfile is left alone and the skill reports that installs will fail until the project is converted.
- **SC-04** (story 9): Asked to add a plugin from a repository, the skill shows the resolved commit SHA and the plugin's hooks, MCP servers, scripts, executables and needed domains. If I decline, nothing is written. If I approve, a pinned entry and its egress domains are written.
- **SC-05** (story 9): Asked to add a Codex plugin, or an entry it can't pin (other than `mcp-remote`), the skill refuses and explains why.
- **SC-06** (story 10): Removing an extension deletes its entry and any egress domains only it needed. Removing a Preset deletes all entries tagged with it.
- **SC-07** (stories 11, 12): Allowing a domain adds it to the project manifest's egress. Adding secret `FOO` adds a `remoteEnv` `${localEnv:FOO}` entry and a manifest reference, tells me to export `FOO` on the host, and never prompts for its value.
- **SC-08** (story 13): Given a newer published image, the skill verifies its signature and attestation, shows the Agent versions and Base-layer differences, and writes the new digest only after I confirm. If verification fails, nothing is written and the failure is reported.
- **SC-09** (story 14): After a Preset is edited in this repository, `status` in a project using it reports drift. Resync shows a diff and applies it only to that project.
- **SC-10** (story 15): "Save this project's extensions as preset X" writes `presets/X.json` with a description. Editing a Preset changes only that file. Neither touches any Consuming Project.
- **SC-11** (story 16): `status` reports all six items listed in story 16, including a pending recreate when the manifest changed after the container started.
- **SC-12** (story 17): After several changes, the skill asks once before recreating, with a warning about running sessions. If I decline, nothing is recreated and `status` shows the recreate as pending.
- **SC-13** (story 18): When the host VS Code settings are missing, the skill offers once to set them and writes only those two keys after confirmation.
- **SC-14** (stories 19, 20): After any operation, the working tree holds the changes uncommitted, apart from the migration branch creation, and a summary is printed. In a repo without `docs/agents/`, the skill reminds me about `/setup-matt-pocock-skills`. Existing `docs/agents/` and `.scratch/` are unchanged.
- **SC-15** (story 21): With the symlink broken or pointing outside a valid checkout of this repository, the skill stops with a re-link instruction and makes no changes.

## Out of Scope

- Running the skill inside containers.
- Publishing the skill as a plugin or marketplace entry.
- Bulk operations across all Consuming Projects, such as resyncing a Preset everywhere.
- Committing, pushing or opening PRs.
- Creating new Variants. The skill only selects from existing ones.
- Non-GitHub hosts for cloning or repository creation.
- Managing host secrets or setting environment variable values.
- Changes to `/setup-matt-pocock-skills` itself.

## Further Notes

- **Depends on** `.scratch/node-devcontainer/`:
  - ticket 06 for the schema (plus the `preset` field);
  - ticket 07 for project-layer behaviour;
  - ticket 10 for the published Template, digests and signatures.

  Design should sequence it so that onboarding with the local Template can land before ticket 10.
- **Relevant ADRs:** 0001 (pnpm), 0003 (VS Code mitigations), 0004 (unified manifest), 0005 (Presets copied).
- **Glossary:** **Preset** was added to `CONTEXT.md` in this session.
