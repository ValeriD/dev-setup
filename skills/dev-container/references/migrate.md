# Migrate an existing project

Move a project that already has its own dev container, or an npm or yarn lockfile, onto a Variant, on a `chore/dev-container` branch. Several steps reuse [onboard.md](onboard.md); follow the named step there. Work through the steps in order; each ends on the condition in **bold**. Keep a running list of what changed for the summary.

## 1. Resolve the target

Run `H resolve-target <what the user gave you>`. A URL that is not cloned yet is cloned as in onboard step 1. A folder that is not a git repository has nothing to migrate from: follow onboard instead.

Run `git -C <path> status --porcelain -- .devcontainer`. Any output means uncommitted work in the old dev container, which step 4 deletes: show it and ask once whether to go ahead. On no, stop.

**Done when `path` is a git repository and the old `.devcontainer/` is either clean or the user accepted losing its changes.** Keep the `resolve-target` JSON: later steps use its `lockfiles`.

## 2. Create the branch

Run `git -C <path> switch -c chore/dev-container`. This branch is the one git write the skill makes. If the branch already exists, ask whether to continue on it (`git -C <path> switch chore/dev-container`); on no, stop.

**Done when `git -C <path> branch --show-current` prints `chore/dev-container`.**

## 3. Pick the Variant

Onboard step 2.

## 4. Replace the dev container

1. `H image-digest <variant>`, and tell the user the digest is **unverified**, as in onboard step 3.
2. `H render-template <variant> <path> --image <image> --replace` (plus `--option patEnvVar=<NAME>` as in onboard step 3). It deletes the old `.devcontainer/` and writes the Template's; `replaced` lists the deleted files. They stay in git history on the original branch.
3. If the project root also has a `.devcontainer.json`, tell the user it is now unused and ask before deleting it.

**Done when `H validate <path>` returns `ok: true`.** If it reports problems, show them and stop.

## 5. Host VS Code settings

Onboard step 4.

## 6. Start the container

Ask the start question from onboard step 5. On yes, run `H up <path> --recreate`: a container built from the old configuration may still exist, and a plain `up` would reuse it. On no, skip to step 8 and say in the summary that the lockfile conversion and the frozen install wait for the container (run the migration again once it runs).

**Done when the container started or the user declined.**

## 7. Lockfile and frozen install

Follow onboard step 5's branches on `lockfiles`, with one change: for an npm or yarn lockfile, ask once: "Convert `<lockfile>` to `pnpm-lock.yaml` with `pnpm import` inside the container? It also sets `packageManager` in `package.json` and removes `<lockfile>`."

- On yes, run `H import-lockfile <path>`. Report `imported` and `packageManager`.
- On no, leave the lockfile as it is and tell the user that installs inside the container fail until the project is converted (run the migration again to convert). Skip the frozen install.

When `pnpm-lock.yaml` now exists, run `H frozen-install <path>`. List `blockedBuilds` by package and version, with the `note` on how to allow or skip each. The user decides; edit `pnpm-workspace.yaml` only for the packages they name.

**Done when the frozen install ran and its blocked builds are listed, or the user declined the conversion and heard why installs will fail.**

## 8. Summary

Onboard step 6, plus:

- the branch `chore/dev-container`, with every change uncommitted on it;
- the old dev container files from `replaced`;
- the lockfile conversion (or that it was declined), `packageManager`, and the blocked builds still to decide;
- `.pnpm-store/`, if it appeared in the project: pnpm's package cache from the container, to leave uncommitted or add to `.gitignore`.

**Done when the summary is printed.**
