# Brief conventions for an Errand

`fm-brief.sh <id> <project> --mode local-only` writes `$M/data/<id>/brief.md` with two placeholders to fill, `{TASK}` and `{FIRSTMATE_SPEC}`. Replace both, and only them. FirstMate appends each relaunch's `## Progress note` itself.

## Captain's intent (`{TASK}`)

The user's Errand verbatim, then each question you asked followed by the user's answer verbatim, one pair per paragraph. Add no speaker labels and no address to anyone: `fm-spawn.sh` refuses a line here that opens with a Captain label or address. Your own additions go under Firstmate spec.

For a follow-up, copy the replaced Errand's Captain's intent from `$M/data/<old-id>/brief.md`, then add the user's new comment verbatim as the last paragraph. When `main` moved and the user said nothing new, the copy alone is the intent.

## Firstmate spec (`{FIRSTMATE_SPEC}`)

These lines, with `<id>`, `<project>` and the check line filled in:

```text
Errand <id> in Project <project>. Do the one job in Captain's intent above, on branch fm/<id>, and nothing else.
Stop rule: an undecided point ends the session with a `needs-decision` status line that states the question and its options, and no guess. Keep your uncommitted work as it is.
<check line>
Your final status line ends with `check: passed`, `check: failed` or `check: none`, for example `done [at=<epoch>]: ready in branch fm/<id>; check: passed`. Commit the work before that line, whatever the check says.
A later `## Progress note` starting `Answer:` answers your question; one starting `Comment:` is the user's correction of the work so far. Continue from where the worktree stands, on the same branch.
```

The check line depends on whether the Project's `main` has a check file, `git -C "$dir" cat-file -e main:.quarterdeck/errand-check.md` (exit 0 means it has):

- It has: `Follow .quarterdeck/errand-check.md before you report, and end your report with its result.`
- It has not: `This Project has no check.`

A follow-up adds, after the first line:

```text
Errand follow-up: fm/<old-id>
First bring that branch's commits onto your branch with `git cherry-pick main..fm/<old-id>`, then make the revision in the last paragraph of Captain's intent. With no new paragraph there, the revision is bringing the work onto today's main.
```

## Keep what FirstMate generated

Keep `# Setup`, `# Rules`, the Herdr declaration, the instruction inbox and `# Definition of done` as generated, including the safety rules, the worktree-isolation check and these two lines:

```text
Delivery contract: mode=local-only
Ship branch: fm/<id>
```

Done when neither placeholder remains, both contract lines match `<id>`, and every generated section is still there.

## For a Project with a GitHub repository (the Second Mate)

`fm-brief.sh <id> <project> --mode direct-PR --branch-prefix <prefix>` writes the same two placeholders, `{TASK}` and `{FIRSTMATE_SPEC}`. Replace both, and only them.

- **Captain's intent:** the whole handoff verbatim: the `Errand`, `Branch prefix` and `Project` headers, then the user's words and answers. The publish session builds the pull request text from this section, so it must read as something to review.
- **Firstmate spec:** the same lines as above, with `Errand <id> in Project <project>` and branch `<prefix><id>`, plus the check line read from the Project's default branch in `$S/projects/<project>` (`origin/<default branch>`), and this bullet, filled with the real paths:

  ```text
  - **Publish.** Run `FM_HOME="<Second Mate home>" qd-publish --body-from-brief "<Second Mate home>" "<project>" "<prefix><id>" "<id>"` and nothing else. This session is routed into the Quarterdeck. On success append `done: PR <url>` with the URL the command printed. On failure report its diagnostic; never claim a pull request from intent. Make no new commit.
  ```

- **Definition of done:** keep `Delivery contract: mode=direct-PR` and `Ship branch: <prefix><id>` as generated. Replace the push and pull request instructions with: `Commit, append your final status line (done ... check: ...); do not push and do not open a pull request, except in a Publish. session.`

Keep `# Setup`, `# Rules` and the other generated sections unchanged. Done when both placeholders are gone, both contract lines match the branch, and the publish command has no placeholder left.
