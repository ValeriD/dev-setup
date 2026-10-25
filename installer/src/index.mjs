// Library entry point. The CLI (cli.mjs) and the host-side skill helper both import from here.
export { schema, AGENTS, CAPABILITIES, ManifestError, describeEntry, checkPinnedRef, checkKindAgent, validateManifest, assertValidManifest } from './validate.mjs';
export { DEFAULT_GIT_BASE, repoUrl, fetchBySha, copyTree, pathInCheckout } from './fetch.mjs';
export { SYSTEM_PATHS, loadManifest, skillName, mergeLayers, renderAllowlist, installSkills, installBuild, installStart } from './install.mjs';
export { installClaude } from './claude.mjs';
