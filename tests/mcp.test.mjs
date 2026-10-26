// Container acceptance for MCP servers and secrets (SC-17).
// 1. Installer in start mode against the loopback registry stub: a stdio server
//    is pre-installed under /opt/dev-setup/mcp and listed by both Agents, a
//    secret reaches its environment, and no value lands in an image layer or file.
// 2. The real start path (Template -> up): a remote server entry is listed, and
//    a named secret that is missing from the host env prints a warning at attach
//    naming its declarer, including a container-wide one with no MCP server.
// All secrets are fake.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, IMAGE, run, buildImage, startTemplateRegistry, createProject, tryUp, containerFor, exec, removeProject, projectDir, runLabelArgs } from './lib.mjs';

const FAKE = 'fake-secret-5f3a9c-do-not-use';
const SERVER = `
import { writeFileSync } from 'node:fs';
let buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  for (const line of buf.split('\\n').slice(0, -1)) {
    const m = JSON.parse(line);
    if (m.method === 'initialize') {
      writeFileSync('/tmp/fx-mcp-env', process.env.FX_TOKEN ?? '(unset)');
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: m.params.protocolVersion, capabilities: {}, serverInfo: { name: 'fx', version: '1.0.0' } } }) + '\\n');
    }
  }
  buf = buf.slice(buf.lastIndexOf('\\n') + 1);
});
`;
const REGISTRY_SPEC = {
  'fx-mcp': { '1.0.0': { ageDays: 30, bin: { 'fx-mcp': 'server.mjs' }, files: { 'server.mjs': `#!/usr/bin/env node${SERVER}` } } },
  'fresh-mcp': { '1.0.0': { ageDays: 1, bin: { 'fresh-mcp': 'server.mjs' }, files: { 'server.mjs': SERVER } } },
};
const stdio = { kind: 'mcp', agents: ['claude', 'codex'], name: 'fx', source: { npm: 'fx-mcp', version: '1.0.0' }, env: ['FX_TOKEN'] };
const remote = { kind: 'mcp-remote', agents: ['claude', 'codex'], name: 'docs', url: 'https://example.com/mcp', egress: ['example.com'], bearerTokenEnv: 'T09_DOCS_TOKEN' };

const root = projectDir('dev-setup-mcp-');
let cid;
let registry;
const projects = [];
const dx = (user, script) => run('docker', ['exec', '-u', user, '-e', 'pnpm_config_registry=http://127.0.0.1:4873/', cid, 'bash', '-c', script]);

before(() => {
  buildImage();
  writeFileSync(join(root, 'project.json'), JSON.stringify({ extensions: [stdio, remote], egress: [] }));
  writeFileSync(join(root, 'fresh.json'), JSON.stringify({ extensions: [{ ...stdio, name: 'fresh', source: { npm: 'fresh-mcp', version: '1.0.0' } }] }));
  cid = run('docker', ['run', '-d', '--rm', ...runLabelArgs(), '-u', 'root', '--entrypoint', 'sleep', '-v', `${REPO}/tests/fixtures:/fx:ro`, '-v', `${root}:/p:ro`, IMAGE, 'infinity']).out.trim();
  assert.ok(cid, 'container started');
  const r = run('docker', ['exec', '-u', 'node', '-e', `STUB_SPEC=${JSON.stringify(REGISTRY_SPEC)}`, cid, 'bash', '-c', `nohup node /fx/registry-stub.mjs 4873 >/tmp/stub.log 2>&1 &
    for i in $(seq 50); do node -e "fetch('http://127.0.0.1:4873/fx-mcp').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" && exit 0; sleep 0.2; done; cat /tmp/stub.log; exit 1`]);
  assert.equal(r.code, 0, r.err);
  registry = startTemplateRegistry();
});
after(() => {
  if (cid) run('docker', ['rm', '-f', cid]);
  for (const p of projects) removeProject(p.dir, p.containerId);
  registry?.stop();
  rmSync(root, { recursive: true, force: true });
});

const install = (file) =>
  dx('root', `node /opt/dev-setup/installer/src/cli.mjs install --mode start --manifest /opt/dev-setup/manifests/base.json --manifest /opt/dev-setup/manifests/node.json --project /p/${file} --egress-out /tmp/allow`);

test('SC-17: a stdio server is pre-installed, listed by both Agents and runs with the secret in its environment', () => {
  const i = install('project.json');
  assert.equal(i.code, 0, i.err);
  assert.ok(dx('root', 'grep -x example.com /tmp/allow').out, 'remote egress domain reaches the allowlist');

  const claude = dx('node', `cd /tmp && FX_TOKEN=${FAKE} T09_DOCS_TOKEN=${FAKE} claude mcp list 2>&1`);
  assert.match(claude.out, /fx: node \/opt\/dev-setup\/mcp\/fx\/node_modules\/fx-mcp\/server\.mjs/, 'Claude lists the stdio server at its pre-installed path');
  assert.match(claude.out, /docs: https:\/\/example\.com\/mcp/, 'Claude lists the remote server');
  assert.equal(dx('node', 'cat /tmp/fx-mcp-env').out, FAKE, 'the secret reached the server environment through Claude');

  const codex = dx('node', `FX_TOKEN=${FAKE} codex mcp list 2>&1`);
  assert.match(codex.out, /fx\s+node\s+\/opt\/dev-setup\/mcp\/fx\/node_modules\/fx-mcp\/server\.mjs\s+FX_TOKEN=\*+/, 'Codex lists the stdio server forwarding the named variable');
  assert.match(codex.out, /docs\s+https:\/\/example\.com\/mcp/, 'Codex lists the remote server');
  assert.match(dx('node', 'codex mcp get fx 2>&1').out, /sandbox|enabled: true/);
  assert.match(dx('node', 'grep -c "sandbox_mode" /etc/codex/config.toml').out, /1/, 'hand-written Codex defaults survive');

  // Nothing the dev user runs can change what the Agents are told to launch.
  assert.equal(dx('node', 'echo x >> /etc/claude-code/managed-mcp.json').code === 0, false);
  assert.equal(dx('node', 'echo x >> /opt/dev-setup/mcp/fx/node_modules/fx-mcp/server.mjs').code === 0, false);
  assert.equal(dx('node', 'echo x >> /etc/codex/config.toml').code === 0, false);
  assert.equal(dx('node', 'echo x >> /etc/dev-setup/secrets').code === 0, false);
});

test('SC-17: no secret value appears in image layers, rendered files or the repository', () => {
  const files = dx('root', `grep -r -l -- ${FAKE} /etc /opt/dev-setup /usr/local/share 2>/dev/null; echo done`);
  assert.equal(files.out.trim(), 'done', 'no rendered file holds the value');
  assert.ok(!run('docker', ['history', '--no-trunc', IMAGE]).out.includes(FAKE));
  assert.equal(run('git', ['grep', '-q', '-e', FAKE, '--', '.', ':!tests/mcp.test.mjs'], { cwd: REPO }).code, 1, 'repo grep finds nothing outside this test');
});

test('an MCP package inside the 7-day release cooldown is refused, naming the entry', () => {
  const i = install('fresh.json');
  assert.notEqual(i.code, 0);
  assert.match(i.err, /extensions\[0\] \(mcp "fresh"\).*cannot install fresh-mcp@1\.0\.0/);
});

test('SC-17: a named secret missing from the host env warns at attach, naming its declarer; a set one does not', () => {
  const WIDE = 'T08_WIDE_TOKEN';
  const warn = /WARNING: secret T09_DOCS_TOKEN \(MCP server "docs"\) is not set/;
  const wideWarn = /WARNING: secret T08_WIDE_TOKEN \(container-wide\) is not set/;
  const project = (manifest, withSecrets = []) => {
    const dir = createProject(registry.templateId);
    const p = { dir, containerId: null };
    projects.push(p);
    writeFileSync(join(dir, '.devcontainer/extensions.json'), JSON.stringify(manifest));
    const f = join(dir, '.devcontainer/devcontainer.json');
    const lines = withSecrets.map((n) => `\n    "${n}": "\${localEnv:${n}}",`).join('');
    writeFileSync(f, readFileSync(f, 'utf8').replace('"remoteEnv": {', `"remoteEnv": {${lines}`));
    return p;
  };
  const up = (p) => {
    const r = tryUp(p.dir);
    p.containerId = containerFor(p.dir);
    assert.equal(r.code, 0, r.err);
    return r.out + r.err;
  };

  delete process.env.T09_DOCS_TOKEN;
  delete process.env[WIDE];
  const missing = project({ extensions: [remote] });
  const out1 = up(missing);
  assert.match(out1, warn);
  const listed = exec(missing.dir, 'cd /tmp && claude mcp list 2>&1; codex mcp list 2>&1').out;
  assert.match(listed, /docs: https:\/\/example\.com\/mcp/);
  assert.match(listed, /docs\s+https:\/\/example\.com\/mcp/);

  // A container-wide secret with no MCP server anywhere: still listed and warned about.
  const wideOnly = up(project({ extensions: [], secrets: [WIDE] }));
  assert.match(wideOnly, wideWarn);
  assert.doesNotMatch(wideOnly, /T09_DOCS_TOKEN/);

  // Both set, and T09_DOCS_TOKEN declared by the MCP entry and container-wide: no warning.
  process.env.T09_DOCS_TOKEN = FAKE;
  process.env[WIDE] = FAKE;
  const given = project({ extensions: [remote], secrets: [WIDE, 'T09_DOCS_TOKEN'] }, ['T09_DOCS_TOKEN', WIDE]);
  const out2 = up(given);
  assert.doesNotMatch(out2, /WARNING: secret/);
  const seen = exec(given.dir, 'printenv T09_DOCS_TOKEN').out.trim();
  const wideSet = exec(given.dir, `test -n "$${WIDE}"`).code;
  delete process.env.T09_DOCS_TOKEN;
  delete process.env[WIDE];
  assert.equal(seen, FAKE, 'the secret reaches the container environment');
  assert.equal(wideSet, 0, 'the container-wide secret reaches it too');
});
