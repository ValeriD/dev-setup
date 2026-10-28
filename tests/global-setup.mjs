// Run once by `node --test --test-global-setup` in the main process, around all test files.
// Setup gives the run an id, a temp root for its project folders and (unless the caller
// supplied one) its own image tag, built once; test files inherit these through the environment.
// Teardown removes only what this run created, found through the run root, the run label
// and the run tag. It never prunes and never matches by name prefix.
import { randomBytes } from 'node:crypto';
import { mkdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { RUN_LABEL, DEFAULT_IMAGE, headRevision, buildRunImage, installCli, run } from './lib.mjs';

let state;

export async function globalSetup() {
  const id = randomBytes(4).toString('hex');
  const root = join(realpathSync(tmpdir()), `dev-setup-test-${id}`);
  mkdirSync(root, { recursive: true });
  // A supplied image (CI, DEV_SETUP_TEST_IMAGE) is the caller's; so is the shared default when the build is skipped.
  const supplied = Boolean(process.env.DEV_SETUP_TEST_IMAGE) || Boolean(process.env.DEV_SETUP_TEST_SKIP_BUILD);
  const image = process.env.DEV_SETUP_TEST_IMAGE ?? (process.env.DEV_SETUP_TEST_SKIP_BUILD ? DEFAULT_IMAGE : `dev-setup-node:test-${id}`);
  let revision;
  try {
    revision = headRevision();
  } catch {
    // not a git checkout: the revision test is skipped by the test itself
  }
  // The pinned devcontainer CLI, installed once into the run root; files call it directly instead of through npx.
  const cliBin = installCli(join(root, 'cli'));
  Object.assign(process.env, {
    DEV_SETUP_TEST_CLI: cliBin,
    DEV_SETUP_TEST_RUN: id,
    DEV_SETUP_TEST_ROOT: root,
    DEV_SETUP_TEST_IMAGE: image,
    ...(revision ? { DEV_SETUP_TEST_REVISION: revision } : {}),
  });
  state = { id, root, image, supplied };
  // One build for the whole run; test files only check it exists. The harness probe (cleanup.test.mjs) opts out.
  if (!supplied && !process.env.DEV_SETUP_TEST_NO_BUILD) {
    console.log(`building run image ${image} (once for the run)`);
    try {
      buildRunImage(image);
    } catch (e) {
      await globalTeardown(); // a failed setup gets no teardown call; remove what the partial build left
      throw e;
    }
  }
}

const docker = (...a) => run('docker', a).out.trim();
const lines = (s) => s.split('\n').filter(Boolean);

export async function globalTeardown() {
  if (!state) return;
  const { id, root, image, supplied } = state;
  // Containers the devcontainer CLI started for project folders under the run root.
  const projects = lines(docker('ps', '-aq', '--filter', 'label=devcontainer.local_folder')).filter((c) => {
    const f = docker('inspect', c, '--format', '{{index .Config.Labels "devcontainer.local_folder"}}');
    return f.startsWith(root + sep);
  });
  const labelled = lines(docker('ps', '-aq', '--filter', `label=${RUN_LABEL}=${id}`));
  const owned = [...new Set([...projects, ...labelled])];

  // Every image carrying the run label, tagged or not (the build's untagged copies), except a supplied one.
  const suppliedId = supplied ? docker('image', 'inspect', image, '--format', '{{.Id}}') : '';
  const labelledImages = () =>
    lines(docker('images', '-a', '-q', '--no-trunc', '--filter', `label=${RUN_LABEL}=${id}`)).filter((i) => i !== suppliedId);

  if (process.env.DEV_SETUP_TEST_KEEP) {
    console.log(
      `DEV_SETUP_TEST_KEEP: kept run ${id}\n  folders: ${root}\n  image: ${image}${supplied ? ' (supplied)' : ''}\n  containers: ${owned.join(' ') || 'none'}\n  labelled images: ${labelledImages().join(' ') || 'none'}`,
    );
    return;
  }

  const images = new Set();
  const volumes = new Set();
  for (const c of projects) {
    // The derived `vsc-...-uid` image the CLI built for this container, and its named volumes.
    const img = docker('inspect', c, '--format', '{{.Config.Image}}');
    if (img && img !== image) images.add(img);
    const mounts = docker('inspect', c, '--format', '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}} {{end}}{{end}}');
    for (const v of mounts.split(/\s+/).filter(Boolean)) volumes.add(v);
  }
  for (const c of owned) run('docker', ['rm', '-fv', c]);
  for (const v of volumes) run('docker', ['volume', 'rm', '-f', v]);
  for (const i of images) run('docker', ['rmi', i]);
  if (!supplied) run('docker', ['rmi', image]);
  // Untagged build copies: a child cannot go before the images built on it, so repeat while any pass removes one.
  for (let left = labelledImages(); left.length; ) {
    for (const i of left) {
      for (const tag of lines(docker('image', 'inspect', i, '--format', '{{range .RepoTags}}{{println .}}{{end}}'))) run('docker', ['rmi', tag]);
      run('docker', ['rmi', i]);
    }
    const next = labelledImages();
    if (next.length === left.length) break;
    left = next;
  }
  rmSync(root, { recursive: true, force: true });
}
