# 04: Hand the tested image to publishing without a tarball

**What to build:** The publish job pushes exactly the image the acceptance suite tested. It doesn't save, gzip, upload, download and load a 1.4 GB tarball to do it.

**Blocked by:** None. It needs grilling first.

**Status:** needs-triage

## Found (2026-10-28)

- Acceptance job: "Save the tested image" (`docker save | gzip`) takes 1m13s, and the upload takes 27s.
- Publish job: downloads the artifact, then `gunzip | docker load`.
- Each run on `main` keeps a 714 MB `tested-image` artifact for one day. Two such artifacts exist right now.
- Pull requests skip the save, so this costs only on `main` and the weekly run.
- The design rule to keep: what is published is byte-for-byte what was tested. The publish job already checks that the pushed digest matches the loaded image.
- The image build itself takes about 45s with no layer cache: there are no Actions caches on the repo.

## Open questions for grilling

- Which way: one job that builds, tests and publishes; pushing an unsigned candidate tag first and promoting it after tests; or keeping the tarball but compressing faster (zstd)?
- If a candidate tag is pushed before tests, how are failed candidates cleaned up, and how do we stop anyone using them?
- Is a build cache (`--cache-from` / `--cache-to` with the GitHub Actions cache) worth it for a 45s build?

## Comments

2026-10-28 grilling, all recommendations accepted:
- Q5: keep the separate acceptance and publish jobs. The job that runs the tests must never hold `id-token: write` or registry write access. The tests install public npm packages, and one of them could otherwise sign an image as the `main` workflow. Use zstd instead of gzip, and skip the save and upload when ticket 01 says nothing will publish.
- Q6: no layer cache for now.
