// Rendering of MCP config (no pnpm needed: the "installed" package is faked on disk).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'smol-toml';
import { writeMcpConfig, secretNames } from '../src/index.mjs';

const root = mkdtempSync(join(tmpdir(), 'mcp-render-'));
const mcpRoot = join(root, 'mcp');
mkdirSync(join(mcpRoot, 'gh/node_modules/@acme/gh-server'), { recursive: true });
writeFileSync(join(mcpRoot, 'gh/node_modules/@acme/gh-server/package.json'), JSON.stringify({ name: '@acme/gh-server', bin: { 'gh-server': 'bin/run.mjs' } }));
const paths = () => {
  const d = mkdtempSync(join(root, 't-'));
  return { mcpRoot, claudeMcp: join(d, 'claude/managed-mcp.json'), codexConfig: join(d, 'codex.toml'), secretsOut: join(d, 'secrets') };
};
const stdio = { kind: 'mcp', agents: ['claude', 'codex'], name: 'gh', source: { npm: '@acme/gh-server', version: '1.0.0' }, env: ['GH_TOKEN'] };
const remote = { kind: 'mcp-remote', agents: ['claude', 'codex'], name: 'docs', url: 'https://mcp.example.com/x', egress: ['mcp.example.com'], bearerTokenEnv: 'DOCS_TOKEN' };
const base = '# keep me\nsandbox_mode = "danger-full-access"\n';

test('renders both kinds for both Agents, by env var name only, and keeps the hand-written Codex config', () => {
  const p = paths();
  writeFileSync(p.codexConfig, base);
  const r = writeMcpConfig([stdio, remote], p);
  assert.deepEqual(r.secrets, ['GH_TOKEN', 'DOCS_TOKEN']);
  const claude = JSON.parse(readFileSync(p.claudeMcp, 'utf8')).mcpServers;
  assert.deepEqual(claude.gh, { type: 'stdio', command: 'node', args: [join(mcpRoot, 'gh/node_modules/@acme/gh-server/bin/run.mjs')], env: { GH_TOKEN: '${GH_TOKEN}' } });
  assert.deepEqual(claude.docs, { type: 'http', url: 'https://mcp.example.com/x', headers: { Authorization: 'Bearer ${DOCS_TOKEN}' } });
  const text = readFileSync(p.codexConfig, 'utf8');
  assert.ok(text.startsWith(base), 'hand-written part untouched');
  const codex = parse(text);
  assert.equal(codex.sandbox_mode, 'danger-full-access');
  assert.deepEqual(codex.mcp_servers.gh.env_vars, ['GH_TOKEN']);
  assert.equal(codex.mcp_servers.docs.bearer_token_env_var, 'DOCS_TOKEN');
  assert.equal(readFileSync(p.secretsOut, 'utf8'), 'GH_TOKEN\nDOCS_TOKEN\n');
});

test('rendering again replaces the generated block instead of appending', () => {
  const p = paths();
  writeFileSync(p.codexConfig, base);
  writeMcpConfig([stdio], p);
  writeMcpConfig([stdio, remote], p);
  const text = readFileSync(p.codexConfig, 'utf8');
  assert.equal(text.split('BEGIN dev-setup').length, 2);
  assert.deepEqual(Object.keys(parse(text).mcp_servers), ['gh', 'docs']);
});

test('an entry for one Agent is not rendered for the other; no Claude entries write no Claude file', () => {
  const p = paths();
  writeFileSync(p.codexConfig, base);
  writeMcpConfig([{ ...remote, agents: ['codex'] }], p);
  assert.equal(existsSync(p.claudeMcp), false, 'managed-mcp.json takes exclusive control, so it needs a server');
  assert.deepEqual(Object.keys(parse(readFileSync(p.codexConfig, 'utf8')).mcp_servers), ['docs']);
  assert.deepEqual(secretNames({ kind: 'mcp-remote' }), []);
});
