# 14: Disallow removes a redundant subdomain line

**What to build:** When the project's own egress lists both `example.com` and `api.example.com`, "disallow `api.example.com`" removes the redundant line instead of refusing. It says `api.example.com` stays reachable through `example.com`. A domain the Base or Variant layer or an entry still needs is still refused, naming the needer.

**Blocked by:** None (09 is done)

**Status:** done

## Technical context

**Design:** `.scratch/manifest-followups/design.md`, "Second follow-up decisions" E2.

- **Modules:** the skill helper's `plan-disallow`; skill reference `egress-and-secrets.md` ("Disallow a domain" wording for the redundant case).
- **Implementation anchors:** `commands.mjs` `plan-disallow`, which today refuses when any parent domain allows the host, including the project's own top-level parent; `manifests.mjs` `allowing`.
- **Reuse:** the existing declarations and coverage from 10.
- **Must not introduce:** a change to what is reachable; removing a line that a Base or Variant layer or an entry still needs.
- **Validation seam:** the helper CLI JSON.
- **Coverage:** helper integration, extending the `plan-disallow` test in `scripts/test/status.test.mjs`; checklist row for disallowing a redundant line.

- [x] A subdomain line covered only by another project top-level line is removed, with a note naming the covering domain
- [x] A subdomain covered by a Base or Variant domain, or by an entry's `egress`, is still refused, naming the needer
- [x] After the plan is applied, `status --domain` shows the subdomain still allowed by the parent

## Comments

- `plan-disallow` now ignores project top-level parent domains when refusing; they come back as `coveredBy` plus `coveredNote` on the `ok: true` plan (separate from the existing `note`, which is about unknown layers). A parent on an entry, Base or Variant still refuses.
- The old test case refusing `img.shop.example.io` under a project parent was replaced by an entry-parent refusal (`sub.cdn.example.com`) and a new redundant-line case.
- Checklist row added as E9b to avoid renumbering later rows.
