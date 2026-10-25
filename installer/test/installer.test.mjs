// SC-14: installer integration tests through the CLI, against local bare-git
// fixtures. No network. Run with `node --test`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const SCHEMA = fileURLToPath(new URL('../extensions.schema.json', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'installer-test-'));
const gitBase = join(root, 'git');
let sha; // commit of fixture repo acme/skills
let shaOld;

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' }).trim();

before(() => {
  const work = join(root, 'work');
  mkdirSync(join(work, 'skills/lint'), { recursive: true });
  mkdirSync(join(work, 'skills/fmt/refs'), { recursive: true });
  writeFileSync(join(work, 'skills/lint/SKILL.md'), '---\nname: lint\ndescription: lints\n---\nv1\n');
  git(work, 'init', '-q', '-b', 'main');
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'one');
  shaOld = git(work, 'rev-parse', 'HEAD');
  writeFileSync(join(work, 'skills/lint/SKILL.md'), '---\nname: lint\ndescription: lints\n---\nv2\n');
  writeFileSync(join(work, 'skills/fmt/SKILL.md'), '---\nname: fmt\ndescription: formats\n---\n');
  writeFileSync(join(work, 'skills/fmt/refs/a.txt'), 'ref\n');
  writeFileSync(join(work, 'skills/fmt/run.sh'), '#!/bin/sh\necho SHOULD-NOT-RUN > "$MARKER"\n', { mode: 0o755 });
  mkdirSync(join(work, 'skills/nomd'));
  writeFileSync(join(work, 'skills/nomd/x.txt'), 'x');
  mkdirSync(join(work, 'skills/link'));
  writeFileSync(join(work, 'skills/link/SKILL.md'), 'x');
  symlinkSync('/etc/passwd', join(work, 'skills/link/passwd'));
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'two');
  sha = git(work, 'rev-parse', 'HEAD');
  git(work, 'tag', 'v1.0');
  mkdirSync(join(gitBase, 'acme'), { recursive: true });
  git(root, 'clone', '-q', '--bare', work, join(gitBase, 'acme/skills.git'));
});
after(() => rmSync(root, { recursive: true, force: true }));

let n = 0;
/** Write manifests, run the CLI, return {code, out, err, dirs}. */
function install(...manifests) {
  const d = join(root, `run${n++}`);
  mkdirSync(d);
  const files = manifests.map((m, i) => {
    const f = join(d, `m${i}.json`);
    writeFileSync(f, typeof m === 'string' ? m : JSON.stringify(m));
    return f;
  });
  const dirs = { claude: join(d, 'claude'), codex: join(d, 'codex'), egress: join(d, 'out/allowlist.txt'), marker: join(d, 'marker') };
  const args = [CLI, 'install', '--mode', 'build', '--git-base', gitBase, '--claude-skills', dirs.claude, '--codex-skills', dirs.codex, '--egress-out', dirs.egress];
  for (const f of files) args.push('--manifest', f);
  const r = spawnSync('node', args, { encoding: 'utf8', env: { ...process.env, MARKER: dirs.marker } });
  return { code: r.status, out: r.stdout, err: r.stderr, dirs, files };
}
const skill = (extra = {}, path = 'skills/lint', s = sha) => ({
  kind: 'skill', agents: ['claude', 'codex'], source: { github: 'acme/skills', path, sha: s }, ...extra,
});
const manifest = (...extensions) => ({ extensions });

test('a skill for both Agents lands in both skill directories, copied verbatim, and nothing is executed', () => {
  const r = install(manifest(skill(), skill({}, 'skills/fmt')));
  assert.equal(r.code, 0, r.err);
  for (const agent of ['claude', 'codex']) {
    assert.match(readFileSync(join(r.dirs[agent], 'lint/SKILL.md'), 'utf8'), /v2/);
    assert.equal(readFileSync(join(r.dirs[agent], 'fmt/refs/a.txt'), 'utf8'), 'ref\n');
    assert.ok(!existsSync(join(r.dirs[agent], 'lint/.git')));
  }
  assert.ok(!existsSync(r.dirs.marker), 'fetched scripts must never run');
});

test('the Pinned Ref decides the content: an older SHA installs the older content', () => {
  const r = install(manifest(skill({}, 'skills/lint', shaOld)));
  assert.equal(r.code, 0, r.err);
  assert.match(readFileSync(join(r.dirs.claude, 'lint/SKILL.md'), 'utf8'), /v1/);
});

test('an entry for one Agent only is installed for that Agent only', () => {
  const r = install(manifest(skill({ agents: ['codex'] })));
  assert.equal(r.code, 0, r.err);
  assert.ok(existsSync(join(r.dirs.codex, 'lint')));
  assert.ok(!existsSync(join(r.dirs.claude, 'lint')));
});

test('name overrides the directory name', () => {
  const r = install(manifest(skill({ name: 'linter' })));
  assert.equal(r.code, 0, r.err);
  assert.ok(existsSync(join(r.dirs.claude, 'linter/SKILL.md')));
});

test('a Preset tag and a description are accepted and do not change what is installed', () => {
  const r = install({ description: 'Linting.', extensions: [skill({ preset: 'web-app' })] });
  assert.equal(r.code, 0, r.err);
  assert.ok(existsSync(join(r.dirs.claude, 'lint/SKILL.md')));
});

const rejected = [
  ['a branch', { ...skill(), source: { github: 'acme/skills', path: 'skills/lint', ref: 'main' } }, /floating ref "ref"/],
  ['a branch in the sha field', skill({}, 'skills/lint', 'main'), /"main" is not a full 40-character commit SHA/],
  ['a tag in the sha field', skill({}, 'skills/lint', 'v1.0'), /"v1.0" is not a full 40-character commit SHA/],
  ['a tag key', { ...skill(), source: { github: 'acme/skills', path: 'skills/lint', tag: 'v1.0' } }, /floating ref "tag"/],
  ['a short sha', skill({}, 'skills/lint', 'abc1234'), /not a full 40-character commit SHA/],
  ['an uppercase sha', skill({}, 'skills/lint', 'A'.repeat(40)), /not a full 40-character commit SHA/],
  ['no ref', { ...skill(), source: { github: 'acme/skills', path: 'skills/lint' } }, /missing Pinned Ref/],
  ['codex plugin', { kind: 'plugin', agents: ['codex'], source: { github: 'acme/skills', path: 'p', sha: 'a'.repeat(40) } }, /kind "plugin" is not supported for codex/],
  ['plugin for both Agents', { kind: 'plugin', agents: ['claude', 'codex'], source: { github: 'acme/skills', path: 'p', sha: 'a'.repeat(40) } }, /kind "plugin" is not supported for codex/],
  ['codex hook', { kind: 'hook', agents: ['codex'], event: 'PostToolUse', source: { github: 'acme/skills', path: 'h.sh', sha: 'a'.repeat(40) } }, /kind "hook" is not supported for codex/],
  ['an npm range', { kind: 'mcp', agents: ['claude'], name: 'gh', source: { npm: '@s/x', version: '^1.2.3' } }, /not an exact version/],
  ['an npm dist-tag', { kind: 'mcp', agents: ['claude'], name: 'gh', source: { npm: '@s/x', version: 'latest' } }, /not an exact version/],
  ['an npm package without a version', { kind: 'mcp', agents: ['claude'], name: 'gh', source: { npm: '@s/x' } }, /missing Pinned Ref/],
  ['an unknown kind', { kind: 'widget', agents: ['claude'], source: {} }, /unknown kind "widget"/],
  ['an unknown agent', skill({ agents: ['gemini'] }), /agents\/0 must be equal to one of the allowed values/],
  ['no agents', skill({ agents: [] }), /agents must NOT have fewer than 1 items/],
  ['an unknown property', skill({ extra: 1 }), /must NOT have additional properties \("extra"\)/],
  ['a path that escapes', skill({}, '../etc'), /source\/path must match pattern/],
  ['an absolute path', skill({}, '/etc'), /source\/path must match pattern/],
  ['a Preset tag that is not a Preset name', skill({ preset: 'Web App' }), /preset must match pattern/],
  ['a remote MCP without egress', { kind: 'mcp-remote', agents: ['claude'], name: 'r', url: 'https://x.example.com' }, /must have required property 'egress'/],
];
for (const [what, entry, message] of rejected) {
  test(`rejects ${what}, naming the entry`, () => {
    const r = install(manifest(skill({ name: 'ok' }), entry));
    assert.equal(r.code, 1, r.out);
    assert.match(r.err, message);
    assert.match(r.err, /extensions\[1\] \(/, 'the error must name the entry by index');
    assert.doesNotMatch(r.err, /extensions\[0\]/, 'a valid entry is not blamed');
    assert.ok(!existsSync(join(r.dirs.claude, 'ok')), 'nothing is installed when validation fails');
    assert.ok(!existsSync(r.dirs.egress), 'no allowlist is written when validation fails');
  });
}

test('the error names the entry by kind and source', () => {
  const r = install(manifest(skill({}, 'skills/lint', 'main')));
  assert.match(r.err, /extensions\[0\] \(skill "acme\/skills\/skills\/lint"\)/);
});

test('every problem is reported, from every layer file', () => {
  const r = install(manifest(skill({}, 'skills/lint', 'main')), manifest(skill({}, 'skills/lint', 'v1.0')));
  assert.equal(r.code, 1);
  assert.equal(r.err.trim().split('\n').length, 2);
  assert.match(r.err, /m0\.json: extensions\[0\]/);
  assert.match(r.err, /m1\.json: extensions\[0\]/);
});

test('malformed JSON and a missing "extensions" array fail with the file named', () => {
  let r = install('{ nope');
  assert.equal(r.code, 1);
  assert.match(r.err, /m0\.json: cannot read manifest/);
  r = install({});
  assert.equal(r.code, 1);
  assert.match(r.err, /must have required property 'extensions'/);
});

test('a SHA the server does not have fails the build naming the entry', () => {
  const r = install(manifest(skill({}, 'skills/lint', 'e'.repeat(40))));
  assert.equal(r.code, 1);
  assert.match(r.err, /extensions\[0\] \(skill .*cannot fetch e{40}/);
});

test('a missing repo, missing path, missing SKILL.md and symlinked content fail naming the entry', () => {
  let r = install(manifest({ ...skill(), source: { github: 'acme/nope', path: 'x', sha } }));
  assert.match(r.err, /extensions\[0\] \(skill "acme\/nope\/x"\): cannot fetch/);
  r = install(manifest(skill({}, 'skills/absent')));
  assert.match(r.err, /path "skills\/absent" does not exist/);
  r = install(manifest(skill({}, 'skills/nomd')));
  assert.match(r.err, /no SKILL\.md/);
  r = install(manifest(skill({}, 'skills/link')));
  assert.match(r.err, /symlinks and special files are not allowed/);
});

test('two skills with the same name are rejected, within and across layers', () => {
  let r = install(manifest(skill(), skill()));
  assert.equal(r.code, 1);
  assert.match(r.err, /skill name "lint" is already declared/);
  r = install(manifest(skill()), manifest(skill()));
  assert.equal(r.code, 1);
  assert.match(r.err, /m1\.json: extensions\[0\].*already declared by .*m0\.json extensions\[0\]/);
});

test('layers are unioned and the Egress Allowlist is assembled from them in order, deduplicated', () => {
  const base = { extensions: [], egress: ['registry.npmjs.org', 'github.com'] };
  const variant = { extensions: [skill()], egress: ['github.com', 'example.org'] };
  const r = install(base, variant);
  assert.equal(r.code, 0, r.err);
  const domains = readFileSync(r.dirs.egress, 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  assert.deepEqual(domains, ['registry.npmjs.org', 'github.com', 'example.org']);
  assert.ok(existsSync(join(r.dirs.claude, 'lint')));
});

test('the assembled allowlist is accepted by the start-up renderer format (plain hostnames only)', () => {
  const r = install({ extensions: [], egress: ['Bad_Domain.example'] });
  assert.equal(r.code, 1);
  assert.match(r.err, /manifest\/egress\/0 must match pattern/);
});

test('only build and start modes exist, and usage errors exit non-zero', () => {
  const r = spawnSync('node', [CLI, 'install', '--mode', 'watch', '--manifest', 'x.json'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.err ?? r.stderr, /unsupported --mode/);
});

test('the library entry point exports the core functions for host-side reuse', async () => {
  const lib = await import('../src/index.mjs');
  for (const f of ['validateManifest', 'checkPinnedRef', 'checkKindAgent', 'fetchBySha', 'installBuild', 'mergeLayers']) {
    assert.equal(typeof lib[f], 'function', f);
  }
  assert.deepEqual(lib.CAPABILITIES.plugin, ['claude']);
  assert.equal(lib.checkPinnedRef({ github: 'a/b', path: '.', sha: 'main' }) !== null, true);
  assert.equal(lib.checkPinnedRef({ github: 'a/b', path: '.', sha }), null);
  const { dir, cleanup } = lib.fetchBySha(lib.repoUrl('acme/skills', gitBase), sha);
  assert.ok(existsSync(join(dir, 'skills/lint/SKILL.md')));
  cleanup();
  const s = JSON.parse(readFileSync(SCHEMA, 'utf8'));
  assert.equal(s.$id, lib.schema.$id);
});

/** Start mode: build layers are validated and contribute egress; only the project layer is installed. */
function start(build, project, d = join(root, `start${n++}`)) {
  mkdirSync(d, { recursive: true });
  const write = (name, m) => { const f = join(d, name); writeFileSync(f, JSON.stringify(m)); return f; };
  const dirs = { claude: join(d, 'claude'), codex: join(d, 'codex'), egress: join(d, 'out/allowlist.txt') };
  const r = spawnSync('node', [CLI, 'install', '--mode', 'start', '--git-base', gitBase, '--claude-skills', dirs.claude, '--codex-skills', dirs.codex,
    '--egress-out', dirs.egress, '--manifest', write('build.json', build), '--project', write('project.json', project)], { encoding: 'utf8' });
  return { code: r.status, err: r.stderr, dirs, d };
}

test('start mode installs only the project layer and writes the union of egress lists', () => {
  const r = start({ extensions: [skill({}, 'skills/lint')], egress: ['base.example.org'] }, { extensions: [skill({}, 'skills/fmt')], egress: ['proj.example.org'] });
  assert.equal(r.code, 0, r.err);
  assert.ok(existsSync(join(r.dirs.claude, 'fmt/SKILL.md')) && existsSync(join(r.dirs.codex, 'fmt/SKILL.md')));
  assert.ok(!existsSync(join(r.dirs.claude, 'lint')), 'build-layer skills are not re-installed');
  const lines = readFileSync(r.dirs.egress, 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  assert.deepEqual(lines, ['base.example.org', 'proj.example.org']);
});

test('start mode rejects an invalid project entry naming it, and writes nothing', () => {
  const r = start({ extensions: [] }, { extensions: [skill({}, 'skills/lint', 'main')] });
  assert.notEqual(r.code, 0);
  assert.match(r.err, /project\.json.*extensions\[0\].*not a full 40-character commit SHA/);
  assert.ok(!existsSync(r.dirs.egress) && !existsSync(r.dirs.claude));
});

test('start mode rejects a project skill that collides with a build-layer skill, and re-running overwrites', () => {
  const r = start({ extensions: [skill()] }, { extensions: [skill()] });
  assert.notEqual(r.code, 0);
  assert.match(r.err, /skill name "lint" is already declared/);
  const first = start({ extensions: [] }, { extensions: [skill()] });
  assert.equal(first.code, 0, first.err);
  const again = start({ extensions: [] }, { extensions: [skill()] }, first.d);
  assert.equal(again.code, 0, again.err);
});
