# Quarterdeck interactive bash (Herdr panes). Sourced from /etc/bash.bashrc, so interactive shells only.
# History is not persistent: it lives in the container's /home/node and goes with it (decision 101).
# Every pane shares it: lines are written as soon as they run and other panes' lines are read at each prompt.
[ -n "${PS1:-}" ] || return 0
HISTFILE=/home/node/.bash_history
HISTCONTROL=ignorespace:erasedups
HISTSIZE=50000
HISTFILESIZE=50000
shopt -s histappend
# Read first, then write: `history -a` before `history -n` moves bash's read offset past other panes' new lines.
case ";${PROMPT_COMMAND:-};" in
  *';history -n; history -a;'*) ;;
  *) PROMPT_COMMAND="history -n; history -a${PROMPT_COMMAND:+; $PROMPT_COMMAND}" ;;
esac
# Short output prints and stays on screen; `q` quits long output (decision 102).
export PAGER='less -FRX' GIT_PAGER='less -FRX'
