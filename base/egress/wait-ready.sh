#!/bin/sh
# Runs as `node` from postStartCommand. `devcontainer up` does not wait for the
# root start-up step, so this blocks until start.sh reports ready, and fails
# (with its reason, which `up` shows) if the step failed or never finished.
RUN=/run/egress
i=0
while [ "$i" -lt 600 ]; do
  [ -e "$RUN/ready" ] && exit 0
  if [ -e "$RUN/failed" ]; then
    echo "dev-setup start-up step failed: $(cat "$RUN/failed")" >&2
    exit 1
  fi
  sleep 0.2
  i=$((i + 1))
done
echo "dev-setup start-up step did not finish within 120s" >&2
exit 1
