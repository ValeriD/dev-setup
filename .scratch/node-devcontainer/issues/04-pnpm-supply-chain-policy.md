# 04: pnpm supply-chain policy enforced from the image

**What to build:** In any Consuming Project, even one with no pnpm config of its own:
- dependency build scripts are blocked unless reviewed;
- versions published less than 7 days ago are refused;
- trust downgrades are refused;
- installs use frozen lockfiles.

A project can explicitly allow a specific dependency's build script. Ad-hoc `npm`/`npx` also gets safe defaults.

**Blocked by:** 02 (Walking skeleton)

**Status:** ready-for-agent

## Technical context

**Design:** `.scratch/node-devcontainer/design.md`. See ADR `docs/adr/0001-pnpm-enforced-in-image.md` and research section 1.8 in `docs/research/secure-node-devcontainer.md`.

- **Modules:** Base material holds the global pnpm config and the npm env defaults (`NPM_CONFIG_IGNORE_SCRIPTS`, min release age, save-exact). The Node Variant installs them at the system or user-config location that pnpm 11+ actually honours globally; verify which keys pnpm reads from global config versus `pnpm-workspace.yaml`.
- **Reuse:** pnpm built-ins: `strictDepBuilds`/`allowBuilds`, `minimumReleaseAge: 10080`, `trustPolicy: no-downgrade`, `blockExoticSubdeps`, frozen lockfile in CI mode or by config. The per-project escape hatch is pnpm's own `allowBuilds`.
- **Must not introduce:** a wrapper around pnpm, Socket Firewall or Aikido Safe Chain, or a lower release age for convenience.
- **Validation seam:** container acceptance, running pnpm in fixture projects.
- **Test registry:** a local registry stub (e.g. Verdaccio) used only by the tests, so publish times and postinstall packages are deterministic. If ticket 03 has landed, the stub must be reachable without widening the Base allowlist, for example on loopback inside the container.
- **Coverage:** SC-07, SC-08.

- [ ] In a fixture project with no pnpm config, installing a dependency with a postinstall script fails with pnpm's build-script error
- [ ] Installing a version published less than 7 days ago is refused
- [ ] An install that would modify the lockfile fails in frozen mode
- [ ] After the project allows one dependency's build, that script runs and other scripts stay blocked
- [ ] `npm install` in the container skips lifecycle scripts by default
