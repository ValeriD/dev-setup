// `status`: what a Consuming Project runs and what is out of date, as one JSON
// document. Read-only: it writes nothing, and reports host environment variables
// by name and whether they are set, never their values.
//
// Live state only, no cache: the project's files, the Presets in this checkout,
// committer dates of Pinned Refs (fetched with the installer's fetchBySha into a
// fresh temp directory and only read), npm publish times, the registry (through
// verify-image), and the running container (found by its devcontainer label).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DEFAULT_GIT_BASE, describeEntry, fetchBySha, repoUrl } from '../../../installer/src/index.mjs';
import { lastObject, npmView } from './inspect.mjs';
import { egressNeededBy, listPresets, LOCAL_ENV_REF, readJsonc, readProjectManifest } from './manifests.mjs';

/** Written by the start-up step (base/egress/start.sh): the hash of the project manifest it applied, or "none". */
export const APPLIED_HASH_PATH = '/run/dev-setup/applied-manifest';
/** Host variables commits inside the container need (design: "Host git identity"). */
export const GIT_IDENTITY = ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL'];
/** The container variable the Template's remoteEnv maps to the host PAT variable (option `patEnvVar`). */
export const PAT_ENV = 'DEV_SETUP_GITHUB_PAT';
const DAY = 86400e3;

const gitBase = () => process.env.DEV_SETUP_GIT_BASE || DEFAULT_GIT_BASE;
const isSet = (name) => typeof process.env[name] === 'string' && process.env[name] !== '';
const ageDays = (iso) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / DAY) : null);
const sha256 = (buf) => `sha256:${createHash('sha256').update(buf).digest('hex')}`;

/**
 * `ctx` carries `repo` plus the `validate` and `verifyImage` subcommands, handed over by
 * commands.mjs so this module does not import it back.
 */
export function status([dir], { 'skip-image-check': skipImage }, ctx) {
  const project = resolve(dir);
  const read = readProjectManifest(project);
  if (read.error) return { doc: { ok: false, dir: project, ...read } };
  const { manifest } = read;
  const validated = ctx.validate([project], {}, ctx).doc;
  const remoteEnv = readRemoteEnv(project);
  const neededBy = egressNeededBy(ctx.repo, manifest.extensions.map((entry, index) => ({ entry, index })));

  return {
    doc: {
      ok: true,
      dir: project,
      problems: validated.problems,
      image: imageStatus(validated, skipImage, ctx),
      presets: presetStatus(ctx.repo, manifest),
      extensions: extensionAges(manifest.extensions),
      egress: {
        // neededBy: the entries and adopted Presets that list the domain; empty when only the project allowed it.
        topLevel: (manifest.egress ?? []).map((domain) => ({ domain, neededBy: neededBy.get(domain) ?? [] })),
        entries: manifest.extensions.flatMap((e, i) => (e.egress ?? []).map((domain) => ({ domain, entry: describeEntry(e, i) }))),
      },
      env: hostEnv(validated.secrets ?? [], remoteEnv),
      container: containerStatus(project, validated.image, remoteEnv),
    },
  };
}

// ---------- Image ----------

function imageStatus(validated, skip, ctx) {
  const doc = { current: validated.image ?? null, variant: validated.variant ?? null };
  if (skip) return { ...doc, latest: null, newerVerified: null, note: 'registry not checked (--skip-image-check)' };
  if (!doc.variant) return { ...doc, latest: null, newerVerified: null, note: 'the image is not one of this repository\'s Variants; nothing to compare with' };
  const r = ctx.verifyImage([doc.variant], { current: doc.current }, ctx).doc;
  if (!r.ok) return { ...doc, latest: { ok: false, failed: r.failed, error: r.error, ...(r.image ? { image: r.image } : {}) }, newerVerified: null };
  const newer = r.changes?.newer ?? null;
  return {
    ...doc,
    latest: {
      ok: true, verified: true, image: r.image, revision: r.revision, upToDate: r.upToDate ?? null, newer, versions: r.changes?.versions ?? null,
      ...(r.changes?.logNote ? { note: r.changes.logNote } : r.current?.error ? { note: `the current image could not be read: ${r.current.error}` } : {}),
    },
    // true only when the verified image is a later revision; null when that cannot be told.
    newerVerified: r.upToDate ? false : newer,
  };
}

// ---------- Presets ----------

/** Canonical JSON (sorted keys), so equal entries compare equal whatever their key order. */
function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/** The same extension at any Pinned Ref: a change, not an addition plus a removal. */
function extensionKey(e) {
  const { sha, version, ...where } = e.source ?? {};
  return canon([e.kind, where, e.url ?? null]);
}

const untagged = ({ preset, ...rest }) => rest;

/**
 * Per adopted Preset (by tag): whether the project's tagged entries still equal the
 * Preset file, the per-entry diff, Preset egress missing from the project, and the
 * exact tagged entries a resync writes.
 */
function presetStatus(repo, manifest) {
  const presets = new Map(listPresets(repo).map((p) => [p.name, p]));
  const names = [...new Set(manifest.extensions.flatMap((e) => (e.preset ? [e.preset] : [])))];
  return names.map((name) => {
    const tagged = manifest.extensions.flatMap((e, index) => (e.preset === name ? [{ index, entry: untagged(e) }] : []));
    const p = presets.get(name);
    const base = { name, entries: tagged.length, indexes: tagged.map((t) => t.index) };
    if (!p) return { ...base, state: 'missing', note: `presets/${name}.json no longer exists; the project keeps its copies` };
    if (p.problems.length) return { ...base, state: 'invalid', problems: p.problems, note: `presets/${name}.json has problems; fix the Preset before resyncing` };

    const left = [...tagged];
    const take = (pred) => {
      const i = left.findIndex(pred);
      return i < 0 ? null : left.splice(i, 1)[0];
    };
    // Exact copies first, then the same extension at another Pinned Ref or with other fields.
    const pending = p.extensions.filter((want) => !take((t) => canon(t.entry) === canon(want)));
    const added = [];
    const changed = [];
    for (const want of pending) {
      const hit = take((t) => extensionKey(t.entry) === extensionKey(want));
      if (hit) changed.push({ index: hit.index, from: hit.entry, to: want, describe: describeEntry(want, hit.index) });
      else added.push(want);
    }
    const removed = left.map((t) => ({ index: t.index, entry: t.entry, describe: describeEntry(t.entry, t.index) }));
    const egressMissing = p.egress.filter((d) => !(manifest.egress ?? []).includes(d));
    const drifted = added.length + changed.length + removed.length + egressMissing.length > 0;
    return {
      ...base,
      state: drifted ? 'drifted' : 'in-sync',
      ...(drifted ? {
        diff: { added, changed, removed, egressMissing },
        resync: {
          // Replace the entries at `indexes` with these, in this order; add `egressMissing` to the top-level egress.
          entries: p.extensions.map((e) => ({ ...e, preset: name })),
          egressAdd: egressMissing,
          note: 'Top-level egress carries no tag, so a domain the Preset dropped is not detected; removing it is the Preset-remove flow',
        },
      } : {}),
    };
  });
}

// ---------- Pinned Ref ages ----------

/** Commit date of `sha` in `ownerRepo`, fetched by SHA into a temp directory and read with git: { date } or { error }. */
function commitDate(ownerRepo, sha, cache) {
  const key = `${ownerRepo}@${sha}`;
  if (!cache.has(key)) {
    let r;
    try {
      const co = fetchBySha(repoUrl(ownerRepo, gitBase()), sha);
      try {
        const out = spawnSync('git', ['--git-dir', join(co.dir, '.git'), 'show', '-s', '--format=%cI', sha], { encoding: 'utf8' });
        r = out.status === 0 ? { date: out.stdout.trim() } : { error: `cannot read the committer date: ${out.stderr.trim()}` };
      } finally {
        co.cleanup();
      }
    } catch (err) {
      r = { error: err.message };
    }
    cache.set(key, r);
  }
  return cache.get(key);
}

/** npm publish time of an exact version: { date } or { error }. */
function publishDate(pkg, version, cache) {
  if (!cache.has(pkg)) cache.set(pkg, npmView([pkg, 'time']));
  const t = cache.get(pkg);
  if (t.error) return { error: `cannot read publish times of ${pkg}: ${t.error}` };
  const date = lastObject(t.value)?.[version];
  return date ? { date } : { error: `${pkg} has no publish time for ${version}` };
}

function extensionAges(extensions) {
  const commits = new Map();
  const times = new Map();
  return extensions.map((e, index) => {
    const s = e.source ?? {};
    const doc = { index, entry: describeEntry(e, index), kind: e.kind, agents: e.agents, ...(e.preset ? { preset: e.preset } : {}) };
    let pinned = null;
    let when = {};
    if (s.sha) {
      pinned = { type: 'sha', value: s.sha };
      when = commitDate(s.github ?? s.marketplace, s.sha, commits);
    } else if (s.npm) {
      pinned = { type: 'version', value: s.version };
      when = publishDate(s.npm, s.version, times);
    }
    if (!pinned) return { ...doc, pinnedRef: null, note: 'no Pinned Ref: a remote MCP server declares its egress domains instead (node-devcontainer D2)' };
    return { ...doc, pinnedRef: pinned, date: when.date ?? null, ageDays: ageDays(when.date), ...(when.error ? { error: when.error } : {}) };
  });
}

// ---------- Host environment ----------

function readRemoteEnv(project) {
  const file = join(project, '.devcontainer/devcontainer.json');
  if (!existsSync(file)) return null;
  const { value, errors } = readJsonc(file);
  const env = errors.length ? null : value?.remoteEnv;
  return env && typeof env === 'object' && !Array.isArray(env) ? env : null;
}

/**
 * Which host variables the container expects and whether each is set on this host.
 * Names only: a value is never read into the output.
 */
function hostEnv(secrets, remoteEnv) {
  const secretDocs = secrets.map((s) => ({ name: s.name, neededBy: s.neededBy, hostEnv: s.hostEnv, set: s.hostEnv ? isSet(s.hostEnv) : false }));
  const gitDocs = GIT_IDENTITY.map((name) => {
    const ref = typeof remoteEnv?.[name] === 'string' ? remoteEnv[name].match(LOCAL_ENV_REF) : null;
    const hostVar = ref ? ref[1] : null;
    return { name, hostEnv: hostVar, set: hostVar ? isSet(hostVar) : false, ...(hostVar ? {} : { note: `devcontainer.json has no remoteEnv "${name}": "\${localEnv:${name}}"` }) };
  });
  const missing = [...new Set([...secretDocs, ...gitDocs].filter((d) => !d.set).map((d) => d.hostEnv ?? d.name))];
  return { secrets: secretDocs, gitIdentity: gitDocs, missing, pat: patStatus(remoteEnv) };
}

/**
 * The host variable behind remoteEnv's DEV_SETUP_GITHUB_PAT line, by name only. An unset
 * one is a note, not a `missing` entry: only `git push` needs it. null without such a line.
 */
function patStatus(remoteEnv) {
  const ref = typeof remoteEnv?.[PAT_ENV] === 'string' ? remoteEnv[PAT_ENV].match(LOCAL_ENV_REF) : null;
  if (!ref) return null;
  const set = isSet(ref[1]);
  return { name: PAT_ENV, hostEnv: ref[1], set, ...(set ? {} : { note: `${ref[1]} unset: \`git push\` from the container will fail` }) };
}

// ---------- Container ----------

function docker(args) {
  const r = spawnSync('docker', args, { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout ?? '').trim(), err: (r.stderr || r.error?.message || '').trim() };
}

/** The applied hash of a running container, read as `node`, or null. */
function execRead(id) {
  const r = docker(['exec', '-u', 'node', id, 'cat', APPLIED_HASH_PATH]);
  return r.code === 0 ? r.out : null;
}

/** The applied hash of a stopped container: `docker cp` streams a one-file tar (512-byte header, size in octal at 124). */
function copyRead(id) {
  const r = spawnSync('docker', ['cp', `${id}:${APPLIED_HASH_PATH}`, '-']);
  if (r.status !== 0 || !r.stdout || r.stdout.length < 512) return null;
  const size = parseInt(r.stdout.subarray(124, 136).toString('latin1').replace(/\0.*$/s, '').trim(), 8);
  return Number.isFinite(size) ? r.stdout.subarray(512, 512 + size).toString('utf8').trim() : null;
}

const layers = (ref) => {
  const r = docker(['image', 'inspect', ref, '--format', '{{json .RootFS.Layers}}']);
  return r.code === 0 ? JSON.parse(r.out) : null;
};

/**
 * The project's container, found by its devcontainer.local_folder label, and whether
 * it runs the current config: the applied manifest hash written by the start-up step,
 * the image (the CLI may run a derived `vsc-…-uid` image, so its layers must start
 * with the configured image's), and the remoteEnv it was created with.
 */
function containerStatus(project, configured, remoteEnv) {
  const ps = docker(['ps', '-a', '--filter', `label=devcontainer.local_folder=${project}`, '--format', '{{.ID}}\t{{.State}}']);
  if (ps.code !== 0) return { found: null, pendingRecreate: null, reasons: [], error: `cannot list containers: ${ps.err}` };
  const rows = ps.out.split('\n').filter(Boolean).map((l) => l.split('\t'));
  if (!rows.length) return { found: false, pendingRecreate: null, reasons: [], note: 'no container for this project; the next start creates one from the current config' };
  const [id, state] = rows[0];
  const doc = { found: true, id, state, ...(rows.length > 1 ? { note: `${rows.length} containers carry this folder's label; showing the first` } : {}) };

  const manifestFile = join(project, '.devcontainer/extensions.json');
  const manifestHash = existsSync(manifestFile) ? sha256(readFileSync(manifestFile)) : 'none';
  const reasons = [];
  const unknown = [];

  const info = docker(['inspect', id, '--format', '{{json .Config.Labels}}\t{{.Image}}']);
  const [labelsJson, imageId] = info.code === 0 ? info.out.split('\t') : ['null', null];
  const labels = JSON.parse(labelsJson || 'null') ?? {};

  // Image: the configured image's layers must be a prefix of the container image's.
  const have = imageId ? layers(imageId) : null;
  const want = configured ? layers(configured) : null;
  if (!configured || !have) unknown.push('the container image could not be compared');
  else if (!want) reasons.push(`devcontainer.json names ${configured}, which is not in the local image store, so it is not the image the container runs (a recreate pulls it)`);
  else if (want.some((l, i) => have[i] !== l)) reasons.push(`devcontainer.json names ${configured}, which is not the image the container runs`);

  // remoteEnv: the CLI records the config's own properties as the last metadata entry.
  let meta = null;
  try {
    meta = JSON.parse(labels['devcontainer.metadata'] ?? 'null');
  } catch { /* unknown below */ }
  if (Array.isArray(meta) && meta.length) {
    const was = meta.at(-1)?.remoteEnv ?? null;
    if (canon(was) !== canon(remoteEnv)) reasons.push('remoteEnv in devcontainer.json changed since the container was created (secrets or git identity)');
  } else unknown.push('the container has no devcontainer metadata to compare remoteEnv with');

  // Running: read as node. Stopped: copy the file out (a start would re-apply the manifest).
  const appliedHash = state === 'running' ? execRead(id) : copyRead(id);
  if (appliedHash === null) unknown.push(`${APPLIED_HASH_PATH} cannot be read from the ${state} container (an image from before the applied hash existed, or a container that never finished starting); recreate to compare`);
  else if (appliedHash !== manifestHash) reasons.push('.devcontainer/extensions.json changed after the container started');
  const pendingRecreate = reasons.length ? true : unknown.length ? null : false;
  return { ...doc, manifestHash, appliedHash, pendingRecreate, reasons, unknown };
}

