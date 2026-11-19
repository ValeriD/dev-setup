// Errands feature tests, token-free (run with `npm run test:errands`; never the whole suite).
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
