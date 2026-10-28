---
type: technical-design
feature: ci-efficiency
status: approved
base-commit: 61f0821
touches:
  - ci-release
  - templates
  - test-suite
  - architecture-docs
changes-architecture: true
spec: .scratch/ci-efficiency/issues/01-05 and .scratch/node-devcontainer/issues/15 (no spec.md; the product intent is the grilling decisions Q1-Q9 and node 15 Q1-Q3 recorded in those tickets' Comments)
---

## Design capsule

- `.github/workflows/ci.yml` is still the only workflow. A new first job, `changes`, compares the commit with its base using `git diff`. It outputs which path groups changed (`image`, `tests`, `template`) and whether to publish. Every other job reads those outputs; there are no workflow-level `paths` filters.
- The jobs stay separate, with the same permissions: `pins` (always), `acceptance` (no write permissions, no `id-token`), `publish` (signing identity, registry write), `template` (registry write). The test job never holds the signing identity (Q5).
- The Template moves to its own registry name, `ghcr.io/valerid/dev-setup/templates/node` (namespace `valerid/dev-setup/templates`). The image keeps `ghcr.io/valerid/dev-setup/node`. A guard step after the Template publish fails the run if the image's `latest` is not the image digest the run published or used (node 15).
- A `templates/`-only change runs acceptance, then publishes only the Template. Its `image` default is the digest of the image's current `latest`, after `cosign verify` with the same identity the publish job checks. No image is built for publishing (Q8).
- The tested image is handed from `acceptance` to `publish` as a `zstd` tarball, uploaded without a second compression. It is saved only when the image will publish (Q5).
- The acceptance suite builds the image once per run in `globalSetup`, instead of once per test file. Test files then run 3 at a time (`DEV_SETUP_TEST_CONCURRENCY`, default 3), with no serial group (Q3, Q9).
- Per-call overhead in the harness is cut by resolving the pinned devcontainer CLI once per run, instead of `npx -y` on every call. The migrate test's expected-failure step stops paying pnpm's network retry backoff. Containers are not shared any further than today (see "Correction to Q4").
- Non-design: no layer cache (Q6), no candidate tags, no third-party change-detection action, no reusable or split workflows, no new test framework, no change to what the tests prove.

## Existing shape

- **CI** (`.github/workflows/ci.yml`): triggers are `pull_request`, push to `main`, `workflow_dispatch`, and a weekly `schedule`. Jobs:
  - `pins`: pin check, installer and helper unit tests.
  - `acceptance`: `devcontainer build`, host deps, `npm test` with `DEV_SETUP_TEST_SKIP_BUILD`, then `docker save | gzip` and an artifact upload on non-PR events.
  - `publish` (`main` only): download, `gunzip | docker load`, tag `sha-<12>` and `latest`, push, digest check, cosign sign, SBOM, provenance and SBOM attestations pushed to the registry, verify.
  - `template`: rewrites `options.image.default` to the digest and `version` to `0.1.<run number>`, then `devcontainers/action` with `templates-namespace: valerid/dev-setup` (git tag per version on).
  - Every job runs on every event: no path filter.
- **Measured** (runs 40568688924 and 40681113721):

| Step | Time |
|---|---|
| Build | 45s |
| Suite | 8m21s (407s in tests) |
| Save + gzip | 1m13s |
| Upload | 27s (714 MB artifact) |

- **Name clash:** the Template publish moved `ghcr.io/valerid/dev-setup/node:latest` to the Template artifact. It also pushed Template tags `0`, `0.1` and `0.1.5`, collection metadata at `ghcr.io/valerid/dev-setup:latest`, and git tag `template_node_0.1.5`.
- **The skill** resolves the newest image from `templates/node/devcontainer-template.json` `options.image.default` (`ghcr.io/valerid/dev-setup/node:latest`) in `commands.mjs` `variantSource`. It never uses the Template's registry name: onboarding renders the local `templates/<variant>/`.
- **Test harness:**
  - `package.json` `test` runs `node --test --test-global-setup=tests/global-setup.mjs --test-concurrency=1 --test-timeout=900000 tests/*.test.mjs`.
  - Every container test file calls `buildImage()` in `before`, so locally the image is built once per file (all from the layer cache except the last layer). In CI, `DEV_SETUP_TEST_SKIP_BUILD` makes it a no-op.
  - Each file starts its own Template registry on a random loopback port (`startTemplateRegistry`). In-container registry stubs bind container loopback. Derived test images are tagged with `process.pid`. Teardown (node 12 and 14) finds everything by run id and run label.
  - Every `up`, `exec` and `templates apply` goes through `npx -y @devcontainers/cli@0.89.0` (`tests/lib.mjs` `CLI`), which costs about 1.3s per call just to start.
  - The files make roughly 50 `up` or apply calls and 150 `exec` calls.
- **Containers are already shared** within a file: `acceptance.test.mjs` runs all its read-only checks on one project container `a`, and `credentials.test.mjs` does the same. SC-06, SC-09 and SC-12 take 5–6s each because each runs about 5 `exec` calls, at roughly 1s of CLI start-up per call.
- **The migrate test** (`dev-container-skill.test.mjs`, 92s) already uses an in-container registry stub with two tiny packages. It deliberately kills the stub and runs `import-lockfile` to show a failed import leaves files untouched. pnpm's default fetch retries (2 retries, 10s to 60s backoff) are the likely main cost there; this is not yet measured.

## Proposed shape

| Module | Owns | Does not own | Interface |
|---|---|---|---|
| `changes` job (in `ci.yml`) | Deciding what changed. Base: for a PR, the merge base with `github.base_ref`; for a push, `github.event.before`. Then `git diff --name-only base HEAD` matched against the path groups: `image` = `base/`, `installer/`, `extensions/`, `variants/node/`; `tests` = `tests/`, `templates/`, `skills/dev-container/`, `package.json`, `.github/`, `renovate.json`; `template` = `templates/`. `schedule`, `workflow_dispatch`, a missing or all-zero `before`, and an unreachable base count as "everything changed". It needs `fetch-depth: 0` or an explicit fetch of the base. | Running anything; publishing | Job outputs `image`, `tests`, `template`, `publish_image` (image changed, or schedule/dispatch, on `main`) and `publish_template_only` (a `templates/` change with no image change, on `main`) |
| `acceptance` job | Build, host deps, `npm test`. Runs when `image`, `tests` or `template` changed. Saves the image (`docker save \| zstd -T0 -3`) and uploads it with no second compression only when `publish_image` is set | Registry writes, signing | Artifact `tested-image` (`.tar.zst`, 1 day) |
| `publish` job | Unchanged steps (load from `zstd -dc`). Runs only when `publish_image` is set and acceptance passed | Deciding when it runs | Output `digest` |
| `template` job | Fill in the digest and version, then `devcontainers/action` with `templates-namespace: valerid/dev-setup/templates` and `disable-repo-tagging: true`. Gets the digest from `publish`, or, on the template-only path, from the image's current `latest` after `cosign verify` with the publish job's identity and issuer. Ends with the guard: `${IMAGE}:latest` resolves to that digest | Image push or signing | Runs on `!cancelled()` when acceptance passed and either `publish` succeeded or the run is template-only |
| `tests/global-setup.mjs` | Builds the image once per run (moved from the per-file `before`, still skipped by `DEV_SETUP_TEST_SKIP_BUILD`). Resolves the pinned devcontainer CLI once into the run root and hands its path to files by env | Per-file fixtures | Env for files: image tag (already), CLI path |
| `tests/lib.mjs` | `buildImage()` becomes a check that the run's image exists. `cli` uses the resolved CLI path, falling back to `npx` when unset, for example when one file is run directly | | Same exports |
| `package.json` `test` | `--test-concurrency=${DEV_SETUP_TEST_CONCURRENCY:-3}` (npm runs scripts with `sh`) | | Env `DEV_SETUP_TEST_CONCURRENCY` |
| migrate test | The expected-failure `import-lockfile` call runs with pnpm fetch retries at 0 (through the env the helper passes into the container, or the fixture's `.npmrc`), once measuring confirms the backoff is the cost | What the test proves | |
| README, checklist, `ARCHITECTURE.md` CI row | Template name `ghcr.io/valerid/dev-setup/templates/node`; "what runs when" table; CLI-resolution and build-once notes | | |

**Dependency direction:** unchanged. The Template references the image, never the reverse. CI jobs depend on `changes`. Tests depend on everything. The skill doesn't change.

**Changed flows:**
1. **Doc-only push:** `changes` (all false) → `pins` → done.
2. **Test-only change:** `changes` → `pins` + `acceptance` (no save) → done.
3. **Template-only change on `main`:** `changes` → `pins` + `acceptance` (no save) → `template` (verify `latest`, publish, guard).
4. **Image change, weekly run or manual run on `main`:** as today, plus the zstd hand-over, the new namespace and the guard.

**Rollout:**
- The ticket that changes `ci.yml` is a test input, so merging it doesn't publish. Run it once with `workflow_dispatch` on `main`. That moves `latest` back to the image and publishes the Template at its new name.
- The user then deletes the stray tags `0`, `0.1` and `0.1.5` on the `dev-setup/node` package, the `dev-setup` collection-metadata package, and, if wanted, the git tag `template_node_0.1.5`. After that the packages can be made public.

## Reuse decisions

- **Change detection:** `git diff` in a shell step. It's a native tool, and the checkout action is already pinned. No path-filter action, because that would be one more pinned third-party dependency for about ten lines of shell.
- **Skipping jobs:** GitHub's job-level `if` and `needs`. A skipped job counts as passed for required checks, which is why there are no workflow `paths` filters.
- **Compression:** `zstd`, preinstalled on `ubuntu-24.04`. Upload without a second compression using `actions/upload-artifact`'s `compression-level: 0`, on the already pinned action.
- **Checking the current `latest` (template-only path):** the same `cosign verify` call and identity the publish job already runs. The template job needs `cosign-installer` (already pinned) and `id-token: none`; verifying needs no identity.
- **Parallel tests:** `node --test --test-concurrency`, built in. Isolation is already provided by node 12 and 14 (run id, run label, per-file registry ports, pid-tagged derived images).
- **CLI resolution:** `npm` with the existing exact pin, installed into the run root, or `npx` once to warm the cache and record the bin path. The implementer picks whichever keeps the pin in one place (`tests/lib.mjs`). No new dependency.

## Constraints

- What is published is byte-for-byte what acceptance tested. The digest check in `publish` stays.
- The `acceptance` job never gets `id-token: write`, `packages: write` or `attestations: write`.
- `verify-image`'s identity (`ci.yml` on `refs/heads/main`) does not change. The template-only path signs nothing.
- The weekly `schedule` and `workflow_dispatch` always publish.
- The image's registry name, tags (`sha-<12>`, `latest`) and labels do not change. Only the Template's name changes.
- Teardown guarantees from node 12 and 14 hold with 3 files at once: no prune, no name-pattern removal, a supplied image is never removed.
- `DEV_SETUP_TEST_CONCURRENCY=1` must give today's behaviour.
- **Must not introduce:** a layer cache, candidate or unsigned tags in GHCR, a reusable workflow, more workflows, a path-filter action, container sharing beyond today's, or a test framework.

## Correction to Q4

Q4 decided that "only read-only checks in the same file share one container". Reading the code shows they already do: `acceptance.test.mjs` uses one container for SC-06, SC-09, SC-12 and SC-18, and `credentials.test.mjs` does the same for SC-03. The grilling question rested on a wrong premise. Those checks are slow because of devcontainer CLI start-up on each `exec`, about 1s each and roughly 150 calls per run, not because of extra containers. Likewise, the migrate fixture is already two tiny packages on a local stub.

The proposed replacement for ticket 03's scope:
1. Resolve the CLI once per run.
2. Remove the pnpm retry backoff from migrate's expected-failure step.

Both keep what each test proves. This needs the user's approval.

## Validation plan

| Decision | Seam | Level | Evidence |
|---|---|---|---|
| Q1/Q2 change groups | `changes` job outputs | CI on real events: a docs-only PR, a test-only PR, a template-only PR | The run's job list (skipped vs run). Also `actionlint` locally |
| Q1 schedule/dispatch publish | `workflow_dispatch` on `main` | CI | `publish` and `template` succeed; this is also the rollout run |
| Q8 template-only | A `templates/`-only commit on `main` | CI | `template` runs, no `publish`, the guard passes, `templates apply -t ghcr.io/valerid/dev-setup/templates/node` gives the current image digest |
| node 15 guard | Guard step | CI (and one deliberate local dry-run of the shell check against a wrong digest) | The step fails on a mismatch |
| node 15 names | Registry | Manual, after rollout | `imagetools inspect ghcr.io/valerid/dev-setup/node:latest` is an image manifest; node-devcontainer 10's two open boxes |
| Q5 hand-over | `acceptance` and `publish` timings | CI | Save + upload well under today's 1m40s; the digest check in `publish` still passes |
| Q3/Q9 parallel | `npm test` | Local and CI | 52 of 52 pass; suite time compared with 8m21s; `cleanup.test.mjs` still passes; Docker image and container lists equal before and after, as in node 14 |
| Build once | `npm test` locally | Local | One image build in the log; `buildImage` called per file no longer builds |
| CLI resolution, migrate retry | Per-test durations | Local and CI | SC-06/09/12 drop to about 1–2s; migrate measured before and after, with the change kept only if it helps |
| Concurrency override | `DEV_SETUP_TEST_CONCURRENCY=1 npm test` | Local, once | Same results, serial |

**Risky integration points:**
- `github.event.before` on force pushes and on the first push.
- `if` expressions with `needs` on skipped jobs, which need `!cancelled()` and explicit `result` checks.
- `devcontainers/action` with a three-part namespace.
- Docker memory with 3 containers at 8 GB limits on a 16 GB runner (limits, not reservations).

**Revisit the design if:**
- Parallel runs flake, which would bring back Q9's serial group.
- `devcontainers/action` rejects the namespace.
- The CLI resolution can't keep the pin in one place.
