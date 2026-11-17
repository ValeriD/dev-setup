Status: approved

# Spec: Errands — hand off work that is not development, and leave

Terms such as Quarterdeck, First Mate, Second Mate, Crewmate, Project, Errand, Spec Run, Brief, Idea, Variant, Base, Template, Agent Extension, Preset and Egress Allowlist are defined in `CONTEXT.md`. This spec uses them as defined there.

Source: `.scratch/quarterdeck/grill-notes.md`. Decisions are cited as "D<number>". This spec builds on the Quarterdeck MVP (`.scratch/quarterdeck/spec.md`) and assumes it is finished.

## Problem Statement

Development is one of several kinds of work I do. I also audit code, run a shop, teach, and do the marketing, research, SEO, content and sales around all of it. The Quarterdeck MVP lets me hand off development: I decide in a grilling, a Spec Run does the rest, and I come back to a pull request. Nothing like that exists for the rest of my work.

Two things cost me my capacity (D71). When I hand an agent a handout, an article or a product text, it either stops because it is unsure what I meant, or it says it is done and I have to check it and send it back. Either way I end up watching it. And most of this work does not need a Spec, a design and tickets, so the Spec Run is the wrong tool for it.

I also want each area of my work kept apart from the others, with only the skills and access that area needs, and nothing installed on my laptop.

## Solution

Every area of my work is a Project: its own folder, its own container, its own skills (D68). A Project does not need code or a GitHub repository (D72). I create one by asking the First Mate (D81).

For work in a Project that does not need a Spec, I give the First Mate an Errand. It asks me a few questions first, so that what I want is complete before anything starts (D78). A Crewmate then does the work inside that Project's container, on its own branch, while I do something else. If it meets something I did not decide, it stops and asks; it never guesses. When it finishes I get a short report. I look at the result and tell the First Mate to accept it or to send it back with a comment (D79).

For every piece of work I choose between a Spec Run and an Errand (D56, D74).

This spec covers Errands with Claude Code as the only agent. It includes a small Markdown-only Project I can use to try the whole flow myself before I put real work through it (D80).

## User Stories

1. As the only user, I want to create a Project by telling the First Mate its name, its image and its skills, so that I never edit container configuration by hand.
2. As the only user, I want a Project to work without code and without a GitHub repository, so that teaching, shop and marketing work get the same isolation as client code.
3. As the only user, I want to hand the First Mate an Errand in a sentence or two, so that small work does not need a Spec, a design and tickets.
4. As the only user, I want the First Mate to ask its questions before the work starts, so that I spend two minutes at the beginning and none in the middle.
5. As the only user, I want the Errand done by a Crewmate inside the Project's container, so that the work runs under that Project's hardening, skills and access, and not in the Quarterdeck.
6. As the only user, I want a Crewmate that meets something undecided to stop and put the question on my list, so that I never get a result built on a guess.
7. As the only user, I want a short report and a mark on the First Mate's tab when an Errand finishes or stops, so that I find out without watching.
8. As the only user, I want my own main folder in the Project left untouched while an Errand runs, so that I can keep working there myself.
9. As the only user, I want to accept an Errand by telling the First Mate, so that I run no git for work that is not development.
10. As the only user, I want to send an Errand back with a comment and have a fresh Crewmate continue on the same branch, so that a correction does not start from nothing.
11. As the only user, I want a Project to be able to define its own check that a Crewmate must pass before it reports, so that each area keeps its own idea of what good means.
12. As the only user, I want an Errand on a Project that lives on GitHub to end in a pull request that I merge myself, so that nothing reaches a GitHub `main` without me.
13. As the only user, I want to run several Errands at once in one Project and across Projects, so that I am not the queue.
14. As the only user, I want to ask the First Mate what is waiting for me, so that I do not have to remember which Errands are finished, stopped or still running.
15. As the only user, I want a Markdown-only test Project I can create, run Errands in and throw away, so that I can verify the flow before trusting it with real work.

## Known Technical Constraints

- **Agent.** Claude Code only. OMP and Pi are not part of this spec (D85 to D87). Crewmates run in auto permission mode (D38). Model rule as in the MVP: Sonnet by default, Opus for work about skills, prompts or agent tools (D19, D48).
- **FirstMate is used as pinned, without edits** (ADR 0008). FirstMate hands out work only as a branch in a git repository, and it supports repositories that have no remote, managed by the First Mate directly. A Second Mate refuses such a repository. So a Project with no remote is a git repository managed by the First Mate, with no Second Mate (D62, D73).
- **A mate never writes to a Project.** This is FirstMate's own first rule. Whatever changes a Project's files, including the merge on accept, is done by a Crewmate or by FirstMate's own delivery step, never by a mate editing files.
- **Mates run in the Quarterdeck; Crewmates run in the Project's container** (ADR 0006), reached through the MVP's launcher. The Quarterdeck is the control room only; no Errand work is done inside it (D69).
- **One container per Project**, serving Errands, Spec Runs and my own direct use alike (D63). **One clone per Project**: Crewmates work in worktrees of it and the main folder stays mine (D61).
- **Every Project image is a Variant in this repository** (D82), so it keeps Base's Egress Allowlist and hardening. The first new one holds Markdown tooling only and exists to test Errands (D80).
- **A Project's skills arrive through the existing Agent Extension and Preset mechanism**, set when the Project is created. The skill library idea is withdrawn (D66).
- **Project containers hold no GitHub credential** (ADR 0007). For a Project on GitHub, the push and the pull request happen in the Quarterdeck, as in the MVP. The First Mate never merges into a GitHub `main` (D83).
- **No agent reviews an Errand** (D77). The only verification is one a Project defines for itself; a Project may define none.
- **Agents do not act in outside systems** (D70). An Errand prepares work; I publish it.
- **Only Projects whose `main` I control** are started by the Quarterdeck (D92).
- **No limit on Errands or Projects running at once** (D53, D84).
- **Tests.** The full acceptance suite is never run by an agent. Work is tested with the targeted commands, as in the MVP.

## Acceptance Scenarios

### Creating a Project

- **SC-01** (stories 1, 2, 15). I ask the First Mate for a new Project on the Markdown Variant with no remote. Afterwards the work root has the Project's folder as a git repository with a first commit, its container runs from that Variant with the Egress Allowlist applied, and the skills I named are available to an agent in it. I edited no file by hand.
- **SC-02** (story 2). That Project has no Second Mate and no GitHub remote, and nothing in the flow below needs either.
- **SC-03** (story 1). Asking for a Project whose name already exists changes nothing and tells me so.

### Handing off an Errand

- **SC-04** (stories 3, 4). I give the First Mate an Errand in one or two sentences. It asks its questions in that same conversation, before any Crewmate starts. After my answers, no further input from me is needed until the report.
- **SC-05** (story 5). The Crewmate's process runs inside the Project's container. The Quarterdeck's own files and tokens are not reachable from it.
- **SC-06** (stories 5, 8). The work lands on a new branch in its own working folder. My main folder's files and its checked-out branch are unchanged while the Errand runs and after it reports.
- **SC-07** (story 7). When the Crewmate finishes, the First Mate shows a short report naming the Project, the branch and the files changed, and its tab carries Herdr's attention mark. I pressed nothing and answered nothing after SC-04.

### Stops

- **SC-08** (story 6). An Errand whose Brief leaves a needed decision open ends with the question on my list and no finished result. The Crewmate did not choose an answer. After I answer, the Errand continues on the same branch.
- **SC-09** (story 7). A Crewmate that dies mid-Errand produces a report saying so. Nothing is merged or published, and the branch is left as it was.

### Verification per Project

- **SC-10** (story 11). In a Project that defines a check, the Crewmate runs it before reporting and the report states its result. A result that fails the check is reported as failed, not as done.
- **SC-11** (story 11). In a Project that defines no check, the Errand reports without one, and no agent reviews the result.

### Accept and send back

- **SC-12** (story 9). On a Project with no remote, telling the First Mate to accept merges the Errand's branch into the Project's `main`, and my main folder then shows the result. I ran no git command.
- **SC-13** (story 9). If my main folder has uncommitted changes that the merge would overwrite, the accept stops and tells me, and nothing of mine is lost.
- **SC-14** (story 10). Telling the First Mate to send an Errand back with a comment starts a new Crewmate session in the same working folder and branch. It sees the earlier work and my comment, and a new report follows.
- **SC-15** (story 12). On a Project with a GitHub repository, a finished Errand's branch is pushed from the Quarterdeck and a pull request is opened against the default branch. The First Mate merges nothing. The Project's container held no GitHub credential at any point.

### Several at once, and keeping track

- **SC-16** (story 13). Two Errands started in the same Project run at the same time on separate branches and working folders, and each reports on its own.
- **SC-17** (story 14). When I ask the First Mate what is waiting for me, it lists every Errand across Projects that is running, stopped on a question, or finished and not yet accepted, with its Project.
- **SC-18** (stories 3, 13). An Errand and a Spec Run can be in progress in the same Project without changing each other's branch or working folder.

### Trying it myself

- **SC-19** (story 15). Starting from a running Quarterdeck with only a Claude token, I can go through SC-01, SC-04 to SC-07, SC-12 and SC-14 on the Markdown test Project by following a written checklist, using a real Claude session.
- **SC-20** (story 15). Removing the test Project removes its container and its folder, and leaves every other Project and the Quarterdeck untouched.

## Out of Scope

- OMP and Pi, and any choice of agent per Project.
- The hardening pair, the Git gate, rootless Docker, and Projects on repositories I do not control.
- Agents acting in outside systems: publishing to the shop, editing a client site, sending mail.
- My own Herdr session on a Project's container (`qd-open`, D63). Connecting to a Project's container directly already works without the Quarterdeck (D45).
- Any Variant beyond the Markdown one. I build others when a Project needs them (D80).
- The skill library (D66).
- An agent reviewing an Errand's result (D77).
- Surviving a Quarterdeck restart, and pausing and resuming (D54).
- Deadlines, clients, lessons and orders. The First Mate keeps one list of work, not a planner (D75).
- Turning an Idea into an Errand automatically. An Idea still leaves its hold only through a grilling (D27).
- Backup of the work root, and notifications outside Herdr.

## Further Notes

Three points were not decided in the grilling. I filled them in the way the MVP already works, so that the spec is complete. Change them if they are wrong.

- **A failed Errand is not retried automatically.** The MVP retries a failed ticket once (D28). For Errands I assumed no retry: the report says what failed and I decide, because I am checking the result myself anyway.
- **Branch names** use the MVP's prefixes `feat/`, `fix/` and `chore/`, picked by the First Mate (D40).
- **After I answer a stopped Errand's question, it continues with a fresh Crewmate on the same branch**, the same way a send-back does.

One point is for the design to settle, not this spec: who performs the merge on accept. FirstMate forbids a mate from writing to a Project, so it has to be a Crewmate or FirstMate's own delivery step.

The MVP's accepted risks carry over unchanged: a misled mate, the worktree link file, and Features trusted from a `main` I control (D49, D92, D94).
