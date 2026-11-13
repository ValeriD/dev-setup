# 04: The Quarterdeck reaches Docker only through a filtering socket proxy

**Status:** ready-for-agent
**Model:** Sonnet
**Design slice:** 1 (Quarterdeck up), Docker access

## What to build

`quarterdeck` also starts an off-the-shelf socket proxy beside the Quarterdeck. The host Docker socket is mounted read-only into the proxy only. The proxy listens on a Unix socket in a shared volume, and the Quarterdeck's `DOCKER_HOST` points there. Container lifecycle calls work; everything outside the allowed list gets a refusal. The accepted gap (the proxy cannot see a container-create body) stays accepted.

## Working assumptions and decisions

- Design open question 5 (agreed by the user): Base's Egress Allowlist applies in the Quarterdeck and the proxy is reached over a Unix socket, so `base/egress/` does not change.
- If the Unix-socket listener or per-method path rules do not hold for the pinned release, STOP. The design's fallback (Tecnativa on TCP plus one fixed local address in `base/egress/render.sh`) edits `base/` and needs the user's approval. Record what was found in a comment on this file and report; do not implement the fallback unasked.

## Acceptance criteria

- [ ] After `quarterdeck`, a proxy container (`wollomatic/socket-proxy`, pinned to a digest, host socket read-only) is running with the run's label, and the Quarterdeck's `DOCKER_HOST` is `unix:///run/docker-proxy/docker.sock` over the volume `quarterdeck-docker`.
- [ ] From inside the Quarterdeck: `docker version`, `docker info`, `docker ps` and a create, start, stop, exec and remove of a labelled container from an image already present all work.
- [ ] `docker system df` and `docker swarm init` return 403 (refused by the proxy), as do `commit`, `auth`, prune and container archive calls.
- [ ] The allowed list is the design's: GET `_ping`, `version`, `info`, `containers/json`, `containers/{id}/json`, `images/{name}/json`, `volumes`, `events`; POST `containers/create`, `start`, `stop`, `kill`, `wait`, `exec`, `exec/{id}/start`, `exec/{id}/resize`, `images/create`, `build`, `volumes/create`; DELETE `containers/{id}`. The whole list is in one place and a test reads it.
- [ ] The Quarterdeck's egress ruleset is unchanged from Base's (`git diff base/egress` is empty) and the Quarterdeck can still reach the proxy.
- [ ] `quarterdeck stop` removes the proxy and its volume along with the Quarterdeck container, and still removes only labelled things.

## Technical context

**Design:** `.scratch/quarterdeck/design.md`, "Docker access" and "Risky integration points".

- **Modules:** `quarterdeck/bin/quarterdeck` (creates and removes the proxy), `quarterdeck/` proxy configuration (the allowed list), the Quarterdeck image (`DOCKER_HOST`).
- **Implementation anchors:** `base/egress/render.sh` (read only: confirm a Unix socket needs no rule), `tests/lib.mjs` (labelled cleanup).
- **Reuse:** `wollomatic/socket-proxy` off the shelf (grill decision 10).
- **Dependency direction:** host -> proxy -> host socket; Quarterdeck -> proxy only.
- **Must not introduce:** a custom proxy, rootless Docker, the raw host socket inside the Quarterdeck, a change to `base/`.
- **Validation seam:** `tests/quarterdeck.test.mjs`, running Docker commands through the proxy. The exact endpoint list the devcontainer CLI needs is confirmed in ticket 07 (fixture) and ticket 14 (pomoplan); both may add entries, so keep the list data-driven.
- **Coverage:** owns the "Docker access" row of the Validation plan (denied endpoints 403, allowed lifecycle works). No SC number; it supports SC-17.

## Blocked by

- 01: Quarterdeck image and the `quarterdeck` host command
