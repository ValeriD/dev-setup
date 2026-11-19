// Errands feature tests, token-free (run with `npm run test:errands`; never the whole suite).
// Ticket 04: an Errand on a Project with no remote runs with a stub Crewmate (tests/fixtures/errands-crewmate) through FirstMate's own commands and lands with fm-merge-local.sh.
// Ticket 02: qd-project-new makes a Project with no remote and records its config tree; qd-project-up follows the record.
// Ticket 01: the Markdown Variant is built on this machine by the host command and recorded, the built
// image is hardened like the Node Variant, and qd-project-up accepts an image only from that record.
// Everything the file creates carries the run label; teardown removes only that. No prune.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { REPO, RUN_LABEL, run, projectDir, up, tryUp, exec, containerFor, removeProject } from './lib.mjs';

const id = process.env.DEV_SETUP_TEST_RUN ?? randomBytes(4).toString('hex');
const runLabel = `${RUN_LABEL}=${id}`;
const name = `qde-test-${id}`;
const qdImage = `dev-setup-quarterdeck:test-errands-${id}`;
const variantTag = `test-${id}`;
const variantImage = `dev-setup-markdown:${variantTag}`;
const COMMAND = join(REPO, 'quarterdeck/bin/quarterdeck');

let work;
let hostHome;
let recorded; // the image id of the Markdown Variant built by the host command
const record = () => join(work, 'quarterdeck/local-variants');

before(() => {
  work = projectDir('qde-work-');
  hostHome = projectDir('qde-home-'); // no token file here: the command never sees the real one
  writeFileSync(join(hostHome, '.gitconfig'), '[user]\n\tname = Errands Test\n\temail = errands@example.invalid\n');
  // `node` in the Quarterdeck is uid 1000; open the test's own folders on another host uid.
  if (process.getuid?.() !== 1000) {
    for (const d of [work, join(work, 'quarterdeck'), join(work, 'quarterdeck/claude'), join(work, 'pool')]) {
      mkdirSync(d, { recursive: true });
      chmodSync(d, 0o777);
    }
  }
});
after(() => {
  const labelled = (f) => run('docker', ['ps', '-aq', '--filter', f, '--filter', `label=${runLabel}`]).out.split('\n').filter(Boolean);
  for (const c of labelled('label=quarterdeck.creator=qd-project-up')) {
    const volumes = JSON.parse(run('docker', ['inspect', c]).out)[0].Mounts.filter((m) => m.Type === 'volume').map((m) => m.Name);
    run('docker', ['rm', '-fv', c]);
    for (const v of volumes) run('docker', ['volume', 'rm', v]);
  }
  run(COMMAND, ['stop'], { env: hostEnv() });
  // FirstMate makes hook directories read-only: remove this test's folders as root, from a labelled container.
  run('docker', ['run', '--rm', '--label', runLabel, '--user', 'root', '--entrypoint', 'rm', '-v', `${work}:${work}`, qdImage, '-rf', join(work, 'fleet'), join(work, 'quarterdeck/config'), join(work, 'quarterdeck/local-projects'), join(work, 'projects'), join(work, 'pool')]);
  run('docker', ['rmi', qdImage]);
  run('docker', ['rmi', variantImage]);
  rmSync(work, { recursive: true, force: true });
  rmSync(hostHome, { recursive: true, force: true });
});

const hostEnv = () => ({
  ...process.env,
  HOME: hostHome,
  GIT_CONFIG_NOSYSTEM: '1',
  DOCKER_CONFIG: process.env.DOCKER_CONFIG ?? join(process.env.HOME, '.docker'),
  QUARTERDECK_NAME: name,
  QUARTERDECK_IMAGE: qdImage,
  QUARTERDECK_WORK_ROOT: work,
  QUARTERDECK_RUN_LABEL: runLabel,
  QUARTERDECK_VARIANT_TAG: variantTag,
  ...(process.env.DEV_SETUP_TEST_CLI ? { QUARTERDECK_DEVCONTAINER_CLI: process.env.DEV_SETUP_TEST_CLI } : {}),
});
const quarterdeck = (...args) => run(COMMAND, args, { env: hostEnv() });
const inside = (script) => run('docker', ['exec', '-u', 'node', name, 'sh', '-c', script]);
const okInside = (script) => {
  const r = inside(script);
  assert.equal(r.code, 0, `${script}\n${r.out}\n${r.err}`);
  return r.out;
};
const put = (p, content) => {
  const r = run('docker', ['exec', '-i', '-u', 'node', name, 'sh', '-c', 'cat > "$1"', 'sh', p], { input: content });
  assert.equal(r.code, 0, r.err);
};

/** The Markdown Template's .devcontainer applied by hand: the image option is the locally built image id. */
const markdownConfig = (image = recorded) => readFileSync(join(REPO, 'templates/markdown/.devcontainer/devcontainer.json'), 'utf8')
  .replace('${templateOption:image}', image).replaceAll('${templateOption:patEnvVar}', 'DEV_SETUP_GITHUB_PAT');

test('quarterdeck build-variant markdown builds the Variant and records its image id under the work root', () => {
  const r = quarterdeck('build-variant', 'markdown');
  assert.equal(r.code, 0, `${r.out}\n${r.err}`);
  recorded = r.out.trim().split('\n').pop();
  assert.match(recorded, /^sha256:[0-9a-f]{64}$/);
  assert.equal(run('docker', ['image', 'inspect', '--format', '{{.Id}}', variantImage]).out.trim(), recorded);
  assert.equal(readFileSync(record(), 'utf8'), `markdown ${recorded}\n`);
  // A second build of unchanged inputs adds no second line.
  const again = quarterdeck('build-variant', 'markdown');
  assert.equal(again.code, 0, again.err);
  assert.equal(readFileSync(record(), 'utf8'), `markdown ${recorded}\n`);
  // Only the Markdown Variant exists, and nothing is pushed anywhere.
  const bad = quarterdeck('build-variant', 'node');
  assert.notEqual(bad.code, 0);
  assert.match(bad.err, /usage: quarterdeck build-variant markdown/);
});

test('Markdown Variant: same base digest and image metadata as the Node Variant, Markdown tooling, no development toolchain', () => {
  const from = (f) => readFileSync(join(REPO, f), 'utf8').match(/^FROM\s+(\S+)/m)[1];
  assert.equal(from('variants/markdown/Dockerfile'), from('variants/node/Dockerfile'));
  const meta = JSON.parse(JSON.parse(run('docker', ['image', 'inspect', recorded]).out)[0].Config.Labels['devcontainer.metadata'] ?? 'null');
  const nodeCfg = readFileSync(join(REPO, 'variants/node/devcontainer.json'), 'utf8');
  const mdCfg = readFileSync(join(REPO, 'variants/markdown/devcontainer.json'), 'utf8');
  assert.equal(mdCfg.replace('dev-setup markdown', 'dev-setup node'), nodeCfg, 'the Variant config differs from the Node Variant only by name');
  const flat = Object.assign({}, ...meta);
  assert.equal(flat.containerUser, 'root');
  assert.deepEqual(flat.capAdd?.sort(), ['DAC_READ_SEARCH', 'NET_ADMIN', 'NET_RAW']);
  assert.deepEqual(flat.securityOpt, ['no-new-privileges']);
  assert.equal(flat.remoteUser, 'node');
  assert.ok(meta.some((m) => m.entrypoint === '/usr/local/share/egress/start.sh'), 'the egress entrypoint is in the metadata');
  const probe = (script) => run('docker', ['run', '--rm', '--label', runLabel, '--entrypoint', 'sh', recorded, '-c', script]);
  assert.equal(probe('pandoc --version >/dev/null && markdownlint-cli2 --version >/dev/null && claude --version >/dev/null').code, 0);
  const missing = probe('for c in tsc tsx ts-node vite eslint prettier codex python3 pip go cargo java; do command -v $c && echo "found $c"; done; true');
  assert.equal(missing.out.trim(), '', `no development toolchain: ${missing.out}`);
});

/** A folder with the Markdown Template applied. The tag, not the id, because the devcontainer CLI's UID step cannot build FROM an id. */
function markdownProject(mutate = (cfg) => cfg) {
  const dir = projectDir('qde-md-');
  run('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  mkdirSync(join(dir, '.devcontainer'));
  cpSync(join(REPO, 'templates/markdown/.devcontainer/extensions.json'), join(dir, '.devcontainer/extensions.json'));
  writeFileSync(join(dir, '.devcontainer/devcontainer.json'), mutate(markdownConfig(variantImage)));
  return dir;
}

test('Markdown Variant: a container from the Template has egress ready, the managed Claude policy, and no capabilities', () => {
  const dir = markdownProject();
  let containerId = null;
  try {
    containerId = up(dir).containerId;
    const sh = (s) => exec(dir, s);
    const ok = (s) => {
      const r = sh(s);
      assert.equal(r.code, 0, `${s}\n${r.out}\n${r.err}`);
      return r.out;
    };
    ok('test -e /run/egress/ready');
    const policy = JSON.parse(ok('cat /etc/claude-code/managed-settings.json'));
    assert.equal(policy.env.DISABLE_AUTOUPDATER, '1');
    assert.equal(policy.allowManagedHooksOnly, true);
    assert.notEqual(sh('test -w /etc/claude-code/managed-settings.json').code, 0, 'the policy is not writable by node');
    assert.match(ok('grep CapEff /proc/self/status'), /0000000000000000/, 'node holds no capabilities');
    const host = JSON.parse(run('docker', ['inspect', containerId, '--format', '{{json .HostConfig}}']).out);
    assert.deepEqual(host.CapDrop, ['ALL']);
    ok('pandoc --version >/dev/null && markdownlint-cli2 --version >/dev/null');
  } finally {
    removeProject(dir, containerId);
  }
});

test('Markdown Variant: egress start-up fails closed when it cannot run', () => {
  // An allowlist the start-up step rejects: the container must stop, not run with open egress.
  const dir = markdownProject((cfg) => cfg.replace('"workspaceFolder"', '"containerEnv": {"EGRESS_ALLOWLIST": "/workspace/bad-allowlist.txt"},\n  "workspaceFolder"'));
  writeFileSync(join(dir, 'bad-allowlist.txt'), 'registry.npmjs.org\nnot a domain!!\n');
  let containerId = null;
  try {
    tryUp(dir); // `up` may still report success: assert on the container itself
    containerId = containerFor(dir);
    assert.ok(containerId, 'the container exists');
    let running = 'true';
    for (let i = 0; i < 30 && running === 'true'; i++) {
      running = run('docker', ['inspect', containerId, '--format', '{{.State.Running}}']).out.trim();
      if (running === 'true') run('sleep', ['1']);
    }
    assert.equal(running, 'false', 'the container must have stopped');
    assert.notEqual(exec(dir, 'true').code, 0, 'nothing can run in it');
  } finally {
    removeProject(dir, containerId);
  }
});

// A pinned Pinned Ref source that needs no network, as quarterdeck.test.mjs does for the Quarterdeck's own layer.
function pinEnv() {
  const { github, sha } = JSON.parse(readFileSync(join(REPO, 'quarterdeck/project-layer.json'), 'utf8')).extensions[0].source;
  const source = `${work}/pin-source.git`;
  execSync(`git init -q --bare ${source} && { git -C ${source} fetch -q ${REPO} ${sha}:refs/heads/pin 2>/dev/null || git -C ${source} fetch -q https://github.com/${github}.git ${sha}:refs/heads/pin; }`);
  const base = `/home/node/.treehouse/.qde-pin-${id}`;
  okInside(`git init -q --bare ${base}/${github}.git && git -c safe.directory='*' -C ${base}/${github}.git fetch -q ${source} pin:refs/heads/pin && printf '[include]\\n\\tpath = /etc/dev-setup/gitconfig\\n[safe]\\n\\tdirectory = *\\n' > ${base}/gitconfig`);
  return { DEV_SETUP_GIT_BASE: base, GIT_CONFIG_GLOBAL: `${base}/gitconfig` };
}

test('qd-project-up accepts an image from the local Variant record and refuses an unlisted one, naming the reason', () => {
  const started = quarterdeck('start', '--no-first-mate');
  assert.equal(started.code, 0, `${started.out}\n${started.err}`);
  const home = `${work}/fleet/mdproj`;
  const clone = `${home}/projects/mdproj`;
  const origin = `${work}/mdproj-origin.git`;
  okInside(`mkdir -p ${clone}/.devcontainer ${home}/bin ${home}/state; git init -q --bare -b main ${origin}; git init -q -b main ${clone}; git -C ${clone} config user.name Fixture; git -C ${clone} config user.email fixture@example.invalid; cp -a /opt/firstmate/bin/. ${home}/bin/`);
  const config = (image) => markdownConfig().replace(recorded, image).replace('"name": "markdown",', `"name": "markdown", "containerEnv": {${JSON.stringify(pinEnv()).slice(1, -1)}},`);
  put(`${clone}/.devcontainer/extensions.json`, readFileSync(join(REPO, 'templates/markdown/.devcontainer/extensions.json')));
  const commit = (image, msg) => {
    put(`${clone}/.devcontainer/devcontainer.json`, config(image));
    okInside(`git -C ${clone} add .; git -C ${clone} commit -qm ${msg}; git -C ${clone} remote get-url origin >/dev/null 2>&1 || git -C ${clone} remote add origin ${origin}; git -C ${clone} push -q origin main`);
  };
  // Neither a published digest nor in the record: refused with the reason, nothing created.
  const unlisted = `sha256:${'0'.repeat(64)}`;
  commit(unlisted, 'unlisted');
  const up = () => inside(`env -u QUARTERDECK_EXTENSIONS_TOKEN -u QD_PROJECT_TEST_IMAGE QD_RUN_LABEL=${runLabel} qd-project-up ${home} mdproj`);
  const containers = () => run('docker', ['ps', '-aq', '--filter', 'label=quarterdeck.project=mdproj', '--filter', `label=${runLabel}`]).out.split('\n').filter(Boolean);
  const refused = up();
  assert.notEqual(refused.code, 0);
  assert.match(refused.err, /image must be a digest-pinned published Variant; this one is not, and it is not in the local Variant record/);
  assert.deepEqual(containers(), []);
  // The recorded image id is accepted.
  commit(recorded, 'recorded');
  const accepted = up();
  assert.equal(accepted.code, 0, `${accepted.out}\n${accepted.err}`);
  const cid = accepted.out.trim().split('\n').pop();
  const [c] = JSON.parse(run('docker', ['inspect', cid]).out);
  assert.equal(c.State.Running, true);
  assert.equal(c.Config.Labels['quarterdeck.project'], 'mdproj');
  run('docker', ['rm', '-fv', cid]);
  // Without the record the same image is refused again: the record, not the image, is what is trusted.
  renameSync(record(), `${record()}.saved`);
  try {
    const gone = up();
    assert.notEqual(gone.code, 0);
    assert.match(gone.err, /image must be a digest-pinned published Variant; this one is not, and it is not in the local Variant record/);
  } finally {
    renameSync(`${record()}.saved`, record());
  }
  assert.ok(existsSync(record()));
  assert.deepEqual(containers(), []);
});

test('qd-project-new creates a Project with no remote, qd-project-up runs it from the record, and a moved main changes nothing', () => {
  const started = quarterdeck('start', '--no-first-mate');
  assert.equal(started.code, 0, `${started.out}\n${started.err}`);
  const home = `${work}/fleet/firstmate`;
  const p = 'mdnew';
  const dir = `${home}/projects/${p}`;
  const recordOf = (n) => `${work}/quarterdeck/local-projects/${n}`;
  const run1 = (args) => inside(`env QD_WORK_ROOT=${work} qd-project-new ${args}`);
  const listing = () => okInside(`find ${work}/fleet ${work}/projects ${work}/quarterdeck/local-projects -printf '%p %y %T@\\n' 2>/dev/null | sort`);
  // Unknown Variant and unknown Preset are refused before anything is created.
  const before = listing();
  const badVariant = run1(`${p} nonesuch`);
  assert.notEqual(badVariant.code, 0);
  assert.match(badVariant.err, /unknown Variant/);
  const badPreset = run1(`${p} markdown nonesuch`);
  assert.notEqual(badPreset.code, 0);
  assert.match(badPreset.err, /unknown or unreadable Preset/);
  assert.equal(listing(), before);
  // A Project with a Preset: the entries are copied in and tagged (ADR 0005). Not started: its skills need the network.
  const withPreset = run1('mdpre markdown engineering-workflow');
  assert.equal(withPreset.code, 0, `${withPreset.out}\n${withPreset.err}`);
  const presetEntries = JSON.parse(okInside(`git -C ${home}/projects/mdpre show HEAD:.devcontainer/extensions.json`)).extensions;
  const wanted = JSON.parse(readFileSync(join(REPO, 'presets/engineering-workflow.json'), 'utf8')).extensions;
  assert.equal(presetEntries.length, wanted.length);
  assert.ok(presetEntries.every((e) => e.preset === 'engineering-workflow'));
  // The Project itself.
  const made = run1(`${p} markdown`);
  assert.equal(made.code, 0, `${made.out}\n${made.err}`);
  assert.equal(okInside(`git -C ${dir} rev-list --count main`).trim(), '1');
  assert.equal(okInside(`git -C ${dir} ls-tree -r --name-only HEAD`).trim().split('\n').every((f) => f.startsWith('.devcontainer/')), true);
  assert.equal(okInside(`git -C ${dir} remote`).trim(), '', 'no remote');
  assert.equal(inside(`test -e ${work}/fleet/${p}`).code === 0, false, 'no Second Mate home');
  const config = okInside(`git -C ${dir} show HEAD:.devcontainer/devcontainer.json`);
  assert.ok(config.includes(`"image": "${recorded}"`) && !config.includes('${templateOption'));
  const tree = okInside(`git -C ${dir} rev-parse HEAD:.devcontainer`).trim();
  assert.equal(okInside(`cat ${recordOf(p)}`).trim(), tree);
  assert.equal(okInside(`readlink ${work}/projects/${p}`).trim(), dir);
  // Starting it again, the same name changes nothing and says so.
  const snapshot = listing();
  const again = run1(`${p} markdown`);
  assert.notEqual(again.code, 0);
  assert.match(again.err, /Project mdnew exists/);
  assert.equal(listing(), snapshot);
  // The test's offline pin: committed through the record's own path, as an explicit config update would be.
  const pinned = JSON.stringify({ ...JSON.parse(config.replace(/^\s*\/\/.*$/gm, '')), containerEnv: pinEnv() });
  put(`${dir}/.devcontainer/devcontainer.json`, pinned);
  okInside(`git -C ${dir} add -A && git -C ${dir} -c user.name=T -c user.email=t@example.invalid commit -qm pin && git -C ${dir} rev-parse HEAD:.devcontainer > ${recordOf(p)}`);
  const recordedTree = okInside(`cat ${recordOf(p)}`).trim();
  const up = () => inside(`env -u QUARTERDECK_EXTENSIONS_TOKEN -u QD_PROJECT_TEST_IMAGE QD_RUN_LABEL=${runLabel} qd-project-up ${home} ${p}`);
  const first = up();
  assert.equal(first.code, 0, `${first.out}\n${first.err}`);
  const cid = first.out.trim().split('\n').pop();
  const [c] = JSON.parse(run('docker', ['inspect', cid]).out);
  assert.equal(c.State.Running, true);
  assert.equal(c.Config.Image === recorded || c.Image === recorded, true);
  assert.equal(c.Config.Labels['quarterdeck.config'], recordedTree);
  assert.deepEqual(c.HostConfig.CapDrop, ['ALL']);
  const dests = c.Mounts.map((m) => m.Destination);
  assert.ok(dests.includes('/workspace') && dests.includes('/home/node/.treehouse') && dests.includes(`${dir}/.git`));
  assert.equal(c.Mounts.find((m) => m.Destination === '/workspace').RW, false);
  assert.equal(run('docker', ['exec', '-u', 'node', cid, 'test', '-e', '/run/egress/ready']).code, 0, 'egress ready');
  // main moves to a different .devcontainer (as a container with the git store could do): the record still wins.
  okInside(`mkdir -p ${dir}/.devcontainer && echo x > ${dir}/.devcontainer/planted && git -C ${dir} add -A && git -C ${dir} -c user.name=T -c user.email=t@example.invalid commit -qm moved`);
  assert.notEqual(okInside(`git -C ${dir} rev-parse HEAD:.devcontainer`).trim(), recordedTree);
  const second = up();
  assert.equal(second.code, 0, `${second.out}\n${second.err}`);
  assert.equal(second.out.trim().split('\n').pop(), cid, 'the same container: the recorded tree is unchanged');
  assert.equal(inside(`find ${work}/quarterdeck/config/${p} -name planted | grep -q .`).code === 0, false, 'the new tree was not rendered');
  run('docker', ['rm', '-fv', cid]);
});

test('the launcher routes a Crewmate launch by home and Project, from FirstMate\'s record, and never to the Quarterdeck', () => {
  const started = quarterdeck('start', '--no-first-mate');
  assert.equal(started.code, 0, `${started.out}\n${started.err}`);
  const home = `${work}/fleet/firstmate`;
  const recordOf = (n) => `${work}/quarterdeck/local-projects/${n}`;
  okInside(`mkdir -p ${home}/state ${home}/data ${home}/bin ${home}/config; cp -a /opt/firstmate/bin/. ${home}/bin/`);
  const cids = {};
  for (const p of ['lpa', 'lpb']) {
    const made = inside(`env QD_WORK_ROOT=${work} qd-project-new ${p} markdown`);
    assert.equal(made.code, 0, `${made.out}\n${made.err}`);
    const dir = `${home}/projects/${p}`;
    const cfg = okInside(`git -C ${dir} show HEAD:.devcontainer/devcontainer.json`);
    put(`${dir}/.devcontainer/devcontainer.json`, JSON.stringify({ ...JSON.parse(cfg.replace(/^\s*\/\/.*$/gm, '')), containerEnv: pinEnv() }));
    okInside(`git -C ${dir} add -A && git -C ${dir} -c user.name=T -c user.email=t@example.invalid commit -qm pin && git -C ${dir} rev-parse HEAD:.devcontainer > ${recordOf(p)}`);
    const up = inside(`env -u QUARTERDECK_EXTENSIONS_TOKEN -u QD_PROJECT_TEST_IMAGE QD_RUN_LABEL=${runLabel} qd-project-up ${home} ${p}`);
    assert.equal(up.code, 0, `${up.out}\n${up.err}`);
    cids[p] = up.out.trim().split('\n').pop();
    // A stub Crewmate: records which container it ran in. No real agent session.
    const stub = `#!/usr/bin/env node\nconst fs=require('fs'),os=require('os');fs.appendFileSync(process.cwd()+'/launched-in',os.hostname()+'\\n');\n`;
    assert.equal(run('docker', ['exec', '-i', '-u', 'root', cids[p], 'sh', '-c', 'rm -f /usr/local/bin/claude; cat > /usr/local/bin/claude; chmod 755 /usr/local/bin/claude'], { input: stub }).code, 0);
  }
  assert.notEqual(cids.lpa, cids.lpb);
  // FirstMate's own brief writer names the Project for each record id.
  for (const [id, p] of [['ta', 'lpa'], ['tb', 'lpb'], ['tc', 'lpc']]) {
    const b = inside(`cd ${home}; FM_HOME=${home} bin/fm-brief.sh ${id} ${p} --mode local-only`);
    assert.equal(b.code, 0, `${b.out}\n${b.err}`);
  }
  const wtRoot = '/home/node/.treehouse/launcher-routing';
  const launchCmd = (id, wt) => `mkdir -p ${wt} && cd ${wt} && FM_TASK_INBOX=${home}/state/${id}.inbox timeout 60 script -qec 'claude --model sonnet' /dev/null`;
  const launch = (id, wt) => inside(launchCmd(id, wt));
  const log = () => okInside(`cat ${work}/quarterdeck/logs/launch.log`).trim().split('\n').map((l) => JSON.parse(l));
  const logFor = (wt) => log().filter((l) => l.cwd === wt && l.route !== 'note'); // 'note': these worktrees are plain folders, not clones' worktrees
  const ranIn = (wt) => okInside(`cat ${wt}/launched-in`).trim();
  // Each Project's launch reaches its own container.
  for (const [id, p] of [['ta', 'lpa'], ['tb', 'lpb']]) {
    const wt = `${wtRoot}/${p}`;
    const r = launch(id, wt);
    assert.equal(r.code, 0, `${r.out}\n${r.err}`);
    assert.deepEqual(logFor(wt).map((l) => [l.route, l.container]), [['project', cids[p]]]);
    assert.equal(ranIn(wt), cids[p].slice(0, 12));
  }
  // Values planted where a Project container can write do not change the choice.
  const wta = `${wtRoot}/lpa`;
  okInside(`printf 'project=${home}/projects/lpb\\nhome=${home}\\n' > ${home}/state/ta.meta; echo lpb > ${wta}/.qd-project; echo lpb > ${home}/state/ta.project`);
  assert.equal(launch('ta', wta).code, 0);
  assert.equal(logFor(wta).at(-1).container, cids.lpa);
  assert.equal(ranIn(wta).split('\n').at(-1), cids.lpa.slice(0, 12));
  // A Project with no container fails with a message and never runs in the Quarterdeck.
  const wtc = `${wtRoot}/lpc`;
  const missing = launch('tc', wtc);
  assert.notEqual(missing.code, 0);
  assert.match(missing.out + missing.err, /expected exactly one running project container for home and Project lpc/);
  assert.deepEqual(logFor(wtc), []);
  assert.equal(inside(`test -e ${wtc}/launched-in`).code === 0, false);
  // Two containers for the same home and Project fail too.
  const dup = run('docker', ['run', '-d', '--label', runLabel, '--label', 'quarterdeck.creator=qd-project-up', '--label', `quarterdeck.home=${home}`, '--label', 'quarterdeck.project=lpa', '--entrypoint', 'sleep', recorded, '600']);
  assert.equal(dup.code, 0, dup.err);
  try {
    const wtd = `${wtRoot}/dup`;
    const ambiguous = launch('ta', wtd);
    assert.notEqual(ambiguous.code, 0);
    assert.match(ambiguous.out + ambiguous.err, /expected exactly one running project container/);
    assert.deepEqual(logFor(wtd), []);
  } finally {
    run('docker', ['rm', '-fv', dup.out.trim()]);
  }
  // Overlapping launches into one container all end trusted.
  const wts = [1, 2, 3, 4, 5, 6].map((n) => `${wtRoot}/overlap${n}`);
  okInside(`${wts.map((wt) => `(${launchCmd('ta', wt)}) & `).join('')} wait`);
  const trusted = JSON.parse(run('docker', ['exec', '-u', 'node', cids.lpa, 'sh', '-c', 'cat "$CLAUDE_CONFIG_DIR/.claude.json"']).out).projects;
  for (const wt of wts) assert.equal(trusted[wt]?.hasTrustDialogAccepted, true, `${wt} trusted`);
  const other = JSON.parse(run('docker', ['exec', '-u', 'node', cids.lpb, 'sh', '-c', 'cat "$CLAUDE_CONFIG_DIR/.claude.json"']).out).projects;
  assert.equal(other[wts[0]], undefined, 'the other Project container was not touched');
  for (const c of Object.values(cids)) run('docker', ['rm', '-fv', c]);
});

test('qd-project-rm removes one Project\'s container, exports and record, refuses open work and unknown names, and touches nothing else (SC-20)', () => {
  const started = quarterdeck('start', '--no-first-mate');
  assert.equal(started.code, 0, `${started.out}\n${started.err}`);
  const home = `${work}/fleet/firstmate`;
  const recordOf = (n) => `${work}/quarterdeck/local-projects/${n}`;
  okInside(`mkdir -p ${home}/state ${home}/data ${home}/bin ${home}/config`);
  const cids = {};
  for (const p of ['rmx', 'rmy']) {
    const made = inside(`env QD_WORK_ROOT=${work} qd-project-new ${p} markdown`);
    assert.equal(made.code, 0, `${made.out}\n${made.err}`);
    const dir = `${home}/projects/${p}`;
    const cfg = okInside(`git -C ${dir} show HEAD:.devcontainer/devcontainer.json`);
    put(`${dir}/.devcontainer/devcontainer.json`, JSON.stringify({ ...JSON.parse(cfg.replace(/^\s*\/\/.*$/gm, '')), containerEnv: pinEnv() }));
    okInside(`git -C ${dir} add -A && git -C ${dir} -c user.name=T -c user.email=t@example.invalid commit -qm pin && git -C ${dir} rev-parse HEAD:.devcontainer > ${recordOf(p)}`);
    const up = inside(`env -u QUARTERDECK_EXTENSIONS_TOKEN -u QD_PROJECT_TEST_IMAGE QD_RUN_LABEL=${runLabel} qd-project-up ${home} ${p}`);
    assert.equal(up.code, 0, `${up.out}\n${up.err}`);
    cids[p] = up.out.trim().split('\n').pop();
  }
  // Look-alikes that must survive: same Project name but another home, and same name and home but another creator.
  const decoy = (labels) => {
    const r = run('docker', ['run', '-d', '--label', runLabel, ...labels.flatMap((l) => ['--label', l]), '--entrypoint', 'sleep', recorded, '600']);
    assert.equal(r.code, 0, r.err);
    return r.out.trim();
  };
  const otherHome = decoy(['quarterdeck.creator=qd-project-up', 'quarterdeck.project=rmx', `quarterdeck.home=${work}/fleet/sm-elsewhere`]);
  const otherCreator = decoy(['quarterdeck.creator=someone-else', 'quarterdeck.project=rmx', `quarterdeck.home=${home}`]);
  const noCreator = decoy(['quarterdeck.project=rmx', `quarterdeck.home=${home}`]);
  const rm = (n) => inside(`env QD_WORK_ROOT=${work} qd-project-rm ${n}`);
  const alive = (c) => run('docker', ['inspect', '--format', '{{.State.Running}}', c]).out.trim() === 'true';
  const exportsOf = (n) => okInside(`find ${work}/quarterdeck/config/${n} -type f 2>/dev/null | sort | head -50`);
  const snapshot = () => okInside(`find ${work}/fleet ${work}/projects ${work}/quarterdeck/local-projects ${work}/quarterdeck/config -printf '%p %y %T@\\n' 2>/dev/null | sort`);
  try {
    assert.ok(exportsOf('rmx').includes('devcontainer.json') && exportsOf('rmy').includes('devcontainer.json'));
    // An unknown name and a bad name change nothing.
    let snap = snapshot();
    const unknown = rm('nonesuch');
    assert.notEqual(unknown.code, 0);
    assert.match(unknown.err, /unknown Project nonesuch/);
    assert.notEqual(rm('../rmx').code, 0);
    assert.equal(snapshot(), snap);
    // Open FirstMate work for rmx (its pool worktree is not a Project path): refused, nothing changed.
    put(`${home}/state/open1.meta`, `window=default:w1:p1\nworktree=/home/node/.treehouse/x\nproject=${home}/projects/rmx\nkind=ship\n`);
    put(`${home}/state/other.meta`, `project=${home}/projects/rmy\nkind=ship\n`);
    put(`${home}/state/sm.meta`, `project=${work}/fleet/sm-rmx\nkind=secondmate\nprojects=rmx\n`);
    snap = snapshot();
    const refused = rm('rmx');
    assert.notEqual(refused.code, 0);
    assert.match(refused.err, /still has open FirstMate work \(open1\)/);
    assert.equal(snapshot(), snap);
    assert.ok(alive(cids.rmx) && alive(cids.rmy));
    assert.ok(existsSync(recordOf('rmx')) && exportsOf('rmx') !== '');
    // The same record named through the convenience link also counts.
    okInside(`rm ${home}/state/open1.meta`);
    put(`${home}/state/open2.meta`, `project=${work}/projects/rmx\nkind=ship\n`);
    assert.match(rm('rmx').err, /open FirstMate work \(open2\)/);
    assert.ok(alive(cids.rmx));
    okInside(`rm ${home}/state/open2.meta`);
    // Closed: it goes. Only the labelled container, its exports, the link and the record.
    const ySnapshot = okInside(`find ${work}/quarterdeck/config/rmy ${recordOf('rmy')} ${work}/projects/rmy ${home}/projects/rmy -printf '%p %y %T@\\n' | sort`);
    const done = rm('rmx');
    assert.equal(done.code, 0, `${done.out}\n${done.err}`);
    assert.equal(run('docker', ['inspect', cids.rmx]).code === 0, false, 'the container is gone');
    assert.equal(exportsOf('rmx'), '');
    assert.equal(inside(`test -e ${work}/quarterdeck/config/rmx`).code === 0, false);
    assert.equal(inside(`test -e ${recordOf('rmx')}`).code === 0, false);
    assert.equal(inside(`test -e ${work}/projects/rmx`).code === 0, false);
    // The folder and its repository stay.
    assert.equal(okInside(`git -C ${home}/projects/rmx rev-list --count main`).trim(), '2');
    // The look-alikes and the other Project are untouched, and the Quarterdeck still runs.
    assert.ok(alive(otherHome) && alive(otherCreator) && alive(noCreator), 'unlabelled look-alikes survive');
    assert.ok(alive(cids.rmy));
    assert.equal(okInside(`find ${work}/quarterdeck/config/rmy ${recordOf('rmy')} ${work}/projects/rmy ${home}/projects/rmy -printf '%p %y %T@\\n' | sort`), ySnapshot);
    assert.equal(okInside('echo up').trim(), 'up');
    assert.equal(run('docker', ['exec', '-u', 'node', cids.rmy, 'test', '-e', '/run/egress/ready']).code, 0);
    // A second removal finds nothing left to remove; the name can be created again.
    assert.match(rm('rmx').err, /unknown Project rmx/);
    assert.equal(okInside(`rm -rf ${home}/projects/rmx; env QD_WORK_ROOT=${work} qd-project-new rmx markdown`).trim(), `${home}/projects/rmx`);
  } finally {
    for (const c of [...Object.values(cids), otherHome, otherCreator, noCreator]) run('docker', ['rm', '-fv', c]);
  }
});

// Ticket 04: the Errand loop on a Project with no remote. The test script plays the First Mate's skill (ticket 07):
// FirstMate's own commands register, brief, dispatch, hold and land; the stub Crewmate runs inside the Project's container.
let quarterdeckStarted = false;
async function errandFixture(p) {
  if (!quarterdeckStarted) {
    const started = quarterdeck('start', '--no-first-mate');
    assert.equal(started.code, 0, `${started.out}\n${started.err}`);
    quarterdeckStarted = true;
  }
  const home = `${work}/fleet/firstmate`;
  const dir = `${home}/projects/${p}`;
  const recordOf = `${work}/quarterdeck/local-projects/${p}`;
  const fm = (command) => okInside(`cd ${home}; FM_HOME=${home} ${command}`);
  const git = (args) => okInside(`git -C ${dir} ${args}`).trim();
  const userCommit = (msg) => okInside(`git -C ${dir} add -A && git -C ${dir} -c user.name=User -c user.email=user@example.invalid commit -qm ${msg}`);
  // The Project, from ticket 02, registered the way FirstMate's project-management procedure says: a registry line, local-only, yolo off.
  const made = inside(`env QD_WORK_ROOT=${work} qd-project-new ${p} markdown`);
  assert.equal(made.code, 0, `${made.out}\n${made.err}`);
  const cfg = okInside(`git -C ${dir} show HEAD:.devcontainer/devcontainer.json`);
  put(`${dir}/.devcontainer/devcontainer.json`, JSON.stringify({ ...JSON.parse(cfg.replace(/^\s*\/\/.*$/gm, '')), containerEnv: pinEnv() }));
  userCommit('pin');
  okInside(`git -C ${dir} rev-parse HEAD:.devcontainer > ${recordOf}`);
  okInside(`mkdir -p ${home}/data; printf '%s\\n' '- ${p} [local-only] - Errands fixture (added 2026-01-01)' >> ${home}/data/projects.md`);
  assert.equal(fm(`bin/fm-project-mode.sh ${p}`).trim(), 'local-only off');
  const up = inside(`env -u QUARTERDECK_EXTENSIONS_TOKEN -u QD_PROJECT_TEST_IMAGE QD_RUN_LABEL=${runLabel} qd-project-up ${home} ${p}`);
  assert.equal(up.code, 0, `${up.out}\n${up.err}`);
  const cid = up.out.trim().split('\n').pop();
  // The stub Crewmate replaces Claude inside this container only.
  const stub = readFileSync(join(REPO, 'tests/fixtures/errands-crewmate/claude.mjs'), 'utf8');
  assert.equal(run('docker', ['exec', '-i', '-u', 'root', cid, 'sh', '-c', 'rm -f /usr/local/bin/claude; cat > /usr/local/bin/claude; chmod 755 /usr/local/bin/claude'], { input: stub }).code, 0);

  // What the user's main folder holds: tracked and untracked files by content, the branch, `main`.
  const folder = () => okInside(`cd ${dir} && { git rev-parse main; git symbolic-ref HEAD; git status --porcelain --ignored; find . -path ./.git -prune -o -type f -exec sha256sum {} +; } | sort`);
  const sessions = (taskId) => okInside(`cat ${home}/state/${taskId}.stub-sessions 2>/dev/null; true`).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const lastStatus = (taskId) => okInside(`tail -n1 ${home}/state/${taskId}.status`).trim();
  // Waits for the nth stub session record of a task; `before` is what the main folder must hold all the while (SC-06).
  const waitSession = async (taskId, n, before = folder()) => {
    for (let i = 0; i < 120; i++) {
      if (sessions(taskId).length >= n) return sessions(taskId)[n - 1];
      assert.equal(folder(), before, 'the main folder is unchanged while the Errand runs');
      await new Promise((r) => setTimeout(r, 500));
    }
    assert.fail(`no report: ${inside(`cat ${home}/state/${taskId}.status`).out}`);
  };
  const dispatch = (taskId, { file, text, checkLine, extra = '' }) => {
    fm(`bin/fm-brief.sh ${taskId} ${p} --mode local-only`);
    const briefPath = `${home}/data/${taskId}/brief.md`;
    const generated = okInside(`cat ${briefPath}`);
    put(briefPath, generated.replace('{TASK}', text)
      .replace('{FIRSTMATE_SPEC}', `Errand: ${text}\nErrand file: ${file}\n${checkLine}\n${extra}An undecided point ends the session with a needs-decision line and no guess.\nYour final status line ends with \`check: passed\`, \`check: failed\` or \`check: none\`.`));
    fm(`bin/fm-dispatch-resolve.sh ${briefPath}`);
    const spawned = fm(`bin/fm-spawn.sh ${taskId} projects/${p} --mode local-only --yolo off --harness claude --model sonnet`);
    const wt = spawned.match(/worktree=(\S+)/)?.[1];
    assert.ok(wt, spawned);
    return wt;
  };
  const errand = async (taskId, opts) => {
    const before = folder();
    const wt = dispatch(taskId, opts);
    const session = await waitSession(taskId, 1, before);
    return { wt, session, before, status: lastStatus(taskId) };
  };
  const merge = (taskId) => inside(`cd ${home}; FM_HOME=${home} bin/fm-merge-local.sh ${taskId} 2>&1`);
  const relaunch = (taskId, note) => inside(`cd ${home}; FM_HOME=${home} bin/fm-control.sh ${taskId} relaunch --model sonnet --note '${note}' 2>&1`);
  return { home, dir, cid, fm, git, userCommit, folder, errand, dispatch, waitSession, sessions, lastStatus, merge, relaunch };
}

test('an Errand runs in the Project container on its own branch, reports its check, and lands only through FirstMate\'s merge (SC-05, 06, 10, 11, 12, 13)', async () => {
  const { home, dir, cid, fm, git, userCommit, folder, errand, merge } = await errandFixture('errp');
  // 1. No check file on main: the Brief says nothing of one, the line says none (SC-11), and it lands (SC-12).
  const base0 = git('rev-parse main');
  const e0 = await errand('err-one', { file: 'one.md', text: 'write one.md', checkLine: 'This Project has no check.' });
  assert.equal(e0.session.host, cid.slice(0, 12), 'the Crewmate ran inside the Project container (SC-05)');
  assert.equal(e0.session.cwd, e0.wt);
  assert.ok(e0.wt.startsWith('/home/node/.treehouse/'), e0.wt);
  assert.equal(e0.session.start, base0, 'its branch starts from the Project main (SC-05)');
  assert.equal(okInside(`git -C ${e0.wt} branch --show-current`).trim(), 'fm/err-one');
  assert.equal(okInside(`git -C ${e0.wt} status --porcelain`).trim(), '');
  assert.match(e0.status, /^done \[at=\d+\]: ready in branch fm\/err-one; check: none$/);
  assert.equal(folder(), e0.before, 'the main folder is unchanged after the report (SC-06)');
  assert.equal(git('rev-parse main'), base0);
  // FirstMate's own observation records the ready head. This Quarterdeck has no tasks-axi, so no captain-hold row can
  // exist; the guard in fm-merge-local.sh reads that as "not held". The user's word is the test script's decision.
  assert.match(fm('bin/fm-crew-state.sh err-one'), /done/);
  assert.equal(inside(`cd ${home}; FM_HOME=${home} bin/fm-captain-hold.sh open err-one --distinguish-absent`).code, 3, 'no hold row');
  // The test script's accept step: a result reported with `check: failed` is never offered, so FirstMate's merge is not called.
  const accept = (taskId, status) => (/check: failed$/.test(status) ? { code: null, out: 'check failed: not offered for accept' } : merge(taskId));
  const landed = accept('err-one', e0.status);
  assert.equal(landed.code, 0, landed.out);
  assert.match(landed.out, /merged fm\/err-one into local main/);
  assert.equal(git('rev-parse main'), e0.session.head, 'main fast-forwarded to the Errand\'s head (SC-12)');
  assert.equal(git('symbolic-ref --short HEAD'), 'main');
  assert.equal(git('status --porcelain'), '');
  assert.equal(okInside(`cat ${dir}/one.md`).trim(), 'write one.md', 'the main folder shows the result');

  // 2. The user adds a check to main. An Errand that breaks it reports failed and is not landed (SC-10).
  okInside(`mkdir -p ${dir}/.quarterdeck && printf '%s\\n' 'Run this and report its result.' 'command: test ! -e should-fail' > ${dir}/.quarterdeck/errand-check.md`);
  userCommit('check');
  const follow = 'Follow .quarterdeck/errand-check.md before you report, and end your report with its result.';
  const mainWithCheck = git('rev-parse main');
  const e1 = await errand('err-two', { file: 'should-fail', text: 'write a file the check rejects', checkLine: follow });
  assert.equal(e1.session.start, mainWithCheck);
  assert.match(e1.status, /^done \[at=\d+\]: ready in branch fm\/err-two; check: failed$/);
  assert.equal(folder(), e1.before, 'the main folder is unchanged after the report (SC-06)');
  const notLanded = accept('err-two', e1.status);
  assert.equal(notLanded.code, null);
  assert.equal(git('rev-parse main'), mainWithCheck, 'a failed result is not landed (SC-10)');
  assert.equal(folder(), e1.before);

  // 3. The check passes: the line says so (SC-10). Then the accept is refused where it would cost the user something (SC-13).
  const e2 = await errand('err-three', { file: 'three.md', text: 'write three.md', checkLine: follow });
  assert.match(e2.status, /^done \[at=\d+\]: ready in branch fm\/err-three; check: passed$/);
  assert.equal(e2.session.host, cid.slice(0, 12));
  assert.equal(folder(), e2.before);
  fm('bin/fm-crew-state.sh err-three');
  const tip = git('rev-parse refs/heads/fm/err-three');
  // 3a. A file of the user's that the merge would overwrite.
  okInside(`printf 'mine\\n' > ${dir}/three.md`);
  const dirty = merge('err-three');
  assert.notEqual(dirty.code, 0, dirty.out);
  assert.match(dirty.out, /dirty working tree/);
  assert.equal(okInside(`cat ${dir}/three.md`), 'mine\n', 'the user\'s file is unchanged');
  assert.equal(git('rev-parse main'), mainWithCheck, 'main has not moved');
  assert.equal(git('rev-parse refs/heads/fm/err-three'), tip);
  okInside(`rm ${dir}/three.md`);
  // 3b. A main that moved after dispatch.
  okInside(`echo mine > ${dir}/moved.md`);
  userCommit('moved');
  const movedTo = git('rev-parse main');
  const moved = merge('err-three');
  assert.notEqual(moved.code, 0, moved.out);
  assert.match(moved.out, /not a fast-forward of main/);
  assert.equal(git('rev-parse main'), movedTo, 'main is as the user left it');
  assert.equal(git('status --porcelain'), '');
  assert.equal(okInside(`cat ${dir}/moved.md`), 'mine\n');
  assert.equal(okInside(`test -e ${dir}/three.md`.concat('; echo $?')).trim(), '1', 'the Errand\'s file is not in the main folder');
  run('docker', ['rm', '-fv', cid]);
});

// Ticket 05: the paths around the happy one. Same fixture; FirstMate's own relaunch, state and merge.
test('an Errand stops on a question, survives a dead Crewmate, is sent back, runs beside another, and is rebased (SC-08, 09, 14, 16)', async () => {
  const { home, dir, cid, fm, git, userCommit, folder, dispatch, waitSession, sessions, lastStatus, merge, relaunch } = await errandFixture('errq');
  const heads = (taskId) => git(`rev-parse refs/heads/fm/${taskId}`);
  const hostOf = cid.slice(0, 12);
  const base = git('rev-parse main');
  const user = folder();
  try {
    // SC-08: a question ends the session with no result; an answer in the note continues in the same worktree and branch.
    const wtA = dispatch('q-one', { file: 'title.md', text: 'write title.md', checkLine: 'This Project has no check.', extra: 'Errand question: which title?\n' });
    const asked = await waitSession('q-one', 1, user);
    assert.match(lastStatus('q-one'), /^needs-decision \[at=\d+\]: which title\?$/);
    assert.match(okInside(`cat ${home}/state/q-one.status`), /needs-decision \[at=\d+\]: which title\?/, 'the question is readable from FirstMate\'s record');
    assert.equal(asked.head, base, 'no commit before the answer');
    assert.equal(heads('q-one'), base);
    assert.equal(git('rev-parse main'), base);
    assert.equal(folder(), user);
    fm('bin/fm-crew-state.sh q-one');
    const noResult = merge('q-one');
    assert.notEqual(noResult.code, 0, 'nothing to land after a question');
    assert.equal(git('rev-parse main'), base);
    const answered = relaunch('q-one', 'Answer: Plain title');
    assert.equal(answered.code, 0, answered.out);
    const second = await waitSession('q-one', 2, user);
    assert.equal(second.cwd, wtA, 'the same worktree');
    assert.equal(second.branch, 'fm/q-one', 'the same branch');
    assert.equal(second.start, base);
    assert.match(second.note, /Answer: Plain title/);
    assert.match(lastStatus('q-one'), /^done \[at=\d+\]: ready in branch fm\/q-one; check: none$/);
    assert.match(okInside(`cat ${wtA}/title.md`), /Plain title/);
    assert.equal(git('rev-parse main'), base, 'still nothing landed');

    // SC-09: a Crewmate that dies mid-run. The branch stays as it was and nothing lands; the state says what happened.
    dispatch('d-one', { file: 'dead.md', text: 'write dead.md', checkLine: 'This Project has no check.', extra: 'Errand hang: true\n' });
    const hung = await waitSession('d-one', 1, user);
    assert.equal(hung.hung, true);
    // The Crewmate's own processes, in the Project container, are found by the task id FirstMate gave them.
    const ended = run('docker', ['exec', '-u', 'node', cid, 'sh', '-c', `n=0; for e in /proc/[0-9]*/environ; do if tr '\\0' '\\n' < $e 2>/dev/null | grep -qx 'FM_TASK_ID=d-one'; then kill -KILL $(basename $(dirname $e)) 2>/dev/null; n=$((n+1)); fi; done; echo $n`]);
    assert.ok(Number(ended.out.trim()) > 0, `killed the Crewmate: ${ended.out}${ended.err}`);
    // What FirstMate reports of a dead Crewmate is fm-send's liveness check (as the Spec Run's question path relies on):
    // it names the exited agent instead of ringing it. fm-crew-state.sh still reads the unadvanced busy seed as working.
    let dead = '';
    for (let i = 0; i < 60 && !/has exited/.test(dead); i++) {
      dead = inside(`cd ${home}; FM_HOME=${home} bin/fm-send.sh d-one 'are you there?' 2>&1`).out;
      if (!/has exited/.test(dead)) await new Promise((r) => setTimeout(r, 500));
    }
    assert.match(dead, /doorbell not typed because the agent in \S+ has exited/, dead);
    assert.equal(heads('d-one'), base, 'the branch is as it was');
    assert.equal(git('rev-parse main'), base);
    assert.notEqual(merge('d-one').code, 0, 'nothing is landed from a dead Crewmate');
    assert.equal(git('rev-parse main'), base);
    assert.equal(folder(), user);
    assert.doesNotMatch(okInside(`cat ${home}/state/d-one.status 2>/dev/null; true`), /^done|^needs-decision/m, 'the Crewmate reported no result');

    // SC-16: two Errands in the one Project at once, each gated open only after both are up.
    const gate = `${home}/state/gate-sc16`;
    const wtB = dispatch('p-one', { file: 'pa.md', text: 'write pa.md', checkLine: 'No check.', extra: `Errand gate: ${gate}\n` });
    const wtC = dispatch('p-two', { file: 'pb.md', text: 'write pb.md', checkLine: 'No check.', extra: `Errand gate: ${gate}\n` });
    for (let i = 0; i < 120 && ['p-one', 'p-two'].some((t) => inside(`test -s ${home}/state/${t}.stub-started`).code !== 0); i++) await new Promise((r) => setTimeout(r, 500));
    for (const t of ['p-one', 'p-two']) assert.equal(inside(`test -s ${home}/state/${t}.stub-started`).code, 0, `${t} is running`);
    assert.equal(sessions('p-one').length + sessions('p-two').length, 0, 'both are still running: neither has reported');
    assert.notEqual(wtB, wtC, 'separate worktrees');
    okInside(`touch ${gate}`);
    const sa = await waitSession('p-one', 1, user);
    const sb = await waitSession('p-two', 1, user);
    for (const [t, s, w] of [['p-one', sa, wtB], ['p-two', sb, wtC]]) {
      assert.equal(s.host, hostOf, 'in the Project container');
      assert.equal(s.cwd, w);
      assert.equal(s.branch, `fm/${t}`);
      assert.equal(s.start, base);
      assert.match(lastStatus(t), new RegExp(`^done \\[at=\\d+\\]: ready in branch fm/${t}; check: none$`));
      assert.equal(okInside(`git -C ${w} status --porcelain`).trim(), '');
      assert.equal(git(`rev-list --count ${base}..refs/heads/fm/${t}`), '1');
    }
    assert.notEqual(heads('p-one'), heads('p-two'));
    assert.equal(okInside(`cat ${wtB}/pa.md`).trim(), 'write pa.md');
    assert.equal(inside(`test -e ${wtB}/pb.md`).code, 1, 'each result stays on its own branch');
    assert.equal(git('rev-parse main'), base);
    assert.equal(folder(), user);

    // SC-14: sent back with a comment. A new session in the same worktree and branch sees the earlier commit and the comment.
    fm('bin/fm-crew-state.sh p-one');
    const first = sa.head;
    const sent = relaunch('p-one', 'Comment: put it under a heading');
    assert.equal(sent.code, 0, sent.out);
    const back = await waitSession('p-one', 2, user);
    assert.equal(back.cwd, wtB, 'the same worktree');
    assert.equal(back.branch, 'fm/p-one', 'the same branch');
    assert.equal(back.start, first, 'it starts from the earlier commit');
    assert.ok(back.log.includes('errand p-one'), 'it sees the earlier commit');
    assert.match(back.note, /Comment: put it under a heading/);
    assert.equal(okInside(`cat ${wtB}/pa.md.comment`).trim(), 'put it under a heading');
    assert.equal(git(`rev-list --count ${first}..refs/heads/fm/p-one`), '1');
    assert.match(lastStatus('p-one'), /^done \[at=\d+\]: ready in branch fm\/p-one; check: none$/);
    assert.equal(git('rev-parse main'), base);

    // Revised work after done (the send-back above, or a main that moved) lands as a follow-up Errand under a NEW task id,
    // because FirstMate latches the first observed done head as local_done_head and refuses any other head
    // (bin/fm-dod-lib.sh, bin/fm-merge-local.sh). Design decision 2026-11-19.
    fm('bin/fm-crew-state.sh p-one');
    okInside(`echo mine > ${dir}/moved.md`);
    userCommit('moved');
    const movedTo = git('rev-parse main');
    const oldTip = heads('p-one');
    const refused = merge('p-one');
    assert.notEqual(refused.code, 0, refused.out);
    assert.match(refused.out, /differs from the recorded local done head/, 'the old task is refused: its head is not the latched one');
    assert.equal(git('rev-parse main'), movedTo);
    const wtF = dispatch('f-one', { file: 'pa.md', text: 'write pa.md revised', checkLine: 'No check.', extra: 'Errand follow-up: fm/p-one\n' });
    const follow = await waitSession('f-one', 1, folder());
    assert.notEqual(wtF, wtB, 'a new worktree');
    assert.equal(follow.cwd, wtF);
    assert.equal(follow.branch, 'fm/f-one');
    assert.equal(follow.followUp, 'fm/p-one');
    assert.ok(follow.log.includes('errand p-one') && follow.log.includes('errand p-one: comment'), 'the old branch\'s commits came over');
    assert.equal(git(`rev-parse refs/heads/fm/f-one~3`), movedTo, 'the follow-up branch starts from today\'s main');
    assert.match(lastStatus('f-one'), /^done \[at=\d+\]: ready in branch fm\/f-one; check: none$/);
    assert.equal(okInside(`cat ${wtF}/pa.md.comment`).trim(), 'put it under a heading', 'the send-back comment\'s work is kept');
    assert.equal(git('rev-parse main'), movedTo, 'main has not moved yet');
    assert.equal(heads('p-one'), oldTip, 'the old branch is untouched');
    fm('bin/fm-crew-state.sh f-one');
    const landedF = merge('f-one');
    assert.equal(landedF.code, 0, landedF.out);
    assert.equal(git('rev-parse main'), follow.head, 'main fast-forwarded to the follow-up\'s head');
    assert.equal(git(`rev-list --count ${base}..main`), '4', 'main moved once, by the user\'s commit and the three follow-up commits');
    assert.equal(git(`rev-list --count ${movedTo}..main`), '3');
    assert.equal(okInside(`cat ${dir}/moved.md`).trim(), 'mine');
    assert.match(okInside(`cat ${dir}/pa.md`), /revised/);
    assert.equal(git('status --porcelain'), '');
    // The old task's branch never lands: its commits are not in main, and its accept stays refused.
    assert.equal(inside(`git -C ${dir} merge-base --is-ancestor ${oldTip} main`).code, 1, 'the old branch tip is not in main');
    const again = merge('p-one');
    assert.notEqual(again.code, 0, again.out);
    assert.equal(git('rev-parse main'), follow.head);
    assert.equal(inside(`test -e ${dir}/pb.md -o -e ${dir}/title.md -o -e ${dir}/dead.md`).code, 1, 'the other Errands\' results are not in the main folder');

    // Closing records by FirstMate's teardown, as qd-errand does (ticket 07): the landed follow-up closes plainly; the
    // replaced Errand is refused as unlanded and closes only by an explicit discard. Neither moves main.
    const teardown = (taskId, ...flags) => inside(`cd ${home}; FM_HOME=${home} bin/fm-teardown.sh ${taskId} ${flags.join(' ')} 2>&1`);
    const closedF = teardown('f-one');
    assert.equal(closedF.code, 0, closedF.out);
    const keptOld = teardown('p-one');
    assert.notEqual(keptOld.code, 0, keptOld.out);
    assert.match(keptOld.out, /REFUSED: local-only worktree \S+ has work not yet merged into main/);
    assert.ok(inside(`test -e ${home}/state/p-one.meta`).code === 0, 'a refused teardown keeps the record');
    const closedOld = teardown('p-one', '--force');
    assert.equal(closedOld.code, 0, closedOld.out);
    for (const t of ['f-one', 'p-one']) assert.equal(inside(`test -e ${home}/state/${t}.meta`).code, 1, `${t} is closed`);
    // FirstMate's teardown deletes the task branch, so the replaced Errand's branch is gone once it is closed (its work is in main through f-one).
    assert.equal(inside(`git -C ${dir} rev-parse --verify -q refs/heads/fm/p-one`).code, 1, 'teardown deleted fm/p-one');
    assert.equal(git('rev-parse main'), follow.head);
    assert.equal(git('status --porcelain'), '');
    assert.equal(inside(`test -e ${home}/state/p-two.meta`).code, 0, 'another open Errand is untouched');
  } finally {
    run('docker', ['rm', '-fv', cid]);
  }
});

// Ticket 09: an Errand on a Project with a GitHub repository (a local bare origin and a stub gh stand in for GitHub).
// The test script plays the Second Mate (qd-errand section 7) with FirstMate's own commands, beside a Spec Run record of
// the same Project in the same container. The stub Crewmate is the Errands one; the Spec Run record's is the MVP's.
test('an Errand handed to a Second Mate\'s home is pushed and opened as one pull request from the Quarterdeck, beside a Spec Run, with no GitHub credential in the container (SC-15, SC-18)', async () => {
  if (!quarterdeckStarted) {
    const started = quarterdeck('start', '--no-first-mate');
    assert.equal(started.code, 0, `${started.out}\n${started.err}`);
    quarterdeckStarted = true;
  }
  const parent = `${work}/fleet/firstmate`;
  const mate = 'sm-ghp';
  const home = `${work}/fleet/${mate}`;
  const origin = `${work}/ghp-origin.git`;
  const clone = `${home}/projects/ghp`;
  const errandId = 'ghp-errand';
  const specId = 'spec-ghp';
  const branch = `chore/${errandId}`;
  const fm = (command) => okInside(`cd ${home}; FM_HOME=${home} ${command}`);
  const read = (p) => okInside(`cat ${p}`);
  const git = (args) => okInside(`git -C ${clone} ${args}`).trim();
  const refsOf = () => okInside(`git --git-dir=${origin} for-each-ref --format='%(refname)'`).trim().split('\n').sort();
  const sessions = (taskId) => okInside(`cat ${home}/state/${taskId}.stub-sessions 2>/dev/null; true`).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const lastStatus = (taskId) => okInside(`tail -n1 ${home}/state/${taskId}.status`).trim();
  const waitSession = async (taskId, n) => {
    for (let i = 0; i < 120; i++) {
      if (sessions(taskId).length >= n) return sessions(taskId)[n - 1];
      await new Promise((r) => setTimeout(r, 500));
    }
    assert.fail(`no report: ${inside(`cat ${home}/state/${taskId}.status`).out}`);
  };

  // The Project on a local bare origin, with the Markdown Variant's config (the local Variant record accepts its image).
  const cfg = JSON.parse(markdownConfig().replace(/^\s*\/\/.*$/gm, ''));
  okInside(`rm -rf ${parent}/projects/ghp; mkdir -p ${parent}/data ${parent}/projects/ghp/.devcontainer; git init -q --bare -b main ${origin}; git -C ${parent}/projects/ghp init -q -b main`);
  put(`${parent}/projects/ghp/.devcontainer/devcontainer.json`, JSON.stringify({ ...cfg, containerEnv: pinEnv() }));
  put(`${parent}/projects/ghp/.devcontainer/extensions.json`, readFileSync(join(REPO, 'templates/markdown/.devcontainer/extensions.json')));
  put(`${parent}/projects/ghp/.gitignore`, '.claude/\n');
  okInside(`cd ${parent}/projects/ghp; git add .; git -c user.name=T -c user.email=t@example.invalid commit -qm initial; git remote add origin ${origin}; git push -q origin main`);
  okInside(`printf '%s\\n' '- ghp [direct-PR branch=chore/] - Errands GitHub fixture (added 2026-01-01)' >> ${parent}/data/projects.md`);
  okInside(`cd ${parent}; FM_HOME=${parent} FM_SECONDMATE_CHARTER='Second Mate for ghp. Commit only.' bin/fm-brief.sh ${mate} --secondmate ghp; FM_HOME=${parent} bin/fm-home-seed.sh ${mate} ${home} ghp`);
  okInside(`cp /opt/qd/fleet/config/* ${home}/config/`);
  const base = git('rev-parse origin/main');
  assert.deepEqual(refsOf(), ['refs/heads/main']);

  const up = fm(`env -u QUARTERDECK_EXTENSIONS_TOKEN -u QD_PROJECT_TEST_IMAGE QD_RUN_LABEL=${runLabel} qd-project-up ${home} ghp`);
  const cid = up.trim().split('\n').pop();
  // Both Crewmates are stubs, chosen by record id: the Errands stub, and the MVP's for the Spec Run record's plan.
  const lib = '/usr/local/lib/qd-test-stubs';
  const rootIn = (container, script, input) => run('docker', ['exec', '-i', '-u', 'root', container, 'sh', '-c', script], { input });
  const errandStub = readFileSync(join(REPO, 'tests/fixtures/errands-crewmate/claude.mjs'), 'utf8');
  const specStub = readFileSync(join(REPO, 'tests/fixtures/quarterdeck-crewmate/claude.mjs'), 'utf8');
  assert.equal(rootIn(cid, `mkdir -p ${lib}; cat > ${lib}/errand.mjs`, errandStub).code, 0);
  assert.equal(rootIn(cid, `cat > ${lib}/spec.mjs`, specStub).code, 0);
  assert.equal(rootIn(cid, `rm -f /usr/local/bin/claude; cat > /usr/local/bin/claude; chmod 755 /usr/local/bin/claude`,
    `#!/bin/sh\ncase "$FM_TASK_ID" in ${specId}) exec node ${lib}/spec.mjs "$@";; *) exec node ${lib}/errand.mjs "$@";; esac\n`).code, 0);

  // SC-15: nothing GitHub in the Project's container: no variable (names only) and no credential file, now and at each later point.
  const noGithub = (when) => {
    const names = [
      ...JSON.parse(run('docker', ['inspect', cid]).out)[0].Config.Env.map((e) => e.split('=')[0]),
      ...run('docker', ['exec', '-u', 'node', cid, 'sh', '-c', 'env | cut -d= -f1']).out.split('\n'),
    ];
    assert.deepEqual(names.filter((n) => /github|^GH_|token|credential/i.test(n)), [], `${when}: no GitHub variable in the container`);
    const files = run('docker', ['exec', '-u', 'node', cid, 'sh', '-c', 'for f in "$HOME/.git-credentials" "$HOME/.config/gh" "$HOME/.config/git/credentials" /run/secrets; do test -e "$f" && echo "$f"; done; git config --system --get-regexp "^credential" ; git config --global --get-regexp "^credential"; true']).out.trim();
    assert.equal(files, '', `${when}: no GitHub credential file or helper in the container`);
    const mounts = JSON.parse(run('docker', ['inspect', cid]).out)[0].Mounts.map((m) => m.Source);
    assert.deepEqual(mounts.filter((s) => /\.config\/quarterdeck|token|\.git-credentials|\/secrets/i.test(s)), [], `${when}: no credential mounted`);
  };
  noGithub('after start');

  // The Spec Run record of the same Project: planning only is enough to hold a branch and a worktree of its own.
  const brief = (taskId, task, spec, prefix) => {
    fm(`bin/fm-brief.sh ${taskId} ghp --mode direct-PR --branch-prefix ${prefix}`);
    const path = `${home}/data/${taskId}/brief.md`;
    put(path, read(path).replace('{TASK}', task).replace('{FIRSTMATE_SPEC}', spec)
      .replace(/This task ships \*\*direct-PR\*\*:[\s\S]*?(?=Do NOT run \/no-mistakes\.)/, 'Commit and report; do not push, do not open a pull request, except in a `Publish.` session.\n'));
    fm(`bin/fm-dispatch-resolve.sh ${path}`);
    const out = fm(`bin/fm-spawn.sh ${taskId} projects/ghp --mode direct-PR --yolo off --branch-prefix ${prefix} --harness claude --model sonnet`);
    const wt = out.match(/worktree=(\S+)/)?.[1];
    assert.ok(wt, out);
    return wt;
  };
  const specWt = brief(specId, `Spec Run: ${specId}\nProject: ghp\nBranch prefix: feat/`, `Each session does exactly one job named by the latest ## Progress note. No note: plan.\nFixture failure: false\nFixture question: false\n`, 'feat/');
  const specPlan = await waitSession(specId, 1);
  const specBranch = `feat/${specId}`;
  assert.match(lastStatus(specId), /^done \[at=\d+\]: plan committed [0-9a-f]{40}; 2 tickets$/);
  const specState = () => okInside(`cd ${specWt} && { git rev-parse HEAD; git symbolic-ref HEAD; git status --porcelain --ignored; }`);
  const specBefore = specState();

  // The Errand: handed over, run as its own record on its own branch, in the same container.
  const handoff = `Errand: ${errandId}\nBranch prefix: chore/\nProject: ghp\n\nWrite note.md with one line.`;
  const publishLine = `- **Publish.** Run \`FM_HOME="${home}" qd-publish --body-from-brief "${home}" "ghp" "${branch}" "${errandId}"\` and nothing else. This session is routed into the Quarterdeck. On success append \`done: PR <url>\` with the URL the command printed. Make no new commit.`;
  const errandWt = brief(errandId, handoff, `Errand file: note.md\nThis Project has no check.\nYour final status line ends with \`check: none\`.\n${publishLine}\n`, 'chore/');
  const e1 = await waitSession(errandId, 1);
  assert.match(lastStatus(errandId), new RegExp(`^done \\[at=\\d+\\]: ready in branch ${branch}; check: none$`));
  assert.equal(e1.branch, branch);
  assert.equal(e1.cwd, errandWt);
  assert.equal(e1.start, base, 'its branch starts from the default branch');
  assert.equal(e1.host, cid.slice(0, 12), 'the Crewmate ran in the Project container');
  assert.deepEqual(e1.githubEnv, [], 'the Crewmate\'s own environment held no GitHub variable');
  noGithub('after the Errand reported');
  // Nothing was pushed by the Crewmate: the Errand is only local until the publish session.
  assert.deepEqual(refsOf(), ['refs/heads/main']);

  // SC-18: two records, two branches, two worktrees, one container; neither changed the other.
  assert.notEqual(errandWt, specWt);
  assert.equal(git(`rev-parse refs/heads/${specBranch}`), specPlan.head);
  assert.equal(git(`rev-parse refs/heads/${branch}`), e1.head);
  assert.notEqual(e1.head, specPlan.head);
  assert.equal(specState(), specBefore, 'the Spec Run record\'s branch and worktree are as they were');
  assert.equal(inside(`test -e ${specWt}/note.md -o -e ${specWt}/.scratch/${errandId}`).code, 1, 'the Errand\'s files are not in the Spec Run\'s worktree');
  assert.equal(inside(`test -e ${errandWt}/.scratch`).code, 1, 'the Spec Run\'s files are not in the Errand\'s worktree');
  assert.equal(okInside(`git -C ${errandWt} status --porcelain`).trim(), '');
  const launches = read(`${work}/quarterdeck/logs/launch.log`).trim().split('\n').map((l) => JSON.parse(l));
  const containerOf = (wt) => new Set(launches.filter((l) => l.cwd === wt && l.route === 'project').map((l) => l.container));
  assert.deepEqual([...containerOf(errandWt)], [...containerOf(specWt)], 'both ran in the same container');
  assert.equal([...containerOf(errandWt)].length, 1);
  assert.ok([...containerOf(errandWt)][0].startsWith(cid));

  // Publish, as qd-errand section 7 says: the marker, then a relaunch of the same record. Only this throwaway Quarterdeck's
  // Claude and gh are swapped; the stub gh records every call and fails on anything but `pr create`.
  const ghStub = `#!/usr/bin/env node\nconst fs = require('fs');\nconst args = process.argv.slice(2);\nfs.appendFileSync('${home}/gh-calls', JSON.stringify(args) + '\\n');\nif (args[0] !== 'pr' || args[1] !== 'create') process.exit(2);\nconsole.log('https://github.com/fixture/ghp/pull/1');\n`;
  assert.equal(rootIn(name, 'mv /usr/local/bin/claude /usr/local/bin/claude.saved; cat > /usr/local/bin/claude; chmod +x /usr/local/bin/claude', errandStub).code, 0);
  assert.equal(rootIn(name, 'mv /usr/local/bin/gh /usr/local/bin/gh.saved; cat > /usr/local/bin/gh; chmod +x /usr/local/bin/gh', ghStub).code, 0);
  try {
    okInside(`printf quarterdeck > ${home}/data/${errandId}/qd-route`);
    const relaunched = inside(`cd ${home}; FM_HOME=${home} bin/fm-control.sh ${errandId} relaunch --model sonnet --note 'Publish.' 2>&1`);
    assert.equal(relaunched.code, 0, relaunched.out);
    const published = await waitSession(errandId, 2);
    assert.match(lastStatus(errandId), /^done \[at=\d+\]: PR https:\/\/github.com\/fixture\/ghp\/pull\/1$/);
    assert.equal(inside(`test -e ${home}/data/${errandId}/qd-route`).code, 1, 'the marker was consumed');
    assert.equal(published.cwd, errandWt);
    assert.equal(published.head, e1.head, 'the publish session added no commit');
    assert.deepEqual(JSON.parse(read(`${work}/quarterdeck/logs/launch.log`).trim().split('\n').at(-1)), { route: 'publish', container: '', cwd: errandWt, model: 'sonnet' });
    // Exactly its branch is on the origin, at the Errand's head; the default branch and the Spec Run's branch are not touched.
    assert.deepEqual(refsOf(), [`refs/heads/${branch}`, 'refs/heads/main']);
    assert.equal(okInside(`git --git-dir=${origin} rev-parse refs/heads/${branch}`).trim(), e1.head);
    assert.equal(okInside(`git --git-dir=${origin} rev-parse refs/heads/main`).trim(), base);
    // One gh call: a pull request against the default branch, its text from the Brief; no merge, no other call.
    const calls = read(`${home}/gh-calls`).trim().split('\n').map(JSON.parse);
    assert.equal(calls.length, 1, JSON.stringify(calls));
    const option = (key) => calls[0][calls[0].indexOf(key) + 1];
    assert.deepEqual(calls[0].slice(0, 2), ['pr', 'create']);
    assert.equal(option('--base'), 'main');
    assert.equal(option('--head'), branch);
    assert.equal(option('--title'), `Errand: ${errandId}`);
    assert.equal(option('--body'), `Errand ${errandId}, from its Brief:\n\n${handoff}\n`);
    assert.ok(!calls[0].includes('merge'));
  } finally {
    assert.equal(rootIn(name, 'mv /usr/local/bin/claude.saved /usr/local/bin/claude; mv /usr/local/bin/gh.saved /usr/local/bin/gh').code, 0);
  }
  // Still nothing GitHub in the Project's container, and the Spec Run record is as it was.
  noGithub('after the pull request');
  assert.equal(specState(), specBefore);
  assert.equal(git(`rev-parse refs/heads/${specBranch}`), specPlan.head);
  assert.equal(okInside(`git -C ${home} status --porcelain --untracked-files=no`).trim(), '', 'FirstMate unpatched');
  run('docker', ['rm', '-fv', cid]);
});
