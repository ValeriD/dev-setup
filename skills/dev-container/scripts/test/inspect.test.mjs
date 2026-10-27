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
    'skills/searcher/SKILL.md': '---\nname: searcher\ndescription: Searches.\n---\nQuery https://search.example.com/api with curl.\n',
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
  assert.deepEqual(d.entry, { kind: 'plugin', agents: ['claude'], source: { github: 'acme/plugins', path: 'plugins/rich', sha: sha.pluginsHead }, egress: ['search.example.com'] }, 'the host its MCP server certainly reaches goes on the entry');
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
  assert.deepEqual(d.egress.onEntry, [{ domain: 'search.example.com', allowedBy: null }]);
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
  assert.deepEqual(hook.doc.egress.onEntry, [], 'nothing certain to reach, so no entry egress');

  const none = h('inspect', 'acme/plugins');
  assert.equal(none.code, 1);
  assert.deepEqual(none.doc.candidates.map((c) => c.path).sort(), ['plugins/rich', 'plugins/rich/skills/deploy', 'skills/plain', 'skills/searcher']);
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
  assert.deepEqual(r.doc.egress.onEntry, [{ domain: 'mcp.tools.example.com', allowedBy: null }]);
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
  // The pinned image is not local: Base and Variant coverage is unknown, never read from this checkout.
  assert.equal(r.doc.project.layers.known, false);
  assert.match(r.doc.project.layers.reason, /not in the local image store/);
  assert.deepEqual(snapshot(p), before, 'inspecting (and then declining) writes nothing');

  // Approve: the agent appends the entry, which carries its domains, and adds an agreed detected domain to it.
  const mf = manifestOf(p);
  mf.extensions.push({ ...r.doc.entry, egress: [...r.doc.entry.egress, 'docs.example.org'] });
  writeFileSync(join(p, '.devcontainer/extensions.json'), JSON.stringify(mf, null, 2));
  const v = h('validate', p);
  assert.equal(v.code, 0, v.log);
  assert.equal(v.doc.entries, 1);
  assert.deepEqual(v.doc.egress, ['docs.example.org'], 'the top-level egress is untouched');

  const again = h('inspect', 'acme/plugins', '--path', 'plugins/rich', '--project', p);
  assert.match(again.doc.project.alreadyDeclared.join(), /extensions\[0\] \(plugin/);
  assert.deepEqual(again.doc.egress.onEntry, [{ domain: 'search.example.com', allowedBy: 'search.example.com' }]);
});

test('inspect --project refuses an entry that clashes with the project, e.g. a skill name declared twice', () => {
  const plain = h('inspect', 'acme/plugins', '--path', 'skills/plain').doc.entry;
  const p = project([{ ...plain, source: { ...plain.source, sha: sha.plugins[0] } }]);
  const r = h('inspect', 'acme/plugins', '--path', 'skills/plain', '--project', p);
  assert.equal(r.code, 1, r.log);
  assert.match(r.doc.reasons.join(), /skill name "plain" is already declared/);
  assert.equal(r.doc.project.alreadyDeclared.length, 1, 'the same skill at another Pinned Ref counts as already declared');
  assert.equal(r.doc.reasons.length, 1, 'each problem is reported once');
});

test('plan-remove drops the entry with its own egress, says which domains stay allowed, and writes nothing', () => {
  const rich = h('inspect', 'acme/plugins', '--path', 'plugins/rich').doc.entry; // egress: search.example.com
  const remote = { kind: 'mcp-remote', agents: ['claude'], name: 'search', url: 'https://api.search.example.com/mcp', egress: ['api.search.example.com'] };
  const tools = { kind: 'mcp-remote', agents: ['claude'], name: 'tools', url: 'https://tools.example.com/mcp', egress: ['tools.example.com', 'cdn.tools.example.com'] };
  const hook = { kind: 'hook', agents: ['claude'], event: 'Stop', source: { github: 'acme/plugins', path: 'hooks/fmt.sh', sha: sha.pluginsHead }, egress: ['hooks.example.com'] };
  const p = project([rich, remote, tools, hook], ['tools.example.com', 'mine.example.com']);
  const before = snapshot(p);

  const r = h('plan-remove', p, '0');
  assert.equal(r.code, 0, r.log);
  // The fixture's pinned image is not local: the Base and Variant layers are unknown, and the plan says so.
  const { layers, note, ...plan } = r.doc;
  assert.deepEqual(plan, { ok: true, dir: p, remove: { index: 0, entry: r.doc.remove.entry }, dropsWithEntry: [{ domain: 'search.example.com', stillAllowedBy: [] }], secretsWithEntry: [] });
  assert.equal(layers.known, false);
  assert.match(note, /could not be checked/);
  assert.match(r.doc.remove.entry, /plugin/);
  // A staying entry's parent domain keeps a subdomain allowed.
  assert.deepEqual(h('plan-remove', p, '1').doc.dropsWithEntry, [{ domain: 'api.search.example.com', stillAllowedBy: ['extensions[0] (plugin "acme/plugins/plugins/rich")'] }]);
  // The project's own top-level domain (or a parent of it) keeps it allowed, and is never part of the plan.
  assert.deepEqual(h('plan-remove', p, '2').doc.dropsWithEntry, [
    { domain: 'tools.example.com', stillAllowedBy: ['top-level egress'] },
    { domain: 'cdn.tools.example.com', stillAllowedBy: ['top-level egress'] },
  ]);
  assert.deepEqual(h('plan-remove', p, '3').doc.dropsWithEntry, [{ domain: 'hooks.example.com', stillAllowedBy: [] }]);
  assert.deepEqual(snapshot(p), before, 'the plan writes nothing');
  assert.equal(h('plan-remove', p, '7').code, 2);

  // Applying the plan as the agent would (delete the entry) leaves a valid manifest with the top-level egress as it was.
  const mf = manifestOf(p);
  mf.extensions.splice(0, 1);
  writeFileSync(join(p, '.devcontainer/extensions.json'), JSON.stringify(mf));
  const v = h('validate', p);
  assert.equal(v.code, 0, v.log);
  assert.deepEqual(v.doc.egress, ['tools.example.com', 'mine.example.com']);
});

test('plan-remove reads only the manifest: an entry whose pinned content is unreachable plans the same, without a fetch', () => {
  const gone = { kind: 'skill', agents: ['claude'], preset: 'web', source: { github: 'acme/gone', path: 's', sha: 'e'.repeat(40) }, egress: ['x.example.com'] };
  const stay = { kind: 'skill', agents: ['claude'], source: { github: 'acme/gone', path: 't', sha: 'f'.repeat(40) } };
  const reachable = h('inspect', 'acme/plugins', '--path', 'skills/plain').doc.entry;
  const p = project([gone, stay, reachable], ['x.example.com']);
  // A `git` first on PATH that records every call: plan-remove must make none.
  const bin = join(root, 'git-spy');
  const calls = join(root, 'git-calls');
  const realGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'git'), `#!/bin/sh\necho "$@" >> "${calls}"\nexec "${realGit}" "$@"\n`, { mode: 0o755 });
  const spied = (...args) => {
    rmSync(calls, { force: true });
    const r = spawnSync('node', [HELPER, ...args], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, HOME: home, CLAUDE_CONFIG_DIR: '', MARKER, DEV_SETUP_GIT_BASE: gitBase, TMPDIR: TMP } });
    return { doc: JSON.parse(r.stdout), git: existsSync(calls) };
  };
  assert.equal(spied('inspect', 'acme/plugins', '--path', 'skills/plain').git, true, 'the spy sees a fetch');
  for (const i of ['0', '2']) {
    const r = spied('plan-remove', p, i);
    assert.equal(r.doc.ok, true);
    assert.equal(r.git, false, `plan-remove ${i} ran no git`);
  }
  const r = spied('plan-remove', p, '0');
  assert.deepEqual(r.doc.dropsWithEntry, [{ domain: 'x.example.com', stillAllowedBy: ['top-level egress'] }]);
  assert.equal(r.doc.remove.preset, 'web');
  assert.match(r.doc.presetNote, /Preset "web"/);
});

test('MIN_RELEASE_AGE_DAYS matches the image pnpm policy', async () => {
  const { MIN_RELEASE_AGE_DAYS } = await import('../inspect.mjs');
  const minutes = readFileSync(join(REPO, 'variants/node/devcontainer.json'), 'utf8').match(/"pnpm_config_minimum_release_age":\s*"(\d+)"/)[1];
  assert.equal(MIN_RELEASE_AGE_DAYS * 24 * 60, Number(minutes));
});

// Keep last: it checks what every test above did (node:test runs a file's tests in order).
test('runs last: no fetched file was executed by any inspect or plan-remove above', () => {
  assert.equal(existsSync(MARKER), false);
  assert.deepEqual(readdirSync(TMP).filter((f) => f.startsWith('dev-setup-fetch-')), [], 'every fetch directory was removed');
});
