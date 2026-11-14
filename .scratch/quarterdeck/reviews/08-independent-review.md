# Ticket 08 independent review

Ticket: [08 — read-only extensions token](../issues/08-project-container-receives-a-read-only-extensions-token.md)

Implementation reviewed: `b9cd6de56b84b3d67bb8e5a3bd6daa47a56eb3fa`, against `2c203cc0b101c47959c276d4e32ca1f31879b2ef`.

## Dispositions

- **Standards:** no findings.
- **Design 1 / Spec 1:** accepted as true blockers. Immediate remediation declined/deferred under user direction to log security concerns and continue against the existing design; this is not rejection or narrowing of the constraint. Tracked in [security-review 05](../../quarterdeck-security-review/issues/05-devcontainer-cli-persists-extensions-token.md). The no-file criterion remains unchecked; the failing TODO is not green acceptance evidence.
- **Spec 2:** accepted validation gap. Immediate real/private run deferred because the private-source fixture/credentials are unavailable. Explicit manual instructions are already recorded in the ticket handoff and `quarterdeck/CHECKLIST.md`. The absent-token/private-source criterion remains unchecked.

The ticket remains open, **ready-for-human**. Documentation-only reporting changes do not require another review.

## Verbatim reviewer reports

### `/tmp/qd08-review-Standards.log`

```markdown
## Standards

No actionable findings in committed diff `2c203cc0...HEAD` (`b9cd6de`).

- No documented-standard breaches or material baseline smells identified.
- Changed tests exercise distinct transport, credential-helper, exclusion and persistence failures through real container boundaries; no removal recommended.
- The failing persistence TODO is explicitly documented as an unresolved blocker, not passing acceptance. Continuing implementation with that recorded blocker follows your direction; this review does not establish ticket completion.

**Summary:** Standards: 0 findings. Design and Spec axes not reviewed.
```

### `/tmp/qd08-review-Design.log`

```markdown
## Design

**1. No-file constraint remains violated — recorded blocker, not grounds to stop the permitted independent work.**

- **Requirement:** Ticket 08’s technical constraints say: “Must not introduce: … the token in a file or image.” ADR 0010 explicitly confirms that accepted inspect visibility “is not approval of filesystem persistence.”
- **Hunk:** `quarterdeck/bin/qd-project-up` adds `['-e', 'DEV_SETUP_GITHUB_PAT']` and supplies `{ ...env, DEV_SETUP_GITHUB_PAT: extensionsToken }` to the creation CLI.
- **Evidence:** The corresponding `tests/quarterdeck.test.mjs` hunk retains the filesystem assertion as:
  > `todo: 'ticket 08 blocker: pinned devcontainer CLI persists container environment in /etc/environment; security-review 05'`
- **Impact:** The chosen platform integration delivers the token but does not satisfy the design’s persistence boundary, even for the ordinary Template. Name-only configuration transport alone cannot establish that boundary.
- **Disposition:** Already accurately recorded in security-review concern 05 and the implementation handoff. Keep acceptance blocked until a supported prevention mechanism passes the retained regression, or a human explicitly narrows the requirement. The TODO must not count as acceptance evidence.

No additional material ownership, dependency-direction, interface, reuse, or explicit-non-design violations found. The changes reuse Base’s helper and the existing real-container fixture without changing Base, Variants, Templates, or launcher responsibilities. Real permission/startup evidence remains explicitly deferred rather than claimed complete.

**Summary:** Design: 1 acknowledged unresolved finding—container filesystem persistence. Standards and Spec axes not performed, as requested.
```

### `/tmp/qd08-review-Spec.log`

```markdown
## Spec

Reviewed `git diff 2c203cc0b101c47959c276d4e32ca1f31879b2ef...HEAD` (`b9cd6de`), excluding working edits.

1. **No-file acceptance remains violated — acknowledged blocker.**  
   Ticket 08 requires: “The value appears in no file,” restating the filesystem restriction of SC-16/SC-19.

   Relevant hunk, `tests/quarterdeck.test.mjs:171–174`:
   > `todo: 'ticket 08 blocker: pinned devcontainer CLI persists container environment in /etc/environment; security-review 05'`

   The new creation transport supplies the token through the CLI environment, but the committed evidence records that the CLI writes it into `/etc/environment`, even for the ordinary Template. Accepting `docker inspect` visibility does not waive filesystem persistence. Recording this blocker and continuing is permitted; ticket acceptance still requires prevention or an explicit human narrowing. The handoff correctly does not claim a pass.

2. **Absent-token private-source scenario is only partially validated.**  
   Ticket 08 requires: “With the variable unset, `qd-project-up` still creates the container, prints a warning … and a Project layer with a private source then fails with the installer's existing message.”

   Relevant hunk, `tests/quarterdeck.test.mjs:181–183`:
   > `assert.match(first.err, /warning.*QUARTERDECK_EXTENSIONS_TOKEN/);`  
   > `assert.equal(probe('env | grep -Ei "github|^GH_TOKEN="').code, 1);`

   These assertions establish the warning and credential absence, not the private-fetch failure or its diagnostic. The fixture uses the Template manifest without a private source; the committed handoff explicitly acknowledges this missing evidence. Retain this criterion as unproven until a controlled fixture or the deferred human run exercises that failure. This is a validation gap, not evidence that the unchanged installer behaves incorrectly.

**Summary:** Spec: 2 findings; worst is confirmed token persistence. Standards and Design were not reviewed as separate axes, per the Spec-only request.
```
