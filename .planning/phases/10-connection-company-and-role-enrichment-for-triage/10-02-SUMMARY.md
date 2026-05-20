---
phase: 10-connection-company-and-role-enrichment-for-triage
plan: "02"
subsystem: api-routes
tags: [rest-api, enrichment, contacts, csv-import, zod, timeline]
dependency_graph:
  requires: [contacts-enrichment-columns, contact-enrichment-status-enum, migration-0010]
  provides: [enrichment-patch-endpoint, enrichment-queue-endpoint, csv-enrichment-seeding]
  affects: [contacts-table, timeline-events, csv-import-route]
tech_stack:
  added: []
  patterns: [drizzle-update-returning, partial-column-select, conditional-enrichment-status]
key_files:
  created:
    - src/app/api/contacts/[id]/enrichment/route.ts
    - src/app/api/contacts/enrichment-queue/route.ts
  modified:
    - src/app/api/contacts/import/route.ts
decisions:
  - "enrichment PATCH merges incoming fields with existing contact values (null-safe ?? pattern) so callers can update one field without clearing the other"
  - "enrichment-queue returns only id/linkedinUrl/firstName/lastName (PII minimisation, T-10-05) — the skill needs nothing else to drive scraping"
  - "import route sets enrichmentStatus='enriched' only when BOTH companyAtConnection and roleAtConnection are non-null from CSV; partial CSV data stays 'unenriched' and enters the sweep queue"
  - "parseLimit used from src/lib/api/filters.ts (reuse) with QUEUE_MAX=50 hard-cap constant"
metrics:
  duration: "~5 min"
  completed: "2026-05-20"
  tasks_completed: 3
  files_modified: 3
---

# Phase 10 Plan 02: Enrichment REST Surface Summary

PATCH write-back endpoint, batch-sweep queue GET endpoint, and CSV import seeding for at-connection company/role fields — the full REST surface the enrichment scrape skill reads from and writes through.

## What Was Built

Three REST endpoints/edits form the complete server-side enrichment surface:

1. **PATCH /api/contacts/[id]/enrichment** — Accepts scraped company/role strings, validates with Zod `.max(300)` caps (T-10-03), merges with existing values, stamps `enrichmentStatus='enriched'`/`enrichedAt`/`updatedAt`, and logs a `contact_enriched` timeline event. The skill never writes to the DB directly — all writes go through this endpoint (CLI parity invariant).

2. **GET /api/contacts/enrichment-queue** — Returns the capped (default 25, max 50), oldest-connection-first list of active contacts still missing at-connection fields and not yet enriched. Returns only `id/linkedinUrl/firstName/lastName` (T-10-05). Backed by `contacts_enrichment_status_idx` from Plan 01 (T-10-06).

3. **CSV import seeding** — The existing import route now seeds `companyAtConnection` and `roleAtConnection` from the CSV `Company`/`Position` columns. Rows where both fields are present are marked `enrichmentStatus='enriched'`, skipping the sweep queue. Rows with partial or missing CSV data stay `unenriched`. The `ON CONFLICT DO NOTHING` block is byte-for-byte unchanged.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Create PATCH /api/contacts/[id]/enrichment | 53da20c | src/app/api/contacts/[id]/enrichment/route.ts |
| 2 | Create GET /api/contacts/enrichment-queue | 734d49a | src/app/api/contacts/enrichment-queue/route.ts |
| 3 | Seed at-connection fields from CSV import | 7483930 | src/app/api/contacts/import/route.ts |

## Verification

- `npx tsc --noEmit` exits 0 across all three files after each task and at final check
- PATCH endpoint: Zod schema with `.max(300).optional().nullable()` on both fields; `enrichmentStatus: 'enriched'`, `enrichedAt`, `updatedAt` set on write; `logTimeline` called with `contact_enriched` + `contactId`; `z.ZodError → validationError / serverError` catch pattern
- Queue endpoint: `isNull(archivedAt)` active filter; `or(isNull(companyAtConnection), isNull(roleAtConnection))` missing-fields filter; `ne(enrichmentStatus, 'enriched')`; `orderBy(asc(linkedinConnectionDate))`; limit hard-capped at 50
- Import route: `Candidate` type has `companyAtConnection`/`roleAtConnection`; `candidates.push` sets both from existing `company`/`position` locals; `.values()` map includes both plus conditional `enrichmentStatus`; `.onConflictDoNothing({ target: contacts.linkedinUrl, where: ... })` unchanged

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints beyond what the plan's `<threat_model>` documents. The three endpoints added (PATCH /enrichment, GET /enrichment-queue) and the CSV import modification are all within the documented trust boundaries. All T-10-03 through T-10-06 mitigations implemented as specified.

## Known Stubs

None.

## Self-Check: PASSED

- `src/app/api/contacts/[id]/enrichment/route.ts` exists and exports `PATCH` — FOUND
- `src/app/api/contacts/enrichment-queue/route.ts` exists and exports `GET` — FOUND
- enrichment route: `enrichmentStatus: 'enriched'`, `enrichedAt: new Date()`, `logTimeline contact_enriched` — FOUND
- queue route: `isNull(contacts.archivedAt)`, `ne(contacts.enrichmentStatus, 'enriched')`, `asc(contacts.linkedinConnectionDate)` — FOUND
- import route: `companyAtConnection` in Candidate type, candidates.push, and .values() map — FOUND
- import route: `enrichmentStatus: (c.companyAtConnection && c.roleAtConnection ? 'enriched' : 'unenriched')` — FOUND
- import route ON CONFLICT block: unchanged `target: contacts.linkedinUrl, where: sql... IS NOT NULL AND ... IS NULL` — FOUND
- Commits 53da20c, 734d49a, 7483930 exist — FOUND
