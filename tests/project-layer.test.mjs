// Container acceptance for the Consuming Project layer installed at container
// start: SC-05 (project egress domain) and the project add/remove part of SC-13
// (skills). The fixture skill repo is a local bare repository mounted into the
// container and selected with DEV_SETUP_GIT_BASE, so no network is needed for
// the fetch itself. example.com plays the project-only egress domain.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, buildImage, startTemplateRegistry, createProject, up, tryUp, containerFor, exec, removeProject } from './lib.mjs';

const root = mkdtempSync(join(tmpdir(), 'dev-setup-proj-layer-'));
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8' }).trim();
let registry;
let sha;
const projects = [];

before(() => {
  buildImage();
  registry = startTemplateRegistry();
  const work = join(root, 'work');
  mkdirSync(join(work, 'skills/proj-hello'), { recursive: true });
  writeFileSync(join(work, 'skills/proj-hello/SKILL.md'), '---\nname: proj-hello\ndescription: Project fixture skill.\n---\nHi.\n');
  git(work, 'init', '-q', '-b', 'main');
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'x');
  sha = git(work, 'rev-parse', 'HEAD');
  mkdirSync(join(root, 'git/acme'), { recursive: true });
  git(root, 'clone', '-q', '--bare', work, join(root, 'git/acme/skills.git'));
});
after(() => {
  for (const p of projects) removeProject(p.dir, p.containerId);
  registry?.stop();
  rmSync(root, { recursive: true, force: true });
});

/** A project whose container can see the fixture repo and fetch from it. */
function newProject() {
  const dir = createProject(registry.templateId);
  const p = { dir, containerId: null };
  projects.push(p);
  const cfgPath = join(dir, '.devcontainer/devcontainer.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  cfg.mounts.push(`source=${join(root, 'git')},target=/fixtures,type=bind,readonly`);
  // The bind-mounted fixture is owned by the host user, which git would call dubious.
  // The bind-mounted fixture is owned by the host user, which git calls dubious for root.
  writeFileSync(join(root, 'git/gitconfig'), '[safe]\n\tdirectory = *\n');
  cfg.containerEnv = { DEV_SETUP_GIT_BASE: '/fixtures', GIT_CONFIG_GLOBAL: '/fixtures/gitconfig' };
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  return p;
}
const setManifest = (p, manifest) => writeFileSync(join(p.dir, '.devcontainer/extensions.json'), JSON.stringify(manifest));
const manifestHash = (p) => `sha256:${createHash('sha256').update(readFileSync(join(p.dir, '.devcontainer/extensions.json'))).digest('hex')}`;
const skillEntry = (s = sha) => ({ kind: 'skill', agents: ['claude', 'codex'], source: { github: 'acme/skills', path: 'skills/proj-hello', sha: s } });
const sh = (p, script, opts) => exec(p.dir, script, opts);
const reachable = (p) =>
  sh(p, 'node -', {
    input: "require('https').get({host:'example.com',path:'/',timeout:10000},r=>{console.log('HTTP',r.statusCode);r.resume()}).on('error',()=>process.exit(1)).on('timeout',()=>process.exit(1))",
  }).code === 0;
const skillPaths = '/etc/claude-code/.claude/skills/proj-hello /etc/codex/skills/proj-hello';

test('SC-05, SC-13: a project skill and egress domain appear on recreate, are read-only, and vanish when the entry is removed', () => {
  const p = newProject();
  setManifest(p, { extensions: [skillEntry()], egress: ['example.com'] });
  p.containerId = up(p.dir).containerId;

  assert.equal(sh(p, `cat ${skillPaths.split(' ').map((d) => d + '/SKILL.md').join(' ')}`).code, 0, 'skill installed for both Agents');
  assert.equal(sh(p, 'ls /home/node/.claude/skills /home/node/.codex/skills /home/node/.agents 2>/dev/null | grep proj-hello').code, 1, 'nothing in login volumes or ~/.agents');
  for (const w of [`touch ${skillPaths.split(' ')[0]}/x`, `echo x >> ${skillPaths.split(' ')[1]}/SKILL.md`, 'rm -rf /etc/claude-code/.claude/skills/proj-hello', 'echo x >> /usr/local/share/egress/allowlist.txt']) {
    assert.notEqual(sh(p, w).code, 0, `should not be writable: ${w}`);
  }
  assert.equal(sh(p, `stat -c %U ${skillPaths}`).out.trim(), 'root\nroot');
  assert.ok(reachable(p), 'project egress domain reachable');
  assert.equal(sh(p, 'cat /run/dev-setup/applied-manifest').out.trim(), manifestHash(p), 'the start-up step records the applied manifest hash');

  // Remove the entry and recreate: no leftovers, domain blocked again.
  setManifest(p, { extensions: [] });
  p.containerId = up(p.dir, ['--remove-existing-container']).containerId;
  assert.notEqual(sh(p, `ls ${skillPaths}`).code, 0, 'skill removed');
  assert.ok(!reachable(p), 'domain blocked again');
  assert.equal(sh(p, 'cat /run/dev-setup/applied-manifest').out.trim(), manifestHash(p), 'the hash follows the recreate');
  assert.notEqual(sh(p, 'echo x > /run/dev-setup/applied-manifest').code, 0, 'node cannot rewrite the applied hash');
});

test('an invalid project manifest makes `up` fail, naming the entry, and the container does not run open', () => {
  const p = newProject();
  setManifest(p, { extensions: [skillEntry('main')], egress: ['example.com'] });
  const r = tryUp(p.dir);
  assert.notEqual(r.code, 0, 'devcontainer up must fail');
  assert.match(r.out + r.err, /extensions\.json.*extensions\[0\].*skill "acme\/skills\/skills\/proj-hello".*not a full 40-character commit SHA/s);
  p.containerId = containerFor(p.dir);
  assert.ok(p.containerId, 'container exists');
  let running = 'true';
  for (let i = 0; i < 30 && running === 'true'; i++) {
    running = run('docker', ['inspect', p.containerId, '--format', '{{.State.Running}}']).out.trim();
    if (running === 'true') run('sleep', ['1']);
  }
  assert.equal(running, 'false', 'container stopped instead of running with open egress');
});
