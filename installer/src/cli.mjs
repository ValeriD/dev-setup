#!/usr/bin/env node
// Thin CLI over the library: `install --mode build --manifest FILE...`.
import { parseArgs } from 'node:util';
import { installBuild, installStart, ManifestError } from './index.mjs';

const USAGE = `usage: dev-setup-installer install --mode build --manifest FILE [--manifest FILE...]
       dev-setup-installer install --mode start --manifest FILE [--manifest FILE...] --project FILE
       [--git-base URL] [--claude-skills DIR] [--codex-skills DIR] [--egress-out FILE]
       [--mcp-root DIR] [--claude-mcp FILE] [--codex-config FILE] [--secrets-out FILE]`;

function main(argv) {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      mode: { type: 'string' },
      manifest: { type: 'string', multiple: true },
      project: { type: 'string' },
      'git-base': { type: 'string' },
      'claude-skills': { type: 'string' },
      'codex-skills': { type: 'string' },
      'egress-out': { type: 'string' },
      'mcp-root': { type: 'string' },
      'claude-mcp': { type: 'string' },
      'codex-config': { type: 'string' },
      'secrets-out': { type: 'string' },
    },
  });
  if (positionals[0] !== 'install' || positionals.length !== 1 || !values.manifest?.length) throw new Error(USAGE);
  if (values.mode !== 'build' && values.mode !== 'start') throw new Error(`unsupported --mode ${JSON.stringify(values.mode)}\n${USAGE}`);
  if ((values.mode === 'start') !== Boolean(values.project)) throw new Error(`--project is required in start mode and only valid there\n${USAGE}`);
  const r = (values.mode === 'start' ? installStart : installBuild)({
    project: values.project,
    manifests: values.manifest,
    gitBase: values['git-base'],
    claudeSkills: values['claude-skills'],
    codexSkills: values['codex-skills'],
    egressOut: values['egress-out'],
    mcpRoot: values['mcp-root'],
    claudeMcp: values['claude-mcp'],
    codexConfig: values['codex-config'],
    secretsOut: values['secrets-out'],
  });
  console.log(`installer: ${r.skills.length} skill(s), ${r.mcp.length} MCP package(s), ${r.egress.length} egress domain(s)`);
}

try {
  main(process.argv.slice(2));
} catch (err) {
  if (err instanceof ManifestError) {
    for (const p of err.problems) console.error(`error: ${p}`);
  } else {
    console.error(`error: ${err.message}`);
  }
  process.exit(1);
}
