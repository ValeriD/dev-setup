// Container acceptance suite for the Node Variant: SC-01, SC-06 (privilege),
// SC-09, SC-10, SC-11, SC-12, SC-18. Builds the image locally, applies the
// Template from a local registry, starts it with the devcontainer CLI and
// probes it as `node`. Needs Docker and network access for npx.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, IMAGE, run, pins, buildImage, builtRevision, startTemplateRegistry, createProject, up, tryUp, containerFor, exec, removeProject } from './lib.mjs';
import { writeFileSync } from 'node:fs';
import { IMAGE_LABELS } from '../skills/dev-container/scripts/commands.mjs';

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
  // Bounding set keeps only what the root start-up step needed; no-new-privileges neutralises it for node.
  assert.match(status, /^CapBnd:\s+0*3004$/m);
  assert.match(status, /^CapPrm:\s+0+$/m);
  assert.match(status, /^NoNewPrivs:\s+1$/m);
  assert.equal(ok(a, 'find / -xdev -type f \\( -perm -4000 -o -perm -2000 \\) 2>/dev/null; true').trim(), '');
  assert.notEqual(sh(a, 'su root -c id < /dev/null').code, 0);
  const hc = JSON.parse(run('docker', ['inspect', a.containerId, '--format', '{{json .HostConfig}}']).out);
  assert.equal(hc.Privileged, false);
  assert.deepEqual(hc.CapDrop, ['ALL']);
  // Root's start-up step holds exactly these caps; node's CapEff is 0 (above).
  assert.deepEqual([...(hc.CapAdd ?? [])].sort(), ['CAP_DAC_READ_SEARCH', 'CAP_NET_ADMIN', 'CAP_NET_RAW']);
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

test('image labels carry the build revision and the pinned Agent and pnpm versions (read by verify-image)', () => {
  const labels = JSON.parse(run('docker', ['image', 'inspect', IMAGE, '--format', '{{json .Config.Labels}}']).out);
  assert.equal(labels[IMAGE_LABELS.claudeCode], pin.claude);
  assert.equal(labels[IMAGE_LABELS.codex], pin.codex);
  assert.equal(labels[IMAGE_LABELS.pnpm], pin.pnpm);
  const revision = labels[IMAGE_LABELS.revision];
  assert.match(revision ?? '', /^[0-9a-f]{40}$/);
  // CI builds with GITHUB_SHA; the suite's own build with the revision the run recorded at its start (a commit landing mid-run must not fail it).
  const want = process.env.GITHUB_SHA ?? (process.env.DEV_SETUP_TEST_SKIP_BUILD ? undefined : builtRevision());
  if (want) assert.equal(revision, want);
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
  ok(a, 'echo "console.log(1)" > /workspace/index.js && git add index.js && GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.com GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.com git commit -qm init && git log --oneline | wc -l');
  assert.ok(existsSync(join(a.dir, 'index.js')));
});

// Probes run as `node` through `node -` (the image has no curl or dig).
const probe = (p, code) => sh(p, 'node -', { input: code });
const fetchStatus = (host) => `
  require('https').get({host:${JSON.stringify(host)},path:'/',timeout:10000},r=>{console.log('HTTP',r.statusCode);r.resume()})
    .on('error',e=>{console.log('ERR',e.code);process.exit(1)}).on('timeout',()=>{console.log('ERR timeout');process.exit(1)});`;
const udpDns = (server) => `
  const s=require('dgram').createSocket('udp4');
  const q=Buffer.from('123401000001000000000000076578616d706c6503636f6d0000010001','hex');
  s.on('message',()=>{console.log('ANSWERED');process.exit(0)});
  s.on('error',e=>{console.log('ERR',e.code);process.exit(1)});
  s.send(q,53,${JSON.stringify(server)});
  setTimeout(()=>{console.log('NO REPLY');process.exit(1)},3000);`;

test('SC-04: only the Base Egress Allowlist is reachable; IPv6 and foreign DNS are blocked', () => {
  for (const host of ['registry.npmjs.org', 'api.github.com', 'api.anthropic.com', 'api.openai.com']) {
    const r = probe(a, fetchStatus(host));
    assert.equal(r.code, 0, `${host} should be reachable\n${r.out}${r.err}`);
  }
  // Login hosts for both Agents resolve through the allowlist.
  for (const host of ['claude.ai', 'platform.claude.com', 'auth.openai.com', 'chatgpt.com', 'update.code.visualstudio.com', 'marketplace.visualstudio.com']) {
    assert.equal(sh(a, `getent ahostsv4 ${host}`).code, 0, `${host} should resolve`);
  }
  assert.notEqual(probe(a, fetchStatus('example.com')).code, 0, 'example.com must fail');
  assert.notEqual(sh(a, 'getent hosts example.com').code, 0, 'non-allowlisted name must not resolve');
  assert.notEqual(probe(a, "const s=require('net').connect({host:'2606:4700:4700::1111',port:443,timeout:3000});s.on('connect',()=>{console.log('OPEN');process.exit(0)});s.on('error',()=>process.exit(1));s.on('timeout',()=>process.exit(1))").code, 0, 'IPv6 must fail');
  assert.notEqual(probe(a, "const s=require('net').connect({host:'1.1.1.1',port:443,timeout:3000});s.on('connect',()=>process.exit(0));s.on('error',()=>process.exit(1));s.on('timeout',()=>process.exit(1))").code, 0, 'direct IP must fail');
  const upstreams = ok(a, 'cat /run/egress/upstreams').trim().split('\n');
  for (const server of ['1.1.1.1', '127.0.0.11', ...upstreams]) {
    assert.notEqual(probe(a, udpDns(server)).code, 0, `DNS to ${server} must not be answered for node`);
  }
  assert.equal(probe(a, udpDns('127.0.0.1')).out.trim(), 'ANSWERED', 'local resolver answers (REFUSED counts)');
});

test('SC-06 (firewall): node cannot read or change the rules, nor signal or replace dnsmasq', () => {
  assert.notEqual(sh(a, 'nft list ruleset').code, 0);
  assert.notEqual(sh(a, 'nft flush ruleset').code, 0);
  assert.notEqual(sh(a, 'nft add rule inet egress output accept').code, 0);
  const pid = ok(a, "for p in /proc/[0-9]*; do grep -q '^Name:.dnsmasq' $p/status && basename $p; done; true").trim();
  assert.match(pid, /^\d+$/, 'dnsmasq runs');
  assert.equal(ok(a, `stat -c %U /proc/${pid}`).trim(), 'root');
  assert.notEqual(sh(a, `kill -9 ${pid}`).code, 0);
  assert.notEqual(sh(a, `kill -TERM ${pid}`).code, 0);
  assert.notEqual(sh(a, 'echo nameserver 1.1.1.1 > /etc/resolv.conf').code, 0);
  assert.notEqual(sh(a, 'test -w /usr/local/share/egress/allowlist.txt || test -w /run/egress/dnsmasq.conf || test -w /run/egress/ruleset.nft').code, 0);
  assert.equal(ok(a, "grep -c '^nameserver 127.0.0.1$' /etc/resolv.conf").trim(), '1');
});

test('fail closed: a broken allowlist stops the container instead of starting with open egress', () => {
  for (const [name, content] of [['invalid', 'registry.npmjs.org\nnot a domain!!\n'], ['empty', '# nothing\n']]) {
    const dir = createProject(registry.templateId);
    const p = { dir, containerId: null };
    projects.push(p);
    writeFileSync(join(dir, 'bad-allowlist.txt'), content);
    const cfgPath = join(dir, '.devcontainer/devcontainer.json');
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8').replace(/^\s*\/\/.*$/gm, ''));
    cfg.containerEnv = { EGRESS_ALLOWLIST: '/workspace/bad-allowlist.txt' };
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    tryUp(dir); // `up` may still report success: assert on the container itself
    p.containerId = containerFor(dir);
    assert.ok(p.containerId, `${name}: container exists`);
    let running = 'true';
    for (let i = 0; i < 30 && running === 'true'; i++) {
      running = run('docker', ['inspect', p.containerId, '--format', '{{.State.Running}}']).out.trim();
      if (running === 'true') run('sleep', ['1']);
    }
    assert.equal(running, 'false', `${name}: container must have stopped`);
    assert.notEqual(exec(dir, 'true').code, 0, `${name}: nothing can run in it`);
  }
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
