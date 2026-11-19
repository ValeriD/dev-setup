#!/usr/bin/env node
// Removes what interrupted test runs left behind. A run that finishes cleans up after itself
// (tests/global-setup.mjs and each file's `after`). A run killed mid-way, for example by a tool
// timeout or SIGKILL, leaves containers running. Everything a run creates carries the
// `dev-setup.test-run=<id>` label, and its folders live in `<tmpdir>/dev-setup-test-<id>`.
//
//   npm run test:cleanup                 every run's leftovers (refuses while a test run is active)
//   npm run test:cleanup -- <id>         one run only
//   npm run test:cleanup -- --force      all runs, even while a test run is active
//
// Only labelled resources are touched. Never prunes. Prints what remains (should be nothing).
import { chmodSync, existsSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const LABEL = 'dev-setup.test-run';
const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.find((a) => !a.startsWith('--'));

const docker = (...a) => {
  const r = spawnSync('docker', a, { encoding: 'utf8' });
  return (r.stdout ?? '').trim();
};
const lines = (s) => s.split('\n').filter(Boolean);
const filter = only ? `label=${LABEL}=${only}` : `label=${LABEL}`;

// A test run in progress owns its resources: do not pull them out from under it.
const active = lines(spawnSync('pgrep', ['-af', '--', '--test-global-setup'], { encoding: 'utf8' }).stdout ?? '').filter(
  (l) => !l.includes('test-cleanup'),
);
if (active.length && !only && !force) {
  console.error(`A test run is still active:\n  ${active.join('\n  ')}\nWait for it, name one run id, or pass --force.`);
  process.exit(1);
}

const containers = lines(docker('ps', '-aq', '--filter', filter));
const volumes = new Set(lines(docker('volume', 'ls', '-q', '--filter', filter)));
for (const c of containers) {
  const mounts = docker('inspect', c, '--format', '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}} {{end}}{{end}}');
  for (const v of mounts.split(/\s+/).filter(Boolean)) volumes.add(v);
}
if (containers.length) docker('rm', '-fv', ...containers);
for (const v of volumes) docker('volume', 'rm', '-f', v);

// Children before parents: repeat while a pass removes something.
for (let left = lines(docker('images', '-a', '-q', '--filter', filter)); left.length; ) {
  for (const i of new Set(left)) {
    for (const tag of lines(docker('image', 'inspect', i, '--format', '{{range .RepoTags}}{{println .}}{{end}}'))) docker('rmi', tag);
    docker('rmi', i);
  }
  const next = lines(docker('images', '-a', '-q', '--filter', filter));
  if (next.length >= left.length) break;
  left = next;
}

// Run folders. FirstMate makes hook folders read-only, so open them before removing.
const tmp = realpathSync(tmpdir());
const dirs = readdirSync(tmp)
  .filter((d) => (only ? d === `dev-setup-test-${only}` : d.startsWith('dev-setup-test-')))
  .map((d) => join(tmp, d))
  .filter((d) => statSync(d).isDirectory());
const open = (d) => {
  try {
    chmodSync(d, 0o700);
    for (const e of readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) open(join(d, e.name));
  } catch {}
};
for (const d of dirs) {
  open(d);
  rmSync(d, { recursive: true, force: true });
}

const left = {
  containers: lines(docker('ps', '-aq', '--filter', filter)).length,
  volumes: lines(docker('volume', 'ls', '-q', '--filter', filter)).length,
  images: lines(docker('images', '-a', '-q', '--filter', filter)).length,
  folders: dirs.filter((d) => existsSync(d)),
};
console.log(
  `removed ${containers.length} containers, ${volumes.size} volumes, run folders ${dirs.length}; ` +
    `left: ${left.containers} containers, ${left.volumes} volumes, ${left.images} images, ${left.folders.length} folders`,
);
if (left.containers || left.volumes || left.images || left.folders.length) {
  if (left.folders.length) console.log(`folders left (owned by another uid?): ${left.folders.join(' ')}`);
  process.exit(1);
}
