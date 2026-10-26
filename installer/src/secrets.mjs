// Named Secrets: host env var names the container receives by name only. An MCP
// entry names the ones its server needs; a manifest's top-level `secrets` names
// container-wide ones. Only names are handled here, never values.

/** Names of the host env vars an MCP entry needs (stdio `env`, remote `bearerTokenEnv`). */
export function secretNames(entry) {
  if (entry.kind === 'mcp-remote') return entry.bearerTokenEnv ? [entry.bearerTokenEnv] : [];
  return entry.kind === 'mcp' ? entry.env ?? [] : [];
}

/** Declarer of a top-level secret. */
export const CONTAINER_WIDE = 'container-wide';

/**
 * Every Named Secret with who declares it, in first-seen order.
 * @param {object[]} extensions merged entries
 * @param {string[]} secrets merged top-level `secrets`
 * @returns {Map<string, string[]>} name -> declarers (`MCP server "<name>"`, `container-wide`)
 */
export function secretDeclarers(extensions, secrets) {
  const by = new Map();
  const add = (name, who) => by.set(name, [...new Set([...(by.get(name) ?? []), who])]);
  for (const e of extensions) for (const n of secretNames(e)) add(n, `MCP server "${e.name}"`);
  for (const n of secrets) add(n, CONTAINER_WIDE);
  return by;
}

/** The list `check-secrets.sh` reads: one `NAME<TAB>declarer, declarer` line per secret. */
export const renderSecretsList = (declarers) => [...declarers].map(([n, by]) => `${n}\t${by.join(', ')}\n`).join('');
