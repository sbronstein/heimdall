---
phase: 10-connection-company-and-role-enrichment-for-triage
plan: "01"
subsystem: database-schema
tags: [drizzle, schema, postgres, migrations, contacts, enrichment]
dependency_graph:
  requires: []
  provides: [contacts-enrichment-columns, contact-enrichment-status-enum, migration-0010]
  affects: [contacts-table, drizzle-schema, domain-types]
tech_stack:
  added: []
  patterns: [drizzle-enum-column, partial-index, const-value-array]
key_files:
  created:
    - drizzle/migrations/0010_acoustic_sprite.sql
    - drizzle/migrations/meta/0010_snapshot.json
  modified:
    - drizzle/schema/enums.ts
    - drizzle/schema/contacts.ts
    - src/lib/domain/types.ts
    - src/features/job-leads/lib/prioritization.test.ts
decisions:
  - "New columns placed in Import tracking group in contacts.ts — logically grouped with LinkedIn connection date as all relate to connection-time data capture"
  - "enrichmentStatus + enrichedAt placed in separate Enrichment tracking section to separate concerns from import tracking vs enrichment lifecycle"
  - "contactEnrichmentStatusValues const array exported alongside ContactEnrichmentStatus type — matches existing pattern for all domain enum arrays"
metrics:
  duration: "~2 min"
  completed: "2026-05-20"
  tasks_completed: 2
  files_modified: 5
---

# Phase 10 Plan 01: Enrichment Schema Columns Summary

Added dedicated `companyAtConnection`/`roleAtConnection` columns plus `enrichmentStatus` enum and `enrichedAt` timestamp to the `contacts` table, with a sweep-supporting index and a generated Drizzle migration.

## What Was Built

The `contacts` table now has four new columns capturing company/role context at time of LinkedIn connection and tracking enrichment lifecycle state. A btree index on `enrichmentStatus` supports the batch-sweep query pattern for selecting unenriched active contacts. The `contactEnrichmentStatusValues` const array and `ContactEnrichmentStatus` type are exported for downstream Zod reuse in the enrichment PATCH route (Plan 02).

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Add enrichment enum + at-connection columns + sweep index | 16b2a0e | drizzle/schema/enums.ts, drizzle/schema/contacts.ts, src/lib/domain/types.ts |
| 2 | Generate Drizzle migration 0010 | bdd48b5 | drizzle/migrations/0010_acoustic_sprite.sql |

## Verification

- `npx tsc --noEmit` exits 0 after all schema and type changes
- Migration `0010_acoustic_sprite.sql` contains:
  - `CREATE TYPE "public"."contact_enrichment_status" AS ENUM('unenriched', 'pending', 'enriched', 'failed')`
  - `ALTER TABLE "contacts" ADD COLUMN "company_at_connection" text`
  - `ALTER TABLE "contacts" ADD COLUMN "role_at_connection" text`
  - `ALTER TABLE "contacts" ADD COLUMN "enrichment_status" "contact_enrichment_status" DEFAULT 'unenriched'`
  - `ALTER TABLE "contacts" ADD COLUMN "enriched_at" timestamp`
  - `CREATE INDEX "contacts_enrichment_status_idx" ON "contacts" USING btree ("enrichment_status")`
  - All statements separated by `--> statement-breakpoint` (matches analog migrations)
  - No DROP or RENAME of existing columns — purely additive

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated prioritization.test.ts Contact mock for new nullable columns**
- **Found during:** Task 1 TypeScript check
- **Issue:** `makeContact()` mock object in `prioritization.test.ts` was missing the four new Drizzle-inferred columns (`companyAtConnection`, `roleAtConnection`, `enrichmentStatus`, `enrichedAt`). Since `$inferSelect` generates these as non-optional (`string | null`, not `string | null | undefined`), TypeScript emitted TS2719 on the incompatible Contact types.
- **Fix:** Added `companyAtConnection: null`, `roleAtConnection: null`, `enrichmentStatus: 'unenriched'`, `enrichedAt: null` to the mock object in the Import tracking section.
- **Files modified:** `src/features/job-leads/lib/prioritization.test.ts`
- **Commit:** 16b2a0e

## Live DB Apply Status

**Action required:** The migration was generated successfully but could not be applied in the worktree context — `DATABASE_URL` is not available (lives in `.env.local` which is gitignored).

**Manual step:** After this branch is merged, run the following from the main project directory:
```bash
npm run db:push
```
Or equivalently:
```bash
npm run db:migrate
```

The migration is purely additive (no DROP/RENAME). It is safe to apply at any time. Downstream plans (Plan 02 enrichment PATCH route, Plan 03 triage UI) will fail at runtime (not compile time) until this is applied.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond what is documented in the plan's `<threat_model>`. The `npm run db:push` gate (T-10-01) was mitigated by inspecting the generated SQL for DROP/RENAME statements before committing. All statements confirmed additive.

## Known Stubs

None.

## Self-Check: PASSED

- `drizzle/schema/enums.ts` contains `pgEnum('contact_enrichment_status'` — FOUND
- `drizzle/schema/contacts.ts` contains `company_at_connection`, `role_at_connection`, `enrichment_status`, `enriched_at`, `contacts_enrichment_status_idx` — FOUND
- `src/lib/domain/types.ts` contains `contactEnrichmentStatusValues` — FOUND
- `drizzle/migrations/0010_acoustic_sprite.sql` contains `company_at_connection` — FOUND
- Commit 16b2a0e exists — FOUND
- Commit bdd48b5 exists — FOUND
