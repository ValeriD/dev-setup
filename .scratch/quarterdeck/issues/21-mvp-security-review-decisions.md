# 21: MVP decisions on the security review and two unmet criteria

**Status:** ready-for-agent
**Model:** Sonnet
**Design slice:** credentials, project container

## Decision

This ticket records the user's answers of 2026-11-14 to the security review tickets in `.scratch/quarterdeck-security-review/issues/` and to two criteria that the implementation could not meet. The published tickets and the review tickets are not edited; where this ticket differs from them, this ticket holds. Notes: `.scratch/quarterdeck/grill-notes.md`, decisions 88 to 94.

1. **The skills token in `/etc/environment` is accepted until the Git gate** (review 05; ticket 08's "appears in no file" criterion). The devcontainer CLI writes container variables there and has no supported switch against it. Every process in the project container can already read the token from its environment, and its visibility in `docker inspect` is accepted (ticket 20, decision 3). The requirement is narrowed to: the token appears in no file outside the project container (not in the rendered config, the export under the work root, logs, or an image).
2. **SC-19 is narrowed** (review 07; ticket 13). The requirement becomes: a plain `docker exec` shell in the Quarterdeck does not receive the tokens as environment variables. That the mounted secrets file is readable from such a shell is accepted: only the host user can run `docker exec`, and that user can read the file on the host.
3. **Devcontainer Features are accepted for the MVP** (review 01) under one rule: the Quarterdeck only starts Projects whose `main` branch the user controls. Features and retained configuration from that branch are trusted input. The restriction on unsupported `runArgs` stays. Repositories the user does not control wait for the custom socket proxy.
4. **Credentials in a clone's git configuration** (review 03): accepted for the MVP. A check that refuses such a clone belongs to the hardening feature after the MVP.
5. **The publish session reading worktree content** (review 06) and **worktree git redirection** (review 02): accepted for the MVP as the spec's accepted risk of a misled mate, limited by the GitHub token being scoped to one repository. The hardening pair and the Git gate are the fixes (decisions 49, 51 and 52).
6. **Review 04** (the skills token's scope) is a check the user performs by hand. No decision is needed.

## What to build

Documentation and tests only. No change to product behaviour.

- Record decisions 1 to 5 where the accepted risks already live: ADR 0010 for decision 1, the spec's accepted risks or a new ADR for 2, 3 and 5, and `quarterdeck/PROJECT-CONTAINERS.md` and `quarterdeck/CHECKLIST.md` wherever they state the older, stronger wording.
- Turn the failing TODO test "extensions token is absent from container files" into a passing test of the narrowed requirement in decision 1.
- Bring the SC-19 test and its checklist row in line with decision 2.
- Add a resolution comment to each review ticket (01, 02, 03, 05, 06, 07) pointing here, and set its Status to done. Leave review 04 open for the user.

## Acceptance criteria

- [ ] Decisions 1 to 5 are recorded in an ADR or the spec's accepted risks, each naming the feature that removes the risk.
- [ ] `npm run test:quarterdeck` passes with no failing TODO for the extensions token; the test asserts the token is in none of: rendered config, work-root export, logs, image.
- [ ] The SC-19 test asserts that a `docker exec` shell has no token variable, and no document claims the secrets file is unreadable from such a shell.
- [ ] No document describes Features, the clone's git store or the publish session as proven isolation.
- [ ] Review tickets 01, 02, 03, 05, 06 and 07 carry a resolution comment and Status done; 04 is unchanged.

## Blocked by

None.

## Comments

### Implementation — review pending

Fixed point: `fa65e1add7b6ef4f6bcf2bd90b1f4bbeab14d944`. Read tickets 21–23, dependencies/context 08 and 20, review tickets 01–07, spec/design, ADRs 0007/0009/0010 and repository tracker instructions. Ticket 21's decisions supersede historical stronger wording; tickets 22/23 are not implemented.

Sketch/build: reuse existing credential transport, fixture and SC-19 environment checks unchanged (reuse ladder rung 1 for product behavior, rung 2 for tests/docs). Record decisions in ADR 0010 and spec accepted risks; qualify historical ADR 0007/design claims and reconcile README/operator guidance. Replace the obsolete container-files TODO with config/export/log/image-content assertions in ordinary and benign-Feature fixtures. Image scanning uses existing Docker/Node tools and streams every saved layer, including deleted files, rather than inferring absence from history. No new dependency, product abstraction, interface, ownership or dependency-direction change; architecture reconciliation is unnecessary. Review-ticket bodies are preserved with appended resolutions; 04 is unchanged. The previously untracked 01 is included solely because its resolution is required here; all of its original text is retained.

Validation: targeted baseline reproduced the failing `/etc/environment` TODO. First Quarterdeck run with file-backed image saves failed both save checks; host free space was only 2.8 GiB, so the test was changed to streaming rather than deleting unrelated resources. The save failure's stderr was not retained, so disk pressure is a diagnosis, not a proven error message. Targeted extensions fixture then passed 3/3; final `npm run test:quarterdeck` exited 0, **33 passed, 0 failed, 0 TODO**. Dummy credentials only; no real token/permission or agent probes. Broader regression intentionally not run under the test restriction.

No mandatory human evidence is requested by this ticket's acceptance criteria. Review 04's token-scope/private-startup evidence, ticket 22's shallow-home repair and ticket 23's agent-free startup remain separate outstanding work; no observation or completion is claimed for them. Independent fresh review follows the implementation commit; checkboxes remain pending until its findings are dispositioned.
