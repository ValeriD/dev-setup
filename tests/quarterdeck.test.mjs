// Quarterdeck acceptance, token-free and container level (SC-01 and the image contract).
// The Quarterdeck image is built once per run, by the first `quarterdeck` call below, which is also
// what proves "builds the image when it is missing". Everything the file creates carries the run
// label and a name made from the run id; teardown removes only that. No prune.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, RUN_LABEL, run, projectDir } from './lib.mjs';

const id = process.env.DEV_SETUP_TEST_RUN ?? randomBytes(4).toString('hex');
const runLabel = `${RUN_LABEL}=${id}`;
const name = `qd-test-${id}`;
const image = `dev-setup-quarterdeck:test-${id}`;
const stranger = `qd-test-stranger-${id}`; // unlabelled by Quarterdeck, labelled by the run for teardown
const closedProbe = `qd-test-failclosed-${id}`;
const COMMAND = join(REPO, 'quarterdeck/bin/quarterdeck');
const dockerfile = readFileSync(join(REPO, 'quarterdeck/Dockerfile'), 'utf8');
const arg = (n) => dockerfile.match(new RegExp(`^ARG ${n}=(\\S+)`, 'm'))[1];

let work;
before(() => {
  work = projectDir('qd-work-');
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
  for (const n of [name, stranger, closedProbe]) run('docker', ['rm', '-fv', n]);
  for (const c of run('docker', ['ps', '-aq', '--filter', `label=${runLabel}`, '--filter', `name=${name}`]).out.split('\n').filter(Boolean)) {
    run('docker', ['rm', '-fv', c]);
  }
  run('docker', ['rmi', image]);
  rmSync(work, { recursive: true, force: true });
});

// The host command with the test's name, image, work root and run label. Attach runs a probe instead of the TUI (no terminal here).
const quarterdeck = (...args) =>
  run(COMMAND, args, {
    env: {
      ...process.env,
      QUARTERDECK_NAME: name,
      QUARTERDECK_IMAGE: image,
      QUARTERDECK_WORK_ROOT: work,
      QUARTERDECK_RUN_LABEL: runLabel,
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

test('quarterdeck with no image and no container builds the image, starts one container and attaches to Herdr (SC-01)', () => {
  assert.notEqual(run('docker', ['image', 'inspect', image]).code, 0, 'the image must not exist yet');
  const r = quarterdeck();
  assert.equal(r.code, 0, `${r.out}\n${r.err}`);
  assert.match(r.out, /status: running/, 'attach reached the Herdr server');
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
  assert.equal(run('docker', ['inspect', stranger, '--format', '{{.State.Running}}']).out.trim(), 'true', 'the unlabelled container survives');
  assert.equal(run('docker', ['image', 'inspect', image]).code, 0, 'stop keeps the image');
  assert.equal(quarterdeck('stop').code, 0, 'stop with nothing running is not an error');
});
