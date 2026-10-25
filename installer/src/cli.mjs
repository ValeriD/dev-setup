#!/usr/bin/env node
// Thin CLI over the library: `install --mode build --manifest FILE...`.
import { parseArgs } from 'node:util';
import { installBuild, ManifestError } from './index.mjs';

const USAGE = `usage: dev-setup-installer install --mode build --manifest FILE [--manifest FILE...]
       [--git-base URL] [--claude-skills DIR] [--codex-skills DIR] [--egress-out FILE]`;

function main(argv) {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      mode: { type: 'string' },
      manifest: { type: 'string', multiple: true },
      'git-base': { type: 'string' },
      'claude-skills': { type: 'string' },
      'codex-skills': { type: 'string' },
      'egress-out': { type: 'string' },
    },
  });
  if (positionals[0] !== 'install' || positionals.length !== 1 || !values.manifest?.length) throw new Error(USAGE);
  if (values.mode !== 'build') throw new Error(`unsupported --mode ${JSON.stringify(values.mode)}: only "build" exists so far\n${USAGE}`);
  const r = installBuild({
    manifests: values.manifest,
    gitBase: values['git-base'],
    claudeSkills: values['claude-skills'],
    codexSkills: values['codex-skills'],
    egressOut: values['egress-out'],
  });
  console.log(`installer: ${r.skills.length} skill(s), ${r.egress.length} egress domain(s)`);
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
