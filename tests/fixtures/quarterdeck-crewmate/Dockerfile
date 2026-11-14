ARG NODE_IMAGE
FROM ${NODE_IMAGE}
USER root
RUN rm /usr/local/bin/claude
COPY --chmod=755 claude.mjs /usr/local/bin/claude
