---
phase: 17-gmail-drafting-and-email-discovery-skill
plan: "02"
subsystem: skill-reference-doc
tags: [skill, reference, api-contract, outreach, gmail-drafting]
dependency_graph:
  requires: []
  provides: [draft-outreach-emails REST contract, DISC-01 endpoint docs, DISC-02 endpoint docs, DISC-03 endpoint docs, DRFT-01 endpoint docs, DRFT-04 endpoint docs, DRFT-05 endpoint docs]
  affects: [.claude/skills/draft-outreach-emails/SKILL.md (Plan 17-03)]
tech_stack:
  added: []
  patterns: [sibling-reference mirroring, md-to-html companion, cursor pagination doc]
key_files:
  created:
    - .claude/skills/draft-outreach-emails/references/heimdall-api.md
    - .claude/skills/draft-outreach-emails/references/heimdall-api.html
  modified:
    - _index.html
decisions:
  - "Copy Auth and Response Envelope sections verbatim from sibling reference (generate-outreach-emails) — mechanics are identical"
  - "Expanded Error table transition row to document approved→drafted (legal) vs approved→failed (illegal) explicitly per T-17-06 mitigation"
  - "Added Pitfall 6 warning inline on Endpoint 1 (not a separate section) — most visible at point of use"
  - "Run Protocol recap covers the full discover-then-draft batch flow (not just the draft path) since this reference covers all four consumed endpoints"
metrics:
  duration: "15 minutes"
  completed: "2026-06-22"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 3
---

# Phase 17 Plan 02: draft-outreach-emails REST API Reference Summary

**One-liner:** REST contract for draft-outreach-emails skill covering four endpoints — work-queue read with cursor pagination, recipient write-back (both channel bodies), draft write-back (D-01 state machine), and the status failure path with explicit approved→failed prohibition.

## What Was Built

A single reference document at `.claude/skills/draft-outreach-emails/references/heimdall-api.md` (378 lines) documenting the four REST endpoints the `draft-outreach-emails` skill consumes. Structured to mirror the sibling `generate-outreach-emails/references/heimdall-api.md` section-for-section.

### Sections

1. **Auth** — copied verbatim from sibling: bearer token, `$(cat ~/.heimdall/api-token)` inline pattern, SHA-256 + `SINGLE_USER_EMAIL` gate, never-log rule.
2. **Response Envelope** — copied verbatim: success/error shapes, 200/400/401/404/500 status table.
3. **Endpoints** — four documented:
   - `GET .../emails?status=approved&limit=100` with full cursor pagination loop, `{ email, contact }` field list, work-queue split (discovery vs. drafting queue), re-draft detection via `gmailDraftId`
   - `PATCH .../recipient` with both channel bodies: `{channel:'email', recipientEmail}` for discovered address; `{channel:'linkedin_message'}` for LinkedIn fallback (route nulls recipientEmail server-side)
   - `PATCH .../draft` documenting D-01 post-17-01 behavior: gmailDraftId triggers status=drafted + contact reached_out + timeline; legal pre-state approved only; re-draft idempotency path
   - `PATCH .../status` as failure path only with explicit prohibition notice: "approved → failed is an ILLEGAL TRANSITION" with correct skill action (leave as approved, report in summary)
4. **Error Envelopes the Skill Must Handle** — sibling table adjusted: transition row split into approved→drafted (YES) and approved→failed (NO) with skill action per case
5. **Run Protocol (summary)** — discover-then-draft batch flow recap

### HTML Companion and Index

HTML companion generated via `md-to-html.mjs` at `.claude/skills/draft-outreach-emails/references/heimdall-api.html`. Repo-root `_index.html` regenerated via `build-index.mjs`.

## Acceptance Criteria Results

| Check | Result |
|-------|--------|
| File exists at correct path | PASS |
| ≥ 120 lines (actual: 378) | PASS |
| `grep -c "PATCH"` ≥ 3 (actual: 11) | PASS |
| `status=approved` present | PASS |
| `limit=100` present | PASS |
| `hasMore` present | PASS |
| `cat ~/.heimdall/api-token` present | PASS |
| `approved.*(failed)` documented | PASS |
| `linux_message` present | PASS |
| No literal `Bearer <token>` string | PASS |
| HTML companion exists | PASS |
| `_index.html` regenerated | PASS |

## Deviations from Plan

None — plan executed exactly as written.

The doc structurally mirrors the sibling reference. The only deliberate choices were organizational: the Pitfall 6 pagination warning is placed inline on Endpoint 1 (not a separate section) for maximum visibility; the error table transition row was expanded from the sibling's single-row format to a two-entry split (approved→drafted / approved→failed) per the plan requirement.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. This plan creates documentation only. The T-17-05 threat (literal token in curl examples) was mitigated: all curl examples use `$(cat ~/.heimdall/api-token)` inline. T-17-06 (mis-documented illegal transition) was mitigated: Endpoint 4 has a `CRITICAL` warning block and the error table has an explicit legal/illegal table.

## Known Stubs

None — this is a reference document with no runtime data dependencies.

## Self-Check: PASSED

| File | Status |
|------|--------|
| `.claude/skills/draft-outreach-emails/references/heimdall-api.md` | FOUND |
| `.claude/skills/draft-outreach-emails/references/heimdall-api.html` | FOUND |
| `_index.html` | FOUND |
| `.planning/phases/17-gmail-drafting-and-email-discovery-skill/17-02-SUMMARY.md` | FOUND |
| Commit `2b004cf` | FOUND |
