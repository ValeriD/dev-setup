// File writing shared by the installer's outputs.
import { chmodSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Write a root-owned, world-readable file by rename, so a reader never sees half of it. */
export function writeAtomic(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, content);
  chmodSync(tmp, 0o644);
  renameSync(tmp, file);
}
