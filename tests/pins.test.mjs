// The pin check rejects unpinned Actions and base images (ticket 10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findUnpinned, findDrift } from '../scripts/check-pins.mjs';

const sha = 'a'.repeat(40);
const digest = 'sha256:' + 'b'.repeat(64);

test('accepts SHA-pinned actions, local actions and digest-pinned images', () => {
  assert.deepEqual(findUnpinned('w.yml', `- uses: actions/checkout@${sha} # v7\n- uses: ./local\n`), []);
  assert.deepEqual(findUnpinned('Dockerfile', `FROM node:24@${digest}\nFROM scratch\n`), []);
});

test('rejects tag-pinned actions and images', () => {
  assert.equal(findUnpinned('w.yml', '- uses: actions/checkout@v4\n').length, 1);
  assert.equal(findUnpinned('w.yml', '      image: ubuntu:24.04\n').length, 1);
  assert.equal(findUnpinned('Dockerfile', 'FROM node:24-slim\n').length, 1);
});

const dockerfile = (base, claude, pnpm = '11.0.0') => `FROM node:24@sha256:${base.repeat(64)}\nARG PNPM_VERSION=${pnpm}\nARG CLAUDE_CODE_VERSION=${claude}\n`;

test('a Dockerfile that repeats the Node Variant pins must agree on base digest, Claude Code and pnpm', () => {
  assert.deepEqual(findDrift(dockerfile('a', '2.1.0'), dockerfile('a', '2.1.0'), 'x/Dockerfile'), []);
  const baseDrift = findDrift(dockerfile('a', '2.1.0'), dockerfile('b', '2.1.0'), 'x/Dockerfile');
  assert.equal(baseDrift.length, 1);
  assert.match(baseDrift[0], /base image/);
  const claudeDrift = findDrift(dockerfile('a', '2.1.0'), dockerfile('a', '2.2.0'), 'x/Dockerfile');
  assert.equal(claudeDrift.length, 1);
  assert.equal(findDrift(dockerfile('a', '2.1.0'), dockerfile('a', '2.1.0', '12.0.0'), 'x/Dockerfile').length, 1);
});

test('the Markdown Variant Dockerfile agrees with the Node Variant and is digest-pinned', () => {
  const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  const md = read('variants/markdown/Dockerfile');
  assert.deepEqual(findDrift(read('variants/node/Dockerfile'), md, 'variants/markdown/Dockerfile'), []);
  assert.deepEqual(findUnpinned('variants/markdown/Dockerfile', md), []);
  assert.match(findDrift(dockerfile('a', '2.1.0'), dockerfile('b', '2.1.0'), 'variants/markdown/Dockerfile')[0], /^variants\/markdown\/Dockerfile: base image/);
});
