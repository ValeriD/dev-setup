# pnpm, with safety settings enforced from the image

The threat model assumes anything that runs inside the container can read everything in it, including Agent logins, so a malicious install script is the main risk. We use pnpm 11+ and enforce its policy from user-level config baked into the image (build scripts blocked unless reviewed, 7-day `minimumReleaseAge`, `trustPolicy: no-downgrade`, frozen lockfiles), so a Consuming Project is protected even when its own config says nothing. npm 12 can be hardened to a similar level, but only by opting in (`strict-allow-scripts`, `min-release-age`), and Node 24 still bundles npm 11; pnpm fails closed by default.

## Considered Options

- npm 12 with hardened `.npmrc`: rejected because every protection is opt-in and the bundled npm must be overridden.
- Socket Firewall / Aikido Safe Chain as the primary control: kept as optional extra layers, not the foundation.
