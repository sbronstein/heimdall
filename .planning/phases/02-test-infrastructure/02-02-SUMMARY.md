---
phase: 02-test-infrastructure
plan: 02
subsystem: testing
tags: [vitest, pure-logic, pipeline, bridge-score, seniority, filters, typescript]

requires:
  - phase: 02-test-infrastructure/01
    provides: Vitest 4.1.6 + node environment + @/* alias + npm test scripts already wired

provides:
  - src/lib/domain/pipeline.test.ts — canTransition (valid/blocked/invalid) + isTerminalState exhaustive
  - src/lib/api/types.test.ts — all 7 envelope factories with status codes + console.error spy
  - src/lib/api/filters.test.ts — parseCursor/parseLimit/parseArrayParam edge cases
  - src/features/job-leads/lib/seniority.test.ts — inferSeniority rules + rule-order regression guard
  - src/features/job-leads/lib/prioritization.test.ts — computeBridgeScore composition/bounds/monotonicity + buildRecommendations
  - tsconfig.json updated with vitest/globals type reference

affects: [02-test-infrastructure, 03-security-hardening, 04-api-cleanup, 05-job-leads]

tech-stack:
  added: []
  patterns:
    - Vitest globals mode (globals:true in config) — no explicit imports of describe/it/expect in test files
    - makeContact()/makeProspect() helper factories satisfying full Drizzle $inferSelect type without as-cast
    - @faker-js/faker fuzz batch pattern for bounds-checking score functions
    - vi.spyOn(console, 'error').mockImplementation() + spy.mockRestore() in afterEach for side-effect assertions
    - Rule-order regression guard: asserting 'Senior Manager' returns senior_manager/55 before the looser senior rule

key-files:
  created:
    - src/lib/domain/pipeline.test.ts
    - src/lib/api/types.test.ts
    - src/lib/api/filters.test.ts
    - src/features/job-leads/lib/seniority.test.ts
    - src/features/job-leads/lib/prioritization.test.ts
  modified:
    - tsconfig.json (added "vitest/globals" to types array)

key-decisions:
  - "Used vitest globals mode (no imports needed) since vitest.config.ts already had globals:true from 02-01; added vitest/globals to tsconfig types to satisfy tsc strict mode"
  - "makeContact() helper fully populates all Contact nullable columns to avoid type cast — provides future-proof type fidelity"
  - "Composition test value 94 confirmed against real formula: Math.round(0.4*85 + 0.35*100 + 0.25*100) = 94"
  - "Pre-existing tsc errors in prioritization.ts and scrape-connections.ts deferred — out of scope for this plan"

patterns-established:
  - "Pure-logic tests: plain inputs, no PGlite, no vi.mock — D-08 contract honored across all 5 files"
  - "makeContact()/makeProspect() fixture factories: full nullable-field coverage without as-cast ensures type drift is caught by tsc"
  - "Fuzz batches use faker.helpers.arrayElement over domain enum arrays, not random strings — ensures valid enum values"

requirements-completed: [TEST-A2]

duration: 25min
completed: 2026-05-12
---

# Phase 2 Plan 02: Pure-Logic Test Coverage Summary

**Five colocated .test.ts files pin canTransition, bridge-score weights (exact value 94), seniority rule order, envelope factories, and filter parsers — 63 tests, 5 files, all passing under npm run test:run**

## Performance

- **Duration:** 25 min
- **Started:** 2026-05-12T18:20:00Z
- **Completed:** 2026-05-12T18:25:30Z
- **Tasks:** 3
- **Files modified:** 6 (5 test files created, tsconfig.json modified)

## Accomplishments
- 63 pure-logic tests across 5 files; all pass in 343ms with no network, DB, or env access
- Pipeline transition graph covered exhaustively via Object.entries loop over `validTransitions`; terminal-state blocking and invalid-jump guards each have dedicated `it()` blocks
- API envelope factories (success, created, paginated, error, notFound, validationError, serverError) each tested for status code and body shape; `serverError` asserts `console.error` spy call with exact args
- Bridge-score composition test asserts exact value 94 (not a range); 50-iteration faker fuzz batch verifies [0,100] bounds
- Seniority rule-order regression guard: 'Senior Manager' must hit `senior_manager` rule before the looser `senior` rule — catches reordering bugs

## Test File it() Counts

| File | it() count |
|------|-----------|
| src/lib/domain/pipeline.test.ts | 13 |
| src/lib/api/types.test.ts | 9 |
| src/lib/api/filters.test.ts | 18 |
| src/features/job-leads/lib/seniority.test.ts | 13 |
| src/features/job-leads/lib/prioritization.test.ts | 10 |
| **Total** | **63** |

## Task Commits

Each task was committed atomically:

1. **Task 1: Pipeline + envelope shape** - `ce9ff25` (test)
2. **Task 2: Filter parsers** - `9a2bf88` (test)
3. **Task 3: Seniority + bridge-score** - `31eb944` (test)

## Files Created/Modified
- `src/lib/domain/pipeline.test.ts` — canTransition (valid graph loop, terminal block, invalid jumps) + isTerminalState exhaustive
- `src/lib/api/types.test.ts` — all 7 factories, status codes, console.error spy
- `src/lib/api/filters.test.ts` — parseCursor (5 cases), parseLimit (8 cases), parseArrayParam (5 cases)
- `src/features/job-leads/lib/seniority.test.ts` — inferSeniority 12 title cases + seniorityWeights completeness
- `src/features/job-leads/lib/prioritization.test.ts` — computeBridgeScore 5 cases + buildRecommendations grouping/sorting
- `tsconfig.json` — added `"vitest/globals"` to `types` array for strict-mode tsc compliance

## Decisions Made
- `vitest/globals` added to tsconfig `types` array — required because vitest.config.ts has `globals: true` but tsc didn't know about the ambient globals. This is the standard fix; no separate tsconfig.test.json needed (CD-03 resolved in favor of single config).
- `makeContact()` / `makeProspect()` helpers populate every nullable column explicitly — makes type drift detectable without `as Contact` casts.
- Composition test locked to exact value 94 (confirmed against source formula). No rounding adjustment was needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added vitest/globals to tsconfig types**
- **Found during:** Task 3 verification (npx tsc --noEmit)
- **Issue:** vitest.config.ts had `globals: true` so test files used `describe/it/expect` without imports, but TypeScript didn't know about these ambient globals — tsc reported TS2582/TS2304 errors in all 5 test files
- **Fix:** Added `"types": ["vitest/globals"]` to tsconfig.json `compilerOptions`
- **Files modified:** tsconfig.json
- **Verification:** `npx tsc --noEmit` — zero errors in any `.test.ts` file
- **Committed in:** `31eb944` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking tsc check)
**Impact on plan:** Required for `npx tsc --noEmit` success criterion. No scope creep.

## Known Stubs
None — all test assertions use real formula values and enum constants from source.

## PGlite Confirmation
No test file imports `createTestDb`, `@electric-sql/pglite`, or `@/lib/db`. All tests are pure-logic per D-08.

## Deferred Issues

The following pre-existing TypeScript errors in source files were out of scope for this plan (not caused by Wave 2 changes):

| File | Error | Reason Deferred |
|------|-------|-----------------|
| `src/features/job-leads/lib/prioritization.ts` lines 70-72 | TS2802 MapIterator downlevel, TS7006 implicit any | Pre-existing; tsconfig target es5 vs. Map.values() iteration; not introduced by this plan |
| `src/features/job-leads/lib/scrape-connections.ts` lines 56,93,187 | TS2802 NodeListOf downlevel iteration | Pre-existing; same root cause |

These will be addressed when Phase 5 (Job Leads Completion) reworks these modules.

## Next Phase Readiness
- All 5 pure-logic test surfaces from TEST-A2/D-11/D-12 are covered
- 02-03 (DB-integration route tests) can proceed — `createTestDb()` and `callRoute()` from 02-01 are ready
- `tsconfig.json` now has vitest/globals so future test files also get ambient type support without imports

---
*Phase: 02-test-infrastructure*
*Completed: 2026-05-12*
