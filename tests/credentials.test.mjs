// Host-credential isolation acceptance (SC-03, SC-19, git identity). Uses fake
// host values only; the Template passes them through remoteEnv.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { run, buildImage, startTemplateRegistry, createProject, up, exec, removeProject } from './lib.mjs';

const FAKE_PAT = 'github_pat_FAKE0000000000';
Object.assign(process.env, {
  DEV_SETUP_GITHUB_PAT: FAKE_PAT,
  GIT_AUTHOR_NAME: 'Test Person',
  GIT_AUTHOR_EMAIL: 'test.person@example.com',
});

let registry;
const projects = [];
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

let a;
before(() => {
  buildImage();
  registry = startTemplateRegistry();
  a = newProject();
});
after(() => {
  for (const p of projects) removeProject(p.dir, p.containerId);
  registry?.stop();
});

const listen = (path) => `(nohup node -e "require('net').createServer().listen('${path}'); setTimeout(()=>{}, 60000)" >/dev/null 2>&1 &)`;

test('SC-03: simulated VS Code bridges are scrubbed; no ssh agent, no leftover sockets', () => {
  const env =
    'SSH_AUTH_SOCK=/tmp/vscode-ssh-auth-x.sock VSCODE_IPC_HOOK_CLI=/tmp/vscode-ipc-y.sock VSCODE_GIT_IPC_HANDLE=/tmp/vscode-git-z.sock GIT_ASKPASS=/x/askpass.sh VSCODE_GIT_ASKPASS_NODE=/x VSCODE_GIT_ASKPASS_MAIN=/y BROWSER=/x/browser.sh';
  for (const shell of ['bash -ic', 'bash -lc']) {
    const out = ok(a, `${env} ${shell} 'echo "[$SSH_AUTH_SOCK$VSCODE_IPC_HOOK_CLI$VSCODE_GIT_IPC_HANDLE$GIT_ASKPASS$VSCODE_GIT_ASKPASS_NODE$VSCODE_GIT_ASKPASS_MAIN$BROWSER]"' 2>/dev/null`);
    assert.equal(out.trim(), '[]', shell);
  }
  // Sockets left on disk are removed by the image's postStartCommand.
  ok(a, `${listen('/tmp/vscode-ssh-auth-x.sock')}; ${listen('/tmp/vscode-ipc-y.sock')}; sleep 2; test -S /tmp/vscode-ipc-y.sock`);
  const labels = JSON.parse(run('docker', ['inspect', a.containerId, '--format', '{{json .Config.Labels}}']).out);
  const post = JSON.parse(labels['devcontainer.metadata']).map((m) => m.postStartCommand).find(Boolean);
  assert.ok(post, 'image metadata has a postStartCommand');
  ok(a, post);
  assert.equal(ok(a, 'ls /tmp/vscode-*.sock 2>/dev/null | wc -l').trim(), '0');
  // No agent is usable.
  assert.notEqual(sh(a, 'SSH_AUTH_SOCK=/tmp/vscode-ssh-auth-x.sock ssh-add -l').code, 0);
  assert.equal(ok(a, 'echo "[$SSH_AUTH_SOCK]"').trim(), '[]');
});

test('SC-03: host ~/.ssh, ~/.npmrc, ~/.aws, home and Docker socket are absent', () => {
  assert.equal(ok(a, 'ls -d ~/.ssh ~/.npmrc ~/.aws ~/.gitconfig /var/run/docker.sock /run/docker.sock 2>/dev/null | wc -l').trim(), '0');
  const mounts = JSON.parse(run('docker', ['inspect', a.containerId, '--format', '{{json .Mounts}}']).out);
  for (const m of mounts) {
    assert.ok(m.Destination.startsWith('/workspace') || ['/home/node/.claude', '/home/node/.codex'].includes(m.Destination), m.Destination);
    assert.notEqual(m.Source, process.env.HOME);
    assert.ok(!m.Source.startsWith(`${process.env.HOME}/.ssh`));
  }
});

test('SC-03: only the image credential helper is configured, from a read-only config', () => {
  const lines = ok(a, 'git config --show-origin --get-all credential.helper').trim().split('\n');
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.match(lines[0], /^file:\/etc\/dev-setup\/gitconfig\s+\/usr\/local\/bin\/git-credential-dev-setup$/);
  assert.notEqual(sh(a, 'git config --global credential.helper evil').code, 0);
  assert.notEqual(sh(a, 'test -w /etc/dev-setup/gitconfig').code, 0);
});

const helper = '/usr/local/bin/git-credential-dev-setup';
const ask = (p, host, { proto = 'https', env = '' } = {}) =>
  sh(p, `printf 'protocol=${proto}\\nhost=${host}\\n\\n' | ${env} ${helper} get`).out;

test('SC-19: helper returns the PAT for github.com only, and nothing without a PAT', () => {
  assert.equal(ask(a, 'github.com'), `username=x-access-token\npassword=${FAKE_PAT}\n`);
  for (const h of ['gitlab.com', 'github.com.evil.example', 'api.github.com']) assert.equal(ask(a, h), '', h);
  assert.equal(ask(a, 'github.com', { proto: 'http' }), '');
  assert.equal(ask(a, 'github.com', { env: 'DEV_SETUP_GITHUB_PAT=' }), '');
  // git itself reaches the helper.
  assert.match(ok(a, "printf 'protocol=https\\nhost=github.com\\n\\n' | git credential fill"), new RegExp(`password=${FAKE_PAT}`));

  // A container started without the host PAT variable has no GitHub credentials.
  delete process.env.DEV_SETUP_GITHUB_PAT;
  let b;
  try {
    // exec re-resolves remoteEnv from the host env, so keep it unset while probing.
    b = newProject();
    assert.equal(ok(b, 'echo "[$DEV_SETUP_GITHUB_PAT]"').trim(), '[]');
    assert.equal(ask(b, 'github.com'), '');
    const fill = sh(b, "printf 'protocol=https\\nhost=github.com\\n\\n' | GIT_TERMINAL_PROMPT=0 git credential fill 2>&1");
    assert.doesNotMatch(fill.out, /password=/);
  } finally {
    process.env.DEV_SETUP_GITHUB_PAT = FAKE_PAT;
  }
});

test('git commits use the identity from host env vars', () => {
  ok(a, 'cd /tmp && rm -rf idrepo && git init -q idrepo && cd idrepo && git commit -q --allow-empty -m x');
  assert.equal(ok(a, 'cd /tmp/idrepo && git log -1 --format=%an,%ae,%cn,%ce'), 'Test Person,test.person@example.com,Test Person,test.person@example.com\n');
});
