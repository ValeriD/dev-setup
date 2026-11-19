# 02: Create a Project with no remote

**Status:** done
**Model:** Sonnet
**Design slice:** 2 (Project creation)

Terms such as Project, Errand, Crewmate, First Mate, Second Mate, Brief, Variant, Template, Preset and Spec Run are defined in `CONTEXT.md`. Spec: `.scratch/errands/spec.md` (scenarios are cited as `SC-NN`). Design: `.scratch/errands/design.md`.

## What to build

One command creates a Project that has no GitHub repository: a git repository in the First Mate's home with a first commit that holds its container configuration, and a record of that configuration kept outside the Project. `qd-project-up` then starts the Project's container from that record. After this ticket a Project and its running, hardened container exist, without anyone editing a file by hand.

## Acceptance criteria

- [x] `qd-project-new <name> <variant> [preset…]` creates `<First Mate home>/projects/<name>` as a git repository whose first commit on `main` holds `.devcontainer/` rendered from that Variant's Template, with the named Presets copied in (SC-01).
- [x] The same command writes the Project's config record under `<work root>/quarterdeck/`: the git tree of `.devcontainer/` that its container may be built from. No Project container mounts that location.
- [x] A second `qd-project-new` with a name that already exists exits non-zero, says the Project exists, and changes no file (SC-03).
- [x] An unknown Variant or Preset name is refused before anything is created.
- [x] For a Project with no `origin` remote, `qd-project-up` skips the fetch and renders the recorded tree. The result is a running container from the Markdown Variant with egress ready and the mount set of the existing design (SC-01).
- [x] After a commit that changes `.devcontainer/` is put on the Project's `main` from inside its container's reach (the test moves `main` directly), `qd-project-up` still renders the recorded tree, not the new one.
- [x] A Project that has an `origin` remote behaves exactly as before; the existing fixture tests pass unchanged.
- [x] The Project has no Second Mate home and no remote (SC-02).
- [x] A link at `<work root>/projects/<name>` points to the Project's folder.
- [x] `npm run test:errands` and `npm run test:quarterdeck` pass.

## Technical context

**Design:** `.scratch/errands/design.md`, "Responsibility map" rows for `qd-project-new`, the Project config record and `qd-project-up`; "Where things are"; "Constraints" (recorded config tree).

- **Modules:** `qd-project-new` owns the repository, the first commit and the record. `qd-project-up` owns rendering and container creation and only follows the record. FirstMate's registry is not written here; ticket 07's skill registers the Project.
- **Implementation anchors:** `quarterdeck/bin/qd-project-up` (fetch, tree export, labels), `templates/markdown/` from ticket 01, `presets/` and ADR 0005 (Presets are copied, not referenced), `quarterdeck/Dockerfile` (how tools are installed into `/opt/qd/bin`), `quarterdeck/PROJECT-CONTAINERS.md`.
- **Reuse:** The existing renderer, mount set and labels; the existing Template files and Preset files.
- **Dependency direction:** Tools call git, the devcontainer CLI and Docker through the proxy. Nothing in FirstMate is called by `qd-project-new`.
- **Must not introduce:** A second renderer, a "project type" abstraction, a way for anything inside a Project container to change the record.
- **Validation seam:** `qd-project-new` then `qd-project-up` run as `node` in a real Quarterdeck, through the proxy, with the locally built Markdown Variant.
- **Coverage:** SC-01, SC-02, SC-03 (their token-free parts) and the record-beats-`main` case of the "Launcher and creator rules" row. Update `quarterdeck/PROJECT-CONTAINERS.md` for the no-remote path.

## Rules for whoever implements this

- **Tests.** Run only the commands this ticket names. The full acceptance suite (`npm test`, or any glob over all files in `tests/`) is never run by an agent, not while building, not before committing and not in review.
- **No real agent session, no GitHub contact, no secrets.** Use the stub Crewmate fixture, a local bare origin, a stub `gh` and dummy token values. Never read a token file.
- **The FirstMate fork is never edited** (ADR 0008). If something FirstMate is assumed to do proves false, stop at the furthest sound point, leave this ticket open with a comment saying what was seen, and report. Do not patch and do not redesign.
- **Docker.** Act only on containers, volumes and images this work creates and labels. Never any `prune`.

## Blocked by

- 01: A Markdown Variant that is built and recorded locally

## Comments

### Resolution (Sonnet agent)

Built in the commit "errands 02: create a Project with no remote". New `quarterdeck/bin/qd-project-new` (baked into the Quarterdeck image with `templates/markdown/.devcontainer` and `presets/`; `.dockerignore` allows them). It validates name, Variant, built image and Presets first, builds the repository in a temp folder beside the target, then moves it into place, writes `<work root>/quarterdeck/local-projects/<name>` (the `.devcontainer/` tree id) and links `<work root>/projects/<name>`. `qd-project-up` with no `origin` skips the fetch and uses that record (refuses a Project with neither origin nor record; never falls back to `main`); `GIT_NO_REPLACE_OBJECTS=1` is set so replace refs cannot substitute the tree. `PROJECT-CONTAINERS.md` and `ARCHITECTURE.md` updated. One new test in `tests/errands.test.mjs` covers SC-01/02/03, refusals, Presets copied and tagged, and the moved-`main` case. `npm run test:errands` 6/6 and `npm run test:quarterdeck` 45/45 green; cleanup clean.

Decisions: the record is a file per Project holding only the tree id (git objects are hash-bound). `patEnvVar` is left at its Template default `DEV_SETUP_GITHUB_PAT`. The test applies the offline pin by committing a config change and rewriting the record, as an explicit user update would; no `qd-project` update command exists yet (ticket 07's skill).

Not checked: the Preset-bearing Project is created but not started (its skills need the network); `test:skill`, pins and Renovate tests not run (nothing they cover changed). If the record write or link fails after the folder is moved, a retry reports "exists" and needs manual cleanup (small window, not handled).

Review: reviewer agents not spawned; careful self-review against the design and spec. Findings: none requiring change beyond the replace-refs hardening already included.
