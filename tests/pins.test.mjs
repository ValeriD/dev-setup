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

test('the Quarterdeck Dockerfile must agree with the Node Variant on base digest and Claude version', () => {
  assert.deepEqual(findDrift(dockerfile('a', '2.1.0'), dockerfile('a', '2.1.0')), []);
  const baseDrift = findDrift(dockerfile('a', '2.1.0'), dockerfile('b', '2.1.0'));
  assert.equal(baseDrift.length, 1);
  assert.match(baseDrift[0], /base image/);
  const claudeDrift = findDrift(dockerfile('a', '2.1.0'), dockerfile('a', '2.2.0'));
  assert.equal(claudeDrift.length, 1);
  assert.equal(findDrift(dockerfile('a', '2.1.0'), dockerfile('a', '2.1.0', '12.0.0')).length, 1);
});

test('the repository Dockerfiles agree today and the Quarterdeck base is a digest', () => {
  const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  assert.deepEqual(findDrift(read('variants/node/Dockerfile'), read('quarterdeck/Dockerfile')), []);
  assert.deepEqual(findUnpinned('quarterdeck/Dockerfile', read('quarterdeck/Dockerfile')), []);
});

test('the Quarterdeck proxy image must be pinned to a digest, today and in general', () => {
  assert.equal(findUnpinned('quarterdeck/docker-proxy.conf', 'PROXY_IMAGE=wollomatic/socket-proxy:1.13.2\n').length, 1);
  assert.equal(findUnpinned('quarterdeck/docker-proxy.conf', 'PROXY_IMAGE=wollomatic/socket-proxy:1.13.2@sha256:' + 'c'.repeat(64) + '\n').length, 0);
  const text = readFileSync(new URL('../quarterdeck/docker-proxy.conf', import.meta.url), 'utf8');
  assert.deepEqual(findUnpinned('quarterdeck/docker-proxy.conf', text), []);
});
