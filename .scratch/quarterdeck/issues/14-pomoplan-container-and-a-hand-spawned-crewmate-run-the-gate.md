# 14: The hardened project container on pomoplan runs the full gate for a hand-spawned Crewmate

**Status:** ready-for-human
**Model:** Sonnet
**Design slice:** 3 (Hardened project container), the real half

## Human step: the user supplies the token

pomoplan's Project layer pulls 14 skills from the private repository `ValeriD/skills` when the container starts. The user has decided to provide a GitHub token limited to that one repository (read-only) so the project container can fetch them. That token is delivered by ticket 08. The user must supply its value before this ticket's real run; it is a human step, not a design decision. The project container still gets no credential for pomoplan's own repository and nothing that can push.

## What to build

`qd-project-up` on pomoplan's real main-branch `.devcontainer/`, then one Crewmate spawned by hand with FirstMate's own commands (as in spike link 1). It runs `pnpm install --frozen-lockfile` and the full gate inside the container with no prompt, and with no credential in the container other than the read-only extensions token.

## Working assumptions and decisions

- DECISION (user): if the hardened policy's `allowManagedHooksOnly` stops FirstMate's Crewmate hooks, the fix is a hook delivered as an Agent Extension, opt-in, added only by the Quarterdeck when it creates the container (ticket 15). Do not relax the policy and do not put anything FirstMate-specific in Base or the Node Variant. This ticket only measures whether it is needed.
- ASSUMPTION, undecided by the user ("will see"): `/workspace` holds only the main-branch `.devcontainer/`, read-only (as in ticket 07).

## Acceptance criteria

- [ ] `qd-project-up` on pomoplan's `origin/main` leaves a running container from its pinned image, egress ready, with the Project layer installed (skills fetched from `ValeriD/skills` with the read-only token), and no GitHub credential in the container other than that token: nothing that can push and no credential for pomoplan's own repository.
- [ ] A Crewmate spawned by hand (`fm-spawn.sh <slug> projects/pomoplan --mode direct-PR --yolo off --branch-prefix <prefix> --harness claude --model sonnet` in the Second Mate's home) starts through the launcher with no prompt, trust dialog or login, and Herdr shows its real state (working, blocked, done), not "not found" (SC-02, SC-10 part).
- [ ] That Crewmate runs `pnpm install --frozen-lockfile`, `pnpm run build`, `pnpm run lint` and `pnpm test` in the container under the Egress Allowlist, and all four pass (SC-07 part).
- [ ] Recorded in a comment: which destinations `next build` and `/implement` needed beyond the Base list and pomoplan's layer (any addition goes to pomoplan's own layer; a Base change is a new ticket).
- [ ] Recorded in a comment: whether FirstMate's busy and turn-end hooks fired under the hardened policy, and whether supervision worked without them.
- [ ] Recorded in a comment: the final list of proxy endpoints the devcontainer CLI needed for pomoplan's local Feature `playwright-deps`, and the proxy list (ticket 04) updated to match.
- [ ] The rows for SC-02, SC-07 and ticket 08's token-scope row (the `ValeriD/skills` token reads that repository only, and a push is refused) in `quarterdeck/CHECKLIST.md` are run and noted.

## Technical context

**Design:** `.scratch/quarterdeck/design.md`, "Project container" (all rows, especially "Project-layer fetch" and "Crewmate hooks under the hardened policy"), "Existing shape" (pomoplan), "Risky integration points".

- **Modules touched:** tickets 04, 07 and 09's outputs; possible small fixes there (note them).
- **Implementation anchors:** `.scratch/pat-container-env/issues/01` (the private-repository fact), `spike/FINDINGS.md` link 1 (the commands), pomoplan's `.devcontainer/`.
- **Must not introduce:** a GitHub credential in the project container, a relaxed Claude policy, a change to the Variant, Template or Base.
- **Validation seam:** real Claude session, real pomoplan; a human is present for the first run.
- **Coverage:** proves the unproven items of SC-02, SC-07, SC-10, SC-15 to SC-17 on the real image.

## Blocked by

- 03: Tokens reach only the processes that need them, by name (its mechanism awaits the user's confirmation, so this ticket cannot run a real Claude until then)
- 05: The First Mate's home is seeded and its tab opens on start
- 07: `qd-project-up` creates the project container from the project's main branch
- 08: The project container receives a read-only token for fetching Agent Extensions
- 09: The `claude` launcher runs a Crewmate in the project container with the right environment
- The user supplying the read-only `ValeriD/skills` token (human step)
