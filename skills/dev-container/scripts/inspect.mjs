// `inspect`: review an Agent Extension before it is added. Read-only for the project.
//
// Fetched content is data. It is fetched by the installer's fetchBySha into a fresh
// mkdtemp directory, read with fs calls, and deleted. Nothing here spawns a program
// from, or with its working directory in, a fetched tree: the only programs run are
// `git ls-remote` (resolving a ref) and `npm view` (package metadata, nothing fetched).
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import {
  CAPABILITIES, DEFAULT_GIT_BASE, describeEntry, externalSource, fetchBySha, pathInCheckout, repoUrl, schema, validateManifest,
} from '../../../installer/src/index.mjs';
import { UsageError } from './errors.mjs';
import { covers, manifestProblems, readJson, readProjectManifest } from './manifests.mjs';

const SHA = /^[0-9a-f]{40}$/;
const DOMAIN = new RegExp(schema.definitions.domain.pattern);
const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;
/** The image's pnpm policy refuses versions younger than this (pnpm_config_minimum_release_age=10080 minutes, ADR 0001). */
export const MIN_RELEASE_AGE_DAYS = 7;
const TEXT_LIMIT = 1 << 20;
const SCRIPT_EXT = /\.(sh|bash|zsh|py|js|mjs|cjs|ts|rb|pl|ps1|php)$/;
const LIFECYCLE = ['preinstall', 'install', 'postinstall', 'prepare'];
const CODEX_UNSUPPORTED = 'Codex installs plugins and hooks only into its login volume ($CODEX_HOME), which the design forbids (node-devcontainer D3); add it for claude only';

/** Git base for owner/repo sources. DEV_SETUP_GIT_BASE is a test seam (also read by the start-up step). */
const gitBase = () => process.env.DEV_SETUP_GIT_BASE || DEFAULT_GIT_BASE;
const lastLine = (s) => String(s ?? '').trim().split('\n').filter(Boolean).pop() ?? '';

// ---------- Sources and refs ----------

function parseSource(source) {
  if (source.startsWith('npm:')) {
    const spec = source.slice(4);
    const at = spec.lastIndexOf('@');
    const name = at > 0 ? spec.slice(0, at) : spec;
    if (!/^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(name)) throw new UsageError(`"${name}" is not an npm package name`);
    return { type: 'npm', name, range: at > 0 ? spec.slice(at + 1) : 'latest' };
  }
  const gh = source.match(/^(?:https:\/\/github\.com\/)?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/);
  if (gh) return { type: 'git', repo: gh[1] };
  if (/^https:\/\/github\.com\//.test(source)) throw new UsageError(`${source} is not a repository URL; pass owner/repo plus --ref and --path`);
  if (/^https:\/\//.test(source)) {
    let url;
    try {
      url = new URL(source);
    } catch {
      throw new UsageError(`${source} is not a URL`);
    }
    return { type: 'url', url: source, host: url.hostname.toLowerCase() };
  }
  if (/^http:\/\//.test(source)) throw new UsageError('a remote MCP server must be reached over https');
  throw new UsageError(`${source} is not owner/repo, https://github.com/owner/repo, npm:PACKAGE[@RANGE] or an https MCP URL`);
}

/** Resolve a branch, tag or HEAD to the SHA it names now: { sha, refName } or { error }. */
export function resolveRef(url, ref = 'HEAD') {
  if (SHA.test(ref)) return { sha: ref, refName: null };
  const r = spawnSync('git', ['ls-remote', '--', url, ref, `${ref}^{}`], { encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  if (r.status !== 0) return { error: `cannot reach ${url}: ${lastLine(r.stderr || r.error?.message)}` };
  const refs = new Map(r.stdout.split('\n').filter(Boolean).map((l) => l.split('\t').reverse()));
  const names = ref === 'HEAD' || ref.startsWith('refs/') ? [ref] : [`refs/tags/${ref}`, `refs/heads/${ref}`];
  const hits = names.flatMap((n) => {
    const sha = refs.get(`${n}^{}`) ?? refs.get(n); // an annotated tag peels to its target
    return sha ? [{ sha, refName: n }] : [];
  });
  if (!hits.length) {
    const hint = /^[0-9a-f]{4,39}$/.test(ref) ? ' (a short SHA cannot be resolved remotely; give all 40 characters)' : '';
    return { error: `${url} has no branch or tag "${ref}"${hint}` };
  }
  if (new Set(hits.map((h) => h.sha)).size > 1) return { error: `"${ref}" names both a tag and a branch at different commits; pass refs/tags/${ref} or refs/heads/${ref}` };
  return hits[0];
}

// ---------- Reading a fetched tree ----------

/** Files under `root` (relative posix paths, `.git` skipped) and anything that is not a plain file or directory. */
function walk(root) {
  const files = [];
  const special = [];
  if (lstatSync(root).isFile()) return { files: [{ rel: posix.basename(root), full: root, mode: statSync(root).mode }], special };
  const go = (dir, rel) => {
    for (const name of readdirSync(dir).sort()) {
      if (!rel && name === '.git') continue;
      const full = join(dir, name);
      const r = rel ? `${rel}/${name}` : name;
      const st = lstatSync(full);
      if (st.isDirectory()) go(full, r);
      else if (st.isFile()) files.push({ rel: r, full, mode: st.mode });
      else special.push(r);
    }
  };
  go(root, '');
  return { files, special };
}

function readText(full) {
  const buf = readFileSync(full);
  if (buf.length > TEXT_LIMIT || buf.includes(0)) return null;
  return buf.toString('utf8');
}

function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1].split(/\r?\n/) : [];
}

/** `allowed-tools` from a Markdown file's front matter, as written (inline or as a YAML list). */
function allowedTools(text) {
  const lines = frontmatter(text);
  const i = lines.findIndex((l) => /^allowed-tools\s*:/.test(l));
  if (i < 0) return null;
  const inline = lines[i].replace(/^allowed-tools\s*:\s*/, '').trim();
  if (inline) return inline;
  const items = [];
  for (const l of lines.slice(i + 1)) {
    const m = l.match(/^\s+-\s*(.+)$/);
    if (!m) break;
    items.push(m[1].trim());
  }
  return items.join(', ');
}

/** Skill and command shell injection: inline !`cmd` and ```! fenced blocks. */
function shellInjection(text, file) {
  const found = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (/!`[^`\n]+`/.test(line) || /^\s*```!/.test(line)) found.push({ file, line: i + 1, text: line.trim().slice(0, 200) });
  });
  return found;
}

const isIp = (h) => /^\d+(\.\d+)+$/.test(h);

/** Hostnames in URLs written in the text. A heuristic: docs mention hosts nothing connects to, and code can build hosts. */
function hostsIn(text) {
  const hosts = new Set();
  for (const m of text.matchAll(/\b(?:https?|wss?):\/\/([A-Za-z0-9.-]+)/g)) {
    const h = m[1].toLowerCase().replace(/\.$/, '');
    if (DOMAIN.test(h) && !isIp(h)) hosts.add(h);
  }
  return hosts;
}

/** A JSON file the plugin points at, relative to its root; { value } or { problem }. */
function pluginJson(root, rel, what) {
  const norm = posix.normalize(rel.replace(/^\.\//, ''));
  if (norm.startsWith('..') || posix.isAbsolute(norm)) return { problem: `${what} path "${rel}" escapes the plugin` };
  const full = join(root, norm);
  if (!existsSync(full) || !lstatSync(full).isFile()) return { problem: `${what} file "${rel}" is missing` };
  const { value, error } = readJson(full);
  return error ? { problem: `${norm}: ${error}` } : { value, file: norm };
}

function hookList(obj, file) {
  const events = obj?.hooks && typeof obj.hooks === 'object' ? obj.hooks : obj;
  const out = [];
  for (const [event, groups] of Object.entries(events ?? {})) {
    if (!Array.isArray(groups)) continue;
    for (const g of groups) {
      for (const h of Array.isArray(g?.hooks) ? g.hooks : []) {
        out.push({ file, event, matcher: g.matcher ?? null, type: h.type ?? null, command: h.command ?? h.url ?? h.prompt ?? null });
      }
    }
  }
  return out;
}

function mcpList(obj, file) {
  const servers = obj?.mcpServers && typeof obj.mcpServers === 'object' ? obj.mcpServers : obj;
  return Object.entries(servers ?? {}).filter(([, s]) => s && typeof s === 'object').map(([name, s]) => ({
    file, name, type: s.type ?? (s.url ? 'http' : 'stdio'), command: s.command ?? null, args: s.args ?? [], url: s.url ?? null, env: Object.keys(s.env ?? {}),
  }));
}

/** Everything in a fetched skill, plugin or hook script that runs, reaches out, or widens what an Agent may do. */
export function inventory(root) {
  const { files, special } = walk(root);
  const inv = {
    files: files.length, symlinks: special, plugin: null, skills: [], hooks: [], mcpServers: [], scripts: [], bin: [],
    allowedTools: [], shellInjection: [], hosts: { heuristic: true, domains: [] }, problems: [],
  };
  const hostFiles = new Map();
  for (const f of files) {
    const text = readText(f.full);
    const shebang = text?.startsWith('#!');
    if (f.rel.startsWith('bin/')) inv.bin.push(f.rel);
    else if (f.mode & 0o111 || shebang || SCRIPT_EXT.test(f.rel)) inv.scripts.push({ file: f.rel, executable: !!(f.mode & 0o111), interpreter: shebang ? text.split('\n')[0].slice(2).trim() : null });
    if (text === null) continue;
    if (f.rel.endsWith('.md')) {
      const tools = allowedTools(text);
      if (tools !== null) inv.allowedTools.push({ file: f.rel, allowedTools: tools });
      inv.shellInjection.push(...shellInjection(text, f.rel));
      if (posix.basename(f.rel) === 'SKILL.md') {
        const name = frontmatter(text).find((l) => /^name\s*:/.test(l))?.replace(/^name\s*:\s*/, '').trim() ?? null;
        inv.skills.push({ path: posix.dirname(f.rel), name });
      }
    }
    for (const h of hostsIn(text)) hostFiles.set(h, [...(hostFiles.get(h) ?? []), f.rel]);
  }

  if (!lstatSync(root).isFile()) {
    const manifest = existsSync(join(root, '.claude-plugin/plugin.json')) ? pluginJson(root, '.claude-plugin/plugin.json', 'plugin.json') : null;
    if (manifest?.problem) inv.problems.push(manifest.problem);
    const pj = manifest?.value ?? {};
    if (manifest?.value) inv.plugin = { name: pj.name ?? null, version: pj.version ?? null, keys: Object.keys(pj) };
    const refs = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
    // A component lives in its default file, in files plugin.json points at, or inline in plugin.json.
    const load = (defaultFile, field, parse, list) => {
      const paths = [...(existsSync(join(root, defaultFile)) ? [defaultFile] : []), ...refs(pj[field])];
      for (const p of new Set(paths)) {
        const r = pluginJson(root, p, field);
        if (r.problem) inv.problems.push(r.problem);
        else list.push(...parse(r.value, r.file));
      }
      if (pj[field] && typeof pj[field] === 'object' && !Array.isArray(pj[field])) list.push(...parse(pj[field], '.claude-plugin/plugin.json'));
    };
    load('hooks/hooks.json', 'hooks', hookList, inv.hooks);
    load('.mcp.json', 'mcpServers', mcpList, inv.mcpServers);
  }

  inv.hosts.domains = [...hostFiles].sort(([a], [b]) => a.localeCompare(b)).map(([domain, fs]) => ({ domain, files: [...new Set(fs)].slice(0, 5) }));
  return inv;
}

/** Hosts an inventory certainly reaches: its MCP servers' URLs. */
function definiteHosts(inv) {
  return [...new Set(inv.mcpServers.flatMap((s) => {
    try {
      return s.url ? [new URL(s.url).hostname.toLowerCase()] : [];
    } catch {
      return [];
    }
  }))].filter((h) => DOMAIN.test(h));
}

// ---------- Fetching an extension's content ----------

/**
 * Fetch the content a git-sourced entry installs. Returns { root, cleanup, pin } or { error }.
 * The marketplace form reuses the installer's rule for external plugin sources (they must carry a SHA).
 */
function fetchContent(source) {
  const cleanups = [];
  const cleanup = () => cleanups.splice(0).forEach((c) => c());
  try {
    if (source.github) {
      const co = fetchBySha(repoUrl(source.github, gitBase()), source.sha);
      cleanups.push(co.cleanup);
      return { root: pathInCheckout(co.dir, source.path), checkout: co.dir, cleanup };
    }
    const mk = fetchBySha(repoUrl(source.marketplace, gitBase()), source.sha);
    cleanups.push(mk.cleanup);
    const catalog = readJson(join(mk.dir, '.claude-plugin/marketplace.json'));
    if (catalog.error) throw new Error(`${source.marketplace}@${source.sha} has no readable .claude-plugin/marketplace.json (${catalog.error})`);
    const found = (catalog.value.plugins ?? []).find((p) => p.name === source.plugin);
    if (!found) throw new Error(`marketplace ${source.marketplace}@${source.sha} has no plugin "${source.plugin}" (has: ${(catalog.value.plugins ?? []).map((p) => p.name).join(', ')})`);
    if (typeof found.source === 'string') return { root: pathInCheckout(mk.dir, found.source.replace(/^\.\//, '') || '.'), cleanup };
    let ext;
    try {
      ext = externalSource(found.source);
    } catch (err) {
      cleanup();
      return { error: err.message, unpinnable: true };
    }
    const co = fetchBySha(repoUrl(ext.repo, gitBase()), ext.sha);
    cleanups.push(co.cleanup);
    return { root: pathInCheckout(co.dir, ext.path), cleanup, pin: { github: ext.repo, path: ext.path, sha: ext.sha } };
  } catch (err) {
    cleanup();
    return { error: err.message };
  }
}

/** Skill and plugin directories in a checkout, for asking the user which one they meant. */
function candidates(checkout) {
  const out = [];
  const mk = readJson(join(checkout, '.claude-plugin/marketplace.json'));
  if (!mk.error) for (const p of mk.value.plugins ?? []) out.push({ kind: 'plugin', plugin: p.name, via: 'marketplace', description: p.description ?? null });
  for (const f of walk(checkout).files) {
    if (posix.basename(f.rel) === 'SKILL.md') out.push({ kind: 'skill', path: posix.dirname(f.rel) });
    if (f.rel.endsWith('.claude-plugin/plugin.json')) out.push({ kind: 'plugin', path: posix.dirname(posix.dirname(f.rel)) || '.' });
  }
  return out.slice(0, 50);
}

/** What the content at `root` is: hook (a file), plugin, skill, or null. */
function detectKind(root) {
  if (lstatSync(root).isFile()) return 'hook';
  if (existsSync(join(root, '.claude-plugin/plugin.json'))) return 'plugin';
  if (existsSync(join(root, 'SKILL.md'))) return 'skill';
  return null;
}

// ---------- Judging a proposed entry ----------

/** Why an entry cannot be written, in plain words; empty when it can. */
function refusals(entry) {
  const reasons = validateManifest({ extensions: [entry] }).map((p) => (p.startsWith('extensions[0] ') ? p.slice(p.indexOf('): ') + 3) : p));
  if ((entry.kind === 'plugin' || entry.kind === 'hook') && entry.agents.includes('codex')) reasons.push(CODEX_UNSUPPORTED);
  return reasons;
}

function parseAgents(kind, agents) {
  if (!agents) return [...CAPABILITIES[kind]];
  const list = agents.split(',').map((a) => a.trim()).filter(Boolean);
  const unknown = list.filter((a) => !['claude', 'codex'].includes(a));
  if (unknown.length || !list.length) throw new UsageError(`--agents must list claude and/or codex, got "${agents}"`);
  return [...new Set(list)];
}

/** The project's allowed domains (Base layer and the project's manifest) and whether the entry conflicts with it. */
function projectContext(repo, dir, entry, entryValid) {
  if (!dir) return null;
  const read = readProjectManifest(resolve(dir));
  if (read.error) return { error: read.error, problems: read.problems };
  const { manifest } = read;
  const base = readJson(join(repo, 'extensions/base.json')).value?.egress ?? [];
  const allowed = [...new Set([...base, ...(manifest.egress ?? []), ...manifest.extensions.flatMap((e) => e.egress ?? [])])];
  // The same extension at any Pinned Ref: an update, not a second entry.
  const identity = (e) => {
    const { sha, version, ...where } = e.source ?? {};
    return JSON.stringify([e.kind, where, e.url ?? null]);
  };
  const existing = manifest.extensions.flatMap((e, i) => (identity(e) === identity(entry) ? [describeEntry(e, i)] : []));
  // The project manifest is valid (readProjectManifest), so every problem here is the new entry's clash.
  const conflicts = entryValid ? manifestProblems({ ...manifest, extensions: [...manifest.extensions, entry] }) : [];
  return { allowed, alreadyDeclared: existing, conflicts };
}

const allowedBy = (allowed, host) => allowed.find((d) => covers(d, host)) ?? null;

// ---------- inspect ----------

export function inspect([source], opts, { repo }) {
  const src = parseSource(source);
  if (src.type !== 'git' && (opts.ref || opts.path || opts.plugin)) throw new UsageError('--ref, --path and --plugin apply to git sources only');
  if (opts.env && src.type !== 'npm') throw new UsageError('--env applies to npm (stdio MCP) sources only');
  if (opts['bearer-token-env'] && src.type !== 'url') throw new UsageError('--bearer-token-env applies to remote MCP URLs only');
  for (const n of [...(opts.env ?? []), ...(opts['bearer-token-env'] ? [opts['bearer-token-env']] : [])]) {
    if (!ENV_NAME.test(n)) throw new UsageError(`"${n}" is not an environment variable name (upper case, digits, _); pass the name, never a value`);
  }
  if (opts.kind && !(opts.kind in CAPABILITIES)) throw new UsageError(`unknown kind "${opts.kind}" (known: ${Object.keys(CAPABILITIES).join(', ')})`);
  const r = src.type === 'git' ? inspectGit(src, opts) : src.type === 'npm' ? inspectNpm(src, opts) : inspectUrl(src, opts);
  if (!r.entry) return { doc: { ok: false, source, ...r } };

  // Egress: the domains an extension needs go on its own entry, so they leave with it
  // (every kind has an entry `egress`; the top-level egress is what the project itself needs).
  // Hosts the content certainly reaches are put there; hosts merely seen in the content
  // (heuristic) are offered, and the agent adds the agreed ones to the entry.
  const needed = [...new Set(r.neededHosts ?? [])].filter((h) => !(r.entry.egress ?? []).some((d) => covers(d, h)));
  if (needed.length) r.entry.egress = [...(r.entry.egress ?? []), ...needed];
  const onEntry = r.entry.egress ?? [];

  const reasons = [...refusals(r.entry), ...(r.reasons ?? [])];
  const project = projectContext(repo, opts.project, r.entry, reasons.length === 0);
  if (project?.error) return { doc: { ok: false, source, error: `--project: ${project.error}`, problems: project.problems } };

  const allowed = project?.allowed ?? [];
  const egress = {
    onEntry: onEntry.map((domain) => ({ domain, allowedBy: allowedBy(allowed, domain) })),
    detected: { heuristic: true, domains: (r.inventory?.hosts?.domains ?? []).filter((d) => !onEntry.some((e) => covers(e, d.domain))).map((d) => ({ ...d, allowedBy: allowedBy(allowed, d.domain) })) },
  };
  const doc = {
    ok: reasons.length === 0,
    ...(reasons.length ? { refused: true, reasons } : {}),
    source,
    kind: r.entry.kind,
    resolved: r.resolved,
    entry: r.entry,
    inventory: r.inventory,
    egress,
    warnings: r.warnings ?? [],
  };
  if (project) Object.assign(doc, { project: { dir: resolve(opts.project), alreadyDeclared: project.alreadyDeclared, conflicts: project.conflicts } });
  if (project?.conflicts.length) Object.assign(doc, { ok: false, refused: true, reasons: [...reasons, ...project.conflicts] });
  return { doc };
}

function inspectGit(src, opts) {
  const ref = opts.ref ?? 'HEAD';
  const repoAt = repoUrl(src.repo, gitBase());
  const resolved = resolveRef(repoAt, ref);
  if (resolved.error) return { error: resolved.error };
  const viaMarketplace = !!opts.plugin;
  if (viaMarketplace && opts.path) throw new UsageError('--plugin (a marketplace plugin) and --path exclude each other');
  if (viaMarketplace && opts.kind && opts.kind !== 'plugin') throw new UsageError('--plugin implies --kind plugin');
  const source = viaMarketplace
    ? { marketplace: src.repo, plugin: opts.plugin, sha: resolved.sha }
    : { github: src.repo, path: opts.path ?? '.', sha: resolved.sha };
  const resolvedDoc = { ref, refName: resolved.refName, sha: resolved.sha };

  const fetched = fetchContent(source);
  if (fetched.error) {
    if (fetched.unpinnable) return { resolved: resolvedDoc, entry: { kind: 'plugin', agents: parseAgents('plugin', opts.agents), source }, reasons: [`cannot pin this plugin: ${fetched.error}`] };
    return { resolved: resolvedDoc, error: fetched.error };
  }
  try {
    const kind = viaMarketplace ? 'plugin' : opts.kind ?? detectKind(fetched.root);
    if (!kind) {
      return {
        resolved: resolvedDoc,
        error: `"${source.path}" in ${src.repo} is not a skill (SKILL.md), a plugin (.claude-plugin/plugin.json) or a hook script; pick one of candidates with --path, or --plugin for a marketplace plugin`,
        candidates: candidates(fetched.checkout ?? fetched.root),
      };
    }
    const isFile = lstatSync(fetched.root).isFile();
    if (kind === 'hook' && !isFile) throw new UsageError(`a hook is one script file; "${source.path}" is a directory`);
    if (kind !== 'hook' && isFile) throw new UsageError(`a ${kind} is a directory; "${source.path}" is a file (a hook script?)`);
    if (kind === 'skill' && !existsSync(join(fetched.root, 'SKILL.md'))) throw new UsageError(`"${source.path}" has no SKILL.md`);
    if (kind === 'mcp' || kind === 'mcp-remote') throw new UsageError(`a ${kind} entry does not come from a git repository; use npm:PACKAGE or an https URL`);
    if (kind === 'hook' && !opts.event) throw new UsageError('a hook entry needs --event (e.g. PreToolUse, SessionStart) and optionally --matcher');

    const entry = { kind, agents: parseAgents(kind, opts.agents) };
    if (kind === 'skill' && opts.name) entry.name = opts.name;
    if (kind === 'hook') Object.assign(entry, { event: opts.event, ...(opts.matcher !== undefined ? { matcher: opts.matcher } : {}) });
    entry.source = source;

    const inv = inventory(fetched.root);
    const reasons = [];
    if (inv.symlinks.length) reasons.push(`the content holds symlinks or special files, which the installer refuses: ${inv.symlinks.join(', ')}`);
    if (fetched.pin) Object.assign(resolvedDoc, { pluginSource: fetched.pin });
    const warnings = [...inv.problems];
    if (inv.shellInjection.length) warnings.push('skill shell injection is disabled in the container by managed settings (disableSkillShellExecution); the lines are listed so you know what the author intended');
    if (inv.mcpServers.length) warnings.push('a plugin\'s own MCP servers are not managed by the Extension Manifest; once any layer declares an MCP server, Claude\'s managed-mcp.json takes exclusive control (ADR 0004)');
    return { resolved: resolvedDoc, entry, inventory: inv, neededHosts: definiteHosts(inv), reasons, warnings };
  } finally {
    fetched.cleanup();
  }
}

/** Numeric semver order, pre-releases before their release. */
function compareVersions(a, b) {
  const parse = (v) => {
    const [core, pre] = v.split('+')[0].split(/-(.*)/s);
    return { nums: core.split('.').map(Number), pre: pre ?? null };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return x.nums[i] - y.nums[i];
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  return x.pre.localeCompare(y.pre, 'en', { numeric: true });
}

/** `npm view ... --json`: package metadata from the registry. Nothing is downloaded or run. */
export function npmView(args) {
  const r = spawnSync('npm', ['view', ...args, '--json'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) {
    let msg = lastLine(r.stderr || r.error?.message);
    try {
      msg = JSON.parse(r.stdout).error?.summary ?? msg;
    } catch { /* stderr it is */ }
    return { error: msg };
  }
  try {
    return { value: r.stdout.trim() ? JSON.parse(r.stdout) : null };
  } catch {
    return { error: 'npm view returned no JSON' };
  }
}

/** npm view prints one object, or (newer npm) an array of them. */
export const lastObject = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object').at(-1) : v) ?? null;

function defaultMcpName(pkg) {
  const [scope, bare] = pkg.startsWith('@') ? pkg.slice(1).split('/') : [null, pkg];
  const stripped = bare.toLowerCase().replace(/^mcp[-_]?(server[-_]?)?|[-_]?(mcp|server)([-_]?(mcp|server))?$/g, '');
  return (stripped || scope || bare).toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^[^a-z0-9]+/, '');
}

function inspectNpm(src, opts) {
  if (opts.kind && opts.kind !== 'mcp') throw new UsageError('an npm source is a stdio MCP server (kind mcp)');
  const versions = npmView([`${src.name}@${src.range}`, 'version']);
  if (versions.error) return { error: `cannot resolve ${src.name}@${src.range}: ${versions.error}` };
  const list = [versions.value ?? []].flat(2).filter((v) => typeof v === 'string').sort(compareVersions);
  if (!list.length) return { error: `no version of ${src.name} matches "${src.range}"` };
  const time = npmView([src.name, 'time']);
  if (time.error) return { error: `cannot read publish times of ${src.name}: ${time.error}` };
  const times = lastObject(time.value);
  const ageDays = (v) => (times?.[v] ? Math.floor((Date.now() - Date.parse(times[v])) / 86400e3) : null);
  const newest = list.at(-1);
  const pick = [...list].reverse().find((v) => ageDays(v) !== null && ageDays(v) >= MIN_RELEASE_AGE_DAYS) ?? newest;
  const meta = npmView([`${src.name}@${pick}`]);
  if (meta.error) return { error: `cannot read ${src.name}@${pick}: ${meta.error}` };
  const m = lastObject(meta.value) ?? {};
  const bin = typeof m.bin === 'string' ? { [src.name.split('/').pop()]: m.bin } : m.bin ?? {};
  const lifecycle = Object.fromEntries(LIFECYCLE.filter((s) => m.scripts?.[s]).map((s) => [s, m.scripts[s]]));

  const entry = { kind: 'mcp', agents: parseAgents('mcp', opts.agents), name: opts.name ?? defaultMcpName(src.name), source: { npm: src.name, version: pick } };
  if (opts.env?.length) entry.env = [...new Set(opts.env)];
  const reasons = [];
  const warnings = [];
  if (ageDays(pick) === null || ageDays(pick) < MIN_RELEASE_AGE_DAYS) {
    reasons.push(`every version matching "${src.range}" is younger than ${MIN_RELEASE_AGE_DAYS} days (newest ${newest}, ${ageDays(newest) ?? '?'} days); the image's pnpm policy refuses it until then`);
  } else if (pick !== newest) {
    warnings.push(`${newest} is newer but only ${ageDays(newest)} days old; proposing ${pick}, the newest version the pnpm policy accepts`);
  }
  if (!Object.keys(bin).length) reasons.push(`${src.name}@${pick} declares no "bin"; a stdio MCP server must be an executable package`);
  if (Object.keys(lifecycle).length) warnings.push(`${src.name}@${pick} has install scripts (${Object.keys(lifecycle).join(', ')}); the pnpm policy does not run build scripts, so the install may fail until it is allowed`);
  if (m.deprecated) warnings.push(`deprecated: ${m.deprecated}`);
  warnings.push('package metadata only: the installed code and its dependencies are not inspected; the domains the server reaches are not declared by npm, so ask the user');
  const repository = typeof m.repository === 'string' ? m.repository : m.repository?.url ?? null;
  return {
    resolved: { range: src.range, version: pick, publishedDaysAgo: ageDays(pick), newest },
    entry,
    inventory: {
      package: src.name, version: pick, bin, lifecycleScripts: lifecycle, dependencies: Object.keys(m.dependencies ?? {}), repository, homepage: m.homepage ?? null,
      hosts: { heuristic: true, domains: [...new Set([repository, m.homepage].flatMap((u) => [...hostsIn(String(u ?? ''))]))].map((domain) => ({ domain, files: ['package metadata'] })) },
    },
    reasons,
    warnings,
  };
}

function inspectUrl(src, opts) {
  if (opts.kind && opts.kind !== 'mcp-remote') throw new UsageError('an https URL source is a remote MCP server (kind mcp-remote)');
  if (!DOMAIN.test(src.host) || isIp(src.host)) {
    return { error: `${src.host} cannot be an Egress Allowlist domain (a plain lower-case hostname is required), so this remote server cannot be allowed` };
  }
  const entry = { kind: 'mcp-remote', agents: parseAgents('mcp-remote', opts.agents), name: opts.name ?? defaultMcpName(src.host.split('.').slice(-2, -1)[0] ?? src.host), url: src.url, egress: [src.host] };
  if (opts['bearer-token-env']) entry.bearerTokenEnv = opts['bearer-token-env'];
  return {
    resolved: { url: src.url },
    entry,
    inventory: { url: src.url, host: src.host },
    warnings: ['a remote MCP server has no Pinned Ref (node-devcontainer D2): what it does can change at any time; only its egress domain is fixed'],
  };
}
