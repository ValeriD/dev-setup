// The harness (global-setup.mjs) leaves nothing behind, keeps everything on request, and
// never removes a supplied image or anyone else's resources. Runs fixtures/harness-probe.mjs
// in a child `node --test` with the real global setup and compares Docker state afterwards.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO, run } from './lib.mjs';

const BASE = 'registry:2.8.3';
const here = mkdtempSync(join(tmpdir(), 'dev-setup-cleanup-test-'));
const uniq = Math.random().toString(16).slice(2, 8);
const cleanups = [];
after(() => {
  for (const f of cleanups.splice(0)) f();
  rmSync(here, { recursive: true, force: true });
});

const has = (kind, name) => run('docker', [kind, 'inspect', name]).code === 0;
const childEnv = (env) => {
  const e = { ...process.env };
  for (const k of Object.keys(e)) if (k.startsWith('DEV_SETUP_TEST_')) delete e[k]; // the child gets its own run
  delete e.NODE_TEST_CONTEXT; // otherwise the child runner only reports instead of running
  return { ...e, ...env };
};

/** Run the probe in a child `node --test`; resolves with its exit code, output and what it recorded. */
function child(name, env = {}) {
  const out = join(here, `${name}.json`);
  const p = spawn('node', ['--test', '--test-global-setup=tests/global-setup.mjs', 'tests/fixtures/harness-probe.mjs'], {
    cwd: REPO,
    env: childEnv({ PROBE_OUT: out, ...env }),
  });
  let log = '';
  p.stdout.on('data', (d) => (log += d));
  p.stderr.on('data', (d) => (log += d));
  return new Promise((res) =>
    p.on('close', (code) => {
      const rec = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
      if (rec) cleanups.push(() => forget(rec)); // safety net, only for what this child recorded
      res({ code, log, rec });
    }),
  );
}

function forget(r) {
  for (const c of r.containers) run('docker', ['rm', '-fv', c]);
  run('docker', ['volume', 'rm', '-f', r.volume]);
  run('docker', ['rmi', r.derived]);
  run('docker', ['rmi', r.untagged]);
  if (r.image.startsWith('dev-setup-node:test-')) run('docker', ['rmi', r.image]);
  rmSync(r.root, { recursive: true, force: true });
}

const left = (r) => ({
  containers: r.containers.filter((c) => has('container', c)).length,
  derived: has('image', r.derived),
  volume: has('volume', r.volume),
  anon: r.anon.length > 0 && r.anon.every((v) => has('volume', v)),
  image: has('image', r.image),
  untagged: has('image', r.untagged),
  root: existsSync(r.root),
});
const gone = { containers: 0, derived: false, volume: false, anon: false, image: false, untagged: false, root: false };

// An unrelated project's container and volume (its folder label is under no run root).
const bystander = { name: `bystander-${uniq}`, vol: `bystander-vol-${uniq}` };
run('docker', ['create', '--name', bystander.name, '--label', 'devcontainer.local_folder=/home/someone/other-project', '-v', `${bystander.vol}:/v`, '--entrypoint', 'sleep', BASE, 'infinity']);
cleanups.push(() => {
  run('docker', ['rm', '-fv', bystander.name]);
  run('docker', ['volume', 'rm', '-f', bystander.vol]);
});

test('a passing run leaves nothing behind and spares unrelated resources', async () => {
  const r = await child('pass');
  assert.equal(r.code, 0, r.log);
  assert.deepEqual(left(r.rec), gone);
  assert.ok(has('container', bystander.name) && has('volume', bystander.vol), 'unrelated container and volume survive');
  assert.ok(has('image', BASE), 'an unlabelled image survives');
});

test('a failing run leaves nothing behind either', async () => {
  const r = await child('fail', { PROBE_FAIL: '1' });
  assert.notEqual(r.code, 0);
  assert.ok(r.rec, r.log);
  assert.deepEqual(left(r.rec), gone);
});

test('DEV_SETUP_TEST_KEEP=1 keeps everything and says what was kept', async () => {
  const r = await child('keep', { DEV_SETUP_TEST_KEEP: '1' });
  assert.equal(r.code, 0, r.log);
  assert.deepEqual(left(r.rec), { containers: 2, derived: true, volume: true, anon: true, image: true, untagged: true, root: true });
  assert.match(r.log, /DEV_SETUP_TEST_KEEP: kept run/);
  assert.ok(r.log.includes(r.rec.root) && r.log.includes(r.rec.image));
  assert.ok(r.log.includes(r.rec.untagged.replace('sha256:', '')), 'the labelled untagged image is listed');
});

test('a supplied image survives the run; the rest is removed', async () => {
  const supplied = `dev-setup-supplied:${uniq}`;
  assert.equal(run('docker', ['tag', BASE, supplied]).code, 0);
  cleanups.push(() => run('docker', ['rmi', supplied]));
  const r = await child('supplied', { DEV_SETUP_TEST_IMAGE: supplied, DEV_SETUP_TEST_SKIP_BUILD: '1' });
  assert.equal(r.code, 0, r.log);
  assert.equal(r.rec.image, supplied);
  assert.deepEqual({ ...left(r.rec), image: null }, { ...gone, image: null });
  assert.ok(has('image', supplied));
});

test("two runs at once use different image tags and do not remove each other's resources", async () => {
  const [a, b] = await Promise.all([child('par-a'), child('par-b', { PROBE_SLEEP: '4' })]);
  assert.equal(a.code, 0, a.log);
  assert.equal(b.code, 0, b.log); // b checks its own container still exists after a's teardown
  assert.notEqual(a.rec.image, b.rec.image);
  assert.notEqual(a.rec.root, b.rec.root);
  assert.deepEqual(left(a.rec), gone);
  assert.deepEqual(left(b.rec), gone);
});
