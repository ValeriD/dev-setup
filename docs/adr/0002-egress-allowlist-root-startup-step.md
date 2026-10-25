# Egress Allowlist applied by a root start-up step, with no privileges for the dev user

Every major npm worm (Shai-Hulud, s1ngularity, ChainDrop) depends on sending stolen credentials out, so containers deny all egress except the Egress Allowlist. We deliberately do not copy Anthropic's reference `init-firewall.sh`: it grants the dev user sudo plus `NET_ADMIN`, allows DNS to any server and all GitHub ranges, and leaves IPv6 open.

Instead, a root start-up step (a Feature `entrypoint`) applies the rules before any dev-user process exists. The allowlist is enforced by name: a filtering DNS resolver feeds an nftables set. DNS is restricted and IPv6 is blocked. The dev user has no sudo, no capabilities and no setuid paths, so nothing it runs, including an Agent, can turn the firewall off.

We first planned OpenAI's `docker exec --user root` from the host. It was dropped because the devcontainer lifecycle has no host-side hook that runs after the container is created.

## Considered Options

- Egress proxy sidecar on an internal Docker network: rejected because it needs a compose-based Template, depends on every tool honouring proxy env, and leaves no root step to install project-layer extensions into protected paths. It is the fallback if the start-up step proves unworkable.

## Consequences

- Reaching a new destination means editing an Extension Manifest's egress entries and recreating the container.
- The container keeps `NET_ADMIN`/`NET_RAW` (and `DAC_READ_SEARCH`, kept deliberately so root can read the project manifest in an owner-only project directory; without it the Project layer would be unreadable there) for its root process only. If the dev user ever gains root, the firewall can be bypassed, so "no path to root" is itself a tested invariant.
- If any start-up step fails, the container stops instead of running with open egress.
- Allowlisting is by name but enforced by IP, so other sites sharing an allowlisted CDN IP are reachable. This is accepted residual risk.
