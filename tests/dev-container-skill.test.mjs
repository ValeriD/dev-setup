// dev-container skill helper against a real container (SC-01, SC-02, SC-03
// helper parts): the image is pushed to a throwaway local registry, its digest
// read back, the Template rendered from this checkout, validated, started with
// `devcontainer up`, and the first lockfile created inside the container. The
// migration test replaces an old dev container in an npm fixture project and
// converts its lockfile against a registry stub on container loopback.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO, IMAGE, run, pins, buildImage, startTemplateRegistry, containerFor, exec, removeProject } from './lib.mjs';

const HELPER = join(REPO, 'skills/dev-container/scripts/dev-container.mjs');
const cfg = mkdtempSync(join(tmpdir(), 'dc-skill-cfg-')); // empty Claude config: no skill link to check
let registry, pushed, dir, legacy;

function h(...args) {
  const r = spawnSync('node', [HELPER, ...args], { encoding: 'utf8', env: { ...process.env, CLAUDE_CONFIG_DIR: cfg } });
  assert.equal(r.status, 0, `${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(r.stdout);
}

function hFails(...args) {
  const r = spawnSync('node', [HELPER, ...args], { encoding: 'utf8', env: { ...process.env, CLAUDE_CONFIG_DIR: cfg } });
  assert.equal(r.status, 1, `${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(r.stdout);
}

before(() => {
  buildImage();
  registry = startTemplateRegistry();
  pushed = `${registry.templateId.split('/')[0]}/dev-setup/node:skill-test`;
  assert.equal(run('docker', ['tag', IMAGE, pushed]).code, 0);
  const p = run('docker', ['push', '-q', pushed]);
  assert.equal(p.code, 0, p.err);
  dir = mkdtempSync(join(tmpdir(), 'dev-setup-skill-'));
  run('git', ['init', '-q', '-b', 'main'], { cwd: dir });
});

after(() => {
  if (dir) removeProject(dir, containerFor(dir));
  if (legacy) removeProject(legacy, containerFor(legacy));
  if (pushed) run('docker', ['rmi', pushed]);
  registry?.stop();
  rmSync(cfg, { recursive: true, force: true });
});

test('render-template output validates, starts, and gets a first lockfile; nothing is committed', () => {
  const digest = h('image-digest', 'node', '--ref', pushed);
  assert.match(digest.image, /@sha256:[0-9a-f]{64}$/);
  assert.equal(digest.verified, false);

  h('render-template', 'node', dir, '--image', digest.image);
  assert.deepEqual(h('validate', dir).problems, []);

  const started = h('up', dir);
  assert.ok(started.containerId);
  const who = exec(dir, 'id -un');
  assert.equal(who.out.trim(), 'node', who.err);

  const lock = h('first-lockfile', dir);
  assert.equal(lock.createdPackageJson, true);
  assert.ok(existsSync(join(dir, 'pnpm-lock.yaml')));
  assert.ok(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')));
  assert.equal(exec(dir, 'pnpm install').code, 0, 'the frozen install now succeeds');

  assert.notEqual(run('git', ['rev-parse', '--verify', 'HEAD'], { cwd: dir }).code, 0, 'no commits were made');
});

test('migrate: an npm project with its own dev container moves to the Template on a branch, pnpm lockfile made in the container', () => {
  legacy = mkdtempSync(join(tmpdir(), 'dev-setup-legacy-'));
  const git = (...a) => {
    const r = run('git', a, { cwd: legacy });
    assert.equal(r.code, 0, r.err);
    return r.out.trim();
  };
  const files = {
    '.devcontainer/devcontainer.json': '{ "build": { "dockerfile": "Dockerfile" } }\n',
    '.devcontainer/Dockerfile': 'FROM node:24\n',
    '.npmrc': 'registry=http://127.0.0.1:4873/\n',
    'package.json': JSON.stringify({ name: 'legacy', version: '1.0.0', dependencies: { scripty: '^1.0.0', plain: '^1.0.0' } }, null, 2) + '\n',
  };
  mkdirSync(join(legacy, '.devcontainer'));
  for (const [f, text] of Object.entries(files)) writeFileSync(join(legacy, f), text);
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'npm project');

  // What the skill does on the host: the branch, then the Template over the old dev container.
  git('switch', '-q', '-c', 'chore/dev-container');
  const image = h('image-digest', 'node', '--ref', pushed).image;
  const rendered = h('render-template', 'node', legacy, '--image', image, '--replace');
  assert.deepEqual(rendered.replaced.sort(), ['.devcontainer/Dockerfile', '.devcontainer/devcontainer.json']);
  assert.deepEqual(h('validate', legacy).problems, []);
  h('up', legacy, '--recreate');

  // Fixture: a registry stub on container loopback and the project's npm lockfile, made with npm in the container.
  const stub = readFileSync(join(REPO, 'tests/fixtures/registry-stub.mjs'), 'utf8');
  assert.equal(exec(legacy, 'cat > /tmp/registry-stub.mjs', { input: stub }).code, 0);
  const spec = { scripty: { '1.0.0': { ageDays: 30, scripts: { postinstall: 'echo built > built.txt' } } }, plain: { '1.0.0': { ageDays: 30 } } };
  const started = exec(legacy, `STUB_SPEC='${JSON.stringify(spec)}' nohup node /tmp/registry-stub.mjs 4873 >/tmp/stub.log 2>&1 & echo $! > /tmp/stub.pid
    for i in $(seq 50); do node -e "fetch('http://127.0.0.1:4873/plain').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" && exit 0; sleep 0.2; done; cat /tmp/stub.log; exit 1`);
  assert.equal(started.code, 0, started.out + started.err);
  const npm = exec(legacy, 'npm install --package-lock-only');
  assert.equal(npm.code, 0, npm.out + npm.err);

  // A failed import (registry gone) leaves package.json and the npm lockfile as they were.
  const before = readFileSync(join(legacy, 'package.json'), 'utf8');
  assert.equal(exec(legacy, 'kill $(cat /tmp/stub.pid)').code, 0);
  hFails('import-lockfile', legacy);
  assert.equal(readFileSync(join(legacy, 'package.json'), 'utf8'), before);
  assert.ok(existsSync(join(legacy, 'package-lock.json')) && !existsSync(join(legacy, 'pnpm-lock.yaml')));
  const restarted = exec(legacy, `STUB_SPEC='${JSON.stringify(spec)}' nohup node /tmp/registry-stub.mjs 4873 >/tmp/stub.log 2>&1 &
    for i in $(seq 50); do node -e "fetch('http://127.0.0.1:4873/plain').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" && exit 0; sleep 0.2; done; exit 1`);
  assert.equal(restarted.code, 0, restarted.out + restarted.err);

  const imported = h('import-lockfile', legacy);
  assert.deepEqual(imported.imported, ['package-lock.json']);
  assert.equal(imported.packageManager, `pnpm@${pins().pnpm}`);
  assert.ok(existsSync(join(legacy, 'pnpm-lock.yaml')));
  assert.ok(!existsSync(join(legacy, 'package-lock.json')), 'the converted npm lockfile is removed');
  assert.equal(JSON.parse(readFileSync(join(legacy, 'package.json'), 'utf8')).packageManager, `pnpm@${pins().pnpm}`);

  const installed = h('frozen-install', legacy);
  assert.deepEqual(installed.blockedBuilds, [{ name: 'scripty', version: '1.0.0' }]);
  assert.equal(exec(legacy, 'test -d node_modules/plain && test ! -e node_modules/scripty/built.txt').code, 0);

  assert.equal(git('branch', '--show-current'), 'chore/dev-container');
  assert.equal(git('rev-list', '--all', '--count'), '1', 'the branch is the only git write');
});
