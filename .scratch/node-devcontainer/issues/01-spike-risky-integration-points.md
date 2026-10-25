# 01: Spike — verify the design's risky integration points

**What to build:** Written, evidence-backed answers to the seven unverified assumptions the approved design rests on, so later tickets build on facts. Nothing from the spike ships. The answers are recorded in this file under `## Answer`, and the design is flagged if any answer forces a revisit.

**Blocked by:** None (can start immediately)

**Status:** done

## Technical context

**Design:** `.scratch/node-devcontainer/design.md`, section "Risky integration points to verify first" and "Revisit this design if". Research background: `docs/research/secure-node-devcontainer.md`.

- **Modules:** none permanent. Use throwaway Dockerfiles and devcontainer configs in the scratchpad, never in the repo tree.
- **Reuse:** `@devcontainers/cli` (via `npx -y @devcontainers/cli@<exact version>` or a pinned global install), Docker on the host, `node:24-bookworm-slim` pinned by digest.
- **Must not introduce:** any committed implementation, `SYS_ADMIN`, `seccomp=unconfined`, or a Docker socket mount, even for testing.
- **Validation seam:** reproducible commands and their output, pasted into the Answer.
- **Coverage:** none (de-risks tickets 02–08).

Questions to answer, each with the command or source that proves it:

1. Does a local Feature's `entrypoint` run **as root** at container start when it comes from **image metadata** (prebuilt image, then a config that references only the image), under `devcontainer up` with default `overrideCommand`? Use `containerUser: root` and `remoteUser: node`. Does a non-zero exit from the entrypoint stop the container?
2. With `--cap-drop=ALL --cap-add=NET_ADMIN --cap-add=NET_RAW --security-opt no-new-privileges`, can that root step:
   - run dnsmasq with `--nftset`;
   - load an nftables ruleset (IPv4 set-based allow on 443/80, DNS only to the local resolver, IPv6 drop);
   - and leave `node` with `CapEff` 0, unable to change the rules?
3. Claude Code: do hooks inside a plugin that is force-enabled through managed `enabledPlugins`, from a marketplace declared in managed settings, run when `allowManagedHooksOnly: true`? Check the docs ("What runs under allowManagedHooksOnly" in the settings reference) and test empirically if possible without a login.
4. Codex CLI (pinned current version): is there a root-owned system config layer, for example `/etc/codex/config.toml` or `managed_config.toml`? What is its precedence over `$CODEX_HOME/config.toml`, and can it define `mcp_servers`, plugins, `sandbox_mode` and `approval_policy`? Also confirm Codex admin skills in `/etc/codex/skills` and the exact `codex plugin` install subcommands.
5. Do `@anthropic-ai/claude-code` and `@openai/codex` at pinned versions install and run with install scripts disabled (`npm install -g --ignore-scripts` and pnpm's default)? If not, which exact package needs a script and why?
6. Do `/etc/claude-code/managed-settings.d/*.json` drop-ins **merge** `enabledPlugins`, `extraKnownMarketplaces` and `hooks` with `managed-settings.json`, or replace them? Do two `directory` marketplaces in `strictKnownMarketplaces` plus `CLAUDE_CODE_PLUGIN_SEED_DIR=a:b` load plugins from both seeds?
7. Can a Dev Container Template published with `devcontainers/action` carry an image digest substituted at publish time (for example a templated option default, or a pre-publish rewrite step)? What is the least fragile way?

- [x] Each question has an answer with evidence (commands and output, or a doc quote with URL)
- [x] Any answer that breaks a design assumption names the affected tickets and the fallback from the design
- [x] No files added to the repository outside this ticket file

## Answer

Run on 2026-10-25, Docker 28.1.1, host Linux 6.8. Pinned: `@devcontainers/cli@0.89.0`, `node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205` (Debian 12: dnsmasq 2.90 with `nftset`, nftables 1.0.6), `@anthropic-ai/claude-code@2.1.310`, `@openai/codex@0.164.0`, pnpm 11.0.0 (self-switches to 11.28.8), `registry:2.8.3`. All throwaway files lived in the scratchpad; all containers used `--cap-drop=ALL` (plus only `NET_ADMIN`/`NET_RAW` where stated), `no-new-privileges`, no docker socket. Claude Code / Codex logins were not used. Not tested: VS Code itself (only the devcontainer CLI), `overrideCommand: false`.

Summary: Q1 works with one required wrapper; Q2 works with three adjustments; Q3 yes; Q4 yes, with precedence caveats and no root-owned Codex plugin delivery; Q5 Codex yes, Claude Code needs one explicit step; Q6 yes (merge); Q7 yes.

### 1. Feature `entrypoint` as root from image metadata

Yes. Build step (`devcontainer build` with a local Feature `./fw` whose `devcontainer-feature.json` has `"entrypoint": "/usr/local/share/fw/entry.sh"`, plus `containerUser: root`, `remoteUser: node`, `capAdd: [NET_ADMIN, NET_RAW]`, `securityOpt: [no-new-privileges]`) writes this label:

```
$ docker inspect spike-img:1 --format '{{index .Config.Labels "devcontainer.metadata"}}'
[{"id":"./fw","entrypoint":"/usr/local/share/fw/entry.sh"},
 {"containerUser":"root","capAdd":["NET_ADMIN","NET_RAW"],"securityOpt":["no-new-privileges"],"remoteUser":"node"}]
```

A second config that references only `{ "image": "spike-img:1", "runArgs": ["--cap-drop=ALL"] }` (default `overrideCommand`), run with `devcontainer up`, produced `docker run ... -u root --cap-drop=ALL --cap-add NET_ADMIN --cap-add NET_RAW --security-opt no-new-privileges --entrypoint /bin/sh ...` and Cmd:

```
-c "echo Container started\ntrap \"exit 0\" 15\n/usr/local/share/fw/entry.sh\nexec \"$@\"\nwhile sleep 1 & wait $!; do :; done" -
$ docker exec <cid> cat /tmp/entry-ran.txt
uid=0 pid=7 ppid=1
CapPrm: 0000000000003000   CapEff: 0000000000003000      (NET_ADMIN|NET_RAW)
$ devcontainer exec ... 'id; grep Cap /proc/self/status'
uid=1000(node) ...   CapEff: 0000000000000000   CapBnd: 0000000000003000
```

So the entrypoint runs as root, before any `node` process, with exactly the two caps. `node` has `CapEff` 0 (bounding set still lists them, neutralised by `no-new-privileges` and no setuid/file caps).

**Non-zero exit does NOT stop the container.** With `FW_FAIL=1` the entrypoint exited 3, `devcontainer up` returned `success` and the container stayed `Up`. The entrypoint is a plain line in the keep-alive shell, not `&&`-chained. Working fail-closed pattern, verified: the entrypoint, on any failure, runs `kill -TERM 1`; PID 1 is the `sh` with `trap "exit 0" 15`, so it exits as soon as the entrypoint returns:

```
main || { echo "entrypoint failed: $?" >&2; kill -TERM 1; exit 1; }
$ docker ps -a  ->  Exited (0) 4 seconds ago      (with sleep 5 in my test; `up` itself still reported success)
```

Caveats: `up` can still print success because the container is alive for a moment, so acceptance tests must assert the container is not running / `devcontainer exec` fails, not rely on `up`'s exit code. The exit code of the container is 0, not non-zero. The entrypoint must also daemonise or background anything long-running (it runs synchronously before the keep-alive loop). VS Code uses the same metadata merge (the Feature `entrypoint` is part of the Dev Container spec), but was not run here; the manual checklist in the design should cover it.

### 2. dnsmasq `--nftset` + nftables under `--cap-drop=ALL --cap-add NET_ADMIN --cap-add NET_RAW --security-opt no-new-privileges`

Works end to end, both via plain `docker run` and via the Feature entrypoint under `devcontainer up` (image `spike-img:3`, `node` curl to `registry.npmjs.org` = 200, `example.com` unresolved, `nft` denied, no sudo).

Setup that worked (root entry script): `dnsmasq --no-daemon` backgrounded with `setsid`, config `no-resolv`, `no-hosts`, `listen-address=127.0.0.1`, `bind-interfaces`, `user=root`, `group=root`, `cache-size=0`, and per allowed domain `server=/<d>/<upstream>` + `nftset=/<d>/4#inet#fw#allow4`; ruleset loaded with `nft -f` (`table inet fw`, set `allow4 {type ipv4_addr; flags timeout}`, output chain `policy drop`: established, root-only DNS to the upstream on 53, `oif lo accept`, `ip daddr @allow4 tcp dport {80,443} accept`; input chain `policy drop` with lo and established). `/etc/resolv.conf` rewritten to `127.0.0.1` by root.

Probes as `docker exec -u node`:

```
CapPrm/CapEff: 0000000000000000      id: uid=1000(node)
curl https://registry.npmjs.org/pnpm/latest      -> 200
curl https://example.com                          -> Could not resolve host
curl https://1.1.1.1  / https://93.184.215.14     -> Connection timed out
dig @1.1.1.1 / @127.0.0.11 / @<upstream>          -> no servers could be reached
dig example.com (via local resolver)              -> status: REFUSED
curl -6 https://[2606:4700:4700::1111]            -> Failed to connect (v6 dropped)
nft list ruleset / nft flush ruleset              -> Operation not permitted (you must be root)
kill <dnsmasq pid>; write /etc/resolv.conf        -> Operation not permitted / Permission denied
nft list set inet fw allow4                       -> 12 Cloudflare IPs (104.16.x.34) added by dnsmasq
```

Three findings that change the design text:
1. **dnsmasq cannot drop privileges** without `SETUID`/`SETGID` (`failed to change group-id to dip: Operation not permitted`, even with `group=root`). `--no-daemon` (debug mode) skips the privilege-drop block, so run it with `--no-daemon` backgrounded. dnsmasq therefore runs as root; `node` cannot signal it (verified). Port 53 binds fine without `NET_BIND_SERVICE` on this Docker.
2. **The upstream resolver is not always `127.0.0.11`.** On the default bridge network (what a devcontainer uses) the container's `resolv.conf` copied the host's (`192.168.10.1` here). The firewall must read the upstream(s) from `/etc/resolv.conf` at start and allow root-only DNS to those, plus drop `127.0.0.11` for non-root (otherwise the Docker resolver on user-defined networks is a DNS-tunnel path via loopback).
3. **Root without `DAC_OVERRIDE`/`CHOWN`/`SETUID`** is just uid 0 with normal permission bits: it could not execute a 770 file owned by uid 1000 (`Permission denied`), cannot chown to node, and cannot `su`/switch users. The start-up step must only read world-readable inputs (the workspace manifest is normally readable) and everything it writes must be root-owned; no step may rely on chown.

Residual: an allowed hostname behind a shared CDN IP (Cloudflare above) makes every site on that IP reachable on 443 by IP or SNI. Domain-level allowlisting is not host-level; note this in the threat model.

### 3. Hooks in a managed force-enabled plugin under `allowManagedHooksOnly: true`

Docs, https://code.claude.com/docs/en/settings-reference#what-runs-under-allowmanagedhooksonly :
> "**Force-enabled plugin hooks run**: hooks from plugins your managed settings force-enable through `enabledPlugins`. Claude Code matches on the full `plugin@marketplace` ID, so a plugin with the same name from a different marketplace stays blocked."
> "**Everything else is blocked**: user, project, and local hooks, hooks and mods from other installed plugins, and hooks declared in agent frontmatter."

Empirical (claude 2.1.310, fake `ANTHROPIC_API_KEY`, `claude -p hi --output-format stream-json --verbose`; the `SessionStart` hooks run before the failing API call; `/etc/claude-code/managed-settings.json` sets `allowManagedHooksOnly`, directory marketplaces and `enabledPlugins`; plugins carry a `SessionStart` hook that `touch`es a marker):

```
markers created:  marker-managed-base  marker-managed-dropin  marker-plugin-A  marker-plugin-B
NOT created:      marker-project   (a hook in /tmp/proj/.claude/settings.json)
control (allowManagedHooksOnly removed):  ... marker-project is created
```

So hooks inside managed-enabled plugins run, project hooks are ignored, and the control proves the test is sensitive. The design assumption holds, plugin-supplied hooks need no special-casing. Note: `claude plugin list` printed "No plugins installed" for managed-enabled seed plugins; use the `init` event's `plugins` array (`jq 'select(.subtype=="init").plugins'`) for SC-13/SC-15/SC-16 as the design already says.

### 4. Codex CLI 0.164.0 system config layers

- Layers on Linux (observed with `codex mcp list` and `codex doctor --json`, which reports `model`, `approval policy`, `filesystem sandbox`): `/etc/codex/config.toml` is read; `$CODEX_HOME/config.toml` overrides it; `/etc/codex/managed_config.toml` overrides both and the CLI. Test: `/etc/codex/config.toml` {sandbox danger-full-access, approval on-request, model sys-model}; user config {read-only, never, user-model} -> effective `user-model`, approval `Never`, fs `restricted`. Adding `managed_config.toml` {on-request, danger-full-access, managed-model} -> `managed-model`, `OnRequest`, `unrestricted`; `-c approval_policy=never` on the CLI could not override it.
- `mcp_servers` from all three layers are unioned (`codex mcp list` showed `sysmcp`, `usermcp`, `mgdmcp`).
- Doc quotes, https://developers.openai.com/codex/enterprise/managed-configuration : "Linux/macOS (Unix): /etc/codex/managed_config.toml"; precedence "Managed preferences (macOS MDM; highest) > managed_config.toml > config.toml (user's base configuration); CLI --config key=value overrides apply to the base, but managed layers override them"; "System requirements.toml (/etc/codex/requirements.toml on Unix systems)". Admin skills, https://developers.openai.com/codex/skills : "ADMIN `/etc/codex/skills` Any skills checked into the machine or container in a shared, system location." (path documented; skill discovery itself not run, it needs a model session).
- **The yolo wrapper conflicts with `managed_config.toml`.** With managed `never`/`read-only`, `codex --dangerously-bypass-approvals-and-sandbox` fails config load (`invalid input parameter`); with managed `on-request`/`danger-full-access` the flag is silently overridden. With the same values only in `/etc/codex/config.toml` (lowest layer) both `-c approval_policy=never` and `--dangerously-bypass-approvals-and-sandbox` work (`Never`/`unrestricted`). Put the `sandbox_mode`/`approval_policy` defaults in `/etc/codex/config.toml`, not `managed_config.toml`.
- Plugin subcommands (exact): `codex plugin add <PLUGIN[@MARKETPLACE]> [-m MARKETPLACE]`, `codex plugin list`, `codex plugin remove`, `codex plugin marketplace {add <SOURCE> [--ref R] [--sparse P] [--json], list, upgrade, remove}`; `SOURCE` is a local path, `owner/repo[@ref]`, or an HTTPS/SSH git URL. Marketplace layout: `.agents/plugins/marketplace.json`, plugin manifest `.codex-plugin/plugin.json`.
- Plugins: `/etc/codex/config.toml` may declare `[marketplaces.cmk] source_type="local" source="/tmp/cmk"` and `[plugins."cp@cmk"] enabled = true`; a fresh `CODEX_HOME` then lists the marketplace and `cp@cmk  not installed`. `codex plugin add` installs into `$CODEX_HOME/plugins/cache/<marketplace>/<plugin>/<version>` and writes both tables into the user `config.toml`. There is no seed or system cache location, so a root-owned Codex plugin install is not possible without writing into the login volume (`CODEX_HOME`).

### 5. Agent packages with install scripts disabled

- `@openai/codex@0.164.0`: no lifecycle scripts; platform binary comes from `optionalDependencies` (`@openai/codex-linux-x64` as `npm:@openai/codex@0.164.0-linux-x64`). `npm install -g --ignore-scripts` then `codex --version` -> `codex-cli 0.164.0`. Same with pnpm.
- `@anthropic-ai/claude-code@2.1.310`: has `postinstall: node install.cjs` (and a `prepare` that only blocks publishing). The native binary is installed anyway as optional dep `@anthropic-ai/claude-code-linux-x64`; `install.cjs` only copies it over `bin/claude.exe`. With `--ignore-scripts` (npm) or pnpm's default (`ERR_PNPM_IGNORED_BUILDS`, exit 1, package still installed): `claude --version` -> `Error: claude native binary not installed.`
- Verified fixes, any of: (a) `node $(npm root -g)/@anthropic-ai/claude-code/install.cjs` as an explicit, reviewed build step (then `claude --version` -> `2.1.310 (Claude Code)`); (b) `node .../cli-wrapper.cjs --version` works without postinstall (spawns the native binary); (c) the native binary itself runs: `.../node_modules/@anthropic-ai/claude-code-linux-x64/claude --version`; (d) pnpm `pnpm-workspace.yaml` `allowBuilds: {"@anthropic-ai/claude-code": true}` (exit 0, works). Recommend (a) or symlinking (c) in the Dockerfile; both keep install scripts globally disabled and the exception explicit. Do not use `--omit=optional`.

### 6. `managed-settings.d` merge and two seeds

Docs, https://code.claude.com/docs/en/managed-settings.md#split-a-file-based-policy-across-teams : "Claude Code merges `managed-settings.json` first, then every `*.json` file in the directory in alphabetical order... **Lists**... combine, with duplicates removed; **Nested blocks**, such as `env`... merge key by key; **`extraKnownMarketplaces`** and `managedMcpServers`: a later entry with the same name replaces the earlier one whole". `CLAUDE_CODE_PLUGIN_SEED_DIR`, https://code.claude.com/docs/en/plugins/org.md : "To use several seeds, separate their paths with `:` on Unix... Claude Code uses the first seed that contains a given marketplace or plugin cache"; seeds are read-only and `autoUpdate` forced off.

Empirical: seeds `/opt/seedA` and `/opt/seedB` (each built with `CLAUDE_CODE_PLUGIN_CACHE_DIR=... claude plugin marketplace add /opt/mktX` + `plugin install`), `CLAUDE_CODE_PLUGIN_SEED_DIR=/opt/seedA:/opt/seedB`. Base file: `allowManagedHooksOnly`, `strictKnownMarketplaces:[directory /opt/mktA]`, `extraKnownMarketplaces:{mktA}`, `enabledPlugins:{pA@mktA}`, a `SessionStart` hook. Drop-in `50-project.json`: `strictKnownMarketplaces:[directory /opt/mktB]`, `extraKnownMarketplaces:{mktB}`, `enabledPlugins:{pB@mktB}`, another hook.

```
init.plugins -> pA@mktA, pB@mktB (+ built-in cc-plugin-*)
markers: managed-base, managed-dropin, plugin-A, plugin-B     (hooks from both files and both plugins ran)
negative: drop-in strictKnownMarketplaces listing only mktA -> init.plugins has pA only, no marker-plugin-B
```

So `enabledPlugins`, `extraKnownMarketplaces` and `hooks` merge across base and drop-in, `strictKnownMarketplaces` lists union, and two `directory` marketplaces from two seeds both load. The strict allowlist is enforced (a marketplace not in the union is refused). Note: because both marketplaces are `directory` sources, `init` reported plugin paths as `/opt/mktA/plugins/pA` (read in place from the marketplace directory), not under the seed `cache/`; the generated marketplace directories must therefore stay root-owned and in place at runtime, and the container-filesystem project marketplace must persist at its path.

### 7. Digest substitution in a Template published with `devcontainers/action`

Yes. Template options are substituted at `templates apply` time via `${templateOption:<id>}`, including nested inside `${localEnv:...}`. Least fragile: declare an option `imageDigest` whose `default` is rewritten by a pre-publish CI step (`jq '.options.imageDigest.default=$digest' src/node/devcontainer-template.json`) between checkout and the action, after the image build step outputs the digest. Tested end to end against a local `registry:2.8.3` using the same publisher the action wraps (`devcontainer templates publish -r localhost:5055 -n spike/dev-setup src`, then `templates apply -t localhost:5055/spike/dev-setup/node:1`):

```
src/node/.devcontainer/devcontainer.json:  "image": "ghcr.io/valerid/dev-setup/node@${templateOption:imageDigest}",
                                            "remoteEnv": {"GH_PAT": "${localEnv:${templateOption:patEnvVar}}"}
after jq rewrite + publish + apply (default options):
  "image": "ghcr.io/valerid/dev-setup/node@sha256:ba7816bf...15ad",  "GH_PAT": "${localEnv:GITHUB_TOKEN_THIS_REPO}"
apply -a '{"patEnvVar":"MY_PAT"}':  same digest, "GH_PAT": "${localEnv:MY_PAT}"
```

`devcontainers/action` (latest v1.4.4, `using: node24`) has inputs `publish-templates`, `base-path-to-templates`, `oci-registry-for-templates`, `templates-namespace` (https://github.com/devcontainers/action/blob/main/action.yml), so the rewrite step goes before it in the same job; pin the action by SHA. Pitfalls: the Template `version` must be bumped per publish or the OCI tag will not move (the digest changes every build); a user can override the option, so mark it clearly in the description; the digest must be that of the multi-arch index pushed by `devcontainer build --push`, not a per-platform digest.

### Design impact

No answer triggers a "Revisit this design if" condition: the Feature `entrypoint` runs as root (so no proxy-sidecar fallback), and Codex does have a root-owned config layer. Required adjustments:

- **Ticket 02 (skeleton) / 03 (egress start-up):** wrap the entrypoint in the fail-closed pattern (`kill -TERM 1` on any failure; the design's "container stops" assumption does not hold otherwise). Acceptance asserts the container is stopped / not exec-able, not that `up` fails. Run dnsmasq `--no-daemon` backgrounded as root (no privilege drop possible). Discover the upstream resolver from `resolv.conf` instead of assuming `127.0.0.11`, and drop `127.0.0.11` for non-root. Entrypoint inputs must be world-readable and outputs root-owned (root has no `DAC_OVERRIDE`/`CHOWN`). Document the shared-CDN-IP residual in the threat model/ADR 0002 consequences.
- **Ticket 02 / 04 (Dockerfile, pnpm):** Claude Code needs one explicit step (run `install.cjs` or symlink the platform binary); Codex needs none. Keep scripts globally disabled; record the exception.
- **Ticket 06 / 08 (installer, Claude plugins):** assumptions confirmed. Use `directory` marketplaces in `strictKnownMarketplaces`, base + drop-in merge, two seeds; verify through the `init` event, not `claude plugin list`. Plugin-supplied hooks run under `allowManagedHooksOnly`, so no rejection logic is needed for them.
- **Tickets 06 / 07 / 09 (Codex delivery):** put `sandbox_mode`/`approval_policy` defaults in `/etc/codex/config.toml`, not `managed_config.toml`, or `codex-yolo` breaks (SC-11 wrapper checks). MCP servers from the system file are unioned with the user file. **Codex plugins cannot be installed root-owned outside `CODEX_HOME`**; the kind x Agent capability table should mark `plugin` for Codex as unsupported (validation error naming the entry) for now, or the installer must fall back to skills and MCP only. This is a fallback decision for the product owner if Codex plugins are wanted: install into the login volume (violates the "project artefacts never go into login volumes" constraint) or defer.
- **Ticket 10 (CI release):** use the `jq` option-default rewrite between image push and `devcontainers/action` publish-templates; bump the Template version per release.
- No change needed for tickets 05 and 11 from this spike.
