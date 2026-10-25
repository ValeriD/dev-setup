// dev-container skill helper against a real container (SC-01, SC-02 helper
// parts): the image is pushed to a throwaway local registry, its digest read
// back, the Template rendered from this checkout, validated, started with
// `devcontainer up`, and the first lockfile created inside the container.
// verify-image (SC-08 failure path) runs cosign against the same registry: an
// unsigned image and one signed by a foreign key both fail closed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COSIGN_IMAGE } from '../skills/dev-container/scripts/commands.mjs';
import { REPO, IMAGE, run, buildImage, startTemplateRegistry, containerFor, exec, removeProject } from './lib.mjs';

const HELPER = join(REPO, 'skills/dev-container/scripts/dev-container.mjs');
const cfg = mkdtempSync(join(tmpdir(), 'dc-skill-cfg-')); // empty Claude config: no skill link to check
let registry, pushed, dir;

function helper(...args) {
  const r = spawnSync('node', [HELPER, ...args], { encoding: 'utf8', env: { ...process.env, CLAUDE_CONFIG_DIR: cfg } });
  return { code: r.status, doc: JSON.parse(r.stdout), log: `${args.join(' ')}\n${r.stdout}\n${r.stderr}` };
}
function h(...args) {
  const r = helper(...args);
  assert.equal(r.code, 0, r.log);
  return r.doc;
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

test('verify-image fails closed for an unsigned image and a foreign signature; the project is untouched', () => {
  const config = readFileSync(join(dir, '.devcontainer/devcontainer.json'), 'utf8');

  const unsigned = helper('verify-image', 'node', '--ref', pushed);
  assert.equal(unsigned.code, 1, unsigned.log);
  assert.equal(unsigned.doc.verified, false);
  assert.equal(unsigned.doc.failed, 'signature', unsigned.log);
  assert.match(unsigned.doc.detail, /no signatures found/);

  // Sign the same digest with a throwaway key pair (no transparency log): a
  // signature exists, but not from the release workflow's keyless identity.
  const keys = mkdtempSync(join(tmpdir(), 'dc-cosign-keys-'));
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
