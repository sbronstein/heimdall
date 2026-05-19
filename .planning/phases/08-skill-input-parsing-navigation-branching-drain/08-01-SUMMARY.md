---
phase: 08-skill-input-parsing-navigation-branching-drain
plan: "01"
subsystem: api/job-leads
tags: [drizzle, leftjoin, projection, regression-test]
dependency_graph:
  requires:
    - 07-01 (nullable linkedinJobUrl migration)
    - 07-02 (company-scope POST branch)
  provides:
    - GET /api/job-leads response includes companyLinkedinUrl (D-13)
    - Test 15 regression pin for D-13 projection
  affects:
    - src/app/api/job-leads/route.ts
    - src/app/api/job-leads/route.test.ts
tech_stack:
  added: []
  patterns:
    - Drizzle leftJoin with explicit projection object (from recruiters/route.ts analog)
key_files:
  created: []
  modified:
    - src/app/api/job-leads/route.ts
    - src/app/api/job-leads/route.test.ts
    - src/features/job-leads/lib/prioritization.ts
decisions:
  - "leftJoin (not innerJoin) so leads with companyId IS NULL still appear in response with companyLinkedinUrl: null"
  - "Explicit projection over .select() — flat field, not nested company object (D-13)"
  - "Sibling describe block for Test 15 — preserves Tests 12-14 without requiring them to assert on the new field"
  - "Inline fixture in Test 15 — DRY threshold not met for a single test caller (CD-04)"
metrics:
  duration: "~6 minutes"
  completed: "2026-05-19T21:27:34Z"
  tasks_completed: 2
  files_modified: 3
---

# Phase 08 Plan 01: GET /api/job-leads companyLinkedinUrl Projection Summary

**One-liner:** Extended GET /api/job-leads with Drizzle leftJoin to companies and explicit projection, surfacing `companyLinkedinUrl` as a flat top-level field on every lead row per D-13.

## What Was Built

### Task 1: Switch GET handler to explicit projection with leftJoin

Modified `src/app/api/job-leads/route.ts` GET handler to replace `.select()` (full-row, no join) with an explicit 15-field projection object and `.leftJoin(companies, eq(jobLeads.companyId, companies.id))`. The new field `companyLinkedinUrl: companies.linkedinUrl` surfaces the joined company's LinkedIn URL as a flat top-level field. All 14 existing `jobLeads` column projections are preserved verbatim, ensuring no breaking change to existing consumers.

Key implementation details:
- `leftJoin` (not `innerJoin`) ensures leads without a `companyId` still appear with `companyLinkedinUrl: null`
- No import changes needed — both `companies` (line 10) and `eq` (line 3) were already imported
- POST handler (lines 73–225) untouched — Phase 7 owns it
- Cursor pagination still keys off `data[data.length - 1].updatedAt.toISOString()` — `updatedAt` remains a top-level field

### Task 2: Test 15 — D-13/CD-04 regression test

Added a new `describe('GET /api/job-leads (companyLinkedinUrl projection — D-13 / CD-04)')` block as a sibling to the existing GET describe block. The new block has its own `beforeEach` that seeds:
- One company with `linkedinUrl: 'https://www.linkedin.com/company/acme'`
- One company-scope lead (`linkedinJobUrl: null`, `roleTitle: 'Company-wide scrape'`)
- One job-URL lead (`linkedinJobUrl: 'https://www.linkedin.com/jobs/view/100'`)

Test 15 asserts:
- `GET /api/job-leads?status=queued` returns 2 rows
- Every row has `companyLinkedinUrl === 'https://www.linkedin.com/company/acme'`
- Rows are distinguishable by `linkedinJobUrl` (null vs matching `/jobs/view/`)

Fixture is inline per CD-04 / 08-PATTERNS.md (DRY threshold: 1 caller, no extract to pglite.ts needed).

## Test Counts

| Suite | Before | After |
|-------|--------|-------|
| Tests 12–14 (GET status filter) | 3 | 3 (unchanged) |
| Tests C1–C7 (POST company-scope) | 7 | 7 (unchanged) |
| Test 15 (new: companyLinkedinUrl projection) | 0 | 1 |
| **Total** | **10** | **11** |

```
 Test Files  1 passed (1)
      Tests  11 passed (11)
```

## Line-Count Delta

| File | +/- |
|------|-----|
| src/app/api/job-leads/route.ts | +17 lines |
| src/app/api/job-leads/route.test.ts | +58 lines |
| src/features/job-leads/lib/prioritization.ts | +1/-1 (bug fix) |

## What Unlocks for 08-03

With `companyLinkedinUrl` now present as a top-level field on every row returned by `GET /api/job-leads?status=queued`, the Plan 08-03 drain loop can branch on `lead.linkedinJobUrl === null` and then use `lead.companyLinkedinUrl` to navigate directly to `/company/<slug>/people/` — eliminating the per-lead `GET /api/companies/<id>` round-trip that would otherwise be required for company-scope leads. For leads where `companyLinkedinUrl` is null (D-14 fallback), the drain loop invokes the bare-name disambiguation flow using `lead.companyName` and backfills the company URL via `PUT /api/companies/<lead.companyId>`. This plan's projection change is the single API prerequisite that enables the D-11 single-loop drain with inline branching.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing MapIterator TypeScript error in prioritization.ts**
- **Found during:** Task 1 build verification
- **Issue:** `src/features/job-leads/lib/prioritization.ts:70` used `for (const rec of byContact.values())` — `Map.values()` returns a `MapIterator` which is not iterable under TypeScript's `es5` target without `downlevelIteration` flag. This was a pre-existing failure (confirmed via `git stash` check — same error on base commit).
- **Fix:** Changed to `for (const rec of Array.from(byContact.values()))` which is ES5-compatible.
- **Files modified:** `src/features/job-leads/lib/prioritization.ts`
- **Commit:** d0141c5 (bundled with Task 1 as it blocked the build verification criterion)

## Known Stubs

None — all fields are live data sourced from the DB.

## Self-Check

**Created files exist:**
- `.planning/phases/08-skill-input-parsing-navigation-branching-drain/08-01-SUMMARY.md` — this file

**Commits exist:**
- `d0141c5` — feat(08-01): extend GET /api/job-leads with leftJoin(companies) + companyLinkedinUrl projection
- `c1167c1` — test(08-01): add D-13/CD-04 regression — companyLinkedinUrl on both lead types in GET response

## Self-Check: PASSED
