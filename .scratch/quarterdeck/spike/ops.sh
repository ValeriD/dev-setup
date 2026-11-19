#!/bin/bash
# Host-side helper: run a shell command in the Quarterdeck's "ops" Herdr pane
# (which has the tokens in its environment) and print its output.
# Usage: ops.sh '<command>' [timeout-seconds]   (pane id from OPS_PANE, default w1:p1)
pane=${OPS_PANE:-w1:p1}; t=${2:-120}; tag="__done_$RANDOM$RANDOM"
log=/home/valeri/qd-spike/ops.out
: > "$log"
docker exec -u node qd-spike herdr pane run "$pane" "{ $1 ; } > $log 2>&1; echo \"$tag rc=\$?\" >> $log"
for _ in $(seq 1 "$t"); do grep -q "$tag" "$log" 2>/dev/null && break; sleep 1; done
sed "s/$tag/done/" "$log"
