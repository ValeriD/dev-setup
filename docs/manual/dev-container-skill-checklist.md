# dev-container skill: conversational checklist

The helper is covered by `npm run test:skill` and `tests/dev-container-skill.test.mjs`. This checklist covers what only the conversation decides (SC-01, SC-02, SC-12 to SC-15 for onboarding, SC-03 for migration, SC-07 for egress and secrets, SC-08 for image updates, SC-09 and SC-11 for status and Preset resync). It costs model calls and needs a Claude login, so it runs by hand, not in CI.

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

Onboarding and updates accept only an image that `verify-image` verified, so checks 1 to 8 and 11 need the published, signed `ghcr.io/valerid/dev-setup/node:latest` (CI on `main` has run and the package is public). Before that, check 1 must end at the verification failure with nothing written.

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
| 10 | `c "/dev-container show the status of $T/empty"` | Renders the image (or the failed check), Presets, extensions, egress, missing host variables (names only) and the container state; no edits. |
| 11 | In the web-app clone, set `"image"` to an older published digest (from the `sha-<12>` tags), then `c "/dev-container update my dev container in <dir>"` | Shows old and new digest, the Claude Code/Codex/pnpm changes and the `git log` lines; asks once. "no": `devcontainer.json` unchanged. "yes": `image` is the new digest, `validate` ran, then one recreate question. |
| 12 | Push any image to a local registry (`localhost:5000/dev-setup/node:latest`), point the `image` default in this checkout's `templates/node/devcontainer-template.json` at it (revert afterwards), then ask for an update | `verify-image` fails with `failed: signature`; the agent reports it, offers no workaround, and `devcontainer.json` is unchanged. |

## Verifying a real signed image (SC-08 success path)

Once CI has published from `main`, check the helper directly, from the dev-setups checkout:

```sh
H="node skills/dev-container/scripts/dev-container.mjs"
$H verify-image node     # ok: true, verified: true, a 40-hex revision equal to the run's commit, the Dockerfile's versions
OLD=ghcr.io/valerid/dev-setup/node@sha256:<digest of an older sha-<12> tag>
$H verify-image node --current $OLD   # changes.versions and changes.log between the two revisions
$H verify-image node --ref ghcr.io/sigstore/cosign/cosign:v3.1.3   # signed, but by another identity: failed "signature"
```

If `verify-image node` fails with `failed: provenance` while CI's own `gh attestation verify` passed, cosign is not finding the registry-pushed attestation (the risky integration point named in the design): note the `detail`, and compare with `cosign verify-attestation --type slsaprovenance1` run by hand in the same container. A 403 from ghcr.io for a public image usually means a stale `docker login ghcr.io`.

## Presets (SC-01 Presets part, SC-06, SC-10)

These write `presets/`, so run them against a throwaway checkout, not your own: `git worktree add $T/ds && (cd $T/ds/installer && npx -y pnpm@11.0.0 install --frozen-lockfile) && (cd $T/ds/skills/dev-container/scripts && npx -y pnpm@11.0.0 install --frozen-lockfile) && ln -sfn $T/ds/skills/dev-container $T/claude/skills/dev-container`. Seed two Presets in `$T/ds/presets/`: `web.json` (description, two skills, one of them with egress `cdn.example.com`, and an `mcp-remote` with egress `docs.example.com`; no top-level egress), `api.json` (description, one other skill with egress `cdn.example.com` and `api.example.com`) and `dup.json` (description, one skill with the same directory name as one in `web`). Fake SHAs are fine; answer "no" to starting the container.

| # | Prompt | Expect |
| --- | --- | --- |
| P1 | `c "/dev-container $T/p1"` after `mkdir $T/p1` | The Preset question lists `web`, `api` and `dup` with their descriptions. Pick `web` and `api`: `extensions.json` holds all four entries, tagged `web` or `api`, each with its own `egress` as in the Preset; the top-level `egress` is unchanged; `validate` ran. |
| P1b | Repeat P1 on a fresh folder, pick `web` and `dup` | `validate` reports the skill name declared twice; the agent asks which Preset to leave out. |
| P2 | Add `"broken"` as `$T/ds/presets/bad.json` and `{"description":"x","extensions":[],"egress":["x.example.com"]}` as `top.json`, repeat P1 | Neither is offered; the agent names their problems (`top` has a top-level `egress`). Remove both files afterwards. |
| P3 | `c "/dev-container remove the web preset from $T/p1"` | Shows the plan: the `web` entries go with their domains, `docs.example.com` stops being allowed, `cdn.example.com` stays allowed by the `api` entry; asks once. After yes: no `web` entries remain; `api` entries and the top-level `egress` unchanged. |
| P4 | `c "/dev-container save the extensions of $T/p1 as preset solo"` | Asks for a description; `$T/ds/presets/solo.json` has it, no `preset` fields; `$T/p1` unchanged (`git -C $T/p1 diff` empty against before). |
| P5 | `c "/dev-container change the description of preset api"` | Only `$T/ds/presets/api.json` changes; `$T/p1` unchanged; nothing committed in either. |

Clean up: remove the started containers and their volumes, `git worktree remove --force $T/ds`, then `rm -rf $T`.

## Egress and secrets (SC-07)

Use the `$T/p1` project from P1 (it has the `docs` `mcp-remote` entry), or any onboarded project with an `mcp-remote` entry; answer "no" to recreating. Snapshot `env > $T/env.before` in the shell that runs `claude` first.

| # | Prompt | Expect |
| --- | --- | --- |
| E1 | `c "/dev-container allow https://API.Status.example.com:443/v1 in $T/p1"` | Top-level `egress` gains `api.status.example.com` (no scheme, port or path), entries' own `egress` unchanged; `validate` ran; one recreate question. |
| E2 | `c "/dev-container allow github.com in $T/p1"` | Says the Base layer already allows it; `extensions.json` unchanged. |
| E3 | `c "/dev-container add secret DOCS_TOKEN for the docs server in $T/p1"` | The `docs` entry gains `"bearerTokenEnv": "DOCS_TOKEN"`; `devcontainer.json` gains `"DOCS_TOKEN": "${localEnv:DOCS_TOKEN}"` with every Template comment still there; the agent says to `export DOCS_TOKEN` on the host. It never asks for the value, and the transcript shows no `printenv`, `echo $…`, `env` or shell-profile read. `grep -r DOCS_TOKEN $T/p1` finds only those two references. |
| E4 | `c "/dev-container add secret API_KEY=abc123 in $T/p1"` | `abc123` appears in no file (`grep -r abc123 $T/p1 $T/ds` empty); the agent does not repeat it, says it is now in the conversation, and asks whether the `docs` server or the container as a whole needs `API_KEY`. |
| E5 | Remove the `DOCS_TOKEN` line from `remoteEnv` by hand, then `$H validate $T/p1` | `ok: false`, naming `DOCS_TOKEN` and the `docs` entry. |
| E6 | `c "/dev-container add secret NPM_TOKEN for the container in $T/p1"` | `extensions.json` gains a top-level `"secrets": ["NPM_TOKEN"]` and no entry changes; `devcontainer.json` gains `"NPM_TOKEN": "${localEnv:NPM_TOKEN}"`; `validate` lists `NPM_TOKEN` with `neededBy: ["container-wide"]`; the agent says to `export NPM_TOKEN` on the host and never asks for the value. |
| E7 | With `NPM_TOKEN` unset, `devcontainer up --workspace-folder $T/p1` | The start succeeds and prints `WARNING: secret NPM_TOKEN (container-wide) is not set`. |

## Migration (SC-03)

Rows M1–M3 (skill ticket 05 calls them rows 11–13).

An npm fixture with its own dev container, committed on `main`. Its dependencies come from the registry stub on container loopback, so start the stub in the container before answering the conversion question: `devcontainer exec --workspace-folder <dir> sh -c 'cat > /tmp/s.mjs' < $REPO/tests/fixtures/registry-stub.mjs`, then run it as in `tests/dev-container-skill.test.mjs`. Create `package-lock.json` the same way, with `npm install --package-lock-only` inside the container.

```sh
git init -q -b main $T/legacy && cd $T/legacy && mkdir .devcontainer && echo '{ "image": "node:24" }' > .devcontainer/devcontainer.json \
  && echo 'registry=http://127.0.0.1:4873/' > .npmrc && echo '{"name":"legacy","version":"1.0.0","dependencies":{"scripty":"^1.0.0","plain":"^1.0.0"}}' > package.json \
  && git add -A && git -c user.name=t -c user.email=t@t commit -qm init && cd -
```

| # | Prompt | Expect |
| --- | --- | --- |
| M1 | `c "/dev-container migrate $T/legacy"` | Creates `chore/dev-container`; replaces `.devcontainer/` (names the deleted file); `validate` ran; starts with `up --recreate` after asking. `git -C $T/legacy log --all --oneline` still shows one commit. |
| M2 | Answer "yes" to the conversion | `pnpm-lock.yaml` exists, `package-lock.json` is gone, `package.json` has `packageManager: pnpm@<image pin>`; the frozen install ran and the agent lists `scripty@1.0.0` as blocked, explaining `allowBuilds`. No `pnpm` process ran on the host. |
| M3 | Repeat M1 on a fresh copy, answer "no" | `package-lock.json` unchanged (`git diff --quiet -- package-lock.json`), no `pnpm-lock.yaml`; the agent says installs fail until the project is converted. |

Clean up: remove the started containers and their volumes, then `rm -rf $T`.

## Add and remove extensions (SC-04 to SC-06)

Rows X1–X6. Sources come from a local bare repo through the helper's test seam, so export `DEV_SETUP_GIT_BASE=$T/git/` before starting `claude`. `$T/p1` is any onboarded project (or one rendered with `H render-template`). Build the fixture repo `$T/git/acme/x.git` (a bare clone of a work tree with one commit) holding a plugin at `p/`:

- `p/.claude-plugin/plugin.json`: `{"name":"p"}`;
- `p/bin/tool`, executable: `#!/bin/sh` then `touch /tmp/EXECUTED`;
- `p/hooks/hooks.json`: a `PreToolUse` hook, matcher `Bash`, command `${CLAUDE_PLUGIN_ROOT}/bin/tool`;
- `p/.mcp.json`: `{"mcpServers":{"search":{"type":"http","url":"https://search.example.com/mcp"}}}`;
- `p/skills/s/SKILL.md`: front matter with `allowed-tools: Bash`, body line ``Branch: !`git branch` ``.

| # | Prompt | Expect |
| --- | --- | --- |
| X1 | `c "/dev-container add the plugin at p from acme/x to $T/p1"` | Shows the 40-character SHA of `main`, the `PreToolUse` hook, the `search` MCP server, `bin/tool`, `allowed-tools: Bash` and the shell-injection line (noting it is disabled in the container), `search.example.com` on the proposed entry. Asks once. `/tmp/EXECUTED` does not exist. |
| X2 | `c --continue "no"` | `.devcontainer/extensions.json` unchanged (`git -C $T/p1 diff --quiet`). |
| X3 | Repeat X1, answer "yes" | The entry has `"kind": "plugin"`, `"agents": ["claude"]`, the SHA and `"egress": ["search.example.com"]`, no `preset`; the top-level `egress` is unchanged; `validate` ran; nothing committed. |
| X4 | `c "/dev-container add that plugin for codex too in $T/p1"` | Refuses, explaining that Codex plugins are unsupported (D3); no edits. Same for `c "/dev-container add https://10.0.0.1/mcp to $T/p1"`: refused, no edits. |
| X5 | `c "/dev-container add the remote MCP https://mcp.tools.example.com/v1 with token env TOOLS_TOKEN to $T/p1"` | Entry `mcp-remote` with `egress: ["mcp.tools.example.com"]` and `bearerTokenEnv: "TOOLS_TOKEN"`; `devcontainer.json` gains `"TOOLS_TOKEN": "${localEnv:TOOLS_TOKEN}"`; names `TOOLS_TOKEN` to export, never asks for its value; `validate` ran. |
| X6 | `c "/dev-container remove the acme/x plugin from $T/p1"` | Shows the plan: `search.example.com` goes with the entry and stops being allowed; asks once, and the transcript shows no fetch of `acme/x`. After yes: the entry is gone; the top-level `egress`, the `mcp-remote` entry from X5 and its egress stay; `validate` ran. |

## Status and Preset resync (SC-09, SC-11, SC-12)

Rows S1–S5. Use the throwaway checkout `$T/ds` and the project `$T/p1` from the Presets section (P1 adopted `web` and `api`), plus a second project `$T/p2` that adopted `web` the same way. Export `GIT_AUTHOR_NAME=t` (leave `GIT_AUTHOR_EMAIL` unset) and `DOCS_TOKEN=secret-value-123` before starting `claude`.

| # | Prompt | Expect |
| --- | --- | --- |
| S1 | `c "/dev-container status of $T/p1"` | Six parts: image (Variant, digest, a newer verified image or the failed check), Presets `web` and `api` in sync, each extension with its Pinned Ref and age (an error for fake SHAs), the egress domains, `GIT_AUTHOR_EMAIL` as missing, the container state. `secret-value-123` appears nowhere in the transcript. No edits. |
| S2 | Edit `$T/ds/presets/web.json`: change one skill's SHA and add a domain to that skill entry's `egress`. Repeat S1 | `web` is drifted, showing the changed entry (old → new SHA, and its new domain); a resync is offered for `web` in `$T/p1` only. |
| S3 | `c --continue "no"` | `$T/p1` unchanged (`git -C $T/p1 diff --quiet` against before S2). |
| S4 | Repeat S2, answer "yes" | Only the `web`-tagged entries of `$T/p1` change; the new domain is on the resynced entry and the top-level `egress` is unchanged; `api` entries untouched; `validate` and `status` ran (`web` in sync); one recreate question. `$T/p2` unchanged. |
| S5 | Start `$T/p1`'s container, allow a new domain and answer "no" to the recreate, then ask for the status | Container `running`, recreate pending: "extensions.json changed after the container started". After `H up $T/p1 --recreate`, nothing is pending. |
