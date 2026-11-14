# 07: `qd-project-up` creates the project container from the project's main branch

**Status:** ready-for-human
**Model:** Sonnet
**Design slice:** 3 (Hardened project container), the fixture half

## What to build

`qd-project-up <home> <project>` creates, from inside the Quarterdeck, a project container through the devcontainer CLI, using the project's `origin/main:.devcontainer/` and the hardened image it names. The container has the decision-34 mounts and nothing else from the Second Mate's home, has no credential for the project's own repository and nothing that can push (the one GitHub credential it may hold is the read-only extensions token of ticket 08), and is created again only when the main-branch `.devcontainer/` changed. Proven on a fixture project; pomoplan is ticket 14.

## Working assumptions and decisions

- ASSUMPTION, undecided by the user ("will see"): design open question 1, what replaces decision 13. `/workspace` in a Quarterdeck-created container holds only the main-branch `.devcontainer/`, read-only; code lives at the pool path, identical in both containers; no link. Containers opened by hand keep the Template's `/workspace`.
- The design requires the image to be `ghcr.io/valerid/dev-setup/<variant>@sha256:...`. A test fixture uses the node image built in the run, which does not match. Assumption: one documented environment variable that relaxes the image check, used only by tests (the way the installer already has a `--git-base` test seam). If the implementer finds a way without a seam, prefer it.
- The fixture's Project layer has no private source. The read-only token for private extension sources (pomoplan's `ValeriD/skills`) is ticket 08.
- DECISION (user): a Crewmate redirecting a worktree's `.git` file is an accepted MVP risk (design open question 8), to be closed later (see the last acceptance criterion).

## Acceptance criteria

- [x] `qd-project-up` on a fixture project (a Template-shaped `.devcontainer/` rendered from `templates/node`, with a local bare origin) leaves a running container whose bind mounts are exactly: the pool read-write at `/home/node/.treehouse`; `<clone>/.git` read-write with `hooks` and `config` read-only; `<home>/bin` read-only; `<home>/state` read-write; the export read-only at `/workspace`; plus the image's own Claude and Codex volumes (SC-15, SC-16).
- [x] A write to `.git/hooks` or `.git/config` from inside the container fails read-only; a commit on a worktree in the pool succeeds and is visible in the Quarterdeck at once (SC-15).
- [ ] Even when the fixture's main-branch config declares `DEV_SETUP_GITHUB_PAT` in `containerEnv` and `remoteEnv`, the container has no GitHub variable and no GitHub file from that config (the project's own credential is never passed on; ticket 08 alone may add the read-only extensions token), and `initializeCommand` and every other host-side lifecycle command did not run (SC-16).
- [x] The container's egress is ready (`wait-ready`) and the Egress Allowlist applies (SC-17).
- [x] A change to `.devcontainer/` on a branch other than `main` changes nothing; a change on `main` recreates the container; an unchanged main leaves the same container running (the hash of `origin/main:.devcontainer/` decides) (SC-16).
- [x] The container is labelled with the project, the home and the test run id, and `qd-project-up` removes only containers it labelled.
- [x] A container opened by hand from a Template still works unchanged, with or without the Quarterdeck: `git diff` shows no change under `base/`, `variants/` or `templates/`, and the existing acceptance suite passes. Nothing FirstMate-specific is added by this ticket to any image.
- [x] A new ADR (`docs/adr/0009-...`, written with the `domain-modeling` skill) records the MVP decision: a Crewmate can redirect a worktree's `.git` file, so git run in the Quarterdeck in that worktree could read a config the Crewmate wrote. It states what is already stopped (hooks and fsmonitor through environment overrides, `qd-publish` never using the worktree's `.git`), what remains (other keys such as a credential helper, limited by egress), that it is accepted for the MVP, and the option to fix it later (the Git gate, which takes the token out of the Quarterdeck).
- [x] Every mount source is created first, owned by the user, so Docker does not create root-owned folders.
- [x] The proxy's allowed list (ticket 04) is extended only by what the devcontainer CLI needed here, each addition recorded in the list's own comment; if the CLI's Feature fetch needs `ghcr.io` or similar in `quarterdeck/extensions.json`, that is added with the reason.

## Technical context

**Design:** `.scratch/quarterdeck/design.md`, "Project container" (all rows) and "Modules" (Project-container creator).

- **Modules:** `quarterdeck/bin/qd-project-up` (Node, `jsonc-parser` as used by `skills/dev-container/`). It writes a Quarterdeck-owned `devcontainer.json` into `/home/valeri/work/quarterdeck/config/<project>/<sha>/`, keeping `image`, `features`, `runArgs` and the non-secret `containerEnv`; dropping `initializeCommand`, other host-side lifecycle commands, `remoteEnv` and any `DEV_SETUP_GITHUB_PAT` or GitHub-named variable; setting `updateRemoteUserUID: false`; then `devcontainer up --workspace-folder <export> --id-label quarterdeck.project=<project>`. Add the home to the labels so the launcher (ticket 09) can find the container for its home.
- **Implementation anchors:** `variants/node/devcontainer.json` (image metadata: egress entrypoint, `capAdd`, `containerEnv`, volumes), `templates/node/`, `skills/dev-container/scripts/` (JSONC handling), `spike/` (`up.sh`, the mount set that worked).
- **Reuse:** devcontainer CLI at the shared `0.89.0` pin; `jsonc-parser`; the published image's own metadata for hardening. The digest was verified when it was committed, so it is not re-verified per start.
- **Dependency direction:** `qd-project-up` -> project's `origin/main` -> devcontainer CLI -> proxy -> Docker.
- **Must not introduce:** `docker run` for the project container (it loses the image metadata), per-ticket mounts, the project's `initializeCommand` running anywhere, a GitHub credential of any kind, changes to the Variant or Template.
- **Validation seam:** `tests/quarterdeck.test.mjs` (fixture project, local bare origin, devcontainer CLI through the proxy).
- **Coverage:** owns SC-15, SC-16, SC-17. Reuses the node image build and `tests/lib.mjs` cleanup.
- **Risk to watch:** the devcontainer CLI through the proxy (exec hijack, `build`, `events`).

## Blocked by

- 01: Quarterdeck image and the `quarterdeck` host command
- 04: The Quarterdeck reaches Docker only through a filtering socket proxy

## Comments

### User decision: restrict `runArgs`

The user approved rejecting unsupported `runArgs` and allowing only explicitly validated Template options. This supersedes unconditional preservation of `runArgs` in the technical context and design. Resume implementation with this restriction, reconcile the design, and test rejection before invoking the devcontainer CLI. This approval does not authorize weakening other security constraints or treating arbitrary Features and environment substitutions as safe.

### Implementation blocked: `runArgs` security contract

Fixed point: `d4b0a3d0c650d57bece5412f2a99c1095ccb7869`; initial working tree clean. Dependencies 01 and 04 were read and are done. No implementation was started and no acceptance criterion is claimed satisfied.

The ticket's technical context and the design's “Project container / Image and config” row require retaining main-branch `runArgs`. That conflicts with the exact mount set, credential exclusion and hardened-container requirements (SC-15–17) unless the creator also restricts those arguments. Docker accepts additional mounts through `--volume`/`--mount`, environment delivery through `--env`/`--env-file`, and hardening overrides such as `--privileged`/`--entrypoint`. In particular, `--env GH_TOKEN` can forward the invoking Quarterdeck process's variable by name even after `containerEnv` and `remoteEnv` have been sanitized. These are API/configuration observations, not live credential probes; no real secret was read or forwarded.

**Decision needed:** may `qd-project-up` reject unsupported main-branch `runArgs` before invoking the CLI, rather than preserve them unconditionally? Recommendation: initially allow only explicitly validated capability-drop, memory and PID-limit options used by `templates/node/.devcontainer/devcontainer.json`; reject everything else pending a documented extension. This changes the accepted project-configuration contract and must be approved rather than silently implemented. Arbitrary retained Features and environment substitutions must also be considered when defining the trust boundary; the proposed argument restriction alone is not a claim of complete sanitization.

Pending that decision, the implementation sketch is deferred at the security boundary. Expected ownership remains `quarterdeck/bin/qd-project-up` → main-branch export → pinned devcontainer CLI → existing proxy; JSONC parsing reuses `jsonc-parser`. Planned validation remains the real fixture seam in `tests/quarterdeck.test.mjs` for SC-15, SC-16 and SC-17, using the existing node image and labelled cleanup. No Variant, Template or product dispatch change is proposed.

Actual baseline validation before stopping:
- `npm run test:quarterdeck`: 26 passed, 0 failed, 0 skipped.
- `npm test`: 85 passed, 0 failed, 0 skipped (including the run's node image build).

These are unchanged-code baseline results, not coverage of ticket 07. No new red/green cycle, ADR, implementation commit or independent implementation review occurred: implementation stopped before those stages because of the material security decision. No manual/live-agent validation was claimed. All criteria remain unticked; ticket 07 stays open. Ticket 20 and all other implementation tickets are untouched.

### Sequential implementation blocked: retained Feature trust boundary

Fixed point: `6620211afd87ab888c537e2ecf5764ac76416235`. Initial tree contained only the user's ready-for-agent status and approved `runArgs` restriction in this ticket; both are preserved. Dependencies 01 and 04, tracker instructions, the spec and full design were read. The approved restriction resolves the earlier `runArgs` decision; it does not resolve Feature trust.

**Concrete remaining conflict:** the design's Project container / Image and config row and this ticket require preserving `features`. Dev Container Feature metadata can itself supply `mounts` (including binds), `containerEnv`, `privileged`, `capAdd`, `securityOpt` and `entrypoint`, and can introduce dependencies through `dependsOn`. Thus a main-branch local Feature can request an additional host bind or privileged mode even when top-level `runArgs` and mounts are restricted. The pinned base image does not pin or validate these additional Features. Feature installation scripts can also modify that image; checking metadata alone is not a complete trust policy. This conflicts with the exact mount set and hardened-container requirements (SC-15–17). The approved comment explicitly does not authorize treating arbitrary Features as safe.

Evidence inspected: `templates/node/.devcontainer/devcontainer.json`, `variants/node/devcontainer.json`, `quarterdeck/Dockerfile`, and the upstream Feature schema at https://raw.githubusercontent.com/devcontainers/spec/main/schemas/devContainerFeature.schema.json (`definitions.Feature.properties`, notably the fields above). This is configuration/schema evidence, not a live exploit or acceptance test. No secret values were accessed.

**Decision needed:** may the creator reject all project-added Features for this fixture slice (leaving the published image's own egress Feature metadata intact), with support for audited/pinned project Features deferred to an explicitly approved policy? Alternatively, specify the trusted Feature set, including local Feature content and transitive dependencies, and permitted runtime metadata. Rejecting all Features changes the documented accepted configuration contract and affects the planned local `playwright-deps` Feature; it must not be silently implemented. Environment substitutions also need fail-closed validation: a non-GitHub-named variable can reference `${localEnv:GH_TOKEN}`. The implementation must never resolve such references against the credential-bearing parent environment.

Sketch is deferred at this material boundary. Expected ownership and reuse remain the Node creator → main export → pinned devcontainer CLI → existing proxy, using `jsonc-parser`, with SC-15/16/17 validated at the real fixture seam. No new abstraction, dependency-direction change, model-dispatch change or other ticket work was started.

Actual check in this session: `docker info --format '{{.ServerVersion}}'` succeeded with `28.1.1`. No test suite was run in this session; the earlier baseline counts above are historical, not new results. No red-green cycle, implementation, ADR, architecture reconciliation or independent implementation reviews occurred because the implement skill requires stopping for this security-contract decision before building. No manual/live-agent validation is claimed. All criteria remain unticked and the ticket remains open; its user-set status is preserved. Ticket 20 and all other implementation tickets are untouched. This comment is committed as the blocker record, not as a completed implementation.

### Implementation and review resolution (2026-11-14)

Fixed point: `1d2908f144e686887ee1b08568d21f2d9909efcc`. Implementation: `04d3a7f`; review fixes: `55b917c`; Base fetch-config correction: `4e3f113`. No other implementation ticket was started and product model dispatch was not changed.

Built `qd-project-up`, image wiring, the real Template/local-origin fixture, exact decision-34 mounts, main-tree reuse/replacement, creator/home/project/run labels, restricted Template arguments, environment/lifecycle filtering, clean CLI environment/home, a benign local Feature build, and explicit readiness. Added ADR 0009 and current architecture/operating documentation. Only proxy POST `containers/{id}/attach` was added: the CLI's attached run failed with 403 without it. No registry allowlist change was needed for the local Feature. Home-specific export paths prevent rendered-mount collisions.

**Validation actually run:**

- Initial narrow fixture red: `qd-project-up: not found`. Subsequent integration failures exposed the missing proxy attach permission; the finished fixture passes through the real proxy and hardened node image.
- Full `npm test`: **86 passed, 0 failed, 0 skipped** (including the run's node image build).
- After review fixes, `npm run test:quarterdeck`: **27 passed, 0 failed, 0 skipped**.
- After the Base fetch-config correction, the selected fixture: **1 passed, 0 failed, 0 skipped**.
- `node --check quarterdeck/bin/qd-project-up` and `git diff --check` passed. No changes under `base/`, `variants/`, or `templates/`.
- No real secret, credential probe, real GitHub/private fetch, pomoplan gate, or live Agent session was used. Those later-ticket/manual checks are not missing fixture implementation. Remote registry Feature fetching is not claimed validated.

**Independent reviews:** fresh `pi -p --model openai-codex/gpt-6-astra --thinking low` processes, one per Standards/Design/Spec axis, with reference-only briefs. Reports are preserved verbatim in `.scratch/quarterdeck/reviews/07-*.md`; the follow-up review uses `04d3a7f` as its fixed point.

Finding dispositions:

1. Standards: commit probe could pass after a failed commit — **Fixed** in `55b917c`: fail on intermediate errors and require HEAD to change, then compare the Quarterdeck's HEAD.
2. Standards: positional mount paths obscure security policy — **Fixed** in `55b917c`: named pool/hooks/bin/state paths.
3. Design: no findings in either round.
4. Spec: arbitrary Features can override mounts/hardening — **Declined as a code change under this ticket**, per the user's explicit instruction to retain Features and defer policy, not as a claim that the guarantee is met. Existing concern 01 was extended with evidence and impact. Feature trust remains unresolved.
5. Spec: preexisting credentials in the shared clone Git store — **Declined as a code change pending human policy**, because decision 34 requires that mount and the user directed security concerns to separate human-review tickets. Recorded separately in security-review issue 03, with token-free evidence, impact, pointers and review criteria. No claim of universal credential absence is made.
6. Spec: missing `remoteEnv` fixture — **Declined with evidence**: the fixture reads `templates/node/.devcontainer/devcontainer.json`, whose `remoteEnv` already contains `DEV_SETUP_GITHUB_PAT`; it substitutes the Template option with `GH_TOKEN`, invokes the creator with a dummy parent `GH_TOKEN`, and adds `containerEnv` separately. Thus both fields are present in the tested main-branch config. The follow-up Spec review repeated this historical claim; the same evidence applies.

Follow-up reviewers found **0 new findings across all three axes**. Worktree Git redirection is separately recorded in security-review issue 02 and ADR 0009 as the user-accepted MVP risk.

**Open / closure decision:** implementation of the fixture slice is complete, but this ticket remains **ready-for-human**, with the credential criterion unticked. Its ordinary Template fixture passes (including both credential environment fields); its broader wording that the project's credential is never passed cannot honestly be guaranteed for arbitrary retained Features/configuration or credentials already stored in the required clone mount. Concerns 01 and 03 need a human trust/provisioning policy or an explicit narrowing of that guarantee. These are recorded security-policy limitations, not a halt to independent implementation or a missing-runtime-evidence claim. No placeholder implementation was added.

Preservation: preexisting `grill-notes.md` and the user's target-ticket comment remain outside commits. Existing untracked security-review concern 01 was extended in place but remains untracked so its preexisting content is not committed; new concerns 02 and 03 are committed. Only this session's target-ticket delta is staged through the index.
