# 08: Renovate updates every devcontainer CLI pin together

**What to build:** A new `@devcontainers/cli` version arrives as one Renovate PR that updates every place the version is pinned, and that PR passes CI.

**Blocked by:** None. It needs grilling first.

**Status:** needs-triage

## Found (2026-10-28, ci-efficiency 03)

The version `0.89.0` is pinned in three places:
- `.github/workflows/ci.yml` `CLI_VERSION`;
- `tests/lib.mjs` `CLI_SPEC`;
- `skills/dev-container/scripts/commands.mjs` `DEVCONTAINER_CLI`.

`renovate.json`'s regex manager matches only `CLI_VERSION:`, so Renovate would bump `ci.yml` alone.

`skills/dev-container/scripts/test/helper.test.mjs` ("the devcontainer CLI pin matches the acceptance suite and CI") asserts all three agree. Every Renovate PR for the CLI would therefore fail until someone edits the other two by hand.

## Open questions for grilling

- Should the regex manager cover all three files, or should two of them read the version from one source, for example `tests/lib.mjs` and the helper reading it from a shared file?
- Does `tests/renovate.test.mjs` need a case proving the managers match each pin?
