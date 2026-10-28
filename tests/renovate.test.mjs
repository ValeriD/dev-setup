// Renovate config (ticket 11, SC-21): the regex managers match the real pin
// locations and Pinned Ref / Agent version updates are never auto-merged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const config = JSON.parse(read('renovate.json'));
const manager = (dep) => config.customManagers.find((m) => m.depNameTemplate === dep || m.datasourceTemplate === dep);
const run = (m, text) => m.matchStrings.flatMap((s) => [...text.matchAll(new RegExp(s, 'g'))].map((x) => x.groups));
const patternMatches = (m, file) => m.managerFilePatterns.some((p) => new RegExp(p.slice(1, -1)).test(file));

test('regex managers match the Dockerfile ARG pins', () => {
  const docker = read('variants/node/Dockerfile');
  for (const [dep, arg] of [['pnpm', 'PNPM_VERSION'], ['@anthropic-ai/claude-code', 'CLAUDE_CODE_VERSION'], ['@openai/codex', 'CODEX_VERSION']]) {
    const m = config.customManagers.find((x) => x.depNameTemplate === dep && patternMatches(x, 'variants/node/Dockerfile'));
    const [hit] = run(m, docker);
    assert.ok(hit, dep);
    assert.match(hit.currentValue, /^\d+\.\d+\.\d+$/);
    assert.ok(docker.includes(`ARG ${arg}=${hit.currentValue}`));
  }
});

test('regex managers match the workflow pins', () => {
  const ci = read('.github/workflows/ci.yml');
  const wf = '.github/workflows/ci.yml';
  for (const dep of ['@devcontainers/cli', 'pnpm']) {
    const m = config.customManagers.find((x) => x.depNameTemplate === dep && patternMatches(x, wf));
    assert.match(run(m, ci)[0].currentValue, /^\d+\.\d+\.\d+$/, dep);
  }
});

const CLI_FILES = ['.github/workflows/ci.yml', 'tests/lib.mjs', 'skills/dev-container/scripts/commands.mjs', 'README.md'];

test('one manager updates the devcontainer CLI version in every file that pins it', () => {
  const managers = config.customManagers.filter((x) => x.depNameTemplate === '@devcontainers/cli');
  assert.equal(managers.length, 1);
  const versions = CLI_FILES.map((f) => {
    assert.ok(patternMatches(managers[0], f), f);
    const hits = run(managers[0], read(f));
    assert.ok(hits.length > 0, f);
    return [...new Set(hits.map((h) => h.currentValue))];
  });
  for (const v of versions) assert.deepEqual(v, versions[0]);
  assert.match(versions[0][0], /^\d+\.\d+\.\d+$/);
});

test('every file pinning the devcontainer CLI is covered by the manager', () => {
  const m = config.customManagers.find((x) => x.depNameTemplate === '@devcontainers/cli');
  const skip = new Set(['.git', 'node_modules', '.scratch']);
  // Files that mention the pin shape without pinning: this test, the config itself, and the agreement check.
  const self = new Set(['tests/renovate.test.mjs', 'renovate.json', 'skills/dev-container/scripts/test/helper.test.mjs']);
  const walk = (d) => readdirSync(join(root, d)).flatMap((n) => {
    const rel = d ? `${d}/${n}` : n;
    if (skip.has(n) || self.has(rel)) return [];
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel];
  });
  const uncovered = walk('').filter((f) => {
    const text = readFileSync(join(root, f));
    if (text.includes(0)) return false;
    return /@devcontainers\/cli@\d|CLI_VERSION:/.test(text.toString('utf8')) && !patternMatches(m, f);
  });
  assert.deepEqual(uncovered, []);
});

test('the cosign container pin in the skill helper is tracked with its tag and digest', () => {
  const file = 'skills/dev-container/scripts/commands.mjs';
  const m = config.customManagers.find((x) => x.datasourceTemplate === 'docker' && patternMatches(x, file));
  const hits = run(m, read(file));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].depName, 'ghcr.io/sigstore/cosign/cosign');
  assert.match(hits[0].currentValue, /^v\d+\.\d+\.\d+$/);
  assert.match(hits[0].currentDigest, /^sha256:[0-9a-f]{64}$/);
});

test('manifest manager extracts Pinned Ref SHAs and ignores other keys', () => {
  const m = manager('git-refs');
  const a = 'a'.repeat(40), b = 'b'.repeat(40);
  const text = JSON.stringify({ extensions: [
    { kind: 'skill', agents: ['claude'], source: { github: 'o/skills', path: 'x', sha: a } },
    { kind: 'plugin', agents: ['claude'], source: { marketplace: 'o/market', plugin: 'p', sha: b } },
    { kind: 'mcp', agents: ['claude'], name: 'n', source: { npm: 'pkg', version: '1.0.0' } },
  ] }, null, 2);
  assert.deepEqual(run(m, text).map((g) => [g.depName, g.currentDigest]), [['o/skills', a], ['o/market', b]]);
  for (const f of ['extensions/base.json', 'variants/node/extensions.json']) assert.ok(patternMatches(m, f), f);
});

test('Pinned Ref and Agent version updates have auto-merge disabled', () => {
  assert.equal(config.automerge, false);
  const rules = config.packageRules;
  const off = (r) => r.automerge === false;
  assert.ok(rules.some((r) => r.matchManagers?.includes('custom.regex') && off(r)));
  assert.ok(rules.some((r) => r.matchDatasources?.includes('git-refs') && off(r)));
  assert.ok(rules.some((r) => ['@anthropic-ai/claude-code', '@openai/codex'].every((p) => r.matchPackageNames?.includes(p)) && off(r)));
  assert.ok(!rules.some((r) => r.automerge === true));
});

test('npm updates respect the 7 day release-age policy', () => {
  assert.equal(config.minimumReleaseAge, '7 days');
  assert.ok(config.packageRules.some((r) => r.matchDatasources?.includes('npm') && r.minimumReleaseAge === '7 days'));
});

test('the release workflow rebuilds weekly', () => {
  assert.match(read('.github/workflows/ci.yml'), /^ {2}schedule:\n {4}- cron: '\d+ \d+ \* \* \d'/m);
});
