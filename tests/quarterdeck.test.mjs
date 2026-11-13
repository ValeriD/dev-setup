// Quarterdeck acceptance, token-free and container level (SC-01 and the image contract).
// The Quarterdeck image is built once per run, by the first `quarterdeck` call below, which is also
// what proves "builds the image when it is missing". Everything the file creates carries the run
// label and a name made from the run id; teardown removes only that. No prune.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { REPO, RUN_LABEL, run, projectDir } from './lib.mjs';

const id = process.env.DEV_SETUP_TEST_RUN ?? randomBytes(4).toString('hex');
const runLabel = `${RUN_LABEL}=${id}`;
const name = `qd-test-${id}`;
const image = `dev-setup-quarterdeck:test-${id}`;
const stranger = `qd-test-stranger-${id}`; // unlabelled by Quarterdeck, labelled by the run for teardown
const closedProbe = `qd-test-failclosed-${id}`;
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
  for (const n of [name, proxyName, stranger, closedProbe, lifecycle]) run('docker', ['rm', '-fv', n]);
  run('docker', ['volume', 'rm', proxyVolume]);
  for (const c of run('docker', ['ps', '-aq', '--filter', `label=${runLabel}`, '--filter', `name=${name}`]).out.split('\n').filter(Boolean)) {
    run('docker', ['rm', '-fv', c]);
  }
  run('docker', ['rmi', image]);
  rmSync(work, { recursive: true, force: true });
  rmSync(join(secretsFile, '..'), { recursive: true, force: true });
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
    POST: ['containers/create', 'containers/abc/start', 'containers/abc/stop', 'containers/abc/kill', 'containers/abc/wait', 'containers/abc/exec', 'exec/abc/start', 'exec/abc/resize', 'images/create', 'build', 'volumes/create'],
    DELETE: ['containers/abc'],
  };
  const denied = { GET: ['containers/abc/archive', 'system/df', 'volumes/x/json', 'images/json'], POST: ['commit', 'auth', 'containers/prune', 'containers/abc/update', 'containers/abc/attach', 'swarm/init'], DELETE: ['volumes/abc', 'containers/abc/archive', 'images/abc'] };
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
