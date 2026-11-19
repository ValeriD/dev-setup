# 01: A Markdown Variant that is built and recorded locally

**Status:** closed
**Model:** Sonnet
**Design slice:** 1 (Markdown Variant)

Terms such as Project, Errand, Crewmate, First Mate, Second Mate, Brief, Variant, Template, Preset and Spec Run are defined in `CONTEXT.md`. Spec: `.scratch/errands/spec.md` (scenarios are cited as `SC-NN`). Design: `.scratch/errands/design.md`.

## What to build

A second Variant, `markdown`, for Projects that hold no code: Base with Markdown tooling and no development toolchain, with the same hardening as the Node Variant. It is not published. The host `quarterdeck` command builds it on this machine and records the built image as allowed, and `qd-project-up` accepts an image from that record in addition to published Variants. This ticket also creates the separate test command for this feature.

## Acceptance criteria

- [x] `variants/markdown/` builds an image from the same pinned base digest as the Node Variant, with Base's material, the managed Claude policy and the egress entrypoint, plus Markdown tooling. It contains no Node development toolchain beyond what Base itself needs.
- [x] `templates/markdown/` holds a Template whose `.devcontainer/` has the same shape and hardening options as `templates/node/`.
- [x] A subcommand of the host `quarterdeck` command builds the Markdown Variant and writes its image id to a local Variant record under `<work root>/quarterdeck/`. The subcommand is documented in the command's header and in `README.md`.
- [x] `qd-project-up` accepts a project whose image is listed in that record. An image that is neither a digest-pinned published Variant nor in the record is refused with a message that names the reason. `QD_PROJECT_TEST_IMAGE` still works as a test seam.
- [x] A container started from the Markdown Variant fails closed when its egress setup cannot run, has the managed Claude policy in place, and runs with capabilities dropped. This is proven by a small targeted test of the built image, not by the Node acceptance files.
- [x] `package.json` has `test:errands`, which runs only `tests/errands.test.mjs`, and `README.md`'s test table has a row for it.
- [x] The Markdown Variant's pins are covered by `scripts/check-pins.mjs` and Renovate in the same way as the Node Variant's; `node scripts/check-pins.mjs` and `node --test tests/pins.test.mjs tests/renovate.test.mjs` pass.
- [x] `.github/workflows/ci.yml` gains no job that publishes, signs or attests the Markdown Variant or its Template. If the new test file is picked up by the existing acceptance job, that job builds what the file needs and stays green.
- [x] `npm run test:errands` and `npm run test:quarterdeck` pass.

## Technical context

**Design:** `.scratch/errands/design.md`, "Design capsule" (Markdown Variant bullet), "Responsibility map" rows for `variants/markdown`, the local Variant record, the host command and `qd-project-up`, and "Constraints".

- **Modules:** `variants/markdown/` and `templates/markdown/` own the image and its Template. The host `quarterdeck` command owns building and recording. `qd-project-up` owns the acceptance rule and only follows the record.
- **Implementation anchors:** `variants/node/Dockerfile`, `variants/node/devcontainer.json`, `templates/node/`, `quarterdeck/bin/quarterdeck` (how it builds the Quarterdeck image), the image check in `quarterdeck/bin/qd-project-up`, `scripts/check-pins.mjs`, `renovate.json`.
- **Reuse:** The Node Variant's Dockerfile structure, image metadata and pinning; the base image's own package manager for the Markdown tooling.
- **Dependency direction:** Nothing under `base/`, `installer/` or `variants/node/` depends on the new Variant. The record is written by the host command and read by `qd-project-up`.
- **Must not introduce:** A release path for a second Variant, a general registry of Variants, a loosening of the published-image rule beyond the record, a development toolchain in this image.
- **Validation seam:** The built image started as a container, and `qd-project-up` run in a real Quarterdeck against the record.
- **Coverage:** The "Markdown Variant hardening" row and the unlisted-image case of the "Launcher and creator rules" row of the Validation plan. It supplies the image SC-01 needs.

## Rules for whoever implements this

- **Tests.** Run only the commands this ticket names. The full acceptance suite (`npm test`, or any glob over all files in `tests/`) is never run by an agent, not while building, not before committing and not in review.
- **No real agent session, no GitHub contact, no secrets.** Use the stub Crewmate fixture, a local bare origin, a stub `gh` and dummy token values. Never read a token file.
- **The FirstMate fork is never edited** (ADR 0008). If something FirstMate is assumed to do proves false, stop at the furthest sound point, leave this ticket open with a comment saying what was seen, and report. Do not patch and do not redesign.
- **Docker.** Act only on containers, volumes and images this work creates and labels. Never any `prune`.

## Blocked by

None (can start immediately).

## Comments

### Resolution (Sonnet agent)

Built in 4796ead. `variants/markdown/` (same base digest, pandoc and a pinned markdownlint-cli2, Claude Code and pnpm for Base's installer, no Codex), `templates/markdown/.devcontainer/`, `quarterdeck build-variant markdown` (devcontainer CLI; records `markdown <image id>` in `<work root>/quarterdeck/local-variants`), and `qd-project-up` accepting an id from that record (refusal names the reason). `tests/errands.test.mjs` with `npm run test:errands` (5 tests, green); `npm run test:quarterdeck` 45/45 green; pins and Renovate tests green.

Decisions worth knowing:
- `base/egress/start.sh` hard-coded `manifests/node.json`; it now passes every non-Base manifest in that directory (identical result for Node). Without this a Markdown container with a project `extensions.json` would fail closed.
- `variants/markdown` has no `variant.json` and `templates/markdown` has no `devcontainer-template.json`, so the host skill does not offer it and the CI Template publish skips it. Ticket 02's `qd-project-new` must substitute `${templateOption:image}` itself (with the recorded image id).
- A Project config using an image id works through `qd-project-up` (it sets updateRemoteUserUID false); a hand-run `devcontainer up` needs the tag, because the CLI's UID step cannot build FROM an id.
- `ci.yml`: only the `tests` path group gained `variants/markdown/`; no publish, sign or attest step touches the Markdown Variant. `quarterdeck/bin/quarterdeck` joined the devcontainer CLI pin's Renovate patterns.

Not checked: the Node acceptance suite after the `start.sh` change (rules forbid the full suite; the Markdown container exercised the same code path). `test:skill` could not run here (host deps not installed); one added assertion there is unrun.

Risk: the record sits in the work root, which mates can write, so a mate could list another local image id. Accepted by the design (the record is only as trusted as the work root).

Review: reviewer agents were not spawned; I did a self-review against the design and spec. Findings: none requiring change beyond the `start.sh` generalisation noted above.
