---
type: technical-design
feature: dev-container-skill
status: approved
base-commit: 0d61d73
touches:
  - agent-extensions
  - templates
  - ci-release
  - host-skill
changes-architecture: true
spec: .scratch/dev-container-skill/spec.md
---

## Design capsule

- **The skill is prompt-driven, with a small deterministic helper.** `skills/dev-container/SKILL.md` owns the conversation: operations, confirmation points and guardrails. A helper CLI in the same folder owns everything that must be exact: validation, inspecting an extension at a SHA, `status`, image verification, Variant and Preset listing, and Template rendering. The agent makes the edits to manifests and `devcontainer.json` itself, then runs the helper's `validate`.
- **The helper reuses the installer as a library.** It imports the installer's schema, validation, kind × Agent table and git fetch-by-SHA (node-devcontainer ticket 06) by relative path. Node resolves the skill's symlink to its real path, so the imports land in the repository. The dependency is one-way: helper → installer. The installer never knows the skill exists.
- **The repository is found through the symlink.** The helper's real path gives the repo root. If the root lacks `variants/`, `presets/` or the schema, the skill stops with a re-link message.
- **Template rendering is always from the local checkout** (decision D1). The helper fills `${templateOption:…}` in `templates/<variant>/.devcontainer/` itself, because the devcontainer CLI can't apply a local Template. The image digest always comes from the registry. The OCI Template stays the VS Code entry point.
- **Image verification needs no host installs.** cosign runs as a digest-pinned container (`ghcr.io/sigstore/cosign/cosign@sha256:…`) through the host's Docker. It verifies the keyless signature (pinned to this repo's release workflow identity) and the registry-pushed provenance attestation. The new digest comes from `docker buildx imagetools inspect`. "What changed" is read from OCI labels (revision, Agent versions) plus `git log old..new` in the local checkout.
- **Untrusted code never runs on the host.** Extension sources are fetched into a fresh temp directory and only read. `pnpm import` and the frozen install for migration run inside the new container, under the pnpm policy and the Egress Allowlist. The host only runs git, Docker and the helper.
- **Status reads live state, not a cache.** It looks at the manifest vs Presets (by `preset` tag), Pinned Ref ages (git commit dates from the fetch), the registry digest, host env names, and the running container. The container is found by its `devcontainer.local_folder` label, and the helper reads an applied-manifest hash that the start-up step writes inside it.
- **Additions to node-devcontainer modules are delivered by this feature's own tickets**, and the node-devcontainer tickets stay unchanged. They are:
  - the optional `preset` field on manifest entries, plus a Preset `description` (installer schema);
  - an applied-manifest hash at a readable path (start-up step);
  - OCI labels for revision and Agent versions (Dockerfile or CI). Registry-pushed attestations already landed in node-devcontainer 10;
  - a small per-Variant `variant.json` with a description and detection files.
- **Deliberately not built:**
  - a JSONC rewriting library: the agent edits JSONC directly, then the helper validates;
  - a manifest-editing command set;
  - a skill-level state file;
  - bulk multi-project operations;
  - host installs of cosign, newer `gh` or pnpm;
  - a plugin or marketplace for the skill.

## Existing shape

- **Implemented at `0d61d73` (ticket 02):**
  - `variants/node/` (Dockerfile, build `devcontainer.json`);
  - `base/` (Agent wrappers, Claude and Codex policy);
  - `templates/node/` (option `image`, with the Template's `devcontainer.json` holding `runArgs`, `initializeCommand` and the read-only mounts);
  - `tests/` (`node:test` acceptance suite; `tests/lib.mjs` publishes Templates to a throwaway local registry because the CLI can't apply local Templates).
- **Running in parallel:** tickets 03 (egress), 04 (pnpm), 05 (credentials) and 10 (CI). Ticket 06 (installer, schema) comes after 03.
- **Host facts:** Node 24, git 2.43, `gh` 2.45 (no `gh attestation`), Docker, no cosign. Host skills are symlinks into source repositories (e.g. `~/.claude/skills/ask-matt` → another repo), so symlinking is the established install convention.
- **Neighbouring skill:** `/setup-matt-pocock-skills` is user-invoked only (`disable-model-invocation: true`).

## Proposed shape

Paths are navigation hints.

| Module | Owns | Does not own | Interface |
| --- | --- | --- | --- |
| **Skill prompt** (`skills/dev-container/SKILL.md` + progressively loaded reference files per operation) | Operation routing (onboard, migrate, add/remove extension, egress, secret, update image, Preset resync/create/edit, status), every confirmation point, guardrails (no commits, no secret values, no unconfirmed recreate or `gh repo create`), wording in `CONTEXT.md` terms, the reminder about `/setup-matt-pocock-skills`, the host VS Code settings check | Exact computations, which it always delegates to the helper | Invoked as `/dev-container` or by description match |
| **Skill helper** (`skills/dev-container/scripts/`, Node ESM, no build) | Subcommands: `variants` (list plus detection for a folder), `presets` (list plus descriptions), `render-template <variant> <dir> --image <digest>`, `inspect <source> [--ref]` (resolve SHA, fetch read-only, emit an inventory of hooks, MCP servers, scripts, `bin/`, skill shell-injection and `allowed-tools` use, and detected hosts), `validate <project>` (manifest against the schema + kind × Agent + Pinned Ref; JSONC parse of `devcontainer.json`), `status <project>`, `verify-image <ref>` (signature + provenance; prints digest, revision and Agent versions) | Writing manifests or settings (the agent does that); anything that runs fetched content | JSON on stdout for the agent to read, non-zero exit on failure |
| **Installer** (node-devcontainer, `installer/`) | Schema, validation, kind × Agent table, fetch-by-SHA, used as a library | Anything host-specific | Exported functions; adds the optional `preset` entry field and the Preset `description` |
| **Variants** (`variants/<name>/variant.json`) | Description and detection files per Variant | Selection logic | Read by `variants` |
| **Presets** (`presets/<name>.json`) | Named entry sets with a description, in the manifest schema | Projects | Read by `presets`; written by the agent through the skill |
| **Start-up step** (node-devcontainer) | Writes the applied-manifest hash to a readable path in the container | | Read by `status` through `docker exec` as `node` |
| **CI release** (node-devcontainer ticket 10) | OCI labels (revision, Agent versions); attestations pushed to the registry | | Read by `verify-image` |

**Dependency direction:** skill prompt → helper → installer library and repository data (variants, presets, templates). The helper also calls host git, Docker (cosign container, imagetools, exec) and the devcontainer CLI through `npx` with an exact version. Nothing in the image or the installer depends on the skill.

### Changed flows

**Onboard.**
1. Resolve the target. A URL is cloned to `~/Documents/Work/dev/<name>`. A new name gets `git init`, plus `gh repo create --private` only after you confirm.
2. `variants` proposes a Variant, and the skill asks if the signals are ambiguous.
3. `presets` provides the picker.
4. `verify-image` checks the Variant's latest digest.
5. `render-template` writes `.devcontainer/`.
6. The agent writes `.devcontainer/extensions.json` with the copied, `preset`-tagged entries.
7. `validate`.
8. The skill checks the host VS Code settings.
9. It asks before `devcontainer up`.
10. It prints a summary, plus the `/setup-matt-pocock-skills` reminder if `docs/agents/` is missing.

**Migrate.**
1. Create the `chore/dev-container` branch, then onboard over the existing `.devcontainer/`.
2. After you confirm, run `pnpm import` and set `packageManager` inside the container through `devcontainer exec`.
3. Run `pnpm install --frozen-lockfile` inside the container, collect the blocked builds and report them.

**Add an extension.**
1. `inspect` the source.
2. The skill shows the inventory and asks you to approve.
3. The agent adds the entry and its egress domains.
4. `validate`.

**Remove** works the same way, pruning egress domains that no remaining entry needs and removing entries by `preset` tag.

**Update the image.** `verify-image` on the newest digest, then show the label diff and the git log between revisions. After you confirm, the agent replaces the digest in `devcontainer.json`. Then `validate`.

**Resync a Preset.** `status` detects the drift. The skill shows the per-entry diff, and the agent applies it after you confirm.

**Status.** `status` returns one JSON document, and the skill renders it.

**Recreate.** At the end of any operation that changed config, the skill asks once and then runs `devcontainer up --remove-existing-container`.

## Reuse decisions

| Capability | Supplied by | Why |
| --- | --- | --- |
| Schema, validation, Pinned Ref, kind × Agent, fetch-by-SHA | Installer library (node-devcontainer 06) | One implementation of the rules for build, start and host |
| Template rendering | Local checkout + `${templateOption:…}` substitution in the helper | The CLI can't apply local Templates; the substitution is trivial and avoids a registry round trip |
| Signature and provenance verification | cosign in a digest-pinned container | No host install; the host's `gh` is too old for `gh attestation` |
| Latest digest | `docker buildx imagetools inspect` | Already on the host |
| Change summary | OCI labels + `git log` in the checkout | No extra artefact to publish |
| JSONC parsing for `devcontainer.json` and VS Code settings | `jsonc-parser` (Microsoft, MIT, zero dependencies), added to the helper | Strict parsing with comments; editing is left to the agent |
| Repo discovery | Node real-path resolution of the symlinked helper | Matches the existing host-skill convention; no config |
| Running the container, exec, recreate | devcontainer CLI via `npx -y @devcontainers/cli@<pinned>` | Same pin as the acceptance suite |
| Tests | `node:test` with local bare-git fixtures and fixture projects | Matches the repository convention |

## Constraints

- The helper never runs fetched content. Fetched sources go into a fresh `mkdtemp` directory and are read as data. Inventory heuristics (detected hosts) are labelled as heuristics.
- The helper never writes project files, apart from `render-template` writing into `.devcontainer/` and `first-lockfile`, whose in-container pnpm run creates `pnpm-lock.yaml` (and `package.json` when there was none; amended in ticket 01), and the migrate commands `import-lockfile` and `frozen-install`, which change `package.json`, the lockfiles and `node_modules` only through pnpm in the container (amended in ticket 05). Every other mutation is an agent edit followed by `validate`, so the confirmation points stay in the skill's conversation.
- No subcommand accepts a secret value, and no subcommand commits. `status` reports secret names only.
- `verify-image` fails closed. A missing signature, an identity mismatch or missing provenance is a hard failure, with no override flag.
- The skill must not invoke `/setup-matt-pocock-skills`, and must not write `docs/agents/` or `.scratch/`.
- No host installs. Everything beyond Node, git, Docker and `gh` runs through `npx` with exact versions or digest-pinned containers.
- Skill text follows the `writing-for-agents` guidance: a short SKILL.md with reference files loaded per operation.
- `ARCHITECTURE.md` is updated when the implementation lands.

## Validation plan

Default: **helper integration tests** through its CLI against fixtures. They need no network, since sources come from local bare-git repos and the image registry is a local `registry:2.8.3` as in the existing suite. Skill-conversation behaviour is covered by a **scenario checklist run headlessly** (`claude -p` with the skill against fixture projects in a throwaway directory), executed on demand rather than in CI because it costs model calls.

| Scenarios | Seam / level | Real dependencies | Notes |
| --- | --- | --- | --- |
| SC-01, SC-02 | Helper: `variants` detection, `presets`, `render-template` output validated by `validate` and started with `devcontainer up`; skill checklist for clone, init and repo-create confirmation | git, Docker, devcontainer CLI, local registry | Reuses `tests/lib.mjs` helpers for `up` and cleanup |
| SC-03 | Skill checklist on a fixture npm project with an existing `.devcontainer/`; container exec of `pnpm import` and frozen install | Container from node-devcontainer | Blocked builds are taken from pnpm output |
| SC-04, SC-05 | Helper `inspect` against fixture plugins (with hooks, MCP, `bin/`, shell injection); `validate` rejects Codex plugin, floating ref, `mcp-remote` without egress | Local bare git | Consequential rules, many cases |
| SC-06, SC-07, SC-10 | `validate` + `status` over fixture manifests before and after agent-style edits; skill checklist for the edit itself | — | Egress pruning is checked through `status`'s computed "egress needed by" output |
| SC-08 | `verify-image` against the local registry. An unsigned image must fail. A signed image is verified once real CI images exist (manual until node-devcontainer 10 runs on GitHub) | cosign container, local registry | The failure path is automated; the success path is manual at first |
| SC-09, SC-11 | `status` on fixtures: Preset drift, Pinned Ref ages, missing env names, pending recreate (fixture container whose applied hash differs) | Docker | |
| SC-12, SC-13, SC-14 | Skill checklist: a single recreate prompt, the VS Code settings offer (pointed at a temp settings file via a helper option), no commits, the reminder, untouched `docs/agents/` and `.scratch/` | — | |
| SC-15 | Helper started through a broken symlink and through a symlink to a non-repo folder fails with the re-link message | — | |

**Mechanical checks:**
- A test asserts that the helper source has no code path that executes files from fetched directories (no `spawn` with a path under the fetch dir).
- A test asserts that no subcommand runs `git commit`.

**Risky integration points:**
- the cosign identity regex for GitHub keyless (workflow path and ref);
- the format of attestations pushed by `actions/attest-*` and whether `cosign verify-attestation` reads them;
- the `devcontainer.local_folder` label for locating the running container;
- the applied-hash path written by ticket 07.

**Revisit this design if:** a second consumer of the helper appears, which might justify moving it under `installer/`; the devcontainer CLI gains local-Template apply; or the `gh` CLI on the host becomes ≥ 2.49, which would allow dropping the cosign container for provenance.

## Resolved decisions

- **D1 — where Template files come from.** Always render from the local checkout, with the registry-verified digest. One code path, works offline. The published OCI Template remains for VS Code's "Add Dev Container Configuration". This amends the spec's "Project wiring" constraint.
- **New repos and the frozen lockfile** (found in node-devcontainer 04): the image sets `pnpm_config_frozen_lockfile=true`, so a project with no lockfile fails `pnpm install`. Onboarding a new repo, or a migration that produces no lockfile, must create the first lockfile inside the container with `pnpm install --no-frozen-lockfile` and tell the user it did so.
- **Host git identity** (found in node-devcontainer 05): commits inside the container need host `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL`. `status` reports them as missing in the same way as named secrets.
