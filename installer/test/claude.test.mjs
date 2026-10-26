// Claude plugins and hooks through the installer CLI, against local bare-git
// fixtures. No network. Run with `node --test`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const POLICY = fileURLToPath(new URL('../../base/claude/managed-settings.json', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'installer-claude-'));
const gitBase = join(root, 'git');
const sha = {}; // commit per fixture repo
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8' }).trim();

function makeRepo(name, files) {
  const work = join(root, 'work', name);
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(work, path, '..'), { recursive: true });
    writeFileSync(join(work, path), body);
  }
  git(root, 'init', '-q', '-b', 'main', work);
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'x');
  sha[name] = git(work, 'rev-parse', 'HEAD');
  mkdirSync(join(gitBase, 'acme'), { recursive: true });
  git(root, 'clone', '-q', '--bare', work, join(gitBase, `acme/${name}.git`));
}
const pluginJson = (name) => JSON.stringify({ name, version: '1.0.0' });

before(() => {
  makeRepo('plugins', {
    'plugins/hi/.claude-plugin/plugin.json': pluginJson('hi'),
    'plugins/hi/skills/hi/SKILL.md': '---\nname: hi\ndescription: hi\n---\n',
    'hooks/fmt.sh': '#!/bin/sh\ntrue\n',
  });
  makeRepo('mkt', {
    '.claude-plugin/marketplace.json': JSON.stringify({
      name: 'upstream',
      owner: { name: 'x' },
      plugins: [
        { name: 'rel', source: './plugins/rel' },
        { name: 'ext', source: { source: 'github', repo: 'acme/plugins', sha: sha.plugins } },
        { name: 'floating', source: { source: 'github', repo: 'acme/plugins', ref: 'main' } },
      ],
    }),
    'plugins/rel/.claude-plugin/plugin.json': pluginJson('rel'),
  });
});
after(() => rmSync(root, { recursive: true, force: true }));

let n = 0;
const direct = (extra = {}) => ({ kind: 'plugin', agents: ['claude'], source: { github: 'acme/plugins', path: 'plugins/hi', sha: sha.plugins }, ...extra });
const viaMarketplace = (plugin, s = sha.mkt) => ({ kind: 'plugin', agents: ['claude'], source: { marketplace: 'acme/mkt', plugin, sha: s } });
const hook = (extra = {}) => ({ kind: 'hook', agents: ['claude'], event: 'SessionStart', matcher: 'startup', source: { github: 'acme/plugins', path: 'hooks/fmt.sh', sha: sha.plugins }, ...extra });

/** Run a build (image layer) or start (project layer) install into a scratch tree. */
function install(mode, ...extensions) {
  const d = join(root, `run${n++}`);
  mkdirSync(d);
  const f = (name, m) => { const p = join(d, name); writeFileSync(p, JSON.stringify(m)); return p; };
  const p = { settings: join(d, 'managed-settings.json'), dropin: join(d, 'managed-settings.d/50-project.json'), mkts: join(d, 'mkts'), hooks: join(d, 'hooks') };
  const args = [CLI, 'install', '--mode', mode, '--git-base', gitBase, '--claude-skills', join(d, 'cs'), '--codex-skills', join(d, 'xs'),
    '--egress-out', join(d, 'allow.txt'), '--claude-policy', POLICY, '--claude-settings', p.settings, '--claude-dropin', p.dropin,
    '--marketplaces', p.mkts, '--hooks', p.hooks, '--secrets-out', join(d, 'secrets')];
  if (mode === 'build') args.push('--manifest', f('layer.json', { extensions }));
  else args.push('--manifest', f('base.json', { extensions: [] }), '--project', f('project.json', { extensions }));
  const r = spawnSync('node', args, { encoding: 'utf8' });
  return { code: r.status, err: r.stderr, p, allow: join(d, 'allow.txt') };
}
const json = (f) => JSON.parse(readFileSync(f, 'utf8'));

test('build: the base file keeps the policy and gains a sha-pinned directory marketplace, enabled plugins and manifest hooks', () => {
  const r = install('build', direct(), hook());
  assert.equal(r.code, 0, r.err);
  const s = json(r.p.settings);
  const mkt = join(r.p.mkts, 'image');
  assert.equal(s.allowManagedHooksOnly, true);
  assert.equal(s.disableSkillShellExecution, true);
  assert.equal(s.disableSideloadFlags, true);
  assert.equal(s.disableCommandPluginSources, true);
  assert.deepEqual(s.strictKnownMarketplaces, [{ source: 'directory', path: mkt }]);
  assert.deepEqual(s.extraKnownMarketplaces, { 'dev-setup-image': { source: { source: 'directory', path: mkt } } });
  assert.deepEqual(s.enabledPlugins, { 'hi@dev-setup-image': true });
  const command = s.hooks.SessionStart[0].hooks[0].command;
  assert.equal(s.hooks.SessionStart[0].matcher, 'startup');
  assert.equal(readFileSync(command, 'utf8'), '#!/bin/sh\ntrue\n');
  assert.ok(statSync(command).mode & 0o100, 'hook script is executable');
  assert.deepEqual(json(join(mkt, '.claude-plugin/marketplace.json')).plugins, [{ name: 'hi', source: './plugins/hi' }]);
  assert.ok(existsSync(join(mkt, 'plugins/hi/skills/hi/SKILL.md')));
  assert.equal(json(join(mkt, 'pins.json')).hi.sha, sha.plugins);
});

test('a skill, plugin or hook entry carries its own egress, and every layer\'s entry egress reaches the allowlist', () => {
  const skill = { kind: 'skill', agents: ['claude'], source: { github: 'acme/plugins', path: 'plugins/hi/skills/hi', sha: sha.plugins }, egress: ['skill.example.com'] };
  for (const mode of ['build', 'start']) {
    const r = install(mode, skill, direct({ egress: ['plugin.example.com'] }), hook({ egress: ['hook.example.com', 'skill.example.com'] }));
    assert.equal(r.code, 0, r.err);
    const domains = readFileSync(r.allow, 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
    assert.deepEqual(domains, ['skill.example.com', 'plugin.example.com', 'hook.example.com'], mode);
  }
  assert.match(install('build', direct({ egress: ['https://x.example.com'] })).err, /egress\/0 must match pattern/);
});

test('build with no plugins still names an (empty) marketplace in the strict list', () => {
  const r = install('build');
  assert.equal(r.code, 0, r.err);
  const s = json(r.p.settings);
  assert.equal(s.strictKnownMarketplaces.length, 1);
  assert.equal(s.enabledPlugins, undefined);
  assert.deepEqual(json(join(r.p.mkts, 'image/.claude-plugin/marketplace.json')).plugins, []);
});

test('start: only the project layer goes into the drop-in and its own marketplace, and a re-run replaces it', () => {
  const r = install('start', direct(), hook({ event: 'PostToolUse' }));
  assert.equal(r.code, 0, r.err);
  const s = json(r.p.dropin);
  assert.deepEqual(s.strictKnownMarketplaces, [{ source: 'directory', path: join(r.p.mkts, 'project') }]);
  assert.deepEqual(s.enabledPlugins, { 'hi@dev-setup-project': true });
  assert.ok(s.hooks.PostToolUse);
  assert.equal(existsSync(r.p.settings), false, 'base file is the image layer');
  assert.equal(existsSync(join(r.p.mkts, 'image')), false);
});

test('a marketplace-referenced plugin is re-pinned: relative sources by the marketplace SHA, external ones by their own SHA', () => {
  const r = install('build', viaMarketplace('rel'), viaMarketplace('ext'));
  assert.equal(r.code, 0, r.err);
  const pins = json(join(r.p.mkts, 'image/pins.json'));
  assert.equal(pins.rel.sha, sha.mkt);
  assert.equal(pins.ext.sha, sha.plugins);
  assert.ok(existsSync(join(r.p.mkts, 'image/plugins/rel/.claude-plugin/plugin.json')));
});

test('a marketplace-referenced plugin whose external source lacks a SHA is rejected, naming the entry', () => {
  const r = install('build', viaMarketplace('floating'));
  assert.notEqual(r.code, 0);
  assert.match(r.err, /extensions\[0\] \(plugin "acme\/mkt:floating"\).*lacks a full 40-character commit SHA/);
  assert.equal(existsSync(r.p.settings), false);
});

test('plugin and hook problems name the entry: unknown plugin, bad path, floating hook ref, Codex plugin', () => {
  assert.match(install('build', viaMarketplace('nope')).err, /has no plugin "nope"/);
  assert.match(install('build', direct({ source: { github: 'acme/plugins', path: 'plugins/none', sha: sha.plugins } })).err, /does not exist at the pinned commit/);
  assert.match(install('build', hook({ source: { github: 'acme/plugins', path: 'hooks', sha: sha.plugins } })).err, /must be a file/);
  assert.match(install('build', hook({ source: { github: 'acme/plugins', path: 'hooks/fmt.sh', sha: 'main' } })).err, /not a full 40-character commit SHA/);
  const codex = install('build', direct({ agents: ['codex'] }));
  assert.match(codex.err, /extensions\[0\] \(plugin .*kind "plugin" is not supported for codex/);
  const codexHook = install('build', hook({ agents: ['codex'] }));
  assert.match(codexHook.err, /kind "hook" is not supported for codex/);
});
