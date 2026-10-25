# 07: Consuming Project layer installed at container start

**What to build:**
- Adding a skill or an egress domain to a Consuming Project's `.devcontainer/extensions.json` and recreating the container makes it available, with no image rebuild.
- Removing the entry and recreating removes it.
- The dev user can't tamper with project-layer artefacts.

**Blocked by:** 06 (Extension installer tracer)

**Status:** done

## Technical context

**Design:** `.scratch/node-devcontainer/design.md`. Use the "Container start" flow, the "Removal comes from where things live" capsule bullet, and the Constraints.

- **Modules:**
  - Extension installer: `install --mode start` merges all three layers, validates them together, fetches project sources, and writes project artefacts to root-owned paths on the container filesystem (never volumes).
  - Base material: the start-up step runs the installer before locking the full allowlist. It first locks the Base allowlist, then fetches, then extends to the full allowlist, so the fetch happens under the Base allowlist. It reads the workspace path from an env var set in image metadata.
  - Node Template: a starter `.devcontainer/extensions.json` with `$schema` and an empty list.
- **Reuse:** the installer from 06 and the start-up step from 03.
- **Must not introduce:** a state file or uninstall logic (recreating the container is the uninstall), writes into `~/.claude`, `~/.codex` or `~/.agents`, or a fail-open path when the project manifest is invalid.
- **Validation seam:** container acceptance with a fixture project manifest and a local git fixture reachable under the allowlist.
- **Coverage:** SC-05, SC-13 (project add/remove part).

- [x] A project-layer skill appears after recreating the container without rebuilding the image, and disappears after its entry is removed and the container is recreated
- [x] A project-layer egress domain becomes reachable only in that project
- [x] An invalid project manifest makes `devcontainer up` fail with an error naming the entry
- [x] As `node`, project-layer artefacts are not writable

## Comments

- Implemented: `installer install --mode start` (validates all layers, installs only project skills, writes full allowlist), `start.sh` two-phase lock (Base, fetch, full), `wait-ready.sh` as image `postStartCommand`, `DEV_SETUP_WORKSPACE` in image metadata, Template starter `extensions.json`, `tests/project-layer.test.mjs`.
- Deviation 1: `devcontainer up` does not wait for the Feature entrypoint (the CLI ran `postStartCommand` and returned success before `start.sh` finished, even when it later killed the container). The existing fail-closed test only passed because it polls the container. To meet "an invalid manifest makes `up` fail naming the entry", `start.sh` writes `/run/egress/ready` or `/run/egress/failed` and the image `postStartCommand` first runs `wait-ready.sh`, which fails with the reason. This also removes a race where `up` returned before the allowlist was applied.
- Deviation 2: image metadata now adds `CAP_DAC_READ_SEARCH` (root start-up step only; node's CapEff stays 0, CapBnd is now 0x3004). Without it, root with `--cap-drop=ALL` could not read `.devcontainer/extensions.json` when the project directory is mode 700 (common), and the layer would have been silently skipped. `start.sh` now also fails if the directory is unreadable instead of treating the manifest as absent. ADR 0002 consequence line updated; SC-06 test updated.
- Restart note: a plain `docker restart` re-runs the step on the old filesystem; project skills are overwritten in place, but an entry removed since the last start is not cleaned up until the container is recreated (per the design, recreate is the uninstall).
- Test seam: `DEV_SETUP_GIT_BASE` (passed to `--git-base`) lets a project's containerEnv point fetches at a local path. A project owner can already pin any github.com repo, so this adds no capability for the dev user (the container env is set by the read-only `.devcontainer`).
- Belongs elsewhere: plugin/hook/MCP project artefacts (`managed-settings.d/50-project.json`, project seed, Codex config) are not in this ticket's scope and remain for the plugin/hook/MCP tickets; they should write from the same `installStart`.
