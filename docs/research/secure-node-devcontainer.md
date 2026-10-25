# Securing a Node.js devcontainer that runs Claude Code and Codex CLI

Research pass dated **2026-10-25**. Scope: VS Code Dev Containers / `devcontainer` CLI on a Linux Docker host, Node.js toolchain, with Claude Code and OpenAI Codex CLI running inside the container.

Versions checked against the npm registry and nodejs.org on 2026-10-25:

| Component | Current | Notes |
| --- | --- | --- |
| npm | `12.2.1` (`latest`), `11.21.1` (`next-11`) | npm 12.0.0 published 2026-07-08. **Node 24.22.1 and 26.12.1 still bundle npm 11.19/11.20**, so you must install npm 12 yourself. |
| pnpm | `12.15.0` (`latest`), `11.28.8` (`latest-11`) | pnpm 11.0.0 on 2026-04-28, pnpm 12.0.0 (Rust rewrite) on 2026-08-26 |
| Yarn Berry | `4.18.1` | |
| Node.js | 24.x "Krypton" Active LTS, 22.x "Jod" Maintenance LTS, 26.x Current | Node 20 is end of life. Corepack is not bundled from Node 25 on. |
| `@anthropic-ai/claude-code` | `2.1.310` | |
| `@openai/codex` | `0.164.0` | |
| `@devcontainers/cli` | `0.89.0` | |
| `sfw` (Socket Firewall Free) | `2.0.6` | |
| `@aikidosec/safe-chain` | `1.5.26` | |
| `@lavamoat/allow-scripts` | `5.1.0` | |
| `npq` | `3.27.2` | |

---

## TL;DR recommendations

1. **Use pnpm 11 or later (currently 12.x) as the package manager.** It is the most secure by default. Dependency build scripts are blocked and unreviewed ones fail the install (`strictDepBuilds: true`). New releases wait 1 day (`minimumReleaseAge: 1440`). Transitive git and tarball dependencies are blocked (`blockExoticSubdeps: true`). Also set `trustPolicy: no-downgrade` and raise `minimumReleaseAge` to 3–7 days. ([pnpm 11.0](https://pnpm.io/blog/releases/11.0), [pnpm build settings](https://pnpm.io/settings/build), [pnpm resolution settings](https://pnpm.io/settings/dependency-resolution))
2. **If you must use npm, install npm 12 explicitly** (`npm i -g npm@12.2.1`), because Node does not ship it yet. Commit `allowScripts` to `package.json` and set `strict-allow-scripts=true`, `min-release-age=7`, `allow-git=none` and `allow-remote=none`. On npm 11, set `ignore-scripts=true`. ([npm config](https://docs.npmjs.com/cli/v11/using-npm/config), [npm approve-scripts](https://docs.npmjs.com/cli/v12/commands/npm-approve-scripts), [Socket on npm 12](https://socket.dev/blog/npm-12))
3. **Install only from frozen lockfiles** inside the container: `pnpm install --frozen-lockfile`, `npm ci`, `yarn install --immutable` or `bun install --frozen-lockfile`. Update dependencies on purpose, in a separate step, with cooldowns also configured in Renovate or Dependabot.
4. **Optionally put a malware-blocking proxy in front of installs**: Socket Firewall Free (`sfw pnpm install`) or Aikido Safe Chain. These are defense in depth, not a replacement for the settings above. ([Socket Firewall Free docs](https://docs.socket.dev/docs/socket-firewall-free), [AikidoSec/safe-chain](https://github.com/AikidoSec/safe-chain))
5. **Run the container as a non-root user with no passwordless sudo.** Do not mount the Docker socket. Use `--cap-drop=ALL` and `--security-opt=no-new-privileges`. Never mount `$HOME`, `~/.ssh`, `~/.npmrc`, `~/.aws` or `~/.config/gh` from the host.
6. **Mount `.git/hooks`, `.git/config` and `.devcontainer/` read-only into the container.** Otherwise the container can plant code that runs later on the host (a "deferred escape"). Trail of Bits' devcontainer does this. ([trailofbits/claude-code-devcontainer](https://github.com/trailofbits/claude-code-devcontainer))
7. **Treat VS Code "Reopen in Container" as convenience, not a security boundary.** By design, VS Code forwards your SSH agent, git credential helper, `.gitconfig` and IPC sockets that can drive host commands. Container code can use these to run commands on the host. For untrusted or YOLO agent runs, use the `devcontainer` CLI with a plain terminal, Docker Sandboxes (microVM), or harden VS Code as described in section 2.5. ([Red Guild write-up via ToB README](https://blog.theredguild.org/leveraging-vscode-internals-to-escape-containers/), [vscode-remote-release#11413](https://github.com/microsoft/vscode-remote-release/issues/11413))
8. **Add a default-deny egress firewall**, with an allowlist of registry, model API and git host. Anthropic's `init-firewall.sh` is the reference, but know its gaps: DNS goes to any server, all of GitHub's IP ranges are allowed, IPv6 is not filtered, and the script adds sudo plus `NET_ADMIN`. ([anthropics/claude-code .devcontainer](https://github.com/anthropics/claude-code/tree/main/.devcontainer))
9. **Pin everything.** Pin the base image by `@sha256:` digest and use Node 24 LTS, not the `node:20` that Anthropic's reference still uses. Pin features with the now-default `.devcontainer-lock.json` and `devcontainer up --frozen-lockfile`. Pin agent CLIs to exact versions and set `DISABLE_AUTOUPDATER=1`. ([devcontainers/cli#1212](https://github.com/devcontainers/cli/pull/1212), [Claude Code devcontainer docs](https://code.claude.com/docs/en/devcontainer))
10. **Assume anything inside the container can be stolen**, including `~/.claude`, `~/.codex/auth.json`, `GH_TOKEN` and API keys. That is exactly what s1ngularity, Shai-Hulud and ChainDrop harvested. Use per-project volumes, fine-grained single-repo GitHub tokens with short expiry (or push from the host), and API keys with spend limits.
11. **Claude Code**: keep the permission prompts or auto mode by default. Use `--dangerously-skip-permissions` only with the egress firewall in place and trusted repositories. Install `/etc/claude-code/managed-settings.json` from the image. Persist `~/.claude` in a named volume with `CLAUDE_CONFIG_DIR` set. ([devcontainer docs](https://code.claude.com/docs/en/devcontainer))
12. **Codex**: its bwrap+seccomp sandbox usually cannot start inside an unprivileged Docker container. OpenAI's guidance is to make the container the boundary and run `--sandbox danger-full-access` inside it, only for trusted repos. Do not weaken the outer container (`seccomp=unconfined`, `SYS_ADMIN`) just to make the inner sandbox work. ([Codex approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security))
13. **Install plugins and skills at build time into paths outside the persisted home volumes**: `/etc/claude-code/.claude/skills`, a Claude plugin seed at `/opt/claude-seed` with `CLAUDE_CODE_PLUGIN_SEED_DIR`, and `/etc/codex/skills`. Pin every plugin source to a 40-character commit `sha` (Claude) or `sha` (Codex marketplace entries), and turn auto-update off. ([Claude plugin org docs](https://code.claude.com/docs/en/plugins/org.md), [Claude marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference.md))
14. **Treat repo-supplied agent config as code.** That covers `.claude/settings.json` hooks, `.mcp.json`, `.codex/config.toml`, `.vscode/tasks.json` and `.agents/skills`. ChainDrop (Aug 2026) spread through a Claude `SessionStart` hook and a VS Code `folderOpen` task. ([Elastic on ChainDrop](https://www.elastic.co/security-labs/shai-hulud-chaindrop-npm-supply-chain))

---

## 1. npm supply-chain defenses (2025–2026)

### 1.1 What the incidents taught

| Incident | Date | Vector | Lesson for this setup |
| --- | --- | --- | --- |
| **nx "s1ngularity"** | 2025-08-26 | Malicious `nx` versions ran a `telemetry.js` **postinstall** that **invoked locally installed AI CLIs** (Claude, Gemini, Q) with `--dangerously-skip-permissions` / `--yolo` / `--trust-all-tools` to search the filesystem for secrets. Data was exfiltrated to public GitHub repos. About 2,180 accounts and 7,200 repos were exposed. | Install scripts plus an AI CLI in the same environment is a force multiplier. Disable install scripts, and do not leave an agent with bypassed permissions on `PATH` where `npm install` runs with host-level access. ([StepSecurity](https://www.stepsecurity.io/blog/supply-chain-security-alert-popular-nx-build-system-package-compromised-with-data-stealing-malware), [BleepingComputer](https://bleepingcomputer.com/news/security/ai-powered-malware-hit-2-180-github-accounts-in-s1ngularity-attack), [Docker blog](https://www.docker.com/blog/coding-agent-horror-stories-the-29-million-secret-problem/)) |
| **chalk/debug (qix)** | 2025-09-08 | Phishing from `npmjs.help` captured username, password and TOTP. Crypto-stealing code went into 18 packages with about 2B weekly downloads. They were live for about 2.5 hours. | Even the most trusted packages get hijacked. Cooldowns of 1 day or more would have avoided it entirely. ([Check Point](https://blog.checkpoint.com/crypto/the-great-npm-heist-september-2025/), [StepSecurity](https://www.stepsecurity.io/blog/20-popular-npm-packages-compromised-chalk-debug-strip-ansi-color-convert-wrap-ansi)) |
| **Shai-Hulud (v1)** | 2025-09 | Self-propagating worm. It stole npm and GitHub tokens with TruffleHog and republished the victim's packages. | Tokens with publish rights on a dev machine make the machine a worm vector. ([Panther](https://panther.com/blog/shai-hulud-npm-supply-chain-attack)) |
| **Shai-Hulud 2.0 / "Sha1-Hulud"** | 2025-11-24 | Moved to **preinstall** (`setup_bun.js` downloads Bun and runs `bun_environment.js`), so it fires even if the install fails. 796 packages and 1,092 versions. It registered self-hosted runners named `SHA1HULUD`. | Bun is used to evade Node-focused monitoring. `preinstall` defeats "fail fast" thinking. ([Endor Labs](https://www.endorlabs.com/learn/shai-hulud-2-malware-campaign-targets-github-and-cloud-credentials-using-bun-runtime), [Semgrep](https://semgrep.dev/blog/2025/digging-for-secrets-sha1-hulud-the-second-coming-of-the-npm-worm/), [Zscaler](https://www.zscaler.com/blogs/security-research/shai-hulud-v2-poses-risk-npm-supply-chain)) |
| npm registry response | 2025-09 to 2025-12 | **All classic tokens were revoked on 2025-12-09.** `npm login` now gives 2-hour session tokens. Write-capable granular tokens are capped at 90 days. Trusted publishing (OIDC) is recommended. | Don't keep long-lived npm publish tokens in the container at all. ([GitHub changelog 2025-12-09](https://github.blog/changelog/2025-12-09-npm-classic-tokens-revoked-session-based-auth-and-cli-token-management-now-available/), [2025-09-29](https://github.blog/changelog/2025-09-29-strengthening-npm-security-important-changes-to-authentication-and-token-management/)) |
| **Mastra** (2026-06-17), **@redhat-cloud-services** (2026-06-01, maintainer compromised **via a malicious VS Code extension**), **AsyncAPI** (2026-07-14, CI pipeline token theft), **@bitwarden/cli 2026.4.0** | 2026 | Account takeovers and CI compromise, followed by rapid republishing. | VS Code extensions are part of the supply chain. CI tokens are targets. ([Red Hat RHSB-2026-006](https://access.redhat.com/security/vulnerabilities/RHSB-2026-006), [Wiz](https://www.wiz.io/blog/miasma-supply-chain-attack-targeting-redhat-npm-packages), [Unit42 tracker](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/)) |
| **"ChainDrop" / Shai-Hulud (keyv family)** | 2026-08-04 | Over 400 packages (keyv, flat-cache, cacheable-request…; about 1.3B monthly downloads). It used a `preinstall` dropper, downloaded Bun v1.3.13, and **added persistence through `.claude/settings` `SessionStart` hooks (`node .claude/setup.mjs`) and a `.vscode` `folderOpen` task.** It **targets Anthropic/Claude/Codex/OpenAI/Cursor/Gemini credentials**, SSH keys, cloud credentials and npm tokens. It pushes commits authored as `claude` with the message `chore: update config` to up to 50 branches per repo. | Opening an infected repo in an agent or in VS Code is now an infection path, not only `npm install`. Agent config directories are prime loot. Elastic recommends a soak period, npm 12 and rotating AI tooling credentials. ([Elastic Security Labs](https://www.elastic.co/security-labs/shai-hulud-chaindrop-npm-supply-chain), [Datadog](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/), [CSA Singapore AD-2026-009](https://www.csa.gov.sg/alerts-and-advisories/advisories/ad-2026-009/)) |

Common pattern: a compromised maintainer or CI account, then automated republishing, then a lifecycle-script payload, then credential harvesting that now explicitly includes AI agent credentials. The defenses that would have blocked nearly all of these are (a) **no install scripts by default**, (b) **a release-age cooldown**, and (c) **no publish-capable or long-lived credentials in the dev environment**.

### 1.2 Blocking lifecycle / install scripts

| PM | Default today | Config |
| --- | --- | --- |
| **npm 12** (2026-07-08) | Dependency `preinstall`/`install`/`postinstall` scripts are **skipped by default**, including implicit `node-gyp` builds and `prepare` scripts of git/file/link dependencies. This is a **soft skip**: npm warns and the install succeeds. `allow-git` and `allow-remote` default to `none`. | `allowScripts` in `package.json`, managed with `npm approve-scripts` (pins `pkg@version` by default) and `npm deny-scripts`. Use `npm approve-scripts --allow-scripts-pending` to list what needs review. Set `strict-allow-scripts=true` to make unreviewed scripts a hard error. ([npm approve-scripts](https://docs.npmjs.com/cli/v12/commands/npm-approve-scripts), [community discussion #198547](https://github.com/orgs/community/discussions/198547), [InfoQ](https://www.infoq.com/news/2026/08/npm-12-released/)) |
| **npm 11.16+** (what Node 24/26 bundle) | Scripts run, with a warning. | `ignore-scripts=true` (blunt instrument) or `strict-allow-scripts=true` to opt into v12 behaviour. |
| **pnpm 10.x** | Dependency build scripts blocked unless listed (`onlyBuiltDependencies`). | Use the legacy keys. |
| **pnpm 11 / 12** | Blocked. `strictDepBuilds: true` makes **unreviewed builds fail the install**. | `allowBuilds:` map in `pnpm-workspace.yaml`, which supports version ranges. Since 12.11 there is also a `permissions:` map with `build:` and `skills:` keys. Never set `dangerouslyAllowAllBuilds`. ([pnpm build settings](https://pnpm.io/settings/build)) |
| **Yarn Berry ≥ 4.14** (2026-04-17) | `enableScripts: false` by default. | Allow per package with `dependenciesMeta: { "pkg": { "built": true } }`. The new `approvedGitRepositories` setting controls git packing. ([Yarn blog](https://v6.yarnpkg.com/blog)) |
| **Bun** | Scripts run only for a **curated default allowlist** of popular packages, plus `trustedDependencies`. | `trustedDependencies` in `package.json` (defining it replaces the default list). `bun pm trust <pkg>` adds an entry. `[install] ignoreScripts = true` in `bunfig.toml` disables scripts entirely. ([Bun lifecycle docs](https://bun.com/docs/pm/lifecycle)) |

Notes:
- `@lavamoat/allow-scripts` (v5.1.0) was the pre-2026 way to get an allowlist on npm/yarn. It sets `ignore-scripts` and keeps a policy in `package.json`. With npm 12, pnpm 11+ and Yarn 4.14+ now native, it is mostly legacy. ([package page](https://classic.yarnpkg.com/en/package/@lavamoat/allow-scripts))
- npm 12 also closed a code-execution path where a git dependency's own `.npmrc` could override the git executable, even with `--ignore-scripts` set. ([InfoQ](https://www.infoq.com/news/2026/08/npm-12-released/))
- Blocking scripts does **not** protect you from malicious code that runs when you `import` the package, for example in tests, a dev server or a build. Cooldowns and scanners address that.

### 1.3 Minimum release age / cooldowns

| PM | Setting | Unit | Since | Default | Exclusions |
| --- | --- | --- | --- | --- | --- |
| npm | `min-release-age` (`.npmrc` / `NPM_CONFIG_MIN_RELEASE_AGE`) | **days** | 11.10.0 (2026-02-11) | `null` (off), still off in npm 12 | `min-release-age-exclude` (names/globs). `before` wins if both are set. ([npm config](https://docs.npmjs.com/cli/v11/using-npm/config)) |
| pnpm | `minimumReleaseAge` (`pnpm-workspace.yaml`) | **minutes** | 10.16 | **1440 since v11** | `minimumReleaseAgeExclude`. `minimumReleaseAgeStrict` defaults to true if you set the age explicitly. ([pnpm](https://pnpm.io/settings/dependency-resolution)) |
| Yarn | `npmMinimalAgeGate` (`.yarnrc.yml`) | minutes (plain number; a duration-suffix bug has been reported) | 4.10 | **1d for new projects since 4.15** | `npmPreapprovedPackages` ([Yarn blog](https://v6.yarnpkg.com/blog), [craigory.dev](https://craigory.dev/blog/2026-05-29/package-manager-release-cooldown/)) |
| Bun | `[install] minimumReleaseAge` (`bunfig.toml`) | **seconds** | 1.3.0 | off | `minimumReleaseAgeExcludes` ([Bun pm docs](https://bun.sh/docs/pm)) |
| Aikido Safe Chain | wrapper | hours | — | 48 h | `--safe-chain-skip-minimum-package-age` ([README](https://github.com/AikidoSec/safe-chain)) |

Mind the different units. In a Node project, 7 days is `min-release-age=7` (npm), `minimumReleaseAge: 10080` (pnpm), `npmMinimalAgeGate: 10080` (Yarn) and `minimumReleaseAge = 604800` (Bun). Older CLIs silently ignore keys they don't know, so **pin the package manager version** too (`packageManager` field, with pnpm's `pmOnFail`). Renovate and Dependabot need their own matching cooldown settings. ([cooldowns.dev](https://cooldowns.dev/))

### 1.4 Lockfile and resolution hygiene

- CI and container installs: `pnpm install --frozen-lockfile` (in pnpm 12 the `--frozen-lockfile false` form was removed, use `--no-frozen-lockfile`), `npm ci`, `yarn install --immutable`, `bun install --frozen-lockfile`. ([pnpm 12.0](https://pnpm.io/blog/releases/12.0))
- With pnpm, `trustLockfile` defaults to false, so pnpm **re-applies `minimumReleaseAge` and `trustPolicy` to lockfile entries**. A malicious lockfile PR can't bypass them. ([leopradel.com](https://www.leopradel.com/blog/securing-pnpm-supply-chain))
- Block exotic sources. pnpm's `blockExoticSubdeps: true` (default in v11+) allows git and tarball sources only for direct dependencies. On npm 12, `allow-git=none` and `allow-remote=none` are the defaults, and on 11.10+/11.15+ you can set them explicitly.
- `save-exact=true` and `engine-strict=true` reduce drift.
- `pnpm` 12.10 to 12.15 added integrity hardening: tarball verification in variation resolutions, rejecting registry metadata whose name doesn't match the request, and checks on config-dependency integrity. ([pnpm 12.10.0](https://pnpm.io/blog/releases/12.10.0), [pnpm blog](https://pnpm.io/blog))

### 1.5 Provenance, trusted publishing, staged publishing

- **Trusted publishing (OIDC)** from GitHub Actions or GitLab CI removes long-lived publish tokens. Publishing under trusted publishing attaches provenance automatically. ([GitHub changelog](https://github.blog/changelog/2025-09-29-strengthening-npm-security-important-changes-to-authentication-and-token-management/))
- **npm 12 is deprecating 2FA-bypass granular tokens.** They lost sensitive account and org actions in early August 2026 and lose direct publishing around January 2027. ([Socket](https://socket.dev/blog/npm-12))
- **Staged publishing** has been GA since May 2026 (npm ≥ 11.15, Node ≥ 22.14). A tarball sits in a queue until a maintainer approves it with 2FA. Since 2026-10-02 it also covers the first publish of new packages. ([GitHub changelog 2026-10-02](https://github.blog/changelog/2026-10-02-npm-staged-publishing-now-supports-creating-new-packages), [docs](https://docs.npmjs.com/staged-publishing))
- Consumer side: pnpm `trustPolicy: no-downgrade` fails the install if a package version has *less* trust evidence than earlier versions, for example when provenance or a trusted publisher disappears. That is a strong signal of account takeover. `npm audit signatures` verifies registry signatures and attestations.

### 1.6 Third-party guard tools

| Tool | What it does | Usage |
| --- | --- | --- |
| **Socket Firewall Free (`sfw`)** | Local proxy that blocks known-malicious packages at fetch time, for npm/yarn/pnpm/pip/uv/cargo. No API key. Sends anonymous telemetry. Cached packages may skip the check. | `npm i -g sfw` then `sfw pnpm install` ([docs](https://docs.socket.dev/docs/socket-firewall-free), [Socket blog](https://badge.socket.dev/blog/introducing-socket-firewall)) |
| **Aikido Safe Chain** | Shell aliases wrapping npm/npx/yarn/pnpm/bun. Blocks malware and adds a 48 h default minimum package age. | `npm i -g @aikidosec/safe-chain && safe-chain setup` (or `safe-chain setup-ci`) ([GitHub](https://github.com/AikidoSec/safe-chain)) |
| **npq** | Pre-install audit prompt (age, downloads, scripts, provenance, Snyk vulns). | `npq install <pkg>` ([npm](https://www.npmjs.com/package/npq)) |
| **Bun security scanner API** | Pluggable scanner run during `bun install`/`add`. | `bunfig.toml` `[install.security] scanner = "..."` ([Bun docs](https://bun.sh/docs/pm/security-scanner-api)) |

These tools are themselves npm packages with network access and shell hooks. Pin them by exact version in the Dockerfile.

### 1.7 Which package manager is most secure by default (Oct 2026)?

**pnpm ≥ 11 (12.x is `latest`)** is the most secure out of the box. It is the only one that by default combines all of:
- build scripts denied **with a hard failure** (`strictDepBuilds: true`),
- a non-zero cooldown (1 day),
- transitive exotic-source blocking,
- an optional provenance-downgrade check (`trustPolicy`), and
- re-validation of lockfile entries.
([pnpm 11.0](https://pnpm.io/blog/releases/11.0), [lyrie.ai](https://lyrie.ai/research/research/2026-05-08-pnpm-11-supply-chain-hardening))

Runners-up:
- **Yarn ≥ 4.15**: scripts off, and a 1-day gate for *new* projects only.
- **npm 12**: scripts off but only a soft skip, no default cooldown, and not yet bundled with any Node release.
- **Bun**: default-trusted allowlist of popular packages, no default cooldown.

### 1.8 Recommended package-manager config

`pnpm-workspace.yaml` (pnpm 11/12):

```yaml
# Supply-chain hardening
minimumReleaseAge: 10080          # 7 days (minutes)
minimumReleaseAgeExclude:
  - '@your-org/*'                 # your own packages
trustPolicy: no-downgrade
blockExoticSubdeps: true          # default in v11+, explicit for clarity
strictDepBuilds: true             # default in v11+
allowBuilds:
  esbuild: true                   # review each one; pin versions if you like: esbuild@0.25.10: true
  '@swc/core': true
  core-js: false
verifyDepsBeforeRun: install
```

`package.json`:

```json
{
  "packageManager": "pnpm@12.15.0+sha512.<hash>",
  "engines": { "node": ">=24" }
}
```

If you are on npm, use `.npmrc` (project) with npm ≥ 12:

```ini
min-release-age=7
strict-allow-scripts=true
allow-git=none
allow-remote=none
save-exact=true
engine-strict=true
audit=true
fund=false
# npm 11 fallback: ignore-scripts=true
```

Container-wide fallback env (as in Trail of Bits' devcontainer) for ad-hoc `npx` and global installs:

```jsonc
"containerEnv": {
  "NPM_CONFIG_IGNORE_SCRIPTS": "true",
  "NPM_CONFIG_MIN_RELEASE_AGE": "7",
  "NPM_CONFIG_SAVE_EXACT": "true",
  "NPM_CONFIG_UPDATE_NOTIFIER": "false"
}
```

Caveat: `NPM_CONFIG_MIN_RELEASE_AGE` env overrides project `.npmrc`. ([d3creative.uk](https://d3creative.uk/blog/npm-min-release-age-install-cooldown))

---

## 2. Devcontainer hardening

### 2.1 Reference implementations worth copying from

- **Anthropic** – [`anthropics/claude-code/.devcontainer`](https://github.com/anthropics/claude-code/tree/main/.devcontainer) (`devcontainer.json`, `Dockerfile`, `init-firewall.sh`):
  - It uses `FROM node:20` (**EOL**), installs `@anthropic-ai/claude-code@latest`, runs as the `node` user, and grants `node` passwordless sudo **only** for `/usr/local/bin/init-firewall.sh`.
  - `runArgs` adds `NET_ADMIN`/`NET_RAW`. `postStartCommand: sudo /usr/local/bin/init-firewall.sh` runs with `waitFor: postStartCommand`.
  - Named volumes `claude-code-config-${devcontainerId}` hold `/home/node/.claude`, with `CLAUDE_CONFIG_DIR` set.
  - The docs describe it as "a working example rather than a maintained base image". ([docs](https://code.claude.com/docs/en/devcontainer))
- **Trail of Bits** – [`trailofbits/claude-code-devcontainer`](https://github.com/trailofbits/claude-code-devcontainer). Built for audit work on untrusted code with `bypassPermissions`. Noteworthy extras:
  - **read-only bind mounts** of `.devcontainer/`, `.git/config`, `.git/hooks` and `~/.gitconfig`
  - `GIT_CONFIG_GLOBAL` redirected to a writable local file
  - `NPM_CONFIG_IGNORE_SCRIPTS=true` and `NPM_CONFIG_MIN_RELEASE_AGE=1`
  - per-project volumes for `~/.claude` and `~/.config/gh`
  - an explicit threat model that lists what it does **not** protect against: container escape, deferred escape through `.git`, the VS Code RPC host escape, the user changing iptables because it has sudo plus `NET_ADMIN`, and exfiltration of in-container tokens
- **OpenAI** – [`openai/codex/codex-cli/scripts/run_in_container.sh`](https://github.com/openai/codex/blob/main/codex-cli/scripts/run_in_container.sh) and `init_firewall.sh`. Allowed domains default to just `api.openai.com`. The firewall is applied **from the host** with `docker exec --user root …`, then the script is deleted, so the container user gets **no sudo at all**. Codex then runs `--sandbox workspace-write --ask-for-approval on-request`. There is no `.devcontainer/` in the Codex repo.

### 2.2 Baseline `devcontainer.json`

```jsonc
{
  "name": "node-agents",
  "build": { "dockerfile": "Dockerfile" },
  "remoteUser": "node",
  "containerUser": "node",
  "updateRemoteUserUID": true,
  "init": true,
  "runArgs": [
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges:true",
    "--pids-limit=2048",
    "--memory=8g"
    // add "--cap-add=NET_ADMIN","--cap-add=NET_RAW" ONLY if you run an in-container iptables firewall (see 2.6)
  ],
  "workspaceMount": "source=${localWorkspaceFolder},target=/workspace,type=bind",
  "workspaceFolder": "/workspace",
  "mounts": [
    // read-only overlays to block "deferred escape" into the host repo
    "source=${localWorkspaceFolder}/.git/hooks,target=/workspace/.git/hooks,type=bind,readonly",
    "source=${localWorkspaceFolder}/.git/config,target=/workspace/.git/config,type=bind,readonly",
    "source=${localWorkspaceFolder}/.devcontainer,target=/workspace/.devcontainer,type=bind,readonly",
    // per-project state volumes (never host bind mounts of ~/.claude or ~/.codex)
    "source=claude-${devcontainerId},target=/home/node/.claude,type=volume",
    "source=codex-${devcontainerId},target=/home/node/.codex,type=volume",
    "source=pnpm-store-${devcontainerId},target=/home/node/.local/share/pnpm,type=volume"
  ],
  "containerEnv": {
    "CLAUDE_CONFIG_DIR": "/home/node/.claude",
    "CODEX_HOME": "/home/node/.codex",
    "DISABLE_AUTOUPDATER": "1",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  },
  "remoteEnv": {
    // blank out host credential bridges VS Code injects (defense in depth, see 2.5)
    "SSH_AUTH_SOCK": "",
    "GPG_AGENT_INFO": "",
    "BROWSER": ""
  },
  "customizations": {
    "vscode": {
      "extensions": ["dbaeumer.vscode-eslint", "esbenp.prettier-vscode"]
    }
  }
}
```

Points:
- **Non-root.** Claude Code refuses `--dangerously-skip-permissions` when run as root. ([docs](https://code.claude.com/docs/en/devcontainer)) Avoid images that give the dev user passwordless sudo, as `mcr.microsoft.com/devcontainers/*` and ToB's do. `no-new-privileges` breaks `sudo` anyway, which is intended.
- **No Docker socket.** Mounting `/var/run/docker.sock` is root on the host. If the agent really needs Docker, use a socket proxy with write and `exec` disabled (as in [daniel demmel's setup](https://www.danieldemmel.me/blog/coding-agents-in-secured-vscode-dev-containers): `POST: 0`, `EXEC: 0`), or a rootless or sysbox runtime. Claude Code's own sandbox also lists `docker` as incompatible. ([sandboxing docs](https://code.claude.com/docs/en/sandboxing))
- **Never mount** `~/.ssh`, `~/.aws`, `~/.npmrc` (it holds registry tokens), `~/.config/gh`, `~/.claude`, `~/.codex` or `$HOME` from the host. Anthropic: "Avoid mounting host secrets such as `~/.ssh` or cloud credential files into the container; prefer repository-scoped or short-lived tokens." ([docs](https://code.claude.com/docs/en/devcontainer))
- **Stronger runtimes** if the threat model includes container escape: gVisor (`--runtime=runsc`), rootless Docker or `userns-remap`, Sysbox, or Docker Sandboxes (`sbx`, microVM per agent with a host-side egress proxy and Open/Balanced/Locked Down policies). ([Docker sandboxes guide](https://docs.docker.com/guides/claude-code-sandbox-model-runner.md), [InnoQ](https://www.innoq.com/en/blog/2026/07/trust-but-sandbox/))

### 2.3 Dockerfile: pin and minimize

```dockerfile
# Pin by digest; resolve with: docker buildx imagetools inspect node:24-bookworm-slim
FROM node:24-bookworm-slim@sha256:<digest>

ARG CLAUDE_CODE_VERSION=2.1.310
ARG CODEX_VERSION=0.164.0
ARG PNPM_VERSION=12.15.0
ARG NPM_VERSION=12.2.1

RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates iptables ipset dnsutils jq bubblewrap socat \
    && rm -rf /var/lib/apt/lists/*

# Package managers first, with scripts off for the global installs themselves
RUN npm install -g --ignore-scripts npm@${NPM_VERSION} pnpm@${PNPM_VERSION}

# Agents, pinned; disable self-update at runtime via DISABLE_AUTOUPDATER
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} @openai/codex@${CODEX_VERSION}

# Managed policy (highest precedence for Claude Code on Linux)
COPY managed-settings.json /etc/claude-code/managed-settings.json
# Org-wide skills outside the ~/.claude volume (see section 4)
COPY skills/ /etc/claude-code/.claude/skills/
COPY codex-skills/ /etc/codex/skills/

USER node
```

Notes:
- The Claude Code devcontainer feature (`ghcr.io/anthropics/devcontainer-features/claude-code:1.0`) **always installs the latest Claude Code**, and Claude Code then auto-updates. The tag pins only the install script. For reproducibility, install `@anthropic-ai/claude-code@X.Y.Z` in the Dockerfile and set `DISABLE_AUTOUPDATER=1`. ([docs](https://code.claude.com/docs/en/devcontainer))
- The npm `@openai/codex` package and the Claude native binaries can need postinstall or optional-dependency downloads. If `--ignore-scripts` breaks one, allow it explicitly. (Not verified for the current versions; see Open questions.)
- **Features run as root at build time** and come from OCI registries. They are a supply-chain input like any npm package. Since devcontainers CLI PR #1212 (merged 2026-05-12), **`.devcontainer-lock.json` is generated by default** on `build`/`up`, with `version`, `resolved` (`@sha256:` digest) and `integrity` per feature. Commit it, and use `devcontainer up --frozen-lockfile` in CI. `--no-lockfile` opts out. ([PR #1212](https://github.com/devcontainers/cli/pull/1212), [Dependabot support](https://containers.dev/guide/dependabot)) Prefer installing tools in your own Dockerfile over many third-party features.

### 2.4 Credentials

- **GitHub.** Prefer no push credentials in the container: commit inside, push from the host. If the agent must push or open PRs, use a **fine-grained PAT** (or GitHub App token) scoped to the single repository, with only the permissions needed (Contents R/W, Pull requests R/W) and a short expiry, injected through `remoteEnv` from `${localEnv:GH_TOKEN_THIS_REPO}`. ChainDrop committed to up to 50 branches per repo with stolen tokens. ([Elastic](https://www.elastic.co/security-labs/shai-hulud-chaindrop-npm-supply-chain))
- **SSH agent forwarding.** VS Code Dev Containers **forwards the host SSH agent automatically** (socket `/tmp/vscode-ssh-auth-*.sock`), even when `remoteEnv.SSH_AUTH_SOCK` is `""`. There is **no setting to disable it**. The feature request [vscode-remote-release#11413](https://github.com/microsoft/vscode-remote-release/issues/11413) has been open since 2026-01-06. Anything in the container can authenticate *as you* to every SSH host while the session is open, though it cannot copy the keys. Mitigations: don't have an agent running on the host while you work in the container, use a dedicated agent with only a deploy key, or don't use the VS Code attach path for agent runs.
- **Git credential helper.** The extension reuses your host credential helper ("Credentials you've entered locally will be reused in the container and vice versa") and copies `~/.gitconfig` in. ([VS Code docs](https://code.visualstudio.com/remote/advancedcontainers/sharing-git-credentials)) In user `settings.json`, set `"dev.containers.copyGitConfig": false` and `"dev.containers.dockerCredentialHelper": false`. ([demmel](https://www.danieldemmel.me/blog/coding-agents-in-secured-vscode-dev-containers))
- **npm tokens.** Don't put them in the container. If you need private packages, use a read-only granular token (90-day maximum) in a project `.npmrc` through `${NPM_TOKEN}` env, never a publish-capable one.
- **Model credentials.** See section 3.4.

### 2.5 VS Code-specific risks

- **The container can run commands on the host through VS Code.** "Reopen in Container" runs an extension host inside the container that talks RPC to your desktop VS Code. Container code can drive host-only commands (`terminal.newLocal` then `sendSequence`) or use `VSCODE_IPC_HOOK_CLI` / `vscode-ipc-*.sock` with the `code` CLI. Microsoft considers this by design. ([Red Guild](https://blog.theredguild.org/leveraging-vscode-internals-to-escape-containers/), [MS comment](https://github.com/microsoft/vscode-remote-release/issues/6608#issuecomment-1112960548), [ToB threat model](https://github.com/trailofbits/claude-code-devcontainer))
- **Partial mitigations.** These are community workarounds, not official: blank `VSCODE_IPC_HOOK_CLI`, `VSCODE_GIT_IPC_HANDLE`, `GIT_ASKPASS`, `VSCODE_GIT_ASKPASS_*`, `REMOTE_CONTAINERS_*`, `SSH_AUTH_SOCK` and `BROWSER` in `remoteEnv` *and* in a script sourced at the top of `~/.bashrc` (VS Code re-injects them), then delete `/tmp/vscode-*.sock` after start. A startup race remains. ([demmel](https://www.danieldemmel.me/blog/coding-agents-in-secured-vscode-dev-containers))
- **Most robust option.** For autonomous agent runs, start the container with `devcontainer up` and attach with `devcontainer exec` or `docker exec` from a normal terminal, with no VS Code attached. You can also run the agent in Docker Sandboxes or a VM.
- **Extensions are malware vectors.** GlassWorm (Oct 2025 to 2026) spread through Open VSX and the Microsoft Marketplace, stealing npm, GitHub and SSH credentials, including through takeovers of established extensions. The Red Hat npm compromise (June 2026) started with a malicious VS Code extension. ([CSA on GlassWorm](https://labs.cloudsecurityalliance.org/research/csa-research-note-glassworm-supply-chain/), [The Hacker News](https://thehackernews.com/2025/12/glassworm-returns-with-24-malicious.html), [Red Hat](https://access.redhat.com/security/vulnerabilities/RHSB-2026-006)) Keep `customizations.vscode.extensions` minimal, use the host-side `extensions.allowed` policy for an allowlist, and disable extension auto-update for the workspace.
- **Workspace tasks.** ChainDrop used a `.vscode/tasks.json` task with `"runOn": "folderOpen"`. Keep `task.allowAutomaticTasks` at `off` (the default prompts) and keep Workspace Trust on.

### 2.6 Egress firewall

What Anthropic's `init-firewall.sh` does (136 lines, read 2026-10-25):
1. Saves Docker's embedded DNS NAT rules (127.0.0.11), flushes everything, then restores them.
2. Allows outbound UDP 53 (DNS to *any* resolver), outbound TCP 22 (SSH to *anywhere*), loopback, and the host `/24`.
3. Builds an ipset `allowed-domains` from GitHub's `api.github.com/meta` CIDRs (web, api, git) plus the resolved A records of `registry.npmjs.org`, `api.anthropic.com`, `sentry.io`, `statsig.com`, `marketplace.visualstudio.com`, `vscode.blob.core.windows.net` and `update.code.visualstudio.com`.
4. Sets INPUT/FORWARD/OUTPUT policy to DROP and REJECTs everything else. It self-tests that `example.com` is blocked and `api.github.com` is reachable.

Known gaps you should fix or accept:
- **DNS exfiltration.** UDP 53 is allowed to any IP. Restrict it to 127.0.0.11 (Docker's resolver).
- **GitHub is a wide-open exfiltration channel**: all of GitHub, including gists and any repo, plus SSH port 22 to any IP. Shai-Hulud and s1ngularity exfiltrated *to GitHub*. Where possible, drop the port 22 rule and route git through HTTPS with a single-repo token.
- **IPv6 is not filtered** (no `ip6tables`). ToB flags the same gap. Add `ip6tables -P OUTPUT DROP` or disable IPv6 on the container network.
- **IP-based allowlists go stale** for CDN-hosted registries. Rerun the script on each start (`postStartCommand`), or use a domain-based proxy.
- **NET_ADMIN plus sudo.** If the dev user can sudo (ToB) the firewall is advisory. Anthropic limits sudo to the script, but the script is root-owned and writable only by root, so keep it that way. Better: follow OpenAI's pattern and apply the rules as root from outside (`docker exec --user root <ctr> /usr/local/bin/init-firewall.sh`, which you can wire into `initializeCommand`/`postStartCommand` on the host side), or use a root ENTRYPOINT that applies the rules and then drops privileges with `setpriv`/`gosu`. Both let the dev user have no sudo, which also makes `no-new-privileges` work.
- **Alternatives.**
  - An **egress proxy sidecar** on an `internal: true` Docker network: a Docker Compose based devcontainer where only the proxy container has external network access, with a domain allowlist.
  - Claude Code's **built-in sandbox proxy**: hostname allowlist, no TLS termination by default.
  - **Docker Sandboxes'** host-side proxy.

Minimum allowlist for Node + Claude + Codex: `registry.npmjs.org` (plus your private registry), `api.anthropic.com`, `claude.ai`/`platform.claude.com` (OAuth login), `api.openai.com`, `auth.openai.com`/`chatgpt.com` (Codex ChatGPT login), `github.com`/`api.github.com`/`codeload.github.com`/`objects.githubusercontent.com` (git and plugin marketplaces), and VS Code endpoints if you use VS Code. Check Anthropic's [network requirements](https://code.claude.com/docs/en/network-config.md#network-access-requirements). The OpenAI login hostnames are my assumption from login flows and are not verified.

---

## 3. Running Claude Code and Codex CLI safely in the container

### 3.1 Claude Code

**Install and persistence** ([devcontainer docs](https://code.claude.com/docs/en/devcontainer)):
- Mount a named volume at `~/.claude` **and** set `CLAUDE_CONFIG_DIR` to the same path. Otherwise `~/.claude.json`, which holds account, MCP and per-project trust, is lost on rebuild. Use `${devcontainerId}` in the volume name for per-project isolation.
- Headless and Codespaces: `claude setup-token` produces a long-lived `CLAUDE_CODE_OAUTH_TOKEN`, or use `ANTHROPIC_API_KEY`. Pass it through `remoteEnv: {"CLAUDE_CODE_OAUTH_TOKEN": "${localEnv:CLAUDE_CODE_OAUTH_TOKEN:}"}` (ToB pattern) rather than baking it into the image.
- If OAuth's localhost callback doesn't reach the container, paste the code at the `Paste code here if prompted` prompt.

**Policy.** Copy `managed-settings.json` to `/etc/claude-code/managed-settings.json`, which has the highest precedence. Anthropic notes this can be bypassed by anyone who can edit the repo's Dockerfile. Server-managed settings or MDM are stronger. Suggested contents:

```json
{
  "permissions": {
    "disableBypassPermissionsMode": "disable",
    "deny": ["Read(~/.claude/.credentials.json)", "Read(~/.codex/auth.json)", "Read(./.env*)"]
  },
  "sandbox": {
    "enabled": true,
    "enableWeakerNestedSandbox": true,
    "allowUnsandboxedCommands": false,
    "network": { "allowedDomains": ["registry.npmjs.org", "github.com", "api.github.com"] },
    "filesystem": { "denyRead": ["~/.codex", "~/.ssh", "~/.config/gh"] }
  },
  "disableSkillShellExecution": true,
  "allowManagedHooksOnly": false,
  "strictKnownMarketplaces": [
    { "source": "github", "repo": "anthropics/claude-plugins-official" },
    { "source": "github", "repo": "your-org/*" },
    { "source": "skills-dir" }
  ],
  "env": { "DISABLE_AUTOUPDATER": "1" }
}
```

Drop `disableBypassPermissionsMode` if you deliberately want YOLO mode inside the container. The `permissions.deny` path syntax for absolute paths uses `//`. Check it against the [permissions docs](https://code.claude.com/docs/en/permissions.md).

**`--dangerously-skip-permissions`.** Anthropic's position: it is acceptable inside the devcontainer because commands are confined to the container and the CLI rejects root. However, "dev containers do not prevent a malicious project from exfiltrating anything accessible inside the container, including the Claude Code credentials stored in `~/.claude`. Only use dev containers when developing with trusted repositories." Pair it with the egress firewall. For fewer prompts without disabling checks, Anthropic recommends **auto mode**, where a classifier reviews actions. ([devcontainer docs](https://code.claude.com/docs/en/devcontainer), [permission modes](https://code.claude.com/docs/en/permission-modes.md))

**The built-in sandbox inside a container** ([sandboxing docs](https://code.claude.com/docs/en/sandboxing)):
- On Linux the sandbox uses **bubblewrap** for the filesystem, a network namespace plus a host-side proxy reached through **socat** for the network, and an optional seccomp filter (`@anthropic-ai/sandbox-runtime`). Install `bubblewrap socat` in the image.
- Inside an unprivileged container, bwrap fails with `Can't mount proc on /newroot/proc`. The documented fix is `"enableWeakerNestedSandbox": true`, which bind-mounts the existing `/proc` and should be used only when the outer container is the real boundary.
- Set `failIfUnavailable: true` if you want startup to fail rather than silently run unsandboxed. The default falls back to unsandboxed.
- The sandbox covers **Bash only**. File tools, hooks, MCP servers, `apiKeyHelper` and the status line run outside it. Default read access is broad: deny `~/.ssh` and similar with `filesystem.denyRead`. The proxy checks hostnames only and does not terminate TLS.
- Whether bwrap can create user namespaces under Docker's default seccomp/AppArmor profile on your host is not settled; see Open questions. If it can't, rely on the container and the firewall.

**Repo-supplied config and workspace trust.** Workspace trust matters even inside the container ([permissions docs, "What runs before you trust a folder"](https://code.claude.com/docs/en/permissions.md)):
- In a `claude -p` (headless) run **the trust dialog never appears**. Hooks in project settings, the `env` block and `.mcp.json` servers are **used without asking**.
- For untrusted repos, run headless with `--setting-sources user` or `--bare`, plus `--settings '{"disableAllHooks": true}'`.
- Past bugs:
  - **CVE-2025-59536**: code ran before the trust dialog. Fixed in 1.0.111. ([NVD](https://nvd.nist.gov/vuln/detail/cve-2025-59536))
  - **CVE-2026-21852**: `.claude/settings.json` `env` (`ANTHROPIC_BASE_URL`) caused authenticated requests to be sent before trust. Reported fixed in 2.0.65.
- ([GovInfoSecurity on Check Point's findings](https://www.govinfosecurity.com/malicious-repo-files-could-hijack-claude-code-sessions-a-30854), [urandom.io](https://urandom.io/blog/2026-02-27-git-clone-and-youre-pwned-claude-code-vulns))

### 3.2 Codex CLI

**Sandbox and approvals** ([Agent approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security)):
- `sandbox_mode`: `read-only` | `workspace-write` | `danger-full-access`. Approval policy: `on-request` | `never` | `{ granular = {...} }`. **`untrusted` is retired, and leaving it in config can stop Codex from starting.** Use `on-failure` only if your version still documents it; I could not confirm its status.
- The "Auto" preset is `--sandbox workspace-write --ask-for-approval on-request`. `--dangerously-bypass-approvals-and-sandbox` (alias `--yolo`) disables both.
- `workspace-write` has **network off by default**. Enable it with `[sandbox_workspace_write] network_access = true`, and optionally constrain it with the `network_proxy` domain policy.
- On Linux the default is **bubblewrap plus seccomp**. Landlock survives only as the `codex sandbox landlock` alias and the `use_legacy_landlock` feature flag. WSL1 has been unsupported since 0.115.

**In Docker.** OpenAI says the sandbox "may not work" in containers if namespaces, setuid `bwrap` or `seccomp` are blocked. Their recommendation: configure the container for the isolation you need, then run Codex with `--sandbox danger-full-access` (or `--dangerously-bypass-approvals-and-sandbox`) inside it. Same warning as Anthropic: "a malicious project can exfiltrate anything available inside the devcontainer, including Codex credentials." Third-party guides that make bwrap work by adding `--security-opt seccomp=unconfined --cap-add SYS_ADMIN` **weaken the outer container** ([danielvaughan.com](https://codex.danielvaughan.com/2026/04/20/codex-cli-devcontainers-docker-sandboxes-secure-containerised-agents/)). I do not recommend that trade-off for a dev container. If namespace creation fails, Codex can silently fall back to full access, so check `codex sandbox` behaviour or `/status` after setup.

Suggested `~/.codex/config.toml` (bake to `/etc/codex/config.toml` or seed into the volume):

```toml
sandbox_mode = "workspace-write"
approval_policy = "on-request"
cli_auth_credentials_store = "file"   # keyring is unavailable headless
web_search = "cached"

[sandbox_workspace_write]
network_access = true                 # rely on the container firewall instead of double-blocking

[profiles.yolo]                       # explicit opt-in: codex --profile yolo
sandbox_mode = "danger-full-access"
approval_policy = "never"
```

**Auth** ([Codex auth docs](https://learn.chatgpt.com/docs/auth)):
- Credentials live in `$CODEX_HOME/auth.json` (default `~/.codex`) when `cli_auth_credentials_store = "file"`. Other values are `keyring`, `auto` and `ephemeral` (in memory only).
- "Treat `~/.codex/auth.json` like a password."
- Headless login options: `codex login --device-auth` (must be enabled in ChatGPT security settings), `printenv OPENAI_API_KEY | codex login --with-api-key`, `docker cp` of `auth.json`, or SSH-forwarding port 1455.
- Admins can enforce `forced_login_method` and `forced_chatgpt_workspace_id`.
- Persist `~/.codex` in a named per-project volume, never a bind mount of the host `~/.codex` (as some guides suggest). Use `ephemeral` if you'd rather log in each session.

**Repo-supplied config.** Project `.codex/config.toml` is loaded **only for trusted projects**. **CVE-2025-61260** (CVSS 9.8, Codex ≤ 0.23.0) let a repo's `.env` redirect `CODEX_HOME` to a repo-controlled `config.toml` whose MCP server command executed at startup. Keep Codex current and don't mark untrusted repos as trusted. ([NVD](https://nvd.nist.gov/vuln/detail/cve-2025-61260), [eSecurity Planet](https://www.esecurityplanet.com/threats/stealth-rce-in-codex-exposes-developer-workflows/)) Admins can restrict allowed sandbox modes and approval policies through a requirements file, for example `allowed_sandbox_modes = ["read-only","workspace-write"]` ([third-party example](https://codex.danielvaughan.com/2026/03/31/codex-cli-network-security-requirements-toml/), not verified against OpenAI's reference).

### 3.3 Running both agents side by side

- Each agent can read the other's credentials: they share a UID and a home directory. Use Claude's `sandbox.filesystem.denyRead` / `permissions.deny` for `~/.codex`. Codex's sandbox (when it works) restricts writes, not reads. If this matters, run each agent in its own container with its own volume.
- Don't run `pnpm install` / `npm install` in the same process tree as an agent with bypassed permissions *and* its credentials loaded. s1ngularity literally invoked the agent CLI from a postinstall script. With scripts blocked this risk drops sharply. Consider running dependency installs in a `postCreateCommand` before any agent auth exists, or in a throwaway container.

### 3.4 Secret exposure checklist

- [ ] No host secret bind mounts. `env | grep -i -E 'token|key|secret'` inside the container shows only what you intended.
- [ ] `ssh-add -l` inside the container fails (no forwarded agent), or you accept the risk.
- [ ] `git config --show-origin --get-all credential.helper` shows no VS Code helper, or you accept it.
- [ ] Model keys: Anthropic Console / OpenAI API keys with spend limits and a dedicated workspace or project, rotated after any suspected compromise (ChainDrop guidance includes rotating AI tooling credentials).
- [ ] `.env*` files of the project are git-ignored and denied to agents if they contain real secrets.

---

## 4. Declarative plugin, skill and MCP installation

### 4.1 Claude Code plugins

**CLI (non-interactive)** ([create-marketplace docs](https://code.claude.com/docs/en/plugin-marketplaces), [org docs](https://code.claude.com/docs/en/plugins/org.md)):

```bash
claude plugin marketplace add your-org/your-marketplace@v1.4.0     # owner/repo@ref or owner/repo#ref
claude plugin install code-formatter@your-marketplace --scope user  # or --scope project
claude plugin list
claude plugin details code-formatter                                  # component inventory: hooks, MCP, skills
claude plugin validate ./my-marketplace
```

**Settings (`.claude/settings.json` in the repo or managed settings):**

```json
{
  "extraKnownMarketplaces": {
    "your-marketplace": {
      "source": { "source": "github", "repo": "your-org/your-marketplace", "ref": "v1.4.0" },
      "autoUpdate": false
    }
  },
  "enabledPlugins": {
    "code-formatter@your-marketplace": true
  }
}
```

Caveats:
- Repository `extraKnownMarketplaces` apply only after the folder is trusted. In `-p` runs they apply only if trust was already accepted or `hasTrustDialogAccepted` is set in `~/.claude.json`.
- Plugins whose marketplace entry points to an **external** source (not a relative path inside the marketplace) aren't installed from settings alone. Each user still runs `claude plugin install <name>@<mkt> --scope project`.
- In CI or `-p`, installs happen in the background. Set `CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1` to wait for them.

**Container-native approach: seed at build time** ([org docs](https://code.claude.com/docs/en/plugins/org.md#seed-containers-and-ci)):

```dockerfile
# Build stage (needs network to GitHub)
RUN CLAUDE_CODE_PLUGIN_CACHE_DIR=/opt/claude-seed claude plugin marketplace add your-org/your-marketplace@v1.4.0 \
 && CLAUDE_CODE_PLUGIN_CACHE_DIR=/opt/claude-seed claude plugin install code-formatter@your-marketplace
ENV CLAUDE_CODE_PLUGIN_SEED_DIR=/opt/claude-seed
```

Then enable the plugins through `enabledPlugins` in managed settings or the repo's settings. Seed marketplaces are **read-only and have `autoUpdate` forced off**. They need no git or network access at runtime, they are not hidden by the `~/.claude` volume, and they take precedence over a user's same-name marketplace. This is the best fit for a devcontainer.

**Pinning:**
- *Plugin* sources (`github`, `url`, `git-subdir`) accept `"sha": "<40-char commit>"`, which wins over `ref`. `archive` sources accept a `sha256`. `npm` plugin sources are fetched without install scripts. ([marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference.md))
- *Marketplace* sources (`github`/`git`) take `ref` (branch or tag) but **no `sha`**. A tag can be moved. To fully pin, host your own marketplace repo whose entries pin each third-party plugin by `sha`, or declare an inline `settings`-type marketplace in `extraKnownMarketplaces` with sha-pinned object sources.
- Anthropic's `claude-community` catalog pins nearly every entry to a commit SHA and refuses other commits. ([plugin security](https://code.claude.com/docs/en/plugins/security.md))
- `DISABLE_AUTOUPDATER=1` also stops plugin auto-update, except for `command`-source plugins, which re-run each session. Block those with `disableCommandPluginSources`.

**What a plugin can do.** "A Claude Code plugin you install can execute arbitrary code on your machine with your user privileges":
- Hooks, monitors (background commands), mods (JS inside Claude Code), stdio MCP and LSP servers, and a `bin/` added to `PATH`.
- Hooks, monitors and servers run **outside the sandbox**, and permission rules don't apply to them.
- Review `hooks/hooks.json`, `.mcp.json` and `bin/` before installing. `claude --plugin-dir <dir> plugin details <name>` prints the inventory without installing.
- ([plugin security](https://code.claude.com/docs/en/plugins/security.md))

**Managed lockdown keys** ([control matrix](https://code.claude.com/docs/en/plugins/org.md#control-matrix)):

| Key | Effect |
| --- | --- |
| `strictKnownMarketplaces` | Allowlist of marketplace sources |
| `blockedMarketplaces` | Blocklist of marketplace sources |
| `disableSideloadFlags` | Rejects `--plugin-dir`, `--plugin-url`, `--mcp-config` |
| `allowManagedHooksOnly` | Only managed hooks run |
| `strictPluginOnlyCustomization` | Blocks non-plugin skills, hooks, agents and MCP |
| `disableCommandPluginSources` | Blocks `command`-source plugins |
| `syncClaudeAiPlugins: false` | Stops plugins synced from claude.ai |

### 4.2 Claude Code skills

Skill locations ([skills docs](https://code.claude.com/docs/en/skills)):

| Scope | Path |
| --- | --- |
| Enterprise | `/etc/claude-code/.claude/skills/<name>/SKILL.md` (managed directory) |
| Personal | `~/.claude/skills/` |
| Project | `.claude/skills/` (and nested `<subdir>/.claude/skills/`) |
| Plugin | `<plugin>/skills/` |
| claude.ai sync | `~/.claude/skills/synced/` |

Whether Claude Code also reads `.agents/skills` was not confirmed.

**Gotcha: home-directory volumes.** Anything you `COPY` into `/home/node/.claude/skills` during the build is **hidden by the named volume** mounted at `~/.claude` once the volume exists. Docker only copies image content into a *new, empty* volume. Bake org skills into `/etc/claude-code/.claude/skills/`, or ship them as a seeded plugin. Use `postCreateCommand` only for per-user extras that legitimately live in the volume.

Skill-specific risks:
- `` !`cmd` `` / ` ```! ` shell injection runs commands before the model sees the skill. Disable it with `"disableSkillShellExecution": true`, enforced through managed settings.
- `allowed-tools` pre-approves tools for that turn and **is not gated by workspace trust**. Repo-committed skills can grant themselves Bash.
- Skill `hooks` register on invocation and persist for the session.

### 4.3 Codex skills, plugins, MCP, AGENTS.md

**Skills** ([Build skills](https://learn.chatgpt.com/docs/build-skills.md)):

| Scope | Path |
| --- | --- |
| Repo | `.agents/skills` in every directory from CWD up to the repo root |
| User | `$HOME/.agents/skills` |
| Admin | `/etc/codex/skills` |
| System | Bundled with Codex |

- `~/.codex/skills` and `.codex/skills` are the **legacy** locations from Dec 2025. ([issoh.co.jp](https://www.issoh.co.jp/tech/details/10181/))
- Symlinked skill directories are followed.
- `$skill-installer <name>` installs curated skills interactively.
- Disable a skill with:
  ```toml
  [[skills.config]]
  path = "/path/to/SKILL.md"
  enabled = false
  ```
- For containers, bake skills into `/etc/codex/skills`, which sits outside the `~/.codex` volume and outside `~/.agents` (unless you also persist that).

**Plugins** ([Package your plugin](https://developers.openai.com/plugins/build/plugins)):

```bash
codex plugin marketplace add your-org/your-marketplace --ref v1.4.0     # or owner/repo@ref; --sparse PATH
codex plugin marketplace list | upgrade [name] | remove <name>
```

```toml
# ~/.codex/config.toml or project .codex/config.toml (trusted projects only)
[plugins."code-formatter@your-marketplace"]
enabled = true
```

- Marketplace files live at `.agents/plugins/marketplace.json` (repo) or `~/.agents/plugins/marketplace.json`.
- Git plugin entries accept `ref` **or `sha`**. npm entries accept `version`.
- Plugins bundle `skills/`, `mcp.json` and assets. Lifecycle hooks are allowed only for plugins installed manually in the desktop app, and "installing or enabling a plugin doesn't automatically trust its hooks".
- Third-party sources disagree on the install verb (`codex plugin add` vs `codex plugin install`). Check `codex plugin --help` on 0.164.0.

**MCP.** Configure in `config.toml`, pinning server packages to exact versions:

```toml
[mcp_servers.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github@<exact-version>"]
env = { GITHUB_PERSONAL_ACCESS_TOKEN = "..." }
```

For Claude Code, use a project `.mcp.json` checked into the repo, or `claude mcp add --scope project`. The binaries those servers need go in the Dockerfile, and remote MCP domains go on the egress allowlist. ([Claude devcontainer docs](https://code.claude.com/docs/en/devcontainer)) A `.mcp.json` server in an untrusted folder **connects without asking under `claude -p`**.

**AGENTS.md / CLAUDE.md.** These are plain instruction files, prompt context rather than code. They are still an injection surface, so review changes to them in PRs like code.

**New vector: npm packages that ship agent skills.** pnpm 12.11 added `permissions.<pkg>.skills: true|false` to control whether a dependency's agent skills are linked into project skill directories. Deny by default. ([pnpm build settings](https://pnpm.io/settings/build))

### 4.4 Build time vs postCreate time

| | Build time (Dockerfile) | `postCreateCommand` / `postStartCommand` |
| --- | --- | --- |
| Reproducibility | Image layer, pinned args, cacheable | Runs per container, against whatever is upstream then |
| Network | Build network (can differ from runtime firewall) | Must pass the runtime firewall |
| Credentials | None should be present. Use BuildKit `--secret` for private repos | May have agent or GitHub creds present, which is riskier |
| Volume masking | Paths under `~/.claude`, `~/.codex` and `~/.agents` are **masked by volumes** | Writes land in the volume and persist |
| Recommended for | Agent CLIs, managed settings, org skills (`/etc/...`), Claude plugin seed, Codex skills in `/etc/codex/skills` | Per-user opt-ins, `pnpm install --frozen-lockfile`, firewall init |

### 4.5 Third-party skill and plugin risk

- **Snyk "ToxicSkills"** (Feb 2026): of 3,984 skills from ClawHub and skills.sh, 13.4% had at least one critical issue (malware, prompt injection, exposed secrets), and 76 were confirmed malicious. ([Snyk](https://snyk.io/blog/toxicskills-malicious-ai-agent-skills-clawhub), [CSA briefing](https://labs.cloudsecurityalliance.org/research/briefing-csa-research-note-skill-md-agent-context-poisoning/))
- Worms now write agent config: ChainDrop added `SessionStart` hooks to `.claude/settings`.
- Mitigations:
  - Vendor or pin to a commit SHA, read every `SKILL.md`, script, hook and MCP definition, and turn auto-update off.
  - Use managed allowlists (`strictKnownMarketplaces`, `allowManagedHooksOnly`, `disableSkillShellExecution`).
  - Prefer Anthropic- or OpenAI-curated catalogs (Anthropic's community catalog is SHA-pinned).
  - Watch PR diffs touching `.claude/`, `.codex/`, `.agents/`, `.mcp.json`, `.vscode/` and `AGENTS.md`/`CLAUDE.md`. A CODEOWNERS rule on these paths is cheap.

---

## Open questions / uncertain

1. **bwrap under Docker's default seccomp/AppArmor.** I could not confirm whether Claude Code's sandbox (even with `enableWeakerNestedSandbox`) or Codex's bwrap sandbox can create user namespaces under Docker's *default* seccomp profile on a Linux host without `seccomp=unconfined`/`SYS_ADMIN`. Results likely vary with kernel, Docker version and Ubuntu 24.04+'s `kernel.apparmor_restrict_unprivileged_userns`. Test empirically: `bwrap --ro-bind / / true` inside the container.
2. **npm 12 bundling.** npm 12 is `latest` on the registry, but Node 24.22.1 and 26.12.1 still bundle npm 11.x. The npm team hoped to backport v12 to Node 24/26. Status unknown; check the Node release notes.
3. **npm `min-release-age-exclude`.** It is present in the current npm docs, but one blog (May 2026) said no exclusion existed yet (npm/cli#8994). It was probably added in 11.17. Verify with your exact npm version.
4. **Yarn `npmMinimalAgeGate` default.** 1d "for new projects" since 4.15 per the Yarn blog. Whether existing projects get it, and whether duration strings like `"7d"` now work, is unverified.
5. **Codex approval policy values.** `untrusted` is retired. I did not confirm whether `on-failure` still exists in 0.164.0. The exact `codex plugin` subcommands for installing (as opposed to marketplace management) also vary between sources.
6. **Codex requirements file.** The path (`/etc/codex/requirements.toml`) and the `allowed_sandbox_modes` key come from a third-party blog, not OpenAI docs.
7. **Whether Claude Code reads `.agents/skills`.** Not confirmed in the docs I read.
8. **Lockfile file name.** The devcontainer CLI PR uses `.devcontainer-lock.json`. Some docs show `devcontainer-lock.json`. Check what your CLI version writes.
9. **VS Code SSH agent forwarding toggle.** Still no official setting as of the issue's state (open, no maintainer response). A VS Code PR adds `chat.agentHost.devContainer.gitCredentialForwarding` for agent sessions only, and it excludes the SSH agent. Shipping status unknown.
10. **Global agent CLI installs with scripts disabled.** Whether `@anthropic-ai/claude-code@2.1.310` and `@openai/codex@0.164.0` need install scripts or optional platform packages under `--ignore-scripts` / npm 12's default skip was not tested.
11. **Exact OpenAI auth hostnames** for an egress allowlist (ChatGPT login and device auth) were not verified from official docs.
12. **Docker Sandboxes (`sbx`) on Linux.** Sources conflicted on Linux availability and licensing. One said Claude runs with `--dangerously-skip-permissions` by default there. Not verified.
13. **Incident figures** (package counts, download numbers) vary by vendor. The ones above are as reported by the cited source.
