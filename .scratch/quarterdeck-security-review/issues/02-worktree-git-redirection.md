# 02: Review accepted worktree Git redirection risk

Status: ready-for-human
Type: task

## Evidence and impact

Ticket 07 and design open question 8 accept that a Crewmate can rewrite the pool worktree's `.git` file. FirstMate Git reads in that worktree can consequently load Crewmate-written configuration in the credential-bearing Quarterdeck. Hooks and fsmonitor overrides do not disable other keys such as credential helpers. Egress limits destinations, not all credential misuse. This is a configuration-path analysis, not a credential probe.

Pointers: `docs/adr/0009-accept-worktree-git-redirection-for-the-mvp.md`, `quarterdeck/bin/qd-publish` (explicit clone git directory), `quarterdeck/Dockerfile` (`GIT_CONFIG_*`), `.scratch/quarterdeck/design.md` open question 8.

## Review criteria

- [ ] Confirm the recorded MVP acceptance and its operational scope.
- [ ] Decide when to replace credential-bearing worktree Git reads with the Git gate or another constrained interface.
- [ ] Specify token-free regression cases for the chosen boundary, including non-hook configuration keys.

Implementation of ticket 07 continues; this review does not authorize testing against real credentials.
