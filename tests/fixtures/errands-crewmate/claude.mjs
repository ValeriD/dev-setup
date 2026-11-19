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
  const notes = brief.split(/^## Progress note[^\n]*\n/m);
  const note = notes.length > 1 ? notes.at(-1).trim() : '';
  const start = git('rev-parse', 'HEAD');
  const sessionRecord = (extra = {}) => appendFileSync(`${state}/${id}.stub-sessions`, `${JSON.stringify({ host: hostname(), cwd: process.cwd(), branch: git('branch', '--show-current'), note, start, head: git('rev-parse', 'HEAD'), log: git('log', '--format=%s', '-n', '20'), ...extra })}\n`);
  const prompt = () => {
    // Stay at a prompt like an interactive Claude, until FirstMate ends the session with /exit.
    let composer = '';
    const draw = () => process.stdout.write(`\x1b[2J\x1b[H────────────────────────────────────────\r\n❯ ${composer}\r\n────────────────────────────────────────\r\n\x1b[2;${3 + composer.length}H`);
    process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (input) => {
      for (const ch of input) {
        if (ch === '\r' || ch === '\n') {
          if (composer === '/exit') process.exit(0);
          composer = '';
        } else if (ch === '\x1b' || ch === '\x03' || ch === '\x15') composer = '';
        else if (ch === '\x7f') composer = composer.slice(0, -1);
        else composer += ch;
      }
      draw();
    });
    draw();
    process.stdin.resume();
  };
  const stopHooks = () => {
    const settings = JSON.parse(readFileSync('.claude/settings.local.json', 'utf8'));
    for (const entry of settings.hooks.Stop) for (const hook of entry.hooks) execFileSync('bash', ['-c', hook.command]);
  };
  if (git('branch', '--show-current') !== branch) git('checkout', '-b', branch);
  const question = brief.match(/^Errand question: (.+)$/m)?.[1];
  const answer = note.match(/^Answer: (.+)$/m)?.[1];
  const comment = note.match(/^Comment: (.+)$/m)?.[1];
  if (/^Errand hang: true$/m.test(brief) && !note) {
    // Work in progress that never finishes: the test ends this process from outside. Nothing is committed.
    writeFileSync(file, 'half done\n');
    sessionRecord({ hung: true });
    prompt();
    setInterval(() => {}, 1000);
    throw Object.assign(Error('hung'), { hung: true });
  }
  if (question && !answer) {
    // An undecided point: the question, no guess, no commit; the half-done file stays for the answer.
    writeFileSync(file, 'half done before the question\n');
    status(`needs-decision: ${question}`);
    stopHooks();
    sessionRecord({ asked: true });
    prompt();
    throw Object.assign(Error('asked'), { hung: true });
  }
  if (note && !answer) {
    // Sent back with a comment, in the same worktree and branch.
    writeFileSync(`${file}.comment`, `${comment ?? note}\n`);
    git('add', `${file}.comment`);
    git('commit', '-qm', `errand ${id}: comment`);
    const head = git('rev-parse', 'HEAD');
    status(`done: ready in branch ${branch}; check: none`);
    stopHooks();
    sessionRecord({ head, sawEarlier: true });
    prompt();
    throw Object.assign(Error('sent back'), { hung: true });
  }
  // A follow-up Errand: a new task on a branch from today's main that brings an earlier branch's commits over.
  const followUp = brief.match(/^Errand follow-up: (\S+)$/m)?.[1];
  if (followUp && !note) git('cherry-pick', `${git('merge-base', 'HEAD', followUp)}..${followUp}`);
  const gate = brief.match(/^Errand gate: (\S+)$/m)?.[1];
  if (gate && !note) {
    // Say that this session is up, then wait for the test to open the gate: lets the test show Errands overlapping.
    writeFileSync(`${state}/${id}.stub-started`, `${process.cwd()}\n`);
    while (!existsSync(gate)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  writeFileSync(file, `${brief.match(/^Errand: (.+)$/m)?.[1] ?? ''}${answer ? ` (${answer})` : ''}\n`);
  // The check runs only when the Brief tells the Crewmate to follow the file and the file is there.
  let check = 'none';
  if (/\.quarterdeck\/errand-check\.md/.test(brief) && existsSync('.quarterdeck/errand-check.md')) {
    const command = readFileSync('.quarterdeck/errand-check.md', 'utf8').match(/^command: (.+)$/m)?.[1];
    try { execFileSync('sh', ['-c', command], { stdio: 'ignore' }); check = 'passed'; } catch { check = 'failed'; }
  }
  git('add', file);
  git('commit', '-qm', `errand ${id}`);
  status(`done: ready in branch ${branch}; check: ${check}`);
  stopHooks();
  sessionRecord({ check, followUp });
  prompt();
} catch (error) {
  if (!error.hung) {
    status(`failed: stub: ${error.message}`);
    process.exitCode = 1;
  }
}
