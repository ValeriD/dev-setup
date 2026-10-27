# 14: Teardown removes the run's untagged build images

**What to build:** A test run that builds the image leaves none of that build's images behind, including the untagged full-size copies. It still never touches an image the caller supplied or anything that isn't the run's.

**Blocked by:** None (node 12 is done)

**Status:** done

## Technical context

**Design:** `.scratch/manifest-followups/design.md`, "Second follow-up decisions" Q4 and Q5, plus the existing "Test teardown" flow and D1.

- **Facts found while grilling:**
  - The leftovers are about 1.4 GB untagged copies of the final image, with identical labels and no revision label, several per run. They are not the BuildKit cache.
  - `devcontainer build` (CLI 0.89.0) accepts `--label`, and labels pass down to images derived from it, such as the CLI's `vsc-…-uid` images.
- **Modules:** the test harness (`tests/lib.mjs` `buildImage`; the teardown in `tests/global-setup.mjs`); `tests/cleanup.test.mjs`.
- **Reuse:** the run id and run label (`dev-setup.test-run=<id>`) from node 12.
- **Must not introduce:** a global prune, removal by name prefix, or removal of a supplied `DEV_SETUP_TEST_IMAGE`. The CI path (`DEV_SETUP_TEST_SKIP_BUILD`) builds nothing, so it labels nothing.
- **Validation seam:** Docker state before and after a run.
- **Coverage:** extend `tests/cleanup.test.mjs`: after teardown, no image with the run label exists, tagged or not.

- [x] The run's image build carries `dev-setup.test-run=<id>`
- [x] After `npm test`, no image with that run's label remains, tagged or untagged
- [x] With `DEV_SETUP_TEST_KEEP=1` the labelled images are kept and listed
- [x] A supplied image and other projects' images survive

## Comments

- The build gets the run label through `runLabelArgs()`; teardown lists images with `docker images -a --filter label=dev-setup.test-run=<id>` and removes each (its tags first, then the id), repeating while a pass removes any, since a copy cannot go before the images built on it. No `-f`.
- A supplied `DEV_SETUP_TEST_IMAGE` is excluded by image id, so it survives even if a build into that tag labelled it.
- `DEV_SETUP_TEST_KEEP=1` now also prints the labelled image ids.
- Coverage: `tests/fixtures/harness-probe.mjs` builds an untagged labelled image; `cleanup.test.mjs` asserts it is gone after pass/fail/parallel runs, kept and listed under KEEP, and that an unlabelled image survives.
