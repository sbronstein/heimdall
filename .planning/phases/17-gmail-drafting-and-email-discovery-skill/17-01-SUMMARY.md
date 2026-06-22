---
phase: 17-gmail-drafting-and-email-discovery-skill
plan: "01"
subsystem: outreach-api
tags: [route-fix, state-machine, drizzle, timeline]
dependency_graph:
  requires: []
  provides: [D-01-draft-write-back]
  affects: [outreach-emails, contacts, timeline-events]
tech_stack:
  added: []
  patterns: [pre-read-guard-update, sequential-two-table-update, canEmailTransition]
key_files:
  created:
    - scripts/verify-draft-route.sh
  modified:
    - src/app/api/outreach-campaigns/[id]/emails/[emailId]/draft/route.ts
decisions:
  - "Sequential awaits (no transaction) — consistent with Neon HTTP driver pattern used throughout existing routes"
  - "contactId sourced from pre-read row, never request body — closes T-17-02 tampering threat"
  - "status hardcoded to 'drafted' in the UPDATE — no Zod enum needed for the /draft endpoint"
metrics:
  duration: "~12 minutes"
  completed: "2026-06-22"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 17 Plan 01: D-01 Draft Route Fix Summary

**One-liner:** Atomic draft write-back on `/draft` route — adds `canEmailTransition` guard, status transition to `'drafted'`, contact `outreachStatus='reached_out'`, and `contactId` in timeline event, all in one PATCH request.

## What Was Built

The `/draft` route previously did a blind UPDATE that set only `gmailDraftId` + `draftedAt` — it never verified the email's current state, never transitioned status, and never touched the contact. This was the D-01 gap (the direct parallel of Phase 16's D-02 fix).

The route now follows the same pre-read → guard → update shape as the `/status` analog:

1. **Pre-read SELECT** — fetches the email row (scoped by `emailId` + `campaignId`) to get `status` and `contactId` before any write
2. **State-machine guard** — `canEmailTransition(email.status, 'drafted')` returns false for any pre-state other than `approved`; the route returns 400 `Invalid transition: <status> -> drafted` with no DB writes
3. **Email UPDATE** — sets `gmailDraftId`, `status: 'drafted'`, `draftedAt`, `updatedAt`
4. **Contact UPDATE** — sets `outreachStatus: 'reached_out'`, `updatedAt` using `email.contactId` from the pre-read row (never from the request body — T-17-02 mitigation)
5. **Timeline event** — preserves existing `outreach_email_drafted` event type, adds `contactId`

A re-runnable regression script (`scripts/verify-draft-route.sh`) proves the guard behavior against a live dev server without hardcoding any bearer token.

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Apply D-01 edit to /draft route | a8fc89d |
| 2 | Add D-01 state-machine regression script | 950f37c |

## Deviations from Plan

None — plan executed exactly as written. Prettier reformatted the import block from single-line to multi-line during pre-commit hook, but no logic changed.

## Known Stubs

None.

## Threat Flags

None. All four threats in the plan's STRIDE register (T-17-01 through T-17-04 + T-17-SC) are mitigated by the changes above. No new security surface was introduced.

## Self-Check: PASSED

- `src/app/api/outreach-campaigns/[id]/emails/[emailId]/draft/route.ts` — modified, exists
- `scripts/verify-draft-route.sh` — created, exists
- `a8fc89d` — confirmed in git log
- `950f37c` — confirmed in git log
