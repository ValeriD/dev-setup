// Errands feature tests, token-free (run with `npm run test:errands`; never the whole suite).
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
  run('docker', ['run', '--rm', '--label', runLabel, '--user', 'root', '--entrypoint', 'rm', '-v', `${work}:${work}`, qdImage, '-rf', join(work, 'fleet'), join(work, 'quarterdeck/config'), join(work, 'pool')]);
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
