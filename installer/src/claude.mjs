// Claude delivery of plugins and hooks. Each Extension Layer gets a generated
// `directory` marketplace (root-owned, read in place at runtime: no clone, no
// seed, no auto-update) whose plugin contents are copied from commits pinned by
// SHA, plus root-owned hook scripts. The result is a managed-settings fragment:
// the image layer renders it into the base file, the project layer into a
// managed-settings.d drop-in (Claude unions lists and merges these keys).
import { readFileSync, mkdirSync, writeFileSync, existsSync, rmSync, chmodSync, copyFileSync, renameSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { describeEntry, ManifestError } from './validate.mjs';
import { fetchBySha, repoUrl, copyTree, pathInCheckout } from './fetch.mjs';

const SHA = /^[0-9a-f]{40}$/;
const GITHUB_URL = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;

const readJson = (file, what) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`cannot read ${what}: ${err.message}`);
  }
};

/** The repo (owner/repo) and optional subdirectory a marketplace plugin's external source points at. */
function externalSource(src) {
  if (!src || typeof src !== 'object') throw new Error('unsupported plugin source in the marketplace');
  const kind = src.source;
  if (!['github', 'url', 'git-subdir'].includes(kind)) throw new Error(`external plugin source type "${kind}" is not supported (use github, url or git-subdir on github.com)`);
  if (typeof src.sha !== 'string' || !SHA.test(src.sha)) {
    throw new Error(`external plugin source (${kind}) lacks a full 40-character commit SHA in the marketplace, so it is not pinned`);
  }
  let repo = src.repo ?? src.url;
  if (typeof repo !== 'string') throw new Error(`external plugin source (${kind}) names no repository`);
  const m = repo.match(GITHUB_URL);
  if (m) repo = m[1];
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error(`external plugin source "${repo}" is not a github.com repository`);
  return { repo, sha: src.sha, path: kind === 'git-subdir' ? src.path ?? '.' : '.' };
}

/** Fetch an entry's plugin into `dest`; returns {name, pin}. */
function fetchPlugin(entry, dest, gitBase) {
  const s = entry.source;
  const cleanups = [];
  try {
    let srcDir;
    let pin;
    let name;
    if (s.github) {
      const co = fetchBySha(repoUrl(s.github, gitBase), s.sha);
      cleanups.push(co.cleanup);
      srcDir = pathInCheckout(co.dir, s.path);
      pin = { github: s.github, path: s.path, sha: s.sha };
      name = s.path === '.' ? s.github.split('/')[1] : basename(s.path);
    } else {
      const mk = fetchBySha(repoUrl(s.marketplace, gitBase), s.sha);
      cleanups.push(mk.cleanup);
      const catalog = readJson(join(mk.dir, '.claude-plugin/marketplace.json'), `.claude-plugin/marketplace.json of ${s.marketplace}@${s.sha}`);
      const found = (catalog.plugins ?? []).find((p) => p.name === s.plugin);
      if (!found) throw new Error(`marketplace ${s.marketplace}@${s.sha} has no plugin "${s.plugin}"`);
      name = s.plugin;
      if (typeof found.source === 'string') {
        srcDir = pathInCheckout(mk.dir, found.source.replace(/^\.\//, '') || '.');
        pin = { marketplace: s.marketplace, plugin: s.plugin, sha: s.sha };
      } else {
        const ext = externalSource(found.source);
        const co = fetchBySha(repoUrl(ext.repo, gitBase), ext.sha);
        cleanups.push(co.cleanup);
        srcDir = pathInCheckout(co.dir, ext.path);
        pin = { marketplace: s.marketplace, marketplaceSha: s.sha, plugin: s.plugin, github: ext.repo, path: ext.path, sha: ext.sha };
      }
    }
    const manifestFile = join(srcDir, '.claude-plugin/plugin.json');
    if (existsSync(manifestFile)) name = readJson(manifestFile, 'plugin.json').name ?? name;
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) throw new Error(`plugin name "${name}" is not a valid directory name`);
    copyTree(srcDir, join(dest, name));
    return { name, pin };
  } finally {
    cleanups.forEach((c) => c());
  }
}

/** Copy one hook script out of its pinned commit; returns its installed path. */
function fetchHook(entry, hooksDir, index, gitBase) {
  const s = entry.source;
  const co = fetchBySha(repoUrl(s.github, gitBase), s.sha);
  try {
    const src = pathInCheckout(co.dir, s.path);
    if (!statSync(src).isFile()) throw new Error(`hook source "${s.path}" must be a file`);
    mkdirSync(hooksDir, { recursive: true });
    const dest = join(hooksDir, `${String(index).padStart(2, '0')}-${basename(s.path)}`);
    copyFileSync(src, dest);
    chmodSync(dest, 0o755);
    return dest;
  } finally {
    co.cleanup();
  }
}

/**
 * Install one layer's Claude plugins and hooks and return the managed-settings
 * fragment that enables them. A marketplace is generated even when the layer has
 * no plugins, so the strict marketplace allowlist always names it.
 * @param {object[]} entries the layer's extensions (any kind; only plugin/hook are used)
 * @param {{layer: string, marketplaces: string, hooks: string, gitBase: string}} o
 */
export function installClaude(entries, { layer, marketplaces, hooks, gitBase }) {
  const mktName = `dev-setup-${layer}`;
  const mktDir = join(marketplaces, layer);
  const hooksDir = join(hooks, layer);
  // Both directories are owned by this step; a restarted container re-runs it on its old filesystem.
  rmSync(mktDir, { recursive: true, force: true });
  rmSync(hooksDir, { recursive: true, force: true });
  const pluginsDir = join(mktDir, 'plugins');
  mkdirSync(pluginsDir, { recursive: true });
  mkdirSync(hooksDir, { recursive: true });

  const catalog = [];
  const pins = {};
  const enabledPlugins = {};
  const hookSettings = {};
  const plugins = [];
  entries.forEach((entry, i) => {
    if (entry.kind !== 'plugin' && entry.kind !== 'hook') return;
    try {
      if (entry.kind === 'plugin') {
        const { name, pin } = fetchPlugin(entry, pluginsDir, gitBase);
        if (pins[name]) throw new Error(`plugin name "${name}" is already declared in this layer`);
        pins[name] = pin;
        catalog.push({ name, source: `./plugins/${name}` });
        enabledPlugins[`${name}@${mktName}`] = true;
        plugins.push({ name, sha: pin.sha });
      } else {
        const command = fetchHook(entry, hooksDir, i, gitBase);
        const group = { hooks: [{ type: 'command', command }] };
        if (entry.matcher) group.matcher = entry.matcher;
        (hookSettings[entry.event] ??= []).push(group);
      }
    } catch (err) {
      throw new ManifestError([`${entry.layer}: ${describeEntry(entry, i)}: ${err.message}`]);
    }
  });

  mkdirSync(join(mktDir, '.claude-plugin'), { recursive: true });
  writeFileSync(
    join(mktDir, '.claude-plugin/marketplace.json'),
    JSON.stringify({ name: mktName, owner: { name: 'dev-setup' }, plugins: catalog }, null, 2) + '\n',
  );
  // Where each plugin's content came from (for audit; Claude ignores it).
  writeFileSync(join(mktDir, 'pins.json'), JSON.stringify(pins, null, 2) + '\n');

  const settings = {
    strictKnownMarketplaces: [{ source: 'directory', path: mktDir }],
    extraKnownMarketplaces: { [mktName]: { source: { source: 'directory', path: mktDir } } },
  };
  if (Object.keys(enabledPlugins).length) settings.enabledPlugins = enabledPlugins;
  if (Object.keys(hookSettings).length) settings.hooks = hookSettings;
  return { settings, plugins, hooks: Object.values(hookSettings).reduce((n, g) => n + g.length, 0) };
}

/** Write JSON atomically (world-readable; the caller runs as root). */
export function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o644 });
  renameSync(tmp, file);
}
