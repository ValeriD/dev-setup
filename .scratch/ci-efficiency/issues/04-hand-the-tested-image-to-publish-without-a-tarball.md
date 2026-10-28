# 04: Hand the tested image to publishing more cheaply

**What to build:** The acceptance job saves the tested image only when it will be published. It compresses the image with zstd and uploads it without compressing it again. The publish job loads it from zstd. What is published is still exactly what was tested.

**Blocked by:** 01 (same file, and the "will publish" output)

**Status:** ready-for-agent

## Technical context

**Design:** `.scratch/ci-efficiency/design.md` (`acceptance` and `publish` rows, Q5 and Q6).

- **Found:** "Save the tested image" (`docker save | gzip`) takes 1m13s, the upload 27s, and the artifact is 714 MB. `actions/upload-artifact` zips again by default.
- **Modules:** `.github/workflows/ci.yml` `acceptance` (the save and upload steps, with `if` on 01's publish output) and `publish` (the load step).
- **Reuse:**
  - `zstd`, preinstalled on `ubuntu-24.04`: `docker save … | zstd -T0 -3 -o image.tar.zst`, and in publish `zstd -dc image.tar.zst | docker load`.
  - `actions/upload-artifact` input `compression-level: 0`.
- **Must not introduce:** one combined test-and-publish job, `id-token` or registry write on `acceptance`, candidate tags, or a layer cache. The `publish` digest check stays.
- **Validation seam:** step timings of the next CI run that publishes (a manual `workflow_dispatch` is fine), plus `actionlint`.
- **Coverage:** no suite change.

- [ ] The save and upload are skipped when nothing will publish
- [ ] The image goes over as `zstd`, uploaded with `compression-level: 0`, and the publish digest check still passes
- [ ] Save plus upload time on a publishing run is recorded in Comments, compared with 1m40s

## Comments

2026-10-28 grilling, all recommendations accepted:
- Q5: keep the separate acceptance and publish jobs. The job that runs the tests must never hold `id-token: write` or registry write access. The tests install public npm packages, and one of them could otherwise sign an image as the `main` workflow. Use zstd instead of gzip, and skip the save and upload when ticket 01 says nothing will publish.
- Q6: no layer cache for now.

Rewritten as ready-for-agent through `/to-tickets` on 2026-10-28.
