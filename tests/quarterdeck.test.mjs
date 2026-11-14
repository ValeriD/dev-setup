// Quarterdeck acceptance, token-free and container level (SC-01 and the image contract).
// The Quarterdeck image is built once per run, by the first `quarterdeck` call below, which is also
// what proves "builds the image when it is missing". Everything the file creates carries the run
// label and a name made from the run id; teardown removes only that. No prune.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { REPO, RUN_LABEL, IMAGE, buildImage, run, projectDir } from './lib.mjs';

const id = process.env.DEV_SETUP_TEST_RUN ?? randomBytes(4).toString('hex');
const runLabel = `${RUN_LABEL}=${id}`;
const name = `qd-test-${id}`;
const image = `dev-setup-quarterdeck:test-${id}`;
const stranger = `qd-test-stranger-${id}`; // unlabelled by Quarterdeck, labelled by the run for teardown
const closedProbe = `qd-test-failclosed-${id}`;
const stubImage = `dev-setup-quarterdeck:test-stub-${id}`; // the Quarterdeck image with `claude` replaced by a stub
const proxyName = `${name}-docker-proxy`;
const proxyVolume = `${name}-docker`;
const lifecycle = `qd-test-lifecycle-${id}`; // created through the proxy, labelled by the run for teardown
const COMMAND = join(REPO, 'quarterdeck/bin/quarterdeck');
const dockerfile = readFileSync(join(REPO, 'quarterdeck/Dockerfile'), 'utf8');
// The proxy pin and the allowed list live in one file, which the command sources and this test reads.
const proxyConf = readFileSync(join(REPO, 'quarterdeck/docker-proxy.conf'), 'utf8');
const conf = (n) => proxyConf.match(new RegExp(`^${n}=(.*)$`, 'm'))?.[1];
const arg = (n) => dockerfile.match(new RegExp(`^ARG ${n}=(\\S+)`, 'm'))[1];

// Dummy token values only. The file holds a comment, a quoted value, a shell-looking value, a name nothing
// declares, and leaves QUARTERDECK_EXTENSIONS_TOKEN out (it must be warned about by name).
const CLAUDE = `dummy-claude-${id}`;
const GITHUB = `dummy-github-${id}$(touch /tmp/pwned-${id})\`x\`$HOME`;
const sha = (v) => createHash('sha256').update(`${v}\n`).digest('hex');
let work;
let secretsFile;
before(() => {
  work = projectDir('qd-work-');
  secretsFile = join(projectDir('qd-secrets-'), 'secrets.env');
  writeFileSync(secretsFile, `# dummy\r\nCLAUDE_CODE_OAUTH_TOKEN=${CLAUDE}\nQUARTERDECK_GITHUB_TOKEN="${GITHUB}"\nNOT_DECLARED=dummy-other-${id}\nexport JUNK\n`, { mode: 0o600 });
  // The container user is uid 1000: on another host uid it cannot read a 0600 file. The command warns about the mode and still mounts it.
  if (process.getuid?.() !== 1000) chmodSync(secretsFile, 0o644);
  // `node` in the container is uid 1000. On a host or CI runner with another uid it cannot write folders
  // the host user created, so open the test's own folders (the command's mkdir -p then finds them).
  if (process.getuid?.() !== 1000) {
    for (const d of [work, join(work, 'quarterdeck'), join(work, 'quarterdeck/claude'), join(work, 'pool')]) {
      mkdirSync(d, { recursive: true });
      chmodSync(d, 0o777);
    }
  }
});
after(() => {
  // Also covers a creator failure before the fixture's try/finally is entered.
  for (const c of run('docker', ['ps', '-aq', '--filter', 'label=quarterdeck.creator=qd-project-up', '--filter', `label=${runLabel}`]).out.split('\n').filter(Boolean)) {
    const volumes = JSON.parse(run('docker', ['inspect', c]).out)[0].Mounts.filter(m => m.Type === 'volume').map(m => m.Name);
    run('docker', ['rm', '-fv', c]);
    for (const v of volumes) run('docker', ['volume', 'rm', v]);
  }
  for (const n of [name, proxyName, stranger, closedProbe, lifecycle]) run('docker', ['rm', '-fv', n]);
  run('docker', ['volume', 'rm', proxyVolume]);
  for (const c of run('docker', ['ps', '-aq', '--filter', `label=${runLabel}`, '--filter', `name=${name}`]).out.split('\n').filter(Boolean)) {
    run('docker', ['rm', '-fv', c]);
  }
  // FirstMate makes hook directories read-only, even on a uid-1000 host.
  // Remove only this test's home/config/pool from a labelled root container.
  run('docker', ['run', '--rm', '--label', runLabel, '--user', 'root', '--entrypoint', 'rm', '-v', `${work}:${work}`, image, '-rf', join(work, 'fleet'), join(work, 'quarterdeck/config'), join(work, 'pool')]);
  run('docker', ['rmi', crewImage]);
  run('docker', ['rmi', stubImage]);
  run('docker', ['rmi', image]);
  rmSync(work, { recursive: true, force: true });
  rmSync(join(secretsFile, '..'), { recursive: true, force: true });
});

// The host command with the test's name, image, work root and run label. Attach runs a probe instead of the TUI (no terminal here).
const quarterdeck = (...args) =>
  run(COMMAND, args, {
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Host Author', GIT_AUTHOR_EMAIL: 'author@example.invalid',
      GIT_COMMITTER_NAME: 'Host Committer', GIT_COMMITTER_EMAIL: 'committer@example.invalid',
      QUARTERDECK_NAME: name,
      QUARTERDECK_IMAGE: image,
      QUARTERDECK_WORK_ROOT: work,
      QUARTERDECK_RUN_LABEL: runLabel,
      QUARTERDECK_SECRETS: secretsFile,
      QUARTERDECK_ATTACH_CMD: 'herdr --session default status server',
    },
  });
const ours = () => run('docker', ['ps', '-aq', '--filter', `label=io.github.valerid.quarterdeck=${name}`]).out.split('\n').filter(Boolean);
const inside = (script) => run('docker', ['exec', '-u', 'node', name, 'sh', '-c', script]);
const okInside = (script) => {
  const r = inside(script);
  assert.equal(r.code, 0, `${script}\n${r.out}\n${r.err}`);
  return r.out;
};

let firstId;
const crewImage = `dev-setup-quarterdeck:test-crew-${id}`;

// Test script plays the Second Mate (qd-spec-run steps 2–8); no product checker.
async function testTicketLoop(t, failure = false) {
  buildImage();
  const built = run('docker', ['build', '--build-arg', `NODE_IMAGE=${IMAGE}`, '--label', runLabel,
    '-t', crewImage, join(REPO, 'tests/fixtures/quarterdeck-crewmate')]);
  assert.equal(built.code, 0, built.err);
  const started = quarterdeck();
  assert.equal(started.code, 0, started.err);
  const parent = `${work}/fleet/firstmate`;
  const mate = failure ? 'sm-loop-failure' : 'sm-loop';
  const home = `${work}/fleet/${mate}`;
  const origin = `${work}/${mate}-origin.git`;
  const clone = `${home}/projects/loop`;
  const slug = failure ? 'loop-failure' : 'loop-success';
  const put = (p, content) => {
    const r = run('docker', ['exec', '-i', '-u', 'node', name, 'sh', '-c', 'cat > "$1"', 'sh', p], { input: content });
    assert.equal(r.code, 0, r.err);
  };
  const fm = command => okInside(`cd ${home}; FM_HOME=${home} ${command}`);
  const read = p => okInside(`cat ${p}`);
  const git = args => fm(`git -C ${clone} ${args}`).trim();
  okInside(`rm -rf ${parent}/projects/loop; mkdir -p ${parent}/data ${parent}/projects/loop/.devcontainer; git init -q --bare -b main ${origin}; git -C ${parent}/projects/loop init -q -b main`);
  put(`${parent}/projects/loop/.devcontainer/devcontainer.json`, JSON.stringify({ image: crewImage, runArgs: ['--cap-drop=ALL'] }));
  put(`${parent}/projects/loop/.devcontainer/extensions.json`, readFileSync(join(REPO, 'templates/node/.devcontainer/extensions.json'), 'utf8'));
  put(`${parent}/projects/loop/.gitignore`, '.claude/\n');
  okInside(`cd ${parent}/projects/loop; git add .; git commit -qm initial; git remote add origin ${origin}; git push -q origin main`);
  put(`${parent}/data/projects.md`, `- loop [direct-PR branch=feat/] - Token-free loop fixture\n`);
  // FirstMate's publication guard needs real roots to distinguish this fixture
  // from its own repository. Fetch public history without any credential helper.
  if (okInside(`git -C ${parent} rev-parse --is-shallow-repository`).trim() === 'true') {
    okInside(`git -C ${parent} -c credential.helper= fetch --unshallow https://github.com/ValeriD/firstmate $(git -C ${parent} rev-parse HEAD)`);
  }
  okInside(`cd ${parent}; FM_HOME=${parent} FM_SECONDMATE_CHARTER='Second Mate for loop. Commit only.' bin/fm-brief.sh ${mate} --secondmate loop; FM_HOME=${parent} bin/fm-home-seed.sh ${mate} ${home} loop`);
  // No model plays this Second Mate, so install the same shipped home config
  // normally inherited when its pane is spawned.
  okInside(`cp /opt/qd/fleet/config/* ${home}/config/`);
  const base = git('rev-parse origin/main');
  const originRefs = okInside(`git --git-dir=${origin} show-ref`);
  fm(`env -u QUARTERDECK_EXTENSIONS_TOKEN QD_PROJECT_TEST_IMAGE=${crewImage} QD_RUN_LABEL=${runLabel} qd-project-up ${home} loop`);
  fm(`bin/fm-brief.sh ${slug} loop --mode direct-PR --branch-prefix feat/`);
  const briefPath = `${home}/data/${slug}/brief.md`;
  const generated = read(briefPath);
  const contract = generated.match(/^Delivery contract:.*$/m)?.[0];
  const branch = generated.match(/^Ship branch:.*$/m)?.[0];
  assert.ok(contract && branch);
  put(briefPath, generated.replace('{TASK}', `Spec Run: ${slug}\nProject: loop\nBranch prefix: feat/`)
    .replace('{FIRSTMATE_SPEC}', `Each session does exactly one job named by the latest ## Progress note. No note: plan.\nFixture failure: ${failure}\nGate: build, lint, test. One commit per job.`)
    .replace(/This task ships \*\*direct-PR\*\*:[\s\S]*?(?=Do NOT run \/no-mistakes\.)/, 'Commit and report; do not push or open a PR.\n'));
  assert.ok(read(briefPath).includes(contract) && read(briefPath).includes(branch));
  fm(`bin/fm-dispatch-resolve.sh ${briefPath}`);
  const spawned = fm(`bin/fm-spawn.sh ${slug} projects/loop --mode direct-PR --yolo off --branch-prefix feat/ --harness claude --model sonnet`);
  const wt = spawned.match(/worktree=(\S+)/)?.[1];
  assert.ok(wt, spawned);
  const wg = args => fm(`git -C ${wt} ${args}`).trim();
  const statusPath = `${home}/state/${slug}.status`;
  const sessionsPath = `${home}/state/${slug}.stub-sessions`;
  const sessions = () => JSON.parse(`[${read(sessionsPath).trim().split('\n').join(',')}]`);
  const wait = async count => {
    for (let n = 0; n < 120; n++) {
      const result = inside(`cat ${sessionsPath} 2>/dev/null`);
      if (result.code === 0 && result.out.trim().split('\n').length === count) return;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.fail(`stub session ${count} did not finish; ${inside(`cat ${statusPath}`).out}`);
  };
  const lastStatus = () => read(statusPath).trim().split('\n').at(-1);
  const checkTicket = (nn, start, status = lastStatus()) => {
    assert.match(status, new RegExp(`^done \\[at=\\d+\\]: ticket ${nn} committed ${wg('rev-parse HEAD')}; build ok, lint ok, test ok$`));
    wg(`merge-base --is-ancestor ${start} HEAD`);
    assert.equal(wg(`rev-list --count ${start}..HEAD`), '1');
    assert.equal(wg('status --porcelain'), '');
  };
  const relaunch = (model, note) => {
    const r = inside(`cd ${home}; FM_HOME=${home} bin/fm-control.sh ${slug} relaunch --model ${model} --note '${note}'`);
    assert.equal(r.code, 0, r.out + r.err);
  };
  await wait(1);
  const plan = wg('rev-parse HEAD');
  assert.match(lastStatus(), new RegExp(`^done \\[at=\\d+\\]: plan committed ${plan}; 2 tickets$`));
  assert.equal(wg(`rev-list --count ${base}..HEAD`), '1');
  assert.equal(wg('status --porcelain'), '');
  for (const file of ['spec.md', 'design.md', 'issues/01-skills.md', 'issues/02-code.md']) assert.ok(read(`${wt}/.scratch/${slug}/${file}`).trim());
  const dispatch = JSON.parse(read(`${home}/config/crew-dispatch.json`));
  let count = 1;
  for (const [nn, file] of [['01', '01-skills.md'], ['02', '02-code.md']]) {
    const ticket = `.scratch/${slug}/issues/${file}`;
    const text = read(`${wt}/${ticket}`);
    const model = /about skills, prompts or agent tools/.test(text) ? dispatch.rules[0].use.model : dispatch.default[0].model;
    const start = wg('rev-parse HEAD');
    relaunch(model, `Ticket ${nn}: ${ticket}. Start commit ${start}.`);
    await wait(++count);
    if (lastStatus().startsWith('failed ')) {
      const failed = wg('rev-parse HEAD');
      relaunch(model, `Retry of ticket ${nn}. Save the failed attempt as refs/quarterdeck/failed/${nn}-1, then reset to ${start}.`);
      await wait(++count);
      assert.match(lastStatus(), /^failed /);
      assert.equal(wg(`rev-parse refs/quarterdeck/failed/${nn}-1`), failed);
      assert.equal(wg('rev-parse HEAD^'), start, 'retry reset to original start before new attempt');
      break; // second failure: no later ticket and no publish
    }
    checkTicket(nn, start);
    assert.throws(() => checkTicket(nn, start, lastStatus().replace(', lint ok', '')), /match/);
    const state = fm(`bin/fm-crew-state.sh ${slug}`);
    assert.match(state, /blocked[\s\S]*named head[\s\S]*unreachable/);
    t.diagnostic(`ticket ${nn}: ${state.trim()}`);
  }
  assert.equal(wg('branch --show-current'), `feat/${slug}`);
  assert.deepEqual(git('for-each-ref --format="%(refname:short)" refs/heads').split('\n'), [`feat/${slug}`, 'main']);
  assert.equal(okInside(`git --git-dir=${origin} show-ref`), originRefs, 'no push');
  assert.equal(wg('status --porcelain'), '');
  const observed = sessions();
  assert.equal(observed.length, 3, 'plan and two sessions only');
  assert.equal(new Set(observed.map(s => s.session)).size, 3);
  assert.ok(observed.every(s => s.cwd === wt && !s.argv.some(a => /^(--resume|--continue|-r|-c)(=|$)/.test(a))));
  const logs = read(`${work}/quarterdeck/logs/launch.log`).trim().split('\n').map(JSON.parse).filter(s => s.cwd === wt);
  assert.deepEqual(logs.map(s => s.model), failure ? ['sonnet', 'opus', 'opus'] : ['sonnet', 'opus', 'sonnet']);
  assert.ok(logs.every(s => s.route === 'project'));
  if (!failure) {
    assert.deepEqual(wg(`log --reverse --format=%s ${base}..HEAD`).split('\n'), ['plan', 'ticket 01', 'ticket 02']);
    assert.equal(observed[2].start, observed[1].head, 'ticket 2 sees ticket 1 commit');
  } else {
    assert.equal(observed[2].start, plan);
    assert.match(observed[2].note, /Retry of ticket 01/);
    assert.equal(inside(`test -e ${wt}/ticket-02`).code, 1);
  }
  assert.equal(fm(`find state -maxdepth 1 -name '*.meta' -printf '%f\\n'`).trim(), `${slug}.meta`, 'one FirstMate record');
  assert.equal(okInside(`git -C ${home} status --porcelain --untracked-files=no`).trim(), '', 'FirstMate unpatched');
  assert.equal(okInside(`git -C ${parent} status --porcelain --untracked-files=no`).trim(), '', 'parent unpatched');
}


function testLauncherFixture({ home, wt, cid, put, probe }) {
  assert.equal(inside('test -x /opt/qd/bin/claude').code, 0, 'launcher installed');
  const shim = `${home}/launcher-shim`;
  okInside(`mkdir -p ${shim}`);
  put(`${shim}/docker`, `#!/usr/bin/env node
const fs = require('fs'), cp = require('child_process');
const args = process.argv.slice(2);
fs.appendFileSync('${home}/docker-record', JSON.stringify({args, hint: process.env.HERDR_AGENT}) + '\\n');
if (args[0] === 'ps' && process.env.QD_TEST_IDS !== undefined) {
 process.stdout.write(process.env.QD_TEST_IDS); process.exit(0);
}
const r = cp.spawnSync('/usr/local/bin/docker', args, {stdio: 'inherit'});
process.exit(r.status ?? 1);
`);
  okInside(`chmod +x ${shim}/docker`);
  // Replace only the fixture container's executable, never an image or real Claude session.
  const stub = `#!/usr/bin/env node
const fs = require('fs'), cp = require('child_process');
fs.writeFileSync('launcher-result.json', JSON.stringify({argv:process.argv.slice(2), env:process.env, uid:process.getuid()}));
if (!fs.existsSync('launcher-commit')) {
 fs.writeFileSync('launcher-commit', 'proof');
 cp.execFileSync('git', ['add', 'launcher-commit']);
 cp.execFileSync('git', ['commit', '-qm', 'launcher identity']);
}
`;
  assert.equal(run('docker', ['exec', '-i', '-u', 'root', cid, 'sh', '-c', 'rm /usr/local/bin/claude; cat > /usr/local/bin/claude; chmod 755 /usr/local/bin/claude'], { input: stub }).code, 0);
  const ownConfig = okInside('cat "$CLAUDE_CONFIG_DIR/.claude.json"');
  const launch = () => inside(`cd ${wt}; PATH=${shim}:$PATH FM_TASK_INBOX=${home}/state/job.inbox FM_TASK_ID=job CLAUDE_CODE_OAUTH_TOKEN=dummy-launcher GH_TOKEN=dummy-forbidden GITHUB_TOKEN=dummy-forbidden DEV_SETUP_GITHUB_PAT=dummy-forbidden COMPACT_ADVISER_DISABLE=1 TRACEPARENT=trace timeout 30 script -qec 'claude --model sonnet "argument with spaces"' ${home}/terminal-record`);
  assert.equal(probe('rm -f "$CLAUDE_CONFIG_DIR/.claude.json"').code, 0);
  let r = launch();
  assert.equal(r.code, 0, r.out + r.err + okInside(`cat ${home}/terminal-record`));
  const result = JSON.parse(okInside(`cat ${wt}/launcher-result.json`));
  assert.deepEqual(result.argv, ['--model', 'sonnet', 'argument with spaces']);
  assert.equal(result.uid, 1000);
  assert.equal(result.env.CLAUDE_CODE_OAUTH_TOKEN, 'dummy-launcher');
  assert.equal(result.env.FM_TASK_ID, 'job');
  assert.equal(result.env.COMPACT_ADVISER_DISABLE, '1');
  assert.equal(result.env.TRACEPARENT, 'trace');
  for (const key of ['GH_TOKEN', 'GITHUB_TOKEN', 'DEV_SETUP_GITHUB_PAT']) assert.equal(result.env[key], undefined);
  assert.equal(probe(`git -C ${wt} log -1 --format='%an <%ae>|%cn <%ce>'`).out.trim(), 'Host Author <author@example.invalid>|Host Committer <committer@example.invalid>');
  const config = () => JSON.parse(probe('cat "$CLAUDE_CONFIG_DIR/.claude.json"').out);
  assert.equal(config().hasCompletedOnboarding, true);
  assert.deepEqual(config().projects, { [wt]: { hasTrustDialogAccepted: true } });
  assert.equal(probe(`node -e 'const fs=require("fs");fs.writeFileSync(process.env.CLAUDE_CONFIG_DIR+"/.claude.json",JSON.stringify({hasCompletedOnboarding:false,keep:42,projects:{"/previous":{keep:true}}}))'`).code, 0);
  r = launch();
  assert.equal(r.code, 0, r.out + r.err);
  assert.deepEqual(config(), { hasCompletedOnboarding: false, keep: 42, projects: { '/previous': { keep: true }, [wt]: { hasTrustDialogAccepted: true } } });
  assert.equal(okInside('cat "$CLAUDE_CONFIG_DIR/.claude.json"'), ownConfig);
  const records = okInside(`cat ${home}/docker-record`).trim().split('\n').map(JSON.parse);
  const executions = records.filter(v => v.args.includes('claude'));
  assert.equal(executions.length, 2);
  for (const { args, hint } of executions) {
    assert.equal(hint, 'claude');
    assert.equal(args[args.indexOf('-u') + 1], 'node');
    assert.ok(args.includes('-it'));
    assert.equal(args[args.indexOf('-w') + 1], wt);
    assert.deepEqual(args.slice(args.indexOf(cid)), [cid, 'claude', '--model', 'sonnet', 'argument with spaces']);
    const forwarded = args.flatMap((v, i) => v === '-e' ? [args[i + 1]] : []);
    assert.ok(forwarded.includes('CLAUDE_CODE_OAUTH_TOKEN'));
    assert.ok(forwarded.includes('GIT_AUTHOR_NAME'));
    assert.ok(forwarded.every(v => /^(FM_|GIT_CONFIG_|CLAUDE_CODE_|GIT_AUTHOR_|GIT_COMMITTER_|COMPACT_ADVISER_DISABLE$|TRACEPARENT$)/.test(v) && !v.includes('=')));
  }
  const logs = okInside(`cat ${work}/quarterdeck/logs/launch.log`).trim().split('\n').map(JSON.parse).filter(v => v.cwd === wt);
  assert.deepEqual(logs.map(v => [v.route, v.container, v.model]), [['project', cid, 'sonnet'], ['project', cid, 'sonnet']]);
  assert.equal(JSON.stringify(JSON.parse(run('docker', ['inspect', cid]).out)[0].Config.Env).includes('dummy-launcher'), false);
  // Malformed config must not be overwritten or followed by Claude; empty config is seeded.
  assert.equal(probe('printf broken > "$CLAUDE_CONFIG_DIR/.claude.json"').code, 0);
  assert.notEqual(launch().code, 0);
  assert.equal(probe('cat "$CLAUDE_CONFIG_DIR/.claude.json"').out, 'broken');
  assert.equal(probe(': > "$CLAUDE_CONFIG_DIR/.claude.json"').code, 0);
  assert.equal(launch().code, 0);
  assert.equal(config().hasCompletedOnboarding, true);
  assert.deepEqual(Object.keys(config().projects), [wt]);
  assert.notEqual(inside(`cd ${wt}; env -u FM_TASK_INBOX claude --version`).code, 0);
  for (const ids of ['', 'one\ntwo']) {
    const failed = inside(`cd ${wt}; PATH=${shim}:$PATH FM_TASK_INBOX=${home}/state/job.inbox QD_TEST_IDS='${ids}' claude --version`);
    assert.notEqual(failed.code, 0);
    assert.match(failed.err, /exactly one running project container/);
  }
  const poolRoot = inside(`cd /home/node/.treehouse; FM_TASK_INBOX=${home}/state/job.inbox claude --version`);
  assert.notEqual(poolRoot.code, 0);
  assert.deepEqual(Object.keys(config().projects), [wt], 'never trust the pool root');
  // Replace the local executable temporarily to observe exact argv and exit status without an agent.
  const swap = s => run('docker', ['exec', '-u', 'root', name, 'sh', '-c', s]);
  assert.equal(swap(`mv /usr/local/bin/claude /usr/local/bin/claude.saved; printf '#!/bin/sh\\nprintf "%%s\\\\n" "$@"\\nexit 23\\n' > /usr/local/bin/claude; chmod +x /usr/local/bin/claude`).code, 0);
  try {
    const local = inside(`cd ${home}; claude --model=opus 'two words'`);
    assert.equal(local.code, 23);
    assert.deepEqual(local.out.trim().split('\n'), ['--model=opus', 'two words']);
    const last = JSON.parse(okInside(`tail -1 ${work}/quarterdeck/logs/launch.log`));
    assert.deepEqual(last, { route: 'quarterdeck', container: '', cwd: home, model: 'opus' });
  } finally { assert.equal(swap('mv /usr/local/bin/claude.saved /usr/local/bin/claude').code, 0); }
}

// Run this fixture independently with --test-name-pattern='qd-project-up fixture'.
async function testProjectFixture(extensionsToken = '', t) {
  buildImage();
  const started = quarterdeck();
  assert.equal(started.code, 0, started.err);
  const suffix = extensionsToken ? '-extensions' : '';
  const home = `${work}/fleet/fixture${suffix}`;
  const clone = `${home}/projects/fixture`;
  const origin = `${work}/origin${suffix}.git`;
  const wt = `/home/node/.treehouse/qd-${id}${suffix}`;
  const template = readFileSync(join(REPO, 'templates/node/.devcontainer/devcontainer.json'), 'utf8')
    .replace('${templateOption:image}', IMAGE).replaceAll('${templateOption:patEnvVar}', 'GH_TOKEN');
  okInside(`mkdir -p ${clone}/.devcontainer ${home}/bin ${home}/state; git init -q --bare -b main ${origin}; git init -q -b main ${clone}; git -C ${clone} config user.name Fixture; git -C ${clone} config user.email fixture@example.invalid`);
  const configPath = `${clone}/.devcontainer/devcontainer.json`;
  const put = (p, content) => {
    const r = run('docker', ['exec', '-i', '-u', 'node', name, 'sh', '-c', 'cat > "$1"', 'sh', p], { input: content });
    assert.equal(r.code, 0, r.err);
  };
  put(configPath, template.replace('"name": "node",', `"name": "node", "containerEnv": {"DEV_SETUP_GITHUB_PAT":"dummy-only", "GH_TOKEN":"dummy-only", "SAFE":"kept"},`)
    .replace('test -d .git || git init -q; mkdir -p .git/hooks .vscode .devcontainer; touch .git/config', `touch ${home}/HOST-COMMAND-RAN`));
  put(`${clone}/.devcontainer/extensions.json`, readFileSync(join(REPO, 'templates/node/.devcontainer/extensions.json')));
  okInside(`git -C ${clone} add .; git -C ${clone} commit -qm initial; git -C ${clone} remote add origin ${origin}; git -C ${clone} push -q origin main; git -C ${clone} worktree add -qb fixture ${wt}`);
  const volumes = new Set();
  const derivedImages = new Set();
  const up = () => {
    const r = inside(`env ${extensionsToken ? `QUARTERDECK_EXTENSIONS_TOKEN='${extensionsToken}'` : '-u QUARTERDECK_EXTENSIONS_TOKEN'} GH_TOKEN=dummy-parent-only GITHUB_TOKEN=dummy-parent-only QUARTERDECK_GITHUB_TOKEN=dummy-parent-only DEV_SETUP_GITHUB_PAT=dummy-project-only QD_PROJECT_TEST_IMAGE=${IMAGE} QD_RUN_LABEL=${runLabel} qd-project-up ${home} fixture`);
    assert.equal((r.out + r.err).includes(extensionsToken || 'dummy-project-only'), false, 'creator output contains no supplied credential');
    if (r.code === 0) {
      const [c] = JSON.parse(run('docker', ['inspect', r.out.trim()]).out);
      for (const m of c.Mounts.filter(m => m.Type === 'volume')) volumes.add(m.Name);
      if (c.Config.Image !== IMAGE) derivedImages.add(c.Config.Image);
    }
    return r;
  };
  const foreign = `${name}-project-stranger`;
  assert.equal(run('docker', ['create', '--name', foreign, '--label', runLabel, '--label', 'quarterdeck.project=fixture', '--label', `quarterdeck.home=${home}`, '--entrypoint', 'sleep', IMAGE, '300']).code, 0);
  const first = up();
  assert.equal(first.code, 0, first.err);
  const cid = first.out.trim().split('\n').pop();
  const probe = (s) => run('docker', ['exec', '-u', 'node', cid, 'sh', '-c', s]);
  try {
    const [c] = JSON.parse(run('docker', ['inspect', cid]).out);
    assert.equal(c.State.Running, true);
    assert.equal(c.Config.Labels['quarterdeck.project'], 'fixture');
    assert.equal(c.Config.Labels['quarterdeck.home'], home);
    assert.equal(c.Config.Labels[RUN_LABEL], id);
    const binds = c.Mounts.filter(m => m.Type === 'bind').map(m => [m.Destination, m.RW]).sort();
    assert.deepEqual(binds, [[wt.split('/qd-')[0], true], [`${clone}/.git`, true], [`${clone}/.git/hooks`, false], [`${clone}/.git/config`, false], [`${home}/bin`, false], [`${home}/state`, true], ['/workspace', false]].sort());
    assert.deepEqual(c.Mounts.filter(m => m.Type === 'volume').map(m => m.Destination).sort(), ['/home/node/.claude', '/home/node/.codex']);
    assert.equal(probe(`touch ${clone}/.git/hooks/forbidden`).code === 0, false);
    assert.equal(probe(`echo forbidden >> ${clone}/.git/config`).code === 0, false);
    if (!extensionsToken) testLauncherFixture({ home, wt, cid, put, probe });
    const beforeCommit = okInside(`git -C ${wt} rev-parse HEAD`).trim();
    const commit = probe(`set -e; cd ${wt}; echo committed > proof; git add proof; git -c user.name=Fixture -c user.email=fixture@example.invalid commit -qm proof; git rev-parse HEAD`);
    assert.equal(commit.code, 0, commit.err);
    assert.notEqual(commit.out.trim(), beforeCommit, 'a new commit was made, not just an existing HEAD read');
    assert.equal(okInside(`git -C ${wt} rev-parse HEAD`).trim(), commit.out.trim());
    if (extensionsToken) {
      const pat = c.Config.Env.find(v => v.startsWith('DEV_SETUP_GITHUB_PAT='))?.slice('DEV_SETUP_GITHUB_PAT='.length);
      assert.equal(sha(pat), sha(extensionsToken), 'container-level token hash');
      const credential = probe(`printf 'protocol=https\\nhost=github.com\\n\\n' | GIT_TERMINAL_PROMPT=0 git credential fill | awk -F= '/^password=/{print substr($0,10)}' | sha256sum`);
      assert.equal(credential.code, 0);
      assert.equal(credential.out.trim().split(' ')[0], sha(extensionsToken));
      const other = probe(`printf 'protocol=https\\nhost=example.com\\n\\n' | GIT_TERMINAL_PROMPT=0 git credential fill`);
      assert.notEqual(other.code, 0);
      assert.equal(other.out, '');
      assert.equal(probe('env | grep -E "^(GH_TOKEN|GITHUB_TOKEN|QUARTERDECK_GITHUB_TOKEN|QUARTERDECK_EXTENSIONS_TOKEN)="').code, 1);
      assert.equal(JSON.stringify(c.Config.Env).includes('dummy-project-only'), false);
      const exportScan = inside(`grep -rFl -- '${extensionsToken}' ${work}/quarterdeck/config`);
      assert.equal(exportScan.code, 1, 'token absent from every exported file');
      const diskScan = run('docker', ['exec', '-u', 'root', cid, 'sh', '-c', 'grep -rFl -- "$DEV_SETUP_GITHUB_PAT" /home /etc /tmp /var /opt /usr/local']);
      await t.test('extensions token is absent from container files', {
        todo: 'ticket 08 blocker: pinned devcontainer CLI persists container environment in /etc/environment; security-review 05',
      }, () => assert.equal(diskScan.code, 1, `token found (paths only): ${diskScan.out}`));
      for (const args of [['logs', cid], ['history', '--no-trunc', c.Config.Image]]) {
        const output = run('docker', args);
        assert.equal(output.code, 0);
        assert.equal((output.out + output.err).includes(extensionsToken), false);
      }
    } else {
      assert.match(first.err, /warning.*QUARTERDECK_EXTENSIONS_TOKEN/);
      assert.equal(probe('env | grep -Ei "github|^GH_TOKEN="').code, 1);
    }
    assert.equal(probe('test "$SAFE" = kept && test ! -e /run/quarterdeck/secrets.env && test ! -e /home/node/.config/gh/hosts.yml').code, 0);
    assert.equal(existsSync(`${home}/HOST-COMMAND-RAN`), false);
    assert.equal(probe('sh /usr/local/share/egress/wait-ready.sh').code, 0);
    const fetch = host => probe(`node -e 'fetch("https://${host}", {signal: AbortSignal.timeout(10000)}).then(r => process.exit(0)).catch(() => process.exit(1))'`);
    assert.equal(fetch('api.anthropic.com').code, 0);
    assert.notEqual(fetch('example.com').code, 0);
    okInside(`echo branch-only >> ${wt}/.devcontainer/devcontainer.json; git -C ${wt} add .; git -C ${wt} commit -qm branch; git -C ${wt} push -q origin fixture`);
    assert.equal(up().out.trim(), cid);
    okInside(`echo ' ' >> ${configPath}; git -C ${clone} add .; git -C ${clone} commit -qm main; git -C ${clone} push -q origin main`);
    const changed = up();
    assert.equal(changed.code, 0, changed.err);
    assert.notEqual(changed.out.trim(), cid);
    assert.equal(up().out.trim(), changed.out.trim());
    assert.equal(run('docker', ['inspect', foreign]).code, 0, 'matching home/project without the creator label is not ours');
    // Retained local Features must actually build through the proxy, not just survive rendering.
    okInside(`mkdir -p ${clone}/.devcontainer/features/proof; printf '%s' '{"id":"proof","version":"1.0.0","name":"proof"}' > ${clone}/.devcontainer/features/proof/devcontainer-feature.json; printf '#!/bin/sh\\necho installed > /feature-proof\\n' > ${clone}/.devcontainer/features/proof/install.sh`);
    put(configPath, template.replace('"image":', '"features": {"./features/proof": {}}, "image":'));
    okInside(`git -C ${clone} add .; git -C ${clone} commit -qm feature; git -C ${clone} push -q origin main`);
    const featured = up();
    assert.equal(featured.code, 0, featured.err);
    assert.equal(run('docker', ['exec', featured.out.trim(), 'cat', '/feature-proof']).out.trim(), 'installed');
    const survivor = featured.out.trim();
    for (const args of [['--env', 'GH_TOKEN'], ['--volume=/tmp:/extra'], ['--privileged'], ['--entrypoint=sh']]) {
      put(configPath, JSON.stringify({ image: IMAGE, runArgs: args }));
      okInside(`git -C ${clone} add .; git -C ${clone} commit -qm rejected; git -C ${clone} push -q origin main`);
      const rejected = up();
      assert.notEqual(rejected.code, 0);
      assert.match(rejected.err, /unsupported runArgs/);
      assert.equal(run('docker', ['inspect', survivor, '--format', '{{.State.Running}}']).out.trim(), 'true', 'reject before removing the old container or invoking the CLI');
    }
    put(configPath, JSON.stringify({ image: IMAGE, containerEnv: { ALIAS: '${localEnv:GH_TOKEN}' } }));
    okInside(`git -C ${clone} add .; git -C ${clone} commit -qm substitution; git -C ${clone} push -q origin main`);
    assert.match(up().err, /literal non-secret/);
  } finally {
    for (const c of run('docker', ['ps', '-aq', '--filter', 'label=quarterdeck.project=fixture', '--filter', `label=${runLabel}`]).out.split('\n').filter(Boolean)) run('docker', ['rm', '-fv', c]);
    run('docker', ['rm', '-fv', foreign]);
    for (const v of volumes) run('docker', ['volume', 'rm', v]);
    for (const img of derivedImages) run('docker', ['rmi', img]);
  }
}

test('quarterdeck with no image and no container builds the image, starts one container and attaches to Herdr (SC-01)', () => {
  assert.notEqual(run('docker', ['image', 'inspect', image]).code, 0, 'the image must not exist yet');
  const r = quarterdeck();
  assert.equal(r.code, 0, `${r.out}\n${r.err}`);
  assert.match(r.out, /status: running/, 'attach reached the Herdr server');
  // SC-19: the one declared name missing from the file is warned about by name, never a value.
  assert.match(r.err, /WARNING: secret QUARTERDECK_EXTENSIONS_TOKEN /);
  assert.doesNotMatch(r.err, /WARNING: secret (CLAUDE_CODE_OAUTH_TOKEN|QUARTERDECK_GITHUB_TOKEN)/);
  assert.equal(r.err.includes('dummy-'), false, 'no value in the output');
  assert.equal(run('docker', ['image', 'inspect', image]).code, 0);
  assert.equal(run('docker', ['image', 'inspect', image, '--format', '{{index .Config.Labels "io.github.valerid.quarterdeck"}}']).out.trim(), '', 'the image must not carry the ownership label');
  const found = ours();
  assert.equal(found.length, 1);
  firstId = found[0];
  assert.equal(run('docker', ['inspect', firstId, '--format', '{{index .Config.Labels "' + RUN_LABEL + '"}}']).out.trim(), id);
});

test('a second quarterdeck while the first runs starts no second container and attaches (SC-01)', () => {
  const r = quarterdeck();
  assert.equal(r.code, 0, `${r.out}\n${r.err}`);
  assert.match(r.out, /status: running/);
  assert.deepEqual(ours(), [firstId]);
});

test('the proxy runs beside the Quarterdeck: pinned by digest, host socket read-only, labelled with the run, DOCKER_HOST over the volume', () => {
  const proxies = run('docker', ['ps', '-aq', '--filter', `label=io.github.valerid.quarterdeck.proxy=${name}`]).out.split('\n').filter(Boolean);
  assert.equal(proxies.length, 1);
  const [c] = JSON.parse(run('docker', ['inspect', proxies[0]]).out);
  assert.equal(c.State.Running, true);
  assert.equal(c.Config.Labels[RUN_LABEL], id);
  assert.equal(c.Name, `/${proxyName}`);
  assert.equal(c.Image, run('docker', ['image', 'inspect', conf('PROXY_IMAGE'), '--format', '{{.Id}}']).out.trim());
  const sock = c.Mounts.filter((m) => m.Destination === '/var/run/docker.sock');
  assert.equal(sock.length, 1);
  assert.equal(sock[0].RW, false, 'the host socket is read-only in the proxy');
  assert.equal(c.HostConfig.CapDrop.includes('ALL'), true);
  assert.equal(c.Mounts.some((m) => m.Name === proxyVolume && m.Destination === '/run/docker-proxy'), true);
  const [q] = JSON.parse(run('docker', ['inspect', firstId]).out);
  assert.equal(q.Mounts.some((m) => m.Source === '/var/run/docker.sock' || m.Destination === '/var/run/docker.sock'), false, 'the Quarterdeck has no host socket');
  assert.equal(q.Mounts.some((m) => m.Name === proxyVolume && m.Destination === '/run/docker-proxy'), true);
  assert.equal(okInside('echo "$DOCKER_HOST"').trim(), 'unix:///run/docker-proxy/docker.sock');
  assert.equal(run('docker', ['volume', 'inspect', proxyVolume, '--format', '{{index .Labels "io.github.valerid.quarterdeck.proxy"}}']).out.trim(), name);
});

test('Docker through the proxy: version, info, ps and a create, start, exec, stop, remove of a labelled container all work', () => {
  for (const c of ['version', 'info', 'ps']) okInside(`docker ${c} >/dev/null`);
  okInside(`docker create --name ${lifecycle} --label ${runLabel} --entrypoint sleep ${image} 300`);
  okInside(`docker start ${lifecycle}`);
  assert.equal(okInside(`docker inspect -f '{{.State.Running}}' ${lifecycle}`).trim(), 'true');
  assert.equal(okInside(`docker exec ${lifecycle} echo through-the-proxy`).trim(), 'through-the-proxy');
  okInside(`docker images -q ${image} >/dev/null; docker image inspect ${image} >/dev/null; docker volume ls >/dev/null`);
  okInside(`docker stop -t 1 ${lifecycle}`);
  okInside(`docker rm ${lifecycle}`);
  assert.equal(run('docker', ['inspect', lifecycle]).code, 1);
});

test('Docker through the proxy: everything outside the allowed list is refused with 403', () => {
  for (const cmd of ['docker system df', 'docker swarm init', 'docker login -u u -p p localhost:1', `docker cp ${name}-none:/etc/hostname /tmp/x`]) {
    const r = inside(`${cmd} 2>&1; true`);
    assert.match(r.out, /403|Forbidden|forbidden/i, `${cmd}: ${r.out}`);
  }
  // Raw calls, so the refusal is the proxy's and not the CLI's.
  const code = (m, p) => okInside(`curl -s -o /dev/null -w '%{http_code}' --unix-socket /run/docker-proxy/docker.sock -X ${m} http://d${p}`).trim();
  for (const [m, p] of [['GET', '/system/df'], ['POST', '/swarm/init'], ['POST', '/commit'], ['POST', '/auth'], ['POST', '/containers/prune'], ['POST', '/volumes/prune'], ['POST', '/images/prune'], ['GET', '/containers/x/archive?path=/'], ['GET', '/services'], ['GET', '/secrets'], ['DELETE', '/volumes/x'], ['POST', '/containers/x/update']]) {
    assert.equal(code(m, p), '403', `${m} ${p}`);
  }
  assert.match(code('PUT', '/containers/x/archive?path=/'), /^(403|405)$/, 'a method with no allow rule is refused (405)');
  assert.equal(code('GET', '/_ping'), '200');
  assert.equal(code('GET', '/v1.47/_ping'), '200', 'a versioned path matches too');
});

test('the allowed list is in one file and is the design list; the proxy follows it and nothing else', () => {
  const cases = {
    GET: ['_ping', 'version', 'info', 'containers/json', 'containers/abc/json', 'exec/abc/json', 'images/library/node/json', 'volumes', 'events'],
    POST: ['containers/create', 'containers/abc/start', 'containers/abc/stop', 'containers/abc/kill', 'containers/abc/wait', 'containers/abc/attach', 'containers/abc/exec', 'exec/abc/start', 'exec/abc/resize', 'images/create', 'build', 'volumes/create'],
    DELETE: ['containers/abc'],
  };
  const denied = { GET: ['containers/abc/archive', 'system/df', 'volumes/x/json', 'images/json'], POST: ['commit', 'auth', 'containers/prune', 'containers/abc/update', 'swarm/init'], DELETE: ['volumes/abc', 'containers/abc/archive', 'images/abc'] };
  for (const m of Object.keys(cases)) {
    const re = new RegExp(execSync(`. ${join(REPO, 'quarterdeck/docker-proxy.conf')}; printf %s "$ALLOW_${m}"`, { shell: '/bin/bash' }).toString());
    for (const p of cases[m]) assert.ok(re.test(`/${p}`) && re.test(`/v1.47/${p}`), `${m} ${p} must be allowed`);
    for (const p of denied[m]) assert.equal(re.test(`/${p}`), false, `${m} ${p} must be refused`);
  }
  assert.equal(conf('ALLOW_PUT'), undefined);
});

test('egress: the ruleset is ready, an allowlisted host is reachable, another is not', () => {
  okInside('test -e /run/egress/ready && ! test -e /run/egress/failed');
  const allowed = inside('curl -sS -m 15 -o /dev/null -w %{http_code} https://api.anthropic.com');
  assert.match(allowed.out, /^[1-5]\d\d$/, `api.anthropic.com should answer: ${allowed.out} ${allowed.err}`);
  const blocked = inside('curl -sS -m 10 -o /dev/null https://example.com');
  assert.notEqual(blocked.code, 0, 'example.com must not be reachable');
});

test('Herdr runs as node, the tools exist at their paths, /opt/firstmate is read-only, /opt/qd/bin is first on PATH', () => {
  const ps = okInside('ps -eo user:20,args');
  assert.match(ps, /^node\s+herdr --session default server$/m);
  for (const t of ['herdr', 'treehouse', 'gh', 'docker', 'devcontainer', 'jq', 'claude']) okInside(`command -v ${t}`);
  assert.equal(okInside('devcontainer --version').trim(), arg('DEVCONTAINER_CLI_VERSION'));
  assert.equal(okInside('git -c safe.directory=/opt/firstmate -C /opt/firstmate rev-parse HEAD').trim(), arg('FIRSTMATE_COMMIT'));
  assert.match(arg('FIRSTMATE_COMMIT'), /^[0-9a-f]{40}$/);
  assert.notEqual(inside('touch /opt/firstmate/probe').code, 0);
  assert.notEqual(inside('touch /opt/firstmate/bin/probe').code, 0);
  assert.equal(okInside('echo "$PATH"').split(':')[0], '/opt/qd/bin');
});

test('mate procedures: managed skills, Charter and Brief contract are installed with real FirstMate commands', () => {
  const started = quarterdeck();
  assert.equal(started.code, 0, started.err);
  const installed = p => okInside(`node -e 'process.stdout.write(require("fs").readFileSync(process.argv[1], "utf8"))' '${p}'`);
  const root = '/etc/claude-code/.claude/skills';
  const first = installed(`${root}/qd-first-mate/SKILL.md`);
  const spec = installed(`${root}/qd-spec-run/SKILL.md`);
  const brief = installed(`${root}/qd-spec-run/references/brief.md`);
  const report = installed(`${root}/qd-spec-run/references/report.md`);
  const charter = installed('/opt/qd/fleet/charter.md');
  for (const [name, text] of [['qd-first-mate', first], ['qd-spec-run', spec]]) {
    assert.match(text, new RegExp(`^---\\nname: ${name}\\ndescription: .+\\n---`));
  }
  const text = [first, spec, brief, report, charter].join('\n');
  assert.doesNotMatch(text, /\b(Helm|worker|pause|resume|Ideas)\b/i);
  const commands = [...new Set(text.match(/fm-[a-z-]+\.sh/g))];
  assert.ok(commands.length >= 5);
  for (const command of commands) okInside(`test -x /opt/firstmate/bin/${command}`);
  for (const line of ["## Captain's intent", '## Firstmate spec', '## Progress note', '# Setup', '# Rules', '# Definition of done', 'Delivery contract: mode=direct-PR', 'Ship branch:', 'done: ticket NN committed <sha>', 'pnpm install --frozen-lockfile', 'refs/quarterdeck/failed/NN-1', 'Retry of ticket NN', 'Publish.']) assert.ok(brief.includes(line), line);
  for (const line of ['Spec Run: <slug>', 'Branch prefix: <prefix>', 'Project: <project>', 'FM_SECONDMATE_CHARTER', 'project-management', 'verbatim']) assert.ok(first.includes(line), line);
  for (const line of ['--mode direct-PR --branch-prefix', '--harness claude --model sonnet', 'refs/quarterdeck/failed/$NN-1', 'git status --porcelain', 'build ok, lint ok, test ok', 'needs-decision', 'qd-route', 'done [key=<slug>]', 'FM_HOME="$S"']) assert.ok(spec.includes(line), line);
  for (const line of ['<project>', '<build command>', '<lint command>', '<test command>', 'qd-spec-run']) assert.ok(charter.includes(line), line);
  for (const line of ['PR opened', 'stopped at ticket NN', 'stopped: question', 'local only', 'failed twice:', 'Question:']) assert.ok(report.includes(line), line);
});

test("Claude's policy keeps Base's keys except allowManagedHooksOnly", () => {
  const rendered = JSON.parse(okInside('cat /etc/claude-code/managed-settings.json'));
  const base = JSON.parse(readFileSync(join(REPO, 'base/claude/managed-settings.json'), 'utf8'));
  delete base.allowManagedHooksOnly;
  assert.equal('allowManagedHooksOnly' in rendered, false);
  for (const [k, v] of Object.entries(base)) assert.deepEqual(rendered[k], v, k);
  for (const k of ['disableSkillShellExecution', 'disableSideloadFlags', 'disableCommandPluginSources']) assert.equal(rendered[k], true);
});

test('git ignores project hooks and fsmonitor: GIT_CONFIG_COUNT entries beat repository config', () => {
  const out = okInside(
    'd=$(mktemp -d) && git init -q "$d" && git -C "$d" config core.hooksPath hooks && git -C "$d" config core.fsmonitor true' +
      ' && git -C "$d" config --get core.hooksPath && git -C "$d" config --get core.fsmonitor',
  );
  assert.deepEqual(out.trim().split('\n'), ['/dev/null', 'false']);
});

test('the work root is mounted at the same path, with the Claude config and the worktree pool in the home', () => {
  okInside(`touch ${work}/probe && test -d /home/node/.claude && test -d /home/node/.treehouse`);
  assert.equal(okInside('echo "$CLAUDE_CONFIG_DIR"').trim(), '/home/node/.claude');
  okInside(`touch /home/node/.claude/probe /home/node/.treehouse/probe`);
  assert.equal(run('test', ['-e', join(work, 'quarterdeck/claude/probe')]).code, 0);
  assert.equal(run('test', ['-e', join(work, 'pool/probe')]).code, 0);
});

// Runs a script in a new Herdr pane and returns what it wrote to a file (hashes only, never values).
function inPane(script) {
  const out = `/tmp/pane-${randomBytes(4).toString('hex')}`;
  const ws = run('docker', ['exec', '-u', 'node', name, 'herdr', 'workspace', 'create', '--no-focus', '--cwd', '/home/node']);
  assert.equal(ws.code, 0, ws.err);
  const pane = JSON.parse(ws.out).result.root_pane.pane_id;
  const cmd = `{ ${script} ; } > ${out}.tmp 2>&1; mv ${out}.tmp ${out}`;
  const r = run('docker', ['exec', '-u', 'node', name, 'herdr', 'pane', 'run', pane, cmd]);
  assert.equal(r.code, 0, r.err);
  for (let i = 0; i < 60; i++) {
    const got = inside(`cat ${out} 2>/dev/null`);
    if (got.code === 0) return got.out;
    run('sleep', ['0.5']);
  }
  assert.fail('the pane command did not finish');
}
const hashLine = (v) => `printenv ${v} | sha256sum | cut -d' ' -f1`;

test('SC-19: a Herdr pane holds the tokens by name; a docker exec shell holds none', () => {
  const lines = inPane(['CLAUDE_CODE_OAUTH_TOKEN', 'GH_TOKEN', 'DEV_SETUP_GITHUB_PAT'].map(hashLine).join('; ') + '; printenv QUARTERDECK_GITHUB_TOKEN | wc -c').trim().split('\n');
  assert.deepEqual(lines, [sha(CLAUDE), sha(GITHUB), sha(GITHUB), '0']);
  assert.equal(inPane('id -u').trim(), '1000', 'a pane process runs as node');
  assert.equal(okInside('printenv NOT_DECLARED | wc -l').trim(), '0', 'a name nothing declares is not taken');
  for (const v of ['CLAUDE_CODE_OAUTH_TOKEN', 'GH_TOKEN', 'DEV_SETUP_GITHUB_PAT', 'QUARTERDECK_GITHUB_TOKEN']) {
    assert.equal(inside(`printenv ${v}`).code, 1, `${v} must not be in a docker exec shell`);
  }
  assert.equal(inside('test -e /tmp/pwned-' + id).code, 1, 'the file was parsed, not sourced');
});

test('SC-19: the entrypoint and everything above Herdr hold no value; docker inspect and history show none', () => {
  const root = run('docker', ['exec', '-u', 'root', name, 'sh', '-c', 'for p in $(ps -eo pid=,user= | awk \'$2=="root"{print $1}\'); do grep -a -c dummy- /proc/$p/environ 2>/dev/null; done | sort -u']);
  assert.equal(root.out.trim(), '0', 'no root process (the entrypoint, dnsmasq) holds a value');
  const inspect = run('docker', ['inspect', name]).out;
  const history = run('docker', ['history', '--no-trunc', image]).out;
  for (const v of [CLAUDE, GITHUB, `dummy-claude`, `dummy-github`]) {
    assert.equal(inspect.includes(v), false, 'docker inspect');
    assert.equal(history.includes(v), false, 'docker history');
  }
  assert.match(inspect, /\/run\/quarterdeck\/secrets\.env/);
  assert.match(inspect, new RegExp(`${secretsFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:/run/quarterdeck/secrets\\.env:ro`));
});

test('SC-19: no token on disk in the container, and git for github.com answers from DEV_SETUP_GITHUB_PAT', () => {
  const hits = inside("grep -rIl 'dummy-' /home /etc /tmp /var /root /opt 2>/dev/null; true").out.trim();
  assert.equal(hits, '', `a token value is on disk: ${hits}`);
  assert.equal(inside('test -e /home/node/.config/gh/hosts.yml').code, 1);
  assert.equal(inside('git config --get-all credential.helper').out.trim(), '/usr/local/bin/git-credential-dev-setup');
  const out = inPane(`printf 'protocol=https\nhost=github.com\n\n' | GIT_TERMINAL_PROMPT=0 git credential fill | sed -n 's/^password=//p' | sha256sum | cut -d' ' -f1`).trim();
  assert.equal(out, sha(GITHUB));
  assert.equal(inside(`printf 'protocol=https\nhost=gitlab.com\n\n' | /usr/local/bin/git-credential-dev-setup get | wc -c`).out.trim(), '0');
});

test('a named token file that does not exist stops the command by path, before any container starts', () => {
  const r = run(COMMAND, ['attach'], {
    env: { ...process.env, QUARTERDECK_NAME: `${name}-nofile`, QUARTERDECK_IMAGE: image, QUARTERDECK_WORK_ROOT: work, QUARTERDECK_RUN_LABEL: runLabel, QUARTERDECK_SECRETS: join(work, 'absent.env') },
  });
  assert.notEqual(r.code, 0);
  assert.match(r.err, /QUARTERDECK_SECRETS=.*absent\.env does not exist/);
  assert.deepEqual(run('docker', ['ps', '-aq', '--filter', `label=io.github.valerid.quarterdeck=${name}-nofile`]).out.trim(), '');
});

// Distinct from acceptance.test.mjs, which covers a bad project manifest: this is qd-entry's own workspace.
test('egress start-up fails closed: a missing workspace folder stops the container', () => {
  const r = run('docker', [
    'run', '-d', '--init', '--name', closedProbe, '--label', runLabel, '--user', 'root', '--cap-drop', 'ALL',
    '--cap-add', 'NET_ADMIN', '--cap-add', 'NET_RAW', '--cap-add', 'DAC_READ_SEARCH', '--cap-add', 'SETUID', '--cap-add', 'SETGID',
    '-e', 'DEV_SETUP_WORKSPACE=/nonexistent', image,
  ]);
  assert.equal(r.code, 0, r.err);
  let state = '';
  for (let i = 0; i < 40 && state !== 'exited'; i++) {
    state = run('docker', ['inspect', closedProbe, '--format', '{{.State.Status}}']).out.trim();
    if (state !== 'exited') run('sleep', ['0.5']);
  }
  assert.equal(state, 'exited');
  assert.notEqual(run('docker', ['inspect', closedProbe, '--format', '{{.State.ExitCode}}']).out.trim(), '0');
});

test('quarterdeck stop removes the labelled container and nothing else (SC-01, no prune)', () => {
  const s = run('docker', ['run', '-d', '--name', stranger, '--label', runLabel, '--entrypoint', 'sleep', image, '300']);
  assert.equal(s.code, 0, s.err);
  const r = quarterdeck('stop');
  assert.equal(r.code, 0, `${r.out}\n${r.err}`);
  assert.deepEqual(ours(), []);
  assert.equal(run('docker', ['inspect', proxyName]).code, 1, 'the proxy is removed with the Quarterdeck');
  assert.notEqual(run('docker', ['volume', 'inspect', proxyVolume]).code, 0, 'and its volume');
  assert.equal(run('docker', ['inspect', stranger, '--format', '{{.State.Running}}']).out.trim(), 'true', 'the unlabelled container survives');
  assert.equal(run('docker', ['image', 'inspect', image]).code, 0, 'stop keeps the image');
  assert.equal(quarterdeck('stop').code, 0, 'stop with nothing running is not an error');
});

// Ticket 05: the First Mate's home and tab. A derived image replaces the real `claude` (first on PATH) with a stub
// that records its arguments and working directory, so no real session starts and no subscription is spent.
const home = () => join(work, 'fleet/firstmate');
const stubQuarterdeck = (...args) =>
  run(COMMAND, args, {
    env: {
      ...process.env,
      QUARTERDECK_NAME: name,
      QUARTERDECK_IMAGE: stubImage,
      QUARTERDECK_WORK_ROOT: work,
      QUARTERDECK_RUN_LABEL: runLabel,
      QUARTERDECK_SECRETS: secretsFile,
      QUARTERDECK_ATTACH_CMD: 'herdr --session default status server',
    },
  });
const firstMateWorkspaces = () => {
  const r = inside('herdr --session default workspace list');
  assert.equal(r.code, 0, r.err);
  return JSON.stringify(JSON.parse(r.out)).match(/"label":"firstmate"/g)?.length ?? 0;
};
const stubRecord = () => {
  for (let i = 0; i < 60; i++) {
    const r = inside('cat /tmp/stub-claude.out 2>/dev/null');
    if (r.code === 0 && r.out.includes('cwd=')) return r.out;
    run('sleep', ['0.5']);
  }
  assert.fail('the stub claude never ran in the First Mate pane');
};

test('First Mate: the first start seeds the home at the pinned commit and opens a pane running claude on opus in auto mode (SC-02)', () => {
  const b = run('docker', ['build', '-t', stubImage, '--label', runLabel, '-'], {
    input: `FROM ${image}\nUSER root\nRUN printf '#!/bin/sh\\n{ echo "cwd=$PWD"; for a in "$@"; do echo "arg=$a"; done; } > /tmp/stub-claude.out\\nexec sleep 3600\\n' > /opt/qd/bin/claude && chmod 755 /opt/qd/bin/claude\n`,
  });
  assert.equal(b.code, 0, `${b.out}\n${b.err}`);
  const r = stubQuarterdeck();
  assert.equal(r.code, 0, `${r.out}\n${r.err}`);
  assert.equal(firstMateWorkspaces(), 1);
  const rec = stubRecord().trim().split('\n');
  assert.deepEqual(rec, [`cwd=${home()}`, 'arg=--model', 'arg=opus', 'arg=--permission-mode', 'arg=auto']);
  // The home is the pinned commit; nothing in it is tracked-modified; only the four ignored folders are untracked-ignored.
  const pin = dockerfile.match(/^ARG FIRSTMATE_COMMIT=(\w+)/m)[1];
  assert.equal(run('git', ['-C', home(), 'rev-parse', 'HEAD']).out.trim(), pin);
  assert.equal(run('git', ['-C', home(), 'status', '--porcelain']).out.trim(), '');
  const ignored = run('git', ['-C', home(), 'status', '--porcelain', '--ignored']).out.trim().split('\n').map((l) => l.slice(3)).sort();
  assert.deepEqual(ignored.filter((p) => !['config/', 'data/', 'state/', 'projects/'].includes(p)), [], `unexpected entries: ${ignored}`);
});

test('First Mate: the shipped configuration is in the home and no dispatch variable is in .env (SC-06)', () => {
  const c = (f) => readFileSync(join(home(), 'config', f), 'utf8');
  assert.equal(c('backend').trim(), 'herdr');
  assert.equal(c('claude-permission-mode').trim(), 'auto');
  assert.equal(c('secondmate-harness').trim(), 'claude sonnet');
  const d = JSON.parse(c('crew-dispatch.json'));
  assert.equal(d.shared_quota, true);
  assert.deepEqual(d.rules.map((r) => [r.when, r.use]), [['the ticket is about skills, prompts or agent tools', { harness: 'claude', model: 'opus' }]]);
  assert.deepEqual(d.default, [{ harness: 'claude', model: 'sonnet' }]);
  assert.equal(existsSync(join(home(), '.env')) && /FM_DISPATCH_/.test(readFileSync(join(home(), '.env'), 'utf8')), false);
});

test('First Mate: Claude is trusted for the home and onboarding is done, so no dialog waits (SC-10)', () => {
  const j = JSON.parse(readFileSync(join(work, 'quarterdeck/claude/.claude.json'), 'utf8'));
  assert.equal(j.hasCompletedOnboarding, true);
  assert.equal(j.projects[home()].hasTrustDialogAccepted, true);
});

test('First Mate: a second run of the seeding step opens no second tab; a restart keeps hand-edited files and opens exactly one tab', () => {
  okInside('/opt/qd/bin/qd-first-mate');
  assert.equal(firstMateWorkspaces(), 1, 'running the step again while the tab exists adds nothing');
  writeFileSync(join(home(), 'config/claude-permission-mode'), 'default\n');
  writeFileSync(join(home(), 'config/crew-dispatch.json'), '{"shared_quota":false}\n');
  run('rm', ['-f', join(work, 'quarterdeck/claude/.claude.json')]);
  assert.equal(stubQuarterdeck('stop').code, 0);
  const r = stubQuarterdeck();
  assert.equal(r.code, 0, `${r.out}\n${r.err}`);
  assert.equal(firstMateWorkspaces(), 1);
  assert.equal(readFileSync(join(home(), 'config/claude-permission-mode'), 'utf8'), 'default\n');
  assert.equal(readFileSync(join(home(), 'config/crew-dispatch.json'), 'utf8'), '{"shared_quota":false}\n');
  assert.equal(readFileSync(join(home(), 'config/backend'), 'utf8').trim(), 'herdr', 'a file that was not edited is still there');
  assert.equal(run('git', ['-C', home(), 'status', '--porcelain']).out.trim(), '');
  assert.equal(stubQuarterdeck('stop').code, 0);
});

test('the checklist has the SC-02 and SC-10 rows with a setup, what to look at and what a pass is', () => {
  const t = readFileSync(join(REPO, 'quarterdeck/CHECKLIST.md'), 'utf8');
  for (const sc of ['SC-02', 'SC-10']) {
    const row = t.split('\n').find((l) => l.startsWith('|') && l.includes(sc));
    assert.ok(row, `${sc} row`);
    const cells = row.split('|').slice(1, -1).map((c) => c.trim());
    assert.equal(cells.length, 4, `${sc}: scenario, setup, look at, pass`);
    assert.ok(cells.every((c) => c.length > 20), `${sc}: every column says something`);
  }
});

// qd-publish, run in a throwaway container of the image (no entrypoint, no Herdr, no network needed) against a local
// bare origin with a stub gh. Each call builds a fresh fixture under /tmp/qdp and prints what the script prints.
const FIXTURE = String.raw`
set -e
b=/tmp/qdp; mkdir -p $b/bin $b/marks; cd $b
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
git init -q --bare -b main origin.git
git clone -q origin.git home/projects/proj 2>/dev/null
c=$b/home/projects/proj
git -C $c checkout -q -b main
echo x > $c/f; git -C $c add f; git -C $c commit -q -m init; git -C $c push -q origin main
git -C $c checkout -q -b qd/spec
mkdir -p $c/.scratch/spec/issues
printf '# 10: Third\n\nbody\n' > $c/.scratch/spec/issues/10-third.md
printf '# 02: Second\n' > $c/.scratch/spec/issues/02-second.md
printf '# 01: First\n' > $c/.scratch/spec/issues/01-first.md
printf '# 9: Ninth\n' > $c/.scratch/spec/issues/9-ninth.md
git -C $c add .; git -C $c commit -q -m tickets
git -C $c checkout -q main; git -C $c branch -q other qd/spec
cat > $b/bin/gh <<'GH'
#!/bin/sh
{ echo "CALL"; for a in "$@"; do echo "arg=$a"; done; } >> /tmp/qdp/gh.log
[ -n "$STUB_GH_FAIL" ] && { echo "boom" >&2; exit 1; }
echo "https://github.com/o/r/pull/7"
GH
chmod +x $b/bin/gh
export PATH=$b/bin:$PATH
`;
const publishRun = (script, env = []) =>
  run('docker', ['run', '--rm', '--label', runLabel, '-u', 'node', '--entrypoint', 'bash', ...env.flatMap((e) => ['-e', e]), image, '-c', FIXTURE + script]);

test('qd-publish pushes exactly the named branch and opens one pull request against the default branch, listing the tickets in number order (SC-08, token-free half)', () => {
  const r = publishRun(`
    qd-publish $b/home proj qd/spec spec > $b/out
    cat $b/out; echo ---; git --git-dir $b/origin.git for-each-ref --format='%(refname)'; echo ---; cat $b/gh.log`);
  assert.equal(r.code, 0, `${r.out}\n${r.err}`);
  const [printed, refs, log] = r.out.split('---\n');
  assert.equal(printed.trim(), 'https://github.com/o/r/pull/7');
  assert.deepEqual(refs.trim().split('\n').sort(), ['refs/heads/main', 'refs/heads/qd/spec'], 'only the named branch was pushed ("other" was not)');
  assert.equal((log.match(/^CALL$/gm) ?? []).length, 1);
  const args = log.split('\n').filter((l) => l.startsWith('arg=')).map((l) => l.slice(4));
  assert.deepEqual(args.slice(0, 2), ['pr', 'create']);
  const val = (k) => args[args.indexOf(k) + 1];
  assert.equal(val('--base'), 'main');
  assert.equal(val('--head'), 'qd/spec');
  assert.ok(log.includes('arg=Tickets implemented in this Spec Run:\n\n- 01: First\n- 02: Second\n- 9: Ninth\n- 10: Third\n'), log);
});

test('SC-18: hooks, core.hooksPath, core.fsmonitor and a redirected worktree .git file never run during qd-publish', () => {
  const r = publishRun(`
    c=$b/home/projects/proj; m=$b/marks
    # planted in the clone's own hooks and config
    for h in pre-push reference-transaction pre-commit post-update update pre-receive; do
      printf '#!/bin/sh\\ntouch %s/hook-$h\\n' "$m" > $c/.git/hooks/$h; chmod +x $c/.git/hooks/$h; done
    mkdir -p $b/home/state/x.git-hooks
    printf '#!/bin/sh\\ntouch %s/hookspath\\n' "$m" > $b/home/state/x.git-hooks/pre-push; chmod +x $b/home/state/x.git-hooks/pre-push
    printf '#!/bin/sh\\ntouch %s/fsmonitor-clone\\n' "$m" > $b/fsm; chmod +x $b/fsm
    git --git-dir $c/.git config core.hooksPath $b/home/state/x.git-hooks
    git --git-dir $c/.git config core.fsmonitor $b/fsm
    # a worktree whose .git file is redirected to an attacker directory holding hooks and fsmonitor
    mkdir -p $b/attacker/hooks; cp -r $c/.git/. $b/attacker/
    printf '#!/bin/sh\\ntouch %s/fsmonitor-attacker\\n' "$m" > $b/fsm2; chmod +x $b/fsm2
    git --git-dir $b/attacker config core.fsmonitor $b/fsm2
    git --git-dir $b/attacker config core.hooksPath $b/attacker/hooks
    printf '#!/bin/sh\\ntouch %s/hook-attacker\\n' "$m" > $b/attacker/hooks/pre-push; chmod +x $b/attacker/hooks/pre-push
    mkdir -p $b/home/wt; printf 'gitdir: %s\\n' $b/attacker > $b/home/wt/.git
    # control: plain git with the environment overrides removed does run the plants
    env -u GIT_CONFIG_COUNT git --git-dir $c/.git push -q origin other:other 2>/dev/null || true
    echo "control=$(ls $m | wc -l)"; rm -f $m/*
    # a git shim records the effective hooks and fsmonitor settings of every call qd-publish makes (push never asks git for fsmonitor)
    real=$(command -v git); mkdir -p $b/shim
    printf '#!/bin/bash\\n[ "$1" = --git-dir ] && for k in hooksPath fsmonitor; do echo "$k=$(%s "\${@:1:6}" config --get core.$k)" >> %s/effective 2>/dev/null; done\\nexec %s "$@"\\n' "$real" "$b" "$real" > $b/shim/git; chmod +x $b/shim/git
    cd $b/home/wt; PATH=$b/shim:$PATH qd-publish $b/home proj qd/spec spec; echo "code=$?"; ls $m; echo "ls-done"
    sort -u $b/effective; echo "eff-done"`, [
    'GIT_CONFIG_COUNT=2',
    'GIT_CONFIG_KEY_0=core.hooksPath', 'GIT_CONFIG_VALUE_0=/tmp/qdp/home/state/x.git-hooks',
    'GIT_CONFIG_KEY_1=core.fsmonitor', 'GIT_CONFIG_VALUE_1=/tmp/qdp/fsm',
  ]);
  assert.equal(r.code, 0, `${r.out}\n${r.err}`);
  assert.match(r.out, /control=[1-9]/, 'the planted hooks do run when git is not held back');
  assert.match(r.out, /code=0\nls-done\n/, `a planted marker exists:\n${r.out}`);
  // Under hostile config entries and a hostile clone config, git's own answer for both keys is the override, in every call.
  const eff = r.out.split('ls-done\n')[1].split('eff-done')[0].trim().split('\n').sort();
  assert.deepEqual(eff, ['fsmonitor=false', 'hooksPath=/dev/null'], r.out);
});

test('qd-publish passes --git-dir, -c overrides and --no-verify, and never reads the worktree .git file', () => {
  const src = readFileSync(join(REPO, 'quarterdeck/bin/qd-publish'), 'utf8');
  assert.match(src, /--git-dir "\$clone\/\.git" -c core\.hooksPath=\/dev\/null -c core\.fsmonitor=false/);
  assert.match(src, /git push --no-verify /);
  // Run from inside a worktree whose .git file is unreadable and points nowhere: git would stop on it if it looked.
  // A marker the attacker's config would create (through fsmonitor) stays absent.
  const r = publishRun(`
    mkdir -p $b/home/wt $b/attacker; printf 'gitdir: %s\\n' $b/attacker > $b/home/wt/.git; chmod 000 $b/home/wt/.git
    printf '[core]\\n\\tfsmonitor = touch %s/read-it\\n' $b > $b/attacker/config
    cd $b/home/wt && { git rev-parse >/dev/null 2>&1 && echo control-unexpected || echo control-git-fails; }
    cd $b/home/wt && qd-publish $b/home proj qd/spec spec; echo "code=$?"; test ! -e $b/read-it && echo marker-absent`);
  assert.equal(r.code, 0, `${r.out}\n${r.err}`);
  assert.match(r.out, /control-git-fails\n.*pull\/7\ncode=0\nmarker-absent\n$/s);
});

test('a missing branch, a failing push and a failing gh all exit non-zero and print no pull request URL', () => {
  const r = publishRun(`
    url=https://github.com/o/r/pull
    run() { "$@" > $b/o 2>&1 && echo "ok" || echo "code=$?"; if grep -Eq "https?://" $b/o; then echo URLSEEN; fi; }
    echo "missing:"; run qd-publish $b/home proj nope spec
    echo "no-tickets:"; run qd-publish $b/home proj qd/spec nothing
    git --git-dir $b/home/projects/proj/.git remote set-url origin $b/gone.git
    echo "push:"; run qd-publish $b/home proj qd/spec spec
    git --git-dir $b/home/projects/proj/.git remote set-url origin $b/origin.git
    printf '#!/bin/sh\\nexit 1\\n' > $b/origin.git/hooks/pre-receive; chmod +x $b/origin.git/hooks/pre-receive
    echo "rejected:"; run qd-publish $b/home proj qd/spec spec
    rm $b/origin.git/hooks/pre-receive
    echo "gh:"; STUB_GH_FAIL=1 run qd-publish $b/home proj qd/spec spec`);
  assert.equal(r.code, 0, `${r.out}\n${r.err}`);
  const lines = r.out.trim().split('\n');
  assert.deepEqual(lines, ['missing:', 'code=1', 'no-tickets:', 'code=1', 'push:', 'code=128', 'rejected:', 'code=1', 'gh:', 'code=1'], r.out);
});

test('ticket loop: plan and ordered fresh Crewmates without push (SC-03–06,13–14)', t => testTicketLoop(t));
test('ticket loop failure: preserve one attempt, retry once, stop without push (SC-11,13)', t => testTicketLoop(t, true));

test('qd-project-up fixture: main-only config, exact mounts, commits and egress (SC-15–17)', () => testProjectFixture());
test('qd-project-up extensions fixture: creation-only read token, helper and persistence checks (SC-16, SC-19)', t => testProjectFixture(`dummy-extensions-${id}`, t));
