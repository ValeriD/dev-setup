# Ticket 08 revalidation review

Fixed point: `ffdb9b9d133cd97049846eb880fa370ab665fdbf`.
Reviewed commit: `12f55a4`.

Three fresh independent reviewers ran in parallel via `pi -p --model openai-codex/gpt-6-astra --thinking low`. Each received the fixed-point diff command, commit list, standards/spec/design references, read-only instructions and the restriction to Quarterdeck tests only. This review covers the new documentation diff, not a fresh implementation review of the preexisting transport; the original implementation reports remain in [08-independent-review.md](08-independent-review.md).

Reports below are preserved verbatim.

## Standards

No findings.

Reviewed commit `12f55a4` using the specified fixed-point diff against `AGENTS.md`, the issue-tracker conventions, and the full smell baseline.

The change only appends revalidation notes under the ticket’s existing `## Comments` section. It preserves the open status and unchecked blockers, and distinguishes historical test evidence from the reported restricted rerun. No production code or tests changed, so no baseline code smells or test-value concerns apply.

No tests run during this review; no files modified.

**Standards: 0 findings.**

## Design

No findings in `ffdb9b9...HEAD` (`12f55a4`).

The diff only appends ticket 08’s revalidation record. It changes no module responsibilities, dependency direction, interfaces, reuse choices, implementation, or tests.

The record preserves the design’s dummy-token/manual-permissions validation split and explicitly retains the existing `/etc/environment` persistence blocker, pending private-source evidence, and missing launcher prerequisite. It does not claim that a successful test exit satisfies the blocked contract.

Tests were not rerun for this documentation-only review. No files were modified.

**Summary: Design — 0 new findings; previously recorded blockers remain open.**

## Spec

No new findings in `12f55a4` against fixed point `ffdb9b9d133cd97049846eb880fa370ab665fdbf`.

The diff only appends revalidation notes to `.scratch/quarterdeck/issues/08-project-container-receives-a-read-only-extensions-token.md`. It introduces no runtime behavior or scope expansion and does not mark blocked criteria complete.

Existing gaps remain explicitly acknowledged:
- “The value appears in no file” remains violated by `/etc/environment` persistence (SC-19).
- Absent-token private-source startup, real repository permissions, credential exclusion, and launcher behavior remain incomplete or unproven (SC-16/SC-19 as narrowed by ticket 08).

These predate this diff and remain blockers, not new findings. The notes correctly distinguish successful test-process exit from acceptance satisfaction.

Tests were not rerun during this read-only documentation review.

**Spec: 0 new findings; existing acceptance blockers remain open.**

## Dispositions

No new findings require fixes or declines. Original implementation findings and their dispositions remain recorded in the prior review. Persistence remediation and private-source validation remain deferred/open, not waived or claimed complete. No behavior or structure changed after review, so no second review pass is required.

Summary: Standards 0, Design 0, Spec 0 new findings; existing ticket blockers remain open.
