// Tiny test file run by cleanup.test.mjs in a child `node --test` with the real global
// setup. It creates the kinds of resources a suite run leaves behind (without building
// anything) and records their identities in PROBE_OUT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { IMAGE, run, projectDir, runLabelArgs, RUN_LABEL } from '../lib.mjs';

const BASE = 'registry:2.8.3'; // already pulled for the registry stub; its entrypoint is overridden below

test('creates run resources', async () => {
  const dir = projectDir('probe-');
  mkdirSync(join(dir, '.git'));
  const n = process.env.DEV_SETUP_TEST_RUN;
  const derived = `vsc-probe-${n}-uid`;
  const volume = `probe-vol-${n}`;
  assert.equal(run('docker', ['tag', BASE, IMAGE]).code, 0);
  assert.equal(run('docker', ['tag', BASE, derived]).code, 0);
  // Stands in for the devcontainer CLI's container: labelled with the project folder, runs the derived image.
  const project = run('docker', ['create', '--label', `devcontainer.local_folder=${dir}`, '-v', `${volume}:/v`, '--entrypoint', 'sleep', derived, 'infinity']).out.trim();
  // Stands in for the registry stub: carries the run label only, plus an anonymous volume.
  const labelled = run('docker', ['create', ...runLabelArgs(), '-v', '/anon', '--entrypoint', 'sleep', BASE, 'infinity']).out.trim();
  // Stands in for the build's untagged copies: an image with no tag that carries the run label.
  const dockerfile = `FROM ${BASE}\nLABEL ${RUN_LABEL}=${n}\n`;
  const built = run('docker', ['build', '-q', '--label', `${RUN_LABEL}=${n}`, '-'], { input: dockerfile }).out.trim();
  assert.ok(project && labelled && built.startsWith('sha256:'));
  const anon = run('docker', ['inspect', labelled, '--format', '{{range .Mounts}}{{.Name}} {{end}}']).out.trim().split(/\s+/).filter(Boolean);
  writeFileSync(
    process.env.PROBE_OUT,
    JSON.stringify({ dir, root: process.env.DEV_SETUP_TEST_ROOT, image: IMAGE, derived, volume, anon, containers: [project, labelled], untagged: built }),
  );
  const wait = Number(process.env.PROBE_SLEEP ?? 0);
  if (wait) await new Promise((r) => setTimeout(r, wait * 1000));
  assert.ok(!process.env.PROBE_FAIL, 'simulated failure');
  // Another run finishing meanwhile must not have taken this run's resources.
  assert.equal(run('docker', ['inspect', project]).code, 0);
});
