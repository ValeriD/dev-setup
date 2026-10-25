// pnpm supply-chain policy (SC-07, SC-08): enforced from the image in a project
// with no pnpm config of its own. A zero-dependency registry stub runs on
// loopback inside the container, so publish times are deterministic and no
// allowlist is needed. Needs Docker and network access for npx.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, buildImage, startTemplateRegistry, createProject, up, exec, removeProject } from './lib.mjs';

let registry;
let p;
const sh = (script, opts) => exec(p.dir, script, opts);
const ok = (script) => {
  const r = sh(script);
  assert.equal(r.code, 0, `${script}\n${r.out}\n${r.err}`);
  return r.out;
};
const out = (r) => r.out + r.err;

const REGISTRY_SPEC = {
  scripty: { '1.0.0': { ageDays: 30, scripts: { postinstall: 'echo built > built.txt' } } },
  other: { '1.0.0': { ageDays: 30, scripts: { postinstall: 'echo built > built.txt' } } },
  plain: { '1.0.0': { ageDays: 30 } },
  extra: { '1.0.0': { ageDays: 30 } },
  fresh: { '1.0.0': { ageDays: 1 } },
};

/** A fresh project dir inside the container with the stub registry as its only registry. */
function project(name, deps, { lock = true } = {}) {
  ok(`rm -rf /tmp/${name} && mkdir /tmp/${name} && cd /tmp/${name} &&
      echo 'registry=http://127.0.0.1:4873/' > .npmrc &&
      echo '${JSON.stringify({ name, version: '1.0.0', dependencies: deps })}' > package.json`);
  // Installs are frozen by policy, so a project needs a lockfile to install from.
  if (lock) ok(`cd /tmp/${name} && pnpm install --lockfile-only --no-frozen-lockfile`);
  return `cd /tmp/${name}`;
}

before(() => {
  buildImage();
  registry = startTemplateRegistry();
  const dir = createProject(registry.templateId);
  p = { dir, containerId: up(dir).containerId };
  const stub = readFileSync(join(REPO, 'tests/fixtures/registry-stub.mjs'), 'utf8');
  assert.equal(sh('cat > /tmp/registry-stub.mjs', { input: stub }).code, 0);
  ok(`STUB_SPEC='${JSON.stringify(REGISTRY_SPEC)}' nohup node /tmp/registry-stub.mjs 4873 >/tmp/stub.log 2>&1 &
      for i in $(seq 50); do node -e "fetch('http://127.0.0.1:4873/plain').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" && exit 0; sleep 0.2; done; cat /tmp/stub.log; exit 1`);
});
after(() => {
  if (p) removeProject(p.dir, p.containerId);
  registry?.stop();
});

test('SC-07: a dependency build script is blocked in a project with no pnpm config', () => {
  const cd = project('blocked', { scripty: '1.0.0' });
  const r = sh(`${cd} && test ! -e pnpm-workspace.yaml && pnpm install`);
  assert.notEqual(r.code, 0, out(r));
  assert.match(out(r), /ERR_PNPM_IGNORED_BUILDS/);
  ok(`${cd} && test ! -e node_modules/scripty/built.txt`);
});

test('SC-07: a version published less than 7 days ago is refused', () => {
  const cd = project('fresh', { fresh: '1.0.0' }, { lock: false });
  const r = sh(`${cd} && pnpm install --no-frozen-lockfile`);
  assert.notEqual(r.code, 0, out(r));
  assert.match(out(r), /Published at/);
  ok(`${cd} && test ! -e node_modules/fresh`);
});

test('SC-07: the effective policy includes no-downgrade trust, exotic-subdep blocking and a 7-day age', () => {
  const cfg = JSON.parse(ok('cd /tmp && pnpm config list'));
  assert.equal(cfg.trustPolicy, 'no-downgrade');
  assert.equal(cfg.minimumReleaseAge, 10080);
  assert.equal(cfg.minimumReleaseAgeStrict, true);
  assert.equal(cfg.strictDepBuilds, true);
  assert.equal(cfg.blockExoticSubdeps, true);
});

test('SC-07: an install that would modify the lockfile fails in frozen mode', () => {
  const cd = project('frozen', { plain: '1.0.0' });
  const first = sh(`${cd} && pnpm install --no-frozen-lockfile`);
  assert.equal(first.code, 0, out(first));
  ok(`${cd} && echo '${JSON.stringify({ name: 'frozen', version: '1.0.0', dependencies: { plain: '1.0.0', extra: '1.0.0' } })}' > package.json`);
  const r = sh(`${cd} && pnpm install`);
  assert.notEqual(r.code, 0, out(r));
  assert.match(out(r), /lockfile/i);
  ok(`${cd} && test ! -e node_modules/extra && ! grep -q extra pnpm-lock.yaml`);
});

test('SC-08: a project allowing one dependency build runs that script; other scripts stay blocked', () => {
  const cd = project('allow', { scripty: '1.0.0' });
  ok(`${cd} && printf 'allowBuilds:\\n  scripty: true\\n' > pnpm-workspace.yaml && pnpm install`);
  assert.equal(ok(`${cd} && cat node_modules/scripty/built.txt`).trim(), 'built');

  const cd2 = project('allow2', { scripty: '1.0.0', other: '1.0.0' });
  const r = sh(`${cd2} && printf 'allowBuilds:\\n  scripty: true\\n' > pnpm-workspace.yaml && pnpm install`);
  assert.notEqual(r.code, 0, out(r));
  assert.match(out(r), /ERR_PNPM_IGNORED_BUILDS[\s\S]*other@1\.0\.0/);
  ok(`${cd2} && test ! -e node_modules/other/built.txt`);
});

test('SC-07: ad-hoc npm skips lifecycle scripts, pins exactly and has a cooldown by default', () => {
  const cd = project('npmcase', {}, { lock: false });
  const r = sh(`${cd} && npm install scripty`);
  assert.equal(r.code, 0, out(r));
  assert.match(ok(`${cd} && cat package.json`), /"scripty":\s*"1\.0\.0"/);
  ok(`${cd} && test -d node_modules/scripty && test ! -e node_modules/scripty/built.txt`);
  assert.equal(ok('npm config get min-release-age').trim(), '7');
});
