// Fetch the exact content of a Pinned Ref with git. Nothing fetched is ever run.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, lstatSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';

export const DEFAULT_GIT_BASE = 'https://github.com/';
const SHA = /^[0-9a-f]{40}$/;

function git(cwd, args) {
  return execFileSync('git', [
    // No hooks, no filters, no credential prompts: fetched content is data only.
    '-c', 'core.hooksPath=/dev/null', '-c', 'protocol.version=2', '-c', 'advice.detachedHead=false',
    '-c', 'core.symlinks=true', '-c', 'filter.lfs.smudge=', '-c', 'filter.lfs.process=', '-c', 'filter.lfs.required=false',
    ...args,
  ], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_LFS_SKIP_SMUDGE: '1' } });
}

/** URL of a GitHub-style `owner/repo` under a git base (default https://github.com/). */
export function repoUrl(ownerRepo, gitBase = DEFAULT_GIT_BASE) {
  return `${gitBase.endsWith('/') ? gitBase : gitBase + '/'}${ownerRepo}.git`;
}

/**
 * Fetch exactly commit `sha` of `url` into a fresh temp directory and check out
 * its tree. Fails if the server returns anything other than that commit.
 * @returns {{dir: string, cleanup: () => void}}
 */
export function fetchBySha(url, sha, { tmpRoot = tmpdir() } = {}) {
  if (!SHA.test(sha)) throw new Error(`refusing to fetch "${sha}": not a full 40-character commit SHA`);
  const dir = mkdtempSync(join(tmpRoot, 'dev-setup-fetch-'));
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  try {
    git(dir, ['init', '-q', '--template=']);
    git(dir, ['fetch', '-q', '--depth', '1', '--no-tags', '--no-recurse-submodules', url, sha]);
    const head = git(dir, ['rev-parse', '--verify', 'FETCH_HEAD^{commit}']).trim();
    if (head !== sha) throw new Error(`fetched ${head}, expected ${sha}`);
    git(dir, ['checkout', '-q', '--detach', sha]);
  } catch (err) {
    cleanup();
    const lines = String(err.stderr || err.message).trim().split('\n');
    const detail = lines.find((l) => /^(fatal|error):/.test(l)) ?? lines[0];
    throw new Error(`cannot fetch ${sha} from ${url}: ${detail}`);
  }
  return { dir, cleanup };
}

/**
 * Copy a directory tree out of a checkout. Skips `.git`, refuses symlinks and
 * special files, so a skill cannot point outside itself.
 */
export function copyTree(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    if (name === '.git') continue;
    const from = join(src, name);
    const to = join(dest, name);
    const st = lstatSync(from);
    if (st.isDirectory()) copyTree(from, to);
    else if (st.isFile()) writeFileSync(to, readFileSync(from), { mode: st.mode & 0o111 ? 0o755 : 0o644 });
    else throw new Error(`${from}: symlinks and special files are not allowed in installed content`);
  }
}

/** Resolve `path` inside a checkout, refusing escapes. */
export function pathInCheckout(root, path) {
  const norm = posix.normalize(path);
  if (posix.isAbsolute(norm) || norm === '..' || norm.startsWith('../')) throw new Error(`path "${path}" escapes the repository`);
  const full = norm === '.' ? root : join(root, norm);
  if (!existsSync(full)) throw new Error(`path "${path}" does not exist at the pinned commit`);
  if (lstatSync(full).isSymbolicLink()) throw new Error(`path "${path}" is a symlink`);
  return full;
}
