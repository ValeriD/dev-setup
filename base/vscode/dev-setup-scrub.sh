# Sourced by login shells (/etc/profile.d), interactive bash (/etc/bash.bashrc
# hook) and run by postStartCommand. Drops the host-credential bridges VS Code
# injects into the container. POSIX sh; must never exit or fail the caller.
unset SSH_AUTH_SOCK VSCODE_IPC_HOOK_CLI VSCODE_GIT_IPC_HANDLE GIT_ASKPASS BROWSER GPG_AGENT_INFO
for _v in $(env | sed -n 's/^\(VSCODE_GIT_ASKPASS_[A-Za-z0-9_]*\)=.*/\1/p'); do unset "$_v"; done
unset _v
rm -f /tmp/vscode-*.sock 2>/dev/null
true
