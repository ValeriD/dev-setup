// Container acceptance for Claude plugins and hooks (SC-13 plugins, SC-15, SC-16).
// Loading is verified through the init event of `claude -p --output-format
// stream-json --verbose` (no model call is needed; `claude plugin list` does not
// show managed plugins). Plugin sources are local bare-git fixtures selected with
// DEV_SETUP_GIT_BASE / installer --git-base. SessionStart hooks `touch` markers.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IMAGE, run, buildImage, startTemplateRegistry, createProject, up, exec, removeProject } from './lib.mjs';

const root = mkdtempSync(join(tmpdir(), 'dev-setup-plugins-'));
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8' }).trim();
const tag = `dev-setup-plugins-test:${process.pid}`;
let sha;
let registry;
const projects = [];
const images = [];

const touchHooks = (marker) => JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: `touch /tmp/${marker}` }] }] } });
const plugin = (name) => ({
  [`plugins/${name}/.claude-plugin/plugin.json`]: JSON.stringify({ name, version: '1.0.0' }),
  [`plugins/${name}/hooks/hooks.json`]: touchHooks(`marker-plugin-${name}`),
});

before(() => {
  buildImage();
  registry = startTemplateRegistry();
  const work = join(root, 'work');
  const files = { ...plugin('img-plug'), ...plugin('proj-plug'), 'hooks/touch.sh': '#!/bin/sh\ntouch /tmp/marker-manifest-hook\n' };
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(work, p, '..'), { recursive: true });
    writeFileSync(join(work, p), body);
  }
  git(root, 'init', '-q', '-b', 'main', work);
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'x');
  sha = git(work, 'rev-parse', 'HEAD');
  mkdirSync(join(root, 'ctx/git/acme'), { recursive: true });
  git(root, 'clone', '-q', '--bare', work, join(root, 'ctx/git/acme/plug.git'));
  writeFileSync(join(root, 'ctx/.dockerignore'), '*\n!git/\n!*.json\n');
  // A second marketplace to try to add: it must be refused by policy.
  mkdirSync(join(root, 'other/.claude-plugin'), { recursive: true });
  writeFileSync(join(root, 'other/.claude-plugin/marketplace.json'), JSON.stringify({ name: 'other', owner: { name: 'x' }, plugins: [] }));
});
after(() => {
  for (const p of projects) removeProject(p.dir, p.containerId);
  for (const t of images) run('docker', ['rmi', '-f', t]);
  registry?.stop();
  rmSync(root, { recursive: true, force: true });
});

const entry = (name) => ({ kind: 'plugin', agents: ['claude'], source: { github: 'acme/plug', path: `plugins/${name}`, sha } });
const hookEntry = () => ({ kind: 'hook', agents: ['claude'], event: 'SessionStart', source: { github: 'acme/plug', path: 'hooks/touch.sh', sha } });

/** Shell snippet: fresh session, print the init event's plugins as JSON, then the markers. */
const PROBE = `cd /tmp && rm -f /tmp/marker-* && ANTHROPIC_API_KEY=sk-fake timeout 90 claude -p hi --output-format stream-json --verbose 2>/dev/null |
  grep '"subtype":"init"' | head -1 | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(JSON.stringify(j.plugins.filter(p=>p.path!=="builtin")))';
  echo MARKERS; ls /tmp | grep ^marker- | sort`;
const parse = (out) => {
  const [plugins, markers] = out.split('MARKERS\n');
  return { plugins: JSON.parse(plugins.trim().split('\n').pop()), markers: markers.trim().split('\n').filter(Boolean) };
};
/** Pinned SHA of a loaded plugin, from the generated marketplace's pins.json next to its path. */
const pinnedSha = (inContainer, p) => {
  const mkt = p.path.replace(/\/plugins\/[^/]+$/, '');
  return JSON.parse(inContainer(`cat ${mkt}/pins.json`))[p.name].sha;
};

function newProject() {
  const dir = createProject(registry.templateId);
  const p = { dir, containerId: null };
  projects.push(p);
  const cfgPath = join(dir, '.devcontainer/devcontainer.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  cfg.mounts.push(`source=${join(root, 'ctx/git')},target=/fixtures,type=bind,readonly`);
  writeFileSync(join(root, 'ctx/git/gitconfig'), '[safe]\n\tdirectory = *\n');
  cfg.containerEnv = { DEV_SETUP_GIT_BASE: '/fixtures', GIT_CONFIG_GLOBAL: '/fixtures/gitconfig' };
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  // A hook in the repository's own settings, which allowManagedHooksOnly must ignore.
  mkdirSync(join(dir, '.claude'), { recursive: true });
  writeFileSync(join(dir, '.claude/settings.json'), touchHooks('marker-project-settings'));
  return p;
}
const setManifest = (p, m) => writeFileSync(join(p.dir, '.devcontainer/extensions.json'), JSON.stringify(m));
const inProject = (p) => (script) => {
  const r = exec(p.dir, script);
  assert.equal(r.code, 0, r.err);
  return r.out;
};

test('SC-13, SC-15, SC-16: a Variant-layer plugin loads at image start, pinned to its SHA, and policy refuses any other marketplace', () => {
  const t = `${tag}-image`;
  writeFileSync(join(root, 'ctx/layer.json'), JSON.stringify({ extensions: [entry('img-plug'), hookEntry()] }));
  writeFileSync(
    join(root, 'ctx/Dockerfile'),
    `FROM ${IMAGE}\nUSER root\nCOPY git /fixtures\nCOPY layer.json /tmp/layer.json\n` +
      'RUN node /opt/dev-setup/installer/src/cli.mjs install --mode build --git-base /fixtures ' +
      '--manifest /opt/dev-setup/manifests/base.json --manifest /opt/dev-setup/manifests/node.json --manifest /tmp/layer.json\nUSER node\n',
  );
  const b = run('docker', ['build', '-t', t, join(root, 'ctx')]);
  assert.equal(b.code, 0, b.err);
  images.push(t);
  const inImage = (script, extra = []) => run('docker', ['run', '--rm', ...extra, '--entrypoint', 'bash', t, '-c', script]);

  const r = inImage(PROBE);
  assert.equal(r.code, 0, r.err);
  const { plugins, markers } = parse(r.out);
  assert.deepEqual(plugins.map((p) => p.source), ['img-plug@dev-setup-image']);
  assert.match(plugins[0].path, /^\/opt\/dev-setup\/marketplaces\/image\/plugins\/img-plug$/);
  assert.equal(pinnedSha((s) => inImage(s).out, plugins[0]), sha);
  assert.deepEqual(markers, ['marker-manifest-hook', 'marker-plugin-img-plug']);

  const m = inImage('claude plugin marketplace add /other 2>&1; echo "exit=$?"', ['-v', `${join(root, 'other')}:/other:ro`]);
  assert.match(m.out, /enterprise|policy|managed settings|not allowed|blocked/i);
  assert.doesNotMatch(m.out, /exit=0/);
  const w = inImage('touch /opt/dev-setup/marketplaces/image/x; touch /etc/claude-code/managed-settings.json');
  assert.notEqual(w.code, 0, 'plugin content and policy are not writable by node');
});

test('SC-13, SC-15: a project plugin and hook appear after recreate and disappear after removal; the repo own hook never runs', () => {
  const p = newProject();
  setManifest(p, { extensions: [entry('proj-plug'), hookEntry()] });
  p.containerId = up(p.dir).containerId;
  const sh = inProject(p);

  const { plugins, markers } = parse(sh(PROBE));
  assert.deepEqual(plugins.map((x) => x.source), ['proj-plug@dev-setup-project']);
  assert.equal(pinnedSha(sh, plugins[0]), sha);
  assert.deepEqual(markers, ['marker-manifest-hook', 'marker-plugin-proj-plug'], 'manifest and plugin hooks ran, the project settings hook did not');
  assert.equal(exec(p.dir, 'touch /opt/dev-setup/marketplaces/project/x; touch /etc/claude-code/managed-settings.d/50-project.json').code === 0, false);

  setManifest(p, { extensions: [] });
  p.containerId = up(p.dir, ['--remove-existing-container']).containerId;
  const gone = parse(inProject(p)(PROBE));
  assert.deepEqual(gone.plugins, []);
  assert.deepEqual(gone.markers, []);
});

test('a project plugin entry without a SHA makes `up` fail naming the entry', () => {
  const p = newProject();
  const bad = entry('proj-plug');
  bad.source.sha = 'main';
  setManifest(p, { extensions: [bad] });
  const r = run('npx', ['-y', '@devcontainers/cli@0.89.0', 'up', '--workspace-folder', p.dir]);
  assert.notEqual(r.code, 0);
  assert.match(r.out + r.err, /extensions\[0\] \(plugin "acme\/plug\/plugins\/proj-plug"\).*not a full 40-character commit SHA/s);
  p.containerId = run('docker', ['ps', '-aq', '--filter', `label=devcontainer.local_folder=${p.dir}`]).out.trim().split('\n')[0] || null;
});

