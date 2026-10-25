// Container acceptance for the extension installer at image build:
// SC-13 (skill for both Agents, Base/Variant layers) and the build-time half of SC-14.
// Derives throwaway images FROM the built image and runs the installer in them
// against a local git fixture, so no network is needed beyond the base build.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO, IMAGE, run, buildImage } from './lib.mjs';

const root = mkdtempSync(join(tmpdir(), 'dev-setup-ext-'));
const tag = `dev-setup-ext-test:${process.pid}`;
const built = [];
let sha;
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8' }).trim();

before(() => {
  buildImage();
  const work = join(root, 'work');
  mkdirSync(join(work, 'skills/hello'), { recursive: true });
  writeFileSync(join(work, 'skills/hello/SKILL.md'), '---\nname: hello-fixture\ndescription: Fixture skill that greets people.\n---\nSay hello.\n');
  git(work, 'init', '-q', '-b', 'main');
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'x');
  sha = git(work, 'rev-parse', 'HEAD');
  mkdirSync(join(root, 'ctx/git/acme'), { recursive: true });
  git(root, 'clone', '-q', '--bare', work, join(root, 'ctx/git/acme/skills.git'));
  writeFileSync(join(root, 'ctx/.dockerignore'), '*\n!git/\n!*.json\n');
});
after(() => {
  for (const t of built) run('docker', ['rmi', '-f', t]);
  rmSync(root, { recursive: true, force: true });
});

/** Build an image FROM the built one that runs the installer over its manifests plus one fixture manifest. */
function derive(name, manifest) {
  const t = `${tag}-${name}`;
  writeFileSync(join(root, 'ctx', `${name}.json`), JSON.stringify(manifest));
  writeFileSync(
    join(root, 'ctx/Dockerfile'),
    `FROM ${IMAGE}\nUSER root\nCOPY git /fixtures\nCOPY ${name}.json /tmp/layer.json\n` +
      'RUN node /opt/dev-setup/installer/src/cli.mjs install --mode build --git-base /fixtures ' +
      '--manifest /opt/dev-setup/manifests/base.json --manifest /opt/dev-setup/manifests/node.json --manifest /tmp/layer.json\nUSER node\n',
  );
  const r = run('docker', ['build', '--progress=plain', '-t', t, join(root, 'ctx')]);
  if (r.code === 0) built.push(t);
  return { tag: t, ...r };
}
const inImage = (t, script, extra = []) => run('docker', ['run', '--rm', ...extra, '--entrypoint', 'bash', t, '-c', script]);
const skillEntry = (extra = {}, s = sha) => ({
  kind: 'skill', agents: ['claude', 'codex'], source: { github: 'acme/skills', path: 'skills/hello', sha: s }, ...extra,
});

test('SC-13: a skill declared once appears in both Agents skill listings in the built image', () => {
  const d = derive('both', { extensions: [skillEntry()], egress: ['skills.example.org'] });
  assert.equal(d.code, 0, d.err);

  // Claude: the init event of a session lists skills (no model call is needed).
  const c = inImage(d.tag, `cd /tmp && ANTHROPIC_API_KEY=sk-fake timeout 60 claude -p hi --output-format stream-json --verbose 2>/dev/null | grep '"subtype":"init"'`);
  assert.equal(c.code, 0, c.err);
  assert.ok(JSON.parse(c.out.trim().split('\n')[0]).skills.includes('hello'), 'Claude init event lists the skill');

  // Codex has no listing command; its model request carries the skills it will offer.
  const fx = join(REPO, 'tests/fixtures');
  const x = inImage(
    d.tag,
    `cd /tmp && (node /fx/codex-mock-server.mjs true /tmp/request.json >/dev/null 2>&1 &) && sleep 1 &&
     timeout 90 codex exec --skip-git-repo-check -c model_provider=mock -c 'model_providers.mock={name="mock",base_url="http://127.0.0.1:18080",wire_api="responses",requires_openai_auth=false}' go >/dev/null 2>&1;
     cat /tmp/request.json`,
    ['-v', `${fx}:/fx:ro`],
  );
  assert.equal(x.code, 0, x.err);
  assert.ok(x.out.includes('hello-fixture') && x.out.includes('Fixture skill that greets people.'), 'Codex request lists the skill');

  // The installer wrote a root-owned, read-only copy, and the manifest's egress reached the allowlist.
  const p = inImage(d.tag, 'stat -c "%U %a" /etc/claude-code/.claude/skills/hello/SKILL.md /etc/codex/skills/hello/SKILL.md; test -w /etc/codex/skills/hello/SKILL.md && echo writable; grep -x skills.example.org /usr/local/share/egress/allowlist.txt');
  assert.equal(p.out.trim(), 'root 644\nroot 644\nskills.example.org');
});

test('a floating ref fails the image build, naming the entry', () => {
  const bad = skillEntry();
  bad.source = { github: 'acme/skills', path: 'skills/hello', sha: 'main' };
  const d = derive('floating', { extensions: [bad] });
  assert.notEqual(d.code, 0);
  assert.match(d.err, /extensions\[0\] \(skill "acme\/skills\/skills\/hello"\).*not a full 40-character commit SHA/);
});

test('the shipped image allowlist is assembled from extensions/base.json', () => {
  const base = JSON.parse(readFileSync(join(REPO, 'extensions/base.json'), 'utf8'));
  const r = inImage(IMAGE, 'grep -v "^#" /usr/local/share/egress/allowlist.txt | grep .');
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.out.trim().split('\n'), base.egress);
});
