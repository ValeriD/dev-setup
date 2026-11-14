# 08: The project container receives a read-only token for fetching Agent Extensions, and nothing that can push

**Status:** ready-for-human
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

- [x] With `QUARTERDECK_EXTENSIONS_TOKEN` set to a dummy in `qd-project-up`'s environment, the created container has `DEV_SETUP_GITHUB_PAT` equal to it (compared by hash) at container level, and `git credential fill` for `github.com` inside the container answers with it (Base's helper), and for any other host answers nothing.
- [ ] The value appears in no file: not in the rendered `devcontainer.json`, not in the export under `/home/valeri/work/quarterdeck/config/`, not in logs, not in an image layer.
- [ ] The container never has `GH_TOKEN`, `GITHUB_TOKEN`, `QUARTERDECK_GITHUB_TOKEN` or the project repository's token, and nothing from the project's own config's GitHub variables (SC-16, restated).
- [ ] With the variable unset, `qd-project-up` still creates the container, prints a warning naming `QUARTERDECK_EXTENSIONS_TOKEN`, and a Project layer with a private source then fails with the installer's existing message.
- [ ] The Claude token path of the launcher (ticket 09) is unchanged and still never forwards any GitHub variable; this ticket's token is delivered only at creation.
- [x] A container opened by hand from a Template is unchanged: `git diff` shows no change under `base/`, `variants/` or `templates/`, and the existing acceptance suite passes.
- [x] A new ADR records the narrowing and the reason (read-only, one repository, fetching Agent Extensions only), and `quarterdeck/CHECKLIST.md` gets a row for the human with the real token: in the container `git ls-remote` of `ValeriD/skills` works, another private repository is not readable, and a push to `ValeriD/skills` is refused.

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

## Comments

### Implementation handoff — independent review and closure deferred

Fixed point: `2c203cc0b101c47959c276d4e32ca1f31879b2ef`. Implemented only this ticket's independent creation transport: `qd-project-up` maps `QUARTERDECK_EXTENSIONS_TOKEN` to `DEV_SETUP_GITHUB_PAT` in the devcontainer creation CLI's environment, adds name-only `-e DEV_SETUP_GITHUB_PAT`, warns for absent/empty input, and leaves the project-config credential filtering intact. Other Docker calls use the minimal environment without this token. CLI stderr is captured and the exact token is redacted from reported errors. No new helper, dependency, launcher, model-dispatch change, or Base/Variant/Template change.

ADR 0010 records the narrowing of ADR 0007 and ticket 20's accepted inspect exposure until the Git gate. Architecture, operating docs, relevant design wording and the human checklist are reconciled. The source file delivery is already implemented by ticket 03; its former decision blocker is resolved by ticket 20. The referenced `.scratch/pat-container-env/issues/01` is absent in this checkout; Base's helper and Variant startup metadata were inspected directly.

**Actual validation (dummy credentials only):**

- New selected extensions fixture red: container-level token hash mismatch before implementation; green after creation transport was added.
- Ordinary Template fixture, including absent/empty extensions input: creates successfully and warns by name; existing mount/main-tree reuse/egress/Feature/runArgs rejection checks pass.
- Extensions fixture: container-level and `git credential fill` password hashes match; `example.com` credential fill fails without output; forbidden GitHub variables and the dummy project token are absent; exported files, creator output, container logs and image history contain no supplied extensions-token value.
- Initial full `npm test`: 86 passed, 1 failed, revealing `/etc/environment` persistence. Focused rerun confirmed the path. The failing assertion is retained as an explicit nested TODO, not claimed fixed.
- Final `npm run test:quarterdeck`: **28 passed, 0 ordinary failures, 1 failing TODO**.
- Final full `npm test`: **87 passed, 0 ordinary failures, 1 failing TODO**, including the run's image build and existing Template acceptance tests. Exit success with a TODO is not full ticket acceptance. After tightening the missing-input fixture to explicitly `env -u QUARTERDECK_EXTENSIONS_TOKEN` (rather than empty input), that selected fixture passed again: 1 passed, 0 failed.
- `node --check quarterdeck/bin/qd-project-up`, `node --check tests/quarterdeck.test.mjs`, and `git diff --check` passed. `git diff -- base/ variants/ templates/` is empty.

**Exact blockers / unclaimed evidence:**

1. **Implementation contract blocker, not missing human evidence:** the pinned devcontainer CLI copies the container environment into `/etc/environment` even with `--skip-post-create`. Thus the no-file criterion fails on the ordinary Template. Security-review **05** records the observed dummy-only evidence and review criteria. No after-the-fact file deletion or undocumented CLI-marker workaround was introduced; neither would establish the required behavior reliably. A supported prevention mechanism or an explicit human narrowing remains required.
2. **Real permission/startup evidence:** no real token, private repository fetch, denied private read or denied write was tested. The public fixture has no private source, so the installer's private-source failure with the variable absent is not claimed exercised. After concern 05 is resolved or explicitly accepted, follow `quarterdeck/CHECKLIST.md`: supply a human-provisioned fine-grained Contents read-only token for `ValeriD/skills`, recreate the verified project container, confirm startup installs its pinned Project layer, then record only success/denial statuses for skills read, other-private read, and dry-run push. Repeat absent-token startup on the private-source project and retain the installer's existing `cannot fetch ...` diagnostic without values.
3. **Launcher prerequisite:** ticket 09's launcher does not yet exist in this checkout. Nothing here forwards tokens through it or changes Claude delivery; its future end-to-end allowlist remains ticket 09's proof, not an implemented or tested claim here.
4. **Trust/provisioning limits:** existing security concern **01** was extended for the now credential-bearing CLI's retained Feature/substitution inputs, preserving all initial content and remaining untracked/uncommitted. New concern **04** covers actual GitHub permissions and rotation. Existing concern **03** covers credentials already in the shared Git store. Dummy transport tests cannot establish universal credential absence or no persistence under arbitrary trusted Features. Image history was scanned, not every image layer's filesystem.

**Operator notes:** token changes do not alter tree-based container identity. Updating the source file requires a fresh Herdr session; updating an already-created project's token requires deliberate removal/recreation of only the container whose creator/home/project labels you verified. Revocation is done at GitHub; unsetting the variable does not revoke a reused container's old token. Keep tracing disabled and never print token values, raw credential-fill output or raw inspect output as evidence. No real-token run was performed or requested from the agent.

All acceptance checkboxes and status are left for the parent after independent review; this is not closure. No other implementation ticket was changed. Preexisting modifications to `grill-notes.md` and ticket 07 are preserved outside commits, as is the initially untracked concern 01 (including this session's appended evidence). Concurrent edits appeared in `CONTEXT.md` and additional `grill-notes.md` content during validation; they are not this implementation's changes and remain unstaged. Implementation and documentation are committed together with this ticket path in the commit message.

### Documentation resolution — ticket remains open

Implementation commit: `b9cd6de56b84b3d67bb8e5a3bd6daa47a56eb3fa`. [Independent reviewer reports and dispositions](../reviews/08-independent-review.md) preserve all three reports verbatim.

Only fully satisfied criteria are checked: committed dummy container/helper behavior; unchanged Base/Variant/Template plus the independently passing existing acceptance suite; and ADR 0010 plus the human checklist. The fixed-point-to-implementation diff under `base/`, `variants/`, and `templates/` is empty. Independent finalization run: `node --test --test-global-setup=tests/global-setup.mjs --test-timeout=900000 tests/acceptance.test.mjs` — **11 passed, 0 failed, 0 TODO**. Implementation validation remains **28 passed, 0 ordinary failures, 1 failing TODO** for Quarterdeck and **87 passed, 0 ordinary failures, 1 failing TODO** for the full suite; these are prior committed evidence, not new full-suite runs or a green persistence assertion.

**Review dispositions:** Standards has no findings. Design 1 and Spec 1 are accepted as true blockers; immediate remediation is declined/deferred under user direction to log security concerns and continue against the existing design, not rejection of the constraint. [Security-review 05](../../quarterdeck-security-review/issues/05-devcontainer-cli-persists-extensions-token.md) tracks persistence in `/etc/environment`; the no-file criterion remains unchecked. Spec 2 is an accepted validation gap: the immediate real/private run is deferred because the private-source fixture/credentials are unavailable. Explicit manual instructions are already recorded above and in `quarterdeck/CHECKLIST.md`; the absent-token/private-source criterion remains unchecked.

Remaining blockers are filesystem persistence, private-source startup/permission evidence, universal credential-exclusion proof beyond the dummy fixture and its recorded trust/provisioning limits, and ticket 09's unimplemented launcher proof. Those partial/blocked criteria remain unchecked. **Open; Status: ready-for-human.** No code or other ticket was changed for this finalization; unrelated working edits and untracked security concern 01 are preserved.
