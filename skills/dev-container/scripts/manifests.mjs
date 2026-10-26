// Reading and checking Extension Manifests and Presets, shared by the helper's
// subcommands. Read-only: nothing here writes a file.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseJsonc, printParseErrorCode } from 'jsonc-parser';
import { describeEntry, ManifestError, mergeLayers, schema, validateManifest } from '../../../installer/src/index.mjs';

/** Strict JSON (Extension Manifests and Presets are plain JSON): { value } or { error }. */
export function readJson(file) {
  try {
    return { value: JSON.parse(readFileSync(file, 'utf8')) };
  } catch (err) {
    return { error: `not valid JSON: ${err.message}` };
  }
}

/** JSONC (devcontainer.json, VS Code settings): { value, errors }. */
export function readJsonc(file) {
  const errors = [];
  const value = parseJsonc(readFileSync(file, 'utf8'), errors, { allowTrailingComma: true, disallowComments: false });
  return { value, errors: errors.map((e) => `${printParseErrorCode(e.error)} at offset ${e.offset}`) };
}

/** A remoteEnv `${localEnv:NAME}` with no default: a default would be a value committed to the repository. */
export const LOCAL_ENV_REF = /^\$\{localEnv:([A-Za-z_][A-Za-z0-9_]*)\}$/;

const LAYER = 'layer';

/** Schema, Pinned Ref and kind x Agent rules, plus the installer's per-layer rules (unique skill names). */
export function manifestProblems(manifest) {
  const problems = validateManifest(manifest);
  if (problems.length) return problems;
  try {
    mergeLayers([{ label: LAYER, manifest }]);
  } catch (err) {
    if (!(err instanceof ManifestError)) throw err;
    return err.problems.map((p) => (p.startsWith(`${LAYER}: `) ? p.slice(LAYER.length + 2) : p));
  }
  return [];
}

/** A project's valid Extension Manifest: { file, manifest } or { error, problems? }. */
export function readProjectManifest(project) {
  const file = join(project, '.devcontainer/extensions.json');
  if (!existsSync(file)) return { error: `${file} (Extension Manifest) is missing` };
  const { value: manifest, error } = readJson(file);
  if (error) return { error: `${file}: ${error}` };
  const problems = manifestProblems(manifest);
  if (problems.length) return { error: 'the Extension Manifest is invalid; fix it first', problems };
  return { file, manifest };
}

/** { presetName: number of entries tagged with it } */
export function countTags(entries) {
  const tags = {};
  for (const e of entries) if (e.preset) tags[e.preset] = (tags[e.preset] ?? 0) + 1;
  return tags;
}

const PRESET_NAME = new RegExp(schema.definitions.presetName.pattern);

/** Every presets/*.json, parsed and checked. A Preset with problems carries no `extensions`. */
export function listPresets(repo) {
  const root = join(repo, 'presets');
  return readdirSync(root)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const name = f.slice(0, -'.json'.length);
      const file = join(root, f);
      const problems = [];
      if (!PRESET_NAME.test(name)) problems.push(`file name: "${name}" is not a Preset name (${PRESET_NAME.source})`);
      const { value: preset, error } = readJson(file);
      if (error) problems.push(error);
      else {
        problems.push(...manifestProblems(preset));
        if (typeof preset?.description !== 'string' || !preset.description.trim()) problems.push('"description" is required: one line saying what the Preset is for');
        // Top-level egress has no owner, so resync and Preset removal could not tell which
        // domains the Preset brought in. A Preset carries egress on its entries only.
        if (preset && typeof preset === 'object' && 'egress' in preset) problems.push('a Preset has no top-level "egress": put each domain on the entry that needs it (its own "egress")');
        (Array.isArray(preset?.extensions) ? preset.extensions : []).forEach((e, i) => {
          if (e && typeof e === 'object' && 'preset' in e) problems.push(`${describeEntry(e, i)}: a Preset's own entries carry no "preset" tag; the tag is added when they are copied into a project`);
        });
      }
      const doc = { name, file, description: typeof preset?.description === 'string' ? preset.description : null, problems };
      if (!problems.length) doc.extensions = preset.extensions;
      return doc;
    });
}

/**
 * Which entries list each domain in their own `egress`.
 * @param {{entry: object, index: number}[]} entries
 * @returns {Map<string, string[]>} domain -> the entries that need it
 */
export function egressNeededBy(entries) {
  const neededBy = new Map();
  for (const { entry, index } of entries) {
    for (const d of entry.egress ?? []) neededBy.set(d, [...new Set([...(neededBy.get(d) ?? []), describeEntry(entry, index)])]);
  }
  return neededBy;
}

/** True when `host` is `domain` or one of its subdomains (an allowlist domain covers its subdomains). */
export const covers = (domain, host) => host === domain || host.endsWith(`.${domain}`);

/**
 * The egress that goes with removing the entries at `indexes`: each removed entry's own
 * domains, once, with what keeps each allowed in the project layer (a staying entry's egress
 * or the top-level egress, the project's own needs, which removal never touches). Pure:
 * reads only the manifest.
 * @returns {{domain: string, stillAllowedBy: string[]}[]}
 */
export function egressGoing(manifest, indexes) {
  const removed = new Set(indexes);
  const staying = egressNeededBy(manifest.extensions.flatMap((entry, index) => (removed.has(index) ? [] : [{ entry, index }])));
  const topLevel = manifest.egress ?? [];
  const own = [...new Set([...removed].flatMap((i) => manifest.extensions[i].egress ?? []))];
  return own.map((domain) => ({
    domain,
    stillAllowedBy: [
      ...new Set([...staying].filter(([d]) => covers(d, domain)).flatMap(([, by]) => by)),
      ...(topLevel.some((d) => covers(d, domain)) ? ['top-level egress'] : []),
    ],
  }));
}
