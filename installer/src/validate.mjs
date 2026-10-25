// Manifest validation: the published JSON Schema (structure), the Pinned Ref
// rule and the kind x Agent capability table (the rules with friendly errors).
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';

export const schema = JSON.parse(readFileSync(new URL('../extensions.schema.json', import.meta.url), 'utf8'));

export const AGENTS = ['claude', 'codex'];

/** Which Agents can receive each kind of Agent Extension. */
export const CAPABILITIES = {
  skill: ['claude', 'codex'],
  // Codex installs plugins only into $CODEX_HOME (the login volume), which the design forbids (D3).
  plugin: ['claude'],
  mcp: ['claude', 'codex'],
  'mcp-remote': ['claude', 'codex'],
  hook: ['claude'],
};

const SHA = /^[0-9a-f]{40}$/;
const EXACT_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
const FLOATING_KEYS = ['ref', 'tag', 'branch', 'rev', 'commit', 'latest'];

export class ManifestError extends Error {
  /** @param {string[]} problems one line per problem, each naming the entry */
  constructor(problems) {
    super(problems.join('\n'));
    this.name = 'ManifestError';
    this.problems = problems;
  }
}

/** Short human label for an entry, used in every error message. */
export function describeEntry(entry, index) {
  const s = entry?.source ?? {};
  const what = entry?.name ?? (s.github && `${s.github}/${s.path}`) ?? (s.npm && `${s.npm}@${s.version}`)
    ?? (s.marketplace && `${s.marketplace}:${s.plugin}`) ?? entry?.url ?? entry?.event;
  return `extensions[${index}] (${entry?.kind ?? 'unknown kind'}${what ? ` ${JSON.stringify(what)}` : ''})`;
}

/**
 * Pinned Ref rule for one entry's source. Returns a problem string or null.
 * A Pinned Ref is a full commit SHA or an exact package version; nothing floats.
 */
export function checkPinnedRef(source) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) return null; // shape is the schema's job
  for (const k of FLOATING_KEYS) {
    if (k in source) return `floating ref "${k}" is not allowed; pin an exact commit SHA ("sha") or exact version`;
  }
  if ('npm' in source) {
    if (!('version' in source)) return 'missing Pinned Ref: "version" must be an exact package version';
    if (typeof source.version !== 'string' || !EXACT_VERSION.test(source.version)) {
      return `"${source.version}" is not an exact version (ranges and dist-tags float); pin e.g. "1.2.3"`;
    }
    return null;
  }
  if ('github' in source || 'marketplace' in source) {
    if (!('sha' in source)) return 'missing Pinned Ref: "sha" must be a 40-character commit SHA';
    if (typeof source.sha !== 'string' || !SHA.test(source.sha)) {
      return `"${source.sha}" is not a full 40-character commit SHA (a branch, tag or short SHA floats or is ambiguous)`;
    }
  }
  return null;
}

/** kind x Agent: returns a problem string or null. */
export function checkKindAgent(kind, agents) {
  const allowed = CAPABILITIES[kind];
  if (!allowed || !Array.isArray(agents)) return null; // unknown kind / shape: reported elsewhere
  const bad = agents.filter((a) => AGENTS.includes(a) && !allowed.includes(a));
  if (bad.length === 0) return null;
  return `kind "${kind}" is not supported for ${bad.join(', ')} (supported for: ${allowed.join(', ')})`;
}

const ajv = new Ajv({ allErrors: true, strict: true });
const validateShape = ajv.compile(schema);

/**
 * Validate one parsed manifest. Returns a list of problem strings (empty when valid).
 * Rules with a clear cause (Pinned Ref, kind x Agent) are reported first for an
 * entry and replace the generic schema errors for it.
 */
export function validateManifest(manifest) {
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['manifest must be a JSON object with an "extensions" array'];
  }
  const problems = [];
  const entries = Array.isArray(manifest.extensions) ? manifest.extensions : [];
  const flagged = new Set();
  entries.forEach((entry, i) => {
    if (entry === null || typeof entry !== 'object') return;
    const msgs = [];
    if (typeof entry.kind === 'string' && !(entry.kind in CAPABILITIES)) {
      msgs.push(`unknown kind "${entry.kind}" (known: ${Object.keys(CAPABILITIES).join(', ')})`);
    }
    const ka = checkKindAgent(entry.kind, entry.agents);
    if (ka) msgs.push(ka);
    const pr = checkPinnedRef(entry.source);
    if (pr) msgs.push(pr);
    if (msgs.length) {
      flagged.add(i);
      for (const m of msgs) problems.push(`${describeEntry(entry, i)}: ${m}`);
    }
  });

  if (!validateShape(manifest)) {
    for (const e of validateShape.errors) {
      const m = e.instancePath.match(/^\/extensions\/(\d+)(\/.*)?$/);
      if (m) {
        const i = Number(m[1]);
        if (flagged.has(i)) continue;
        if (e.keyword === 'if' || e.keyword === 'oneOf' && e.instancePath.endsWith('/source')) continue;
        problems.push(`${describeEntry(entries[i], i)}: ${m[2] ? m[2].slice(1) + ' ' : ''}${e.message}${extra(e)}`);
      } else {
        problems.push(`manifest${e.instancePath} ${e.message}${extra(e)}`);
      }
    }
  }
  return [...new Set(problems)];
}

function extra(e) {
  if (e.keyword === 'additionalProperties') return ` ("${e.params.additionalProperty}")`;
  if (e.keyword === 'enum') return ` (${e.params.allowedValues.join(', ')})`;
  return '';
}

/** Validate or throw a ManifestError. `label` (e.g. the file name) prefixes every problem. */
export function assertValidManifest(manifest, label = '') {
  const problems = validateManifest(manifest);
  if (problems.length) throw new ManifestError(problems.map((p) => (label ? `${label}: ${p}` : p)));
  return manifest;
}
