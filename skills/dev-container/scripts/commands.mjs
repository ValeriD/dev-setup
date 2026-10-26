// Subcommands of the dev-container helper. Each returns { doc, code } for the
// entry point to print. The helper reads repository data, validates, renders
// the Template into `.devcontainer/` and drives the devcontainer CLI (pnpm runs
// only inside the container); every other project edit is the agent's,
// followed by `validate`.
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parse as parseJsonc, printParseErrorCode } from 'jsonc-parser';
import { describeEntry, schema, secretNames } from '../../../installer/src/index.mjs';
import { countTags, egressNeededBy, listPresets, manifestProblems, readJson, readProjectManifest } from './manifests.mjs';
import { inspect, planRemove } from './inspect.mjs';
import { UsageError } from './errors.mjs';

/** Same pin as the acceptance suite (tests/lib.mjs) and CI (CLI_VERSION). */
export const DEVCONTAINER_CLI = '@devcontainers/cli@0.89.0';
export const LOCKFILES = ['pnpm-lock.yaml', 'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock'];
/** Host VS Code user settings that ADR 0003's mitigations rely on. */
export const VSCODE_SETTINGS = { 'dev.containers.copyGitConfig': false, 'dev.containers.dockerCredentialHelper': false };
const DIGEST_REF = /@sha256:[0-9a-f]{64}$/;
/** cosign, run through host Docker (no host install). Tag and digest are both kept current by renovate.json. */
export const COSIGN_IMAGE = 'ghcr.io/sigstore/cosign/cosign:v3.1.3@sha256:9e5c2f2edc34351160407ca3416c61855bdf9403c3c5936e0f0be7fc261611b8';
/** The only accepted signer: keyless, from this repository's release workflow on main (.github/workflows/ci.yml). */
export const SIGNER = {
  identityRegexp: '^https://github\\.com/(?i:valerid/dev-setup)/\\.github/workflows/ci\\.yml@refs/heads/main$',
  issuer: 'https://token.actions.githubusercontent.com',
};
/** Image labels set by variants/<name>/Dockerfile. */
export const IMAGE_LABELS = {
  revision: 'org.opencontainers.image.revision',
  claudeCode: 'io.github.valerid.dev-setup.claude-code.version',
  codex: 'io.github.valerid.dev-setup.codex.version',
  pnpm: 'io.github.valerid.dev-setup.pnpm.version',
};
const PLACEHOLDER = /\$\{templateOption:([A-Za-z0-9_-]+)\}/g;

export { UsageError } from './errors.mjs';

const USAGE = `usage: dev-container.mjs <command> [args]
  check                                         verify the skill link and checkout
  variants [--dir DIR]                          list Variants; with --dir, propose one
  resolve-target TARGET [--projects-root DIR]   URL, local folder or new name -> project path and facts
  image-digest VARIANT [--ref IMAGE]            registry digest of the Variant image, UNVERIFIED: never write it to a project
  verify-image VARIANT [--ref IMAGE] [--current IMAGE]
                                                resolve, verify signature + provenance, read labels; with
                                                --current, the version and git-log changes since that image
  render-template VARIANT DIR --image REF@sha256:... [--option NAME=VALUE]... [--replace]
                                                --replace deletes an existing .devcontainer/ first (migrate)
  validate DIR                                  check .devcontainer/devcontainer.json and extensions.json
                                                (incl. a remoteEnv \${localEnv:…} entry for every named secret)
  presets [--name NAME]                         list Presets (presets/*.json) with descriptions and problems
  plan-remove-preset DIR NAME                   which entries and egress domains removing a Preset drops (read-only)
  inspect SOURCE [--ref REF] [--path PATH] [--plugin NAME] [--kind KIND] [--agents claude,codex]
          [--name NAME] [--event EVENT] [--matcher M] [--env NAME]... [--bearer-token-env NAME] [--project DIR]
                                                resolve a Pinned Ref, fetch read-only, list what the extension
                                                contains and propose its entry; SOURCE is owner/repo,
                                                https://github.com/owner/repo, npm:PACKAGE[@RANGE] or an https MCP URL
  plan-remove DIR INDEX                         what removing extensions[INDEX] drops, with egress nothing else needs (read-only)
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
  'verify-image': { positionals: 1, options: { ref: { type: 'string' }, current: { type: 'string' } }, fn: verifyImage },
  'render-template': { positionals: 2, options: { image: { type: 'string' }, option: { type: 'string', multiple: true }, replace: { type: 'boolean' } }, fn: renderTemplate },
  validate: { positionals: 1, options: {}, fn: validate },
  presets: { positionals: 0, options: { name: { type: 'string' } }, fn: presets },
  'plan-remove-preset': { positionals: 2, options: {}, fn: planRemovePreset },
  inspect: {
    positionals: 1,
    options: {
      ref: { type: 'string' }, path: { type: 'string' }, plugin: { type: 'string' }, kind: { type: 'string' }, agents: { type: 'string' },
      name: { type: 'string' }, event: { type: 'string' }, matcher: { type: 'string' }, env: { type: 'string', multiple: true },
      'bearer-token-env': { type: 'string' }, project: { type: 'string' },
    },
    fn: inspect,
  },
  'plan-remove': { positionals: 2, options: {}, fn: planRemove },
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

const STALE_LOGIN_HINT = 'If the registry answers 403 for a public image, a stale `docker login ghcr.io` is the usual cause (`docker logout ghcr.io`).';

/** The Variant image the Template points at, or `ref`. */
function variantSource(repo, variant, ref) {
  requireVariant(repo, variant);
  const source = ref ?? templateManifest(repo, variant).options?.image?.default;
  if (!source) throw new Error(`templates/${variant} has no default image option`);
  return source;
}

/** What a failed spawnSync said. */
const failure = (r) => (r.stderr || r.error?.message || '').trim();

function imagetools(ref, format) {
  const r = spawnSync('docker', ['buildx', 'imagetools', 'inspect', ref, '--format', format], { encoding: 'utf8' });
  if (r.status !== 0) return { error: `cannot read ${ref} from the registry: ${failure(r)}. ${STALE_LOGIN_HINT}` };
  return { value: JSON.parse(r.stdout) };
}

/** `{ digest, image }` for a tag or digest reference, read from the registry. */
function resolveDigest(source) {
  const m = imagetools(source, '{{json .Manifest}}');
  if (m.error) return m;
  const digest = m.value.digest;
  if (!DIGEST_REF.test(`@${digest}`)) return { error: `unexpected manifest from ${source}` };
  return { digest, image: `${repositoryOf(source)}@${digest}` };
}

function imageDigest([variant], { ref }, { repo }) {
  const source = variantSource(repo, variant, ref);
  const r = resolveDigest(source);
  if (r.error) return { doc: { ok: false, ref: source, error: r.error } };
  return {
    doc: {
      ok: true,
      ref: source,
      ...r,
      verified: false,
      note: 'Digest read from the registry, signature and provenance NOT verified. Only a digest from verify-image may be written to a project.',
    },
  };
}

// ---------- Image verification ----------

/** Labels of a digest-pinned image (a single manifest, or linux/amd64 of an index). */
export function imageLabels(image) {
  const r = imagetools(image, '{{json .Image}}');
  if (r.error) return r;
  const config = r.value?.config ? r.value : r.value?.['linux/amd64'];
  if (!config) return { error: `${image} has no linux/amd64 image` };
  const labels = config.config?.Labels ?? {};
  const { revision, ...versionKeys } = IMAGE_LABELS;
  return {
    revision: labels[revision] || null,
    versions: Object.fromEntries(Object.entries(versionKeys).map(([name, key]) => [name, labels[key] || null])),
  };
}

function cosign(args) {
  // Host network: the registry may be on the host's loopback (tests). No Docker
  // config is mounted, so cosign reads the public image anonymously.
  const r = spawnSync('docker', ['run', '--rm', '--network', 'host', COSIGN_IMAGE, ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
  return { code: r.status, out: r.stdout ?? '', err: failure(r) };
}

/**
 * Makes the cosign image present, pulling the public, digest-pinned image anonymously
 * (an empty Docker config, so a stale registry login cannot block it) on the current
 * context's daemon. Returns the error, or null when cosign is ready.
 */
function pullCosignError() {
  if (spawnSync('docker', ['image', 'inspect', COSIGN_IMAGE], { stdio: 'ignore' }).status === 0) return null;
  const host = process.env.DOCKER_HOST
    || spawnSync('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], { encoding: 'utf8' }).stdout?.trim();
  const config = mkdtempSync(join(tmpdir(), 'dc-docker-config-'));
  try {
    writeFileSync(join(config, 'config.json'), '{}');
    const env = { ...process.env, DOCKER_CONFIG: config, ...(host ? { DOCKER_HOST: host } : {}) };
    const r = spawnSync('docker', ['pull', '-q', COSIGN_IMAGE], { encoding: 'utf8', env });
    return r.status === 0 ? null : `cannot pull ${COSIGN_IMAGE}: ${failure(r)}`;
  } finally {
    rmSync(config, { recursive: true, force: true });
  }
}

const SIGNER_ARGS = ['--certificate-identity-regexp', SIGNER.identityRegexp, '--certificate-oidc-issuer', SIGNER.issuer];

/**
 * Fails closed: any resolve error, missing tool, missing or foreign signature,
 * or missing provenance is `ok: false`. There is deliberately no option to skip a check.
 */
function verifyImage([variant], { ref, current }, { repo }) {
  const source = variantSource(repo, variant, ref);
  const fail = (failed, error, extra = {}) => ({ doc: { ok: false, verified: false, variant, ref: source, failed, error, ...extra } });

  const resolved = resolveDigest(source);
  if (resolved.error) return fail('resolve', resolved.error);
  const { digest, image } = resolved;
  const pullError = pullCosignError();
  if (pullError) return fail('cosign', pullError, { image });

  const sig = cosign(['verify', image, ...SIGNER_ARGS, '--output', 'json']);
  let payloads = [];
  try {
    payloads = JSON.parse(sig.out);
  } catch { /* no JSON: treated as no signature */ }
  if (sig.code !== 0 || !Array.isArray(payloads) || !payloads.length) {
    return fail('signature', `${image} has no valid signature from this repository's release workflow`, { image, detail: tail(sig.err, 5) });
  }
  if (!payloads.every((p) => p?.critical?.image?.['docker-manifest-digest'] === digest)) {
    return fail('signature', `the signature does not cover ${digest}`, { image });
  }
  const prov = cosign(['verify-attestation', '--type', 'slsaprovenance1', image, ...SIGNER_ARGS]);
  if (prov.code !== 0 || !prov.out.trim()) {
    return fail('provenance', `${image} has no valid SLSA provenance attestation from this repository's release workflow`, { image, detail: tail(prov.err, 5) });
  }

  const labels = imageLabels(image);
  if (labels.error) return fail('labels', labels.error, { image });
  const doc = { ok: true, verified: true, variant, ref: source, image, digest, ...labels, signer: SIGNER };
  if (current) {
    const cur = DIGEST_REF.test(current) ? { image: current, digest: current.split('@').pop() } : resolveDigest(current);
    const curLabels = cur.error ? cur : imageLabels(cur.image);
    if (curLabels.error) return { doc: { ...doc, current: { image: current, error: curLabels.error }, changes: null } };
    doc.current = { image: cur.image, ...curLabels };
    doc.upToDate = cur.digest === digest;
    doc.changes = imageChanges(repo, variant, doc.current, labels);
  }
  return { doc };
}

/** Paths an image of `variant` is built from: what "Base-layer and Variant changes" means. */
const imagePaths = (variant) => ['base', 'installer', 'extensions', `variants/${variant}`];

/** Agent/pnpm version changes and the image-relevant git log between two labelled images. */
export function imageChanges(repo, variant, from, to) {
  const versions = Object.keys(to.versions)
    .filter((k) => from.versions?.[k] !== to.versions[k])
    .map((name) => ({ name, from: from.versions?.[name] ?? null, to: to.versions[name] }));
  const changes = { versions, newer: null, log: null, logPaths: imagePaths(variant) };
  if (!from.revision || !to.revision) {
    changes.logNote = 'an image has no revision label (built before labels existed); no git log';
    return changes;
  }
  const missing = [from.revision, to.revision].filter((rev) =>
    spawnSync('git', ['-C', repo, 'rev-parse', '--verify', '--quiet', `${rev}^0`], { stdio: 'ignore' }).status !== 0);
  if (missing.length) {
    changes.logNote = `revision ${missing.join(', ')} is not in the dev-setups checkout at ${repo}; run \`git -C ${repo} fetch\` and verify again`;
    return changes;
  }
  // false: the "new" image is older than the current one (a rollback).
  changes.newer = spawnSync('git', ['-C', repo, 'merge-base', '--is-ancestor', from.revision, to.revision], { stdio: 'ignore' }).status === 0;
  const r = spawnSync('git', ['-C', repo, 'log', '--format=%h%x09%s', `${from.revision}..${to.revision}`, '--', ...changes.logPaths], { encoding: 'utf8' });
  changes.log = r.stdout.split('\n').filter(Boolean).map((l) => {
    const [sha, ...subject] = l.split('\t');
    return { sha, subject: subject.join('\t') };
  });
  return changes;
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

/** The Variant whose Template points at the same image repository, or null. */
function variantOfImage(repo, image) {
  if (typeof image !== 'string') return null;
  const want = repositoryOf(image);
  return listVariants(repo).find((v) => v.template && repositoryOf(templateManifest(repo, v.name).options?.image?.default ?? '') === want)?.name ?? null;
}

function validate([dir], _, { repo }) {
  const project = resolve(dir);
  const problems = [];
  const dcFile = join(project, '.devcontainer/devcontainer.json');
  const mfFile = join(project, '.devcontainer/extensions.json');
  let image, remoteEnv, dcRead = false;

  if (!existsSync(dcFile)) problems.push(`${relative(project, dcFile)} is missing`);
  else {
    const text = readFileSync(dcFile, 'utf8');
    const { value, errors } = readJsonc(dcFile);
    for (const e of errors) problems.push(`.devcontainer/devcontainer.json: ${e}`);
    if (!errors.length) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) problems.push('.devcontainer/devcontainer.json must be a JSON object');
      else {
        dcRead = true;
        image = value.image;
        remoteEnv = value.remoteEnv;
        if (typeof image !== 'string' || !DIGEST_REF.test(image)) problems.push(`.devcontainer/devcontainer.json: "image" must be digest-pinned (…@sha256:<64 hex>), got ${JSON.stringify(image)}`);
      }
    }
    for (const m of text.matchAll(PLACEHOLDER)) problems.push(`.devcontainer/devcontainer.json: unrendered placeholder ${m[0]}`);
  }

  let entries, presetTags, secrets, egress;
  if (!existsSync(mfFile)) problems.push(`${relative(project, mfFile)} (Extension Manifest) is missing`);
  else {
    const { value: manifest, error } = readJson(mfFile);
    if (error) problems.push(`.devcontainer/extensions.json: ${error}`);
    else {
      const found = manifestProblems(manifest);
      for (const p of found) problems.push(`.devcontainer/extensions.json: ${p}`);
      if (!found.length) {
        entries = manifest.extensions.length;
        presetTags = countTags(manifest.extensions);
        egress = manifest.egress ?? [];
        // Only once devcontainer.json is readable: otherwise its own problem is already reported.
        if (dcRead) secrets = checkSecrets(manifest.extensions, remoteEnv, problems);
      }
    }
  }
  return { doc: { ok: problems.length === 0, dir: project, image, variant: variantOfImage(repo, image), entries, presets: presetTags, egress, secrets, problems } };
}

/** `${localEnv:NAME}` with no default: a default would be a value committed to the repository. */
const LOCAL_ENV_REF = /^\$\{localEnv:([A-Za-z_][A-Za-z0-9_]*)\}$/;

/**
 * Every secret the project's MCP entries name (stdio `env`, remote `bearerTokenEnv`) must reach
 * the container through a `remoteEnv` entry that references a host variable. Pushes problems
 * (names only, never a value) and returns [{ name, neededBy, hostEnv }].
 */
function checkSecrets(extensions, remoteEnv, problems) {
  const env = remoteEnv !== null && typeof remoteEnv === 'object' && !Array.isArray(remoteEnv) ? remoteEnv : null;
  if (remoteEnv !== undefined && !env) problems.push('.devcontainer/devcontainer.json: "remoteEnv" must be an object');
  const neededBy = new Map();
  extensions.forEach((e, i) => {
    for (const name of secretNames(e)) neededBy.set(name, [...(neededBy.get(name) ?? []), describeEntry(e, i)]);
  });
  return [...neededBy].map(([name, by]) => {
    const value = env && Object.hasOwn(env, name) ? env[name] : undefined;
    const ref = typeof value === 'string' ? value.match(LOCAL_ENV_REF) : null;
    const fix = `"${name}": "\${localEnv:${name}}"`;
    if (value === undefined) problems.push(`.devcontainer/devcontainer.json: secret ${name} (named by ${by.join(', ')}) has no remoteEnv entry; add ${fix}`);
    else if (!ref) problems.push(`.devcontainer/devcontainer.json: remoteEnv ${name} must be a host reference like ${fix}, never a value (its current value is not shown)`);
    return { name, neededBy: by, hostEnv: ref ? ref[1] : null };
  });
}

function presets(_, { name }, { repo }) {
  const all = listPresets(repo);
  if (!name) return { doc: { ok: true, dir: join(repo, 'presets'), presets: all } };
  const one = all.find((p) => p.name === name);
  if (!one) return { doc: { ok: false, error: `no Preset "${name}" (presets/${name}.json); known: ${all.map((p) => p.name).join(', ') || 'none'}` } };
  return { doc: { ok: one.problems.length === 0, preset: one } };
}

function planRemovePreset([dir, name], _, { repo }) {
  const project = resolve(dir);
  const read = readProjectManifest(project);
  if (read.error) return { doc: { ok: false, ...read } };
  const { file: mfFile, manifest } = read;

  const entries = manifest.extensions;
  const tags = countTags(entries);
  if (!tags[name]) return { doc: { ok: false, error: `no entry in ${mfFile} is tagged "preset": "${name}"`, presets: tags } };
  const remove = entries.flatMap((e, index) => (e.preset === name ? [{ index, entry: describeEntry(e, index) }] : []));

  // Top-level egress carries no tag, so the domains the Preset file lists today are the
  // candidates. One stays when an entry that stays, or another adopted Preset, needs it.
  const neededBy = egressNeededBy(repo, entries.flatMap((entry, index) => (entry.preset === name ? [] : [{ entry, index }])));
  const preset = listPresets(repo).find((p) => p.name === name && !p.problems.length);
  const candidates = (preset?.egress ?? []).filter((d) => (manifest.egress ?? []).includes(d));

  return {
    doc: {
      ok: true,
      dir: project,
      preset: name,
      remove,
      egress: candidates.filter((d) => !neededBy.has(d)),
      keepEgress: candidates.filter((d) => neededBy.has(d)).map((d) => ({ domain: d, neededBy: neededBy.get(d) })),
      ...(preset ? {} : { note: `presets/${name}.json is missing or invalid, so which top-level egress domains it brought in is unknown` }),
    },
  };
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
