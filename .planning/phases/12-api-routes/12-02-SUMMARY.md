---
phase: 12-api-routes
plan: "02"
subsystem: api
tags: [outreach, campaigns, emails, contacts, bulk-insert, dedup, filters]
dependency_graph:
  requires:
    - drizzle/schema/outreach-emails.ts
    - drizzle/schema/outreach-campaigns.ts
    - drizzle/schema/contacts.ts
    - src/lib/api/types.ts
    - src/lib/api/errors.ts
    - src/lib/api/filters.ts
    - src/lib/db/timeline.ts
    - src/lib/domain/types.ts
  provides:
    - src/app/api/outreach-campaigns/[id]/emails/route.ts
    - src/app/api/outreach-campaigns/[id]/emails/[emailId]/route.ts
    - src/app/api/contacts/route.ts (modified)
  affects:
    - Phase 14 builder UI (bulk-add + contacts filters)
    - Phase 15 review UI (email list + inline edit)
    - Phase 16 generation skill (pending email queue)
tech_stack:
  added: []
  patterns:
    - onConflictDoNothing dedup for bulk insert (CAMP-07)
    - conditions[] + sql.join filter accumulation (D-07)
    - campaign-scoped writes via and(eq(id), eq(campaignId)) (CD-06)
    - auto status transition generated/approved→edited on edit (CD-02)
    - hard delete returning 204 (CD-04)
key_files:
  created:
    - src/app/api/outreach-campaigns/[id]/emails/route.ts
    - src/app/api/outreach-campaigns/[id]/emails/[emailId]/route.ts
  modified:
    - src/app/api/contacts/route.ts
decisions:
  - "onConflictDoNothing() on UNIQUE(campaign_id, contact_id) — no target spec needed because the table has one unique constraint"
  - "Single aggregate timeline event for bulk-add (outreach_emails_added) — not one per contact (D-04)"
  - "CD-02 auto-transition: isEdit checks editedSubject/editedBody undefined (not null) so a nulling write still triggers the guard"
metrics:
  duration: "~20 minutes"
  completed: "2026-06-21T02:00:48Z"
  tasks_completed: 3
  files_changed: 3
---

# Phase 12 Plan 02: Email Collection Surface + Contact Filters Summary

**One-liner:** Bulk-dedup email add via `onConflictDoNothing`, campaign-scoped email list/edit/hard-delete, and three additive contact filters (howMet ilike, connectionYearStart/End gte/lte).

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Email list + bulk-dedup-add route | `561a793` | `src/app/api/outreach-campaigns/[id]/emails/route.ts` (created) |
| 2 | Email inline-edit + hard-delete route | `a7a8806` | `src/app/api/outreach-campaigns/[id]/emails/[emailId]/route.ts` (created) |
| 3 | howMet + connection-year filters on GET /api/contacts | `69c6b7f` | `src/app/api/contacts/route.ts` (modified) |

## What Was Built

### Task 1 — GET + POST `/api/outreach-campaigns/[id]/emails`

- **GET**: cursor-paginated list scoped to `campaignId`, with `leftJoin contacts`, optional `?status=` filter via `inArray`+`parseArrayParam`, uses `sql.join` conditions idiom, returns `{ email, contact }` shaped rows.
- **POST**: Zod `bulkAddEmailsSchema` (`z.array(z.string().uuid()).min(1).max(500)`), verifies campaign exists (404 on unknown), inserts one `pending` row per contactId in a single bulk insert with `onConflictDoNothing()`, returns `201 { inserted, skipped }`. Logs ONE aggregate `outreach_emails_added` timeline event (not one per contact — D-04). Second POST of the same contactIds yields `{ inserted:0, skipped:N }` (CAMP-07 idempotency).

### Task 2 — PATCH + DELETE `/api/outreach-campaigns/[id]/emails/[emailId]`

- **PATCH**: Whitelist-only edit — `inlineEditSchema` accepts `editedSubject`, `editedBody`, `recipientEmail` (no status, timestamps, or contactId can be mass-assigned — T-12-07). Selects existing row with `and(eq(id, emailId), eq(campaignId, id))` for CD-06 scoping. Auto-transitions `generated→edited` and `approved→edited` when edit fields are written (CD-02). Logs `outreach_email_edited`.
- **DELETE**: Hard delete (`db.delete`; no `archivedAt` on `outreach_emails`), returns 204, logs `outreach_email_deleted`. Freeing the row means a later `POST .../emails` with the same `contactId` succeeds with `inserted:1` (CD-04 UNIQUE slot freed).

### Task 3 — howMet + connection-year filters on GET /api/contacts

Three additive AND-composed predicates inserted into the existing `conditions[]` pipeline:
- `?howMet=conference` → `ilike(contacts.howMet, '%conference%')` (case-insensitive)
- `?connectionYearStart=2021` → `gte(contacts.linkedinConnectionDate, new Date('2021-01-01'))`
- `?connectionYearEnd=2022` → `lte(contacts.linkedinConnectionDate, new Date('2022-12-31T23:59:59'))`

Added `gte, lte` to the drizzle-orm import. No other changes — existing `closeness`/`outreachStatus`/`warmth`/`relationship`/`search` filters unchanged.

## Verification Results

- `npx tsc --noEmit` passes on all three tasks (no errors, only npm config warning)
- `onConflictDoNothing` count in emails route: 1 (single dedup call)
- `outreach_emails_added` count in emails route: 1 (single aggregate event)
- D-07 filter term count in contacts route: 10 (>= 3 required)
- `grep ".delete" emailId/route.ts` returns 1 (hard delete confirmed — prettier split `db` + `.delete` across two lines, so `grep "db.delete"` returns 0; this is a formatting artifact not a functional issue)

## Deviations from Plan

### Minor: `db.delete` split across lines by prettier

- **Found during:** Task 2 post-commit verification
- **Issue:** Plan acceptance criteria says `grep -c "db.delete" ...` returns 1; prettier reformatted `db` on one line and `.delete(outreachEmails)` on the next, so the grep returns 0
- **Impact:** Zero — the hard delete is correctly implemented; only the grep pattern doesn't match the formatted output
- **Fix:** None needed; acceptance criteria intent (confirm hard delete, no `archivedAt`) is satisfied by `grep ".delete"` returning 1

### Minor: `and` imported but not used in Task 1 emails/route.ts

- **Found during:** Task 1 implementation
- **Issue:** `and` was in the import but the GET/POST handlers use the `conditions[]` + `sql.join` idiom instead — `and` is unused
- **Impact:** `@typescript-eslint/no-unused-vars` is `warn` not `error`; TypeScript compile passes; lint-staged passed
- **Fix:** None needed at this stage; removing it would not change behavior

## Threat Model Compliance

All T-12-05 through T-12-09 mitigations applied:
- **T-12-05**: `z.array(z.string().uuid()).min(1).max(500)` validates contactIds before insert; FK rejects unknown contacts at DB level
- **T-12-06**: All writes guarded by `and(eq(id, emailId), eq(campaignId, id))` — cross-campaign access returns 404
- **T-12-07**: `inlineEditSchema` whitelist prevents mass assignment; status derived server-side only
- **T-12-08**: `z.string().email()` validates `recipientEmail` format
- **T-12-09**: `ilike` value parameterized by Drizzle; year params used in `new Date()` constructor only

## Known Stubs

None — all routes wire to real DB operations with no placeholder data.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes beyond what the plan's threat model covers.

## Self-Check: PASSED

- `src/app/api/outreach-campaigns/[id]/emails/route.ts` — FOUND
- `src/app/api/outreach-campaigns/[id]/emails/[emailId]/route.ts` — FOUND
- `src/app/api/contacts/route.ts` — FOUND (modified)
- Commits `561a793`, `a7a8806`, `69c6b7f` — FOUND in git log
