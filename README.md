# dev-setup

Hardened dev containers with Claude Code and Codex preinstalled. Each project gets its own agents, skills, plugins, hooks and MCP servers inside its container, so your host Claude setup stays clean.

Only Node exists so far.

## What you get

Inside the container:

- **Agents:** Claude Code and Codex at pinned versions, with auto-update off. `claude-yolo` and `codex-yolo` skip the permission prompts.
- **No root:** you work as `node`. There is no sudo, every capability is dropped, and `no-new-privileges` is on.
- **Limited network:** outbound traffic is limited to an allowlist. If the allowlist can't be applied, the container stops.
- **No host credentials:** the container sees no host SSH agent and no host git credentials. GitHub access is opt-in, through a fine-grained token for that one repository.
- **Read-only setup files:** the project's `.git/hooks`, `.git/config`, `.devcontainer` and `.vscode` are read-only, so an agent can't change its own sandbox.
- **Safer installs:** pnpm is enforced, and new package versions are held back for 7 days.
- **Agent Extensions:** these are skills, plugins, hooks and MCP servers, declared in `.devcontainer/extensions.json` and pinned to exact commits. They are installed when the container starts.
- **Secrets:** only their names are written down. You set the values on your host.
- **Logins:** your Claude and Codex logins survive a rebuild, and each project has its own.

Terms such as Variant, Template and Preset are defined in [`CONTEXT.md`](CONTEXT.md). Why things work the way they do is recorded in [`docs/adr/`](docs/adr/).

## Use it in a project

### With the `/dev-container` skill (recommended)

Install the skill once from this checkout:

```sh
(cd installer && npx -y pnpm@11.0.0 install --frozen-lockfile)
(cd skills/dev-container/scripts && npx -y pnpm@11.0.0 install --frozen-lockfile)
ln -s "$PWD/skills/dev-container" ~/.claude/skills/dev-container
```

Then, in Claude Code on your host, run `/dev-container`. It can:
- set up a local folder, a GitHub URL or a new repository;
- migrate a project that has its own dev container or an npm or yarn lockfile;
- update the image;
- add or remove egress domains, secret names, Agent Extensions and Presets;
- show the project's status.

It never commits. The skill finds this repository through the symlink, so if you move the checkout, run `ln -sfn` again.

### Quarterdeck (work in progress)

`quarterdeck/` builds the image that runs Herdr and the mates. Put its command on your path once (`ln -s "$PWD/quarterdeck/bin/quarterdeck" ~/.local/bin/quarterdeck`), then `quarterdeck` builds the image if needed, starts the container and attaches to Herdr. `quarterdeck stop` removes it. The work root defaults to `~/work`; set `QUARTERDECK_WORK_ROOT` to change it.

For manual work without an agent, use `quarterdeck start --no-first-mate` on a stopped container. It starts the Docker proxy and Herdr, seeds the same First Mate home and Claude trust/configuration as normal startup, then returns without attaching or opening the `firstmate` workspace. `quarterdeck start` starts normally without attaching; `quarterdeck` (or `quarterdeck attach`) still attaches. A later normal start or attach opens the First Mate even in the same running container, and reuses the same home after stop/start. The option refuses a running container with a `firstmate` workspace; it never stops existing sessions.

The tokens come from one file you own (not root), mode 0600, at `~/.config/quarterdeck/secrets.env` or the path in `QUARTERDECK_SECRETS`, with plain `NAME=value` lines (nothing is sourced or expanded). The command mounts it read-only; it never reads it. A non-root process in the container takes only these names and hands them to Herdr's server, so processes started from Herdr's panes inherit the token variables and a plain `docker exec` shell does not. The mounted source file remains readable by the host user from an exec shell; ticket 21 accepts that access, not filesystem isolation:

| Name | Holds |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | the Claude token |
| `QUARTERDECK_GITHUB_TOKEN` | GitHub token for the project repository; panes get it as `GH_TOKEN` and `DEV_SETUP_GITHUB_PAT` |
| `QUARTERDECK_EXTENSIONS_TOKEN` | read-only token for private Agent Extension repositories, used by `qd-project-up` (ticket 08); every pane holds it |

A name missing or empty in the file is warned about by name when the container starts, and the command repeats the warning. The container user is uid 1000, so the file must be owned by uid 1000 to be readable there. A running container keeps the values it started with: edit the file, then `quarterdeck stop` and `quarterdeck`.

### By hand

```sh
npx -y @devcontainers/cli@0.89.0 templates apply -w . -t ghcr.io/valerid/dev-setup/templates/node
npx -y @devcontainers/cli@0.89.0 up --workspace-folder .
```

On your host, before you start the container:
- `DEV_SETUP_GITHUB_PAT` (optional): a GitHub token scoped to this repository only.
- `GIT_AUTHOR_NAME` and `GIT_AUTHOR_EMAIL`: your git identity, so commits made in the container carry your name.

VS Code's "Reopen in Container" works too, but VS Code passes more of the host into the container than the CLI does ([checklist](docs/manual/vscode-reopen-in-container.md)).

## Work on this repository

| Command | What it tests | Needs |
|---|---|---|
| `npm run test:installer` | the Agent Extension installer | Node 24 |
| `npm run test:skill` | the skill's helper scripts | Node 24 |
| `npm run test:quarterdeck` | the Quarterdeck only: its image, host command, proxy, tokens and tools; skips the Node image build | Docker |
| `npm test` | the whole image: build, Template, hardening, extensions, the skill against a real container | Docker, about 4 min |

`npm test` deletes only the Docker containers, images and volumes it created. `DEV_SETUP_TEST_KEEP=1` keeps them so you can debug. Logins, VS Code and the skill's conversations are checked by hand: [`docs/manual/`](docs/manual/).

Work is tracked as tickets in `.scratch/<feature>/issues/`. The code layout is in [`ARCHITECTURE.md`](ARCHITECTURE.md).

## How releases work

GitHub Actions (`.github/workflows/ci.yml`) runs only the jobs a change needs:

| Change | What runs |
|---|---|
| Docs or tickets | pin check and unit tests |
| Tests, the skill or CI config | the above, plus the full acceptance suite. Nothing is published. |
| `templates/` only | the acceptance suite, then the Template is published against the current image |
| Image inputs, the Monday rebuild, or a manual run | everything: test, then publish and sign the image and the Template |

A publish produces:
- the image `ghcr.io/valerid/dev-setup/node`, tagged `latest` and `sha-<commit>`, signed with cosign, with SBOM and provenance attestations;
- the Template `ghcr.io/valerid/dev-setup/templates/node`, whose default `image` is that exact digest.

The Monday rebuild picks up OS security patches. Renovate opens PRs for every pinned version and Pinned Ref. Nothing is merged automatically.

### Check an image yourself

```sh
IMG=ghcr.io/valerid/dev-setup/node@sha256:<digest>
cosign verify $IMG \
  --certificate-identity-regexp '^https://github.com/ValeriD/dev-setup/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
gh attestation verify oci://$IMG --repo ValeriD/dev-setup
```

The skill runs a stricter version of this check before it writes any digest to a project.

### One-time setup still open

1. Make the GHCR packages `dev-setup/node`, `dev-setup/templates/node` and `dev-setup/templates` public. Until then, nobody can pull them without logging in.
2. Install the [Renovate app](https://github.com/apps/renovate) on this repository only.
