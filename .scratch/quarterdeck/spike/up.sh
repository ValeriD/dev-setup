#!/bin/bash
# Starts the spike Quarterdeck with the Docker socket mounted directly (spike only).
# The token file is root-owned 0600, so it is bind-mounted and sourced by the
# root entrypoint (bin/qd-entry), not passed with --env-file. Never prints tokens.
set -euo pipefail
ROOT=/home/valeri/qd-spike
SPIKE=$(cd "$(dirname "$0")" && pwd)
ENVF=${QD_ENV:-$HOME/.config/spike.env}
[ -e "$ENVF" ] || { echo "missing $ENVF (needs CLAUDE_CODE_OAUTH_TOKEN and GH_TOKEN)" >&2; exit 1; }
mkdir -p "$ROOT/treehouse" "$ROOT/fleet"
docker rm -f qd-spike >/dev/null 2>&1 || true
docker run -d --name qd-spike --label qd-spike=1 --hostname quarterdeck \
  --user root --entrypoint /opt/qd/bin/qd-entry \
  --group-add "$(stat -c %g /var/run/docker.sock)" -v /var/run/docker.sock:/var/run/docker.sock \
  -e QD_SOCK_GID="$(stat -c %g /var/run/docker.sock)" \
  -v "$ENVF:/run/qd/spike.env:ro" \
  -v "$ROOT:$ROOT" -v "$ROOT/treehouse:/home/node/.treehouse" \
  -v "$SPIKE/bin:/opt/qd/bin:ro" \
  -e QD_ROOT="$ROOT" -e QD_WORKTREES=/home/node/.treehouse \
  -e QD_PROJECT_CONTAINER=qd-spike-project -e QD_LAUNCH_LOG="$ROOT/launch.log" \
  -e GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-spike}" -e GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-spike@example.invalid}" \
  -e GIT_COMMITTER_NAME="${GIT_AUTHOR_NAME:-spike}" -e GIT_COMMITTER_EMAIL="${GIT_AUTHOR_EMAIL:-spike@example.invalid}" \
  qd-spike-quarterdeck:dev >/dev/null
sleep 3
docker logs qd-spike 2>&1 | tail -5
echo "Quarterdeck is up. Attach with: docker exec -it qd-spike herdr"
