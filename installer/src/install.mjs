// Layer merge, skill rendering for both Agents, and Egress Allowlist assembly.
import { readFileSync, mkdirSync, writeFileSync, existsSync, renameSync, rmSync } from 'node:fs';
import { basename, join, dirname } from 'node:path';
import { assertValidManifest, describeEntry, ManifestError } from './validate.mjs';
import { installMcpPackages, writeMcpConfig } from './mcp.mjs';
import { installClaude, writeJson } from './claude.mjs';
import { fetchBySha, repoUrl, copyTree, pathInCheckout, DEFAULT_GIT_BASE } from './fetch.mjs';

export const SYSTEM_PATHS = {
  claudeSkills: '/etc/claude-code/.claude/skills',
  codexSkills: '/etc/codex/skills',
  egressOut: '/usr/local/share/egress/allowlist.txt',
  mcpRoot: '/opt/dev-setup/mcp',
  claudeMcp: '/etc/claude-code/managed-mcp.json',
  codexConfig: '/etc/codex/config.toml',
  secretsOut: '/etc/dev-setup/mcp-secrets',
  // Claude plugins and hooks: policy template in, managed settings out, generated marketplaces and hook scripts.
  claudePolicy: '/opt/dev-setup/claude-policy.json',
  claudeSettings: '/etc/claude-code/managed-settings.json',
  claudeDropin: '/etc/claude-code/managed-settings.d/50-project.json',
  marketplaces: '/opt/dev-setup/marketplaces',
  hooks: '/opt/dev-setup/hooks',
};

/** Read and validate a manifest file. Problems are prefixed with the file path. */
export function loadManifest(file) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new ManifestError([`${file}: cannot read manifest: ${err.message}`]);
  }
  return assertValidManifest(parsed, file);
}

/** Skill directory name: explicit `name`, else the last segment of the source path (or repo name for '.'). */
export function skillName(entry) {
  if (entry.name) return entry.name;
  const p = entry.source.path;
  return p === '.' ? entry.source.github.split('/')[1] : basename(p);
}

/**
 * Union of Extension Layers (in order) and of their Egress Allowlist domains.
 * @param {{label: string, manifest: object}[]} layers
 */
export function mergeLayers(layers) {
  const extensions = [];
  const egress = [];
  const skills = new Map();
  const servers = new Map();
  const problems = [];
  for (const { label, manifest } of layers) {
    manifest.extensions.forEach((entry, i) => {
      if (entry.kind === 'skill') {
        const n = skillName(entry);
        if (skills.has(n)) {
          problems.push(`${label}: ${describeEntry(entry, i)}: skill name "${n}" is already declared by ${skills.get(n)}`);
          return;
        }
        skills.set(n, `${label} extensions[${i}]`);
      }
      if (entry.kind === 'mcp' || entry.kind === 'mcp-remote') {
        if (servers.has(entry.name)) {
          problems.push(`${label}: ${describeEntry(entry, i)}: MCP server name "${entry.name}" is already declared by ${servers.get(entry.name)}`);
          return;
        }
        servers.set(entry.name, `${label} extensions[${i}]`);
      }
      extensions.push({ ...entry, layer: label });
      for (const d of entry.egress ?? []) egress.push(d);
    });
    for (const d of manifest.egress ?? []) egress.push(d);
  }
  if (problems.length) throw new ManifestError(problems);
  return { extensions, egress: [...new Set(egress)] };
}

/** Domains in first-seen order, one per line, in the format the start-up step consumes. */
export function renderAllowlist(domains, sources = []) {
  return [
    '# Egress Allowlist assembled by the extension installer from:',
    ...sources.map((s) => `#   ${s}`),
    '# A domain also covers all its subdomains. The first entry is used by the start-up self-test.',
    ...domains,
    '',
  ].join('\n');
}

/**
 * Install every skill entry into the Agent skill directories its `agents` name.
 * Other kinds are skipped here (see installLayerExtensions).
 */
export function installSkills(extensions, { claudeSkills, codexSkills, gitBase = DEFAULT_GIT_BASE, overwrite = false }) {
  const targets = { claude: claudeSkills, codex: codexSkills };
  const installed = [];
  extensions.forEach((entry, i) => {
    if (entry.kind !== 'skill') return; // other kinds have their own installers
    const name = skillName(entry);
    let checkout;
    try {
      checkout = fetchBySha(repoUrl(entry.source.github, gitBase), entry.source.sha);
      const dir = checkout.dir;
      const src = pathInCheckout(dir, entry.source.path);
      if (!existsSync(join(src, 'SKILL.md'))) throw new Error(`no SKILL.md at "${entry.source.path}"`);
      for (const agent of entry.agents) {
        const dest = join(targets[agent], name);
        if (existsSync(dest)) {
          // Start mode only: a restarted container re-runs the start-up step on its old filesystem.
          if (!overwrite) throw new Error(`${dest} already exists`);
          rmSync(dest, { recursive: true, force: true });
        }
        mkdirSync(dirname(dest), { recursive: true });
        copyTree(src, dest);
      }
    } catch (err) {
      throw new ManifestError([`${entry.layer}: ${describeEntry(entry, i)}: ${err.message}`]);
    } finally {
      checkout?.cleanup();
    }
    installed.push({ name, agents: entry.agents, sha: entry.source.sha });
  });
  return installed;
}

function loadLayers(files) {
  const problems = [];
  const layers = [];
  for (const file of files) {
    try {
      layers.push({ label: file, manifest: loadManifest(file) });
    } catch (err) {
      if (!(err instanceof ManifestError)) throw err;
      problems.push(...err.problems);
    }
  }
  if (problems.length) throw new ManifestError(problems);
  return layers;
}

function writeAllowlist(file, egress, sources) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, renderAllowlist(egress, sources));
  renameSync(tmp, file);
}

const resolvePaths = (paths) => ({ ...SYSTEM_PATHS, ...Object.fromEntries(Object.entries(paths).filter(([, v]) => v !== undefined)) });

/**
 * Build-mode install: validate and merge the layer manifests, install skills for
 * both Agents, and write the assembled Egress Allowlist.
 * @param {{manifests: string[], gitBase?: string, claudeSkills?: string, codexSkills?: string, egressOut?: string}} opts
 */
export function installBuild({ manifests, gitBase, ...paths }) {
  gitBase ??= DEFAULT_GIT_BASE;
  const out = resolvePaths(paths);
  const merged = mergeLayers(loadLayers(manifests));
  // Validation and fetching come before any write to the allowlist, so a bad entry leaves nothing half-installed there.
  const skills = installSkills(merged.extensions, { claudeSkills: out.claudeSkills, codexSkills: out.codexSkills, gitBase });
  const mcp = installMcpPackages(merged.extensions, { mcpRoot: out.mcpRoot });
  writeMcpConfig(merged.extensions, out);
  // The image layer's plugins and hooks are rendered into the managed settings base file, on top of the policy template.
  const claude = installClaude(merged.extensions, { layer: 'image', marketplaces: out.marketplaces, hooks: out.hooks, gitBase });
  const policy = JSON.parse(readFileSync(out.claudePolicy, 'utf8'));
  writeJson(out.claudeSettings, { ...policy, ...claude.settings });
  writeAllowlist(out.egressOut, merged.egress, manifests);
  return { skills, mcp, plugins: claude.plugins, hooks: claude.hooks, egress: merged.egress };
}

/**
 * Start-mode install: validate all layers together (the build layers, already
 * installed in the image, plus the Consuming Project layer), install only the
 * project layer's entries, and write the full Egress Allowlist. Nothing is
 * recorded: the container filesystem is the state, so recreating it uninstalls.
 * @param {{manifests: string[], project: string, gitBase?: string, claudeSkills?: string, codexSkills?: string, egressOut?: string}} opts
 */
export function installStart({ manifests, project, gitBase, ...paths }) {
  gitBase ??= DEFAULT_GIT_BASE;
  const out = resolvePaths(paths);
  const files = [...manifests, project];
  const merged = mergeLayers(loadLayers(files));
  const mine = merged.extensions.filter((e) => e.layer === project);
  const skills = installSkills(mine, { claudeSkills: out.claudeSkills, codexSkills: out.codexSkills, gitBase, overwrite: true });
  const mcp = installMcpPackages(mine, { mcpRoot: out.mcpRoot, overwrite: true });
  writeMcpConfig(merged.extensions, out); // all layers: the rendered files are regenerated whole
  // The project layer's plugins and hooks go into a drop-in that Claude merges over the image's base file.
  const claude = installClaude(mine, { layer: 'project', marketplaces: out.marketplaces, hooks: out.hooks, gitBase });
  writeJson(out.claudeDropin, claude.settings);
  writeAllowlist(out.egressOut, merged.egress, files);
  return { skills, mcp, plugins: claude.plugins, hooks: claude.hooks, egress: merged.egress };
}
