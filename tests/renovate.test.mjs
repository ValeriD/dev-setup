// Renovate config (ticket 11, SC-21): the regex managers match the real pin
// locations and Pinned Ref / Agent version updates are never auto-merged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const config = JSON.parse(read('renovate.json'));
const manager = (dep) => config.customManagers.find((m) => m.depNameTemplate === dep || m.datasourceTemplate === dep);
const run = (m, text) => [...text.matchAll(new RegExp(m.matchStrings[0], 'g'))].map((x) => x.groups);
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
