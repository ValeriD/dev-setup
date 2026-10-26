# 03: Add and remove extensions after review

**What to build:** I ask "add <extension> from <owner/repo>". The skill resolves the commit SHA and shows me what the extension contains:
- hooks, MCP servers, scripts and `bin/`;
- skill shell injection and `allowed-tools`;
- detected hosts, labelled as heuristic.

It writes the pinned entry and its egress only after I approve. Removing an extension deletes its entry and any egress only it needed. Codex plugins and unpinnable entries are refused with a reason.

**Blocked by:** 01 (Skill foundation and onboarding); node-devcontainer 08 (Claude plugins and hooks)

**Status:** done

## Technical context

**Design:** `.scratch/dev-container-skill/design.md` (approved), with spec `.scratch/dev-container-skill/spec.md`. Glossary: `CONTEXT.md`. ADRs 0001, 0003, 0004, 0005. Ticket rule: never edit tickets other than your own; new needs go into new tickets.

- **Modules:** Skill helper `inspect <source> [--ref]`; the skill prompt's add/remove flows.
- **Reuse:** the installer's fetch-by-SHA and its kind × Agent table, where Codex `plugin` is rejected (node design D3).
- **Constraints:**
  - Fetched content goes into a fresh `mkdtemp` directory and is only read, never executed.
  - Include a mechanical test asserting the helper never spawns anything under a fetch directory.
- **Validation seam:** helper integration tests against fixture plugins and skills in local bare git repos (with hooks, MCP, `bin/`, shell injection), plus checklist entries for approve and decline.
- **Coverage:** SC-04, SC-05, SC-06 (extension removal).

- [x] `inspect` reports the resolved SHA and the full inventory for fixture sources, and fails for unreachable refs
- [x] Declining writes nothing; approving writes a pinned entry plus egress, and `validate` passes
- [x] Codex `plugin`, floating refs, and `mcp-remote` without egress are refused with a reason
- [x] Removal prunes only egress that no remaining entry needs
- [x] A test proves no fetched file is executed

## Comments

**Built:**
- Helper `inspect <source>` (`skills/dev-container/scripts/inspect.mjs`). Sources:
  - `owner/repo` or a GitHub URL, with `--path`, `--ref`, or `--plugin` for a marketplace plugin. A branch or tag is resolved to a SHA with `git ls-remote` (annotated tags are peeled). The content is fetched with the installer's `fetchBySha` into a fresh `mkdtemp` directory, read with fs calls only, then deleted.
  - The inventory lists: hooks (`hooks/hooks.json` and `plugin.json`), MCP servers (`.mcp.json` and `plugin.json`), scripts, `bin/`, skills, `allowed-tools`, shell-injection lines, and hosts seen in URLs (labelled heuristic).
  - The helper proposes the entry and refuses it with reasons. It reuses the installer's `validateManifest` (kind x Agent, Pinned Ref, schema) and adds the D3 explanation. Marketplace external sources without a SHA are refused through the installer's `externalSource`, which is now exported. Symlinked content is refused too.
  - With `--project`, it marks domains that are already allowed (Base and project) and reports clashes with existing entries (e.g. a skill name declared twice).
- Helper `plan-remove <dir> <index>`. It is read-only and shows: the entry's own egress, the top-level egress domains its pinned content names (fetched again) that no staying entry or adopted Preset needs, and a note when the entry is tagged with a Preset.
- `manifests.mjs` holds the manifest and Preset reading code shared with `plan-remove-preset`, moved out of `commands.mjs` without behaviour changes.
- Skill text: `references/extensions.md` (add, remove, finish), routing in SKILL.md, and adding an entry to a Preset in `presets.md`. Checklist rows X1–X6.
- Tests are in `scripts/test/inspect.test.mjs`: local bare-git fixtures, plus the registry stub for npm. A mechanical test checks that every `spawn`/`spawnSync` in the helper sources is `git|docker|npx|npm`, that `inspect.mjs` has no `cwd` and no dynamic `import(`, and that there are no `exec*` calls and no `commit`. Every fixture script, hook, `bin` file and shell-injection line touches a marker file, and the last test asserts the marker was never created and no fetch directory was left behind. The older two-file mechanical test in `helper.test.mjs` was folded into this one.

**Deviations / additions:**
- `npm:<package>[@range]` sources for stdio `mcp` were added, so that "add the Playwright MCP" (from the spec) works. They read `npm view` metadata only (version, publish time, bin, lifecycle scripts, dependencies). Nothing is downloaded or run. The proposed version is the newest matching one that is at least 7 days old, matching the image's pnpm policy. A version that is too new, or a package with no `bin`, is refused. `tests/fixtures/registry-stub.mjs` now includes `bin` in each version's packument (as real registries do).
- `https://` URL sources produce an `mcp-remote` entry with the URL host as entry egress, plus an optional `--bearer-token-env`. A floating ref passed to `inspect` is resolved to a SHA, not refused. Floating refs and `mcp-remote` without egress are refused by `validate` (existing installer rules; covered by tests here).
- Egress for kinds without an entry `egress` field (skill, plugin, hook) goes to the project's top-level `egress`. Top-level egress has no owner, so `plan-remove` finds candidates by fetching the removed entry's pinned content again and matching the hosts it names. This is a proposal that the user confirms, the same approach as `plan-remove-preset`.

**For the product owner:**
- Adding an optional `egress` field to skill, plugin and hook entries in the installer schema would make "egress only it needed" exact, with no re-fetch and no heuristic. The installer's `mergeLayers` already merges `entry.egress` for any kind. This is a public schema change, so it was not made here.

**Belongs elsewhere:**
- Removing the `remoteEnv` lines for secrets that a removed entry named: ticket 09 (remove egress domains and secrets).
- Pinned Ref ages and drift in `status`: ticket 07.
- Inspecting the installed code of npm MCP packages (not just their metadata) would need a tarball fetch: not built.
