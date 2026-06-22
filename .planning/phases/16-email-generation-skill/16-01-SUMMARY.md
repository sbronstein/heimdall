---
phase: 16-email-generation-skill
plan: "01"
subsystem: outreach-api
tags: [api, state-machine, outreach, email-generation, testing]
dependency_graph:
  requires: [12-api-routes]
  provides: [generation-write-back-guard]
  affects: [outreach-emails, generation-skill-plan-03]
tech_stack:
  added: []
  patterns: [select-guard-update, pglite-route-test, vi-hoisted-proxy]
key_files:
  modified:
    - src/app/api/outreach-campaigns/[id]/emails/[emailId]/generation/route.ts
  created:
    - src/app/api/outreach-campaigns/[id]/emails/[emailId]/generation/route.test.ts
decisions:
  - "SELECT-before-UPDATE pattern mirrors the sibling status/route.ts analog; avoids a blind UPDATE that would silently advance emails already in non-pending states"
  - "status='generated' written in the same UPDATE as content fields — one DB round-trip, no TOCTOU window between content write and status flip"
  - "canEmailTransition imported from @/features/outreach/lib/email-status — transition table is not reimplemented"
metrics:
  duration: 2m
  completed: "2026-06-22T15:18:13Z"
  tasks_completed: 2
  files_changed: 2
---

# Phase 16 Plan 01: Generation Write-Back Guard Summary

**One-liner:** Guarded `/generation` write-back that advances pending emails to `status='generated'` via `canEmailTransition` in a single UPDATE, pinned by a PGlite transition test.

## What Was Built

Closed the D-02 gap in the email generation write-back route. The previous route performed a blind UPDATE that wrote content but left `status='pending'`, meaning generated emails never advanced through the state machine. The ROADMAP success criterion #1 ("running the skill advances all pending emails to generated") required the route to flip status.

**Changes:**

1. **`src/app/api/outreach-campaigns/[id]/emails/[emailId]/generation/route.ts`** — Restructured PATCH handler to follow the SELECT→guard→UPDATE shape of the sibling `status/route.ts`:
   - Added a campaign-scoped SELECT before the UPDATE
   - Returns 404 if email does not belong to the campaign
   - Imports and calls `canEmailTransition(email.status, 'generated')` — returns 400 "Invalid transition" if not allowed (only `pending` is allowed → `generated` per the state machine)
   - Adds `status: 'generated'` to the existing UPDATE set (content + generatedAt + updatedAt) — one UPDATE, one DB call
   - Keeps exactly one `logTimeline` call (`outreach_email_generated`)

2. **`src/app/api/outreach-campaigns/[id]/emails/[emailId]/generation/route.test.ts`** — PGlite route test:
   - Test 1: pending email → 200 with `status='generated'`, non-null `generatedAt`, written subject/body, one timeline event
   - Test 2: approved email → 400 "Invalid transition: approved -> generated", status unchanged, no timeline event
   - Test 3: non-existent emailId → 404

## Verification

- All 3 tests pass: `npx vitest run "generation/route.test.ts"` exits 0
- TypeScript clean: `npx tsc --noEmit` reports zero errors in the edited route
- Route imports (not reimplements) `canEmailTransition` from `@/features/outreach/lib/email-status`

## Threat Model Coverage

| Threat | Mitigation |
|--------|-----------|
| T-16-01: Tampering — unguarded status write | `canEmailTransition(email.status, 'generated')` gate; disallowed source states return 400 |
| T-16-03: Spoofing — wrong campaign scope | SELECT and UPDATE both scoped to `(emailId, campaignId)` |

## Deviations from Plan

None — plan executed exactly as written. The SELECT→guard→UPDATE restructure was the prescribed approach; no deviation was needed.

## Known Stubs

None — all three behaviors are fully implemented and tested.

## Self-Check

- [x] `src/app/api/outreach-campaigns/[id]/emails/[emailId]/generation/route.ts` — exists and modified
- [x] `src/app/api/outreach-campaigns/[id]/emails/[emailId]/generation/route.test.ts` — exists and created
- [x] Task 1 commit `1de7bd2` — exists
- [x] Task 2 commit `aeb9e2b` — exists

## Self-Check: PASSED
