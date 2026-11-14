# 03: Review credentials already stored in the shared clone Git directory

Status: ready-for-human
Type: task

## Evidence and impact

Decision 34 requires mounting the clone's entire `.git` read-write with `config` and `hooks` read-only. Read-only does not hide contents: a preexisting authenticated remote URL or other credential saved in Git configuration would remain readable by the project container. Filtering devcontainer environment values cannot remove such data. The token-free fixture uses a local bare origin and proves only that case. No real clone credential was inspected or probed.

Pointers: `quarterdeck/bin/qd-project-up` (Git directory mounts), `.scratch/quarterdeck/design.md` Project container / Mounts, `docs/adr/0007-project-containers-hold-no-github-credential.md`, `tests/quarterdeck.test.mjs` fixture origin setup.

## Review criteria

- [ ] Establish an onboarding invariant excluding persisted credentials from clone configuration and the shared Git store.
- [ ] Decide whether a token-free preflight should reject credential-bearing URLs/configuration, or whether provisioning guarantees this boundary.
- [ ] Define synthetic-only regression fixtures and safe diagnostics for the selected policy.

This is distinct from Feature trust and worktree Git redirection: it concerns credentials already present in a required shared mount. Ticket 07 continues without claiming arbitrary clone contents are credential-free.
