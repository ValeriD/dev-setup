# dev-container skill: conversational checklist

The helper is covered by `npm run test:skill` and `tests/dev-container-skill.test.mjs`. This checklist covers what only the conversation decides (SC-01, SC-02, SC-12 to SC-15 for onboarding). It costs model calls and needs a Claude login, so it runs by hand, not in CI.

## Sandbox

Everything happens under a throwaway `$T`: a fake HOME (so VS Code settings and the projects root are temp files), its own Claude config (log in once there), a `gh` stub that records calls instead of creating repositories, and a local bare repo standing in for a GitHub URL.

```sh
T=$(mktemp -d); REPO=$PWD   # run from the dev-setups checkout, with helper deps installed
mkdir -p $T/home $T/claude/skills $T/bin $T/remote
ln -s $REPO/skills/dev-container $T/claude/skills/dev-container
printf '#!/bin/sh\necho "gh $*" >> %s/gh.log\n' $T > $T/bin/gh && chmod +x $T/bin/gh
git init -q $T/src && (cd $T/src && echo '{}' > package.json && mkdir -p docs/agents .scratch && touch docs/agents/x.md .scratch/y.md \
  && git add -A && git -c user.name=t -c user.email=t@t commit -qm init) && git clone -q --bare $T/src $T/remote/web-app.git
export HOME=$T/home CLAUDE_CONFIG_DIR=$T/claude PATH=$T/bin:$PATH DEV_SETUP_GITHUB_PAT=
claude   # /login once, then exit
c() { claude -p --allowedTools 'Bash Read Edit Write' "$@"; }   # follow-ups: c --continue "yes"
```

For a local image instead of the published one, tell the agent the image ref to use (e.g. a local registry tag), since `image-digest` reads the Template default otherwise.

## Checks

| # | Prompt | Expect |
| --- | --- | --- |
| 1 | `c "/dev-container file://$T/remote/web-app.git"` | Clones to `$T/home/Documents/Work/dev/web-app`; proposes node because of `package.json`; says the digest is unverified. |
| 2 | (continue through the flow) | `.devcontainer/devcontainer.json` + empty `extensions.json`; `validate` ran. Offers the VS Code settings once. |
| 3 | `c --continue "no"` to the settings | `$T/home/.config/Code/User/settings.json` does not exist; the summary lists them as missing. |
| 4 | Repeat 1 on a fresh folder, answer "yes" to settings | The settings file holds exactly `dev.containers.copyGitConfig: false` and `dev.containers.dockerCredentialHelper: false` (pre-seed it with a comment and another key: both survive). |
| 5 | The start question | Asked once. "no": no container (`docker ps -a --filter label=devcontainer.local_folder=<dir>` empty). "yes": container runs and `pnpm-lock.yaml` exists; the agent said it created the first lockfile. |
| 6 | Every run | `git -C <dir> status` shows the changes uncommitted; `git log` unchanged; `docs/agents/` and `.scratch/` of web-app untouched; no reminder (web-app has `docs/agents/`). |
| 7 | `c "/dev-container $T/empty"` after `mkdir $T/empty` | `git init` ran; asks which Variant (no signals); ends with the `/setup-matt-pocock-skills` reminder. |
| 8 | `c "/dev-container brand-new"` | `git init` under the projects root; asks before creating a GitHub repo. "no": `$T/gh.log` absent. "yes": `$T/gh.log` has `repo create brand-new --private ...`. |
| 9 | `ln -sfn $T/nowhere $T/claude/skills/dev-container`, re-run 1 | The skill is gone or the agent reports the re-link instruction; nothing changes. Also copy the skill to `$T/copy/skills/dev-container` and link to that: the helper exits 3 with the re-link message. |
| 10 | `c "/dev-container add the playwright MCP to $T/empty"` | Says the operation is not built yet; no edits. |

## Presets (SC-01 Presets part, SC-06, SC-10)

These write `presets/`, so run them against a throwaway checkout, not your own: `git worktree add $T/ds && (cd $T/ds/installer && npx -y pnpm@11.0.0 install --frozen-lockfile) && (cd $T/ds/skills/dev-container/scripts && npx -y pnpm@11.0.0 install --frozen-lockfile) && ln -sfn $T/ds/skills/dev-container $T/claude/skills/dev-container`. Seed two Presets in `$T/ds/presets/`: `web.json` (description, two skills, an `mcp-remote` with egress `docs.example.com`, top-level egress `cdn.example.com`) , `api.json` (description, one other skill, top-level egress `cdn.example.com` and `api.example.com`) and `dup.json` (description, one skill with the same directory name as one in `web`). Fake SHAs are fine; answer "no" to starting the container.

| # | Prompt | Expect |
| --- | --- | --- |
| P1 | `c "/dev-container $T/p1"` after `mkdir $T/p1` | The Preset question lists `web`, `api` and `dup` with their descriptions. Pick `web` and `api`: `extensions.json` holds all four entries, tagged `web` or `api`; `egress` holds `cdn.example.com` once and `api.example.com`; `validate` ran. |
| P1b | Repeat P1 on a fresh folder, pick `web` and `dup` | `validate` reports the skill name declared twice; the agent asks which Preset to leave out. |
| P2 | Add `"broken"` as `$T/ds/presets/bad.json`, repeat P1 | `bad` is not offered; the agent names its problem. |
| P3 | `c "/dev-container remove the web preset from $T/p1"` | Shows the plan, names the domains it proposes to drop, asks once. After yes: no `web` entries remain; `cdn.example.com` stays (api needs it); `api` entries and `api.example.com` unchanged. |
| P4 | `c "/dev-container save the extensions of $T/p1 as preset solo"` | Asks for a description; `$T/ds/presets/solo.json` has it, no `preset` fields; `$T/p1` unchanged (`git -C $T/p1 diff` empty against before). |
| P5 | `c "/dev-container change the description of preset api"` | Only `$T/ds/presets/api.json` changes; `$T/p1` unchanged; nothing committed in either. |

Clean up: remove the started containers and their volumes, `git worktree remove --force $T/ds`, then `rm -rf $T`.
