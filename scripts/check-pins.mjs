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

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const wf = join(root, '.github/workflows');
  const files = readdirSync(wf).filter((f) => /\.ya?ml$/.test(f)).map((f) => join('.github/workflows', f));
  files.push('variants/node/Dockerfile');
  const bad = files.flatMap((f) => findUnpinned(f, readFileSync(join(root, f), 'utf8')));
  bad.forEach((m) => console.error(m));
  if (bad.length) process.exit(1);
  console.log(`pins ok (${files.length} files)`);
}
