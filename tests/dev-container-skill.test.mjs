// dev-container skill helper against a real container (SC-01, SC-02, SC-03
// helper parts): the image is pushed to a throwaway local registry, its digest
// read back, the Template rendered from this checkout, validated, started with
// `devcontainer up`, and the first lockfile created inside the container. The
// migration test replaces an old dev container in an npm fixture project and
// converts its lockfile against a registry stub on container loopback.
// verify-image (SC-08 failure path) runs cosign against the same registry: an
// unsigned image and one signed by a foreign key both fail closed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { COSIGN_IMAGE } from '../skills/dev-container/scripts/commands.mjs';
import { REPO, IMAGE, run, pins, buildImage, startTemplateRegistry, containerFor, exec, removeProject, projectDir } from './lib.mjs';

const HELPER = join(REPO, 'skills/dev-container/scripts/dev-container.mjs');
const cfg = projectDir('dc-skill-cfg-'); // empty Claude config: no skill link to check
let registry, pushed, dir, legacy;

function helper(...args) {
  const r = spawnSync('node', [HELPER, ...args], { encoding: 'utf8', env: { ...process.env, CLAUDE_CONFIG_DIR: cfg } });
  return { code: r.status, doc: JSON.parse(r.stdout), log: `${args.join(' ')}\n${r.stdout}\n${r.stderr}` };
}
function h(...args) {
  const r = helper(...args);
  assert.equal(r.code, 0, r.log);
  return r.doc;
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
  dir = projectDir('dev-setup-skill-');
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

test('SC-11, SC-12: status finds the running container and reports a recreate pending once the config changed after it started', () => {
  const pending = () => h('status', dir, '--skip-image-check').container;
  const now = pending();
  assert.equal(now.found, true);
  assert.equal(now.state, 'running');
  assert.equal(now.appliedHash, now.manifestHash, 'the start-up step wrote the hash of the manifest it applied');
  assert.deepEqual(now.unknown, [], 'the derived image and the remoteEnv could be compared');
  assert.equal(now.pendingRecreate, false, JSON.stringify(now));

  // The Base and Variant layers come from the digest-pinned image the project runs, not this checkout.
  const full = h('status', dir, '--skip-image-check', '--domain', 'api.github.com');
  assert.deepEqual(full.layers.read, [{ layer: 'Base' }, { layer: 'Variant', variant: 'node' }], JSON.stringify(full.layers));
  assert.deepEqual(full.egress.check.allowedBy, [{ domain: 'github.com', layer: 'Base', neededBy: 'top-level egress' }]);

  // An agent-style edit, no recreate: the manifest now differs from what the container applied.
  const mfFile = join(dir, '.devcontainer/extensions.json');
  const mf = readFileSync(mfFile, 'utf8');
  writeFileSync(mfFile, JSON.stringify({ ...JSON.parse(mf), egress: ['example.com'] }, null, 2));
  const changed = pending();
  assert.equal(changed.pendingRecreate, true);
  assert.match(changed.reasons.join(), /extensions\.json changed after the container started/);

  // A secret's remoteEnv line alone (devcontainer.json) is a pending recreate too.
  writeFileSync(mfFile, mf);
  const dcFile = join(dir, '.devcontainer/devcontainer.json');
  const dc = readFileSync(dcFile, 'utf8');
  writeFileSync(dcFile, dc.replace('"remoteEnv": {', '"remoteEnv": {\n    "MY_TOKEN": "${localEnv:MY_TOKEN}",'));
  assert.match(pending().reasons.join(), /remoteEnv/);
  // And so is a different image.
  writeFileSync(dcFile, dc.replace(/@sha256:[0-9a-f]{64}/, `@sha256:${'0'.repeat(64)}`));
  assert.match(pending().reasons.join(), /not the image the container runs/);
  writeFileSync(dcFile, dc);
  assert.equal(pending().pendingRecreate, false, 'restored config: nothing pending');

  // A stopped container still answers: the hash is copied out of it.
  assert.equal(run('docker', ['stop', '-t', '2', now.id]).code, 0);
  const stopped = pending();
  assert.equal(stopped.state, 'exited');
  assert.equal(stopped.appliedHash, now.appliedHash);
  assert.equal(stopped.pendingRecreate, false, JSON.stringify(stopped));
  writeFileSync(mfFile, JSON.stringify({ ...JSON.parse(mf), egress: ['example.com'] }, null, 2));
  assert.equal(pending().pendingRecreate, true, 'a manifest edit is pending on a stopped container too');
  writeFileSync(mfFile, mf);
});

test('migrate: an npm project with its own dev container moves to the Template on a branch, pnpm lockfile made in the container', () => {
  legacy = projectDir('dev-setup-legacy-');
  const git = (...a) => {
    const r = run('git', a, { cwd: legacy });
    assert.equal(r.code, 0, r.err);
    return r.out.trim();
  };
  const files = {
    '.devcontainer/devcontainer.json': '{ "build": { "dockerfile": "Dockerfile" } }\n',
    '.devcontainer/Dockerfile': 'FROM node:24\n',
    '.npmrc': 'registry=http://127.0.0.1:4873/\n',
    // pnpm 11 reads only registry and auth keys from .npmrc; other settings go here. No retries, so the
    // import meant to fail fails at once instead of after pnpm's 70s backoff.
    'pnpm-workspace.yaml': 'fetchRetries: 0\n',
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

test('verify-image fails closed for an unsigned image and a foreign signature; the project is untouched', () => {
  const config = readFileSync(join(dir, '.devcontainer/devcontainer.json'), 'utf8');

  const unsigned = helper('verify-image', 'node', '--ref', pushed);
  assert.equal(unsigned.code, 1, unsigned.log);
  assert.equal(unsigned.doc.verified, false);
  assert.equal(unsigned.doc.failed, 'signature', unsigned.log);
  assert.match(unsigned.doc.detail, /no signatures found/);

  // Sign the same digest with a throwaway key pair (no transparency log): a
  // signature exists, but not from the release workflow's keyless identity.
  const keys = projectDir('dc-cosign-keys-');
  try {
    const cosign = (...a) => run('docker', ['run', '--rm', '--network', 'host', '--user', String(process.getuid()), '-e', 'COSIGN_PASSWORD=',
      '-v', `${keys}:/k`, '-w', '/k', COSIGN_IMAGE, ...a]);
    const gen = cosign('generate-key-pair');
    assert.equal(gen.code, 0, gen.err);
    const sign = cosign('sign', '--yes', '--key', '/k/cosign.key', '--tlog-upload=false', '--use-signing-config=false', unsigned.doc.image);
    assert.equal(sign.code, 0, sign.err);
  } finally {
    rmSync(keys, { recursive: true, force: true });
  }
  const foreign = helper('verify-image', 'node', '--ref', unsigned.doc.image, '--current', unsigned.doc.image);
  assert.equal(foreign.code, 1, foreign.log);
  assert.equal(foreign.doc.failed, 'signature', foreign.log);
  assert.doesNotMatch(foreign.doc.detail, /no signatures found/, 'cosign found the foreign signature and rejected it');
  assert.equal(foreign.doc.changes, undefined, 'nothing about the update is reported');

  assert.equal(readFileSync(join(dir, '.devcontainer/devcontainer.json'), 'utf8'), config, 'the project config is unchanged');
});
