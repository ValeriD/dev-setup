# 05: Publish the Template only when it or the image changes

**What to build:** Nothing on its own. The work is folded into other tickets.

**Blocked by:** None

**Status:** wontfix

## Comments

2026-10-28 grilling, all recommendations accepted:
- Q7: set `disable-repo-tagging: true` and keep the version as `0.1.<run number>`. Once ticket 01 is in, a new version appears only when the image or the Template really changed.
- Q8 (round 2): a `templates/`-only change publishes the Template alone, pointing at the current image's digest (see 01).

`/to-tickets` on 2026-10-28 folded Q7 into node-devcontainer 15 and Q8 into ci-efficiency 01. Ticket 01's gating means the Template publishes only when the image or `templates/` changed.
