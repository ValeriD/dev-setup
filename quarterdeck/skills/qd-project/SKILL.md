---
name: qd-project
description: Create, update or remove a Quarterdeck Project with no remote (its own folder, git repository and container) when the user asks the First Mate for one.
---

# First Mate: create, update or remove a Project with no remote

A Project with no remote is a FirstMate `local-only` project in the First Mate home, with its own container and no Second Mate. A Project on GitHub is registered through `qd-first-mate` instead.

Let `$M` be `$QD_WORK_ROOT/fleet/firstmate`, the First Mate home, and `$name` the Project's name. Run FirstMate commands from `$M` with `FM_HOME="$M"`. The Project's files come from `qd-project-new`, Crewmates and `fm-merge-local.sh`; this skill writes none of them. Load FirstMate's `project-management` skill before registering or removing, and follow it for the registry.

## Create

1. **Confirm.** Agree with the user, in this conversation, on three things and repeat them back before running anything:
   - **Name:** letters, digits, `-` and `_`, starting with a letter or digit.
   - **Variant:** a folder under `/opt/qd/templates/` whose image is built on this machine. Today that is `markdown`, built on the host with `quarterdeck build-variant markdown`.
   - **Presets:** zero or more names from `/opt/qd/presets/*.json`, without `.json`.

   Done when the user has confirmed all three.
2. **Create the folder.**

   ```sh
   qd-project-new "$name" <variant> [<preset>...]
   ```

   It prints `$M/projects/$name`. `Project <name> exists; nothing was changed` means the name is taken: tell the user exactly that, and stop. An existing Project is never overwritten or reused. Any other failure (unknown or unbuilt Variant, unknown Preset) is relayed as it is, and nothing was created.
3. **Register** the Project as `local-only`, yolo off, by FirstMate's `project-management` procedure for a purely `local-only` project. `qd-project-new` has already made the repository and its first commit, so that procedure's remaining step is the registry entry in `$M/data/projects.md`. Done when this prints `local-only off`:

   ```sh
   FM_HOME="$M" bin/fm-project-mode.sh "$name"
   ```

4. **Start the container.**

   ```sh
   FM_HOME="$M" qd-project-up "$M" "$name"
   ```

   It prints the container id once the container is ready. A failure is relayed with its diagnostic; the Project still exists and the command can be run again.
5. **Report** to the user: the folder `$M/projects/$name` (also reachable at `$QD_WORK_ROOT/projects/$name`), the Variant, the Presets, the container id, no remote and no Second Mate, and that Errands in it go through `qd-errand`.

## Update its container configuration

The container is built only from the `.devcontainer/` tree recorded in `$QD_WORK_ROOT/quarterdeck/local-projects/$name`, never from `main`, because a Crewmate can move `main`. The record changes only when the user explicitly asks for this Project's configuration to be updated.

1. The change itself reaches `main` as an Errand (`qd-errand`) that edits `.devcontainer/`, and the user accepts it.
2. Read the candidate tree and show the user what changes against the record:

   ```sh
   new=$(git -C "$M/projects/$name" rev-parse main:.devcontainer)
   git -C "$M/projects/$name" diff "$(cat "$QD_WORK_ROOT/quarterdeck/local-projects/$name")" "$new"
   ```

3. Only after the user confirms that diff, write `$new` (the tree they saw) as the record's only line, then run step 4 of Create. `qd-project-up` replaces the container because the tree changed. Done when the new container id is reported.

## Remove

Removal deletes the Project's container, its folder with every file and all its git history, and its registry entry. It cannot be undone.

1. **Confirm.** Name the Project and say exactly what goes, then wait for the user's explicit yes in this conversation. A request phrased as a question is not a yes. This confirmation is the second guard: `qd-project-rm` refuses while FirstMate has an open record for the Project, but a Project container can delete that record.
2. **Remove the Quarterdeck's part.**

   ```sh
   qd-project-rm "$name"
   ```

   A refusal changes nothing. Relay it as it is: open work names the FirstMate ids still open, which the user accepts or closes through `qd-errand` first.
3. **Only after it succeeds**, follow `project-management`'s Remove procedure with the user's confirmation as the approval: remove the folder `$M/projects/$name` and its line in `$M/data/projects.md`. Done when both are gone and `FM_HOME="$M" bin/fm-project-mode.sh "$name"` no longer prints `local-only`. Report what was removed. Every other Project and the Quarterdeck are untouched.
