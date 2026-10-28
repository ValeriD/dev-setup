// Helpers for the container acceptance suite: build the image, publish and
// apply the Template through a throwaway local OCI registry, start containers
// with the devcontainer CLI, and probe them as `node`.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_IMAGE = 'dev-setup-node:test';
// Under `npm test` the global setup (tests/global-setup.mjs) gives the run its own image tag,
// project root and label; a test file run on its own falls back to the shared tag and tmpdir.
export const IMAGE = process.env.DEV_SETUP_TEST_IMAGE ?? DEFAULT_IMAGE;
export const RUN_LABEL = 'dev-setup.test-run';
export const runLabelArgs = () => (process.env.DEV_SETUP_TEST_RUN ? ['--label', `${RUN_LABEL}=${process.env.DEV_SETUP_TEST_RUN}`] : []);
const CLI = ['npx', '-y', '@devcontainers/cli@0.89.0'];
const REGISTRY_IMAGE = 'registry:2.8.3';

export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20, ...opts });
  return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '' };
}
const cli = (args, opts) => run(CLI[0], [...CLI.slice(1), ...args], opts);

function must(r, what) {
  if (r.code !== 0) throw new Error(`${what} failed (${r.code})\n${r.out}\n${r.err}`);
  return r;
}

/** Pinned values, read from the one place they live. */
export function pins() {
  const df = readFileSync(join(REPO, 'variants/node/Dockerfile'), 'utf8');
  const arg = (n) => df.match(new RegExp(`^ARG ${n}=(\\S+)`, 'm'))[1];
  return { claude: arg('CLAUDE_CODE_VERSION'), codex: arg('CODEX_VERSION'), pnpm: arg('PNPM_VERSION') };
}

/** A fresh temp folder for a test project, under the run's root when there is one. */
export function projectDir(prefix) {
  return mkdtempSync(join(process.env.DEV_SETUP_TEST_ROOT ?? tmpdir(), prefix));
}

/** The revision the run labels its image with: recorded once at the start of the run. */
export const builtRevision = () => process.env.DEV_SETUP_TEST_REVISION ?? headRevision();

/**
 * Makes sure the image under test exists. Under `npm test` global setup built it once for the run, so this only checks.
 * A file run on its own (no run id) builds it; CI builds ahead and sets DEV_SETUP_TEST_SKIP_BUILD.
 */
export function buildImage() {
  if (process.env.DEV_SETUP_TEST_SKIP_BUILD) return;
  if (!process.env.DEV_SETUP_TEST_RUN) return buildRunImage(IMAGE);
  must(run('docker', ['image', 'inspect', IMAGE]), `run image ${IMAGE} (global setup builds it; run the suite with npm test)`);
}

/** Builds `image`. The tag is a parameter because global setup picks it after this module is loaded. */
export function buildRunImage(image) {
  const dir = join(REPO, 'variants/node');
  // Labels the image with this checkout's commit, as CI does with GITHUB_SHA, and with the run label
  // (passed down to derived images) so teardown can find the build's untagged copies.
  const env = { ...process.env, DEV_SETUP_REVISION: builtRevision() };
  must(cli(['build', '--workspace-folder', dir, '--config', join(dir, 'devcontainer.json'), '--image-name', image, ...runLabelArgs()], { env }), 'image build');
}

export function headRevision() {
  return must(run('git', ['rev-parse', 'HEAD'], { cwd: REPO }), 'git rev-parse').out.trim();
}

/** Throwaway local registry holding the published Template. */
export function startTemplateRegistry() {
  const id = must(run('docker', ['run', '-d', '--rm', ...runLabelArgs(), '-p', '127.0.0.1::5000', REGISTRY_IMAGE]), 'registry start').out.trim();
  const port = run('docker', ['port', id, '5000/tcp']).out.trim().split(':').pop();
  const registry = `localhost:${port}`;
  for (let i = 0; i < 50; i++) {
    if (run('curl', ['-fs', `http://${registry}/v2/`]).code === 0) break;
    run('sleep', ['0.2']);
  }
  must(cli(['templates', 'publish', '-r', registry, '-n', 'dev-setup', join(REPO, 'templates')]), 'template publish');
  return {
    templateId: `${registry}/dev-setup/node:0.1.0`,
    stop: () => run('docker', ['rm', '-fv', id]),
  };
}

/** A fresh folder with a `.git` directory, the Template applied, ready for `up`. */
export function createProject(templateId) {
  const dir = projectDir('dev-setup-proj-');
  must(run('git', ['init', '-q', '-b', 'main'], { cwd: dir }), 'git init');
  must(cli(['templates', 'apply', '-w', dir, '-t', templateId, '-a', JSON.stringify({ image: IMAGE })]), 'template apply');
  return dir;
}

export function up(dir, extra = []) {
  const r = must(cli(['up', '--workspace-folder', dir, ...extra]), 'devcontainer up');
  const line = r.out.trim().split('\n').pop();
  return JSON.parse(line);
}

/** Run a shell snippet inside the project's container as the remote user (`node`). */
export function exec(dir, script, { input } = {}) {
  return cli(['exec', '--workspace-folder', dir, 'sh', '-c', script], { input });
}

export function volumeNames(containerId) {
  const m = JSON.parse(run('docker', ['inspect', containerId, '--format', '{{json .Mounts}}']).out);
  return m.filter((x) => x.Type === 'volume').map((x) => x.Name);
}

/** Container id for a project folder (running or not), found by the devcontainer label. */
export function containerFor(dir) {
  return run('docker', ['ps', '-aq', '--filter', `label=devcontainer.local_folder=${dir}`]).out.trim().split('\n')[0] || null;
}

/** `up` that reports instead of throwing, for fail-closed checks. */
export function tryUp(dir) {
  return cli(['up', '--workspace-folder', dir]);
}

export function removeProject(dir, containerId) {
  const vols = containerId ? volumeNames(containerId) : [];
  // The derived `vsc-...-uid` image the devcontainer CLI built for this container; never the suite's own image.
  const derived = containerId ? run('docker', ['inspect', containerId, '--format', '{{.Config.Image}}']).out.trim() : '';
  if (containerId) run('docker', ['rm', '-fv', containerId]);
  for (const v of vols) run('docker', ['volume', 'rm', '-f', v]);
  if (derived && derived !== IMAGE) run('docker', ['rmi', derived]);
  rmSync(dir, { recursive: true, force: true });
}
