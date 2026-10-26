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

- [ ] `status` lists each egress domain with its layer and needer, across all three layers, read from the pinned image
- [ ] `status` lists Base and Variant Named Secrets with whether each is set on the host (names only)
- [ ] With the pinned image not present locally, `status` reports the layers as unknown and pulls nothing
- [ ] No container is left after the layer read, and the image was never started
- [ ] "Allow" of a subdomain of an allowed domain writes nothing and names the covering layer
