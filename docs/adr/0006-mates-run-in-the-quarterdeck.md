# Mates run in the Quarterdeck; only coding Crewmates run in the project container

The First Mate and one Second Mate per Consuming Project run together in the Quarterdeck, under one Herdr. Only coding Crewmates run in the Consuming Project's container. A launcher on the Quarterdeck's path, named `claude`, execs into that container when a Crewmate starts, so FirstMate's hooks and Herdr's status marks keep working. A spike with a stand-in repository showed this working end to end: hooks reached the owning mate, Herdr tracked the Crewmate through `docker exec`, and a Second Mate in the same container as the First Mate started its own Crewmate.

## Considered Options

- A single First Mate and no Second Mates: rejected because its context fills with the events of every project, and one flat state folder leaks between projects. A Second Mate has its own home and its own state.
- A Second Mate inside each project container: rejected because every hardened container would need the FirstMate clone, a session manager and a GitHub login, and its Crewmates would be invisible in the one Herdr.
- A Herdr server inside each project container, reached over SSH: rejected because every hardened container would need an inbound service and keys.

## Consequences

- Agent sessions end when the Quarterdeck restarts. A Spec Run is restarted by hand. Surviving a restart is listed as later work. A restart with a Crewmate running behind `docker exec` was not tested.
- One project container serves one Second Mate's home, because its mounts name that home's scripts, signal folder and clone. Only that Second Mate starts the project's Crewmates; the First Mate must not.
- The launcher carries three duties. It sets `HERDR_AGENT=claude` on the `docker exec` process, or Herdr sees no agent. It marks Claude's first-run setup complete in the project container. It registers folder trust for the exact worktree before each launch.
- A Crewmate can see its home's whole signal folder, not only its own files. It could forge another ticket's signals. The worktree pool is also shared by every home.
- Tested only against a stand-in project container and one project. Not tested: the hardened Node Variant, two projects at once, and Crewmates on the permission mode that skips prompts.
