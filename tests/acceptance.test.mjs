// Container acceptance suite for the Node Variant: SC-01, SC-06 (privilege),
// SC-09, SC-10, SC-11, SC-12, SC-18. Builds the image locally, applies the
// Template from a local registry, starts it with the devcontainer CLI and
// probes it as `node`. Needs Docker and network access for npx.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, IMAGE, run, pins, buildImage, startTemplateRegistry, createProject, up, exec, removeProject } from './lib.mjs';

let registry;
const projects = []; // { dir, containerId }
const pin = pins();

function newProject() {
  const dir = createProject(registry.templateId);
  const p = { dir, containerId: null };
  projects.push(p);
  p.containerId = up(dir).containerId;
  return p;
}
const sh = (p, script, opts) => exec(p.dir, script, opts);
const ok = (p, script) => {
  const r = sh(p, script);
  assert.equal(r.code, 0, `${script}\n${r.out}\n${r.err}`);
  return r.out;
};

let a; // main project
before(() => {
  buildImage();
  registry = startTemplateRegistry();
  a = newProject();
});
after(() => {
  for (const p of projects) removeProject(p.dir, p.containerId);
  registry?.stop();
});

test('SC-01: Template applied to a fresh git folder yields a running container on the project', () => {
  assert.equal(run('docker', ['inspect', a.containerId, '--format', '{{.State.Running}}']).out.trim(), 'true');
  assert.equal(ok(a, 'whoami').trim(), 'node');
  assert.equal(ok(a, 'pwd').trim(), '/workspace');
  ok(a, 'test -d /workspace/.git');
  const cfg = JSON.parse(readFileSync(join(a.dir, '.devcontainer/devcontainer.json'), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  assert.equal(cfg.image, IMAGE);
});

test('SC-06 (privilege): node has no sudo, no capabilities, no setuid path to root', () => {
  assert.notEqual(sh(a, 'command -v sudo').code, 0);
  assert.notEqual(sh(a, 'sudo -n true').code, 0);
  const status = ok(a, 'cat /proc/self/status');
  assert.match(status, /^CapEff:\s+0+$/m);
  assert.match(status, /^CapBnd:\s+0+$/m);
  assert.match(status, /^NoNewPrivs:\s+1$/m);
  assert.equal(ok(a, 'find / -xdev -type f \\( -perm -4000 -o -perm -2000 \\) 2>/dev/null; true').trim(), '');
  assert.notEqual(sh(a, 'su root -c id < /dev/null').code, 0);
  const hc = JSON.parse(run('docker', ['inspect', a.containerId, '--format', '{{json .HostConfig}}']).out);
  assert.equal(hc.Privileged, false);
  assert.deepEqual(hc.CapDrop, ['ALL']);
  assert.ok(!(hc.CapAdd ?? []).length);
  assert.ok(!hc.Binds?.some((b) => b.includes('docker.sock')));
});

test('SC-09: Agents are at the pinned versions with auto-update off', () => {
  assert.equal(ok(a, 'claude --version').trim(), `${pin.claude} (Claude Code)`);
  assert.equal(ok(a, 'codex --version').trim(), `codex-cli ${pin.codex}`);
  assert.equal(ok(a, 'echo $DISABLE_AUTOUPDATER').trim(), '1');
  assert.match(ok(a, 'cat /etc/claude-code/managed-settings.json'), /"DISABLE_AUTOUPDATER": "1"/);
  assert.match(ok(a, 'cat /etc/codex/config.toml'), /check_for_update_on_startup = false/);
  assert.notEqual(sh(a, 'test -w /etc/claude-code/managed-settings.json || test -w /etc/codex/config.toml').code, 0);
});

const claudeMode = (p, bin) =>
  JSON.parse(
    ok(p, `cd /tmp && ANTHROPIC_API_KEY=sk-fake timeout 60 ${bin} -p hi --output-format stream-json --verbose 2>/dev/null | grep '"subtype":"init"'`).trim().split('\n')[0],
  ).permissionMode;
const codexDoctor = (p, flags) => {
  const d = JSON.parse(ok(p, `codex ${flags} doctor --json 2>/dev/null; true`));
  const det = d.checks['sandbox.helpers'].details;
  return { approval: det['approval policy'], fs: det['filesystem sandbox'] };
};

test('SC-11: plain agents start in normal modes, *-yolo in full autonomy', () => {
  assert.equal(claudeMode(a, 'claude'), 'default');
  assert.equal(claudeMode(a, 'claude-yolo'), 'bypassPermissions');
  assert.deepEqual(codexDoctor(a, ''), { approval: 'OnRequest', fs: 'unrestricted' });
  assert.equal(codexDoctor(a, '--dangerously-bypass-approvals-and-sandbox').approval, 'Never');
  // The wrappers must pass exactly the full-autonomy flags (stub agents record argv).
  ok(a, `mkdir -p /tmp/stub && printf '#!/bin/sh\\necho "$0 $@"\\n' > /tmp/stub/claude && cp /tmp/stub/claude /tmp/stub/codex && chmod +x /tmp/stub/*`);
  assert.match(ok(a, 'PATH=/tmp/stub:$PATH claude-yolo x'), /claude --dangerously-skip-permissions x/);
  assert.match(ok(a, 'PATH=/tmp/stub:$PATH codex-yolo x'), /codex --dangerously-bypass-approvals-and-sandbox x/);
});

test('SC-12: Codex runs a shell command with no sandbox errors and no extra privileges', () => {
  const server = readFileSync(join(REPO, 'tests/fixtures/codex-mock-server.mjs'), 'utf8');
  const put = sh(a, 'cat > /tmp/mock.mjs', { input: server });
  assert.equal(put.code, 0, put.err);
  const r = sh(
    a,
    `cd /tmp && rm -f codex-ran.txt && (node mock.mjs 'id -u > /tmp/codex-ran.txt; grep CapEff /proc/self/status >> /tmp/codex-ran.txt' >/dev/null 2>&1 &) && sleep 1 &&
     timeout 90 codex exec --skip-git-repo-check -c model_provider=mock -c 'model_providers.mock={name="mock",base_url="http://127.0.0.1:18080",wire_api="responses",requires_openai_auth=false}' go 2>&1`,
  );
  assert.equal(r.code, 0, r.out + r.err);
  assert.doesNotMatch(r.out + r.err, /bwrap|namespace|landlock|sandbox.*(error|fail)/i);
  assert.match(r.out, /sandbox: danger-full-access/);
  const ran = ok(a, 'cat /tmp/codex-ran.txt');
  assert.match(ran, /^1000$/m);
  assert.match(ran, /CapEff:\s+0+$/m);
});

test('SC-18: .git/hooks, .git/config, .devcontainer/ and .vscode/ are read-only; source edits and commits work', () => {
  for (const w of [
    'touch /workspace/.git/hooks/pre-commit',
    'echo x >> /workspace/.git/config',
    'touch /workspace/.devcontainer/evil',
    'echo x >> /workspace/.devcontainer/devcontainer.json',
    'touch /workspace/.vscode/tasks.json',
  ]) {
    assert.notEqual(sh(a, w).code, 0, `should be read-only: ${w}`);
  }
  assert.deepEqual(run("ls", [join(a.dir, ".git/hooks")]).out.split("\n").filter((f) => f && !f.endsWith(".sample")), [], 'host hooks dir untouched');
  ok(a, 'echo "console.log(1)" > /workspace/index.js && git add index.js && git -c user.name=t -c user.email=t@example.com commit -qm init && git log --oneline | wc -l');
  assert.ok(existsSync(join(a.dir, 'index.js')));
});

test('SC-10: login volumes persist across a rebuild and are separate per project', () => {
  ok(a, 'echo marker-a > ~/.claude/marker && echo marker-a > ~/.codex/marker');
  const rebuilt = up(a.dir, ['--remove-existing-container']);
  assert.notEqual(rebuilt.containerId, a.containerId);
  a.containerId = rebuilt.containerId;
  assert.equal(ok(a, 'cat ~/.claude/marker ~/.codex/marker').trim(), 'marker-a\nmarker-a');
  assert.equal(ok(a, 'stat -c %U ~/.claude ~/.codex').trim(), 'node\nnode');

  const b = newProject();
  assert.equal(ok(b, 'find ~/.claude ~/.codex -mindepth 1 | wc -l').trim(), '0');
});
