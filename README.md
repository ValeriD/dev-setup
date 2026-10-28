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
