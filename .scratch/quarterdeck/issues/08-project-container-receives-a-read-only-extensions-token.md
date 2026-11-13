# 08: The project container receives a read-only token for fetching Agent Extensions, and nothing that can push

**Status:** ready-for-agent
**Model:** Sonnet
**Design slice:** 3 (Hardened project container), private extension sources

## What to build

pomoplan's Project layer pulls 14 skills from the private repository `ValeriD/skills` when the container starts. The user will provide a GitHub token limited to that one repository, read-only, for this. `qd-project-up` hands that token to the project container it creates, early enough for the start-up fetch, so a Quarterdeck-created container can install its Project layer. The rule that stays: a project container the Quarterdeck creates has no credential for the project's own repository and nothing that can push. This token is the one GitHub credential it may hold, it can only read one repository, and it is used only to fetch Agent Extensions.

The user supplies the token value; that is a human step needed only for the real run (ticket 14), not for building or testing this ticket with a dummy.

## Working assumptions and decisions

- DECISION (user): the read-only, single-repository token for `ValeriD/skills` is allowed in the project container. This narrows ADR 0007 ("the variable never reaches a container the Quarterdeck creates") and the design's SC-16 and SC-19 wording ("the project container receives the Claude token only"). The ticket records the narrowing in a new ADR (written with the `domain-modeling` skill, linking ADR 0007; check that skill for whether ADR 0007 itself gets a pointer).
- ASSUMPTION, mechanism for the user to confirm: Base's credential helper answers for `github.com` from `DEV_SETUP_GITHUB_PAT`, and the start-up fetch runs before `remoteEnv` applies (`.scratch/pat-container-env/issues/01`), so the value must be a container-level variable. `qd-project-up` reads a variable named `QUARTERDECK_EXTENSIONS_TOKEN` from its own environment (how the Quarterdeck gets it is ticket 03's open decision) and passes it to the container by name, through a `runArgs` entry `-e DEV_SETUP_GITHUB_PAT` with the value in the devcontainer CLI's own environment, so the value is never written to a file. The cost is that `docker inspect` of the project container shows it; that is accepted because the token is read-only and single-repository.
- The project's own main-branch value of `DEV_SETUP_GITHUB_PAT` (as pomoplan's config has, ticket 07) is still dropped.

## Acceptance criteria

- [ ] With `QUARTERDECK_EXTENSIONS_TOKEN` set to a dummy in `qd-project-up`'s environment, the created container has `DEV_SETUP_GITHUB_PAT` equal to it (compared by hash) at container level, and `git credential fill` for `github.com` inside the container answers with it (Base's helper), and for any other host answers nothing.
- [ ] The value appears in no file: not in the rendered `devcontainer.json`, not in the export under `/home/valeri/work/quarterdeck/config/`, not in logs, not in an image layer.
- [ ] The container never has `GH_TOKEN`, `GITHUB_TOKEN`, `QUARTERDECK_GITHUB_TOKEN` or the project repository's token, and nothing from the project's own config's GitHub variables (SC-16, restated).
- [ ] With the variable unset, `qd-project-up` still creates the container, prints a warning naming `QUARTERDECK_EXTENSIONS_TOKEN`, and a Project layer with a private source then fails with the installer's existing message.
- [ ] The Claude token path of the launcher (ticket 09) is unchanged and still never forwards any GitHub variable; this ticket's token is delivered only at creation.
- [ ] A container opened by hand from a Template is unchanged: `git diff` shows no change under `base/`, `variants/` or `templates/`, and the existing acceptance suite passes.
- [ ] A new ADR records the narrowing and the reason (read-only, one repository, fetching Agent Extensions only), and `quarterdeck/CHECKLIST.md` gets a row for the human with the real token: in the container `git ls-remote` of `ValeriD/skills` works, another private repository is not readable, and a push to `ValeriD/skills` is refused.

## Technical context

**Design:** `.scratch/quarterdeck/design.md`, "Project container" (row "Project-layer fetch"), "Credentials". ADR 0007 is narrowed by this ticket.

- **Modules:** `quarterdeck/bin/qd-project-up` (the one place that adds the variable), tests, a new ADR.
- **Implementation anchors:** `base/bin/git-credential-dev-setup`, `base/git/gitconfig`, `.scratch/pat-container-env/issues/01` (why containerEnv and not remoteEnv), `variants/node/devcontainer.json`.
- **Reuse:** Base's credential helper and the existing `DEV_SETUP_GITHUB_PAT` name; no new helper.
- **Dependency direction:** Quarterdeck environment -> `qd-project-up` -> devcontainer CLI -> container. Nothing in Base, the Variant or the Template learns about the Quarterdeck.
- **Must not introduce:** any credential for the project's own repository or any token that can push in a project container, the token in a file or image, a change to `base/`, `variants/` or `templates/`, forwarding the token through the launcher.
- **Validation seam:** `tests/quarterdeck.test.mjs` with a dummy token (hash comparison, file scan); manual checklist row with the real token.
- **Coverage:** restates SC-16 and the project-container half of SC-19 with the one allowed exception; owns the real-token row.

## Blocked by

- 07: `qd-project-up` creates the project container from the project's main branch
