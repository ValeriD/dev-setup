# Onboard a project

Wire one project to a Variant. Work through the steps in order; each ends on the condition in **bold**. Keep a running list of what changed for the summary.

## 1. Resolve the target

Run `H resolve-target <what the user gave you>`. Add `--projects-root <dir>` only when the user names a different projects root (default `~/Documents/Work/dev`). Branch on `kind`:

- `url`: if `exists` is false, run `git clone <url> <path>`. If the folder already exists, ask whether to use it as it is.
- `local`: use `path` as it is. If `isGitRepo` is false, run `git init` there.
- `new`: create `path`, run `git init` in it. Then ask once: "Create a private GitHub repository `<name>` for it?" Only on yes, run `gh repo create <name> --private --source <path> --remote origin`. On no, it stays local.

If `hasDevcontainer` is true, stop: replacing an existing dev container is the migrate operation, which is not built yet.

After a clone or `git init`, run `H resolve-target <path>` again: the facts from the first run describe a folder that did not exist yet.

**Done when the project folder exists, is a git repository, and the repository question (new repos only) has an answer.** Keep the latest `resolve-target` JSON: later steps use `hasDocsAgents`, `hasPackageJson` and `lockfiles`.

## 2. Pick the Variant

Run `H variants --dir <path>`.

- `ambiguous` false: propose `proposal`, naming the files in `matches[].signals` that point to it. Continue unless the user picks another.
- `ambiguous` true: no or several Variants match. Show every Variant with its `description` and ask which one.

**Done when one Variant name is chosen.**

## 3. Render the Template

1. `H image-digest <variant>` gives `image`, a digest-pinned reference read from the registry. Tell the user the digest is **unverified**: signature and provenance checks are not built yet.
2. `H render-template <variant> <path> --image <image>`. Add `--option patEnvVar=<NAME>` only if the user names a different host variable for their repository PAT.

This writes `.devcontainer/devcontainer.json` and an empty Extension Manifest `.devcontainer/extensions.json`.

**Done when `H validate <path>` returns `ok: true`.** If it reports problems, show them and stop.

## 3a. Adopt Presets

Read [presets.md](presets.md) and follow its **Adopt** section for this project.

**Done when the user picked Presets (or none) and `H validate <path>` returns `ok: true`.**

## 4. Host VS Code settings

Run `H vscode-settings`. If `satisfied` is false, show the `missing` keys and ask once: "Set these in your VS Code user settings (`<path>`)?" ADR 0003 relies on them: VS Code must not copy the host git config or forward the host Docker credential helper into the container.

On yes, edit the file at `path` yourself: add or change only the keys in `missing`, keep every other line and comment as it is, and create the file with just those keys if `exists` is false. Re-run `H vscode-settings`. On no, note in the summary that the settings are still missing.

**Done when `satisfied` is true or the user declined.**

## 5. Start the container and the first lockfile

Ask once: "Start the dev container now? Starting (or later recreating) it ends any agent sessions running inside." On no, skip to step 6 and say in the summary how to start it later (VS Code "Reopen in Container"); the first lockfile then still needs creating, so mention that too.

On yes, run `H up <path>`. Then branch on the `lockfiles` from step 1:

- None: run `H first-lockfile <path>`. The image enforces frozen installs, so this one install runs with `--no-frozen-lockfile` inside the container; it also creates `package.json` when there was none. Tell the user it created `pnpm-lock.yaml` and why.
- Only `pnpm-lock.yaml`: nothing to do.
- `package-lock.json`, `npm-shrinkwrap.json` or `yarn.lock`: tell the user installs will fail inside the container until the project is converted to pnpm (the migrate operation, not built yet). Leave the lockfile alone.

**Done when the container started (and the lockfile step ran), or the user declined.**

## 6. Summary

Print:

- the project path, the Variant, and the image digest (marked unverified);
- every file created or changed (including `package.json` and `pnpm-lock.yaml` from step 5), all uncommitted, for the user to review and commit;
- the Presets adopted, with their entry counts;
- the GitHub repository created, if any;
- anything declined or still missing (VS Code settings, container not started, lockfile conversion).

If `hasDocsAgents` from step 1 is false, end with: "Next, run `/setup-matt-pocock-skills` in this project to set up its issue tracker and agent docs."

**Done when the summary is printed.**
