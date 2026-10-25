// dev-container skill helper against a real container (SC-01, SC-02 helper
// parts): the image is pushed to a throwaway local registry, its digest read
// back, the Template rendered from this checkout, validated, started with
// `devcontainer up`, and the first lockfile created inside the container.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO, IMAGE, run, buildImage, startTemplateRegistry, containerFor, exec, removeProject } from './lib.mjs';

const HELPER = join(REPO, 'skills/dev-container/scripts/dev-container.mjs');
const cfg = mkdtempSync(join(tmpdir(), 'dc-skill-cfg-')); // empty Claude config: no skill link to check
let registry, pushed, dir;

function h(...args) {
  const r = spawnSync('node', [HELPER, ...args], { encoding: 'utf8', env: { ...process.env, CLAUDE_CONFIG_DIR: cfg } });
  const doc = JSON.parse(r.stdout);
  assert.equal(r.status, 0, `${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return doc;
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

  assert.equal(h('variants', '--dir', dir).ambiguous, true, 'an empty new repo has no Variant signals');
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
