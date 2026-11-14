# Allow one read-only Agent Extensions token in project containers

Narrowing [ADR 0007](0007-project-containers-hold-no-github-credential.md), a Quarterdeck-created Consuming Project container may hold one GitHub token restricted to read-only access to `ValeriD/skills`, solely for fetching Agent Extensions. Pomoplan's private Project layer must be installed at container startup; keeping all GitHub credentials out would prevent that fetch. The project's own repository credential and every push-capable credential remain forbidden.

`qd-project-up` takes `QUARTERDECK_EXTENSIONS_TOKEN` from its environment and supplies it only to the creation CLI as `DEV_SETUP_GITHUB_PAT`, using name-only `-e DEV_SETUP_GITHUB_PAT` in the rendered configuration. Base's existing HTTPS `github.com` credential helper is reused. Container-level delivery reaches the startup installer before `remoteEnv`; the launcher never forwards this token. Templates opened by hand are unchanged.

## Consequences

- The user provisions and verifies the fine-grained token's repository and read-only permissions; the helper limits the host, not repositories or operations. The code cannot establish permissions from the token value. The real-token checks live in `quarterdeck/CHECKLIST.md`.
- Per ticket 20 decision 3, visibility in project-container `docker inspect` and to its processes is accepted for the MVP on this laptop. The later Git gate replaces this exposure. The creator writes no value into its export or image; this is not a guarantee against trusted project code deliberately persisting a token.
- Ticket 03's user-owned, read-only mounted file supplies the name to Herdr panes through a non-root parser. That source file is not mounted into the project container.
- Tree-based reuse is unchanged. A changed, removed or newly supplied token takes effect only when the project container is recreated; revoke a compromised token at GitHub and deliberately remove only the identified project container before recreating it.
- Implementation evidence does not yet meet the no-file requirement: the pinned devcontainer CLI persists the container environment into `/etc/environment`, demonstrated with a dummy token. Security-review concern 05 and ticket 08 retain that blocker; inspect visibility acceptance is not approval of filesystem persistence.
- Retained Features are still trusted executable input. Giving the creation CLI this environment changes the earlier credential-free boundary; security-review concern 01 tracks that limitation, and concern 04 tracks permission provisioning. Neither is proof of isolation.
