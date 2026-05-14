---
phase: 06-performance
plan: 05
subsystem: api
tags: [drizzle, n+1, pure-read, prospect-bridges, recommendations, pglite, vitest]

requires:
  - phase: 06-01
    provides: Schema indexes migration that Wave 2 plans depend on

provides:
  - "GET /api/job-leads/[id]/recommendations is a pure READ — zero db.update/insert/delete calls"
  - "6-test PGlite suite pinning no-writes, recompute-from-null, no timeline events, idempotency invariants"

affects: [06-SUMMARY, prospectBridges-score-retirement-deferred]

tech-stack:
  added: []
  patterns:
    - "Variant B (on-the-fly compute): remove persistence side-effects from GET handlers when a downstream consumer already has the recomputation fallback"
    - "beforeAll + beforeEach cleanup pattern for PGlite test suites that seed 5+ tables (avoids hookTimeout)"

key-files:
  created:
    - src/app/api/job-leads/[id]/recommendations/route.test.ts
  modified:
    - src/app/api/job-leads/[id]/recommendations/route.ts

key-decisions:
  - "Variant B per D-15: delete persistence loop entirely; buildRecommendations fallback at prioritization.ts:55 handles null bridge.score via the ?? operator"
  - "Use beforeAll for PGlite migration replay (expensive, ~10s) and beforeEach for per-test row cleanup — avoids the 10s hookTimeout that fires when createTestDb() + seed runs in every beforeEach"
  - "Fixture uses 'c_suite' and 'vp' (valid seniorityLevelEnum values) — NOT 'executive' which is invalid and causes Postgres enum violation at INSERT time (BLOCKER 3 fix)"

patterns-established:
  - "GET handler with no DB writes: comments reference the specific decision (Variant B / D-15) so readers understand why persistence was intentionally removed"

requirements-completed: [PERF-A1]

duration: ~15min
completed: 2026-05-14
---

# Phase 6 Plan 05: Recommendations N+1 Elimination Summary

**Deleted the 11-line per-row UPDATE loop from GET /api/job-leads/[id]/recommendations; route is now a pure read using buildRecommendations' existing bridge.score ?? computeBridgeScore fallback**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-14
- **Completed:** 2026-05-14
- **Tasks:** 2
- **Files modified:** 2 (1 modified, 1 created)

## Accomplishments

- Removed `computeBridgeScore` import and the entire `for (const row of rows)` persistence loop (11 lines deleted, 1 import removed)
- Route now contains zero `db.update`, `db.insert`, or `db.delete` calls — verified by grep
- `prioritization.ts:55` `bridge.score ?? computeBridgeScore(...)` fallback was already the correct handler for null scores; Variant B required no changes to that file
- 6-test PGlite suite covers: 2-bridge happy path, no-writes invariant (null bridge stays null), no timeline events, empty-bridges, idempotency under retry, 404 not-found
- BLOCKER 3 fix verified: fixture uses `'c_suite'` (not `'executive'`) for executive-tier prospect — all 6 tests green, no Postgres enum violations

## Task Commits

1. **Task 1: Delete per-row UPDATE loop; route is pure read** - `c8c77ec` (refactor)
2. **Task 2: Create route.test.ts pinning no-writes and recompute invariants** - `29c2538` (test)

## Files Created/Modified

- `src/app/api/job-leads/[id]/recommendations/route.ts` — Removed `computeBridgeScore` import; deleted lines 43-53 (persistence loop); added Variant B comment referencing D-15; route is now 55 lines (was 68)
- `src/app/api/job-leads/[id]/recommendations/route.test.ts` — New: 6-test PGlite suite using beforeAll/beforeEach pattern for efficient migration replay

## Verification Results

```
grep db.update in route.ts:          0  (PASS)
grep db.insert in route.ts:          0  (PASS)
grep db.delete in route.ts:          0  (PASS)
grep computeBridgeScore in imports:  0  (PASS — only appears in comment)
grep buildRecommendations in route:  3  (PASS — import + call + re-export)
grep 'executive' as enum value:      0  (PASS — only in negative-guidance comment)
All 6 tests:                         PASS
```

## Decisions Made

- **Variant B confirmed by grep evidence**: `prioritization.ts:55` uses `bridge.score ?? computeBridgeScore(prospect, contact)` — null scores are transparently recomputed. No other consumer reads the persisted score from this write path. Removing the persistence loop is safe and cleaner.
- **beforeAll + beforeEach cleanup**: Using `beforeAll` for `createTestDb()` (expensive migration replay ~10s) and `beforeEach` for row cleanup prevented the 10s `hookTimeout` that fires when `createTestDb()` runs per-test. This is the correct pattern for PGlite suites seeding 5+ tables.
- **`prospectBridges.score` column**: Column stays nullable and write-free from this route. Future retirement tracked in CONTEXT §Deferred ("prospectBridges.score column retirement").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Changed beforeEach to beforeAll + beforeEach cleanup for PGlite harness**
- **Found during:** Task 2 (running tests)
- **Issue:** Using `beforeEach(async () => { dbRef.current = await createTestDb(); ... })` caused Tests 1 and 2 to timeout at the default 10s hookTimeout because migration replay + seeding 5 tables exceeded 10s
- **Fix:** Changed to `beforeAll(async () => { dbRef.current = await createTestDb(); }, 30000)` for one-time migration replay, with `beforeEach` only doing fast row deletions + re-seeding
- **Files modified:** src/app/api/job-leads/[id]/recommendations/route.test.ts
- **Verification:** All 6 tests pass, Tests 1-2 complete in ~2.4s and 0.6s respectively
- **Committed in:** 29c2538 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in test setup pattern)
**Impact on plan:** Test harness pattern change only; test coverage and invariants are identical to the plan spec. No scope creep.

## Issues Encountered

- PGlite `hookTimeout` exceeded when `createTestDb()` + 5-table seed ran inside `beforeEach`. Resolved by using `beforeAll` for migration replay and `beforeEach` for lightweight row cleanup (see deviations above).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Wave 2 Plan 05 (2d) is complete. GET /api/job-leads/[id]/recommendations is now a pure read.
- The `prospectBridges.score` column remains in the schema, nullable, with no writer path from this route. Retirement cleanup tracked in CONTEXT §Deferred.
- All pre-existing tests continue to pass.

---
*Phase: 06-performance*
*Completed: 2026-05-14*
