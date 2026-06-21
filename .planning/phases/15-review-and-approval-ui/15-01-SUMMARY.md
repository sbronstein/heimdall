---
phase: 15-review-and-approval-ui
plan: "01"
subsystem: outreach
tags: [review-ui, email, tdd, pure-helpers, components]
dependency_graph:
  requires: []
  provides:
    - src/features/outreach/lib/review-helpers.ts
    - src/features/outreach/components/email-review-card.tsx
  affects:
    - src/features/outreach/components/campaign-review-page.tsx (Wave 2 consumer)
tech_stack:
  added: []
  patterns:
    - TDD (RED/GREEN) for pure helper module
    - isSaving in-flight guard pattern
    - canEmailTransition reuse from email-status module
key_files:
  created:
    - src/features/outreach/lib/review-helpers.ts
    - src/features/outreach/lib/review-helpers.test.ts
    - src/features/outreach/components/email-review-card.tsx
  modified: []
decisions:
  - Used window.confirm for regenerate confirmation (simpler than AlertDialog; no extra state management needed)
  - hasContent requires both finalSubject AND finalBody non-empty (matching server-side guard at status/route.ts)
  - approvedCount tallies 'drafted' as well as 'approved' (drafted implies previously approved + Gmail draft created)
  - Edit button disabled when email is pending (no content to edit yet)
metrics:
  duration: "~15 minutes"
  completed: "2026-06-21"
  tasks_completed: 2
  files_created: 3
  files_modified: 0
---

# Phase 15 Plan 01: Pure Review Helpers + EmailReviewCard Summary

**One-liner:** Vitest-covered pure helper module (finalSubject/finalBody/canApproveEmail/needsLinkedinMessage/approvedCount) and an interactive `EmailReviewCard` component driving edit/approve/regenerate via existing Phase 12 REST routes.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing Vitest for review helpers | d48b3c9 | src/features/outreach/lib/review-helpers.test.ts |
| 1 (GREEN) | Pure review helpers implementation | 78c0cb0 | src/features/outreach/lib/review-helpers.ts |
| 2 | EmailReviewCard component | 1695a3f | src/features/outreach/components/email-review-card.tsx |

## What Was Built

### Task 1: Pure Review Helpers (TDD)

`src/features/outreach/lib/review-helpers.ts` exports:

- `finalSubject(email)` — `editedSubject ?? generatedSubject ?? null`
- `finalBody(email)` — `editedBody ?? generatedBody ?? null`
- `hasContent(email)` — true only when both finalSubject and finalBody are non-empty
- `needsLinkedinMessage(email, contact)` — true for `linkedin_message` channel OR no recipient/contact email
- `isArchived(contact)` — true when `contact.archivedAt != null`
- `canApproveEmail(email, contact)` — NOT archived AND hasContent AND `canEmailTransition(status, 'approved')`
- `canRegenerate(email)` — `canEmailTransition(email.status, 'pending')`
- `approvedCount(emails)` — count of approved + drafted emails

All functions import `canEmailTransition` from `@/features/outreach/lib/email-status` — the transition table is not duplicated.

27 Vitest tests cover all key behaviors including edge cases (archived gate, no-content gate, status gates, all needsLinkedinMessage trigger combinations).

### Task 2: EmailReviewCard

`src/features/outreach/components/email-review-card.tsx` (`'use client'`) renders per-email cards with:

- Contact name + company (or italic "Contact removed" when contact is null)
- Status badge + "needs LinkedIn message" (secondary) and "archived" (destructive) contextual badges
- Pending emails with no content show "Awaiting generation" placeholder (REV-01 downstream awareness)
- **Edit mode:** inline subject/body fields seeded from finalSubject/finalBody; Save issues `PATCH /api/outreach-campaigns/${id}/emails/${emailId}` with `editedSubject`/`editedBody`; `isSaving` in-flight guard; toast on error
- **Approve:** disabled via `canApproveEmail(email, contact)` (archives the UX gate); PATCH to `/status` with `{ status: 'approved' }`
- **Regenerate:** disabled via `canRegenerate(email)`; guarded by `window.confirm` warning of edit-clearing D-05 reset; PATCH to `/status` with `{ status: 'pending' }`
- All mutations call `onEmailUpdated(data)` callback on success

## TDD Gate Compliance

- RED commit: `d48b3c9` — `test(15-01):`
- GREEN commit: `78c0cb0` — `feat(15-01):`
- REFACTOR: not required (implementation was clean)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all card actions wire to live Phase 12 REST routes. No placeholder data or hardcoded empty values that flow to UI rendering.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. The card issues fetch() calls to existing Phase 12 routes already protected by Clerk middleware. The disabled Approve button is a UX-layer gate only; the authoritative server guard lives in the status route (Phase 12).

T-15-02 (Approve on archived contact) is addressed at the UX layer by this plan; the server-side archived gate is deferred to Phase 15-02 as documented in the threat register.

## Self-Check: PASSED

All 3 files found on disk. All 3 task commits verified in git log.
