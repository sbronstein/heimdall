---
phase: 12-api-routes
plan: "03"
subsystem: outreach-emails-api
tags: [api-routes, state-machine, outreach, email-lifecycle, write-backs]
dependency_graph:
  requires:
    - "Phase 11: outreach-emails schema (drizzle/schema/outreach-emails.ts)"
    - "Phase 11: canEmailTransition (src/features/outreach/lib/email-status.ts)"
    - "Phase 11: outreachEmailStatusValues, outreachChannelValues (src/lib/domain/types.ts)"
  provides:
    - "PATCH /api/outreach-campaigns/[id]/emails/[emailId]/status — state-machine-guarded transition (phase criterion 4)"
    - "PATCH /api/outreach-campaigns/[id]/emails/[emailId]/recipient — discovery write-back (GEN-05)"
    - "PATCH /api/outreach-campaigns/[id]/emails/[emailId]/draft — draft write-back (GEN-05)"
  affects:
    - "Phase 17 skills (generation, discovery, drafting): consume all three PATCH endpoints"
tech_stack:
  added: []
  patterns:
    - "State-machine guard via canEmailTransition() before any status DB write"
    - "CD-03 approve guard: rejects → approved when editedX ?? generatedX is null"
    - "D-05 regenerate reset: pending clears edited*/lastError*/generatedAt, keeps generated*"
    - "CD-06 campaign scope: all writes use and(eq(id, emailId), eq(campaignId, id))"
    - "D-03/D-04 timeline logging: distinct eventType per route"
    - "8-level relative import for drizzle/schema (../../../../../../../../drizzle/schema)"
key_files:
  created:
    - src/app/api/outreach-campaigns/[id]/emails/[emailId]/status/route.ts
    - src/app/api/outreach-campaigns/[id]/emails/[emailId]/recipient/route.ts
    - src/app/api/outreach-campaigns/[id]/emails/[emailId]/draft/route.ts
  modified: []
decisions:
  - "Variable named emailBody (not body) inside the CD-03 approve guard to avoid shadowing the outer body = request.json() assignment"
  - "status route selects the full row before updating (not update-and-check) to enable the canEmailTransition() guard and CD-03 content check before any write"
  - "All three routes return the full updated row from .returning() rather than a projection — consistent with the existing codebase pattern"
metrics:
  duration: "~10 minutes"
  completed: "2026-06-20"
  tasks_completed: 3
  files_created: 3
  files_modified: 0
---

# Phase 12 Plan 03: Email Status Lifecycle and Skill Write-Back Routes Summary

**One-liner:** Three PATCH routes delivering state-machine-guarded email transitions (CD-03 approve guard + D-05 regenerate reset) and two campaign-scoped skill write-backs for recipient discovery and Gmail draft linkage.

## What Was Built

### Task 1: Status transition route (cc12ef6)

`src/app/api/outreach-campaigns/[id]/emails/[emailId]/status/route.ts`

The only transition-guarded write in the outreach system. Enforces:

- **`canEmailTransition(from, to)`** — any move not in the valid transition graph returns `400 "Invalid transition: <from> -> <to>"` (phase criterion 4)
- **CD-03 approve guard** — when `newStatus === 'approved'`, checks `editedSubject ?? generatedSubject` and `editedBody ?? generatedBody`; if either is null/empty, returns `400 "Cannot approve: email has no content"` before the DB write
- **D-05 regenerate reset** — when `newStatus === 'pending'`: clears `editedSubject`, `editedBody`, `lastError`, `lastErrorAt`, `generatedAt`; intentionally keeps `generatedSubject`/`generatedBody` (shown greyed-out in UI)
- **Side-effect stamps** — `approvedAt: new Date()` on `→ approved`; `lastError + lastErrorAt` on `→ failed`
- **CD-06 campaign scope** — `and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id))` on both the SELECT and UPDATE; 404 if no row matches
- **Timeline log** — `outreach_email_status_changed` with `{ from, to, campaignId, emailId }` per D-03/D-04

### Task 2: Recipient write-back route (abdc06c)

`src/app/api/outreach-campaigns/[id]/emails/[emailId]/recipient/route.ts`

Discovery skill write-back (Phase 17, GEN-05). No state-machine check. Writes channel + recipientEmail:

- **D-08 linkedin_message rule** — `channel === 'linkedin_message'` forces `recipientEmail = null` server-side, regardless of body; client cannot smuggle an address
- **CD-06 campaign scope** — update scoped by both `emailId` and `campaignId`; 404 if email not in campaign
- **Timeline log** — `outreach_email_recipient_set` with `{ channel, campaignId, emailId }` per D-03/D-04

### Task 3: Draft write-back route (702f5ad)

`src/app/api/outreach-campaigns/[id]/emails/[emailId]/draft/route.ts`

Drafting skill write-back (Phase 17, GEN-05). Writes `gmailDraftId + draftedAt` without touching status (drafting skill calls `/status` separately to move `→ drafted`):

- **CD-06 campaign scope** — update scoped by both `emailId` and `campaignId`; 404 if email not in campaign
- **Timeline log** — `outreach_email_drafted` with `{ gmailDraftId, campaignId, emailId }` per D-03/D-04

## Deviations from Plan

None — plan executed exactly as written. The variable naming choice (`emailBody` instead of `body` in CD-03 guard) was to avoid variable shadowing but follows naturally from the plan's instruction to "compute subject = ... and body = ..."; this is logged as a decision, not a deviation.

## Known Stubs

None. All three routes are fully wired to the database. No hardcoded values or placeholder responses.

## Threat Surface Scan

No new trust boundaries beyond what the plan's threat model captures:

- All three routes sit behind `src/proxy.ts` Clerk auth (no change)
- T-12-10 mitigated: `canEmailTransition()` called before every status write
- T-12-11 mitigated: CD-03 guard rejects approve on empty content
- T-12-12 mitigated: CD-06 campaign scope on all three routes
- T-12-13 mitigated: `z.enum(outreachEmailStatusValues)` / `z.enum(outreachChannelValues)` / `z.string().min(1)` on gmailDraftId
- T-12-14 mitigated: server forces `recipientEmail = null` when `channel = 'linkedin_message'`

## Self-Check

### Files exist

- `src/app/api/outreach-campaigns/[id]/emails/[emailId]/status/route.ts` — FOUND
- `src/app/api/outreach-campaigns/[id]/emails/[emailId]/recipient/route.ts` — FOUND
- `src/app/api/outreach-campaigns/[id]/emails/[emailId]/draft/route.ts` — FOUND

### Commits exist

- cc12ef6: feat(12-03): add state-machine-guarded email status route — FOUND
- abdc06c: feat(12-03): add recipient write-back route (discovery skill) — FOUND
- 702f5ad: feat(12-03): add draft write-back route (drafting skill) — FOUND

### TypeScript

`npx tsc --noEmit` — PASSED (no errors, all three tasks)

## Self-Check: PASSED
