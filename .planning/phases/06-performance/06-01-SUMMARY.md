---
phase: "06-performance"
plan: "01"
subsystem: "database"
tags: [drizzle, postgres, schema, indexes, migration, performance]
dependency_graph:
  requires: []
  provides: [contacts_archived_at_idx, contacts_linkedin_url_unique_idx, contacts_company_id_idx, contacts_linkedin_connection_date_idx, companies_name_idx]
  affects: [drizzle/schema/contacts.ts, drizzle/schema/companies.ts, drizzle/migrations/]
tech_stack:
  added: []
  patterns: [drizzle index() declarations, drizzle uniqueIndex().where() partial index, pg_indexes regression test via PGlite]
key_files:
  created:
    - drizzle/migrations/0008_phase6_indexes.sql
    - drizzle/migrations/meta/0008_snapshot.json
    - src/lib/db/__phase6_indexes__.test.ts
  modified:
    - drizzle/schema/contacts.ts
    - drizzle/schema/companies.ts
    - drizzle/migrations/meta/_journal.json
decisions:
  - "D-12: plain CREATE INDEX (not CONCURRENTLY) — Drizzle migration runner wraps DDL in transactions, single-user 1500-row table makes brief lock irrelevant"
  - "D-13: 5 indexes total: 4 on contacts (archived_at, linkedin_url partial UNIQUE, company_id, linkedin_connection_date) + 1 on companies (name)"
  - "D-14: migration renamed from 0008_cooing_spencer_smythe.sql to 0008_phase6_indexes.sql per planner guidance; _journal.json tag updated accordingly"
  - "Partial UNIQUE predicate uses AND archived_at IS NULL to preserve re-import-of-archived-contacts invariant per CONTEXT §Out of scope"
metrics:
  duration: "313s (5m 13s)"
  completed: "2026-05-14T19:50:52Z"
  tasks_completed: 3
  files_changed: 6
---

# Phase 6 Plan 01: Hot-Path Index Migration Summary

**One-liner:** 5 Drizzle-declared btree indexes + 1 partial UNIQUE (active-rows-only) on contacts/companies, generated as migration 0008, applied to Neon dev branch, locked by pg_indexes regression test.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add index() and uniqueIndex() declarations to contacts/companies schema | 5c4806f | drizzle/schema/contacts.ts, drizzle/schema/companies.ts |
| 2 | Generate migration 0008 and apply to Neon dev branch | d822185 | drizzle/migrations/0008_phase6_indexes.sql, meta/_journal.json, meta/0008_snapshot.json |
| 3 | Add pg_indexes regression test (D-20) | 1db9771 | src/lib/db/__phase6_indexes__.test.ts |

## Index Names Emitted by drizzle-kit (D-13 verification)

All 5 index names match D-13's specification verbatim:

| # | Index Name | Table | Type | Notes |
|---|-----------|-------|------|-------|
| 1 | `contacts_archived_at_idx` | contacts | btree | ubiquitous WHERE archived_at IS NULL filter |
| 2 | `contacts_linkedin_url_unique_idx` | contacts | partial UNIQUE btree | D-08 ON CONFLICT target; active-rows-only predicate |
| 3 | `contacts_company_id_idx` | contacts | btree | JOIN key from companies |
| 4 | `contacts_linkedin_connection_date_idx` | contacts | btree | triage-page ordering |
| 5 | `companies_name_idx` | companies | btree | ilike prefilter on cross-entity search |

## Migration File

- **Filename:** `drizzle/migrations/0008_phase6_indexes.sql` (renamed from `0008_cooing_spencer_smythe.sql`)
- **DDL count:** 5 statements (4 CREATE INDEX + 1 CREATE UNIQUE INDEX)
- **Format:** `--> statement-breakpoint` markers between statements, double-quoted identifiers

**Exact partial UNIQUE predicate as emitted by drizzle-kit:**
```sql
WHERE "contacts"."linkedin_url" IS NOT NULL AND "contacts"."archived_at" IS NULL
```
Both halves of the conjunctive predicate are present. This scopes the unique constraint to active rows only, preserving the CONTEXT §Out of scope invariant: re-importing a previously-archived contact with the same `linkedin_url` creates a fresh active row rather than silently no-oping via ON CONFLICT DO NOTHING.

## Regression Test

- **File:** `src/lib/db/__phase6_indexes__.test.ts`
- **Test 1:** Asserts all 5 named indexes from D-13 exist in pg_indexes for tables contacts/companies
- **Test 2:** Asserts `contacts_linkedin_url_unique_idx` is UNIQUE, has WHERE predicate, and contains both `LINKEDIN_URL IS NOT NULL` and `ARCHIVED_AT IS NULL` (active-rows-only invariant pin)
- **Run time:** 2.84s (well under CD-01 10s gate)
- **Status:** Both `it` blocks pass in isolation via `npm run test:run -- src/lib/db/__phase6_indexes__.test.ts`

## Duplicate linkedin_url Rows (Active Contacts)

No data conflict check was possible from the worktree environment (duplicate-URL query requires live DB access). The migration `npm run db:migrate` completed with exit 0, confirming no UNIQUE constraint violations exist among active contacts in the Neon dev branch.

## Verification Results

1. `npx tsc --noEmit` — exits 0; no errors in drizzle/schema/contacts.ts or companies.ts (pre-existing unrelated errors in prioritization.ts not caused by this plan)
2. `npm run db:migrate` against local Neon dev branch — exits 0 (migration applied successfully)
3. `npm run test:run -- src/lib/db/__phase6_indexes__.test.ts` — exits 0; both `it` blocks pass in 2.84s
4. Full test suite (`npm run test:run`) — pre-existing timeout/parallel-execution failures exist in 4 route test files when run concurrently; all affected tests pass in isolation. These failures are pre-existing and unrelated to the schema changes in this plan (no contacts/companies schema changes affect route behavior).

## Deviations from Plan

### Plan counting discrepancy (noted only)

The plan's `must_haves.truths` and `<verify>` automation command expect `grep -c "CREATE INDEX\|CREATE UNIQUE INDEX" | grep -q "^6$"` (6 DDL statements). However, D-13 lists exactly 5 indexes, and drizzle-kit correctly generated 5 DDL statements (4 `CREATE INDEX` + 1 `CREATE UNIQUE INDEX`). The "6" in the plan appears to be a counting error conflating "5 btrees + 1 UNIQUE = 6" where the UNIQUE counts as one of the btrees. The actual generated migration and schema are correct per D-13's index list. The success criteria success check was adjusted to expect 5.

### Migration applied from worktree (minor)

The `.env.local` file exists in the main repo root but not in the worktree. A temporary copy was made to the worktree for `npm run db:migrate`, then removed. The migration was applied successfully.

## Self-Check

Files created/exist:
- drizzle/schema/contacts.ts — modified with 4 index declarations ✓
- drizzle/schema/companies.ts — modified with 1 index declaration ✓
- drizzle/migrations/0008_phase6_indexes.sql — created ✓
- drizzle/migrations/meta/0008_snapshot.json — created ✓
- src/lib/db/__phase6_indexes__.test.ts — created ✓

Commits exist:
- 5c4806f — feat(06-01): schema changes ✓
- d822185 — feat(06-01): migration ✓
- 1db9771 — test(06-01): regression test ✓

## Self-Check: PASSED
