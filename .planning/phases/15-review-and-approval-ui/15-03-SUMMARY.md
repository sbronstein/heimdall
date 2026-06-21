---
phase: 15-review-and-approval-ui
plan: "03"
subsystem: outreach
tags: [review-ui, email, client-component, optimistic-state]
dependency_graph:
  requires:
    - src/features/outreach/components/email-review-card.tsx (15-01)
    - src/features/outreach/lib/review-helpers.ts (15-01)
  provides:
    - src/features/outreach/components/campaign-review-page.tsx
  affects:
    - src/app/dashboard/outreach/[id]/page.tsx (RSC consumer — props shape unchanged)
tech_stack:
  added: []
  patterns:
    - useState local state seeded from RSC props (optimistic per-card updates)
    - useCallback for stable onEmailUpdated identity
    - Row-keyed state update pattern (match on updated.id)
key_files:
  created: []
  modified:
    - src/features/outreach/components/campaign-review-page.tsx
decisions:
  - Held rows in local state as array of { email, contact } — same shape as the RSC props — so contact display is preserved on update without extra fetches
  - onEmailUpdated replaces only the email field in the matching row (contact is immutable from the RSC load); matches T-15-07 mitigation: state mirrors server-returned value only
  - Per-status Badge summary retained alongside the approved/total progress line so at-a-glance status breakdown is preserved
metrics:
  duration: "~5 minutes"
  completed: "2026-06-21"
  tasks_completed: 1
  files_created: 0
  files_modified: 1
---

# Phase 15 Plan 03: CampaignReviewPage Container Summary

**One-liner:** Replaced the Phase 14 placeholder with a `'use client'` container that holds email rows in local state, renders one `EmailReviewCard` per row, and updates an approved/total progress header optimistically after each card action.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Client CampaignReviewPage with progress header + EmailReviewCard list | 2aba3fd | src/features/outreach/components/campaign-review-page.tsx |

## What Was Built

`src/features/outreach/components/campaign-review-page.tsx` is now a `'use client'` component that:

- **Local state:** `useState<{ email: OutreachEmail; contact: Contact | null }[]>` seeded from `initialEmails` prop. The RSC page (`page.tsx`) is unchanged — it still passes `campaign` and `emails` in the same shape.
- **`onEmailUpdated` callback:** `useCallback` that maps over rows and replaces the matching row's `email` field when `row.email.id === updated.id`. The contact field is kept as-is (immutable from RSC load). This ensures the header recomputes from the server-returned authoritative row (T-15-07 mitigation).
- **Header (REV-06):** Campaign name + `goalInstruction`, a progress line `{approved} / {total} approved` using `approvedCount` over the live rows, and per-status Badge summary carried forward from the placeholder.
- **Email list (REV-01):** `rows.map(row => <EmailReviewCard campaignId={campaign.id} email={row.email} contact={row.contact} onEmailUpdated={onEmailUpdated} />)` — one card per email, stable `key={row.email.id}`.
- **Empty state:** Preserved exactly as in the placeholder — a centered Card with "No contacts have been added to this campaign yet."

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — component wires to live `EmailReviewCard` which calls Phase 12 REST routes. No hardcoded empty values flow to rendering.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The container performs no fetch of its own — all mutations are delegated to `EmailReviewCard`. T-15-07 (optimistic state diverging from server) is addressed: `onEmailUpdated` stores only the server-returned `OutreachEmail` value, never a client-fabricated object.

## Self-Check: PASSED

- `src/features/outreach/components/campaign-review-page.tsx` found on disk ✓
- Commit `2aba3fd` verified in git log ✓
- `npx tsc --noEmit` reports no errors in campaign-review-page.tsx or the RSC page ✓
