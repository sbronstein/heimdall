---
phase: 07-schema-api-for-company-scope-leads
plan: 01
subsystem: database
tags: [drizzle, schema, migration, neon, postgres, zod, regression-test]

# Dependency graph
requires:
  - phase: 06-performance
    provides: companies_name_idx (Plan 02-bridge index used downstream in Plan 07-02 by D-07 case-insensitive company lookup)
  - phase: 02-test-infrastructure
    provides: PGlite + Drizzle test harness (src/test-utils/pglite.ts) — applies all migrations including new 0009 automatically
provides:
  - nullable job_leads.linkedin_job_url column (schema, migration, live DB)
  - COMPANY_SCOPE_ROLE_TITLE = 'Company-wide scrape' sentinel constant
  - drizzle/migrations/0009_allow_company_scope_job_leads.sql checked in and applied
  - PGlite regression test pinning the nullable shape
affects: [07-02 (route extension consumes nullable column + sentinel), 07-03 (D-17 regression tests against null-URL leads), 08-skill (POSTs null linkedinJobUrl via API), 09-ui (renders null linkedinJobUrl)]

# Tech tracking
tech-stack:
  added: []  # no new packages — drizzle-kit, @neondatabase/serverless, vitest, @electric-sql/pglite all pre-existing
  patterns:
    - Phase-N PGlite schema regression test (sibling to __phase6_indexes__.test.ts) — pattern reusable for any future ALTER-COLUMN migration

key-files:
  created:
    - drizzle/migrations/0009_allow_company_scope_job_leads.sql
    - drizzle/migrations/meta/0009_snapshot.json
    - src/lib/db/__phase7_schema__.test.ts
    - .planning/phases/07-schema-api-for-company-scope-leads/deferred-items.md
  modified:
    - drizzle/schema/job-leads.ts (line 19 — drop .notNull())
    - drizzle/migrations/meta/_journal.json (Drizzle Kit appended 0009 entry)
    - src/lib/domain/types.ts (export COMPANY_SCOPE_ROLE_TITLE)
    - src/features/job-leads/components/scrape-results.tsx (null-guard on linkedinJobUrl link — Rule 3 inline fix)

key-decisions:
  - "Migration is a single ALTER COLUMN DROP NOT NULL — Drizzle Kit emitted the expected minimal shape; no hand-edit needed (CD-01)"
  - "Prepended one-line runbook comment per CD-03 explaining the constraint relaxation"
  - "Regression test uses Drizzle insert+select (not pg_indexes introspection) — column nullability is easier to verify by a successful insert than by querying information_schema (matches the analog in 07-PATTERNS.md note)"
  - "Defensive 2nd test case pins both linkedinJobUrl AND roleTitle null (Phase 7 SC #2 wording: 'both fields null') — confirms no coupling introduced between the two nullable columns"
  - "Live DB migration verified end-to-end via Neon HTTP driver: information_schema confirms is_nullable=YES + probe insert with NULL succeeded + probe row cleaned up"

patterns-established:
  - "Phase-N schema regression test: src/lib/db/__phaseN_schema__.test.ts that uses createTestDb() and asserts the DDL change via a successful Drizzle operation (insert/select)"
  - "Runbook header comment on non-trivial migrations: prepend a single '-- explanation' line to the generated .sql so the intent is visible at git-log / file-open time without leaving the file"

requirements-completed: [JL-C4]

# Metrics
duration: ~20min
completed: 2026-05-19
---

# Phase 07 Plan 01: Schema migration to nullable linkedin_job_url Summary

**Dropped NOT NULL on `job_leads.linkedin_job_url` in schema + Drizzle migration 0009 + live Neon dev DB; exported `COMPANY_SCOPE_ROLE_TITLE` sentinel; pinned the nullable shape with a PGlite regression test. Plans 07-02 and 07-03 are now unblocked.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-05-19T19:45Z
- **Completed:** 2026-05-19T20:04Z
- **Tasks:** 5/5 (Task 4 is a runtime side effect — no source file commit)
- **Files modified:** 4
- **Files created:** 4

## Accomplishments

- `drizzle/schema/job-leads.ts:19` declares `linkedinJobUrl` as a nullable text column (D-05)
- `COMPANY_SCOPE_ROLE_TITLE = 'Company-wide scrape' as const` exported from `@/lib/domain/types` (D-10, D-11)
- `0009_allow_company_scope_job_leads.sql` checked in with the single expected ALTER statement and CD-03 runbook header
- Live Neon dev DB now reports `is_nullable = 'YES'` for `job_leads.linkedin_job_url`; probe insert with NULL succeeded and was cleaned up
- `src/lib/db/__phase7_schema__.test.ts` pins the nullable shape (2 it blocks, both pass on PGlite) — analog of `__phase6_indexes__.test.ts`

## Task Commits

Each task was committed atomically:

1. **Task 1: Drop NOT NULL on linkedinJobUrl in Drizzle schema** — `d1528c6` (feat)
2. **Task 2: Add COMPANY_SCOPE_ROLE_TITLE constant to domain types** — `6700df8` (feat)
3. **Task 3: [BLOCKING] Generate Drizzle migration 0009_allow_company_scope_job_leads** — `e390dd9` (feat)
4. **Task 4: [BLOCKING] Apply migration to live dev database** — no commit (DB-only side effect; the migration file itself was committed in Task 3)
5. **Task 5: Schema regression test (D-06) — insert linkedinJobUrl: null via Drizzle** — `103a762` (test)

## Files Created/Modified

### Created
- `drizzle/migrations/0009_allow_company_scope_job_leads.sql` — single `ALTER TABLE "job_leads" ALTER COLUMN "linkedin_job_url" DROP NOT NULL;` with CD-03 runbook header
- `drizzle/migrations/meta/0009_snapshot.json` — Drizzle Kit snapshot of the post-migration schema
- `src/lib/db/__phase7_schema__.test.ts` — D-06 regression test (2 it blocks, both pass)
- `.planning/phases/07-schema-api-for-company-scope-leads/deferred-items.md` — out-of-scope pre-existing issues discovered during verification

### Modified
- `drizzle/schema/job-leads.ts` — line 19: dropped `.notNull()` on `linkedinJobUrl`
- `drizzle/migrations/meta/_journal.json` — Drizzle Kit appended the 0009 entry
- `src/lib/domain/types.ts` — appended `COMPANY_SCOPE_ROLE_TITLE` constant with docstring after `jobLeadStatusValues`
- `src/features/job-leads/components/scrape-results.tsx` — wrapped "View Job Posting" link in `lead.linkedinJobUrl && (...)` null-guard (Rule 3 inline fix for the type error introduced by the schema change)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Type error in scrape-results.tsx after schema change**
- **Found during:** Task 1 (post-edit `npx tsc --noEmit`)
- **Issue:** Dropping `.notNull()` on `linkedinJobUrl` typed it as `string | null` instead of `string`, breaking `<a href={lead.linkedinJobUrl}>` in `src/features/job-leads/components/scrape-results.tsx:34` (TS2322 — null not assignable to string | undefined). Pre-Phase-7 builds did not have this error (verified via `git stash` against `main`).
- **Fix:** Wrapped the `<a>` element in `{lead.linkedinJobUrl && (...)}` — render-only-when-non-null. This aligns with D-12 (Phase 9 UI keys off `linkedinJobUrl === null`) and is the minimal change to unblock TypeScript.
- **Files modified:** `src/features/job-leads/components/scrape-results.tsx`
- **Commit:** `d1528c6` (folded into Task 1 commit; same logical schema-change atomic unit)

No other deviations. All 5 tasks executed as planned.

## Authentication Gates

None. Migration ran against the local `DATABASE_URL` in `.env.local`; no interactive auth.

## Verification Results

All 6 plan-level verification steps run; results below:

| # | Step | Result |
|---|------|--------|
| 1 | Full `npx vitest run` exits 0 | **Partial fail** — new `__phase7_schema__.test.ts` passes; 5 pre-existing tests in `src/app/api/job-leads/[id]/prospects/route.test.ts` time out at 60 s. Reproduced against `main` HEAD `6ee48f0` with Phase 7 files reverted — same 5 timeouts. **Not caused by Phase 7.** Documented in `deferred-items.md`. |
| 2 | `grep -n "linkedinJobUrl" drizzle/schema/job-leads.ts \| grep -c "notNull"` returns 0 | PASS — 0 matches |
| 3 | `grep -c "ALTER COLUMN \"linkedin_job_url\" DROP NOT NULL" drizzle/migrations/0009_allow_company_scope_job_leads.sql` returns 1 | PASS — 1 match |
| 4 | Live DB `information_schema.columns.is_nullable = 'YES'` for `job_leads.linkedin_job_url` | PASS — confirmed via Neon HTTP query |
| 5 | `grep -c "COMPANY_SCOPE_ROLE_TITLE" src/lib/domain/types.ts` returns 1 | PASS — 1 match |
| 6 | `npx tsc --noEmit` exits 0 | **Pre-existing fail** — 4 pre-existing errors in `src/features/job-leads/lib/prioritization.ts` (TS2802 + 3× TS7006). Confirmed pre-existing via `git stash` against `main`. Not introduced by Phase 7. Documented in `deferred-items.md`. The 1 new error caused by the schema change (in `scrape-results.tsx`) was auto-fixed under Rule 3 in Task 1's commit. |

## Deferred Issues

See `.planning/phases/07-schema-api-for-company-scope-leads/deferred-items.md` for:
- Pre-existing TypeScript errors in `src/features/job-leads/lib/prioritization.ts` (4 errors)
- Pre-existing test timeouts in `src/app/api/job-leads/[id]/prospects/route.test.ts` (5 tests)

Both confirmed independent of the Phase 7 schema change. **Plan 07-01 work itself is verified correct** — the failing items predate this plan and should be addressed separately.

## Known Stubs

None. This plan delivers schema + a regression test; no UI rendering or data wiring was added that could stub out.

## Threat Flags

None. The plan's `<threat_model>` covered every surface modified:
- T-07-01 (Drizzle Kit over-generation) — mitigated by inspecting the emitted SQL; single ALTER as expected
- T-07-02 (db:migrate failure) — accepted; ran cleanly
- T-07-05 (migration audit trail) — mitigated by Drizzle journal + git commit `e390dd9`

No new security-relevant surface introduced (no new endpoint, no auth change, no trust-boundary change).

## Self-Check: PASSED

Files created — all exist:
- `drizzle/migrations/0009_allow_company_scope_job_leads.sql` — FOUND
- `drizzle/migrations/meta/0009_snapshot.json` — FOUND
- `src/lib/db/__phase7_schema__.test.ts` — FOUND
- `.planning/phases/07-schema-api-for-company-scope-leads/deferred-items.md` — FOUND

Commits referenced — all exist in `git log`:
- `d1528c6` (Task 1) — FOUND
- `6700df8` (Task 2) — FOUND
- `e390dd9` (Task 3) — FOUND
- `103a762` (Task 5) — FOUND
