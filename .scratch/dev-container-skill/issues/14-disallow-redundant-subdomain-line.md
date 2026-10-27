# 14: Disallow removes a redundant subdomain line

**What to build:** When the project's own egress lists both `example.com` and `api.example.com`, "disallow `api.example.com`" removes the redundant line instead of refusing. It says `api.example.com` stays reachable through `example.com`. A domain the Base or Variant layer or an entry still needs is still refused, naming the needer.

**Blocked by:** None (09 is done)

**Status:** ready-for-agent

## Technical context

**Design:** `.scratch/manifest-followups/design.md`, "Second follow-up decisions" E2.

- **Modules:** the skill helper's `plan-disallow`; skill reference `egress-and-secrets.md` ("Disallow a domain" wording for the redundant case).
- **Implementation anchors:** `commands.mjs` `plan-disallow`, which today refuses when any parent domain allows the host, including the project's own top-level parent; `manifests.mjs` `allowing`.
- **Reuse:** the existing declarations and coverage from 10.
- **Must not introduce:** a change to what is reachable; removing a line that a Base or Variant layer or an entry still needs.
- **Validation seam:** the helper CLI JSON.
- **Coverage:** helper integration, extending the `plan-disallow` test in `scripts/test/status.test.mjs`; checklist row for disallowing a redundant line.

- [ ] A subdomain line covered only by another project top-level line is removed, with a note naming the covering domain
- [ ] A subdomain covered by a Base or Variant domain, or by an entry's `egress`, is still refused, naming the needer
- [ ] After the plan is applied, `status --domain` shows the subdomain still allowed by the parent
