# 04: Verify the Agent Extensions token's repository and permission boundary

Status: ready-for-human
Type: task

## Evidence

Ticket 08 maps an opaque `QUARTERDECK_EXTENSIONS_TOKEN` value to `DEV_SETUP_GITHUB_PAT`. `base/bin/git-credential-dev-setup` checks HTTPS and `github.com`, but does not limit repository paths or Git operations. `qd-project-up` cannot infer a token's permissions from its value and performs no GitHub permission probe. Automated coverage uses dummy tokens only.

## Impact

A mistakenly supplied project token, classic PAT or write-capable token would violate the read-only/single-repository promise despite correct name-only transport. Every process in the project container can read the permitted token; Docker-authorized users can inspect it (accepted in ticket 20). Tree-based reuse also retains the old token after the source changes; removing a variable is not revocation.

## Code/design pointers

- `quarterdeck/bin/qd-project-up`: environment mapping and tree-label reuse.
- `base/bin/git-credential-dev-setup`: host-only helper restriction (unchanged).
- `.scratch/quarterdeck/issues/08-project-container-receives-a-read-only-extensions-token.md`.
- `.scratch/quarterdeck/design.md`: Project-layer fetch and Credentials.
- `docs/adr/0010-read-only-agent-extensions-token.md` and `quarterdeck/CHECKLIST.md`.

## Review criteria

- [ ] Human verifies fine-grained Contents read-only permission, `ValeriD/skills` as the only selected repository, expiration and revocation procedure.
- [ ] Execute the checklist: skills read succeeds, another known private repository is inaccessible, and a non-mutating dry-run push is denied specifically for write permission. Record statuses only, never credentials.
- [ ] Decide whether human provisioning remains sufficient or permission validation is required before delivery; do not infer scope from token spelling.
- [ ] Confirm operators deliberately recreate the identified project container when changing/removing the token and revoke compromised credentials at GitHub.

This is distinct from concern 01 (project configuration/Feature trust) and concern 03 (credentials already stored in the shared clone Git store). Continue the approved implementation; these checks are not claimed completed.
