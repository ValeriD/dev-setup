Status: ready-for-agent

# Spec: Hardened Node Variant with declarative Agent Extensions

## Problem Statement

I develop mostly Node.js projects and want to work in them with AI coding Agents (Claude Code and Codex). Doing that directly on my machine exposes my host to npm supply-chain attacks. The worms of 2025–2026 (Shai-Hulud, s1ngularity, ChainDrop) run install scripts that steal SSH keys and npm, GitHub, Claude and Codex credentials, send them out, and plant persistence in `.claude` hooks and `.vscode` tasks. Some even drive the local AI CLIs with permission prompts skipped.

I also want to try skills, plugins, MCP servers and hooks without bloating my main Claude Code setup, and to drop the ones I don't like just as easily. Today every experiment is a manual install in my global config, with no record of what is installed or at which version.

## Solution

The `dev-setup` repository publishes a catalogue of hardened development container images, one per **Variant**, starting with Node. Each Variant comes with a **Template**, so a new **Consuming Project** gets a working, secure devcontainer from VS Code's "New Dev Container…" flow or the devcontainer CLI.

Every container:
- blocks outbound traffic except an **Egress Allowlist**;
- runs as an unprivileged user that can't change that;
- never sees my host credentials;
- installs packages under a strict pnpm policy;
- comes with Claude Code and Codex preinstalled at pinned versions.

**Agent Extensions** (plugins, skills, MCP servers, hooks) are declared in JSON **Extension Manifests** at three **Extension Layers**: Base, Variant and Consuming Project. Every entry carries a **Pinned Ref**. Trying an extension means adding one manifest entry, and removing it means deleting the entry.

## User Stories

1. As a developer, I want to create a Consuming Project from a Template in VS Code or the devcontainer CLI, so that I get a secure Node container without hand-writing devcontainer config.
2. As a developer, I want the Consuming Project to reference the Variant image by digest, so that the environment can't change under me without an explicit update.
3. As a developer, I want to attach to the container with VS Code or with the devcontainer CLI from a terminal, so that I keep my preferred editor workflow.
4. As a developer, I want my host SSH keys, ssh-agent, git credential helper, `~/.npmrc`, cloud credentials and home directory to be unreachable from inside the container, so that a malicious package or Agent can't steal them.
5. As a developer, I want all outbound network traffic blocked except the Egress Allowlist, so that stolen data can't be sent out.
6. As a developer, I want the Egress Allowlist to be assembled from the Base, Variant and Consuming Project scopes, and from the domains declared by MCP server entries, so that I can allow a new destination by editing a manifest.
7. As a developer, I want nothing running as the container user, including an Agent, to be able to disable or change the firewall or gain root, so that the protections can't be undone from inside.
8. As a developer, I want pnpm to block dependency build scripts unless reviewed, refuse versions published less than 7 days ago, refuse trust downgrades and install only from frozen lockfiles, even when the project's own config says nothing, so that I'm protected against fresh malicious releases by default.
9. As a developer, I want a per-project way to allow specific build scripts, so that legitimate native dependencies still work.
10. As a developer, I want Claude Code and Codex preinstalled at pinned versions with auto-update off, so that the Agents only change through a reviewed update.
11. As a developer, I want my Claude and Codex logins to survive container rebuilds, in a separate volume per Consuming Project, so that I don't log in every time and can revoke one project's login on its own.
12. As a developer, I want the Agents to start in their normal permission modes, with explicit `claude-yolo` and `codex-yolo` commands for full autonomy, so that unattended autonomy is a choice I make each session.
13. As a developer, I want Codex to work inside the container even though its own sandbox can't start there, so that I can use it with the container as the boundary.
14. As a developer, I want to declare plugins, skills, MCP servers and hooks in one Extension Manifest format, with each entry saying which Agents receive it, so that one line can serve both Claude and Codex.
15. As a developer, I want the Base and Variant layers installed into the image and my Consuming Project layer installed when the container is created, so that shared extensions start fast and project experiments don't need an image rebuild.
16. As a developer, I want any manifest entry without a Pinned Ref to be rejected, so that no extension can silently change underneath me.
17. As a developer, I want the plugins my Agents load to come only from my own manifest-generated, commit-pinned marketplace, so that a third-party marketplace can't push new code to me.
18. As a developer, I want only hooks declared in Extension Manifests to run, and hooks in a repository's own `.claude/` to be ignored, so that ChainDrop-style persistence through project hooks doesn't work.
19. As a developer, I want editor autocomplete and validation when I edit an Extension Manifest, so that mistakes surface before a build.
20. As a developer, I want MCP servers and hooks that need secrets to get them from host environment variables named in the manifest, so that secrets are never baked into images or committed.
21. As a developer, I want `.git/hooks`, `.git/config`, `.devcontainer/` and `.vscode/` to be read-only inside the container, so that code inside can't plant something that runs on my host later.
22. As a developer, I want to optionally give a Consuming Project a fine-grained GitHub token scoped to that one repository, with no push credentials at all when I don't, so that a compromise reaches at most one repository.
23. As a developer, I want images built in CI, signed, and published with build provenance and an SBOM to a public registry, so that I can verify what I run and pull it on any machine without logging in.
24. As a developer, I want automated update PRs for base-image digests, Agent versions and Pinned Refs, never auto-merged for Pinned Refs, so that I stay current while reviewing every change that could bring in code.
25. As a developer, I want images rebuilt weekly, so that OS security patches arrive without my involvement.

## Known Technical Constraints

- **Repository and registry**: the GitHub repository is `ValeriD/dev-setup`. Images and Templates are published publicly to GHCR under that owner. Consuming Projects pin images by digest; tags are only a convenience.
- **Threat model**: assume anything that runs inside the container can read everything inside it, including Agent logins and any GitHub token. Protections must hold even when the container user is malicious.
- **Container runtime**: Docker on a Linux host, rootful for now. The Docker socket is never mounted. The container runs as a non-root user with no sudo, all capabilities dropped and `no-new-privileges`. There is no seccomp/AppArmor relaxation and no `SYS_ADMIN`.
- **Base image**: Node 24 LTS, pinned by digest. Node 24 is the only Node line in the first version.
- **Egress** (ADR 0002):
  - Default deny, applied by a root start-up step before any dev-user process runs, never through sudo. The dev user has no privileges. (Amended during design; see ADR 0002.)
  - DNS is restricted and IPv6 is blocked.
  - The Base allowlist covers the npm registry, GitHub, Anthropic, OpenAI (including the login hosts) and the VS Code endpoints.
  - Anthropic's reference `init-firewall.sh` is not to be copied as-is.
- **Package manager** (ADR 0001):
  - pnpm 11+, with these settings enforced from user-level config in the image: unreviewed build scripts fail, `minimumReleaseAge` 10080 minutes (7 days), `trustPolicy: no-downgrade`, frozen lockfile installs.
  - Git and tarball sources stay blocked for transitive dependencies.
- **VS Code** (ADR 0003): VS Code attach is supported, with mitigations inside the container. `SSH_AUTH_SOCK` is cleared and the forwarded git credential helper is removed. The remaining host-IPC risk is accepted.
- **Agents**:
  - Claude Code and Codex are installed at exact versions, with `DISABLE_AUTOUPDATER=1` and the Codex equivalent.
  - Claude reads organisation-level policy from managed settings installed by the image.
  - Codex runs with its inner sandbox disabled (`danger-full-access`), since the container is the boundary, and with approvals on by default.
  - Login state lives in per-project named volumes (Claude via `CLAUDE_CONFIG_DIR`, Codex via `CODEX_HOME` with file-based credential storage). Headless login must work, using Codex device auth.
- **Extension Manifests** (ADR 0004):
  - JSON with a published JSON Schema.
  - Locations: the Base layer at `extensions/base.json` and the Node Variant layer at `variants/node/extensions.json` in this repo; the Consuming Project layer at `.devcontainer/extensions.json`.
  - Each entry names its kind (plugin, skill, MCP server, hook), its source, a Pinned Ref (40-character commit SHA or exact package version), and its target Agents.
  - Remote (HTTP) MCP servers are the one exception to the Pinned Ref rule, because they have no code to pin. They must declare their egress domains. (Decided during design.)
  - Egress Allowlist entries live in the same files. MCP server entries declare the domains they need.
  - The effective set is the union of the three layers.
- **Where extensions are installed**: Base and Variant extensions install at image build into system locations (`/opt`, `/etc`), never into `~/.claude` or `~/.codex`, which the login volumes hide. Consuming Project extensions install at container creation.
- **Claude plugins**:
  - Delivered through a private marketplace generated from the manifests, with every plugin pinned by `sha`, and through the plugin-seed mechanism for build-time plugins.
  - `strictKnownMarketplaces` allows only that marketplace, and `allowManagedHooksOnly` is enforced.
- **Skill locations**:
  - Claude: managed skills under `/etc/claude-code/.claude/skills`.
  - Codex: `/etc/codex/skills` and `~/.agents/skills` (not the deprecated `~/.codex/skills`).
- **Secrets**: only from host environment variables, passed in per Consuming Project (`remoteEnv` with `${localEnv:…}`). Manifests refer to secrets by name only.
- **Read-only mounts**: `.git/hooks`, `.git/config`, `.devcontainer/`, `.vscode/`.
- **GitHub credentials**: an optional single-repository fine-grained PAT from a host env var. The default is no push credentials.
- **Supply chain of this repo**:
  - The devcontainer lock file (`.devcontainer-lock.json`) is committed and builds use frozen mode.
  - CI is GitHub Actions using the devcontainer CLI, with cosign signing, build provenance and an SBOM.
  - Renovate is configured for digests, Agent versions and Pinned Refs; Pinned Ref PRs are never auto-merged.
  - A scheduled rebuild runs weekly.
- **Starting state**: the Base Extension Layer starts empty.

## Acceptance Scenarios

- **SC-01** (stories 1, 2): A new Consuming Project is created from the Node Template with the devcontainer CLI. Its devcontainer config references the GHCR image by digest, and the container starts and opens on the project.
- **SC-02** (story 3): The same Consuming Project opens in VS Code "Reopen in Container" and works with the devcontainer CLI from a plain terminal.
- **SC-03** (story 4): Inside the container:
  - `SSH_AUTH_SOCK` is unset or unusable, and `ssh-add -l` lists no host keys.
  - No git credential helper returns host credentials.
  - The host's `~/.ssh`, `~/.npmrc`, `~/.aws` and home directory are not visible.
  - The Docker socket is absent.
  - This also holds when attached through VS Code.
- **SC-04** (story 5): Inside the container, a request to a host that isn't allowlisted (e.g. `https://example.com`) fails, as do IPv6 traffic and DNS to an arbitrary resolver. The npm registry, GitHub, Anthropic and OpenAI are reachable.
- **SC-05** (story 6): A domain added to a Consuming Project's Extension Manifest becomes reachable after the container is recreated, and only in that project.
- **SC-06** (story 7): As the container user, `sudo` is unavailable, firewall rules can't be changed, and attempts to gain root fail.
- **SC-07** (story 8): In a project with no pnpm config of its own:
  - Installing a dependency that has a postinstall script fails with a build-script error.
  - Installing a version published less than 7 days ago is refused.
  - An install that would change the lockfile in frozen mode fails.
- **SC-08** (story 9): After the project allows one dependency's build script, that dependency installs and its script runs. Other scripts stay blocked.
- **SC-09** (story 10): `claude --version` and `codex --version` match the versions pinned in the repo, and neither Agent updates itself at runtime.
- **SC-10** (story 11):
  - After a login and a container rebuild, both Agents are still logged in.
  - A second Consuming Project starts logged out.
  - Codex login works headlessly.
- **SC-11** (story 12): Plain `claude` and `codex` start in their normal permission and approval modes. `claude-yolo` and `codex-yolo` start in full-autonomy mode.
- **SC-12** (story 13): Codex runs a shell command inside the container without sandbox-startup errors, and without the container having any extra privileges.
- **SC-13** (stories 14, 15):
  - A skill declared once for both Agents is available to Claude and to Codex.
  - A plugin in the Variant layer is present when the image starts.
  - A plugin added to the Consuming Project layer is present after the container is recreated, without an image rebuild.
  - Removing the entry and recreating the container removes the extension.
- **SC-14** (stories 16, 19): A manifest entry with a branch name, a tag or no ref is rejected with an error naming the entry. Editing a manifest in VS Code gives schema validation and completion.
- **SC-15** (story 17): Claude refuses to add or use a marketplace other than the generated one, and every plugin it loads resolves to the commit SHA in the manifest.
- **SC-16** (story 18): A `SessionStart` hook in a Consuming Project's `.claude/settings.json` does not run. A hook declared in that project's Extension Manifest does run.
- **SC-17** (story 20): An MCP server whose manifest entry names an environment variable gets that variable's value from the host when the container starts. The value appears in no image layer and no committed file.
- **SC-18** (story 21): Inside the container, writing to `.git/hooks`, `.git/config`, `.devcontainer/` or `.vscode/` fails. Normal edits to source files and git commits succeed.
- **SC-19** (story 22):
  - With a PAT configured, `git push` works to that repository and fails for others.
  - Without a PAT, pushing fails and no GitHub credential exists in the container.
- **SC-20** (story 23): A CI run on the default branch publishes a public GHCR image whose cosign signature, provenance and SBOM can be verified, and which can be pulled without registry login.
- **SC-21** (stories 24, 25): Renovate opens PRs for a stale base-image digest, an Agent version and a Pinned Ref, and the Pinned Ref PR is not auto-merged. The scheduled workflow rebuilds and republishes weekly.

## Out of Scope

- Variants other than Node, and Node lines other than 24.
- microVM runtimes (e.g. Docker Sandboxes), rootless Docker and Podman. These are later hardening steps.
- Supporting npm, Yarn or Bun as the enforced package manager.
- Socket Firewall or Aikido Safe Chain as additional layers.
- Choosing which extensions go into the Base layer (it starts empty).
- Fixing VS Code's ssh-agent forwarding upstream. Only in-container mitigations are covered.
- Protecting against an attacker who already controls the host or the Docker daemon.

## Further Notes

- The research behind these decisions is in `docs/research/secure-node-devcontainer.md`, which also lists unverified items to check during design: bubblewrap behaviour under default seccomp, the exact Codex plugin install command, whether Claude reads `.agents/skills`, whether the Agent CLIs install with scripts disabled, and the OpenAI login hostnames.
- Relevant ADRs: 0001 (pnpm enforced in the image), 0002 (Egress Allowlist applied by a root start-up step), 0003 (VS Code with mitigations), 0004 (unified Extension Manifest).
- The local folder is named `dev-setups`, but the published repository is `dev-setup`.
- The folder is not yet a git repository.
