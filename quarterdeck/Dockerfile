# The Quarterdeck image: Base material plus the tools the mates need. Not a Variant
# (ADR 0006): no devcontainer.json, no Template, never published.
# Build context is the repository root:  docker build -f quarterdeck/Dockerfile .

# Same pinned base image as variants/node/Dockerfile. scripts/check-pins.mjs fails when the two differ.
FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205

# Same Claude Code and pnpm pins as the Node Variant.
ARG PNPM_VERSION=11.0.0
ARG CLAUDE_CODE_VERSION=2.1.310
# Quarterdeck extras, exact versions. Herdr and treehouse are pinned by FirstMate's own install scripts.
ARG DOCKER_VERSION=28.1.1
ARG DOCKER_SHA256=ff34bd799b5e4c3738a3b1a383cf4067c672add48c7203fcd003fcb0aacebc94
ARG GH_VERSION=2.62.0
ARG GH_SHA256=41c8b0698ad3003cb5c44bde672a1ffd5f818595abd80162fbf8cc999418446a
ARG DEVCONTAINER_CLI_VERSION=0.89.0
# ValeriD/firstmate, the fork FirstMate runs from. Full commit SHA, fetched by SHA.
ARG FIRSTMATE_COMMIT=427056c4181c41074ad24f051f79919330df0fa5

LABEL io.github.valerid.dev-setup.claude-code.version=${CLAUDE_CODE_VERSION} \
      io.github.valerid.dev-setup.firstmate.commit=${FIRSTMATE_COMMIT}

RUN apt-get update \
 && apt-get install -y --no-install-recommends git curl ca-certificates jq procps dnsmasq-base nftables \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g --ignore-scripts \
      pnpm@${PNPM_VERSION} \
      @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} \
      @devcontainers/cli@${DEVCONTAINER_CLI_VERSION} \
 && node "$(npm root -g)/@anthropic-ai/claude-code/install.cjs" \
 && claude --version && devcontainer --version

# Docker CLI and gh from their official release archives, SHA-256 checked.
RUN curl -fsSL -o /tmp/docker.tgz https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_VERSION}.tgz \
 && echo "${DOCKER_SHA256}  /tmp/docker.tgz" | sha256sum -c - \
 && tar -xzf /tmp/docker.tgz -C /usr/local/bin --strip-components=1 docker/docker \
 && curl -fsSL -o /tmp/gh.tgz https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz \
 && echo "${GH_SHA256}  /tmp/gh.tgz" | sha256sum -c - \
 && tar -xzf /tmp/gh.tgz -C /usr/local --strip-components=1 gh_${GH_VERSION}_linux_amd64/bin/gh \
 && rm /tmp/docker.tgz /tmp/gh.tgz \
 && docker --version && gh --version

# FirstMate at the pinned commit, read-only. Its own scripts install Herdr and treehouse (SHA-256 checked).
RUN git init -q /opt/firstmate \
 && git -C /opt/firstmate fetch -q --depth 1 https://github.com/ValeriD/firstmate ${FIRSTMATE_COMMIT} \
 && git -C /opt/firstmate checkout -q FETCH_HEAD \
 && test "$(git -C /opt/firstmate rev-parse HEAD)" = "${FIRSTMATE_COMMIT}" \
 && bash /opt/firstmate/bin/fm-install-herdr.sh /usr/local/bin \
 && bash /opt/firstmate/bin/fm-install-treehouse.sh /usr/local/bin \
 && chown -R root:root /opt/firstmate && chmod -R go-w,a+rX /opt/firstmate \
 && herdr --version && treehouse --version

# Base material, copied as in variants/node/Dockerfile. The Claude policy is the Quarterdeck's own
# (Base's without allowManagedHooksOnly: the mates' hooks must run).
COPY base/bin/ /usr/local/bin/
COPY quarterdeck/claude-policy.json /opt/dev-setup/claude-policy.json
COPY base/codex/config.toml /etc/codex/config.toml
COPY base/egress/ /usr/local/share/egress/
COPY base/mcp/check-secrets.sh /usr/local/share/dev-setup/check-secrets.sh
COPY base/vscode/dev-setup-scrub.sh /etc/profile.d/dev-setup-scrub.sh
COPY base/git/gitconfig /etc/dev-setup/gitconfig
COPY base/bin/git-credential-dev-setup /usr/local/bin/git-credential-dev-setup
RUN chmod 755 /usr/local/bin/git-credential-dev-setup \
 && chmod 644 /etc/profile.d/dev-setup-scrub.sh /etc/dev-setup/gitconfig \
 && sed -i '1i . /etc/profile.d/dev-setup-scrub.sh' /etc/bash.bashrc

# The installer in build mode: Base layer plus the Quarterdeck layer. Same pnpm policy as the Node Variant.
COPY installer/ /opt/dev-setup/installer/
COPY extensions/base.json /opt/dev-setup/manifests/base.json
COPY quarterdeck/extensions.json /opt/dev-setup/manifests/quarterdeck.json
RUN cd /opt/dev-setup/installer \
 && pnpm_config_minimum_release_age=10080 pnpm_config_minimum_release_age_strict=true \
    pnpm_config_trust_policy=no-downgrade pnpm_config_strict_dep_builds=true \
    pnpm_config_block_exotic_subdeps=true pnpm_config_frozen_lockfile=true \
    pnpm install --prod \
 && rm -rf /root/.local/share/pnpm /root/.cache \
 && chmod -R go-w,a+rX /opt/dev-setup
RUN mkdir -p /opt/dev-setup/mcp /etc/dev-setup \
 && node /opt/dev-setup/installer/src/cli.mjs install --mode build \
      --manifest /opt/dev-setup/manifests/base.json \
      --manifest /opt/dev-setup/manifests/quarterdeck.json \
 && rm -rf /root/.local/share/pnpm /root/.cache \
 && chmod -R u=rwX,go=rX /etc/claude-code /etc/codex /etc/dev-setup /usr/local/share/egress /opt/dev-setup/mcp /opt/dev-setup/marketplaces /opt/dev-setup/hooks

# The Quarterdeck's own tools, first on PATH. /opt/qd/empty/.devcontainer is the empty "workspace"
# the egress start-up step reads: no project layer, so only the image's allowlist applies.
# Reuse the host skill's pinned JSONC dependency and lockfile, without its application code.
COPY skills/dev-container/scripts/package.json skills/dev-container/scripts/pnpm-lock.yaml /opt/qd/
RUN cd /opt/qd && pnpm install --prod --frozen-lockfile --ignore-scripts
COPY quarterdeck/bin/claude quarterdeck/bin/qd-entry quarterdeck/bin/qd-server quarterdeck/bin/qd-first-mate quarterdeck/bin/qd-publish quarterdeck/bin/qd-project-up /opt/qd/bin/
COPY quarterdeck/fleet/ /opt/qd/fleet/
COPY quarterdeck/skills/ /etc/claude-code/.claude/skills/
RUN chmod -R u=rwX,go=rX /etc/claude-code/.claude/skills \
 && mkdir -p /opt/qd/empty/.devcontainer /home/node/.claude /home/node/.treehouse \
 && chown node:node /home/node/.claude /home/node/.treehouse \
 && chmod 755 /opt/qd/bin/claude /opt/qd/bin/qd-project-up /opt/qd/bin/qd-entry /opt/qd/bin/qd-server /opt/qd/bin/qd-first-mate /opt/qd/bin/qd-publish /usr/local/bin/claude-yolo /usr/local/bin/codex-yolo \
      /usr/local/share/dev-setup/check-secrets.sh /usr/local/share/egress/*.sh \
 && chmod -R go-w,a+rX /opt/qd \
 && find / -xdev -type f \( -perm -4000 -o -perm -2000 \) -exec chmod a-s {} + \
 && ! find / -xdev -type f \( -perm -4000 -o -perm -2000 \) | grep -q .

ENV PATH=/opt/qd/bin:$PATH \
    DOCKER_HOST=unix:///run/docker-proxy/docker.sock \
    CLAUDE_CONFIG_DIR=/home/node/.claude \
    DISABLE_AUTOUPDATER=1 \
    DEV_SETUP_WORKSPACE=/opt/qd/empty \
    GIT_CONFIG_GLOBAL=/etc/dev-setup/gitconfig \
    GIT_CONFIG_COUNT=2 \
    GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null \
    GIT_CONFIG_KEY_1=core.fsmonitor GIT_CONFIG_VALUE_1=false

# Root only until qd-entry has applied the egress rules; it then drops to `node`.
WORKDIR /home/node
ENTRYPOINT ["/opt/qd/bin/qd-entry"]

ARG REVISION=
LABEL org.opencontainers.image.revision=${REVISION}
