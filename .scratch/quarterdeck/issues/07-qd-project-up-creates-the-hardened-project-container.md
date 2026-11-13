# 07: `qd-project-up` creates the project container from the project's main branch

**Status:** ready-for-agent
**Model:** Sonnet
**Design slice:** 3 (Hardened project container), the fixture half

## What to build

`qd-project-up <home> <project>` creates, from inside the Quarterdeck, a project container through the devcontainer CLI, using the project's `origin/main:.devcontainer/` and the hardened image it names. The container has the decision-34 mounts and nothing else from the Second Mate's home, has no credential for the project's own repository and nothing that can push (the one GitHub credential it may hold is the read-only extensions token of ticket 08), and is created again only when the main-branch `.devcontainer/` changed. Proven on a fixture project; pomoplan is ticket 14.

## Working assumptions and decisions

- ASSUMPTION, undecided by the user ("will see"): design open question 1, what replaces decision 13. `/workspace` in a Quarterdeck-created container holds only the main-branch `.devcontainer/`, read-only; code lives at the pool path, identical in both containers; no link. Containers opened by hand keep the Template's `/workspace`.
- The design requires the image to be `ghcr.io/valerid/dev-setup/<variant>@sha256:...`. A test fixture uses the node image built in the run, which does not match. Assumption: one documented environment variable that relaxes the image check, used only by tests (the way the installer already has a `--git-base` test seam). If the implementer finds a way without a seam, prefer it.
- The fixture's Project layer has no private source. The read-only token for private extension sources (pomoplan's `ValeriD/skills`) is ticket 08.
- DECISION (user): a Crewmate redirecting a worktree's `.git` file is an accepted MVP risk (design open question 8), to be closed later (see the last acceptance criterion).

## Acceptance criteria

- [ ] `qd-project-up` on a fixture project (a Template-shaped `.devcontainer/` rendered from `templates/node`, with a local bare origin) leaves a running container whose bind mounts are exactly: the pool read-write at `/home/node/.treehouse`; `<clone>/.git` read-write with `hooks` and `config` read-only; `<home>/bin` read-only; `<home>/state` read-write; the export read-only at `/workspace`; plus the image's own Claude and Codex volumes (SC-15, SC-16).
- [ ] A write to `.git/hooks` or `.git/config` from inside the container fails read-only; a commit on a worktree in the pool succeeds and is visible in the Quarterdeck at once (SC-15).
- [ ] Even when the fixture's main-branch config declares `DEV_SETUP_GITHUB_PAT` in `containerEnv` and `remoteEnv`, the container has no GitHub variable and no GitHub file from that config (the project's own credential is never passed on; ticket 08 alone may add the read-only extensions token), and `initializeCommand` and every other host-side lifecycle command did not run (SC-16).
- [ ] The container's egress is ready (`wait-ready`) and the Egress Allowlist applies (SC-17).
- [ ] A change to `.devcontainer/` on a branch other than `main` changes nothing; a change on `main` recreates the container; an unchanged main leaves the same container running (the hash of `origin/main:.devcontainer/` decides) (SC-16).
- [ ] The container is labelled with the project, the home and the test run id, and `qd-project-up` removes only containers it labelled.
- [ ] A container opened by hand from a Template still works unchanged, with or without the Quarterdeck: `git diff` shows no change under `base/`, `variants/` or `templates/`, and the existing acceptance suite passes. Nothing FirstMate-specific is added by this ticket to any image.
- [ ] A new ADR (`docs/adr/0009-...`, written with the `domain-modeling` skill) records the MVP decision: a Crewmate can redirect a worktree's `.git` file, so git run in the Quarterdeck in that worktree could read a config the Crewmate wrote. It states what is already stopped (hooks and fsmonitor through environment overrides, `qd-publish` never using the worktree's `.git`), what remains (other keys such as a credential helper, limited by egress), that it is accepted for the MVP, and the option to fix it later (the Git gate, which takes the token out of the Quarterdeck).
- [ ] Every mount source is created first, owned by the user, so Docker does not create root-owned folders.
- [ ] The proxy's allowed list (ticket 04) is extended only by what the devcontainer CLI needed here, each addition recorded in the list's own comment; if the CLI's Feature fetch needs `ghcr.io` or similar in `quarterdeck/extensions.json`, that is added with the reason.

## Technical context

**Design:** `.scratch/quarterdeck/design.md`, "Project container" (all rows) and "Modules" (Project-container creator).

- **Modules:** `quarterdeck/bin/qd-project-up` (Node, `jsonc-parser` as used by `skills/dev-container/`). It writes a Quarterdeck-owned `devcontainer.json` into `/home/valeri/work/quarterdeck/config/<project>/<sha>/`, keeping `image`, `features`, `runArgs` and the non-secret `containerEnv`; dropping `initializeCommand`, other host-side lifecycle commands, `remoteEnv` and any `DEV_SETUP_GITHUB_PAT` or GitHub-named variable; setting `updateRemoteUserUID: false`; then `devcontainer up --workspace-folder <export> --id-label quarterdeck.project=<project>`. Add the home to the labels so the launcher (ticket 09) can find the container for its home.
- **Implementation anchors:** `variants/node/devcontainer.json` (image metadata: egress entrypoint, `capAdd`, `containerEnv`, volumes), `templates/node/`, `skills/dev-container/scripts/` (JSONC handling), `spike/` (`up.sh`, the mount set that worked).
- **Reuse:** devcontainer CLI at the shared `0.89.0` pin; `jsonc-parser`; the published image's own metadata for hardening. The digest was verified when it was committed, so it is not re-verified per start.
- **Dependency direction:** `qd-project-up` -> project's `origin/main` -> devcontainer CLI -> proxy -> Docker.
- **Must not introduce:** `docker run` for the project container (it loses the image metadata), per-ticket mounts, the project's `initializeCommand` running anywhere, a GitHub credential of any kind, changes to the Variant or Template.
- **Validation seam:** `tests/quarterdeck.test.mjs` (fixture project, local bare origin, devcontainer CLI through the proxy).
- **Coverage:** owns SC-15, SC-16, SC-17. Reuses the node image build and `tests/lib.mjs` cleanup.
- **Risk to watch:** the devcontainer CLI through the proxy (exec hijack, `build`, `events`).

## Blocked by

- 01: Quarterdeck image and the `quarterdeck` host command
- 04: The Quarterdeck reaches Docker only through a filtering socket proxy
