# 05: Host-credential isolation and the repo-scoped PAT

**What to build:**
- Inside the container, nothing can use my host ssh-agent, my host git credentials, or VS Code's IPC bridges, whether attached through VS Code or the devcontainer CLI.
- If I configure a fine-grained PAT for the project, `git push` to that repository works.
- Without one, there are no GitHub credentials at all.
- Git commits carry my identity from host env vars.

**Blocked by:** 02 (Walking skeleton)

**Status:** done

## Technical context

**Design:** `.scratch/node-devcontainer/design.md`. Use the "Attach" and "Git" flows. See ADR `docs/adr/0003-vscode-with-mitigations.md` and research sections 2.4–2.5.

- **Modules:**
  - Base material: the VS Code bridge scrubber, via `/etc/profile.d` and a bashrc hook run from a `postStartCommand` in image metadata. It clears `SSH_AUTH_SOCK`, `VSCODE_IPC_HOOK_CLI`, `VSCODE_GIT_IPC_HANDLE`, `GIT_ASKPASS`, `VSCODE_GIT_ASKPASS_*` and `BROWSER`, and removes `/tmp/vscode-*.sock`.
  - Base material: an image-owned read-only file that `GIT_CONFIG_GLOBAL` points at.
  - Base material: a system credential helper that answers only for `https://github.com` and only from the PAT env var.
  - Node Template: a Template option naming the host env var for the PAT (`remoteEnv` via `${localEnv:…}`), plus git identity passthrough.
- **Must not introduce:** ssh-agent forwarding workarounds that keep the agent usable, `gh` auth stored in a volume, or SSH remotes.
- **Validation seam:** container acceptance probes, with simulated VS Code bridge env and sockets; plus a manual VS Code checklist.
- **Coverage:**
  - SC-03.
  - SC-19 (automated helper probe; a real push is manual).
  - SC-02 (manual VS Code checklist in the repo docs).

- [x] `ssh-add -l` fails, and no `vscode-*.sock` remains after start, with simulated VS Code env and sockets
- [x] `git config --show-origin --get-all credential.helper` shows only the image helper, and VS Code cannot add its own
- [x] Host `~/.ssh`, `~/.npmrc`, `~/.aws`, the home directory and the Docker socket are absent
- [x] With a PAT env var set, the helper returns it for github.com and nothing for other hosts; without one it returns nothing
- [x] Commits use the name and email from host env vars
- [x] A manual checklist for VS Code "Reopen in Container" exists and covers SC-02 and the VS Code half of SC-03

## Comments

Git identity is passed as GIT_AUTHOR_*/GIT_COMMITTER_* env vars from host GIT_AUTHOR_NAME/GIT_AUTHOR_EMAIL; if unset on the host, they are empty and commits fail until identity is set. The last checklist item is satisfied by docs/manual/vscode-reopen-in-container.md; the real VS Code run and a real push remain manual. Automated tests: tests/credentials.test.mjs.
