# Your tasks to finish the Quarterdeck MVP

These are the steps that need you: a real token, a real GitHub repository, or a real Claude session. The steps are in order, and each task builds on the one before it. The ticket each task closes is in its heading.

Where this file and `quarterdeck/CHECKLIST.md` disagree, this file is right. The checklist's blocker notes for tickets 13, 14, 16 and 17 predate tickets 21, 22 and 23. Those three tickets settled the security concerns, the shallow FirstMate history and the start without the First Mate, so none of these blockers stand any more.

You only run and observe. Paste me what you saw at the end of each task (pass or fail per check, exit codes, PR URL), and I will record it in the ticket and in the checklist. Never paste a token, raw `env`, `docker inspect` output or `git credential` output.

Paths: the work root is `~/work`, which is `/home/valeri/work` both on the host and inside the Quarterdeck. `qd` below means `~/Documents/Work/dev/dev-setups-quarterdeck/quarterdeck/bin/quarterdeck`, or the same path in the main checkout once the PR is merged.

---

## 0. Once, before anything else

1. **Set your committer identity in the environment.** The Quarterdeck takes it from environment variables only, not from `~/.gitconfig` (this is an open review finding). Add the following to `~/.bashrc` and open a new terminal:
   ```sh
   export GIT_AUTHOR_NAME="ValeriD" GIT_AUTHOR_EMAIL="<your email>"
   export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME" GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
   ```
2. **Create the token file** (it does not exist yet):
   ```sh
   mkdir -p ~/.config/quarterdeck && install -m 600 /dev/null ~/.config/quarterdeck/secrets.env
   ```
   Then put these three lines in it with an editor, one `NAME=value` per line:
   - `CLAUDE_CODE_OAUTH_TOKEN=`: the output of `claude setup-token` on the host.
   - `QUARTERDECK_EXTENSIONS_TOKEN=`: a fine-grained GitHub token for **`ValeriD/skills` only**, with **Contents: Read-only**. Metadata read is added by GitHub on its own.
   - `QUARTERDECK_GITHUB_TOKEN=`: a fine-grained token with **Contents: Read and write** and **Pull requests: Read and write**. For task A, give it access to the throwaway repository only. Before task B, edit the same token on GitHub to add `ValeriD/pomoplan`.
   - Check the file with `stat -c '%U %a' ~/.config/quarterdeck/secrets.env`. It must print `valeri 600`. After any change to the file, run `qd stop` and start again, because a running Quarterdeck keeps the values it started with.
3. **Check pomoplan on GitHub.** Its default branch must be `main` and hold the `.devcontainer/` with the `ghcr.io/valerid/dev-setup/node@sha256:…` image. It was `master`; the user renamed it to `main` on 2026-11-17. Ticket 24 adds support for `master` later.

## A. Real GitHub clone, push and pull request, no agent (ticket 13)

1. On GitHub, create a **private** repository `ValeriD/qd-throwaway` with a README, so it has a `main` branch. Scope `QUARTERDECK_GITHUB_TOKEN` to this repository only.
2. Start without the First Mate:
   ```sh
   qd start --no-first-mate
   ```
   It must return with no error. A warning for a missing name you did not fill in is fine.
3. Open Herdr **without** `qd` or `qd attach`, which would start the First Mate:
   ```sh
   docker exec -it -u node -w /home/node quarterdeck herdr
   ```
   Open a new shell pane in Herdr. Only Herdr panes hold the tokens, so every command below runs in that pane.
4. Clone and register the project in the First Mate's home:
   ```sh
   export GIT_TERMINAL_PROMPT=0
   M=/home/valeri/work/fleet/firstmate; cd "$M"
   git clone https://github.com/ValeriD/qd-throwaway.git projects/qd-throwaway
   echo "- qd-throwaway [direct-PR] - Quarterdeck ticket 13 throwaway (added $(date +%F))" >> data/projects.md
   FM_HOME="$M" bin/fm-project-mode.sh qd-throwaway      # expect: direct-PR off
   git -C projects/qd-throwaway remote get-url origin     # expect: https://github.com/ValeriD/qd-throwaway.git, no token in it
   ```
5. Seed a Second Mate home, with no agent started:
   ```sh
   S=/home/valeri/work/fleet/sm-qd-throwaway
   FM_HOME="$M" FM_SECONDMATE_CHARTER="Owns qd-throwaway for the ticket 13 check" bin/fm-home-seed.sh sm-qd-throwaway "$S" qd-throwaway
   git -C "$S/projects/qd-throwaway" log --oneline -1     # expect: the README commit, cloned from GitHub
   ```
6. Make a branch with one commit, then publish it:
   ```sh
   cd "$S/projects/qd-throwaway"
   git switch -c chore/qd13
   mkdir -p .scratch/qd13/issues && printf '# 01: Say hello\n' > .scratch/qd13/issues/01-say-hello.md
   echo hello > hello.txt && git add -A && git commit -m "Ticket 13 check"
   qd-publish "$S" qd-throwaway chore/qd13 qd13           # expect: prints the PR URL
   ```
   Open the URL. The PR must target `main`, and its body must list `01: Say hello`.
7. Check that no token leaks. From a **host** terminal, not a Herdr pane:
   ```sh
   docker exec quarterdeck sh -c 'for n in CLAUDE_CODE_OAUTH_TOKEN GH_TOKEN DEV_SETUP_GITHUB_PAT QUARTERDECK_GITHUB_TOKEN QUARTERDECK_EXTENSIONS_TOKEN; do [ -n "$(printenv $n)" ] && echo "$n PRESENT" || echo "$n absent"; done'
   docker inspect quarterdeck --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1   # names only: no token name may appear
   ```
   Then in the Herdr pane:
   ```sh
   git -C "$M/projects/qd-throwaway" config --show-origin -l | grep -i -c -E 'token|ghp_|github_pat_'   # expect: 0
   ```
   The token file being readable at `/run/quarterdeck/secrets.env` is an accepted risk (decision 91), not a failure.
8. Clean up: close the PR and delete the `chore/qd13` branch on GitHub. You can keep the throwaway repository for later tasks or delete it. Then run `qd stop`.

**Paste me:** each step's pass or fail, the PR URL and the output of step 7.

## B. pomoplan's container, a hand-spawned Crewmate and the gate (tickets 14, 08 and 09)

Before you start, add `ValeriD/pomoplan` to `QUARTERDECK_GITHUB_TOKEN`.

1. Start again: `qd start --no-first-mate`. Then open Herdr with the `docker exec … herdr` command from A.3 and open a shell pane.
2. Register pomoplan and seed its Second Mate's home, the same way as A.4 and A.5:
   ```sh
   export GIT_TERMINAL_PROMPT=0
   M=/home/valeri/work/fleet/firstmate; cd "$M"
   git clone https://github.com/ValeriD/pomoplan.git projects/pomoplan
   echo "- pomoplan [direct-PR] - Pomodoro planner (added $(date +%F))" >> data/projects.md
   S=/home/valeri/work/fleet/sm-pomoplan
   FM_HOME="$M" FM_SECONDMATE_CHARTER="Owns pomoplan: Spec Runs and its project container" bin/fm-home-seed.sh sm-pomoplan "$S" pomoplan
   ```
3. Create the project container:
   ```sh
   cd "$S" && qd-project-up "$S" pomoplan     # prints the container ID; the first time takes several minutes
   ```
   Note the ID as `C`. Then check the container from the host:
   ```sh
   docker inspect "$C" --format '{{index .Config.Labels "quarterdeck.project"}} {{index .Config.Labels "quarterdeck.home"}}'   # expect: pomoplan /home/valeri/work/fleet/sm-pomoplan
   docker exec -u node "$C" sh -c 'for n in GH_TOKEN GITHUB_TOKEN QUARTERDECK_GITHUB_TOKEN DEV_SETUP_GITHUB_PAT; do [ -n "$(printenv $n)" ] && echo "$n PRESENT" || echo "$n absent"; done'
   ```
   Expect `DEV_SETUP_GITHUB_PAT PRESENT`, because that is the read-only skills token, and the other three absent. Also check that the 14 skills from `ValeriD/skills` are installed in the container.
4. **Ticket 08: the skills token's scope.** Run these in the container (`docker exec -it -u node "$C" bash`):
   ```sh
   export GIT_TERMINAL_PROMPT=0
   git ls-remote https://github.com/ValeriD/skills.git >/dev/null; echo "skills read: $?"          # expect 0
   git ls-remote https://github.com/ValeriD/pomoplan.git >/dev/null 2>&1; echo "other read: $?"     # expect non-zero
   cd "$(mktemp -d)" && git init -q && git commit -q --allow-empty -m x && \
     git push --dry-run https://github.com/ValeriD/skills.git HEAD:refs/heads/qd-readonly-check-$RANDOM; echo "push: $?"
   ```
   The push must fail with a **permission (403) error**. A network error does not count as a pass.
5. **Ticket 14: hand-spawn one Crewmate for the gate.** In the Herdr pane:
   ```sh
   cd "$S"
   FM_HOME="$S" bin/fm-brief.sh qd14-gate pomoplan --mode direct-PR --branch-prefix chore/
   ```
   Edit only the intent and Definition-of-done parts of `$S/data/qd14-gate/brief.md`. Say there: run `pnpm install --frozen-lockfile`, `pnpm run build`, `pnpm run lint` and `pnpm test`; report each exit code; change no files; no push, no PR; on a failure, stop and report it. Then spawn:
   ```sh
   FM_HOME="$S" bin/fm-spawn.sh qd14-gate projects/pomoplan --mode direct-PR --yolo off --branch-prefix chore/ --harness claude --model sonnet
   ```
   **Do not touch the Crewmate's tab.** Any prompt that appears is a failure to note, not something to answer.
6. Watch and note the following:
   - **Ticket 09, ticket 14 and SC-10:** no onboarding, trust or login screen in the Crewmate's tab. Herdr's sidebar shows its real state (working, then done), never "not found".
   - **Gate:** the four exit codes, from the Crewmate's report.
   - **Egress:** any request the Crewmate reports as blocked, and the domain it tried.
   - **Hooks (decides ticket 15):**
     ```sh
     ls -l --time-style=full-iso "$S"/state/qd14-gate.* 2>&1
     ```
     Note whether `busy-state` and `turn-ended` files exist and changed during the run.
   - **Docker proxy (from the host):**
     ```sh
     docker logs quarterdeck-docker-proxy 2>&1 | grep -E ' (403|405) ' | tail -20
     ```
     Note any denied endpoints.
7. Leave the project container running for task C. Run `qd stop` only if you are stopping here.

**Paste me:** the results of step 3, step 4's three exit codes and the push error text, and everything noted in step 6.

## C. A planning run with the real First Mate (ticket 16, plus the checklist's SC-02 and SC-10 rows)

1. `qd stop`, then `qd`, the normal start. A `firstmate` tab must open on its own. Check four things:
   - There was no onboarding, trust or login screen, and the model is Opus.
   - Typing `hello` gets an answer.
   - When it finishes a turn while you are on another tab, its tab gets Herdr's attention mark.
   - A second `qd` from another terminal opens no second First Mate.
2. Tell the First Mate: *"Provision pomoplan's Second Mate."* It reuses the clone and home from task B.
3. **Case 1, fully decided:** give the First Mate a small, fully decided pomoplan feature. Add: *"Planning only: stop and report after planning. No ticket implementation, no push, no PR."* Then type nothing until the report arrives.
4. Check the result in a Herdr pane:
   ```sh
   cd /home/valeri/work/fleet/sm-pomoplan/projects/pomoplan
   git log --oneline origin/main..<branch>       # expect: exactly one commit
   git show --stat <branch> | grep .scratch/     # expect: spec.md, design.md, issues/NN-*.md
   grep -i plan /home/valeri/work/quarterdeck/logs/launch.log | tail -3   # expect: container route, model sonnet
   ```
   On GitHub, the branch must **not** exist.
5. **Case 2, one decision left open:** give a second request with a new topic. Leave one needed decision out on purpose, and add the same planning-only boundary. Expect a question in the report, no commit on the branch, and the Second Mate stopped without choosing an answer.

My notes: 
The second mate needed a permission to read outside of the working dir - it was qd-spec-run/refderences/. 
The agents are having a ticks in the Herdr evne though they are working on stuff. 
A worker returned a question, the second mate routed it to the first mate, and the second mate spawned a new agent instead of answering the one who had the most context so far. 


**Paste me:** each check's result, and any place the First Mate or Second Mate did the wrong thing. That tells me the skill text needs correcting.

## D. One sentence to a report (ticket 17)

Prepare first: a small, fully decided pomoplan change that makes **exactly two tickets**. One must be about skills, prompts or agent tools, so it runs on Opus; the other is anything else, on Sonnet.

1. `qd stop`, then `qd`. Note the time.
2. Give the First Mate **one message** with the decisions. After that, type nothing and press nothing in any tab until the report arrives. If you have to intervene, write down when and why: that run counts as a failure.
3. After the report, check the following:
   - **The PR on pomoplan:**
     - The branch starts with `feat/`, `fix/` or `chore/`.
     - It has 3 commits: the plan, then ticket 1, then ticket 2. Check them with `git log --format='%h %an <%ae> %s'`, and confirm the author is you.
     - The body lists both tickets.
     - There are no other new branches and no other new PRs.
   - **Models in `~/work/quarterdeck/logs/launch.log`:**
     - First Mate on Opus and Second Mate on Sonnet.
     - Planning on Sonnet, the skills ticket on Opus, the other ticket on Sonnet.
     - The publish step on Sonnet.
   - **The report:**
     - The First Mate relays `report.md` word for word.
     - The First Mate's tab has the attention mark.
     - No "blocked: head unreachable" state was reported as a failure.
4. **Backup check (SC-20):**
   ```sh
   qd stop
   cp -a ~/work ~/work-copy
   diff -r --no-dereference ~/work ~/work-copy && echo identical
   git -C ~/work-copy/fleet/sm-pomoplan/projects/pomoplan fsck --no-progress && echo clone-ok
   ```
   Then delete `~/work-copy`. Do not merge the PR unless you want the change in pomoplan.

**Paste me:** the start time, the report time, the number of interventions, the PR URL, the `launch.log` lines and the backup output.

## E. Two runs that end in a stop (ticket 18)

Prepare two small pomoplan Specs to hand over as decisions:

- **Spec F:** one ticket that cannot pass. For example, its test must reach a domain that is not on the Egress Allowlist.
- **Spec Q:** one ticket that needs a product decision the decisions do not make.

1. Give the First Mate **Spec F** and touch nothing. Expect the following:
   - The ticket fails, exactly one fresh retry also fails, and the run stops.
   - Nothing is pushed and there is no PR.
   - The report contains `failed twice: <reason 1>; <reason 2>` and names the branch's sha.
   - This command shows `refs/quarterdeck/failed/01-1`:
     ```sh
     git -C ~/work/fleet/sm-pomoplan/projects/pomoplan show-ref | grep quarterdeck/failed
     ```
2. Give it **Spec Q**. Expect a `Question:` line in the report, and no next ticket started.
3. **A Crewmate that dies:** start any small run. While its Crewmate works, kill it from the host:
   ```sh
   docker exec <project container> pkill -f claude
   ```
   Expect a report saying it stopped, and no publish.
4. In all three runs, the First Mate's tab must get the attention mark without you answering anything.

**Paste me:** each report's text and the `show-ref` output.

## After the tasks

- **Ticket 07:** tell me you accept that its unchecked SC-16 box is covered by ticket 21's decisions 3 and 4. I will close it.
- **Ticket 20** closes when ticket 08 closes, after task B.
- **Ticket 15** is decided by task B's hook result. An agent either builds it or closes it.
- **The Errands test (Errand ticket 08)** comes after all of this.
