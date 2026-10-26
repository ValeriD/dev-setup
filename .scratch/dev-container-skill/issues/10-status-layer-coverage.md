# 10: `status` shows which layer covers secrets and egress

**What to build:**
- `status` reports egress domains and Named Secrets from all three layers (Base, Variant, Project). For each, it says which layer declares it and which entry needs it.
- The Base and Variant layers are read from the image the project pins, without running it. When that image isn't local, `status` says the layers are unknown.
- "Allow <domain>" uses this coverage to say when a domain, or a parent domain, is already allowed. When the layers are unknown, it says Base coverage couldn't be checked.

**Blocked by:** 08 (Container-wide Named Secrets); 11 (Per-entry egress for every kind)

**Status:** ready-for-agent

## Technical context

**Design:** `.scratch/manifest-followups/design.md`. Use the "Helper: `status`", "Image layer read" and "SKILL references" rows, and Q10, Q11.

- **Modules:** skill helper `status` (the image layer read and coverage); skill references `status.md` and `egress-and-secrets.md` (the allow flow).
- **Implementation anchors:**
  - the image ships `/opt/dev-setup/manifests/base.json` and `node.json`;
  - `status.mjs` `copyRead` (the `docker cp` pattern);
  - `manifests.mjs` `covers`;
  - `inspect.mjs` `projectContext`, which reads `extensions/base.json` from the checkout today, and should use the image layers once they exist.
- **Reuse:** `docker create` + `docker cp` + `docker rm` on a never-started container; `covers` (a domain covers its subdomains, as dnsmasq does).
- **Dependency direction:** unchanged.
- **Must not introduce:** running or pulling the image; falling back to the local checkout for Base/Variant; printing secret values.
- **Validation seam:** the helper CLI JSON.
- **Coverage:** helper integration against a fixture image built `FROM scratch` with the two manifest files; the "unknown" case with an image that isn't local; checklist rows for "allow" of an already-covered domain.

- [x] `status` lists each egress domain with its layer and needer, across all three layers, read from the pinned image
- [x] `status` lists Base and Variant Named Secrets with whether each is set on the host (names only)
- [x] With the pinned image not present locally, `status` reports the layers as unknown and pulls nothing
- [x] No container is left after the layer read, and the image was never started
- [ ] "Allow" of a subdomain of an allowed domain writes nothing and names the covering layer

## Comments

**Implementation notes (agent, 2026-10-26):**

- The image read is `readImageLayers(image)` in the new `skills/dev-container/scripts/image-layers.mjs`. It runs `docker image inspect` first, then `docker create --pull never --network none`, `docker cp /opt/dev-setup/manifests`, and `docker rm -v` in a `finally`. Every `*.json` other than `base.json` is a Variant layer named after its file. The manifests are checked with `validateManifest`. A missing image, a missing folder or an invalid manifest each give `{ known: false, reason }`. `pinnedImage(project)` reads `image` from devcontainer.json.
- The coverage functions are pure and live in `manifests.mjs`, ready for 09: `egressDeclarations(layers)` (`{domain, layer, neededBy}`), `egressCoverage`, `allowing(declarations, host)` and `secretDeclarations(layers)`. They all use `covers`, which replaces the exact match `status` used before.
- `status` JSON changed:
  - It gains `layers`.
  - `egress` is now `{ domains: [{domain, declaredBy, coveredBy}], check? }`, replacing `topLevel` and `entries`.
  - `env.secrets[]` gains `layer`. A Base or Variant secret has a `note` when it has no `remoteEnv` line.
  - A new `--domain <host>` gives `egress.check` with `{ allowed: true | false | null, allowedBy, note? }`. The allow flow in `egress-and-secrets.md` uses it, so the agent does not do suffix matching itself. `null` means "Base coverage couldn't be checked".
- `inspect --project` (`projectContext`) now takes its Base and Variant domains from the image too, and no longer reads `extensions/base.json` from the checkout. It reports `project.layers`.
- Tests:
  - `status.test.mjs` builds a fixture image `FROM scratch` with a unique tag and removes it in `t.after`. The test checks there is no leftover container (`ps --filter ancestor`), and that `docker events` shows `create` and `destroy` but no `start`.
  - The "unknown" case uses the fake ghcr digest and checks afterwards that the image is still absent.
  - `tests/dev-container-skill.test.mjs` checks the real digest-pinned image: Base and Variant `node` are read, and `api.github.com` is allowed by Base `github.com`.
  - A locally built fixture has no registry digest, so the helper test names it by tag. `validate` reports that, and `status` reads it anyway.
- Box 5 is not ticked. The helper part is verified (`--domain sub.example.org` gives `allowed: true` with Base `example.org`). The conversation part is manual checklist rows E2, E2a and E2b, which have not been run.

**Belongs elsewhere:**

- An image built before `/opt/dev-setup/manifests` existed shows as "unknown" with a reason. There is no fallback, as specified.
