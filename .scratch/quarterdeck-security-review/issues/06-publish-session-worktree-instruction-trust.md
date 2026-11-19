# 06: Review worktree instructions in the credential-bearing publish session

Status: done
Type: task

## Evidence and impact

Ticket 12 runs the publish Claude in the existing project worktree in the Quarterdeck. The launcher appends `--setting-sources user`; this is a settings-source restriction, not proof that worktree `CLAUDE.md`, skills, or other project content cannot influence the agent. The design explicitly leaves instruction/skill loading unverified. A project Crewmate can write that content, and the publish session normally inherits Quarterdeck credentials. If loaded and followed, malicious instructions could influence credential-bearing tool calls beyond `qd-publish`. No real-agent exploit or credential probe was performed.

This is distinct from concern 01 (container creation configuration) and 02/03 (Git configuration/store execution). It refines spec accepted risk 2 (prompt-injected mates); implementation continues against the approved design, not a claim of new isolation.

## Code/design pointers

- `quarterdeck/bin/claude`: publish route and `--setting-sources user`.
- `.scratch/quarterdeck/design.md`: Constraints, publish route; Spec Run step 9.
- `.scratch/quarterdeck/spec.md`: Known Risks Accepted for the MVP, item 2.
- `quarterdeck/CHECKLIST.md`: ticket 12 benign instruction/settings loading check.

## Review criteria

- [ ] Record real-Claude loading behavior for worktree instructions, skills and settings using harmless canaries and no project/push credential.
- [ ] Confirm whether existing MVP prompt-injection acceptance covers this particular publish path and its credential scope.
- [ ] Decide whether the later Git gate or a narrower publish interface must remove arbitrary credential-bearing agent tool execution; specify regression outcomes for any approved change.

## Comments

### Resolution — ticket 21 decision 5

[Ticket 21](../../quarterdeck/issues/21-mvp-security-review-decisions.md) accepts publish-session influence from worktree content as the misled-mate risk, limited by the repository-scoped token. Spec accepted risk 15 names the hardening pair and Git gate as later fixes. Closed by explicit acceptance, not by proving instruction isolation. The benign real-Claude loading checklist remains unperformed compatibility evidence, not a blocker to this policy decision. Historical review criteria are preserved; no real agent or credential probe was run.
