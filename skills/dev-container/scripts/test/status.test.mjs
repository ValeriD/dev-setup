// `status` (skill ticket 07, SC-09 and SC-11 helper parts) on fixture projects:
// Preset drift and the resync entries, Pinned Ref ages from local bare-git
// fixtures and the npm registry stub, egress, host env names (never values).
// The registry check is skipped here; the container part (pending recreate) is
// covered against a real container in tests/dev-container-skill.test.mjs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = dirname(dirname(fileURLToPath(import.meta.url)));
const SKILL = dirname(SCRIPTS);
const REPO = dirname(dirname(SKILL));
const IMAGE = `ghcr.io/valerid/dev-setup/node@sha256:${'a'.repeat(64)}`;
const root = mkdtempSync(join(tmpdir(), 'dc-status-test-'));
const gitBase = join(root, 'git');
const home = join(root, 'home');
const SECRET_VALUE = 'do-not-print-me-0123456789';
const sha = {};
let registry, stub, c;

const daysAgo = (d) => new Date(Date.now() - d * 86400e3).toISOString();

before(async () => {
  mkdirSync(home);
  // acme/skills: an old commit (100 days) and a newer one (3 days).
  const work = join(root, 'work');
  const git = (env, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: work, encoding: 'utf8', env: { ...process.env, ...env } }).trim();
  mkdirSync(join(work, 'skills/lint'), { recursive: true });
  git({}, 'init', '-q', '-b', 'main');
  for (const [days, body] of [[100, 'v1'], [3, 'v2']]) {
    writeFileSync(join(work, 'skills/lint/SKILL.md'), `---\nname: lint\ndescription: ${body}\n---\n`);
    git({}, 'add', '-A');
    git({ GIT_AUTHOR_DATE: daysAgo(days), GIT_COMMITTER_DATE: daysAgo(days) }, 'commit', '-q', '-m', body);
    (sha.skills ??= []).push(git({}, 'rev-parse', 'HEAD'));
  }
  mkdirSync(join(gitBase, 'acme'), { recursive: true });
  execFileSync('git', ['clone', '-q', '--bare', work, join(gitBase, 'acme/skills.git')]);

  const port = await new Promise((res) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });
  stub = spawn('node', [join(REPO, 'tests/fixtures/registry-stub.mjs'), String(port)], {
    env: { ...process.env, STUB_SPEC: JSON.stringify({ 'search-mcp': { '1.0.0': { ageDays: 40, bin: { srv: 'srv.mjs' } } } }) }, stdio: 'ignore',
  });
  registry = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${registry}search-mcp`)).ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }

  // A checkout whose presets/ the tests control; everything else links to this one.
  const dir = join(root, 'checkout');
  mkdirSync(dir);
  for (const d of ['variants', 'templates', 'installer']) symlinkSync(join(REPO, d), join(dir, d));
  cpSync(SKILL, join(dir, 'skills/dev-container'), { recursive: true });
  mkdirSync(join(dir, 'presets'));
  c = { dir, helper: join(dir, 'skills/dev-container/scripts/dev-container.mjs') };
});

after(() => {
  stub?.kill();
  rmSync(root, { recursive: true, force: true });
});

function h(args, env = {}) {
  const r = spawnSync('node', [c.helper, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env, HOME: home, CLAUDE_CONFIG_DIR: '', DEV_SETUP_GIT_BASE: gitBase, GIT_AUTHOR_NAME: '', GIT_AUTHOR_EMAIL: '',
      npm_config_registry: registry, npm_config_cache: join(root, 'npm-cache'), npm_config_update_notifier: 'false', ...env,
    },
  });
  let doc;
  try {
    doc = JSON.parse(r.stdout);
  } catch { /* asserted by callers */ }
  return { code: r.status, doc, out: r.stdout + r.stderr, log: `${args.join(' ')}\n${r.stdout}\n${r.stderr}` };
}

const setPreset = (name, preset) => writeFileSync(join(c.dir, 'presets', `${name}.json`), JSON.stringify(preset, null, 2));
const lint = (s) => ({ kind: 'skill', agents: ['claude'], source: { github: 'acme/skills', path: 'skills/lint', sha: s } });
const searchMcp = { kind: 'mcp', agents: ['claude'], name: 'search', source: { npm: 'search-mcp', version: '1.0.0' }, env: ['SEARCH_TOKEN'], egress: ['api.search.example.com'] };
const remote = { kind: 'mcp-remote', agents: ['claude'], name: 'docs', url: 'https://docs.example.com/mcp', egress: ['docs.example.com'] };
const tag = (name, entries) => entries.map((e) => ({ ...e, preset: name }));

let n = 0;
function project(extensions, egress, remoteEnv = {}) {
  const p = join(root, `p${n++}`);
  mkdirSync(p);
  assert.equal(h(['render-template', 'node', p, '--image', IMAGE]).code, 0);
  const mf = join(p, '.devcontainer/extensions.json');
  writeFileSync(mf, JSON.stringify({ ...JSON.parse(readFileSync(mf, 'utf8')), extensions, ...(egress ? { egress } : {}) }, null, 2));
  const dc = join(p, '.devcontainer/devcontainer.json');
  const add = Object.entries(remoteEnv).map(([k, v]) => `\n    ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('');
  writeFileSync(dc, readFileSync(dc, 'utf8').replace('"remoteEnv": {', `"remoteEnv": {${add}`));
  return p;
}

test('status reports Pinned Ref ages, egress, and unset host env names without printing a value', () => {
  setPreset('web', { description: 'Web.', extensions: [lint(sha.skills[0])], egress: ['cdn.example.com'] });
  const p = project([...tag('web', [lint(sha.skills[0])]), searchMcp, remote], ['cdn.example.com'], { SEARCH_TOKEN: '${localEnv:SEARCH_TOKEN}' });
  const before = readFileSync(join(p, '.devcontainer/extensions.json'), 'utf8');

  const r = h(['status', p, '--skip-image-check'], { SEARCH_TOKEN: SECRET_VALUE, GIT_AUTHOR_NAME: 'Dev' });
  assert.equal(r.code, 0, r.log);
  const d = r.doc;
  assert.deepEqual(d.problems, []);
  assert.equal(d.image.variant, 'node');
  assert.equal(d.image.current, IMAGE);
  assert.equal(d.image.newerVerified, null, 'not checked');

  const [skill, mcp, rem] = d.extensions;
  assert.deepEqual(skill.pinnedRef, { type: 'sha', value: sha.skills[0] });
  assert.equal(skill.preset, 'web');
  assert.ok(skill.ageDays >= 99 && skill.ageDays <= 100, `commit age ${skill.ageDays}`);
  assert.deepEqual(mcp.pinnedRef, { type: 'version', value: '1.0.0' });
  assert.ok(mcp.ageDays >= 39 && mcp.ageDays <= 40, `publish age ${mcp.ageDays}`);
  assert.equal(rem.pinnedRef, null);
  assert.match(rem.note, /D2/);

  assert.deepEqual(d.egress.topLevel, ['cdn.example.com']);
  assert.deepEqual(d.egress.entries.map((e) => e.domain), ['api.search.example.com', 'docs.example.com']);

  assert.deepEqual(d.env.secrets.map((s) => [s.name, s.hostEnv, s.set]), [['SEARCH_TOKEN', 'SEARCH_TOKEN', true]]);
  assert.deepEqual(d.env.gitIdentity.map((g) => [g.name, g.set]), [['GIT_AUTHOR_NAME', true], ['GIT_AUTHOR_EMAIL', false]]);
  assert.deepEqual(d.env.missing, ['GIT_AUTHOR_EMAIL']);
  assert.doesNotMatch(r.out, new RegExp(SECRET_VALUE), 'a secret value never reaches the output');
  assert.doesNotMatch(r.out, /"Dev"/, 'nor does the git identity');

  const unset = h(['status', p, '--skip-image-check']);
  assert.deepEqual(unset.doc.env.missing, ['SEARCH_TOKEN', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL']);
  assert.equal(d.container.found, false, 'no container for a fixture project');
  assert.equal(readFileSync(join(p, '.devcontainer/extensions.json'), 'utf8'), before, 'status writes nothing');
});

test('SC-09: after a Preset edit, status reports drift with a per-entry diff and the exact resync entries', () => {
  const v1 = { description: 'Web.', extensions: [lint(sha.skills[0]), remote], egress: ['cdn.example.com'] };
  setPreset('site', v1);
  const own = { ...lint(sha.skills[1]), name: 'own-lint' };
  const p = project([own, ...tag('site', v1.extensions)], ['cdn.example.com', 'mine.example.com']);

  const inSync = h(['status', p, '--skip-image-check']);
  assert.equal(inSync.code, 0, inSync.log);
  assert.deepEqual(inSync.doc.presets, [{ name: 'site', entries: 2, indexes: [1, 2], state: 'in-sync' }]);

  // Edit the Preset: the skill moves to a newer SHA, the remote server goes, an MCP server and a domain arrive.
  setPreset('site', { description: 'Web.', extensions: [lint(sha.skills[1]), searchMcp], egress: ['cdn.example.com', 'fonts.example.com'] });
  const r = h(['status', p, '--skip-image-check']);
  assert.equal(r.code, 0, r.log);
  const [site] = r.doc.presets;
  assert.equal(site.state, 'drifted');
  assert.deepEqual(site.diff.changed.map((x) => [x.index, x.from.source.sha, x.to.source.sha]), [[1, sha.skills[0], sha.skills[1]]]);
  assert.deepEqual(site.diff.added, [searchMcp]);
  assert.deepEqual(site.diff.removed.map((x) => [x.index, x.entry.name]), [[2, 'docs']]);
  assert.deepEqual(site.diff.egressMissing, ['fonts.example.com']);
  assert.deepEqual(site.resync.entries, tag('site', [lint(sha.skills[1]), searchMcp]));

  // Resync as the agent applies it: only this project's tagged entries change, the own entry stays.
  const file = join(p, '.devcontainer/extensions.json');
  const mf = JSON.parse(readFileSync(file, 'utf8'));
  mf.extensions = [...mf.extensions.filter((_, i) => !site.indexes.includes(i)), ...site.resync.entries];
  mf.egress = [...mf.egress, ...site.resync.egressAdd];
  writeFileSync(file, JSON.stringify(mf, null, 2));
  const after = h(['status', p, '--skip-image-check']);
  assert.equal(after.doc.presets[0].state, 'in-sync', after.log);
  assert.deepEqual(after.doc.extensions[0].entry, inSync.doc.extensions[0].entry, 'the project\'s own entry is untouched');
});

test('status names a Preset that is gone or invalid instead of offering a resync', () => {
  const p = project(tag('gone', [lint(sha.skills[0])]).concat(tag('bad', [{ ...lint(sha.skills[1]), name: 'lint2' }])));
  setPreset('bad', { extensions: [] });
  const r = h(['status', p, '--skip-image-check']);
  assert.equal(r.code, 0, r.log);
  const by = Object.fromEntries(r.doc.presets.map((x) => [x.name, x]));
  assert.equal(by.gone.state, 'missing');
  assert.equal(by.bad.state, 'invalid');
  assert.match(by.bad.problems.join(), /description/);
  assert.equal(by.gone.resync, undefined);
});

test('status fails on a project without an Extension Manifest, and reports an unreachable Pinned Ref per entry', () => {
  assert.equal(h(['status', join(root, 'nowhere'), '--skip-image-check']).code, 1);
  const p = project([lint('f'.repeat(40))]);
  const r = h(['status', p, '--skip-image-check']);
  assert.equal(r.code, 0, r.log);
  assert.equal(r.doc.extensions[0].ageDays, null);
  assert.match(r.doc.extensions[0].error, /cannot fetch/);
});
