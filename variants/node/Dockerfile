# Build context is the repository root (see devcontainer.json "build.context").

# Pinned base image (Node 24, Debian 12). Renovate updates the digest.
FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205

# Exact tool versions: the single place to change them. tests/ reads these.
ARG PNPM_VERSION=11.0.0
ARG CLAUDE_CODE_VERSION=2.1.310
ARG CODEX_VERSION=0.164.0

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates dnsmasq-base nftables \
 && rm -rf /var/lib/apt/lists/*

# Install scripts stay disabled globally. Codex needs none. Claude Code's
# postinstall only copies the platform binary into place, so run it as one
# explicit, reviewed step.
RUN npm install -g --ignore-scripts \
      pnpm@${PNPM_VERSION} \
      @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} \
      @openai/codex@${CODEX_VERSION} \
 && node "$(npm root -g)/@anthropic-ai/claude-code/install.cjs" \
 && claude --version && codex --version

# Base material: root-owned policy files and wrappers at fixed system paths.
COPY base/bin/ /usr/local/bin/
COPY base/claude/managed-settings.json /etc/claude-code/managed-settings.json
COPY base/codex/config.toml /etc/codex/config.toml
COPY base/egress/ /usr/local/share/egress/
COPY base/mcp/check-secrets.sh /usr/local/share/dev-setup/check-secrets.sh

# Host-credential isolation: VS Code bridge scrubber (profile.d + bash.bashrc
# hook + postStartCommand), read-only git config and the PAT-only credential helper.
COPY base/vscode/dev-setup-scrub.sh /etc/profile.d/dev-setup-scrub.sh
COPY base/git/gitconfig /etc/dev-setup/gitconfig
COPY base/bin/git-credential-dev-setup /usr/local/bin/git-credential-dev-setup
RUN chmod 755 /usr/local/bin/git-credential-dev-setup \
 && chmod 644 /etc/profile.d/dev-setup-scrub.sh /etc/dev-setup/gitconfig \
 && sed -i '1i . /etc/profile.d/dev-setup-scrub.sh' /etc/bash.bashrc

# Extension installer (Base + Variant layers). Its own dependencies install under
# the same pnpm policy the container enforces at runtime (the pnpm_config_* env
# lives in image metadata, which a build step does not see): frozen lockfile,
# 7-day release age, scripts blocked.
COPY installer/ /opt/dev-setup/installer/
COPY extensions/base.json /opt/dev-setup/manifests/base.json
COPY variants/node/extensions.json /opt/dev-setup/manifests/node.json
RUN cd /opt/dev-setup/installer \
 && pnpm_config_minimum_release_age=10080 pnpm_config_minimum_release_age_strict=true \
    pnpm_config_trust_policy=no-downgrade pnpm_config_strict_dep_builds=true \
    pnpm_config_block_exotic_subdeps=true pnpm_config_frozen_lockfile=true \
    pnpm install --prod \
 && rm -rf /root/.local/share/pnpm /root/.cache \
 && chmod -R go-w,a+rX /opt/dev-setup

# Build step 5: validate the Base and Variant manifests (a bad entry fails the
# build, naming the entry), install their skills for both Agents into the native
# system skill directories, pre-install stdio MCP servers (pnpm, exact versions) under
# /opt/dev-setup/mcp and render the Agents' MCP config, and assemble the Egress
# Allowlist the start-up step reads.
RUN mkdir -p /opt/dev-setup/mcp /etc/dev-setup \
 && node /opt/dev-setup/installer/src/cli.mjs install --mode build \
      --manifest /opt/dev-setup/manifests/base.json \
      --manifest /opt/dev-setup/manifests/node.json \
 && rm -rf /root/.local/share/pnpm /root/.cache \
 && chmod -R u=rwX,go=rX /etc/claude-code /etc/codex /etc/dev-setup /usr/local/share/egress /opt/dev-setup/mcp

# Login-volume mount points exist and belong to node, so new named volumes
# inherit that ownership.
RUN mkdir -p /home/node/.claude /home/node/.codex \
 && chown node:node /home/node/.claude /home/node/.codex \
 && chmod 755 /usr/local/bin/claude-yolo /usr/local/bin/codex-yolo /usr/local/share/dev-setup/check-secrets.sh \
 && chmod -R u=rwX,go=rX /etc/claude-code /etc/codex /usr/local/share/egress \
 && chmod 755 /usr/local/share/egress/*.sh \
 && find / -xdev -type f \( -perm -4000 -o -perm -2000 \) -exec chmod a-s {} + \
 && ! find / -xdev -type f \( -perm -4000 -o -perm -2000 \) | grep -q .

USER node
WORKDIR /workspace
