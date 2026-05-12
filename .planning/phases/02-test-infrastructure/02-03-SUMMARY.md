---
phase: 02-test-infrastructure
plan: 03
subsystem: testing
tags: [vitest, pglite, api-routes, csv-parsing, timeline, cursor-pagination, soft-delete]

requires:
  - phase: 02-test-infrastructure/01
    provides: createTestDb() PGlite harness + callRoute() helper + npm test scripts
  - phase: 02-test-infrastructure/02
    provides: Pure-logic test coverage establishing vi.hoisted + Proxy as canonical pattern

provides:
  - src/app/api/applications/[id]/status/route.test.ts — 4 tests: valid transition, invalid transition, not-found, Zod failure + timeline side-effect
  - src/app/api/contacts/import/route.test.ts — 3 tests: happy path with fixture, missing file, dedup-within-import + timeline side-effect
  - src/app/api/contacts/import/__fixtures__/linkedin-connections.csv — synthetic LinkedIn export with preamble, header, 3 valid rows, 1 malformed row
  - src/app/api/contacts/route.test.ts — 4 tests: cursor pagination, hasMore, empty result, soft-delete exclusion

affects: [02-test-infrastructure, 03-security-hardening, 04-api-cleanup, 05-job-leads]

tech-stack:
  added: []
  patterns:
    - vi.hoisted + Proxy indirection for @/lib/db mock — allows per-test fresh PGlite binding without vi.doMock gymnastics
    - Dynamic import() inside each it() block — ensures route sees the mocked singleton on every test
    - Timeline side-effect assertion via dbRef.current.select().from(timelineEvents) — D-07 contract enforced
    - Cursor ordering via explicit updatedAt seed values — makes pagination assertions deterministic
    - as unknown as double-cast for Proxy return type — required when PGlite Drizzle type lacks string-index signature

key-files:
  created:
    - src/app/api/applications/[id]/status/route.test.ts
    - src/app/api/contacts/import/route.test.ts
    - src/app/api/contacts/import/__fixtures__/linkedin-connections.csv
    - src/app/api/contacts/route.test.ts

key-decisions:
  - "vi.hoisted + Proxy mandated over vi.doMock — single mock registration, per-test rebind via dbRef.current = await createTestDb() in beforeEach"
  - "Proxy cast requires (dbRef.current as unknown as Record<string|symbol, unknown>) — PGlite Drizzle type lacks string-index signature, direct cast fails strict TS overlap check"
  - "PATCH handler needs as unknown as Parameters<typeof callRoute>[0] cast — narrower params type { id: string } vs RouteHandler's Record<string,string>"
  - "Dynamic import() inside each it() block keeps route module isolated per test without module cache clearing"
  - "Explicit updatedAt seed values (2026-01-01, 01-02, 01-03) make cursor = oldest-visible assertions deterministic"

patterns-established:
  - "DB-integration tests: vi.hoisted + Proxy + dynamic import() inside each it() + dbRef.current seed in beforeEach"
  - "Timeline side-effect verification: query timelineEvents after route call, assert eventType/title/metadata — no separate mock of @/lib/db/timeline"
  - "Cursor assertion pattern: body.meta.cursor === data[data.length-1].updatedAt.toISOString() (oldest visible, not newest)"
  - "Soft-delete exclusion test: update archivedAt, call GET, assert archived contact absent, cursor uses oldest non-archived"

requirements-completed: [TEST-A2]

duration: 5min
completed: "2026-05-12"
---

# Phase 2 Plan 03: DB-Backed API Route Integration Tests Summary

**Three colocated route.test.ts files + LinkedIn CSV fixture give DB-backed integration coverage: status-transition + timeline side-effect (4 tests), CSV import + preamble strip + dedup (3 tests), cursor-paginated GET + soft-delete filter (4 tests) — 11 tests, all passing**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-12T22:30:03Z
- **Completed:** 2026-05-12T22:34:49Z
- **Tasks:** 3
- **Files modified:** 4 (3 test files created, 1 fixture CSV created)

## Accomplishments

- Established `vi.hoisted` + Proxy as the canonical DB-singleton swap pattern for all DB-integration tests — no `vi.doMock` anywhere
- `PATCH /api/applications/[id]/status` fully covered: valid `researching→applied` transition sets `appliedDate`, writes exactly one `timeline_events` row with correct `eventType`/`applicationId`/`metadata.from+to`; invalid transition returns 400 with zero timeline rows; not-found returns 404; Zod failure returns 400
- `POST /api/contacts/import` covered with a colocated synthetic CSV fixture containing LinkedIn preamble, 3 valid rows, 1 malformed row; happy path verifies `contacts` row count, `importSource`/`closeness`/`tags`, and `timeline_events` row with `contacts_imported` eventType; dedup-within-import test confirms `created:1 skipped:1` for duplicate URLs
- `GET /api/contacts` covered with deterministic cursor ordering via explicit `updatedAt` seed values; `meta.cursor` asserted as oldest-visible contact's ISO timestamp; `hasMore:true` and soft-delete exclusion both covered
- 74 total tests passing (63 pure-logic from 02-02 + 11 new DB-integration); `npx tsc --noEmit` passes with zero errors outside the known pre-existing `prioritization.ts`/`scrape-connections.ts` TS2802 issues

## Test File it() Counts

| File | it() count |
|------|-----------|
| src/app/api/applications/[id]/status/route.test.ts | 4 |
| src/app/api/contacts/import/route.test.ts | 3 |
| src/app/api/contacts/route.test.ts | 4 |
| **Total new** | **11** |
| **Grand total (all test files)** | **74** |

## Task Commits

Each task was committed atomically:

1. **Task 1: Application status PATCH + timeline side-effect** - `7613beb` (test)
2. **Task 2: Contacts/import CSV + timeline + envelope** - `505f22c` (test)
3. **Task 3: Contacts GET pagination envelope + soft-delete + Rule 1 tsc fixes** - `bfbb587` (test)

## Files Created/Modified

- `src/app/api/applications/[id]/status/route.test.ts` — 4 it() blocks covering valid transition, invalid transition, not-found, Zod failure; happy-path asserts timeline row eventType/applicationId/metadata
- `src/app/api/contacts/import/route.test.ts` — 3 it() blocks: fixture happy path, missing-file 400, dedup-within-import
- `src/app/api/contacts/import/__fixtures__/linkedin-connections.csv` — synthetic LinkedIn export: 3 preamble lines + blank + header + 3 valid rows + 1 malformed row (missing First Name)
- `src/app/api/contacts/route.test.ts` — 4 it() blocks: cursor/hasMore happy path, hasMore:true, empty result, soft-delete exclusion

## Decisions Made

- **vi.hoisted + Proxy mandated**: Single `vi.mock('@/lib/db', ...)` registration with Proxy getter reading through `dbRef.current`. Each `beforeEach` rebinds `dbRef.current = await createTestDb()`. No `vi.doMock` or `afterEach(() => vi.resetModules())` needed.
- **Dynamic import() per it()**: `const { PATCH } = await import('@/app/api/applications/[id]/status/route')` inside each test ensures the route module sees the already-registered mock on every test. Using top-level static import would resolve before vi.mock runs.
- **Explicit updatedAt seeds**: Contacts seeded with `new Date('2026-01-01T00:00:00.000Z')` etc. to make `desc(updatedAt)` ordering deterministic — avoids millisecond-level race conditions in timestamp-based cursor tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript strict-mode cast for Proxy get handler**
- **Found during:** Task 3 (tsc --noEmit verification pass)
- **Issue:** `(dbRef.current as Record<string | symbol, unknown>)` fails TS2352 — `PgliteDatabase & { $client: PGlite }` doesn't overlap sufficiently with `Record<string|symbol, unknown>` because the Drizzle type lacks a string-index signature
- **Fix:** Changed to `(dbRef.current as unknown as Record<string | symbol, unknown>)` — double-cast through `unknown` is the correct pattern for non-overlapping types
- **Files modified:** All 3 test files
- **Verification:** `npx tsc --noEmit` zero errors in new test files
- **Committed in:** `bfbb587` (Task 3 commit)

**2. [Rule 1 - Bug] TypeScript narrow-params cast for PATCH handler in callRoute()**
- **Found during:** Task 3 (tsc --noEmit verification pass)
- **Issue:** `PATCH` handler type is `(request: Request, { params }: { params: Promise<{ id: string }> }) => Promise<Response>` — narrower than `callRoute`'s `RouteHandler` which has `ctx?: { params: Promise<Record<string, string>> }` (optional, wider). TypeScript rejects the assignment without a cast.
- **Fix:** `callRoute(PATCH as unknown as Parameters<typeof callRoute>[0], ...)` at all 4 call sites in the status route test
- **Files modified:** `src/app/api/applications/[id]/status/route.test.ts`
- **Verification:** `npx tsc --noEmit` zero errors
- **Committed in:** `bfbb587` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — TypeScript type correctness under strict mode)
**Impact on plan:** Both fixes necessary for `npx tsc --noEmit` pass criterion. Runtime behavior unchanged — tests ran correctly before tsc fixes too. No scope creep.

## Fixture Data Confirmation

All names, emails, companies, and LinkedIn URLs in `__fixtures__/linkedin-connections.csv` are synthetic:
- Names: Alice Anderson, Bob Brown, Carol Chen (clearly fictional)
- Emails: `alice@example.com`, `bob@example.com`, `carol@example.com` (example.com domain, RFC 2606)
- LinkedIn URLs: `https://linkedin.com/in/alice-anderson` etc. (not real profiles)
- Companies: Acme Corp, Beta Ltd, Gamma Inc, Delta Co (generic placeholder names)
- No real-person information in the test corpus (T-02-06 mitigated)

## Cursor Assertion Confirmation

The GET /api/contacts test asserts `meta.cursor` as the **oldest visible** contact's `updatedAt.toISOString()`, not the newest. This matches the source at `contacts/route.ts` line 91: `data[data.length - 1].updatedAt.toISOString()` — where `data[data.length - 1]` is the oldest (last item after `orderBy desc(updatedAt)`). The soft-delete test explicitly verifies the cursor uses the oldest REMAINING non-archived contact, not the archived one.

## Mock Pattern Confirmation

All 3 test files use `vi.hoisted` + Proxy indirection exclusively. `grep -c 'vi.doMock'` returns 0 for all 3 files.

## Known Stubs

None — all assertions use real database rows, real route handler responses, and real timeline inserts via the un-mocked `logTimeline`.

## Threat Flags

None — no new network endpoints, auth paths, or file access patterns introduced. Fixture data is entirely synthetic (T-02-06 mitigated).

## Issues Encountered

- `--reporter=basic` flag is not valid in Vitest 4.1.6; used default reporter for all verification runs.
- Shell bracket escaping makes direct `npx vitest run "src/app/api/applications/[id]/..."` fail; used `npm run test:run -- "status/route.test"` pattern instead.

## Next Phase Readiness

- All TEST-A2 DB-integration surfaces covered (D-11.1 read path, D-11.2 canTransition enforcement, D-11.3 logTimeline side-effect, D-11.4 CSV parsing)
- 02-04 (BUG-01 regression tests) can proceed — harness is stable and all 74 tests pass
- `npx tsc --noEmit` passes with zero new errors

---
*Phase: 02-test-infrastructure*
*Completed: 2026-05-12*
