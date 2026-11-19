#!/bin/bash
# Managed Claude hook for a FirstMate Crewmate in a Quarterdeck-created project container (ticket 15).
# qd-project-up adds it as a project-layer Agent Extension, one entry per event: UserPromptSubmit, Stop,
# StopFailure and SessionEnd. The hardened policy (allowManagedHooksOnly) ignores the busy hooks FirstMate
# writes into the worktree, so this does what they would: one fm-busy-event.sh call per event.
#
# Inert unless FM_TASK_ID and FM_TASK_INBOX (<home>/state/<id>.inbox) are both set, so it is harmless in a
# container used without the Quarterdeck. state/ and the worktree are Crewmate-writable: nothing read from
# them is executed. The generation value is read as data and must be a plain token. The only program run
# is fm-busy-event.sh from <home>/bin, and only when <home>/bin is a read-only mount.
# Always exits 0 and prints nothing, so it can never block or change Claude's turn.
set -u
exec >/dev/null 2>&1

id=${FM_TASK_ID:-}
inbox=${FM_TASK_INBOX:-}
[ -n "$id" ] && [ -n "$inbox" ] || exit 0
token() { case "$1" in '' | . | .. | *[!A-Za-z0-9._-]*) return 1 ;; esac; }
token "$id" || exit 0
case "$inbox" in /*/state/"$id".inbox) ;; *) exit 0 ;; esac
case "$inbox/" in */../* | */./* | *//*) exit 0 ;; esac
state=${inbox%/*}
home=${state%/state}
bin=$home/bin
writer=$bin/fm-busy-event.sh

# <home>/bin must be exactly a read-only mount point holding a regular, non-symlinked writer.
mounted=$(findmnt -rn -o OPTIONS --mountpoint "$bin") || exit 0
case ",$mounted," in *,ro,*) ;; *) exit 0 ;; esac
[ -f "$writer" ] && [ ! -L "$writer" ] && [ -x "$writer" ] || exit 0
[ -d "$state" ] && [ ! -L "$state" ] || exit 0

# Claude's hook input on stdin names the event and the session; both are checked as data, never evaluated.
input=$(node -e '
let s = "";
process.stdin.on("data", d => (s += d)).on("end", () => {
  try {
    const { hook_event_name: e, session_id: id } = JSON.parse(s);
    if (typeof e === "string" && typeof id === "string") process.stdout.write(e + " " + id);
  } catch {}
});' 2>/dev/null)
event=${input%% *}
session=${input#* }
token "$session" || exit 0
case "$event" in
  UserPromptSubmit) busy=busy name=user-prompt-submit ;;
  Stop) busy=idle name=stop ;;
  StopFailure) busy=idle name=stop-failure ;;
  SessionEnd) busy=idle name=session-end ;;
  *) exit 0 ;;
esac

# first_line FILE: a regular, non-symlinked file's first line, if it is a plain token.
first_line() {
  local line=
  [ -f "$1" ] && [ ! -L "$1" ] || return 1
  IFS= read -r line <"$1" || [ -n "$line" ] || return 1
  token "$line" && printf '%s' "$line"
}
# FirstMate binds each hook to the generation it armed for that launch, so a session that outlives its
# incarnation is refused. The same binding here: a session's first event records the generation armed
# then (state/<id>.busy-gen), and its later events reuse it. Container-local, outside state/ and the worktree.
pins=/tmp/qd-crewmate-busy
mkdir -p -m 700 "$pins" 2>/dev/null
[ -d "$pins" ] && [ ! -L "$pins" ] && [ -O "$pins" ] || exit 0
pin=$pins/$id.$session
if ! gen=$(first_line "$pin"); then
  gen=$(first_line "$state/$id.busy-gen") || exit 0
  printf '%s\n' "$gen" >"$pin.$" && mv -f "$pin.$" "$pin" || exit 0
fi

# A Crewmate's Stop also wakes FirstMate's watcher, as FirstMate's own Claude wiring does. --turn-ended
# touches it under the writer's lock, and only when the generation is accepted.
turn=
[ "$name" != stop ] || turn=--turn-ended
"$writer" apply "$state" "$id" "$busy" --gen "$gen" --source claude-hook --event "$name" $turn || true
exit 0
