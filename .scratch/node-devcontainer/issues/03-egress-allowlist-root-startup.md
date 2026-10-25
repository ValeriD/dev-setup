# 03: Egress Allowlist enforced by the root start-up step

**What to build:** Every container blocks all outbound traffic except the Base Egress Allowlist from the moment it starts. Allowed are the npm registry, GitHub, Anthropic, OpenAI (including login hosts) and the VS Code endpoints. The dev user can't change or disable the firewall. If the firewall can't be applied, the container does not start.

**Blocked by:** 02 (Walking skeleton)

**Status:** ready-for-agent

## Technical context

**Design:** `.scratch/node-devcontainer/design.md`. Use the "Egress" row, the "Container start" flow, Constraints, decision D1, and ADR `docs/adr/0002-egress-allowlist-root-startup-step.md`. Ticket 01 Answer questions 1–2 give the verified mechanics.

- **Modules:**
  - Base material: the start-up step, packaged as a local Feature with an `entrypoint` (root, `containerUser: root`), plus the dnsmasq and nftables config renderer and a self-test.
  - Node Variant: installs the Feature and OS packages, and adds `NET_ADMIN`/`NET_RAW` via image metadata `capAdd`.
- **Reuse:** dnsmasq `--nftset` filling an nftables set. DNS from the dev user goes only to the local dnsmasq, and only dnsmasq may reach Docker's resolver. IPv6 is dropped.
- **Allowlist input:** a static Base allowlist file in the Base material for now. Ticket 06 replaces it with manifest-assembled input in the same format, so keep the format plain (one domain per line).
- **Dependency direction:** the start-up step consumes an allowlist file; it does not know about manifests.
- **Must not introduce:** sudo, a proxy sidecar, static IP allowlists such as GitHub meta CIDRs, an SSH port 22 allowance, or any fail-open path.
- **Validation seam:** container acceptance probes as `node`.
- **Coverage:**
  - SC-04.
  - SC-06, firewall part: `nft` changes fail as `node`, and dnsmasq can't be signalled or replaced.
  - Extends the ticket 02 harness.

- [ ] `https://example.com` fails; `registry.npmjs.org`, `api.github.com`, `api.anthropic.com` and `api.openai.com` succeed
- [ ] IPv6 egress fails; DNS queries to an arbitrary resolver (e.g. `1.1.1.1`) fail; non-allowlisted names don't resolve
- [ ] As `node`, attempts to list or change nftables rules, or to kill or restart dnsmasq, fail
- [ ] A deliberately broken allowlist or ruleset makes `devcontainer up` fail instead of starting with open egress
- [ ] OpenAI and Anthropic login hostnames are verified (not assumed) and documented next to the allowlist

## Spike findings to apply (from ticket 01 Answer)

- **Fail closed:** an entrypoint's non-zero exit does NOT stop the container, and `devcontainer up` still reports success. On any failure the start-up step must `kill -TERM 1`, since PID 1 is the keep-alive `sh` that traps signal 15. Acceptance tests assert that the container stopped, not just `up`'s exit code.
- **dnsmasq** can't drop privileges in this setup. Run it as root with `--no-daemon`, backgrounded.
- **Upstream resolver:** read it from `/etc/resolv.conf` at start; on the default bridge it was the host's resolver, not `127.0.0.11`. Block `127.0.0.11` and the upstream for non-root.
- **Shared CDN IPs:** an allowlisted name's CDN IP makes other sites on that IP reachable. Record this as a residual risk; it is already noted in ADR 0002.
