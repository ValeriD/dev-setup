# Manual checklist: VS Code "Reopen in Container"

Covers SC-02 and the VS Code half of SC-03. VS Code attach is not a security boundary (ADR 0003); this checks the mitigations hold. Run it after changes to the scrubber, git config or Template, with a throwaway project and a fake or single-repo PAT.

Before: on the host, start `ssh-agent` with a key loaded (`ssh-add -l` lists it), and note whether `DEV_SETUP_GITHUB_PAT` (or your chosen host var), `GIT_AUTHOR_NAME` and `GIT_AUTHOR_EMAIL` are exported in the shell that launches VS Code.

## SC-02: attach works

- [ ] Apply the Template to a git folder, open it in VS Code, run "Dev Containers: Reopen in Container". The container starts and the integrated terminal opens as `node` in `/workspace`.
- [ ] Editing and saving a source file works; `git commit` in the terminal works.
- [ ] Writes to `.git/hooks`, `.git/config`, `.devcontainer/` and `.vscode/` fail from the terminal.

## SC-03: VS Code bridges are neutralised

Run in a new integrated terminal, after waiting about 10 seconds:

- [ ] `ssh-add -l` fails (no agent), and `echo "[$SSH_AUTH_SOCK]"` prints `[]`.
- [ ] `ls /tmp/vscode-*.sock` finds nothing.
- [ ] `echo "[$VSCODE_IPC_HOOK_CLI$VSCODE_GIT_IPC_HANDLE$GIT_ASKPASS$BROWSER]"` prints `[]`; `env | grep VSCODE_GIT_ASKPASS` prints nothing.
- [ ] `git config --show-origin --get-all credential.helper` shows exactly one line: `/etc/dev-setup/gitconfig` and `/usr/local/bin/git-credential-dev-setup`. Run `git config --global credential.helper x`: it fails.
- [ ] `code --version` (or `code .`) does not reach the host VS Code.
- [ ] `ls -d ~/.ssh ~/.npmrc ~/.aws ~/.gitconfig /var/run/docker.sock` finds none of them.
- [ ] Without the PAT host var exported before launching VS Code, `printf 'protocol=https\nhost=github.com\n\n' | GIT_TERMINAL_PROMPT=0 git credential fill` prints no password.
- [ ] With the PAT exported and VS Code restarted, the same command prints `password=` for github.com, and `git push` to the PAT's repository works (real PAT, single repository).
- [ ] `git log -1 --format='%an <%ae>'` after a commit shows the host `GIT_AUTHOR_NAME` and `GIT_AUTHOR_EMAIL`.

Known residual risk: VS Code re-creates sockets after start. The scrubber removes them in every new shell, but a process started before that can still hold one.
