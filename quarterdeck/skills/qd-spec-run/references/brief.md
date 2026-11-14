# Brief conventions

The Second Mate fills the generated private `data/<slug>/brief.md` once, before planning. Keep it ticket-neutral thereafter; FirstMate appends each relaunch's `## Progress note`. Fill concrete values, not these placeholders. FirstMate's AGENTS.md section 11 permits the changed delivery instructions because intermediate sessions commit without publishing.

## Captain's intent

Copy the entire handoff verbatim here: the `Spec Run`, `Branch prefix`, `Project` headers and the grilling decisions. Keep technical additions in the brief notes below.

## Firstmate spec

This generated heading holds **brief notes**, not the product Spec. Insert these instructions with the run's paths and the Charter's three gate commands filled in:

- Each session does exactly one job named by the latest `## Progress note`. No note means plan. Preserve the same branch and worktree throughout.
- **Plan:** use the project's `/to-spec`, `/to-design`, `/to-tickets` to create `.scratch/<slug>/spec.md`, `design.md` and `issues/NN-*.md` from the handoff. Create the branch as Setup directs. Make exactly one planning commit, then append `done: plan committed <sha>; <N> tickets` and stop. A decision not made by the handoff is `needs-decision`; stop instead of inventing it.
- **Ticket NN:** use the project's `/implement`, including its review procedure, for only the ticket named in the latest note. Start from the given commit; exactly one new commit represents the completed ticket. Keep planning and earlier tickets intact. Do not create another branch or another ticket session yourself.
- **Retry of ticket NN:** implement the same ticket from its original start commit. Before resetting, save the failed attempt at `refs/quarterdeck/failed/NN-1`. Preserve tracked and untracked changes belonging to that failed attempt in a local snapshot commit if needed, then point the ref at it and verify the ref resolves. Do not include secrets or unrelated files; if the attempt cannot be safely preserved, report the obstacle and stop without resetting. Only after preservation, reset this worktree to the note's start SHA. The saved attempt remains reachable through that ref; the successful branch still gets exactly one ticket commit above the original start. Then perform the ticket and gate as above.
- **Gate:** run `pnpm install --frozen-lockfile`, then build: `<build command>`, lint: `<lint command>`, test: `<test command>`. All three must succeed for the ticket's final tree. If fixes follow a gate, rerun the affected checks before success. Leave a clean worktree. Append `done: ticket NN committed <sha>; build ok, lint ok, test ok` only after the commit and all checks succeed. If the gate fails or the ticket cannot be finished, append `failed: ticket NN: <reason>` and stop. A question the Spec and design do not answer is `needs-decision`, then stop.
- **Publish.** Run `FM_HOME="<Second Mate home>" qd-publish "<Second Mate home>" "<project>" "<prefix><slug>" "<slug>"` and nothing else. This session is routed into the Quarterdeck. On success append `done: PR <url>` with the URL printed by the command. On failure report the diagnostic; never claim a PR from intent alone. Make no new commit.

Use the generated status-file destination and numeric `[at=<epoch>]` stamp for each append; the short `done:` forms above specify the message body, not a different status protocol.

## Preserve generated sections

Keep `# Setup` and `# Rules` unchanged, including the worktree-isolation check. FirstMate's relaunch supplies the existing branch context; later sessions keep that branch rather than creating it again. The publish session also starts in the same worktree, so the isolation check still applies.

## Replace the publishing instructions

In `# Definition of done`, keep these machine-readable lines exactly as generated:

```text
Delivery contract: mode=direct-PR
Ship branch: <generated branch>
```

Replace the push and PR instructions with:

> Commit, run the gate, append `done: ticket NN committed <sha>; build ok, lint ok, test ok`; do not push, do not open a PR, except in a `Publish.` session.

The plan and publish jobs use their own completion lines above. Exactly one planning commit and one commit per successful ticket are the complete branch history for this run; a publish session adds none. Preserve all other generated safety instructions and the user's boundaries. Before dispatch, verify both contract lines still match the selected mode and branch, the gate commands and publish arguments are concrete, and the two generated content placeholders have been replaced.
