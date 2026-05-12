---
phase: 02-test-infrastructure
plan: 01
subsystem: testing
tags: [vitest, pglite, test-harness, drizzle, typescript]

requires:
  - phase: 01-critical-bug-fix
    provides: Baseline codebase with Drizzle schema, migrations, and production db singleton

provides:
  - Vitest 4.1.6 test runner with node environment and @/* path alias
  - npm test and npm run test:run scripts
  - src/test-utils/pglite.ts — createTestDb() returning fresh PGlite-backed Drizzle instance
  - src/test-utils/call-route.ts — callRoute() helper for invoking Next.js route handlers

affects: [02-test-infrastructure, 03-security-hardening, 04-api-cleanup, 05-job-leads]

tech-stack:
  added:
    - vitest@^4.1.6
    - "@electric-sql/pglite@^0.4.5"
  patterns:
    - PGlite raw SQL replay of drizzle/migrations/*.sql for in-process Postgres in tests (CD-04)
    - Per-call fresh PGlite instance for test isolation (CD-05)
    - callRoute() helper wraps params in Promise.resolve for Next.js 16 async-params shape
    - vitest.config.ts with passWithNoTests to handle Vitest 4 exit-code behavior

key-files:
  created:
    - vitest.config.ts
    - src/test-utils/pglite.ts
    - src/test-utils/call-route.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "passWithNoTests: true required in vitest.config.ts — Vitest 4 exits code 1 on no test files (unlike earlier versions)"
  - "Raw SQL replay via pglite.exec() chosen for migration bootstrap (CD-04) — avoids drizzle-kit toolchain at runtime"
  - "drizzle-orm/pglite adapter drizzle(pglite, { schema }) matches production src/lib/db/index.ts shape exactly"

patterns-established:
  - "createTestDb(): import from @/test-utils/pglite, call in beforeEach, use with vi.mock('@/lib/db')"
  - "callRoute(handler, opts): invoke route handlers without a test HTTP server"

requirements-completed:
  - TEST-A1

duration: 15min
completed: "2026-05-12"
---

# Phase 2 Plan 01: Vitest + PGlite Test Harness Setup Summary

**Vitest 4.1.6 + PGlite in-process Postgres harness wired to Drizzle schema via raw SQL migration replay, with callRoute() helper for Next.js 16 route handler testing**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-12
- **Completed:** 2026-05-12
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Installed vitest@^4.1.6 and @electric-sql/pglite@^0.4.5 as devDependencies
- Added `"test": "vitest"` and `"test:run": "vitest run"` npm scripts
- Created `vitest.config.ts` with node environment, globals, @/* path alias, and passWithNoTests
- Created `src/test-utils/pglite.ts` exporting `createTestDb()` that bootstraps a fresh in-memory PGlite with all 7 migrations replayed, bound to Drizzle with the full schema barrel
- Created `src/test-utils/call-route.ts` exporting `callRoute()` that wraps Next.js 16 async-params handlers and returns `{ status, body, response }`
- `npm run test:run` exits 0 with no test files (vitest confirms clean runner state)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Vitest + PGlite devDependencies, add npm test scripts** - `1153299` (feat)
2. **Task 2: Write vitest.config.ts with node env and @/* path alias** - `5931cb5` (feat)
3. **Task 3: Write PGlite harness (createTestDb) and route-call helper (callRoute)** - `d7208df` (feat)

## Files Created/Modified

- `package.json` - Added test/test:run scripts; vitest and @electric-sql/pglite in devDependencies
- `package-lock.json` - Updated with resolved packages (35 added)
- `vitest.config.ts` - Vitest config: node env, globals: true, src/**/*.test.{ts,tsx} include, @/->./src alias, passWithNoTests: true
- `src/test-utils/pglite.ts` - createTestDb(): fresh PGlite, 7 migration files replayed in order, drizzle(pglite, { schema }) returned
- `src/test-utils/call-route.ts` - callRoute(handler, opts): builds Request, wraps params in Promise.resolve, awaits handler, returns { status, body, response }

## Decisions Made

- **passWithNoTests: true**: Vitest 4 changed behavior — it exits code 1 when no test files match the include glob (earlier versions exit 0). Added `passWithNoTests: true` to honor the plan's success criterion that `npm run test:run` exits 0 on a clean checkout.
- **Raw SQL replay (CD-04)**: Used `pglite.exec(sql)` to replay each `drizzle/migrations/*.sql` file in lexicographic order. Chosen over `drizzle-kit push` or `migrate()` because it's simpler, has no runtime dependency on drizzle-kit, and the `0000_` prefix naming guarantees correct order.
- **Path resolution via import.meta.url**: Migration directory computed as `path.join(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle/migrations')` so the helper works regardless of test working directory.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added passWithNoTests: true to vitest.config.ts**
- **Found during:** Task 2 (vitest.config.ts verification)
- **Issue:** Plan success criterion requires `npm run test:run` to exit 0 with no tests. Vitest 4.1.6 exits code 1 when no test files match the include glob — behavior changed from earlier Vitest versions.
- **Fix:** Added `passWithNoTests: true` to the `test` config block.
- **Files modified:** vitest.config.ts
- **Verification:** `npx vitest run` now exits 0 with message "No test files found, exiting with code 0"
- **Committed in:** `5931cb5` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug)
**Impact on plan:** Minor — passWithNoTests is an idiomatic Vitest option. No scope creep.

## Issues Encountered

- Pre-existing TypeScript errors in `src/features/job-leads/lib/prioritization.ts` (TS2802 MapIterator downlevelIteration) and `src/features/job-leads/lib/scrape-connections.ts` (TS2802 NodeListOf iteration). These are out-of-scope pre-existing issues; no new type errors introduced by this plan's files.

## User Setup Required

None - no external service configuration required. Test runner is fully local and in-process.

## Next Phase Readiness

- Test runner is active: `npm run test:run` exits 0
- `createTestDb()` available at `@/test-utils/pglite` for DB-touching tests
- `callRoute()` available at `@/test-utils/call-route` for route handler tests
- Plans 02-02, 02-03, 02-04 can now write tests against pure logic, DB-backed routes, and BUG-01 regression surface

---
*Phase: 02-test-infrastructure*
*Completed: 2026-05-12*
