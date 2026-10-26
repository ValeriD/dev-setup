# 12: Test suite cleans up its Docker leftovers

**What to build:**
- After `npm test`, whether it passes or fails, nothing the run created is left on the host. That covers containers, the derived `vsc-…-uid` images, volumes, the registry stub, and temp project folders.
- `DEV_SETUP_TEST_KEEP=1` keeps everything for debugging.
- Each run builds its own image tag by default, so parallel runs (agents, CI) can't collide.
- An image passed in through `DEV_SETUP_TEST_IMAGE` is never removed.

**Blocked by:** None (can start immediately)

**Status:** done

## Technical context

**Design:** `.scratch/manifest-followups/design.md`. Use the "Test harness" row, the "Test teardown" flow, the Constraints, D1 and D3.

- **Modules:** the test harness (`tests/lib.mjs` and a global setup/teardown module wired into the `test` script). The test files only switch to the harness's project-folder helper where they call `mkdtemp` themselves.
- **Implementation anchors:**
  - `tests/lib.mjs`:
    - `IMAGE` defaults to the shared `dev-setup-node:test`;
    - `startTemplateRegistry` uses `docker run -d --rm` and is stopped with `docker rm -f`, without `-v`, so its anonymous volume leaks;
    - `removeProject` doesn't remove the derived image;
    - `headRevision` is compared at assertion time.
  - `tests/acceptance.test.mjs` holds the revision-label test.
  - `.github/workflows/ci.yml` runs the suite with `DEV_SETUP_TEST_SKIP_BUILD` and a supplied image, then pushes that image.
- **Reuse:**
  - Node 24's `node --test --test-global-setup` (setup and teardown in the main process; the env is inherited by test files);
  - the `devcontainer.local_folder` label the devcontainer CLI already sets;
  - `docker run --label` for the registry stub.
- **Dependency direction:** the tests drive the CLI and Docker. The product code gains no test hooks.
- **Must not introduce:**
  - any global prune, or removal by name prefix;
  - the devcontainer CLI's `--id-label`, which replaces its own labels;
  - `runArgs` added to test projects;
  - removal of an image the caller supplied.
- **Validation seam:** Docker state (containers, images, volumes) and the temp folder, compared before and after a run.
- **Coverage:** one end-to-end test that runs the harness on a tiny test file in a child `node --test`. It checks three cases: nothing is left, `KEEP=1` keeps everything, and a supplied image survives. The rest of the suite itself proves that cleanup doesn't break the tests.

- [x] A full `npm test` run leaves no container, image, volume or folder it created, whether it passes or fails (simulate a failure in the child-run test)
- [x] `DEV_SETUP_TEST_KEEP=1` leaves them in place and prints what was kept
- [x] With `DEV_SETUP_TEST_IMAGE` and `DEV_SETUP_TEST_SKIP_BUILD` set, the supplied image is still present after the run
- [x] Two runs started at the same time use different image tags and don't remove each other's resources
- [x] The image revision test passes when a commit lands during the run
- [x] Other projects' containers, images and volumes are untouched (assert that a pre-existing unrelated container and volume survive)

## Comments

Built on branch worktree-agent-a123cd85d8a1343bc:
- `tests/global-setup.mjs` (wired into `npm test` with `--test-global-setup`): run id, run root `dev-setup-test-<id>/`, run image tag `dev-setup-node:test-<id>`, `HEAD` recorded once. Teardown removes containers under the run root or carrying the `dev-setup.test-run` label, the derived images and volumes of the former, the run tag and the root. `DEV_SETUP_TEST_KEEP=1` keeps and prints. A supplied `DEV_SETUP_TEST_IMAGE`, or the shared default with `DEV_SETUP_TEST_SKIP_BUILD`, is never removed.
- `tests/lib.mjs`: `projectDir`, `builtRevision`, `runLabelArgs`; registry stub labelled and stopped with `rm -fv`; `removeProject` also removes the derived image.
- `tests/cleanup.test.mjs` + `tests/fixtures/harness-probe.mjs`: child `node --test` runs (pass, fail, KEEP, supplied image, two concurrent runs, unrelated container and volume survive).
- The revision test (D3) compares with the revision recorded at setup. Checked by construction and the full run; no test lands a commit mid-run.

Deviations: each test file's `after` hook removes its containers before teardown runs, so removing the derived `vsc-...-uid` image had to live in `removeProject` too (teardown sweeps survivors).

Belongs elsewhere: images left by runs before this change (`vsc-dev-setup-proj|legacy|skill-...-uid`, the old shared `dev-setup-node:test`) remain on hosts; a one-off manual cleanup.
