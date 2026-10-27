// `status` (skill ticket 07, SC-09 and SC-11 helper parts) on fixture projects:
// Preset drift and the resync entries, Pinned Ref ages from local bare-git
// fixtures and the npm registry stub, egress, host env names (never values),
// and the removal plans that read the image layers (`plan-disallow`,
// `plan-remove-secret`) or secrets (`plan-remove`), on a fixture image.
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

  c = checkout('checkout');
});

/** A checkout whose presets/ the tests control; everything else links to this one, or `templates` is a copy. */
function checkout(name, { imageDefault } = {}) {
  const dir = join(root, name);
  mkdirSync(dir);
  for (const d of ['variants', 'installer', ...(imageDefault ? [] : ['templates'])]) symlinkSync(join(REPO, d), join(dir, d));
  if (imageDefault) {
    cpSync(join(REPO, 'templates'), join(dir, 'templates'), { recursive: true });
    const f = join(dir, 'templates/node/devcontainer-template.json');
    const t = JSON.parse(readFileSync(f, 'utf8'));
    t.options.image.default = imageDefault;
    writeFileSync(f, JSON.stringify(t));
  }
  cpSync(SKILL, join(dir, 'skills/dev-container'), { recursive: true });
  mkdirSync(join(dir, 'presets'));
  return { dir, helper: join(dir, 'skills/dev-container/scripts/dev-container.mjs') };
}

after(() => {
  stub?.kill();
  if (fixtureImage) spawnSync('docker', ['rmi', '-f', fixtureImage], { stdio: 'ignore' });
  rmSync(root, { recursive: true, force: true });
});

function h(args, env = {}, via = c) {
  const r = spawnSync('node', [via.helper, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env, HOME: home, CLAUDE_CONFIG_DIR: '', DEV_SETUP_GIT_BASE: gitBase, GIT_AUTHOR_NAME: '', GIT_AUTHOR_EMAIL: '',
      DEV_SETUP_GITHUB_PAT: '', MY_PAT: '',
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
const withEgress = (e, egress) => ({ ...e, egress });

// A fixture image FROM scratch holding only the two manifests the real image ships. Built once,
// on first use, and removed by the file's `after`.
let fixtureImage;
function layersImage() {
  if (fixtureImage) return fixtureImage;
  const ctx = join(root, 'layers-image');
  mkdirSync(join(ctx, 'manifests'), { recursive: true });
  writeFileSync(join(ctx, 'manifests/base.json'), JSON.stringify({ extensions: [], egress: ['github.com', 'example.org'], secrets: ['BASE_TOKEN'] }));
  writeFileSync(join(ctx, 'manifests/node.json'), JSON.stringify({
    extensions: [{ kind: 'mcp-remote', agents: ['claude'], name: 'vdocs', url: 'https://variant-docs.example.net/mcp', egress: ['variant-docs.example.net'], bearerTokenEnv: 'VARIANT_DOCS_TOKEN' }],
  }));
  writeFileSync(join(ctx, 'Dockerfile'), 'FROM scratch\nCOPY manifests /opt/dev-setup/manifests/\n');
  const image = `dc-status-layers-test:${process.pid}-${Date.now()}`;
  const built = spawnSync('docker', ['build', '-q', '-t', image, ctx], { encoding: 'utf8' });
  assert.equal(built.status, 0, built.stderr);
  return (fixtureImage = image);
}

/** Point a project at a local image by tag (a locally built image has no registry digest; validate reports that, the plans and status read it anyway). */
function pinImage(p, image) {
  const dc = join(p, '.devcontainer/devcontainer.json');
  writeFileSync(dc, readFileSync(dc, 'utf8').replace(IMAGE, image));
}

const files = (p) => ['extensions.json', 'devcontainer.json'].map((f) => readFileSync(join(p, '.devcontainer', f), 'utf8'));

let n = 0;
function project(extensions, egress, remoteEnv = {}, image = IMAGE) {
  const p = join(root, `p${n++}`);
  mkdirSync(p);
  assert.equal(h(['render-template', 'node', p, '--image', image]).code, 0);
  const mf = join(p, '.devcontainer/extensions.json');
  writeFileSync(mf, JSON.stringify({ ...JSON.parse(readFileSync(mf, 'utf8')), extensions, ...(egress ? { egress } : {}) }, null, 2));
  const dc = join(p, '.devcontainer/devcontainer.json');
  const add = Object.entries(remoteEnv).map(([k, v]) => `\n    ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('');
  writeFileSync(dc, readFileSync(dc, 'utf8').replace('"remoteEnv": {', `"remoteEnv": {${add}`));
  return p;
}

test('status reports Pinned Ref ages, egress, and unset host env names without printing a value', () => {
  setPreset('web', { description: 'Web.', extensions: [withEgress(lint(sha.skills[0]), ['cdn.example.com'])] });
  const p = project([...tag('web', [withEgress(lint(sha.skills[0]), ['cdn.example.com'])]), searchMcp, remote], ['cdn.example.com', 'mine.example.com'], { SEARCH_TOKEN: '${localEnv:SEARCH_TOKEN}' });
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

  // The pinned image is not local: the Base and Variant layers are unknown, and nothing is pulled.
  assert.equal(d.layers.known, false);
  assert.match(d.layers.reason, /not in the local image store/);
  assert.notEqual(spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }).status, 0, 'status pulled nothing');
  const P = 'Consuming Project';
  assert.deepEqual(d.egress.domains.map((x) => [x.domain, x.declaredBy]), [
    ['cdn.example.com', [{ layer: P, neededBy: 'extensions[0] (skill "acme/skills/skills/lint")' }, { layer: P, neededBy: 'top-level egress' }]],
    ['api.search.example.com', [{ layer: P, neededBy: 'extensions[1] (mcp "search")' }]],
    ['docs.example.com', [{ layer: P, neededBy: 'extensions[2] (mcp-remote "docs")' }]],
    ['mine.example.com', [{ layer: P, neededBy: 'top-level egress' }]],
  ]);
  assert.ok(d.egress.domains.every((x) => !x.coveredBy.length));
  const unknownCheck = h(['status', p, '--skip-image-check', '--domain', 'Fresh.Example.io']).doc.egress.check;
  assert.deepEqual([unknownCheck.domain, unknownCheck.allowed, unknownCheck.allowedBy], ['fresh.example.io', null, []], 'unknown, never "not allowed"');
  assert.match(unknownCheck.note, /Base coverage could not be checked/);
  const subCheck = h(['status', p, '--skip-image-check', '--domain', 'img.cdn.example.com']).doc.egress.check;
  assert.equal(subCheck.allowed, true, 'a project domain covers its subdomain, layers or not');
  assert.match(subCheck.note, /Base coverage could not be checked/, 'and says the layers are unknown');
  assert.deepEqual(subCheck.allowedBy.map((x) => x.domain), ['cdn.example.com', 'cdn.example.com']);

  assert.deepEqual(d.env.secrets.map((s) => [s.name, s.layer, s.hostEnv, s.set]), [['SEARCH_TOKEN', P, 'SEARCH_TOKEN', true]]);
  assert.deepEqual(d.env.gitIdentity.map((g) => [g.name, g.set]), [['GIT_AUTHOR_NAME', true], ['GIT_AUTHOR_EMAIL', false]]);
  assert.deepEqual(d.env.missing, ['GIT_AUTHOR_EMAIL']);
  assert.doesNotMatch(r.out, new RegExp(SECRET_VALUE), 'a secret value never reaches the output');
  assert.doesNotMatch(r.out, /"Dev"/, 'nor does the git identity');

  const unset = h(['status', p, '--skip-image-check']);
  assert.deepEqual(unset.doc.env.missing, ['SEARCH_TOKEN', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL']);
  assert.equal(d.container.found, false, 'no container for a fixture project');
  assert.equal(readFileSync(join(p, '.devcontainer/extensions.json'), 'utf8'), before, 'status writes nothing');
});

test('status notes an unset PAT host variable by name, never its value, and only when devcontainer.json passes one', () => {
  const p = join(root, `p${n++}`);
  mkdirSync(p);
  assert.equal(h(['render-template', 'node', p, '--image', IMAGE, '--option', 'patEnvVar=MY_PAT']).code, 0);

  const unset = h(['status', p, '--skip-image-check']);
  assert.equal(unset.code, 0, unset.log);
  assert.deepEqual(unset.doc.env.pat, { name: 'DEV_SETUP_GITHUB_PAT', hostEnv: 'MY_PAT', set: false, note: 'MY_PAT unset: `git push` from the container will fail' });
  assert.ok(!unset.doc.env.missing.includes('MY_PAT'), 'a note, not a missing variable');

  const set = h(['status', p, '--skip-image-check'], { MY_PAT: SECRET_VALUE });
  assert.equal(set.code, 0, set.log);
  assert.deepEqual(set.doc.env.pat, { name: 'DEV_SETUP_GITHUB_PAT', hostEnv: 'MY_PAT', set: true });
  assert.doesNotMatch(set.out, new RegExp(SECRET_VALUE), 'the PAT value never reaches the output');

  const dc = join(p, '.devcontainer/devcontainer.json');
  const withoutPat = readFileSync(dc, 'utf8').replace(/^\s*"DEV_SETUP_GITHUB_PAT":.*\n/m, '');
  assert.doesNotMatch(withoutPat, /DEV_SETUP_GITHUB_PAT/);
  writeFileSync(dc, withoutPat);
  const none = h(['status', p, '--skip-image-check']);
  assert.equal(none.code, 0, none.log);
  assert.equal(none.doc.env.pat, null, 'no PAT line, no note');
});

test('SC-09: after a Preset edit, status reports drift with a per-entry diff and the exact resync entries', () => {
  const v1 = { description: 'Web.', extensions: [withEgress(lint(sha.skills[0]), ['cdn.example.com']), remote] };
  setPreset('site', v1);
  const own = { ...lint(sha.skills[1]), name: 'own-lint' };
  const p = project([own, ...tag('site', v1.extensions)], ['mine.example.com']);
  const file = join(p, '.devcontainer/extensions.json');
  /** Resync as references/status.md says: the tagged entries are replaced in place by resync.entries. */
  const resync = (site) => {
    const mf = JSON.parse(readFileSync(file, 'utf8'));
    mf.extensions = mf.extensions.flatMap((e, i) => (i === site.indexes[0] ? site.resync.entries : site.indexes.includes(i) ? [] : [e]));
    writeFileSync(file, JSON.stringify(mf, null, 2));
  };

  const inSync = h(['status', p, '--skip-image-check']);
  assert.equal(inSync.code, 0, inSync.log);
  assert.equal(inSync.doc.presets[0].state, 'in-sync');
  assert.deepEqual(inSync.doc.presets[0].indexes, [1, 2]);

  // Edit the Preset: the skill moves to a newer SHA and needs one more domain, the remote server goes, an MCP server arrives.
  const lintV2 = withEgress(lint(sha.skills[1]), ['cdn.example.com', 'fonts.example.com']);
  setPreset('site', { description: 'Web.', extensions: [lintV2, searchMcp] });
  const r = h(['status', p, '--skip-image-check']);
  assert.equal(r.code, 0, r.log);
  const [site] = r.doc.presets;
  assert.equal(site.state, 'drifted');
  assert.deepEqual(site.diff.changed.map((x) => [x.index, x.from.source.sha, x.to.source.sha, x.to.egress]), [[1, sha.skills[0], sha.skills[1], ['cdn.example.com', 'fonts.example.com']]]);
  assert.deepEqual(site.diff.added, [searchMcp]);
  assert.deepEqual(site.diff.removed.map((x) => [x.index, x.entry.name]), [[2, 'docs']]);
  assert.deepEqual(Object.keys(site.diff).sort(), ['added', 'changed', 'removed'], 'no top-level egress to diff');
  assert.deepEqual(site.resync, { entries: tag('site', [lintV2, searchMcp]) });

  resync(site);
  const after = h(['status', p, '--skip-image-check']);
  assert.equal(after.doc.presets[0].state, 'in-sync', after.log);
  assert.deepEqual(after.doc.extensions.map((e) => [e.index, e.preset ?? null, e.pinnedRef.value]),
    [[0, null, sha.skills[1]], [1, 'site', sha.skills[1]], [2, 'site', '1.0.0']], 'own entry first and untouched, Preset entries where they were');
  assert.deepEqual(after.doc.egress.domains.find((x) => x.domain === 'mine.example.com').declaredBy, [{ layer: 'Consuming Project', neededBy: 'top-level egress' }], 'the project\'s own domain is untouched');

  // An entry whose only change is a dropped domain is drift too, and resyncing removes the domain with it.
  setPreset('site', { description: 'Web.', extensions: [withEgress(lint(sha.skills[1]), ['cdn.example.com']), searchMcp] });
  const dropped = h(['status', p, '--skip-image-check']).doc.presets[0];
  assert.equal(dropped.state, 'drifted');
  assert.deepEqual(dropped.diff.changed.map((x) => [x.index, x.from.egress, x.to.egress]), [[1, ['cdn.example.com', 'fonts.example.com'], ['cdn.example.com']]]);
  resync(dropped);
  const synced = h(['status', p, '--skip-image-check']).doc;
  assert.equal(synced.presets[0].state, 'in-sync');
  assert.deepEqual(synced.egress.domains.flatMap((x) => (x.declaredBy.some((b) => b.neededBy !== 'top-level egress') ? [x.domain] : [])), ['cdn.example.com', 'api.search.example.com']);
});

test('status reads the Base and Variant layers from the pinned image without running it, and reports their coverage', () => {
  const image = layersImage();
  const p = project([withEgress(lint(sha.skills[0]), ['cdn.example.com'])], ['api.github.com', 'mine.example.com'], { BASE_TOKEN: '${localEnv:BASE_TOKEN}' });
  pinImage(p, image);
  const since = new Date(Date.now() - 1000).toISOString();
  const r = h(['status', p, '--skip-image-check', '--domain', 'sub.example.org'], { BASE_TOKEN: SECRET_VALUE });
  assert.equal(r.code, 0, r.log);
  const d = r.doc;
  assert.deepEqual(d.layers, { known: true, image, read: [{ layer: 'Base' }, { layer: 'Variant', variant: 'node' }] });

  const by = Object.fromEntries(d.egress.domains.map((x) => [x.domain, x]));
  assert.deepEqual(Object.keys(by), ['github.com', 'example.org', 'variant-docs.example.net', 'cdn.example.com', 'api.github.com', 'mine.example.com'], 'Base, then Variant, then the project');
  assert.deepEqual(by['github.com'].declaredBy, [{ layer: 'Base', neededBy: 'top-level egress' }]);
  assert.deepEqual(by['variant-docs.example.net'].declaredBy, [{ layer: 'Variant', neededBy: 'extensions[0] (mcp-remote "vdocs")' }]);
  assert.deepEqual(by['cdn.example.com'].declaredBy, [{ layer: 'Consuming Project', neededBy: 'extensions[0] (skill "acme/skills/skills/lint")' }]);
  assert.deepEqual(by['api.github.com'].coveredBy, [{ domain: 'github.com', layer: 'Base', neededBy: 'top-level egress' }], 'a parent domain in the Base layer already allows it');
  assert.deepEqual(by['mine.example.com'].coveredBy, []);

  // "Allow" of a subdomain of a Base domain: already allowed, by that layer.
  assert.deepEqual(d.egress.check, { domain: 'sub.example.org', allowed: true, allowedBy: [{ domain: 'example.org', layer: 'Base', neededBy: 'top-level egress' }] });
  const fresh = h(['status', p, '--skip-image-check', '--domain', 'fresh.example.io']).doc.egress.check;
  assert.deepEqual(fresh, { domain: 'fresh.example.io', allowed: false, allowedBy: [] });

  // Base and Variant Named Secrets, names only, with whether each is set on the host.
  const secrets = Object.fromEntries(d.env.secrets.map((s) => [s.name, s]));
  assert.deepEqual(secrets.BASE_TOKEN, { name: 'BASE_TOKEN', layer: 'Base', neededBy: ['container-wide'], hostEnv: 'BASE_TOKEN', set: true });
  assert.equal(secrets.VARIANT_DOCS_TOKEN.layer, 'Variant');
  assert.deepEqual(secrets.VARIANT_DOCS_TOKEN.neededBy, ['extensions[0] (mcp-remote "vdocs")']);
  assert.equal(secrets.VARIANT_DOCS_TOKEN.set, false);
  assert.match(secrets.VARIANT_DOCS_TOKEN.note, /no remoteEnv "VARIANT_DOCS_TOKEN"/);
  assert.ok(d.env.missing.includes('VARIANT_DOCS_TOKEN') && !d.env.missing.includes('BASE_TOKEN'));
  assert.doesNotMatch(r.out, new RegExp(SECRET_VALUE), 'a secret value never reaches the output');

  // The layer read left no container behind and never started one.
  const left = spawnSync('docker', ['ps', '-aq', '--filter', `ancestor=${image}`], { encoding: 'utf8' });
  assert.equal(left.stdout.trim(), '', 'no container left');
  const events = spawnSync('docker', ['events', '--since', since, '--until', new Date().toISOString(), '--filter', 'type=container', '--filter', `image=${image}`, '--format', '{{.Action}}'], { encoding: 'utf8' });
  const actions = events.stdout.split('\n').filter(Boolean);
  assert.ok(actions.includes('create') && actions.includes('destroy'), `events: ${actions}`);
  assert.ok(!actions.includes('start'), `the image was never started: ${actions}`);
});

test('plan-disallow refuses a domain the Base or Variant layer, an entry or a parent domain needs, naming the needer; otherwise it removes it from the top level', () => {
  const image = layersImage();
  const top = ['github.com', 'variant-docs.example.net', 'cdn.example.com', 'api.example.org', 'img.shop.example.io', 'mine.example.com', 'shop.example.io'];
  const p = project([withEgress(lint(sha.skills[0]), ['cdn.example.com'])], top);
  pinImage(p, image);
  const before = files(p);
  const plan = (d) => h(['plan-disallow', p, d]);
  const refused = (d) => {
    const r = plan(d);
    assert.equal(r.code, 1, r.log);
    assert.equal(r.doc.ok, false);
    assert.equal(r.doc.remove, undefined);
    return r.doc.neededBy;
  };

  assert.deepEqual(refused('github.com'), [{ domain: 'github.com', layer: 'Base', neededBy: 'top-level egress' }]);
  assert.deepEqual(refused('variant-docs.example.net'), [{ domain: 'variant-docs.example.net', layer: 'Variant', neededBy: 'extensions[0] (mcp-remote "vdocs")' }]);
  assert.deepEqual(refused('cdn.example.com'), [{ domain: 'cdn.example.com', layer: 'Consuming Project', neededBy: 'extensions[0] (skill "acme/skills/skills/lint")' }]);
  assert.deepEqual(refused('API.example.org'), [{ domain: 'example.org', layer: 'Base', neededBy: 'top-level egress' }], 'a Base parent domain keeps it allowed');
  assert.deepEqual(refused('img.shop.example.io'), [{ domain: 'shop.example.io', layer: 'Consuming Project', neededBy: 'top-level egress' }], 'a project parent domain keeps it allowed');

  const ok = plan('mine.example.com');
  assert.equal(ok.code, 0, ok.log);
  assert.deepEqual(ok.doc, { ok: true, dir: p, domain: 'mine.example.com', layers: { known: true, image }, remove: { from: 'top-level egress', domain: 'mine.example.com' }, subdomainsStayAllowed: [] });
  assert.deepEqual(plan('shop.example.io').doc.subdomainsStayAllowed, [{ domain: 'img.shop.example.io', layer: 'Consuming Project', neededBy: 'top-level egress' }]);

  // Not a project top-level domain: nothing to remove, with what allows it.
  const elsewhere = plan('example.org');
  assert.equal(elsewhere.code, 1);
  assert.match(elsewhere.doc.error, /not in the top-level "egress"/);
  assert.deepEqual(elsewhere.doc.allowedBy, [{ domain: 'example.org', layer: 'Base', neededBy: 'top-level egress' }]);
  assert.deepEqual(files(p), before, 'the plans write nothing');

  // Applying the plan as the agent would leaves a valid manifest without the domain.
  const mf = join(p, '.devcontainer/extensions.json');
  const m = JSON.parse(readFileSync(mf, 'utf8'));
  m.egress = m.egress.filter((d) => d !== 'mine.example.com');
  writeFileSync(mf, JSON.stringify(m));
  // Catches a plan that misses a needer status sees (the two filter the same declarations differently).
  assert.equal(h(['status', p, '--skip-image-check', '--domain', 'mine.example.com']).doc.egress.check.allowed, false);

  // Without the image, the Base and Variant layers are unknown: the plan goes ahead and says so.
  const q = project([], ['github.com']);
  const blind = h(['plan-disallow', q, 'github.com']);
  assert.equal(blind.code, 0, blind.log);
  assert.equal(blind.doc.layers.known, false);
  assert.match(blind.doc.note, /could not be checked/);
});

test('plan-remove-secret refuses a name an MCP entry declares; plan-remove keeps a remoteEnv line the top level still needs (Q20); no value is shown', () => {
  const image = layersImage();
  const both = { ...searchMcp, env: ['SEARCH_TOKEN', 'SHARED_TOKEN'], preset: 'web' };
  const p = project([both], undefined, {
    SEARCH_TOKEN: '${localEnv:SEARCH_TOKEN}', SHARED_TOKEN: '${localEnv:SHARED_TOKEN}', NPM_TOKEN: '${localEnv:MY_NPM}', BASE_TOKEN: '${localEnv:BASE_TOKEN}',
  });
  pinImage(p, image);
  const mf = join(p, '.devcontainer/extensions.json');
  writeFileSync(mf, JSON.stringify({ ...JSON.parse(readFileSync(mf, 'utf8')), secrets: ['SHARED_TOKEN', 'NPM_TOKEN', 'BASE_TOKEN', 'NO_LINE'] }));
  const env = { SEARCH_TOKEN: SECRET_VALUE, SHARED_TOKEN: SECRET_VALUE, MY_NPM: SECRET_VALUE, BASE_TOKEN: SECRET_VALUE };
  const before = files(p);
  const outs = [];
  const plan = (...args) => {
    const r = h(args, env);
    outs.push(r.out);
    return r;
  };

  // Removing the MCP entry: its own secret's line goes, the one the top level also declares stays.
  const rm = plan('plan-remove', p, '0');
  assert.equal(rm.code, 0, rm.log);
  assert.deepEqual(rm.doc.secretsWithEntry, [
    { name: 'SEARCH_TOKEN', stillDeclaredBy: [], remoteEnv: 'delete', unsetOnHost: 'SEARCH_TOKEN' },
    { name: 'SHARED_TOKEN', stillDeclaredBy: ['container-wide'], remoteEnv: 'keep' },
  ]);
  // Removing the Preset that entry came from plans the same secrets.
  assert.deepEqual(plan('plan-remove-preset', p, 'web').doc.secretsWithEntries, rm.doc.secretsWithEntry);

  for (const name of ['SEARCH_TOKEN', 'SHARED_TOKEN']) {
    const r = plan('plan-remove-secret', p, name);
    assert.equal(r.code, 1, r.log);
    assert.deepEqual(r.doc.neededBy, ['extensions[0] (mcp "search")'], `${name} is refused while the MCP entry declares it`);
  }
  const npm = plan('plan-remove-secret', p, 'NPM_TOKEN');
  assert.equal(npm.code, 0, npm.log);
  assert.deepEqual(npm.doc, {
    ok: true, dir: p, name: 'NPM_TOKEN', layers: { known: true, image }, remove: { from: 'top-level secrets', name: 'NPM_TOKEN' }, remoteEnv: 'delete', unsetOnHost: 'MY_NPM',
  });
  // The Base layer declares it too: the project's declaration goes, its remoteEnv line stays.
  const baseTok = plan('plan-remove-secret', p, 'BASE_TOKEN').doc;
  assert.equal(baseTok.remoteEnv, 'keep');
  assert.deepEqual(baseTok.remoteEnvKeptFor, [{ name: 'BASE_TOKEN', layer: 'Base', neededBy: ['container-wide'] }]);
  assert.equal(plan('plan-remove-secret', p, 'NOPE').code, 1);
  assert.equal(plan('plan-remove-secret', p, 'NO_LINE').doc.remoteEnv, 'none', 'no remoteEnv line to delete');
  assert.deepEqual(files(p), before, 'the plans write nothing');
  assert.doesNotMatch(outs.join('\n'), new RegExp(SECRET_VALUE), 'a secret value never reaches the output');

  // Applying the NPM_TOKEN plan as the agent would leaves a valid project.
  const m = JSON.parse(readFileSync(mf, 'utf8'));
  m.secrets = m.secrets.filter((x) => x !== 'NPM_TOKEN' && x !== 'NO_LINE');
  writeFileSync(mf, JSON.stringify(m));
  const dc = join(p, '.devcontainer/devcontainer.json');
  writeFileSync(dc, readFileSync(dc, 'utf8').replace(/\n\s*"NPM_TOKEN": "\$\{localEnv:MY_NPM\}",/, ''));
  assert.doesNotMatch(readFileSync(dc, 'utf8'), /NPM_TOKEN/, 'the remoteEnv line is gone');
  const v = h(['validate', p]);
  assert.deepEqual(v.doc.problems.filter((x) => !/digest-pinned/.test(x)), [], v.log);
  assert.deepEqual(v.doc.secrets.map((x) => x.name), ['SEARCH_TOKEN', 'SHARED_TOKEN', 'BASE_TOKEN']);
});

test('plan-remove and plan-remove-preset name the Base or Variant layer that still allows a dropped domain or declares a dropped secret; unknown layers give a note, not a refusal', () => {
  const image = layersImage();
  const e = {
    ...searchMcp, preset: 'web', env: ['SEARCH_TOKEN', 'BASE_TOKEN'],
    egress: ['api.search.example.com', 'github.com', 'docs.example.org', 'variant-docs.example.net'],
  };
  const env = { SEARCH_TOKEN: '${localEnv:SEARCH_TOKEN}', BASE_TOKEN: '${localEnv:BASE_TOKEN}' };
  const p = project([e], undefined, env);
  pinImage(p, image);
  const before = files(p);
  const expectedDrops = [
    { domain: 'api.search.example.com', stillAllowedBy: [] },
    { domain: 'github.com', stillAllowedBy: ['Base: top-level egress'] },
    { domain: 'docs.example.org', stillAllowedBy: ['Base: top-level egress'] },
    { domain: 'variant-docs.example.net', stillAllowedBy: ['Variant: extensions[0] (mcp-remote "vdocs")'] },
  ];
  const expectedSecrets = [
    { name: 'SEARCH_TOKEN', stillDeclaredBy: [], remoteEnv: 'delete', unsetOnHost: 'SEARCH_TOKEN' },
    { name: 'BASE_TOKEN', stillDeclaredBy: ['Base: container-wide'], remoteEnv: 'keep' },
  ];
  const rm = h(['plan-remove', p, '0']);
  assert.equal(rm.code, 0, rm.log);
  assert.deepEqual(rm.doc.layers, { known: true, image });
  assert.deepEqual(rm.doc.dropsWithEntry, expectedDrops);
  assert.deepEqual(rm.doc.secretsWithEntry, expectedSecrets);
  const pr = h(['plan-remove-preset', p, 'web']);
  assert.equal(pr.code, 0, pr.log);
  assert.deepEqual(pr.doc.dropsWithEntries, expectedDrops);
  assert.deepEqual(pr.doc.secretsWithEntries, expectedSecrets);
  assert.deepEqual(files(p), before, 'the plans write nothing');

  // Image not local: both plans go ahead, say the layers were not checked, and pull nothing.
  const q = project([e], undefined, env);
  for (const args of [['plan-remove', q, '0'], ['plan-remove-preset', q, 'web']]) {
    const r = h(args);
    assert.equal(r.code, 0, r.log);
    assert.equal(r.doc.layers.known, false);
    assert.match(r.doc.note, /could not be checked/);
    assert.deepEqual((r.doc.dropsWithEntry ?? r.doc.dropsWithEntries).map((d) => d.stillAllowedBy), [[], [], [], []]);
  }
  assert.notEqual(spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }).status, 0, 'nothing was pulled');
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

test('a failed image check is reported as unknown, never as "no newer image"', () => {
  // The Variant's published image points at a registry nobody listens on: verify-image fails at resolve.
  const unreachable = checkout('checkout-unreachable', { imageDefault: '127.0.0.1:9/dev-setup/node:latest' });
  const p = project([], undefined, {}, `127.0.0.1:9/dev-setup/node@sha256:${'b'.repeat(64)}`);
  const r = h(['status', p], {}, unreachable);
  assert.equal(r.code, 0, r.log);
  assert.equal(r.doc.image.variant, 'node');
  assert.equal(r.doc.image.latest.ok, false);
  assert.equal(r.doc.image.latest.failed, 'resolve');
  assert.equal(r.doc.image.newerVerified, null);
});
