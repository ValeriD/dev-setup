# 01: Review project configuration trust boundary

Status: done
Type: task

## Review requested

Origin: Quarterdeck ticket 07; blocker commits `6620211` and `1d2908f`.

- Arbitrary `runArgs` can add mounts, forward credentials by name (`--env GH_TOKEN`), or override hardening. The user already approved rejecting unsupported arguments and allowing only validated Template options; retain that decision.
- Retained devcontainer Features can introduce mounts or privileged mode despite restricted `runArgs`. Review the trust policy for project-added Features and their install-time execution.
- Review environment substitutions and retained non-secret `containerEnv` for credential forwarding and configuration injection.

## User direction

The user directed implementation to continue against the existing design, logging security concerns as new human-review tickets instead of repeatedly blocking implementation. Feature trust remains unresolved and must not be described as proven isolation. This is not approval to expose real credentials or weaken the previously approved `runArgs` restriction.

## Acceptance criteria

- [ ] Human decides the Feature and environment-substitution trust policy.
- [ ] Record any accepted residual risks and required implementation changes.
- [ ] Add or identify regression tests for the chosen policy.

## Ticket 07 implementation evidence

`quarterdeck/bin/qd-project-up` now restricts Template arguments and drops GitHub/secret-named environment entries, rejects substitutions in retained `containerEnv`, and runs the CLI with a temporary empty home and a minimal environment. A benign local Feature builds through the proxy in `tests/quarterdeck.test.mjs`. Features remain executable trusted input: metadata can add mounts, capabilities, environment and entrypoints, and install scripts can modify the derived image. Literal secrets under innocuous names and Feature behavior are not proven safe. The clean environment prevents ordinary `${localEnv:GH_TOKEN}` resolution against the parent pane but is not a general Feature sandbox.

Impact: arbitrary retained Features or hardening-related environment overrides can invalidate the exact-mount/egress claims. Review criteria above must define the permitted metadata, transitive dependencies, install-time execution and literal environment policy. See `quarterdeck/PROJECT-CONTAINERS.md`; no real secret or credential probe was used.

## Ticket 08: credential-bearing creation CLI

Evidence: ticket 08 gives the devcontainer CLI `DEV_SETUP_GITHUB_PAT` from `QUARTERDECK_EXTENSIONS_TOKEN` while continuing to retain Features. The earlier clean-environment protection no longer excludes this one credential. Feature options/metadata using `${localEnv:DEV_SETUP_GITHUB_PAT}` may resolve it into build inputs, generated files or logs; trusted runtime code can also read and persist the container-level value. No exploit or real-token probe was run.

Impact: name-only generated `runArgs` does not establish that arbitrary retained project configuration cannot persist/exfiltrate the extensions token. Exact-value error redaction is not a sandbox and cannot suppress transformed values. This is the same configuration/substitution trust concern, not a new permission-policy concern.

Pointers: `quarterdeck/bin/qd-project-up` (creation CLI environment and retained `features`), `quarterdeck/PROJECT-CONTAINERS.md`, ADR 0010, design Project-layer fetch and Credentials. Review criteria: define which retained Feature inputs and substitutions may access the creation environment; validate any approved restrictions with dummy-only tests covering build arguments, metadata and logs. Keep unsupported `runArgs` rejected and do not infer approval to reject all Features.

## Comments

### Resolution — ticket 21 decision 3

[Ticket 21](../../quarterdeck/issues/21-mvp-security-review-decisions.md) explicitly accepts Features and retained configuration only from a Project's user-controlled `main`. Other repositories wait for the custom socket proxy. Unsupported `runArgs` rejection and literal non-secret environment validation remain unchanged. The ordinary/benign-Feature and rejected-argument/substitution fixtures in `tests/quarterdeck.test.mjs` protect that existing behavior, not arbitrary Feature isolation. Spec accepted risk 13 and `quarterdeck/PROJECT-CONTAINERS.md` record the policy. Closed by human risk acceptance; the historical evidence and criteria above are preserved, not claimed experimentally disproven.
