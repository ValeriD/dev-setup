// Fails when a workflow `uses:` is not pinned to a full commit SHA, or a
// Dockerfile base image / workflow container image is not pinned to a digest.
// Run in CI on every PR.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @returns {string[]} one message per violation */
export function findUnpinned(file, text) {
  const bad = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const where = `${file}:${i + 1}`;
    const uses = line.match(/^\s*(?:-\s*)?uses:\s*(\S+)/);
    if (uses && !uses[1].startsWith('./') && !/@[0-9a-f]{40}$/.test(uses[1])) {
      bad.push(`${where}: action not pinned to a full commit SHA: ${uses[1]}`);
    }
    const image = line.match(/^\s*(?:-\s*)?image:\s*['"]?(\S+?)['"]?\s*$/);
    if (image && /\.ya?ml$/.test(file) && !/@sha256:[0-9a-f]{64}$/.test(image[1])) {
      bad.push(`${where}: image not pinned to a digest: ${image[1]}`);
    }
    const from = line.match(/^FROM\s+(?:--\S+\s+)*(\S+)/i);
    if (from && from[1] !== 'scratch' && !/@sha256:[0-9a-f]{64}$/.test(from[1])
        && !lines.some((l) => new RegExp(`^FROM\\s.*\\sAS\\s+${from[1]}\\s*$`, 'i').test(l))) {
      bad.push(`${where}: base image not pinned to a digest: ${from[1]}`);
    }
  });
  return bad;
}

/**
 * The Quarterdeck Dockerfile repeats the Node Variant's base digest and Claude Code and pnpm pins.
 * @returns {string[]} one message per pin that differs
 */
export function findDrift(nodeText, quarterdeckText) {
  const base = (t) => t.match(/^FROM\s+(?:--\S+\s+)*(\S+)/im)?.[1];
  const arg = (t, n) => t.match(new RegExp(`^ARG ${n}=(\\S+)`, 'm'))?.[1];
  const pairs = [['base image', base], ['CLAUDE_CODE_VERSION', (t) => arg(t, 'CLAUDE_CODE_VERSION')], ['PNPM_VERSION', (t) => arg(t, 'PNPM_VERSION')]];
  return pairs.flatMap(([what, get]) => {
    const [want, have] = [get(nodeText), get(quarterdeckText)];
    return want && want === have ? [] : [`quarterdeck/Dockerfile: ${what} is ${have}, variants/node/Dockerfile has ${want}`];
  });
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const wf = join(root, '.github/workflows');
  const files = readdirSync(wf).filter((f) => /\.ya?ml$/.test(f)).map((f) => join('.github/workflows', f));
  files.push('variants/node/Dockerfile', 'quarterdeck/Dockerfile');
  const bad = files.flatMap((f) => findUnpinned(f, readFileSync(join(root, f), 'utf8')));
  bad.push(...findDrift(readFileSync(join(root, 'variants/node/Dockerfile'), 'utf8'), readFileSync(join(root, 'quarterdeck/Dockerfile'), 'utf8')));
  bad.forEach((m) => console.error(m));
  if (bad.length) process.exit(1);
  console.log(`pins ok (${files.length} files)`);
}
