# Update the image

Move a Consuming Project to the newest published, verified image of its Variant. Work through the steps in order; each ends on the condition in **bold**.

The digest is the project's trust anchor. A digest reaches `devcontainer.json` only from a `verify-image` result with `verified: true`, and only after the user says yes. When verification fails, the project stays exactly as it is.

## 1. Read the current image

Run `H validate <dir>`. `image` is the current digest-pinned reference and `variant` the Variant it belongs to.

**Done when you hold `image` and `variant`.** If `validate` reports problems, or `variant` is null (the image is not one of this repository's Variants), show that and stop.

## 2. Verify the newest image

Run `H verify-image <variant> --current <image>`. It resolves the Variant's published tag to a digest, checks the cosign keyless signature (only this repository's release workflow on `main` is accepted) and the SLSA provenance attestation, then reads the image labels and compares them with the current image.

- `ok: false`: report `failed` (`resolve`, `cosign`, `signature`, `provenance` or `labels`), `error` and `detail`, say that nothing was changed, and stop. The failure is the result of the update.
- `upToDate: true`: tell the user the project already runs the newest verified image, and stop.
- `changes.newer: false`: the verified image is older than the current one. Say so and stop; going back is a separate request the user makes explicitly.

**Done when `verify-image` returned `verified: true` for a digest different from the current one.**

## 3. Show what changed

From the `verify-image` result, show:

- the current and new digests, and the new `revision`;
- each entry of `changes.versions` (Claude Code, Codex, pnpm: from → to);
- `changes.log`: the commits between the two revisions that touch the image (`changes.logPaths`), one line each. If `log` is null, show `logNote`. If `changes` is null, the current image could not be read: show `current.error` and say that no comparison is available. When it asks for a fetch, run `git -C <dev-setups checkout> fetch` (the checkout is the `repo` from `H check`) and repeat step 2 once.

Then ask once: "Update `.devcontainer/devcontainer.json` to `<new image>`?"

**Done when the user has answered.** On no, nothing is written; say so in the summary.

## 4. Write the digest

On yes, replace the value of `"image"` in `.devcontainer/devcontainer.json` with the verified `image`, keeping every other line and comment as it is. Run `H validate <dir>`, and check that its `image` equals the verified one.

**Done when `validate` returns `ok: true` with the new image.**

## 5. Recreate and summarise

Ask once: "Recreate the dev container now to use the new image? Recreating ends any agent sessions running inside." On yes, run `H up <dir> --recreate`. On no, say that the new image applies at the next recreate (VS Code "Rebuild Container").

Print the old and new digests, the version changes, the changed file (uncommitted, for the user to review and commit) and whether the container was recreated.

**Done when the summary is printed.**
