# Quarterdeck architecture

Module anchors and durable decisions are indexed in [ARCHITECTURE.md](../../ARCHITECTURE.md#quarterdeck). This page describes shipped mechanisms, not completion of the real-agent acceptance runs.

## Dependency flow

```text
host quarterdeck → Quarterdeck image → Base material + extension installer
mate skills → FirstMate commands → claude launcher → docker exec → project container
Second Mate skill → qd-project-up → devcontainer CLI → socket proxy → Docker
publish Crewmate → qd-publish → git + gh → GitHub
```

FirstMate owns session lifecycle and supervision; Quarterdeck supplies configuration, managed skills and the launcher on PATH, not a replacement lifecycle wrapper. Only the owning Second Mate dispatches project Crewmates. The skills preserve generated Brief safety and delivery-contract lines while editing private Brief content.

## Startup and home ownership

The host command builds a missing image and mounts the host work root at the same absolute path. The pool is additionally mounted at `/home/node/.treehouse`; Claude state lives under the work root. Host-created folders and the token file must be usable by container uid 1000. Git author/committer identity is passed by environment name at container creation.

The host checks token-file ownership, warns on mode other than 0600, and mounts it read-only. `qd-entry` applies Base egress against the image's empty workspace, checks readiness, then starts `qd-server` and `qd-first-mate` as `node`. The server parses declared secret names without shell evaluation and supplies them to Herdr's environment. **Environment delivery is not file isolation:** the mounted source remains readable to the same UID from an outside exec shell; [security concern 07](../../.scratch/quarterdeck-security-review/issues/07-quarterdeck-secrets-mount-readable-from-exec.md) records the unmet boundary.

The First Mate home is copied from the root-owned pinned checkout, avoiding Git's ownership refusal on a local clone. Only missing shipped configuration files are added on subsequent starts. Startup writes onboarding/trust state and opens one `firstmate` workspace running Claude Opus in auto mode. The shipped configuration selects Herdr, Sonnet for Second Mates, shared-quota dispatch with Opus for skills/prompts/agent-tool tickets and Sonnet otherwise. Typed dispatch remains off.

Host readiness requires egress ready, Docker answering, Herdr running and the First Mate workspace present; it does not prove Claude completed an unattended turn. The container lifetime follows Herdr's server. Restarting does not implement Spec Run recovery.

The default Docker bridge avoids embedded-DNS rules being removed by Base's ruleset flush. The proxy uses a shared Unix socket, so it needs no Base egress change. Ownership labels are placed on containers, not the image; proxy resources have a separate label key. Host stop removes its labelled Quarterdeck/proxy containers and proxy volume, not project containers. Endpoint filtering does not inspect container-create bodies or restrict their host mounts.

## Project execution and publication

[Project-container documentation](../../quarterdeck/PROJECT-CONTAINERS.md) owns the renderer's accepted `runArgs`, retained Features, mount set, creation-time extensions-token exception, reuse identity, launcher environment and private publish marker. Those mechanisms are not a general isolation guarantee.

The publisher uses the clone's explicit Git directory rather than a worktree's redirectable `.git` file. It forces hooks and fsmonitor off through environment and command-line overrides and pushes with `--no-verify`. It derives the PR body from numbered ticket titles on the branch and the base branch from origin. These controls do not neutralize every Git configuration key or shared-store attack; the index links the accepted Git-redirection decision. A successful push followed by failed PR creation is a partial result, not an automatically retried transaction.

## Validation boundaries

[Quarterdeck tests](../../tests/quarterdeck.test.mjs) cover plumbing, structural skill contracts and token-free loops with the [Crewmate fixture](../../tests/fixtures/quarterdeck-crewmate/). The prepared-home loop uses real FirstMate/Herdr commands, full public FirstMate history, simulated Stop hooks and a local origin. That preparation is not a shipped fix for stock shallow-home lineage checks.

The shipped Spec Run skill specifies planning, ordered fresh ticket sessions, one failure retry, question/death stops and a correlated report. Real unattended planning, supervision, publication, attention marks and failure-path runs remain unproven; dependency ticket 18 is still awaiting real-agent evidence. The manual checklist linked from the index owns those procedures and their prerequisites, including the conditional hook-extension decision. No opt-in hook extension is shipped here.

The extensions-token persistence check remains a TODO, not a pass: the pinned devcontainer CLI copies the allowed creation-time token into `/etc/environment`. Container inspect visibility acceptance does not accept this persistence. Details and the existing security-review pointers live in the project-container documentation; real-token permission scope and real-Claude publish instruction loading remain manual checks.
