# FirstMate is consumed as a pinned fork, with no edits to upstream files

The Quarterdeck uses FirstMate from our fork, `ValeriD/firstmate`, at an exact commit, which is a Pinned Ref. In the MVP we edit no upstream file. Our parts sit outside them: the launcher, local configuration, the Charter and skills. We update the pin on our own schedule, after reading the diff. FirstMate changes daily, and its main launch script, `bin/fm-spawn.sh`, is over eight thousand lines, so every local edit would become a merge conflict. The spike ran four links of the design with no patch.

## Considered Options

- Tracking upstream head: rejected because it breaks the Pinned Ref rule and lets a daily-changing tool change what runs in the Quarterdeck unreviewed.
- Editing the fork freely: rejected because of the merge conflicts above.
- Not using FirstMate and writing our own orchestration: rejected because FirstMate already covers what the spike needed, and it is MIT licensed.

## Consequences

- Behaviour we dislike is worked around through configuration first. The spike found two such places. FirstMate has one permission mode per home, shared by a mate and its Crewmates, so we accept `auto` for both for now. Its pull-request wording tells the Crewmate to push, which we cover in [ADR 0007](0007-project-containers-hold-no-github-credential.md).
- A change that cannot be configured becomes a small separate commit on the fork. It is re-applied on each update and offered upstream.
- Each update costs a diff review. The pin is also behind upstream by design.
- FirstMate pins Herdr 0.7.4, below its own 0.8.0 floor for some layouts. The flat layout worked, so we do not patch it.
