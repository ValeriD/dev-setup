# 10: `status` shows which layer covers secrets and egress

**What to build:** `status` reports secrets and egress domains from every layer (Base, Variant, Project). For each egress domain it says which layer allows it and which entry needs it. "Allow <domain>" then uses that to tell whether a domain is already covered, instead of the agent deciding this from the instructions.

**Blocked by:** 07 (`status`)

**Status:** needs-triage

## Context

Found while building 04:
- `validate` checks only the Project layer's secrets. Base and Variant secrets are warned about only at container start, by `base/mcp/check-secrets.sh`.
- Whether a parent domain or the Base layer already covers a new domain is decided by the agent from SKILL.md, not by a helper command.

## Open questions (for grilling)

- Read the Base and Variant layers from the local checkout, or from the pinned image? A local checkout can disagree with the image the project actually uses.
- Does a parent domain (`example.com`) cover subdomains in our egress model? Check this against how dnsmasq `--nftset` matches before writing the rule.
- Is this one ticket, or should secrets and egress coverage be split?
