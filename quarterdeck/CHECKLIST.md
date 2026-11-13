# Quarterdeck manual checklist

Rows the token-free tests cannot prove because they need a real Claude session, real tokens, or GitHub. Run a row per slice, with your own token file (see `quarterdeck/bin/quarterdeck`). A row is ticked only when its pass condition holds on the first try, with no manual keystroke.

Every row has the same columns: scenario, setup, what to look at, what a pass is.

| Scenario | Setup | Look at | Pass |
|---|---|---|---|
| SC-02 First Mate tab opens | `quarterdeck stop`, then `quarterdeck` with a real token file | Herdr's sidebar right after attach: the workspace list and the `firstmate` workspace. Its pane: `herdr --session default pane list` shows the home (`<work root>/fleet/firstmate`) as its cwd | A workspace named `firstmate` exists without you creating it. Its pane shows Claude's prompt box, started with `--model opus --permission-mode auto` (visible in `/status` or `ps`). A second `quarterdeck` attach opens no second one. When Claude finishes a turn while you look elsewhere, the `firstmate` tab shows Herdr's attention mark (decision 29) |
| SC-10 Claude starts with no prompt, trust dialog or login | Same start, a token file holding a real `CLAUDE_CODE_OAUTH_TOKEN`, a work root with no earlier Claude config (`<work root>/quarterdeck/claude` empty) | The `firstmate` pane from the first screen Claude draws, until you type | No onboarding screen, no "trust this folder" dialog, no login or "choose a theme" prompt. The pane is at an empty prompt, and Herdr shows the tab as idle, not blocked. Typing "hello" gets an answer. The model shown is Opus. Scope: the start only; "no prompt across a whole run" is re-checked in the end-to-end slice (design slice 7) |
