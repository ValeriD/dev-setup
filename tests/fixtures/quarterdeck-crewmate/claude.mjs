#!/usr/bin/env node
// Deterministic Claude substitute, only for the real FirstMate/Quarterdeck loop test.
import { appendFileSync, readFileSync, readdirSync, renameSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const argv = process.argv.slice(2);
if (argv.includes('--version')) { console.log('quarterdeck fixture claude'); process.exit(0); }
const id = process.env.FM_TASK_ID;
const state = dirname(process.env.FM_TASK_INBOX);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const status = line => appendFileSync(`${state}/${id}.status`, `${line.replace(':', ` [at=${Math.floor(Date.now() / 1000)}]:`)}\n`);
try {
  // FirstMate sends its private Brief through a record in the mounted state directory,
  // not a data/ mount. Read exactly the record named by the launch argument.
  const doorbell = argv.find(a => a.includes(`${state}/operational-inbox/`));
  if (!doorbell) throw Error('missing FirstMate launch Brief doorbell');
  const record = doorbell.slice(doorbell.indexOf(`${state}/operational-inbox/`)).match(/^[^\s']+\.msg/)?.[0];
  if (!record) throw Error('invalid launch Brief record path');
  const brief = readFileSync(record, 'utf8');
  const notes = brief.split(/^## Progress note[^\n]*\n/m);
  const note = notes.length > 1 ? notes.at(-1).trim() : '';
  const retry = note.match(/Retry of ticket (\d+)\. Save the failed attempt as (refs\/quarterdeck\/failed\/\d+-1), then reset to ([a-f0-9]+)\./);
  const ticket = retry?.[1] ?? note.match(/Ticket (\d+):/)?.[1];
  if (retry) {
    git('update-ref', retry[2], 'HEAD');
    git('rev-parse', '--verify', retry[2]);
    git('reset', '--hard', retry[3]);
  }
  const start = git('rev-parse', 'HEAD');
  const root = `.scratch/${id}`;
  const session = randomUUID();
  // One turn of work. A ticket marked `Ask:` stops with needs-decision until an answer
  // arrives: in the latest Progress note (a relaunch) or in the steering inbox (fm-send).
  const turn = answer => {
    let ask;
    if (!note || /^Plan\./.test(note)) {
      const branch = brief.match(/^Ship branch: (\S+)/m)?.[1];
      if (!branch) throw Error('missing branch contract');
      if (git('branch', '--show-current') !== branch) git('checkout', '-b', branch);
      const question = /Fixture question: true/.test(brief);
      mkdirSync(`${root}/issues`, { recursive: true });
      writeFileSync(`${root}/spec.md`, '# Fixture Spec\nTwo ordered tickets; no push.\n');
      writeFileSync(`${root}/design.md`, '# Fixture design\nTicket 02 consumes ticket 01.\n');
      writeFileSync(`${root}/issues/01-skills.md`, `# 01: about skills, prompts or agent tools\n${/Fixture failure: true/.test(brief) ? 'Fail: yes\n' : ''}${question ? 'Ask: yes\n' : ''}`);
      writeFileSync(`${root}/issues/02-code.md`, `# 02: ordinary code\nDepends on 01.\n${question ? 'Ask: yes\n' : ''}`);
      git('add', root);
      git('commit', '-qm', 'plan');
      status(`done: plan committed ${git('rev-parse', 'HEAD')}; 2 tickets`);
    } else if (/(?:^|\n)Publish\.$/.test(note)) {
      if (argv.at(-2) !== '--setting-sources' || argv.at(-1) !== 'user') throw Error('publish must use the Quarterdeck route');
      const home = dirname(state);
      const project = brief.match(/^Project: (\S+)/m)?.[1];
      if (!project) throw Error('missing publish project');
      const url = execFileSync('qd-publish', [home, project, git('branch', '--show-current'), id], { encoding: 'utf8' }).trim();
      status(`done: PR ${url}`);
    } else {
      if (!ticket) throw Error('unknown latest Progress note');
      const file = ticket === '01' ? '01-skills.md' : '02-code.md';
      const text = readFileSync(`${root}/issues/${file}`, 'utf8');
      const fail = /Fail: yes/.test(text);
      ask = /^Ask: yes$/m.test(text);
      if (ticket === '02' && !/^implemented(: word-01)?\n$/.test(readFileSync('ticket-01', 'utf8'))) throw Error('ticket 01 unavailable');
      if (ask && !answer) {
        writeFileSync(`ticket-${ticket}`, 'half done before the question\n'); // uncommitted, kept for the answer
        status(`needs-decision: ticket ${ticket}: which word goes in ticket-${ticket}?`);
      } else {
        writeFileSync(`ticket-${ticket}`, fail ? `failed attempt ${retry ? 2 : 1}\n` : `implemented${answer ? `: ${answer}` : ''}\n`);
        git('add', `ticket-${ticket}`);
        git('commit', '-qm', `ticket ${ticket}${fail ? ' failed' : ''}`);
        status(fail ? `failed: ticket ${ticket}: marked fixture failure` : `done: ticket ${ticket} committed ${git('rev-parse', 'HEAD')}; build ok, lint ok, test ok`);
        ask = false;
      }
    }
    // Simulate the lifecycle event, not Claude's policy enforcement (manual).
    const settings = JSON.parse(readFileSync('.claude/settings.local.json', 'utf8'));
    for (const entry of settings.hooks.Stop) for (const hook of entry.hooks) {
      execFileSync('bash', ['-c', hook.command]);
    }
    appendFileSync(`${state}/${id}.stub-sessions`, JSON.stringify({ session, cwd: process.cwd(), argv, note, start, head: git('rev-parse', 'HEAD'), answer, asked: Boolean(ask) }) + '\n');
    return ask;
  };
  const noteAnswer = note.match(/Answer: (.+)/)?.[1];
  let waiting = turn(noteAnswer);
  // FirstMate's steering inbox (format owned by its bin/fm-task-inbox-lib.sh): read each
  // record in order, act on it, then mv it into handled/.
  const drainInbox = () => {
    const dir = process.env.FM_TASK_INBOX;
    let names = [];
    try { names = readdirSync(dir).filter(n => /^\d+\.msg$/.test(n)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)); } catch { return; }
    for (const n of names) {
      const body = readFileSync(`${dir}/${n}`, 'utf8').split(/^--\n/m).slice(1).join('--\n');
      mkdirSync(`${dir}/handled`, { recursive: true });
      renameSync(`${dir}/${n}`, `${dir}/handled/${n}`);
      const answer = body.match(/Answer: (.+)/)?.[1];
      if (waiting && answer) waiting = turn(answer);
    }
  };
  // A real interactive Claude remains in its pane after reporting. FirstMate's
  // relaunch confirms a live endpoint, then terminates it for the next session.
  let composer = '';
  const draw = () => process.stdout.write(`\x1b[2J\x1b[H────────────────────────────────────────\r\n❯ ${composer}\r\n────────────────────────────────────────\r\n\x1b[2;${3 + composer.length}H`);
  process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', input => {
    for (const ch of input) {
      if (ch === '\r' || ch === '\n') {
        if (composer === '/exit') process.exit(0);
        if (composer.trim()) {
          try { drainInbox(); } catch (error) { status(`failed: stub: ${error.message}`); }
        }
        composer = '';
      } else if (ch === '\x1b' || ch === '\x03' || ch === '\x15') composer = '';
      else if (ch === '\x7f') composer = composer.slice(0, -1);
      else composer += ch;
    }
    draw();
  });
  draw();
  process.stdin.resume();
} catch (error) {
  status(`failed: stub: ${error.message}`);
  process.exitCode = 1;
}
