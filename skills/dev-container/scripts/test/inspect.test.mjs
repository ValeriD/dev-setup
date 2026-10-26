// Adding and removing single Agent Extensions (skill ticket 03, SC-04 to SC-06):
// `inspect` against fixture plugins, skills, hooks and marketplaces in local bare
// git repos, npm metadata from the registry stub on loopback, and `plan-remove`.
// Every fixture script, hook, bin and shell-injection line touches $MARKER if it
// ever runs; the last test asserts it never did.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = dirname(dirname(dirname(SCRIPTS)));
const HELPER = join(SCRIPTS, 'dev-container.mjs');
const IMAGE = `ghcr.io/valerid/dev-setup/node@sha256:${'a'.repeat(64)}`;
const root = mkdtempSync(join(tmpdir(), 'dc-inspect-test-'));
const gitBase = join(root, 'git');
const MARKER = join(root, 'EXECUTED');
const home = join(root, 'home');
const TMP = join(root, 'tmp'); // the helper's TMPDIR: where fetchBySha makes its directories
const sha = {};
let registry;
let stub;

const RUN = '#!/bin/sh\ntouch "$MARKER"\n';
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8' }).trim();

function write(work, files) {
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(work, path)), { recursive: true });
    if (body && body.symlink) symlinkSync(body.symlink, join(work, path));
    else writeFileSync(join(work, path), body);
    if (typeof body === 'string' && body.startsWith('#!')) chmodSync(join(work, path), 0o755);
  }
}

/** A bare repo at <gitBase>/acme/<name>.git; each element of `commits` is one commit's files. Returns the work tree. */
function makeRepo(name, ...commits) {
  const work = join(root, 'work', name);
  git(root, 'init', '-q', '-b', 'main', work);
  sha[name] = [];
  for (const files of commits) {
    write(work, files);
    git(work, 'add', '-A');
    git(work, 'commit', '-q', '-m', 'x');
    sha[name].push(git(work, 'rev-parse', 'HEAD'));
  }
  return work;
}
const publish = (name) => {
  mkdirSync(join(gitBase, 'acme'), { recursive: true });
  git(root, 'clone', '-q', '--bare', join(root, 'work', name), join(gitBase, `acme/${name}.git`));
};

const SKILL_MD = [
  '---',
  'name: deploy',
  'description: Deploys.',
  'allowed-tools:',
  '  - Bash(git:*)',
  '  - Read',
  '---',
  'Current branch: !`touch "$MARKER"; git branch`',
  '```!',
  'touch "$MARKER"',
  '```',
  'Guide: https://docs.example.org/guide',
].join('\n');

before(async () => {
  mkdirSync(home);
  mkdirSync(TMP);
  const plugins = makeRepo('plugins', {
    'plugins/rich/.claude-plugin/plugin.json': JSON.stringify({ name: 'rich', version: '1.0.0', mcpServers: { inline: { command: 'node', args: ['inline.mjs'] } } }),
    'plugins/rich/hooks/hooks.json': JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/scripts/guard.sh' }] }] } }),
    'plugins/rich/.mcp.json': JSON.stringify({ mcpServers: { search: { type: 'http', url: 'https://search.example.com/mcp' }, local: { command: 'node', args: ['server.mjs'], env: { API_KEY: '${API_KEY}' } } } }),
    'plugins/rich/scripts/guard.sh': RUN,
    'plugins/rich/bin/rich-tool': RUN,
    'plugins/rich/skills/deploy/SKILL.md': SKILL_MD,
    'skills/plain/SKILL.md': '---\nname: plain\ndescription: Plain.\n---\nNothing to run.\n',
    'hooks/fmt.sh': RUN,
    'docs/README.md': 'not an extension\n',
  });
  git(plugins, 'tag', '-a', 'v1', '-m', 'v1');
  write(plugins, { 'skills/plain/SKILL.md': '---\nname: plain\ndescription: Plain, v2.\n---\n' });
  git(plugins, 'commit', '-qam', 'v2');
  sha.pluginsHead = git(plugins, 'rev-parse', 'HEAD');
  publish('plugins');

  makeRepo('links', { 'plugin/.claude-plugin/plugin.json': '{"name":"linky"}', 'plugin/escape': { symlink: '/etc/passwd' } });
  publish('links');

  makeRepo('mkt', {
    '.claude-plugin/marketplace.json': JSON.stringify({
      name: 'upstream',
      owner: { name: 'x' },
      plugins: [
        { name: 'rel', source: './plugins/rel' },
        { name: 'ext', source: { source: 'git-subdir', url: 'https://github.com/acme/plugins.git', path: 'plugins/rich', sha: sha.pluginsHead } },
        { name: 'floating', source: { source: 'github', repo: 'acme/plugins', ref: 'main' } },
      ],
    }),
    'plugins/rel/.claude-plugin/plugin.json': '{"name":"rel"}',
  });
  publish('mkt');

  // npm metadata from the registry stub (child process: the helper runs synchronously).
  const port = await new Promise((res) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });
  const bin = { srv: 'srv.mjs' };
  const spec = {
    'fresh-mcp': { '1.0.0': { ageDays: 30, bin }, '1.1.0': { ageDays: 1, bin } },
    'nobin-mcp': { '1.0.0': { ageDays: 30 } },
    'scripted-mcp': { '2.0.0': { ageDays: 30, bin, scripts: { postinstall: 'touch "$MARKER"' } } },
  };
  stub = spawn('node', [join(REPO, 'tests/fixtures/registry-stub.mjs'), String(port)], { env: { ...process.env, STUB_SPEC: JSON.stringify(spec) }, stdio: 'ignore' });
  registry = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${registry}fresh-mcp`)).ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('registry stub did not start');
});

after(() => {
  stub?.kill();
  rmSync(root, { recursive: true, force: true });
});

function h(...args) {
  const r = spawnSync('node', [HELPER, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env, HOME: home, CLAUDE_CONFIG_DIR: '', MARKER, DEV_SETUP_GIT_BASE: gitBase, TMPDIR: TMP,
      npm_config_registry: registry, npm_config_cache: join(root, 'npm-cache'), npm_config_update_notifier: 'false',
    },
  });
  let doc;
  try {
    doc = JSON.parse(r.stdout);
  } catch { /* asserted by callers */ }
  return { code: r.status, doc, log: `${args.join(' ')}\n${r.stdout}\n${r.stderr}` };
}

let n = 0;
/** A rendered project whose manifest holds the given entries and top-level egress. */
function project(extensions = [], egress) {
  const p = join(root, `p${n++}`);
  mkdirSync(p);
  assert.equal(h('render-template', 'node', p, '--image', IMAGE).code, 0);
  const file = join(p, '.devcontainer/extensions.json');
  const mf = JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(file, JSON.stringify({ ...mf, extensions, ...(egress ? { egress } : {}) }, null, 2));
  return p;
}
const manifestOf = (p) => JSON.parse(readFileSync(join(p, '.devcontainer/extensions.json'), 'utf8'));
const snapshot = (d) => readdirSync(d, { recursive: true }).sort().map((f) => [f, existsSync(join(d, f)) && !f.endsWith('.devcontainer') ? readFileSync(join(d, f), 'utf8') : '']);

test('inspect resolves HEAD to a SHA and lists everything a plugin runs, reaches and allows', () => {
  const r = h('inspect', 'acme/plugins', '--path', 'plugins/rich');
  assert.equal(r.code, 0, r.log);
  const d = r.doc;
  assert.deepEqual(d.resolved, { ref: 'HEAD', refName: 'HEAD', sha: sha.pluginsHead });
  assert.deepEqual(d.entry, { kind: 'plugin', agents: ['claude'], source: { github: 'acme/plugins', path: 'plugins/rich', sha: sha.pluginsHead } });
  const inv = d.inventory;
  assert.deepEqual(inv.hooks, [{ file: 'hooks/hooks.json', event: 'PreToolUse', matcher: 'Bash', type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/scripts/guard.sh' }]);
  assert.deepEqual(inv.mcpServers.map((s) => [s.name, s.type, s.url ?? s.command]).sort(), [['inline', 'stdio', 'node'], ['local', 'stdio', 'node'], ['search', 'http', 'https://search.example.com/mcp']]);
  assert.deepEqual(inv.mcpServers.find((s) => s.name === 'local').env, ['API_KEY']);
  assert.deepEqual(inv.scripts.map((s) => s.file), ['scripts/guard.sh']);
  assert.equal(inv.scripts[0].executable, true);
  assert.deepEqual(inv.bin, ['bin/rich-tool']);
  assert.deepEqual(inv.skills, [{ path: 'skills/deploy', name: 'deploy' }]);
  assert.deepEqual(inv.allowedTools, [{ file: 'skills/deploy/SKILL.md', allowedTools: 'Bash(git:*), Read' }]);
  assert.deepEqual(inv.shellInjection.map((s) => s.line), [8, 9]);
  assert.equal(inv.hosts.heuristic, true);
  assert.deepEqual(d.egress.target, 'top-level', 'a plugin entry has no egress field');
  assert.deepEqual(d.egress.needed, [{ domain: 'search.example.com', allowedBy: null }]);
  assert.deepEqual(d.egress.detected.domains.map((x) => x.domain), ['docs.example.org']);
  assert.equal(d.egress.detected.heuristic, true);
  assert.match(d.warnings.join('\n'), /disableSkillShellExecution/);
});

test('inspect pins a tag or branch to the SHA it names and fails for unreachable refs and repositories', () => {
  const tag = h('inspect', 'acme/plugins', '--path', 'skills/plain', '--ref', 'v1');
  assert.equal(tag.code, 0, tag.log);
  assert.equal(tag.doc.resolved.sha, sha.plugins[0], 'an annotated tag resolves to the tagged SHA');
  assert.equal(tag.doc.entry.source.sha, sha.plugins[0]);
  assert.equal(h('inspect', 'https://github.com/acme/plugins', '--path', 'skills/plain', '--ref', 'main').doc.entry.source.sha, sha.pluginsHead);
  assert.equal(h('inspect', 'acme/plugins', '--path', 'skills/plain', '--ref', sha.plugins[0]).doc.entry.source.sha, sha.plugins[0]);

  for (const [args, re] of [
    [['acme/plugins', '--ref', 'nope'], /no branch or tag "nope"/],
    [['acme/plugins', '--ref', sha.plugins[0].slice(0, 8)], /short SHA/],
    [['acme/plugins', '--ref', 'f'.repeat(40)], /cannot fetch/],
    [['acme/missing'], /cannot reach/],
  ]) {
    const r = h('inspect', ...args);
    assert.equal(r.code, 1, r.log);
    assert.match(r.doc.error, re);
    assert.equal(r.doc.entry, undefined);
  }
});

test('inspect finds skills and hooks, asks for a hook event, and offers candidates for a non-extension path', () => {
  const skill = h('inspect', 'acme/plugins', '--path', 'skills/plain');
  assert.equal(skill.code, 0, skill.log);
  assert.deepEqual(skill.doc.entry.agents, ['claude', 'codex'], 'a skill goes to every Agent unless --agents narrows it');
  assert.deepEqual(h('inspect', 'acme/plugins', '--path', 'skills/plain', '--agents', 'codex').doc.entry.agents, ['codex']);

  assert.equal(h('inspect', 'acme/plugins', '--path', 'hooks/fmt.sh').code, 2, 'a hook needs --event');
  const hook = h('inspect', 'acme/plugins', '--path', 'hooks/fmt.sh', '--event', 'PostToolUse', '--matcher', 'Edit');
  assert.equal(hook.code, 0, hook.log);
  assert.deepEqual(hook.doc.entry, { kind: 'hook', agents: ['claude'], event: 'PostToolUse', matcher: 'Edit', source: { github: 'acme/plugins', path: 'hooks/fmt.sh', sha: sha.pluginsHead } });
  assert.deepEqual(hook.doc.inventory.scripts, [{ file: 'fmt.sh', executable: true, interpreter: '/bin/sh' }]);

  const none = h('inspect', 'acme/plugins');
  assert.equal(none.code, 1);
  assert.deepEqual(none.doc.candidates.map((c) => c.path).sort(), ['plugins/rich', 'plugins/rich/skills/deploy', 'skills/plain']);
  const mkt = h('inspect', 'acme/mkt');
  assert.deepEqual(mkt.doc.candidates.filter((c) => c.via === 'marketplace').map((c) => c.plugin), ['rel', 'ext', 'floating']);
});

test('marketplace plugins: pinned by the marketplace SHA; an external source without a SHA is refused', () => {
  const rel = h('inspect', 'acme/mkt', '--plugin', 'rel');
  assert.equal(rel.code, 0, rel.log);
  assert.deepEqual(rel.doc.entry.source, { marketplace: 'acme/mkt', plugin: 'rel', sha: sha.mkt[0] });
  const ext = h('inspect', 'acme/mkt', '--plugin', 'ext');
  assert.equal(ext.code, 0, ext.log);
  assert.deepEqual(ext.doc.resolved.pluginSource, { github: 'acme/plugins', path: 'plugins/rich', sha: sha.pluginsHead });
  assert.equal(ext.doc.inventory.hooks.length, 1, 'the external plugin content is what is inventoried');

  const floating = h('inspect', 'acme/mkt', '--plugin', 'floating');
  assert.equal(floating.code, 1, floating.log);
  assert.equal(floating.doc.refused, true);
  assert.match(floating.doc.reasons.join(), /cannot pin this plugin: .*lacks a full 40-character commit SHA/);
  assert.match(h('inspect', 'acme/mkt', '--plugin', 'nope').doc.error, /has no plugin "nope"/);
});

test('refused with a reason: a Codex plugin or hook, symlinked content, a plain-http or IP remote server', () => {
  const codex = h('inspect', 'acme/plugins', '--path', 'plugins/rich', '--agents', 'claude,codex');
  assert.equal(codex.code, 1, codex.log);
  assert.equal(codex.doc.refused, true);
  assert.match(codex.doc.reasons.join('\n'), /not supported for codex[\s\S]*D3/);
  assert.ok(codex.doc.inventory, 'the inventory is still shown');
  assert.match(h('inspect', 'acme/plugins', '--path', 'hooks/fmt.sh', '--event', 'Stop', '--agents', 'codex').doc.reasons.join(), /D3/);

  const links = h('inspect', 'acme/links', '--path', 'plugin');
  assert.equal(links.code, 1, links.log);
  assert.match(links.doc.reasons.join(), /symlinks .*escape/);

  assert.equal(h('inspect', 'http://mcp.example.com/mcp').code, 2);
  assert.match(h('inspect', 'https://10.0.0.1/mcp').doc.error, /cannot be an Egress Allowlist domain/);
});

test('mcp-remote gets its host as entry egress; validate refuses one without egress and floating refs', () => {
  const r = h('inspect', 'https://mcp.tools.example.com/v1', '--name', 'tools', '--bearer-token-env', 'TOOLS_TOKEN');
  assert.equal(r.code, 0, r.log);
  assert.deepEqual(r.doc.entry, { kind: 'mcp-remote', agents: ['claude', 'codex'], name: 'tools', url: 'https://mcp.tools.example.com/v1', egress: ['mcp.tools.example.com'], bearerTokenEnv: 'TOOLS_TOKEN' });
  assert.equal(r.doc.egress.target, 'entry');
  assert.equal(h('inspect', 'https://mcp.example.com/', '--bearer-token-env', 'ghp_value').code, 2, 'a value is not a name');

  const { egress, ...noEgress } = r.doc.entry;
  const bad = h('validate', project([noEgress]));
  assert.equal(bad.code, 1);
  assert.match(bad.doc.problems.join(), /mcp-remote "tools".*egress/);
  const floating = h('validate', project([{ kind: 'skill', agents: ['claude'], source: { github: 'acme/plugins', path: 'skills/plain', ref: 'main' } }]));
  assert.match(floating.doc.problems.join(), /floating ref "ref"/);
});

test('npm MCP: resolves a range to the newest version the pnpm policy accepts; too fresh or no bin is refused', () => {
  const r = h('inspect', 'npm:fresh-mcp@^1.0.0', '--env', 'FRESH_KEY');
  assert.equal(r.code, 0, r.log);
  assert.deepEqual(r.doc.entry, { kind: 'mcp', agents: ['claude', 'codex'], name: 'fresh', source: { npm: 'fresh-mcp', version: '1.0.0' }, env: ['FRESH_KEY'] });
  assert.equal(r.doc.resolved.newest, '1.1.0');
  assert.match(r.doc.warnings.join(), /1\.1\.0 is newer but only 1 days old/);
  assert.deepEqual(r.doc.inventory.bin, { srv: 'srv.mjs' });

  const fresh = h('inspect', 'npm:fresh-mcp@1.1.0');
  assert.equal(fresh.code, 1, fresh.log);
  assert.match(fresh.doc.reasons.join(), /younger than 7 days/);
  assert.match(h('inspect', 'npm:nobin-mcp').doc.reasons.join(), /declares no "bin"/);
  const scripted = h('inspect', 'npm:scripted-mcp');
  assert.equal(scripted.code, 0, scripted.log);
  assert.deepEqual(Object.keys(scripted.doc.inventory.lifecycleScripts), ['postinstall']);
  assert.match(scripted.doc.warnings.join(), /install scripts/);
  assert.equal(h('inspect', 'npm:missing-mcp').code, 1);
});

test('decline writes nothing; approve writes the pinned entry and its egress, and validate passes', () => {
  const p = project([], ['docs.example.org']);
  const before = snapshot(p);
  const r = h('inspect', 'acme/plugins', '--path', 'plugins/rich', '--project', p);
  assert.equal(r.code, 0, r.log);
  assert.deepEqual(r.doc.project.alreadyDeclared, []);
  assert.equal(r.doc.egress.detected.domains[0].allowedBy, 'docs.example.org', 'already allowed domains are marked');
  assert.deepEqual(snapshot(p), before, 'inspecting (and then declining) writes nothing');

  // Approve: the agent appends the entry and the needed domains to the top-level egress.
  const mf = manifestOf(p);
  mf.extensions.push(r.doc.entry);
  mf.egress.push(...r.doc.egress.needed.map((x) => x.domain));
  writeFileSync(join(p, '.devcontainer/extensions.json'), JSON.stringify(mf, null, 2));
  const v = h('validate', p);
  assert.equal(v.code, 0, v.log);
  assert.equal(v.doc.entries, 1);

  const again = h('inspect', 'acme/plugins', '--path', 'plugins/rich', '--project', p);
  assert.match(again.doc.project.alreadyDeclared.join(), /extensions\[0\] \(plugin/);
  assert.deepEqual(again.doc.egress.needed, [{ domain: 'search.example.com', allowedBy: 'search.example.com' }]);
});

test('inspect --project refuses an entry that clashes with the project, e.g. a skill name declared twice', () => {
  const plain = h('inspect', 'acme/plugins', '--path', 'skills/plain').doc.entry;
  const p = project([{ ...plain, source: { ...plain.source, sha: sha.plugins[0] } }]);
  const r = h('inspect', 'acme/plugins', '--path', 'skills/plain', '--project', p);
  assert.equal(r.code, 1, r.log);
  assert.match(r.doc.reasons.join(), /skill name "plain" is already declared/);
});

test('plan-remove drops the entry and only the egress nothing else needs, and writes nothing', () => {
  const rich = h('inspect', 'acme/plugins', '--path', 'plugins/rich').doc.entry;
  const remote = { kind: 'mcp-remote', agents: ['claude'], name: 'search', url: 'https://search.example.com/mcp', egress: ['search.example.com'] };
  const tools = { kind: 'mcp-remote', agents: ['claude'], name: 'tools', url: 'https://tools.example.com/mcp', egress: ['tools.example.com'] };
  const p = project([rich, remote, tools], ['search.example.com', 'docs.example.org', 'tools.example.com', 'mine.example.com']);
  const before = snapshot(p);

  const r = h('plan-remove', p, '0');
  assert.equal(r.code, 0, r.log);
  assert.match(r.doc.remove.entry, /plugin/);
  assert.deepEqual(r.doc.egress, ['docs.example.org'], 'only what the plugin named and nothing staying needs');
  assert.deepEqual(r.doc.keepEgress, [{ domain: 'search.example.com', neededBy: ['extensions[1] (mcp-remote "search")'] }]);

  const t = h('plan-remove', p, '2');
  assert.deepEqual(t.doc.dropsWithEntry, [{ domain: 'tools.example.com', stillAllowedBy: ['top-level egress'] }]);
  assert.deepEqual(t.doc.egress, ['tools.example.com'], 'its own domain, repeated at top level, goes too');
  assert.deepEqual(snapshot(p), before, 'the plan writes nothing');

  assert.equal(h('plan-remove', p, '7').code, 2);
  // Applying the first plan as the agent would leaves a valid manifest.
  const mf = manifestOf(p);
  mf.extensions.splice(0, 1);
  mf.egress = mf.egress.filter((d) => !r.doc.egress.includes(d));
  writeFileSync(join(p, '.devcontainer/extensions.json'), JSON.stringify(mf));
  assert.equal(h('validate', p).code, 0);
});

test('plan-remove notes a Preset-tagged entry and still plans when the pinned content cannot be fetched', () => {
  const gone = { kind: 'skill', agents: ['claude'], preset: 'web', source: { github: 'acme/gone', path: 's', sha: 'e'.repeat(40) } };
  const r = h('plan-remove', project([gone], ['x.example.com']), '0');
  assert.equal(r.code, 0, r.log);
  assert.match(r.doc.note, /cannot fetch/);
  assert.match(r.doc.presetNote, /Preset "web"/);
  assert.deepEqual(r.doc.egress, []);
});

test('the helper only spawns fixed programs, never with a fetched directory as program or working directory', () => {
  for (const f of readdirSync(SCRIPTS).filter((x) => x.endsWith('.mjs'))) {
    const src = readFileSync(join(SCRIPTS, f), 'utf8');
    for (const m of src.matchAll(/\bspawn(?:Sync)?\(\s*([^,]+),/g)) {
      assert.match(m[1], /^'(git|docker|npx|npm)'$/, `${f}: spawn of ${m[1]}`);
    }
    assert.doesNotMatch(src, /\bexec(File)?(Sync)?\(|\bfork\(|child_process'.*\b(exec|execFile)\b/, f);
    assert.doesNotMatch(src, /\bcommit\b/, `${f} must not run git commit`);
  }
  const inspectSrc = readFileSync(join(SCRIPTS, 'inspect.mjs'), 'utf8');
  assert.doesNotMatch(inspectSrc, /\bcwd\b/, 'inspect never runs anything inside a fetched tree');
  assert.doesNotMatch(inspectSrc, /\bimport\(/, 'inspect never loads fetched code');
});

test('no fetched file was executed by any inspect or plan-remove above', () => {
  assert.equal(existsSync(MARKER), false);
  assert.deepEqual(readdirSync(TMP).filter((f) => f.startsWith('dev-setup-fetch-')), [], 'every fetch directory was removed');
});
