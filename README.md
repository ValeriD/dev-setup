# dev-setups

Hardened, reusable development containers with Claude Code and Codex preinstalled. See `CONTEXT.md` for terms and `ARCHITECTURE.md` for the current shape.

## Node variant

- Image: `variants/node/` (build config), Template: `templates/node/`.
- Tool versions and the base image digest are pinned in `variants/node/Dockerfile`.

## Installer tests

```sh
(cd installer && pnpm install --frozen-lockfile) && npm run test:installer
```

Integration tests of the extension installer CLI against local bare-repo fixtures. No network at test time.

## `/dev-container` skill (host)

Onboards a project (local folder, GitHub URL or new repo) to a Variant from your host Claude Code. Install once from this checkout:

```sh
(cd installer && npx -y pnpm@11.0.0 install --frozen-lockfile)
(cd skills/dev-container/scripts && npx -y pnpm@11.0.0 install --frozen-lockfile)
ln -s "$PWD/skills/dev-container" ~/.claude/skills/dev-container
```

The skill finds this repository through the symlink, so keep the checkout where it is; if you move it, re-link with `ln -sfn`. Helper tests (temp dirs only, no Docker): `npm run test:skill`. The container path is covered by `tests/dev-container-skill.test.mjs` in the acceptance suite. Conversational behaviour is checked by hand with `docs/manual/dev-container-skill-checklist.md`.

## Acceptance suite

Needs Docker and Node 24 (the devcontainer CLI is fetched with `npx` at an exact version).

```sh
npm test
```

It builds the image under a tag of its own (`dev-setup-node:test-<run id>`, so parallel runs don't collide), starts a throwaway local registry, applies the Template to a fresh git folder, starts the container and probes it as `node`. Afterwards, pass or fail, it removes only what the run created: containers, the derived `vsc-…-uid` images, volumes, the registry, the run's image tag and its temp folders. Other projects' Docker resources are never touched. `DEV_SETUP_TEST_KEEP=1 npm test` keeps everything for debugging and prints what was kept. An image given in `DEV_SETUP_TEST_IMAGE` (CI sets it with `DEV_SETUP_TEST_SKIP_BUILD=1`) is used as is and never removed.

Covered: Template apply and start, no sudo/capabilities/setuid, pinned Agent versions, auto-update off, normal vs yolo modes, Codex running a shell command (against a local mock model endpoint, no login), read-only git/devcontainer paths, login volume persistence and separation.

### Manual checklist (not automatable)

- Real `claude` login, then rebuild the container: still logged in; second project: logged out.
- `codex login --device-auth` works headlessly and survives a rebuild.
- "Reopen in Container" in VS Code works with the same Template (SC-02).

## Release pipeline

`.github/workflows/ci.yml`. A first `changes` job works out what the commit touched, and the other jobs run only when needed:

| What changed | What runs |
|---|---|
| Docs or tickets only | Pins and unit tests |
| Tests only (`tests/`, `skills/dev-container/`, `package.json`, `.github/`, `renovate.json`) | Pins, unit tests and acceptance; nothing is published |
| `templates/` only, on `main` | Acceptance, then the Template alone, pointing at the cosign-verified image now at `latest` |
| Image inputs (`base/`, `installer/`, `extensions/`, `variants/node/`), the weekly schedule or a manual run | Everything, as below |

A force push, a first push or an unreachable base counts as "everything changed".

Pull requests run the pin check (`scripts/check-pins.mjs`: every `uses:` needs a full commit SHA, every base image a digest) and, when anything but docs changed, the acceptance suite. A push to `main` that runs everything additionally builds and pushes `ghcr.io/valerid/dev-setup/node` (tags `sha-<12>` and `latest`), signs the digest with cosign keyless, attaches SBOM and provenance attestations (also pushed to the registry), verifies them, then publishes the Template `ghcr.io/valerid/dev-setup/templates/node` (no git tag per version) with its `image` option defaulting to `ghcr.io/valerid/dev-setup/node@sha256:...`, and fails the run unless `node:latest` is still the image it published. Only `GITHUB_TOKEN` is used. The image is built once per run: the acceptance suite tests it (`DEV_SETUP_TEST_SKIP_BUILD=1` skips the suite's own build), then that same image is saved, loaded in the publish job, tagged and pushed.

### Manual steps (one-time)

1. Create the GitHub repository `ValeriD/dev-setup`, add it as a remote and push `main`.
2. Repository settings, Actions, General: allow GitHub Actions; leave workflow permissions at read-only (the workflow requests what it needs).
3. After the first green run on `main`, make both GHCR packages public: Packages, `dev-setup/node` (image) and the Template package (`dev-setup/templates/node`), Package settings, Change visibility, Public. Until then the Template and image cannot be pulled anonymously, and the `devcontainers/action` publish may need the package linked to the repository.
4. Verify from a machine with no login (`DIGEST` from the run summary or `docker buildx imagetools inspect ghcr.io/valerid/dev-setup/node:latest`):

```sh
IMG=ghcr.io/valerid/dev-setup/node@$DIGEST
docker pull $IMG
cosign verify $IMG \
  --certificate-identity-regexp '^https://github.com/ValeriD/dev-setup/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
gh attestation verify oci://$IMG --repo ValeriD/dev-setup
# attestations pushed to the registry, no gh CLI needed (not yet exercised; adjust --type/flags if cosign differs):
cosign verify-attestation --type slsaprovenance1 $IMG \
  --certificate-identity-regexp '^https://github.com/ValeriD/dev-setup/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
npx -y @devcontainers/cli@0.89.0 templates apply -w /tmp/proj -t ghcr.io/valerid/dev-setup/templates/node:0.1.1
grep image /tmp/proj/.devcontainer/devcontainer.json   # must show @sha256:...
```

The dev-container skill runs the same checks with a stricter identity (`ci.yml` on `refs/heads/main` only) through `verify-image`; its success-path check is in `docs/manual/dev-container-skill-checklist.md`.

## Updates (Renovate) and weekly rebuild

`renovate.json` makes Renovate open PRs for the base image digest, GitHub Action SHAs, the pinned pnpm, Claude Code, Codex and devcontainers CLI versions, `installer/` npm dependencies, and the Pinned Ref `sha` of every Extension Manifest entry (`github` skill/plugin sources and plugin marketplaces; git-refs datasource, tracks `HEAD`). npm updates wait 7 days (`minimumReleaseAge`) to match the pnpm policy. Nothing is auto-merged; Pinned Ref and Agent version PRs are explicitly excluded from any future auto-merge rule. `tests/renovate.test.mjs` checks the managers against the repo files.

The `ci` workflow also runs weekly (Mondays 04:17 UTC, default branch) as a full build, acceptance run and publish, so OS security patches (`apt-get install` runs uncached) reach the image without a code change.

### Manual steps

5. Install the Renovate GitHub App (https://github.com/apps/renovate) on `ValeriD/dev-setup` (repository access: only this repo). It picks up `renovate.json`, opens an onboarding-free first batch of PRs, and the Dependency Dashboard issue.
6. Validate the config locally any time: `npx -y -p renovate@44.181.6 renovate-config-validator --strict renovate.json`.
