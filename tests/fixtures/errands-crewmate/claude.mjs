#!/usr/bin/env node
// Deterministic Claude substitute for the Errand loop test: one job from the Brief, committed on the Ship branch,
// then a done line carrying `check: passed|failed|none`. No model, no network. Installed into a Project container by the test.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { hostname } from 'node:os';
import { dirname } from 'node:path';

const argv = process.argv.slice(2);
if (argv.includes('--version')) { console.log('errands fixture claude'); process.exit(0); }
const id = process.env.FM_TASK_ID;
const state = dirname(process.env.FM_TASK_INBOX);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const status = (line) => appendFileSync(`${state}/${id}.status`, `${line.replace(':', ` [at=${Math.floor(Date.now() / 1000)}]:`)}\n`);
try {
  const doorbell = argv.find((a) => a.includes(`${state}/operational-inbox/`));
  if (!doorbell) throw Error('missing FirstMate launch Brief doorbell');
  const record = doorbell.slice(doorbell.indexOf(`${state}/operational-inbox/`)).match(/^[^\s']+\.msg/)?.[0];
  if (!record) throw Error('invalid launch Brief record path');
  const brief = readFileSync(record, 'utf8');
  const branch = brief.match(/^Ship branch: (\S+)/m)?.[1];
  const file = brief.match(/^Errand file: (\S+)/m)?.[1];
  if (!branch || !file) throw Error('the Brief names no Ship branch or Errand file');
  const start = git('rev-parse', 'HEAD');
  if (git('branch', '--show-current') !== branch) git('checkout', '-b', branch);
  writeFileSync(file, `${brief.match(/^Errand: (.+)$/m)?.[1] ?? ''}\n`);
  // The check runs only when the Brief tells the Crewmate to follow the file and the file is there.
  let check = 'none';
  if (/\.quarterdeck\/errand-check\.md/.test(brief) && existsSync('.quarterdeck/errand-check.md')) {
    const command = readFileSync('.quarterdeck/errand-check.md', 'utf8').match(/^command: (.+)$/m)?.[1];
    try { execFileSync('sh', ['-c', command], { stdio: 'ignore' }); check = 'passed'; } catch { check = 'failed'; }
  }
  git('add', file);
  git('commit', '-qm', `errand ${id}`);
  status(`done: ready in branch ${branch}; check: ${check}`);
  const settings = JSON.parse(readFileSync('.claude/settings.local.json', 'utf8'));
  for (const entry of settings.hooks.Stop) for (const hook of entry.hooks) execFileSync('bash', ['-c', hook.command]);
  appendFileSync(`${state}/${id}.stub-sessions`, `${JSON.stringify({ host: hostname(), cwd: process.cwd(), start, head: git('rev-parse', 'HEAD'), check })}\n`);
  // Stay at a prompt like an interactive Claude, until FirstMate ends the session.
  process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', () => process.stdout.write('\x1b[2J\x1b[H────────────────────────────────────────\r\n❯ \r\n────────────────────────────────────────\r\n'));
  process.stdin.resume();
} catch (error) {
  status(`failed: stub: ${error.message}`);
  process.exitCode = 1;
}
