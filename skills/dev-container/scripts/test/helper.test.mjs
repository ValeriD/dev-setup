// dev-container skill helper: integration tests through its CLI, in temp dirs
// with a temp HOME. No network, no Docker (the container path is covered by
// tests/dev-container-skill.test.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = dirname(dirname(fileURLToPath(import.meta.url)));
const SKILL = dirname(SCRIPTS);
const REPO = dirname(dirname(SKILL));
const HELPER = join(SCRIPTS, 'dev-container.mjs');
const DIGEST = 'sha256:' + 'a'.repeat(64);
const IMAGE = `ghcr.io/valerid/dev-setup/node@${DIGEST}`;
const root = mkdtempSync(join(tmpdir(), 'dc-helper-test-'));
const home = join(root, 'home');

before(() => mkdirSync(home));
after(() => rmSync(root, { recursive: true, force: true }));

/** Run the helper (optionally through another path) with the temp HOME. */
function h(args, { via = HELPER, env = {} } = {}) {
  const r = spawnSync('node', [via, ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: '', ...env },
  });
  let doc;
  try {
    doc = JSON.parse(r.stdout);
  } catch {
    doc = undefined;
  }
  return { code: r.status, doc, out: r.stdout, err: r.stderr };
}

let n = 0;
function dir(files = {}) {
  const d = join(root, `p${n++}`);
  mkdirSync(d);
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(dirname(join(d, f)), { recursive: true });
    writeFileSync(join(d, f), text);
  }
  return d;
}

const snapshot = (d) => readdirSync(d, { recursive: true }).sort();

test('variants proposes node for a folder with package.json', () => {
  const r = h(['variants', '--dir', dir({ 'package.json': '{}' })]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.doc.proposal, 'node');
  assert.equal(r.doc.ambiguous, false);
  assert.deepEqual(r.doc.matches, [{ name: 'node', signals: ['package.json'] }]);
  assert.ok(r.doc.variants.find((v) => v.name === 'node').description);
});

test('variants reports ambiguous for an empty folder', () => {
  const r = h(['variants', '--dir', dir()]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.doc.proposal, null);
  assert.equal(r.doc.ambiguous, true);
});

test('resolve-target: URL goes under the projects root, new names too, local folders stay put', () => {
  const projects = join(root, 'projects');
  const url = h(['resolve-target', 'https://github.com/acme/web-app.git', '--projects-root', projects]);
  assert.equal(url.doc.kind, 'url');
  assert.equal(url.doc.path, join(projects, 'web-app'));
  assert.equal(url.doc.exists, false);

  const scp = h(['resolve-target', 'git@github.com:acme/api.git']);
  assert.equal(scp.doc.path, join(home, 'Documents/Work/dev/api'), 'default projects root is under HOME');

  const fresh = h(['resolve-target', 'brand-new', '--projects-root', projects]);
  assert.equal(fresh.doc.kind, 'new');
  assert.equal(fresh.doc.path, join(projects, 'brand-new'));

  const local = dir({ '.git/HEAD': '', 'package-lock.json': '{}', 'docs/agents/x.md': '' });
  const l = h(['resolve-target', local]);
  assert.equal(l.doc.kind, 'local');
  assert.equal(l.doc.path, local);
  assert.equal(l.doc.isGitRepo, true);
  assert.equal(l.doc.hasDocsAgents, true);
  assert.deepEqual(l.doc.lockfiles, ['package-lock.json']);

  assert.equal(h(['resolve-target', 'not/a/real/folder']).code, 2);
  assert.equal(h(['resolve-target', 'https://github.com/acme/web-app/tree/main']).code, 2, 'a page URL is not a clone URL');
});

test('render-template writes a .devcontainer that validate accepts', () => {
  const p = dir({ 'package.json': '{}' });
  const r = h(['render-template', 'node', p, '--image', IMAGE, '--option', 'patEnvVar=MY_PAT']);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.doc.files.sort(), ['.devcontainer/devcontainer.json', '.devcontainer/extensions.json']);
  const dc = readFileSync(join(p, '.devcontainer/devcontainer.json'), 'utf8');
  assert.match(dc, /\$\{localEnv:MY_PAT\}/);
  assert.doesNotMatch(dc, /templateOption/);
  const mf = JSON.parse(readFileSync(join(p, '.devcontainer/extensions.json'), 'utf8'));
  assert.deepEqual(mf.extensions, []);
  assert.match(mf.$schema, /extensions\.schema\.json$/);

  const v = h(['validate', p]);
  assert.equal(v.code, 0, v.out);
  assert.deepEqual(v.doc.problems, []);
  assert.equal(v.doc.image, IMAGE);
});

test('render-template refuses a tag-only image, unknown options and an existing dev container, writing nothing', () => {
  const p = dir();
  assert.equal(h(['render-template', 'node', p, '--image', 'ghcr.io/valerid/dev-setup/node:latest']).code, 2);
  assert.equal(h(['render-template', 'node', p, '--image', IMAGE, '--option', 'nope=1']).code, 2);
  assert.equal(h(['render-template', 'bogus', p, '--image', IMAGE]).code, 2);
  assert.deepEqual(snapshot(p), []);

  const existing = dir({ '.devcontainer/devcontainer.json': '{"image":"x"}' });
  const r = h(['render-template', 'node', existing, '--image', IMAGE]);
  assert.equal(r.code, 1);
  assert.match(r.doc.error, /migrate/);
  assert.deepEqual(snapshot(existing), ['.devcontainer', '.devcontainer/devcontainer.json']);
});

test('validate reports broken JSONC, unpinned images, placeholders and invalid manifests', () => {
  const good = JSON.stringify({ extensions: [] });
  const cases = [
    [{ '.devcontainer/devcontainer.json': '{ "image": "x@' + DIGEST + '" // ok\n', '.devcontainer/extensions.json': good }, /CloseBraceExpected|EndOfFileExpected/],
    [{ '.devcontainer/devcontainer.json': '{ "image": "node:24" }', '.devcontainer/extensions.json': good }, /digest-pinned/],
    [{ '.devcontainer/devcontainer.json': `{ "image": "${IMAGE}", "x": "\${templateOption:patEnvVar}" }`, '.devcontainer/extensions.json': good }, /unrendered placeholder/],
    [{ '.devcontainer/devcontainer.json': `{ "image": "${IMAGE}" }` }, /Extension Manifest\) is missing/],
    [{ '.devcontainer/devcontainer.json': `{ "image": "${IMAGE}" }`, '.devcontainer/extensions.json': '{"extensions":[{"kind":"skill","agents":["claude"],"source":{"github":"a/b","path":"s","sha":"main"}}]}' }, /not a full 40-character commit SHA/],
  ];
  for (const [files, re] of cases) {
    const r = h(['validate', dir(files)]);
    assert.equal(r.code, 1, JSON.stringify(files));
    assert.match(r.doc.problems.join('\n'), re);
  }
  // Comments and trailing commas are fine in devcontainer.json.
  const ok = h(['validate', dir({ '.devcontainer/devcontainer.json': `// c\n{ "image": "${IMAGE}", }`, '.devcontainer/extensions.json': good })]);
  assert.equal(ok.code, 0, ok.out);
});

test('vscode-settings reports missing keys in a JSONC settings file and satisfied once set', () => {
  const s = join(dir(), 'settings.json');
  const missing = h(['vscode-settings', '--settings', s]);
  assert.equal(missing.doc.exists, false);
  assert.equal(missing.doc.satisfied, false);
  assert.equal(missing.doc.missing.length, 2);

  writeFileSync(s, '{\n  // mine\n  "editor.tabSize": 2,\n  "dev.containers.copyGitConfig": true,\n}\n');
  const partial = h(['vscode-settings', '--settings', s]);
  assert.deepEqual(partial.doc.missing.map((m) => [m.key, m.have]), [['dev.containers.copyGitConfig', true], ['dev.containers.dockerCredentialHelper', null]]);

  writeFileSync(s, '{ "dev.containers.copyGitConfig": false, "dev.containers.dockerCredentialHelper": false }');
  assert.equal(h(['vscode-settings', '--settings', s]).doc.satisfied, true);

  // The default path is under HOME, never the real user's settings in tests.
  assert.equal(h(['vscode-settings']).doc.path.startsWith(home), true);
});

test('first-lockfile refuses a project that already has a lockfile', () => {
  const p = dir({ 'package-lock.json': '{}' });
  const r = h(['first-lockfile', p]);
  assert.equal(r.code, 1);
  assert.match(r.doc.error, /already has package-lock.json/);
  assert.deepEqual(snapshot(p), ['package-lock.json']);
});

test('a copy of the skill outside a dev-setups checkout exits with the re-link message and changes nothing', () => {
  const fake = join(root, 'fake-checkout/skills/dev-container');
  cpSync(SKILL, fake, { recursive: true, filter: (s) => !s.includes('node_modules') });
  const link = join(root, 'link-to-fake');
  symlinkSync(fake, link);
  const p = dir();
  const r = h(['render-template', 'node', p, '--image', IMAGE], { via: join(link, 'scripts/dev-container.mjs') });
  assert.equal(r.code, 3);
  assert.equal(r.doc.relink, true);
  assert.match(r.doc.message, /not inside a dev-setups checkout[\s\S]*ln -sfn/);
  assert.deepEqual(snapshot(p), []);
});

test('a broken or foreign skill link in the Claude config exits with the re-link message', () => {
  const cfg = join(root, 'claude-config');
  mkdirSync(join(cfg, 'skills'), { recursive: true });
  const link = join(cfg, 'skills/dev-container');

  symlinkSync(join(root, 'moved-away/skills/dev-container'), link);
  const broken = h(['check'], { env: { CLAUDE_CONFIG_DIR: cfg } });
  assert.equal(broken.code, 3);
  assert.match(broken.doc.message, /is broken[\s\S]*ln -sfn/);

  rmSync(link);
  symlinkSync(dir(), link);
  const foreign = h(['variants'], { env: { CLAUDE_CONFIG_DIR: cfg } });
  assert.equal(foreign.code, 3);
  assert.match(foreign.doc.message, /points to/);

  rmSync(link);
  symlinkSync(SKILL, link);
  const good = h(['check'], { env: { CLAUDE_CONFIG_DIR: cfg } });
  assert.equal(good.code, 0, good.err);
  assert.equal(good.doc.repo, REPO);
});

test('no helper source runs git commit or executes files', () => {
  for (const f of ['dev-container.mjs', 'commands.mjs']) {
    const src = readFileSync(join(SCRIPTS, f), 'utf8');
    assert.doesNotMatch(src, /\bcommit\b/, `${f} must not run git commit, directly or through sh -c`);
    assert.doesNotMatch(src, /\bexec(File)?(Sync)?\(/, `${f} spawns only fixed programs through spawnSync`);
  }
});

test('the devcontainer CLI pin matches the acceptance suite and CI', async () => {
  const { DEVCONTAINER_CLI } = await import('../commands.mjs');
  const version = DEVCONTAINER_CLI.split('@').pop();
  assert.ok(readFileSync(join(REPO, 'tests/lib.mjs'), 'utf8').includes(`'${DEVCONTAINER_CLI}'`));
  assert.ok(readFileSync(join(REPO, '.github/workflows/ci.yml'), 'utf8').includes(`CLI_VERSION: ${version}`));
});
