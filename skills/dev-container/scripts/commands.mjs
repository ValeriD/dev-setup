// Subcommands of the dev-container helper. Each returns { doc, code } for the
// entry point to print. The helper reads repository data, validates, renders
// the Template into `.devcontainer/` and drives the devcontainer CLI (pnpm runs
// only inside the container); every other project edit is the agent's,
// followed by `validate`.
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parse as parseJsonc, printParseErrorCode } from 'jsonc-parser';
import { schema, validateManifest } from '../../../installer/src/index.mjs';

/** Same pin as the acceptance suite (tests/lib.mjs) and CI (CLI_VERSION). */
export const DEVCONTAINER_CLI = '@devcontainers/cli@0.89.0';
export const LOCKFILES = ['pnpm-lock.yaml', 'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock'];
/** Host VS Code user settings that ADR 0003's mitigations rely on. */
export const VSCODE_SETTINGS = { 'dev.containers.copyGitConfig': false, 'dev.containers.dockerCredentialHelper': false };
const DIGEST_REF = /@sha256:[0-9a-f]{64}$/;
const PLACEHOLDER = /\$\{templateOption:([A-Za-z0-9_-]+)\}/g;

export class UsageError extends Error {}

const USAGE = `usage: dev-container.mjs <command> [args]
  check                                         verify the skill link and checkout
  variants [--dir DIR]                          list Variants; with --dir, propose one
  resolve-target TARGET [--projects-root DIR]   URL, local folder or new name -> project path and facts
  image-digest VARIANT [--ref IMAGE]            current registry digest of the Variant image (unverified)
  render-template VARIANT DIR --image REF@sha256:... [--option NAME=VALUE]... [--replace]
                                                --replace deletes an existing .devcontainer/ first (migrate)
  validate DIR                                  check .devcontainer/devcontainer.json and extensions.json
  vscode-settings [--settings FILE]             check the host VS Code settings ADR 0003 relies on
  up DIR [--recreate]                           start (or recreate) the project's container
  first-lockfile DIR                            create the first pnpm lockfile inside the container
  import-lockfile DIR                           convert an npm/yarn lockfile with pnpm import inside the container
  frozen-install DIR                            pnpm install --frozen-lockfile inside the container; lists blocked builds`;

const COMMANDS = {
  check: { positionals: 0, options: {}, fn: (_, __, ctx) => ({ doc: { ok: true, repo: ctx.repo } }) },
  variants: { positionals: 0, options: { dir: { type: 'string' } }, fn: variants },
  'resolve-target': { positionals: 1, options: { 'projects-root': { type: 'string' } }, fn: resolveTarget },
  'image-digest': { positionals: 1, options: { ref: { type: 'string' } }, fn: imageDigest },
  'render-template': { positionals: 2, options: { image: { type: 'string' }, option: { type: 'string', multiple: true }, replace: { type: 'boolean' } }, fn: renderTemplate },
  validate: { positionals: 1, options: {}, fn: validate },
  'vscode-settings': { positionals: 0, options: { settings: { type: 'string' } }, fn: vscodeSettings },
  up: { positionals: 1, options: { recreate: { type: 'boolean' } }, fn: up },
  'first-lockfile': { positionals: 1, options: {}, fn: firstLockfile },
  'import-lockfile': { positionals: 1, options: {}, fn: importLockfile },
  'frozen-install': { positionals: 1, options: {}, fn: frozenInstall },
};

export async function run(argv, ctx) {
  const [name, ...rest] = argv;
  if (name === 'help' || name === '--help') return { doc: { ok: true, usage: USAGE }, code: 0 };
  const cmd = COMMANDS[name];
  if (!cmd) throw new UsageError(name ? `unknown command "${name}"\n${USAGE}` : USAGE);
  let parsed;
  try {
    parsed = parseArgs({ args: rest, allowPositionals: true, strict: true, options: cmd.options });
  } catch (err) {
    throw new UsageError(`${err.message}\n${USAGE}`);
  }
  if (parsed.positionals.length !== cmd.positionals) throw new UsageError(`${name}: expected ${cmd.positionals} argument(s)\n${USAGE}`);
  const r = await cmd.fn(parsed.positionals, parsed.values, ctx);
  return { doc: r.doc, code: r.code ?? (r.doc.ok === false ? 1 : 0) };
}

// ---------- Variants ----------

function listVariants(repo) {
  const root = join(repo, 'variants');
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, d.name, 'variant.json')))
    .map((d) => {
      const v = JSON.parse(readFileSync(join(root, d.name, 'variant.json'), 'utf8'));
      return { name: d.name, description: v.description, detect: v.detect ?? [], template: existsSync(join(repo, 'templates', d.name, '.devcontainer')) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function variants(_, { dir }, { repo }) {
  const all = listVariants(repo);
  if (!dir) return { doc: { ok: true, variants: all } };
  const project = resolve(dir);
  const matches = all
    .map((v) => ({ name: v.name, signals: v.detect.filter((f) => existsSync(join(project, f))) }))
    .filter((m) => m.signals.length);
  const proposal = matches.length === 1 ? matches[0].name : null;
  return { doc: { ok: true, dir: project, variants: all, matches, proposal, ambiguous: proposal === null } };
}

function requireVariant(repo, name) {
  const v = listVariants(repo).find((x) => x.name === name);
  if (!v) throw new UsageError(`unknown Variant "${name}" (known: ${listVariants(repo).map((x) => x.name).join(', ')})`);
  if (!v.template) throw new Error(`Variant "${name}" has no Template at templates/${name}/.devcontainer`);
  return v;
}

function templateManifest(repo, variant) {
  return JSON.parse(readFileSync(join(repo, 'templates', variant, 'devcontainer-template.json'), 'utf8'));
}

// ---------- Target resolution ----------

const GIT_URL = /^(?:(?:https?|ssh|git|file):\/\/\S+|[\w.-]+@[\w.-]+:\S+)$/;
const NEW_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Facts the onboarding conversation branches on. */
export function projectFacts(dir) {
  const has = (p) => existsSync(join(dir, p));
  return {
    exists: existsSync(dir),
    isGitRepo: has('.git'),
    hasDevcontainer: has('.devcontainer/devcontainer.json'),
    hasDocsAgents: has('docs/agents'),
    hasPackageJson: has('package.json'),
    lockfiles: LOCKFILES.filter(has),
  };
}

function resolveTarget([target], opts) {
  const root = resolve(opts['projects-root'] ?? join(homedir(), 'Documents/Work/dev'));
  let kind, path, url;
  if (GIT_URL.test(target)) {
    kind = 'url';
    url = target;
    const web = target.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/*$/);
    if (/^https?:\/\/github\.com\//.test(target) && !web) throw new UsageError(`${target} is not a repository URL (expected https://github.com/<owner>/<repo>)`);
    const name = web ? web[2] : basename(target.replace(/\/+$/, '').replace(/^.*:/, '')).replace(/\.git$/, '');
    if (!NEW_NAME.test(name)) throw new UsageError(`cannot derive a folder name from ${target}`);
    path = join(root, name);
  } else {
    const local = resolve(target.replace(/^~(?=\/|$)/, homedir()));
    if (existsSync(local)) {
      if (!statSync(local).isDirectory()) throw new UsageError(`${local} is not a directory`);
      kind = 'local';
      path = local;
    } else if (NEW_NAME.test(target)) {
      kind = 'new';
      path = join(root, target);
    } else {
      throw new UsageError(`${target} is not an existing folder, a git URL, or a plain new project name`);
    }
  }
  return { doc: { ok: true, kind, url, name: basename(path), path, projectsRoot: root, ...projectFacts(path) } };
}

// ---------- Image digest ----------

function repositoryOf(ref) {
  const noDigest = ref.replace(/@.*$/, '');
  const slash = noDigest.lastIndexOf('/');
  const colon = noDigest.lastIndexOf(':');
  return colon > slash ? noDigest.slice(0, colon) : noDigest;
}

function imageDigest([variant], { ref }, { repo }) {
  requireVariant(repo, variant);
  const source = ref ?? templateManifest(repo, variant).options?.image?.default;
  if (!source) throw new Error(`templates/${variant} has no default image option`);
  const r = spawnSync('docker', ['buildx', 'imagetools', 'inspect', source, '--format', '{{json .Manifest}}'], { encoding: 'utf8' });
  if (r.status !== 0) return { doc: { ok: false, ref: source, error: `cannot read ${source} from the registry: ${(r.stderr || r.error?.message || '').trim()}` } };
  const digest = JSON.parse(r.stdout).digest;
  if (!DIGEST_REF.test(`@${digest}`)) return { doc: { ok: false, ref: source, error: `unexpected manifest from ${source}` } };
  return {
    doc: {
      ok: true,
      ref: source,
      digest,
      image: `${repositoryOf(source)}@${digest}`,
      verified: false,
      note: 'Digest read from the registry; its signature and provenance are NOT verified yet (verify-image is not built). Tell the user it is unverified.',
    },
  };
}

// ---------- Template rendering ----------

function filesUnder(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? filesUnder(join(dir, d.name), join(prefix, d.name)) : [join(prefix, d.name)]);
}

function renderTemplate([variant, dir], { image, option = [], replace }, { repo }) {
  requireVariant(repo, variant);
  if (!image) throw new UsageError('render-template: --image is required');
  if (!DIGEST_REF.test(image)) throw new UsageError(`--image must be digest-pinned (…@sha256:<64 hex>), got ${image}`);
  const project = resolve(dir);
  if (!existsSync(project) || !statSync(project).isDirectory()) throw new Error(`${project} is not a directory`);
  const devcontainerDir = join(project, '.devcontainer');
  if (!replace && existsSync(join(devcontainerDir, 'devcontainer.json'))) {
    throw new Error(`${project}/.devcontainer/devcontainer.json already exists; replacing an existing dev container is the migrate operation (--replace)`);
  }

  const declared = templateManifest(repo, variant).options ?? {};
  const values = Object.fromEntries(Object.entries(declared).map(([k, o]) => [k, o.default]));
  for (const o of option) {
    const eq = o.indexOf('=');
    const key = eq > 0 ? o.slice(0, eq) : '';
    if (!(key in declared)) throw new UsageError(`unknown Template option "${key || o}" (options: ${Object.keys(declared).join(', ')})`);
    values[key] = o.slice(eq + 1);
  }
  values.image = image;

  const src = join(repo, 'templates', variant, '.devcontainer');
  const out = filesUnder(src).map((rel) => {
    const text = readFileSync(join(src, rel), 'utf8').replace(PLACEHOLDER, (m, k) => {
      if (!(k in values)) throw new Error(`templates/${variant}/.devcontainer/${rel} uses unknown option ${m}`);
      return String(values[k]);
    });
    return { rel, text };
  });
  if (!out.some((f) => f.rel === 'extensions.json')) {
    out.push({ rel: 'extensions.json', text: JSON.stringify({ $schema: schema.$id, extensions: [] }, null, 2) + '\n' });
  }
  // Everything that can fail is checked above, so --replace never leaves the project without a dev container.
  let replaced = [];
  if (replace && existsSync(devcontainerDir)) {
    if (!lstatSync(devcontainerDir).isDirectory()) throw new Error(`${devcontainerDir} is not a directory; nothing was written`);
    replaced = filesUnder(devcontainerDir).map((rel) => join('.devcontainer', rel));
    rmSync(devcontainerDir, { recursive: true });
  }
  for (const f of out) {
    const target = join(project, '.devcontainer', f.rel);
    if (existsSync(target)) throw new Error(`${target} already exists; nothing was written`);
  }
  for (const f of out) {
    const target = join(project, '.devcontainer', f.rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, f.text);
  }
  return { doc: { ok: true, dir: project, variant, options: values, files: out.map((f) => join('.devcontainer', f.rel)), replaced } };
}

// ---------- Validation ----------

function readJsonc(file) {
  const errors = [];
  const value = parseJsonc(readFileSync(file, 'utf8'), errors, { allowTrailingComma: true, disallowComments: false });
  return { value, errors: errors.map((e) => `${printParseErrorCode(e.error)} at offset ${e.offset}`) };
}

function validate([dir]) {
  const project = resolve(dir);
  const problems = [];
  const dcFile = join(project, '.devcontainer/devcontainer.json');
  const mfFile = join(project, '.devcontainer/extensions.json');
  let image;

  if (!existsSync(dcFile)) problems.push(`${relative(project, dcFile)} is missing`);
  else {
    const text = readFileSync(dcFile, 'utf8');
    const { value, errors } = readJsonc(dcFile);
    for (const e of errors) problems.push(`.devcontainer/devcontainer.json: ${e}`);
    if (!errors.length) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) problems.push('.devcontainer/devcontainer.json must be a JSON object');
      else {
        image = value.image;
        if (typeof image !== 'string' || !DIGEST_REF.test(image)) problems.push(`.devcontainer/devcontainer.json: "image" must be digest-pinned (…@sha256:<64 hex>), got ${JSON.stringify(image)}`);
      }
    }
    for (const m of text.matchAll(PLACEHOLDER)) problems.push(`.devcontainer/devcontainer.json: unrendered placeholder ${m[0]}`);
  }

  let entries;
  if (!existsSync(mfFile)) problems.push(`${relative(project, mfFile)} (Extension Manifest) is missing`);
  else {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(mfFile, 'utf8'));
    } catch (err) {
      problems.push(`.devcontainer/extensions.json: not valid JSON: ${err.message}`);
    }
    if (manifest !== undefined) {
      for (const p of validateManifest(manifest)) problems.push(`.devcontainer/extensions.json: ${p}`);
      entries = Array.isArray(manifest?.extensions) ? manifest.extensions.length : undefined;
    }
  }
  return { doc: { ok: problems.length === 0, dir: project, image, entries, problems } };
}

// ---------- Host VS Code settings ----------

export function defaultVscodeSettings() {
  return process.platform === 'darwin'
    ? join(homedir(), 'Library/Application Support/Code/User/settings.json')
    : join(homedir(), '.config/Code/User/settings.json');
}

function vscodeSettings(_, { settings }) {
  const path = resolve(settings ?? defaultVscodeSettings());
  let current = {};
  const exists = existsSync(path);
  if (exists) {
    const { value, errors } = readJsonc(path);
    if (errors.length) return { doc: { ok: false, path, exists, error: `cannot parse ${path}: ${errors.join('; ')}; fix it by hand` } };
    current = value ?? {};
  }
  const missing = Object.entries(VSCODE_SETTINGS)
    .filter(([k, want]) => current[k] !== want)
    .map(([key, want]) => ({ key, want, have: current[key] ?? null }));
  return { doc: { ok: true, path, exists, satisfied: missing.length === 0, missing, required: VSCODE_SETTINGS } };
}

// ---------- Container ----------

function devcontainer(args, opts = {}) {
  const r = spawnSync('npx', ['-y', DEVCONTAINER_CLI, ...args], { encoding: 'utf8', maxBuffer: 64 << 20, ...opts });
  return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '' };
}

const tail = (s, n = 30) => s.trim().split('\n').slice(-n).join('\n');

function up([dir], { recreate }) {
  const project = resolve(dir);
  const args = ['up', '--workspace-folder', project];
  if (recreate) args.push('--remove-existing-container');
  const r = devcontainer(args);
  let result = {};
  try {
    result = JSON.parse(r.out.trim().split('\n').pop());
  } catch { /* reported below */ }
  if (r.code !== 0 || result.outcome !== 'success') {
    return { doc: { ok: false, dir: project, outcome: result.outcome ?? 'error', log: tail(r.err + '\n' + r.out) } };
  }
  return { doc: { ok: true, dir: project, recreated: !!recreate, containerId: result.containerId } };
}

function firstLockfile([dir]) {
  const project = resolve(dir);
  const before = projectFacts(project);
  if (before.lockfiles.length) {
    return { doc: { ok: false, dir: project, error: `project already has ${before.lockfiles.join(', ')}; a first lockfile is only created when there is none` } };
  }
  // The image sets pnpm_config_frozen_lockfile=true, so the first install must opt out explicitly.
  const script = `${before.hasPackageJson ? '' : 'pnpm init >/dev/null && '}pnpm install --no-frozen-lockfile`;
  const r = devcontainer(['exec', '--workspace-folder', project, 'sh', '-c', script]);
  const created = existsSync(join(project, 'pnpm-lock.yaml'));
  if (r.code !== 0 || !created) return { doc: { ok: false, dir: project, error: 'pnpm install inside the container failed', log: tail(r.err + '\n' + r.out) } };
  return { doc: { ok: true, dir: project, lockfile: 'pnpm-lock.yaml', createdPackageJson: !before.hasPackageJson } };
}

const FOREIGN_LOCKFILES = LOCKFILES.filter((f) => f !== 'pnpm-lock.yaml');

function importLockfile([dir]) {
  const project = resolve(dir);
  const before = projectFacts(project);
  const from = before.lockfiles.filter((f) => FOREIGN_LOCKFILES.includes(f));
  if (before.lockfiles.includes('pnpm-lock.yaml')) return { doc: { ok: false, dir: project, error: 'project already has pnpm-lock.yaml; nothing to convert' } };
  if (!from.length) return { doc: { ok: false, dir: project, error: `no ${FOREIGN_LOCKFILES.join(', ')} to convert` } };
  const packageJson = join(project, 'package.json');
  const original = existsSync(packageJson) ? readFileSync(packageJson, 'utf8') : null;
  // packageManager first: pnpm refuses to run in a project that declares another package manager.
  // `pnpm import` honours the image's frozen-lockfile policy, so it opts out for this one run.
  const script = 'npm pkg set "packageManager=pnpm@$(pnpm --version)" && pnpm_config_frozen_lockfile=false pnpm import' +
    ` && rm -f ${from.join(' ')} && npm pkg get packageManager`;
  const r = devcontainer(['exec', '--workspace-folder', project, 'sh', '-c', script]);
  if (r.code !== 0 || !existsSync(join(project, 'pnpm-lock.yaml'))) {
    if (original !== null) writeFileSync(packageJson, original); // leave no half-converted project behind
    rmSync(join(project, 'pnpm-lock.yaml'), { force: true });
    return { doc: { ok: false, dir: project, error: 'pnpm import inside the container failed; package.json and the old lockfile are unchanged', log: tail(r.err + '\n' + r.out) } };
  }
  const packageManager = JSON.parse(readFileSync(packageJson, 'utf8')).packageManager;
  return { doc: { ok: true, dir: project, imported: from, lockfile: 'pnpm-lock.yaml', packageManager } };
}

/** `pkg@1.2.3` or `@scope/pkg@1.2.3` -> { name, version }. */
function parsePackageId(id) {
  const at = id.lastIndexOf('@');
  return at > 0 ? { name: id.slice(0, at), version: id.slice(at + 1) } : { name: id, version: null };
}

function frozenInstall([dir]) {
  const project = resolve(dir);
  if (!existsSync(join(project, 'pnpm-lock.yaml'))) {
    return { doc: { ok: false, dir: project, error: 'no pnpm-lock.yaml: convert the project (import-lockfile) or create a first lockfile before a frozen install' } };
  }
  const r = devcontainer(['exec', '--workspace-folder', project, 'pnpm', 'install', '--frozen-lockfile']);
  const output = r.out + '\n' + r.err;
  // With the image's strictDepBuilds the dependencies are installed but pnpm exits non-zero
  // (ERR_PNPM_IGNORED_BUILDS) naming the build scripts it did not run; without it, it only warns.
  const m = output.match(/Ignored build scripts: ([^\n]+?)\.?\s*$/m);
  if (r.code === 0 && !m) return { doc: { ok: true, dir: project, blockedBuilds: [] } };
  if (!m || (r.code !== 0 && !/ERR_PNPM_IGNORED_BUILDS/.test(output))) return { doc: { ok: false, dir: project, error: 'pnpm install --frozen-lockfile inside the container failed', log: tail(output) } };
  return {
    doc: {
      ok: true,
      dir: project,
      blockedBuilds: m[1].split(/,\s*/).map(parsePackageId),
      note: 'Installs fail until each blocked package is decided in pnpm-workspace.yaml under allowBuilds (true runs its script, false skips it); then run pnpm rebuild in the container.',
    },
  };
}
