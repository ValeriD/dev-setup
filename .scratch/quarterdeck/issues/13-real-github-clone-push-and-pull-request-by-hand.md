# 13: Prove real GitHub clone, push and pull request by hand

**Status:** ready-for-human
**Model:** not an agent ticket (needs real credentials and a real GitHub repository)
**Design slice:** 2 (Real GitHub, no agents), the real half

## What to build

Run, attended and with no agent in the loop, the GitHub flow that the spike could not (grill decision 37). The spike's repository `ValeriD/quarterdeck-spike` was unreachable with the token. A human creates a throwaway private repository and a fine-grained token scoped to it, then runs the steps below on a started Quarterdeck. Results go into `quarterdeck/CHECKLIST.md` and as a comment here. A failure becomes a new ticket; this file is not edited.

Why a human: it needs a real GitHub repository and real tokens, and the implementing agent must not touch GitHub.

## Acceptance criteria

- [ ] The throwaway private repository has a tiny project and a default branch; the token in `~/.config/quarterdeck/secrets.env` is scoped to that repository only.
- [ ] In the First Mate's home the repository is registered as a `direct-PR` project with yolo off and cloned from GitHub into `projects/` through the Base credential helper (no `gh auth setup-git`, no token on disk) (SC-08, grill decision 37).
- [ ] `fm-home-seed.sh sm-<project> <explicit path> <project>` makes a Second Mate home with a fresh clone from GitHub (decision 37).
- [ ] A hand-made branch with one commit in that clone is pushed with `qd-publish` and a pull request is opened against the default branch; its body lists the tickets present under `.scratch/<slug>/issues/` (SC-08).
- [ ] `git config --show-origin -l` in the Quarterdeck and `docker inspect` of the Quarterdeck show no token value; a `docker exec` shell cannot read the token (SC-19).
- [ ] The result of each step (pass, fail, what was seen) is recorded in `quarterdeck/CHECKLIST.md` and in a comment here.

## Technical context

**Design:** `.scratch/quarterdeck/design.md`, "Build order" slice 2 and "Validation plan / Manual checklist" (SC-07, SC-08 rows). Notes: `grill-notes.md` decision 37 (accepted: the MVP build proves GitHub).

- **Modules touched:** none to build; uses tickets 03, 05 and 06.
- **Implementation anchors:** `spike/FINDINGS.md` "Setup and workarounds" (the unreachable repository), ADR 0007.
- **Must not introduce:** a pull request to pomoplan (that is ticket 17), any agent session, a token in a repository, image or project container.
- **Validation seam:** a real throwaway private GitHub repository, real PR, observed by the human.
- **Coverage:** owns the real-GitHub half of SC-08 and the real half of SC-19's "no value in git config".

## Blocked by

- 03: Tokens reach Herdr's panes and nothing else
- 05: The First Mate's home is seeded and its tab opens on start
- 06: `qd-publish` pushes a branch and opens a pull request without running project hooks
