# Phase 2: Test Infrastructure - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Stand up a Vitest test harness against the TypeScript codebase, pin the load-bearing logic surfaces with assertions, and add a regression test that fails if the BUG-01 hydration crash is reintroduced.

**In scope:**
- TEST-A1: Vitest + TypeScript wiring, PGlite-backed Drizzle test DB harness, `npm test` script.
- TEST-A2: Coverage for API envelope shape, `canTransition()`, `logTimeline()` side-effect, LinkedIn CSV parsing, bridge-score computation — plus `parseCursor`/`parseLimit` (filters.ts) and `inferSeniority` (seniority.ts) as adjacent cheap wins.
- TEST-A3: Regression test pinning the BUG-01 fix. Two assertions: SSR-only structural test (no `<div>` inside `<button>`, `UserAvatarProfile` present in SSR output) **and** hydration-mount test with `console.error` spy for React hydration warnings.

**Out of scope (deferred to other phases):**
- Auth-gate test sweep across all 34 `/api/*` routes — Phase 3 (Security Hardening).
- Coverage of `match-connections.ts` and the Job Leads scraper modules — Phase 5 (Job Leads Completion) will rework these.
- Playwright/E2E test runner — not needed; existing Playwright usage is browser automation, not a test harness.
- CI integration (GitHub Actions test step). Husky pre-push currently runs `bun run build`; whether to also run `npm test` there is Claude's discretion (recommended: yes, fast tests only).
- Test coverage thresholds, coverage reporting tooling.
- Migration of `drizzle/seed.ts` patterns into test fixtures.

</domain>

<decisions>
## Implementation Decisions

### Framework & Layout (carried forward from Phase 1)
- **D-01:** Test runner is **Vitest** — confirmed by ROADMAP.md and `.planning/codebase/TESTING.md`. No Jest, no node-tap, no alternative.
- **D-02:** Tests are **colocated** with source: `src/lib/domain/pipeline.test.ts` next to `src/lib/domain/pipeline.ts`. No top-level `tests/` directory.
- **D-03:** File naming: `[file].test.ts`. Use `.test.ts` not `.spec.ts` for consistency across the repo.
- **D-04:** Test fixtures (e.g., LinkedIn CSV sample rows) live next to the test that consumes them: `src/features/.../__fixtures__/linkedin-connections.csv`. No shared global fixtures directory.

### DB Harness
- **D-05:** Use **PGlite** (`@electric-sql/pglite`) as the in-process Postgres for tests. Real SQL engine, supports JSONB and text arrays (both used heavily by Heimdall). No network, no Neon test branch, no `vi.mock('@/lib/db')` for routes that touch the DB.
- **D-06:** Schema is applied to PGlite via Drizzle migrations from `drizzle/migrations/`. The planner/researcher should pick the exact wiring (one-time bootstrap per test file via `beforeAll`, vs. shared per-suite instance via test context) — open to either approach as long as schema state is isolated between tests.
- **D-07:** Tests **do NOT mock** `@/lib/db/timeline`. The `logTimeline()` side-effect is verified by querying the real `timeline_events` table in PGlite after the API route runs — assert one row exists with the expected `eventType`, `title`, and entity IDs.
- **D-08:** Pure-logic tests (`canTransition`, `computeBridgeScore`, `parseCursor`, `parseLimit`, `inferSeniority`, CSV parsing) do **NOT** need the PGlite harness — they receive plain inputs and return plain outputs. Use PGlite only for tests that exercise SQL.

### Test Environment Strategy
- **D-09:** Single `vitest.config.ts` defaults to `environment: 'node'`. The one jsdom test (the BUG-01 hydration mount) opts in via `// @vitest-environment jsdom` pragma at the top of the file.
- **D-10:** No `vitest.config.dom.ts` second config, no projects mode, no `environmentMatchGlobs`. One `npm test` command runs everything.

### TEST-A2 Coverage Scope
- **D-11:** Cover the 5 surfaces named in REQUIREMENTS TEST-A2:
  1. API response envelope shape — assert routes return `{ success: true, data: ... }` or `{ success: false, error: ... }`; pick representative routes (one read, one write, one error path).
  2. `canTransition()` — valid forward moves, blocked transitions from terminal states, blocked invalid jumps (e.g., `researching → offer`).
  3. `logTimeline()` side-effect — every write API route under test must produce a real `timeline_events` row.
  4. LinkedIn CSV parsing — happy path + at least one malformed-row edge case (missing column, UTF-8 BOM, empty fields).
  5. `computeBridgeScore` — weight composition (0.4 seniority + 0.35 closeness + 0.25 recency), bounds (0..100), monotonicity sanity check.
- **D-12:** Plus two adjacent surfaces flagged as critical-but-untested in `.planning/codebase/TESTING.md`:
  - `parseCursor` / `parseLimit` in `src/lib/api/filters.ts` — date parsing edge cases, bounds enforcement.
  - `inferSeniority` in `src/features/job-leads/lib/seniority.ts` — title-to-seniority enum mapping; feeds bridge-score, so drift here masks bridge-score regressions.
- **D-13:** **Do NOT** add coverage for `match-connections.ts`, the Job Leads scrapers, or the LinkedIn `linkedin-browser.ts` module. Phase 5 will rewrite parts of these; test investment now would be discarded.

### TEST-A3 Regression Strategy
- **D-14:** **Two tests**, one file, for the BUG-01 regression — both are required to call TEST-A3 done:
  - **SSR structural test** (node environment): use `renderToString` or React Testing Library's server-render API on `<AppSidebar />` with a mock signed-in Clerk user. Parse the HTML and assert:
    - No `<div>` element appears inside any `<button>` element.
    - `UserAvatarProfile`'s markup appears in the SSR output (catches re-introduction of `{user && <UserAvatarProfile />}` gating).
  - **Hydration mount test** (jsdom environment, opted in via pragma): SSR-render `<AppSidebar />`, then `hydrateRoot` it into a jsdom `<div>`. Spy on `console.error`; assert no call matches React's hydration warning patterns (`/hydrat/i`, `/did not match/i`).
- **D-15:** The hydration test relies on React's warning text being reasonably stable. If React ever changes the warning format, the test should be updated — flakiness is acceptable cost; the structural test gives the deterministic backstop.
- **D-16:** Mock Clerk's `useUser()` in the BUG-01 test via `vi.mock('@clerk/nextjs')` — return a fixed user object. Do not pull in the Clerk runtime.

### Claude's Discretion
- **CD-01:** Husky pre-push hook integration: whether to add `npm test` alongside `bun run build`. Recommended default: yes, but only if the full suite stays under ~10s. Otherwise CI-only.
- **CD-02:** Order of plan tasks (`Wave 1: Vitest install + PGlite harness + npm test script`, then `Wave 2: TEST-A2 + TEST-A3` etc.) — planner to decide based on dependency analysis.
- **CD-03:** Whether to commit a `tsconfig.test.json` separate from the main `tsconfig.json` for type-relaxed test files — at the planner's discretion based on whether default tsconfig already covers `*.test.ts`.
- **CD-04:** Exact PGlite bootstrap mechanism (programmatic migration runner vs. drizzle-kit push vs. raw SQL dump) — planner picks based on what's most reliable. The contract is: every test that needs DB gets a freshly-migrated PGlite instance with no leakage.
- **CD-05:** Whether each PGlite test file gets its own DB instance vs. shared with cleanup between tests — planner's call. Default suggestion: per-file instance for isolation, with a fixture helper that returns a fresh `db` per test if cheap enough.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §"TEST-A1, TEST-A2, TEST-A3" — Acceptance criteria for this phase.
- `.planning/ROADMAP.md` §"Phase 2: Test Infrastructure" — Goal statement and 3 success criteria.
- `.planning/phases/01-critical-bug-fix/01-CONTEXT.md` §"D-05" — Phase 1 explicitly handed BUG-01 regression test to this phase.

### Codebase Maps (read before designing tests)
- `.planning/codebase/TESTING.md` — Current testing state (none). Lists unit-test, integration-test, and E2E candidates with file paths. Suggested Vitest mock structure and test naming conventions. **This is the most important reference for this phase.**
- `.planning/codebase/STACK.md` — Confirms Vitest as the natural fit; documents Next.js 16 App Router, Neon serverless HTTP driver, Drizzle ORM.
- `.planning/codebase/CONVENTIONS.md` — Naming patterns (kebab-case files, camelCase functions, named exports), TypeScript strict mode.

### Bug References (for TEST-A3)
- `bug.md` — Symptom and root-cause description for BUG-01 (hydration mismatch + invalid HTML nesting). Lists the exact files that broke.
- `src/components/layout/app-sidebar.tsx` — The component under regression test. Note: `UserAvatarProfile` is rendered twice (line 148 inside `SidebarMenuButton`, line 164 in dropdown header). Both must survive the structural assertion.
- `src/components/user-avatar-profile.tsx` — Renders the `<span>` markup that must appear in SSR output.

### Load-Bearing Modules (for TEST-A2)
- `src/lib/api/types.ts` — Defines `ApiResponse<T>` envelope; tests should import this type.
- `src/lib/domain/pipeline.ts` — `canTransition`, `isTerminalState`, valid-transitions graph.
- `src/lib/db/timeline.ts` — `logTimeline()` insert into `timeline_events`.
- `src/lib/api/filters.ts` — `parseCursor`, `parseLimit` (D-12).
- `src/features/job-leads/lib/prioritization.ts` — `computeBridgeScore`, `buildRecommendations`.
- `src/features/job-leads/lib/seniority.ts` — `inferSeniority` (D-12).
- `drizzle/schema/index.ts` — Schema barrel; needed by PGlite harness to apply migrations.
- `drizzle/migrations/` — Migration files to apply against PGlite.

### Coding Conventions
- `CLAUDE.md` — Project-level conventions: TypeScript strict mode, named exports, no server actions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`drizzle/seed.ts`** — Already uses Drizzle programmatically to insert seed data. Patterns here translate directly to test-fixture seeding inside PGlite.
- **`src/lib/api/types.ts`** — Exports both `ApiResponse<T>` type and the response factory functions (`success`, `created`, `error`, `paginated`). Tests can import and use these directly to construct expected responses.
- **`@faker-js/faker`** — Already in `devDependencies`. Use for generating realistic-looking test data (names, companies, dates).

### Established Patterns
- **`vi.mock` style** — Already telegraphed in `.planning/codebase/TESTING.md`: `vi.mock('@/lib/db', () => ({ db: mockDb }))`. We override this for DB-touching tests by binding the real PGlite `db` via the same module path.
- **Named exports throughout** — Tests import explicit symbols (`import { canTransition } from '@/lib/domain/pipeline'`). No default-export reach-arounds.
- **Path alias `@/*` → `./src/*`** — Tests use the same alias; Vitest config must mirror tsconfig path resolution.

### Integration Points
- **Drizzle client singleton (`src/lib/db/index.ts`)** — Initialized at module load with `neon(process.env.DATABASE_URL!)`. Test setup must replace this with a PGlite-backed Drizzle instance **before** any API-route module is imported. Cleanest pattern: `vi.mock('@/lib/db')` returning a per-test PGlite-backed `db`, then call route handlers normally.
- **`logTimeline` reaches into the same `db` singleton** — once the singleton is replaced with PGlite, `logTimeline` writes to PGlite automatically. No separate mock needed.
- **API route handlers receive standard `Request` objects** — tests construct `new Request('http://localhost/api/...', { method: 'POST', body: JSON.stringify(...) })` and call the route's `POST`/`GET`/etc. function directly. No Next.js test server needed.

### What the Planner Does NOT Need to Research
- Vitest framework choice (D-01, locked).
- File colocation pattern (D-02, locked).
- PGlite as DB harness (D-05, locked).
- Single-config + pragma for env switching (D-09, locked).
- Whether to write TEST-A3 (D-14, locked — both tests required).

### What the Planner DOES Need to Research / Decide
- PGlite + Drizzle wiring specifics — exact API to apply migrations programmatically (Drizzle's `migrate()` function, or `pushSchema`, or raw SQL execution from migration files).
- Whether `next/server` `Request`/`Response` types Just Work in test handlers, or whether they need a polyfill in node environment.
- Whether `@clerk/nextjs` mocking introduces import-time side effects that fight Vitest's module resolver.

</code_context>

<specifics>
## Specific Ideas

- TEST-A3 should be **one test file** (e.g., `src/components/layout/app-sidebar.test.tsx`) with two `describe` blocks — one for SSR structural, one for hydration mount. The hydration block opens with `// @vitest-environment jsdom`. This keeps the BUG-01 fence visible in one place.
- The PGlite harness setup file should live at `src/test-utils/pglite.ts` (or `src/lib/test-utils/`) and export a single helper: `async function createTestDb(): Promise<DbInstance>`. Tests `import { createTestDb } from '@/test-utils/pglite'` and use it in `beforeAll` or `beforeEach`.
- For API-route tests, the harness should also offer a small helper to call a route handler: `async function callRoute(handler, { method, body, params })`. Eliminates `new Request(...)` boilerplate in every test.
- The `parseCursor` / `parseLimit` tests should be a separate `filters.test.ts` file with ~5 cases each — keep it small.

</specifics>

<deferred>
## Deferred Ideas

- **Auth-gate test sweep** — verify every `/api/*` route returns 401 without a Clerk session. Owned by Phase 3 (Security Hardening), SEC-A1.
- **`match-connections.ts` coverage** — Job Leads recommendation pipeline. Phase 5 will rewrite parts of this; testing now is throwaway work.
- **LinkedIn scraper tests** — Playwright-driven E2E coverage of `scrape-job-page.ts`, `scrape-connections.ts`. Phase 5 owns those modules and their behavior changes.
- **Coverage tooling / thresholds** — `c8` or `@vitest/coverage-v8`, coverage reporting in CI, per-directory thresholds. Not in scope this phase; can be added later as a small infra phase or folded into Phase 6 (Performance) if desired.
- **CI integration** — adding a GitHub Actions step that runs `npm test`. Out of scope; the Husky pre-push hook covers local-only enforcement for now.
- **`tsconfig.test.json`** — possible but not predetermined. The planner can introduce one if vitest's default tsconfig handling proves insufficient.
- **`drizzle-kit push` against PGlite vs. running migration files** — implementation detail; planner chooses.

</deferred>

---

*Phase: 2-Test Infrastructure*
*Context gathered: 2026-05-12*
