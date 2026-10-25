# dev-setups

Hardened, reusable development containers with Claude Code and Codex preinstalled. See `CONTEXT.md` for terms and `ARCHITECTURE.md` for the current shape.

## Node variant

- Image: `variants/node/` (build config), Template: `templates/node/`.
- Tool versions and the base image digest are pinned in `variants/node/Dockerfile`.

## Acceptance suite

Needs Docker and Node 24 (the devcontainer CLI is fetched with `npx` at an exact version).

```sh
npm test
```

It builds `dev-setup-node:test`, starts a throwaway local registry, applies the Template to a fresh git folder, starts the container and probes it as `node`. It removes its containers, volumes and registry afterwards (about a minute).

Covered: Template apply and start, no sudo/capabilities/setuid, pinned Agent versions, auto-update off, normal vs yolo modes, Codex running a shell command (against a local mock model endpoint, no login), read-only git/devcontainer paths, login volume persistence and separation.

### Manual checklist (not automatable)

- Real `claude` login, then rebuild the container: still logged in; second project: logged out.
- `codex login --device-auth` works headlessly and survives a rebuild.
- "Reopen in Container" in VS Code works with the same Template (SC-02).
