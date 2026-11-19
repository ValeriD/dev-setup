# Accept worktree Git redirection for the Quarterdeck MVP

A Crewmate can rewrite its worktree's `.git` file. Git run in that worktree in the Quarterdeck can therefore read a config the Crewmate wrote, despite the clone's `config` and `hooks` read-only mounts. The user accepts this risk for the MVP so FirstMate can continue using ordinary shared worktrees without a new Git service.

The Quarterdeck's environment overrides disable hooks and fsmonitor. `qd-publish` additionally uses the clone's explicit git directory, never the worktree's `.git` file. These controls do not stop other configuration keys, including a credential helper; the Egress Allowlist limits destinations but is not a guarantee against credential misuse.

The later Git gate can take the repository token out of the Quarterdeck and apply repository and branch rules. Until then, read-only clone overlays are not a complete trust boundary for Git run in a Crewmate-writable worktree. See [ADR 0007](0007-project-containers-hold-no-github-credential.md).
