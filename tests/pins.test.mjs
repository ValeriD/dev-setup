// The pin check rejects unpinned Actions and base images (ticket 10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findUnpinned } from '../scripts/check-pins.mjs';

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
