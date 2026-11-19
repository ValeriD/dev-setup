---
name: qd-first-mate
description: Provision a Consuming Project's Second Mate or hand the user's decisions to it as a Quarterdeck Spec Run; carry a Crewmate's question to the user and the answer back; relay its final report.
---

# First Mate: hand off a Spec Run

Use the user's supplied grilling decisions as input. Only the owning Second Mate starts project Crewmates; the First Mate never spawns a project Crewmate or writes project files.

## 0. Register and provision once per project

Load FirstMate's `project-management` skill before registering the project from its GitHub origin into the First Mate home's `projects/`. Register `direct-PR`, yolo off. Load `secondmate-provisioning` before making or using its Second Mate.

Let `$M` be the actual First Mate home (default `/home/valeri/work/fleet/firstmate`), `$project` the registered name, and `$S` the explicit Second Mate home `/home/valeri/work/fleet/sm-<project>`. For an overridden work root, use the corresponding absolute fleet path. Always supply this path to seeding, never `-`; the home stays outside the worktree pool.

Read `/opt/qd/fleet/charter.md`. Fill every field from the project and the user's decisions, including its build, lint and test commands. If any field is undecided, report what is missing instead of provisioning with guesses. Put the filled text in `$charter` and run from the First Mate home:

```sh
FM_HOME="$M" FM_SECONDMATE_CHARTER="$charter" bin/fm-brief.sh "sm-$project" --secondmate "$project"
FM_HOME="$M" bin/fm-home-seed.sh "sm-$project" "$S" "$project"
FM_HOME="$M" bin/fm-spawn.sh "sm-$project" "$S" --secondmate
```

Reuse an already provisioned mate rather than overwriting its Charter or seeding a second home. Done when the registered project is `direct-PR`, yolo off, and the Second Mate is running at the explicit home with the filled Charter. A failed command is a blocker to report, not permission to dispatch from the First Mate.

## 1. Hand off

Pick a unique Spec Run slug and a branch prefix from `feat/`, `fix/`, `chore/` only. Build `$handoff` as these three header lines followed by the user's grilling decisions verbatim:

```text
Spec Run: <slug>
Branch prefix: <prefix>
Project: <project>

<grilling decisions verbatim>
```

Pass the handoff as data, preserving its newlines and wording:

```sh
FM_HOME="$M" bin/fm-send.sh "sm-$project" "$handoff"
```

The Second Mate follows `qd-spec-run`. Track its correlated returns through FirstMate's parent channel, not its chat or its child sessions.

## 2. Carry a question to the user and the answer back

A `needs-decision [key=<slug>]` line from the Second Mate means a Crewmate in that Spec Run is waiting for the user. The run is still open; no report follows it yet.

1. Relay the question to the user verbatim, naming the Spec Run slug and its project. Offer no answer, option ranking or default: the user decides.
2. When the user answers, send the answer to the same Second Mate for the same slug, closing that decision with its key:

   ```sh
   FM_HOME="$M" bin/fm-send.sh "sm-$project" --resolve-key "<slug>" "$answer"
   ```

   `$answer` is the line `Answer to Spec Run <slug>`, a blank line, then the user's answer verbatim. That first line is its only header: the answer belongs to the open run, so it never becomes a new handoff, slug or Spec Run. If `fm-send.sh` refuses the key, it delivers nothing and prints resend commands: use the keyed one with the open key this Second Mate gave the question, or the plain one when no decision is open.

Done when `fm-send.sh` exits 0. Then keep tracking the same run; more questions take this section again.

## 3. Relay the final report

The final `done` pointer names `$S/data/<slug>/report.md`: read that file and relay `report.md` verbatim to the user, without substituting a summary or treating an internal ticket completion as the final report. Done when that report has been relayed. Leave merge approval to the user.
