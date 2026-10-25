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
  assert.equal(v.doc.variant, 'node', 'the Variant is read from the image repository');
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

test('render-template --replace swaps an existing .devcontainer/ for the Template and lists what it removed', () => {
  const p = dir({
    'package.json': '{}',
    '.devcontainer/devcontainer.json': '{ "image": "mcr.microsoft.com/devcontainers/javascript-node" }',
    '.devcontainer/Dockerfile': 'FROM node:24\n',
    '.devcontainer/scripts/setup.sh': 'echo hi\n',
  });
  // A failing render (unknown option) keeps the old dev container.
  assert.equal(h(['render-template', 'node', p, '--image', IMAGE, '--option', 'nope=1', '--replace']).code, 2);
  assert.ok(existsSync(join(p, '.devcontainer/Dockerfile')));

  const r = h(['render-template', 'node', p, '--image', IMAGE, '--replace']);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.doc.replaced.sort(), ['.devcontainer/Dockerfile', '.devcontainer/devcontainer.json', '.devcontainer/scripts/setup.sh']);
  assert.deepEqual(snapshot(join(p, '.devcontainer')), ['devcontainer.json', 'extensions.json']);
  assert.equal(h(['validate', p]).code, 0);
});

test('import-lockfile and frozen-install refuse projects they cannot act on, writing nothing', () => {
  const none = dir({ 'package.json': '{}' });
  assert.match(h(['import-lockfile', none]).doc.error, /no package-lock.json/);
  assert.match(h(['frozen-install', none]).doc.error, /no pnpm-lock.yaml/);
  const pnpm = dir({ 'package.json': '{}', 'pnpm-lock.yaml': '' });
  const r = h(['import-lockfile', pnpm]);
  assert.equal(r.code, 1);
  assert.match(r.doc.error, /already has pnpm-lock.yaml/);
  assert.deepEqual(snapshot(none), ['package.json']);
  assert.deepEqual(snapshot(pnpm), ['package.json', 'pnpm-lock.yaml']);
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

// ---------- Presets ----------

/** A dev-setups checkout whose presets/ the test controls; everything else links to this one. */
function checkout(presetFiles) {
  const c = join(root, `checkout${n++}`);
  for (const d of ['variants', 'templates', 'installer']) {
    mkdirSync(c, { recursive: true });
    symlinkSync(join(REPO, d), join(c, d));
  }
  cpSync(SKILL, join(c, 'skills/dev-container'), { recursive: true });
  mkdirSync(join(c, 'presets'));
  for (const [f, v] of Object.entries(presetFiles)) writeFileSync(join(c, 'presets', f), typeof v === 'string' ? v : JSON.stringify(v));
  return { dir: c, h: (args) => h(args, { via: join(c, 'skills/dev-container/scripts/dev-container.mjs') }) };
}

const sha = (c) => c.repeat(40);
const skillEntry = (path, s = sha('a')) => ({ kind: 'skill', agents: ['claude'], source: { github: 'acme/skills', path, sha: s } });
const remoteMcp = (name, domain) => ({ kind: 'mcp-remote', agents: ['claude'], name, url: `https://${domain}/mcp`, egress: [domain] });
const WEB = { description: 'Web app work.', extensions: [skillEntry('skills/lint'), skillEntry('skills/fmt'), remoteMcp('docs', 'docs.example.com')], egress: ['cdn.example.com', 'shared.example.com'] };
const API = { description: 'API work.', extensions: [skillEntry('skills/fmt')], egress: ['shared.example.com'] };

test('presets lists every Preset with its description and reports invalid Preset files', () => {
  const c = checkout({
    'web-app.json': WEB,
    'api.json': API,
    'README.md': 'not a Preset',
    'no-description.json': { extensions: [] },
    'tagged.json': { description: 'x', extensions: [{ ...skillEntry('s'), preset: 'web-app' }] },
    'floating.json': { description: 'x', extensions: [skillEntry('s', 'main')] },
    'broken.json': '{',
    'Bad Name.json': { description: 'x', extensions: [] },
  });
  const r = c.h(['presets']);
  assert.equal(r.code, 0, r.err);
  const by = Object.fromEntries(r.doc.presets.map((p) => [p.name, p]));
  assert.deepEqual(Object.keys(by).sort(), ['Bad Name', 'api', 'broken', 'floating', 'no-description', 'tagged', 'web-app']);
  assert.deepEqual(by['web-app'].problems, []);
  assert.equal(by['web-app'].description, 'Web app work.');
  assert.deepEqual(by['web-app'].extensions, WEB.extensions);
  assert.deepEqual(by['web-app'].egress, WEB.egress);
  assert.match(by['no-description'].problems.join(), /"description" is required/);
  assert.match(by.tagged.problems.join(), /carry no "preset" tag/);
  assert.match(by.floating.problems.join(), /not a full 40-character commit SHA/);
  assert.match(by.broken.problems.join(), /not valid JSON/);
  assert.match(by['Bad Name'].problems.join(), /not a Preset name/);
  assert.equal(by.floating.extensions, undefined, 'an invalid Preset offers nothing to copy');

  assert.equal(c.h(['presets', '--name', 'web-app']).code, 0);
  assert.equal(c.h(['presets', '--name', 'floating']).code, 1);
  assert.match(c.h(['presets', '--name', 'nope']).doc.error, /no Preset "nope"/);
});

test('this checkout has a presets/ directory whose Presets are all valid', () => {
  const r = h(['presets']);
  assert.equal(r.code, 0, r.err);
  for (const p of r.doc.presets) assert.deepEqual(p.problems, [], p.name);
});

/** A rendered project whose manifest holds the given entries and egress. */
function project(extensions, egress) {
  const p = dir();
  assert.equal(h(['render-template', 'node', p, '--image', IMAGE]).code, 0);
  const file = join(p, '.devcontainer/extensions.json');
  const mf = JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(file, JSON.stringify({ ...mf, extensions, ...(egress ? { egress } : {}) }, null, 2));
  return p;
}
const tag = (preset, entries) => entries.map((e) => ({ ...e, preset }));

test('validate accepts Preset-tagged entries and counts them per Preset', () => {
  const p = project([...tag('web-app', WEB.extensions), skillEntry('skills/own')], ['cdn.example.com', 'shared.example.com']);
  const r = h(['validate', p]);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.doc.presets, { 'web-app': 3 });
});

test('validate rejects a skill name declared twice, e.g. by two adopted Presets', () => {
  const twice = h(['validate', project([...tag('web-app', [skillEntry('skills/fmt')]), ...tag('api', [skillEntry('skills/fmt', sha('b'))])])]);
  assert.equal(twice.code, 1);
  assert.match(twice.doc.problems.join(), /skill name "fmt" is already declared/);
});

// ---------- Egress and secrets (SC-07) ----------

/** Adds remoteEnv lines to the rendered devcontainer.json as the agent would: a text edit that keeps the comments. */
function addRemoteEnv(p, lines) {
  const file = join(p, '.devcontainer/devcontainer.json');
  const text = readFileSync(file, 'utf8');
  assert.match(text, /"remoteEnv": \{\n/);
  writeFileSync(file, text.replace('"remoteEnv": {\n', `"remoteEnv": {\n${lines.map((l) => `    ${l},\n`).join('')}`));
  return readFileSync(file, 'utf8');
}
const stdioMcp = (name, env) => ({ kind: 'mcp', agents: ['claude', 'codex'], name, source: { npm: `@acme/${name}`, version: '1.2.3' }, env });

test('a domain allowed in the project manifest is reported by validate; a URL is not a domain', () => {
  const ok = h(['validate', project([], ['api.example.com'])]);
  assert.equal(ok.code, 0, ok.out);
  assert.deepEqual(ok.doc.egress, ['api.example.com']);

  const url = h(['validate', project([], ['https://api.example.com/v1'])]);
  assert.equal(url.code, 1);
  assert.match(url.doc.problems.join(), /egress/);
});

test('validate passes a named secret with a ${localEnv:} remoteEnv entry and keeps the Template comments', () => {
  const p = project([stdioMcp('search', ['FOO']), { ...remoteMcp('docs', 'docs.example.com'), bearerTokenEnv: 'DOCS_TOKEN' }]);
  const text = addRemoteEnv(p, ['"FOO": "${localEnv:FOO}"', '"DOCS_TOKEN": "${localEnv:MY_DOCS_TOKEN}"']);
  assert.match(text, /\/\/ MCP secrets:/);
  const r = h(['validate', p]);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.doc.secrets, [
    { name: 'FOO', neededBy: ['extensions[0] (mcp "search")'], hostEnv: 'FOO' },
    { name: 'DOCS_TOKEN', neededBy: ['extensions[1] (mcp-remote "docs")'], hostEnv: 'MY_DOCS_TOKEN' },
  ]);
});

test('validate flags a named secret without a remoteEnv entry, or with a value instead of a host reference, never printing the value', () => {
  const missing = h(['validate', project([stdioMcp('search', ['FOO'])])]);
  assert.equal(missing.code, 1);
  assert.match(missing.doc.problems.join(), /secret FOO \(named by extensions\[0\] \(mcp "search"\)\) has no remoteEnv entry; add "FOO": "\$\{localEnv:FOO\}"/);
  assert.deepEqual(missing.doc.secrets, [{ name: 'FOO', neededBy: ['extensions[0] (mcp "search")'], hostEnv: null }]);

  for (const value of ['s3cr3t-value', '${localEnv:FOO:s3cr3t-value}', '${containerEnv:FOO}']) {
    const p = project([stdioMcp('search', ['FOO'])]);
    addRemoteEnv(p, [`"FOO": ${JSON.stringify(value)}`]);
    const r = h(['validate', p]);
    assert.equal(r.code, 1, value);
    assert.match(r.doc.problems.join(), /remoteEnv FOO must be a host reference/);
    assert.doesNotMatch(r.out + r.err, /s3cr3t/, 'a value is never echoed');
  }

  // Without a remoteEnv object at all, every named secret is reported.
  const bare = dir({
    '.devcontainer/devcontainer.json': `{ "image": "${IMAGE}" }`,
    '.devcontainer/extensions.json': JSON.stringify({ extensions: [stdioMcp('a', ['ONE', 'TWO'])] }),
  });
  assert.equal(h(['validate', bare]).doc.problems.filter((x) => /has no remoteEnv entry/.test(x)).length, 2);
});

test('plan-remove-preset drops exactly the tagged entries and the egress nothing else needs, and writes nothing', () => {
  const c = checkout({ 'web-app.json': WEB, 'api.json': API });
  const apiDocs = remoteMcp('api-docs', 'api.example.com');
  const own = remoteMcp('cdn-tools', 'cdn.example.com');
  // web-app and api adopted (copied by different paths: fmt only once), plus the project's own entry.
  const p = project(
    [...tag('web-app', WEB.extensions), ...tag('api', [apiDocs]), own],
    ['cdn.example.com', 'shared.example.com', 'mine.example.com'],
  );
  const file = join(p, '.devcontainer/extensions.json');
  const before = readFileSync(file, 'utf8');

  const r = c.h(['plan-remove-preset', p, 'web-app']);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.doc.remove.map((x) => x.index), [0, 1, 2], 'every web-app entry, nothing else');
  assert.deepEqual(r.doc.egress, [], 'cdn is needed by the own entry, shared by api');
  assert.deepEqual(r.doc.keepEgress.map((k) => k.domain), ['cdn.example.com', 'shared.example.com']);
  assert.match(r.doc.keepEgress[0].neededBy.join(), /^extensions\[4\] \(mcp-remote "cdn-tools"\)$/);
  assert.deepEqual(r.doc.keepEgress[1].neededBy, ['Preset "api"']);
  assert.equal(readFileSync(file, 'utf8'), before, 'the plan writes nothing');

  // Applying the plan as the agent would leaves a valid manifest without the tag.
  const mf = JSON.parse(before);
  mf.extensions = mf.extensions.filter((_, i) => !r.doc.remove.some((x) => x.index === i));
  writeFileSync(file, JSON.stringify(mf));
  const after = h(['validate', p]);
  assert.equal(after.code, 0, after.out);
  assert.deepEqual(after.doc.presets, { api: 1 });

  // Without the overlap, the Preset's egress goes; a domain it never listed stays.
  const solo = project(tag('web-app', WEB.extensions), ['cdn.example.com', 'shared.example.com', 'mine.example.com']);
  assert.deepEqual(c.h(['plan-remove-preset', solo, 'web-app']).doc.egress, ['cdn.example.com', 'shared.example.com']);
  assert.match(c.h(['plan-remove-preset', solo, 'api']).doc.error, /no entry .* is tagged/);
});

test('a project manifest saved as a Preset (tags removed, description added) passes presets', () => {
  const p = project([...tag('web-app', WEB.extensions), skillEntry('skills/own')], ['cdn.example.com']);
  const mf = JSON.parse(readFileSync(join(p, '.devcontainer/extensions.json'), 'utf8'));
  const c = checkout({});
  const asIs = { ...mf, description: 'Saved.' };
  writeFileSync(join(c.dir, 'presets/saved.json'), JSON.stringify(asIs));
  assert.match(c.h(['presets', '--name', 'saved']).doc.preset.problems.join(), /carry no "preset" tag/, 'tags must be stripped');

  const saved = { ...asIs, extensions: mf.extensions.map(({ preset, ...e }) => e) };
  writeFileSync(join(c.dir, 'presets/saved.json'), JSON.stringify(saved));
  const r = c.h(['presets', '--name', 'saved']);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.doc.preset.extensions.length, 4);
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

test('verify-image has no option that skips a check', () => {
  for (const flag of ['--insecure', '--skip-verify', '--force', '--no-verify']) {
    const r = h(['verify-image', 'node', flag]);
    assert.equal(r.code, 2, flag);
    assert.equal(r.doc.ok, false);
  }
});

test('the accepted signer is exactly the release workflow ci.yml signs with, on main', async () => {
  const { SIGNER } = await import('../commands.mjs');
  const id = new RegExp(SIGNER.identityRegexp); // Go RE2 syntax; (?i:...) also works in Node 24
  const wf = (repo, ref = 'refs/heads/main', file = 'ci.yml') => `https://github.com/${repo}/.github/workflows/${file}@${ref}`;
  assert.ok(id.test(wf('ValeriD/dev-setup')));
  assert.ok(id.test(wf('valerid/dev-setup')), 'GitHub owner/repo names are case-insensitive');
  for (const other of [wf('ValeriD/dev-setup', 'refs/heads/feature'), wf('ValeriD/dev-setup', 'refs/pull/1/merge'),
    wf('ValeriD/dev-setup', undefined, 'other.yml'), wf('ValeriD/dev-setup-fork'), wf('mallory/dev-setup'),
    `${wf('ValeriD/dev-setup')}x`]) {
    assert.ok(!id.test(other), other);
  }
});

test('imageChanges lists Agent version changes and only the commits that touch the image', async () => {
  const { imageChanges } = await import('../commands.mjs');
  const repo = dir();
  const git = (...a) => {
    const r = spawnSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  const change = (file, msg) => {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), msg);
    git('add', '-A');
    git('commit', '-qm', msg);
    return git('rev-parse', 'HEAD');
  };
  git('init', '-q');
  const from = change('base/a', 'start');
  change('docs/x.md', 'docs only');
  change('base/egress/start.sh', 'tighten egress');
  change('variants/other/Dockerfile', 'other variant');
  change('installer/src/index.mjs', 'installer fix');
  const to = change('variants/node/Dockerfile', 'bump codex');

  const v = (claudeCode, codex) => ({ claudeCode, codex, pnpm: '11.0.0' });
  const c = imageChanges(repo, 'node', { revision: from, versions: v('2.1.0', '0.1.0') }, { revision: to, versions: v('2.1.0', '0.2.0') });
  assert.deepEqual(c.versions, [{ name: 'codex', from: '0.1.0', to: '0.2.0' }]);
  assert.deepEqual(c.log.map((e) => e.subject), ['bump codex', 'installer fix', 'tighten egress']);
  assert.equal(c.newer, true);
  const back = imageChanges(repo, 'node', { revision: to, versions: v('2.1.0', '0.2.0') }, { revision: from, versions: v('2.1.0', '0.1.0') });
  assert.equal(back.newer, false, 'an older signed image is flagged as a rollback');

  const unknown = imageChanges(repo, 'node', { revision: 'f'.repeat(40), versions: {} }, { revision: to, versions: v('2.1.0', '0.2.0') });
  assert.equal(unknown.log, null);
  assert.match(unknown.logNote, /not in the dev-setups checkout.*fetch/);
  assert.equal(unknown.versions.length, 3, 'an unlabelled image shows every version as new');
});
