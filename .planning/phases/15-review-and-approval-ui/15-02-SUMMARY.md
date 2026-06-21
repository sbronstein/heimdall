---
phase: 15-review-and-approval-ui
plan: "02"
subsystem: outreach-campaigns
tags: [security, validation, api, drizzle]
dependency_graph:
  requires: []
  provides: [archived-approve-gate, editedBody-length-bound]
  affects:
    - src/app/api/outreach-campaigns/[id]/emails/[emailId]/status/route.ts
    - src/app/api/outreach-campaigns/[id]/emails/[emailId]/route.ts
tech_stack:
  added: []
  patterns: [drizzle-select-with-projection, zod-max-bound]
key_files:
  modified:
    - src/app/api/outreach-campaigns/[id]/emails/[emailId]/status/route.ts
    - src/app/api/outreach-campaigns/[id]/emails/[emailId]/route.ts
decisions:
  - Archived contact check placed after content guard, before db.update — cheapest checks first; archived lookup only fires for approve branch
  - Used a separate single-row SELECT on contacts rather than extending the email lookup with a leftJoin — avoids reshaping the existing email query and keeps the approve branch self-contained
  - editedBody max set to 50000 chars, matching the plan's recommendation; provides a meaningful DoS bound without affecting normal email drafts
metrics:
  duration: "~8 min"
  completed: "2026-06-21"
  tasks_completed: 2
  files_modified: 2
---

# Phase 15 Plan 02: Backend API Hardening — Archived Approve Gate + Body Length Bound Summary

Server-side defense-in-depth for the outreach email approve boundary: rejected archived-contact approvals and bounded untrusted edit payloads at the Zod validation layer.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Server-side archived approve gate | 4a633a8 | status/route.ts |
| 2 | Bound inline-edit body length | 0890f46 | [emailId]/route.ts |

## What Was Built

**Task 1 — Archived approve gate (REV-06, T-15-02):**
Added a server-side check in the PATCH handler's approve branch of `status/route.ts`. After the content guard passes, a single projected SELECT (`{ archivedAt: contacts.archivedAt }`) is issued against the contacts table using the email's `contactId`. If `archivedAt` is non-null, the handler returns `validationError('Cannot approve: contact is archived')` before the `db.update` runs. The contacts table is now imported alongside outreachEmails.

Guard ordering in the approve branch:
1. `canEmailTransition` (state machine — unchanged)
2. Content guard — subject + body present (unchanged)
3. **New:** archived contact check

**Task 2 — editedBody max bound (REV-04, T-15-04):**
Added `.max(50000)` to `editedBody` in `inlineEditSchema` in the inline-edit route. `editedSubject` (max 500) and `recipientEmail` (email()) remain unchanged. Zod rejects oversized payloads with a 400 validationError before any DB query runs.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

No new threat surface introduced. Both changes tighten existing boundaries: the approve route gains an additional guard, the edit route adds a validation constraint.

## Self-Check: PASSED

- [x] `src/app/api/outreach-campaigns/[id]/emails/[emailId]/status/route.ts` — exists and contains `archivedAt`
- [x] `src/app/api/outreach-campaigns/[id]/emails/[emailId]/route.ts` — exists and contains `max(50000)`
- [x] Commit 4a633a8 — Task 1 (archived approve gate)
- [x] Commit 0890f46 — Task 2 (body length bound)
- [x] `npx tsc --noEmit` exit code 0 — no TypeScript errors
