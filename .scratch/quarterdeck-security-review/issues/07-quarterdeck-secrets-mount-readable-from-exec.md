# 07: Review outside-exec access to the Quarterdeck secrets mount

Status: ready-for-human
Type: task

## Evidence and impact

Static inspection at `acb9336fc52075a45f3de63431a7537442a0f309`: `quarterdeck/bin/quarterdeck` keeps the user-owned secrets file mounted read-only at `/run/quarterdeck/secrets.env`. Its documented supported owner is uid 1000, mode 0600. `quarterdeck/bin/qd-server` reads it as `node` (uid 1000), and the mount remains available. A plain `docker exec -u node` has the same filesystem identity; read-only prevents writes, not reads. Default exec also starts as root. Absence of inherited token environment variables therefore does not establish ticket 13 / SC-19's requirement that an outside shell cannot read the token.

Pointers: `quarterdeck/bin/quarterdeck` `start()` and token-file header; `quarterdeck/bin/qd-entry` `drop()`; `quarterdeck/bin/qd-server` parser; `tests/quarterdeck.test.mjs` SC-19 environment checks and disk scan (the scan omits `/run`); `.scratch/quarterdeck/issues/20-token-delivery-mechanism-decided.md` decision 1.

Impact: an outside exec process can potentially read all credentials in the mounted file, despite having no token variables. This is distinct from concern 01 (project config trust), concern 03 (shared clone Git store), and concern 05 (extensions-token persistence in the project container). No real file, credentials, container or process environment was inspected; this is code evidence, not a runtime exploit result.

## Review criteria

- [ ] Decide whether to retain the strong outside-shell unreadability requirement or explicitly narrow it to environment non-inheritance. Ticket 20's file choice is not itself an explicit acceptance of this discrepancy.
- [ ] If retained, approve a supported delivery/lifetime boundary that prevents outside exec reads; do not treat read-only mounts or UID equality as isolation.
- [ ] Validate the selected policy with disposable dummy secrets only, including the mounted-file path and node/default exec identities; print only outcomes, never values. Review other same-UID access paths before claiming isolation.
- [ ] Reconcile SC-19, ticket 13 and credential documentation/tests with the approved decision before real-token validation. No real credential probe is needed to decide this issue.
