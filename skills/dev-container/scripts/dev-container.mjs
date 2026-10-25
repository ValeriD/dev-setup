#!/usr/bin/env node
// Helper CLI for the dev-container skill. Prints one JSON document on stdout;
// exits 0 on success, 1 on failure, 2 on bad usage, 3 when the skill must be re-linked.
//
// Node runs this file from its real path (symlinks resolved), so the dev-setups
// checkout is three directories up. Every subcommand checks that checkout first,
// then loads the installer library from it.
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = dirname(dirname(SKILL_DIR));
const REQUIRED = ['variants', 'templates', 'presets','installer/extensions.schema.json', 'installer/src/index.mjs', 'skills/dev-container/SKILL.md'];

const relinkMessage = (why) =>
  `${why}\nRe-link the skill to a dev-setups checkout:\n  ln -sfn <path-to-dev-setups>/skills/dev-container ${linkPath()}`;

function linkPath() {
  return join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'skills', 'dev-container');
}

/** Returns a problem string when the skill is not running from a valid, linked checkout. */
function checkInstall() {
  const missing = REQUIRED.filter((p) => !existsSync(join(REPO, p)));
  if (missing.length) return `The dev-container skill at ${SKILL_DIR} is not inside a dev-setups checkout (missing: ${missing.join(', ')}).`;
  const link = linkPath();
  try {
    lstatSync(link);
  } catch {
    return null; // not installed under this config dir; running from the checkout directly
  }
  let target;
  try {
    target = realpathSync(link);
  } catch {
    return `The skill link ${link} is broken (its target no longer exists).`;
  }
  if (target !== realpathSync(SKILL_DIR)) {
    return `The skill link ${link} points to ${target}, not to this checkout's skill (${SKILL_DIR}).`;
  }
  return null;
}

function emit(doc, code = 0) {
  process.stdout.write(JSON.stringify(doc, null, 2) + '\n');
  process.exit(code);
}

const problem = checkInstall();
if (problem) {
  const message = relinkMessage(problem);
  console.error(message);
  emit({ ok: false, relink: true, message }, 3);
}

let commands;
try {
  commands = await import(pathToFileURL(join(SKILL_DIR, 'scripts/commands.mjs')).href);
} catch (err) {
  if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err;
  const message = `Helper dependencies are not installed (${err.message.split('\n')[0]}). Run once in ${REPO}:\n` +
    '  (cd installer && npx -y pnpm@11.0.0 install --frozen-lockfile)\n' +
    '  (cd skills/dev-container/scripts && npx -y pnpm@11.0.0 install --frozen-lockfile)';
  console.error(message);
  emit({ ok: false, setup: true, message }, 1);
}

try {
  const { doc, code } = await commands.run(process.argv.slice(2), { repo: REPO });
  emit(doc, code);
} catch (err) {
  const usage = err instanceof commands.UsageError;
  console.error(`error: ${err.message}`);
  emit({ ok: false, error: err.message }, usage ? 2 : 1);
}
