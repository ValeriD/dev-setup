# 08: Try Errands on the test Project with a real Claude

**Status:** ready-for-human
**Model:** Opus
**Design slice:** 7 (Manual run)

Terms such as Project, Errand, Crewmate, First Mate, Second Mate, Brief, Variant, Template, Preset and Spec Run are defined in `CONTEXT.md`. Spec: `.scratch/errands/spec.md` (scenarios are cited as `SC-NN`). Design: `.scratch/errands/design.md`.

## What to build

The user goes through the whole flow on a throwaway Markdown Project, with a real Claude session and only a Claude token, by following the checklist. Whatever the run shows to be wrong in the skill text is then corrected. This is the test environment the user asked for; nothing here needs GitHub.

Steps for the user, each recorded in `quarterdeck/CHECKLIST.md` with what was seen:

1. Build the Markdown Variant with the host command from ticket 01, then start the Quarterdeck with a token file that holds only the Claude token.
2. Ask the First Mate for a new Project on the Markdown Variant with no Presets that need a private repository.
3. Give it an Errand in one or two sentences. Answer its questions. Then send nothing until the report.
4. Read the result in the Errand's branch, then tell the First Mate to send it back with a comment. Wait for the second report.
5. Tell the First Mate to accept. Look at the Project's main folder.
6. Start two Errands at once and ask the First Mate what is waiting for you.
7. Give it an Errand that leaves a needed decision open, and see that it stops and asks.
8. Ask the First Mate to remove the test Project.

## Acceptance criteria

- [ ] Step 2 leaves a Project folder with a first commit and a running container, and the user edited no file by hand (SC-01).
- [ ] In step 3 every question came before any Crewmate started, and after the answers no prompt, trust dialog, login or key press was needed until the report (SC-04, SC-07).
- [ ] The report names the Project, the branch, the files changed and the check result, and the First Mate's tab carries Herdr's attention mark (SC-07).
- [ ] Step 4 produced a second report from a fresh session on the same branch that took the comment into account (SC-14). Step 5 put the result in the main folder without the user running git (SC-12).
- [ ] Step 6: both Errands ran at once, and the First Mate's answer listed each with its Project and state (SC-16, SC-17).
- [ ] Step 7: the Crewmate did not choose an answer; the question reached the user (SC-08).
- [ ] Step 8 removed the test Project's container and folder and left the Quarterdeck and any other Project untouched (SC-20).
- [ ] Whether FirstMate's busy and turn-end signals reached the First Mate from the Markdown container under the hardened policy is recorded, with what supervision did without them (the same question as MVP ticket 15).
- [ ] Every correction made to `qd-project`, `qd-errand` or the Brief reference because of this run is listed in a comment on this file, and `npm run test:errands` passes after the corrections (SC-19).

## Technical context

**Design:** `.scratch/errands/design.md`, Validation plan, last row (manual checklist); "Suggested build order" slice 7.

- **Modules:** No module changes except skill text and `quarterdeck/CHECKLIST.md`.
- **Implementation anchors:** `quarterdeck/CHECKLIST.md` (row format: setup, what to look at, what a pass is), MVP ticket `.scratch/quarterdeck/issues/16-planning-crewmate-commits-spec-design-and-tickets.md` (the same kind of run-and-correct ticket).
- **Reuse:** The checklist format and the MVP's practice of correcting skill text from a real run.
- **Dependency direction:** Unchanged.
- **Must not introduce:** New tools or mechanisms to work around what the run shows. A gap that needs code is reported as a new ticket, not patched here.
- **Validation seam:** A real Claude session in a real Quarterdeck, attended by the user.
- **Coverage:** SC-04, SC-07, SC-17, SC-19, and the real-agent half of SC-01, SC-08, SC-12, SC-14, SC-16 and SC-20. An agent may prepare the checklist rows and apply the corrections; the run itself is the user's.

## Rules for whoever implements this

- **Tests.** Run only the commands this ticket names. The full acceptance suite (`npm test`, or any glob over all files in `tests/`) is never run by an agent, not while building, not before committing and not in review.
- **No real agent session, no GitHub contact, no secrets.** Use the stub Crewmate fixture, a local bare origin, a stub `gh` and dummy token values. Never read a token file.
- **The FirstMate fork is never edited** (ADR 0008). If something FirstMate is assumed to do proves false, stop at the furthest sound point, leave this ticket open with a comment saying what was seen, and report. Do not patch and do not redesign.
- **Docker.** Act only on containers, volumes and images this work creates and labels. Never any `prune`.

## Blocked by

- 07: The `qd-project` and `qd-errand` skills
- The Quarterdeck MVP must start and hold a First Mate session with a real Claude token (MVP tickets under `.scratch/quarterdeck/issues/`, at least 22 and 23).

## Comments
