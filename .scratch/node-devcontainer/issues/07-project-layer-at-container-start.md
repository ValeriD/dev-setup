# 07: Consuming Project layer installed at container start

**What to build:**
- Adding a skill or an egress domain to a Consuming Project's `.devcontainer/extensions.json` and recreating the container makes it available, with no image rebuild.
- Removing the entry and recreating removes it.
- The dev user can't tamper with project-layer artefacts.

**Blocked by:** 06 (Extension installer tracer)

**Status:** ready-for-agent

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

- [ ] A project-layer skill appears after recreating the container without rebuilding the image, and disappears after its entry is removed and the container is recreated
- [ ] A project-layer egress domain becomes reachable only in that project
- [ ] An invalid project manifest makes `devcontainer up` fail with an error naming the entry
- [ ] As `node`, project-layer artefacts are not writable
