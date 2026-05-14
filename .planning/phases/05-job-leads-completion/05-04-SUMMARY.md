---
phase: 05-job-leads-completion
plan: 04
subsystem: api

tags: [api, drizzle, zod, state-machine, job-leads, vitest, tdd]

# Dependency graph
requires:
  - phase: 05-job-leads-completion
    plan: 01
    provides: jobLeadStatusEnum extended with queued+failed, last_error/last_error_at columns, ScrapedProspect type at @/features/job-leads/lib/types
provides:
  - src/lib/domain/job-lead-pipeline.ts — canJobLeadTransition + jobLeadTransitions graph (D-08 state machine, single source of truth for /status + /search)
  - PATCH /api/job-leads/[id]/status with state-machine enforcement, lastError write/clear, eventType-per-transition
  - POST /api/job-leads/[id]/prospects with 5-field Zod schema, single-statement bulk insert, status flip to 'found'
  - POST /api/job-leads/[id]/search converted to thin synchronous status flip (no IIFE, no Playwright imports)
  - GET /api/job-leads extended with ?status= multi-value filter
  - PGlite test coverage: 22 new test cases across 4 test files
affects: [05-05, 05-06, 05-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "State-machine module pattern mirrored from src/lib/domain/pipeline.ts — transitions Record<string,string[]>, terminal-states array, canX function — both /status and /search import the SAME function for consistency"
    - "5-field ScrapedProspect Zod schema with z.string().max(500).nullable() on profileSnippet — field flows through validation → row mapping → DB column with no silent drop"
    - "Single-statement bulk insert: validated.prospects.map(...) → db.insert(table).values(rows) — never a per-row for loop"
    - "Route-file content assertion via readFileSync + .not.toMatch(/pattern/) — locks in deletion of forbidden imports as a regression test"

key-files:
  created:
    - src/lib/domain/job-lead-pipeline.ts
    - src/app/api/job-leads/[id]/prospects/route.ts
    - src/app/api/job-leads/[id]/status/route.test.ts
    - src/app/api/job-leads/[id]/prospects/route.test.ts
    - src/app/api/job-leads/[id]/search/route.test.ts
    - src/app/api/job-leads/route.test.ts
  modified:
    - src/app/api/job-leads/[id]/status/route.ts
    - src/app/api/job-leads/[id]/search/route.ts
    - src/app/api/job-leads/route.ts

key-decisions:
  - "canJobLeadTransition is the single source of truth for transition validation. Both PATCH /status and POST /search import the same function — no hand-coded equality checks (lead.status !== 'scraped'). This eliminates the drift risk between the two routes."
  - "'failed' is recoverable (failed → queued retry path per D-08), not terminal. Only 'archived' is in jobLeadTerminalStates."
  - "profileSnippet wired through end-to-end (Zod schema → row mapping → DB column). The plan-checker flagged that a hardcoded null in row mapping would silently discard the skill's extraction work. Round-trip Test 1b asserts the persisted column matches the input string."
  - "Single-statement bulk insert (db.insert(prospects).values(rows)) replaces the deleted route's per-row for loop. Plan calls this out as the perf-antipattern PERF-A1 incidentally fixes; the new code never reintroduces a row-level loop."
  - "Test 11 uses readFileSync + .not.toMatch to assert the route file does NOT contain scrapeConnections|matchConnections|inferSeniority imports — a regression test that locks the deletion in even if a future agent reintroduces the IIFE."
  - "Empty-array short-circuit: db.insert(...).values([]) would throw — added `if (rows.length > 0)` guard before the bulk insert, even though Zod's max(200) cap doesn't have a min(1) (intentional — the skill may legitimately POST 0 prospects when no mutual connections found)."
  - "GET regression Test 8 locks the response shape to exactly {status, prospectCount, updatedAt} via Object.keys(body.data).sort() — guards against future PATCH-handler additions accidentally leaking through to GET response."

patterns-established:
  - "Per-route TDD cycle: write the failing test file (RED commit), implement the handler (GREEN commit) — clean atomic history for review."
  - "vi.hoisted + Proxy mock of @/lib/db lets PGlite live behind the same `db` import the production code uses; tests touch real Postgres-compatible storage without per-test seed of the global singleton."

requirements-completed: [JL-B3, JL-B4]

# Metrics
duration: ~5min (commit-to-commit, including test runs)
completed: 2026-05-14
---

# Phase 05 Plan 04: API Routes + State Machine + Tests Summary

**Built the API surface the Claude Code skill (Plan 06) writes against: state-machine-enforcing PATCH /status, single-statement bulk-prospects POST with end-to-end profileSnippet persistence, thin synchronous POST /search gated by canJobLeadTransition, and GET multi-value status filter — plus 22 PGlite-backed tests locking the contract.**

## Performance

- **Duration:** ~5 min (afb9048 → 28b32cc, 4 commits)
- **Tasks:** 2 (TDD RED+GREEN per task = 4 commits total)
- **Test results:** **129/129 passing** project-wide; **23/23 passing** within src/app/api/job-leads (8 status + 7 prospects + 5 search + 3 list)

## Accomplishments

- **State-machine module (`src/lib/domain/job-lead-pipeline.ts`):** Encodes the D-08 transition graph as a `Record<string, string[]>` plus `jobLeadTerminalStates` array (only `'archived'`) and `canJobLeadTransition(from, to)` function. Mirrors `src/lib/domain/pipeline.ts` shape exactly — same module pattern future readers will recognize.
- **PATCH `/api/job-leads/[id]/status`:** Zod-validated `{ status, lastError? }` body, transition gate via `canJobLeadTransition`, writes `last_error` + `last_error_at` on `'failed'` transitions, clears them on `'queued'`/`'found'` paths, emits the correct eventType per transition (queued/claimed/failed/complete/status_changed). GET handler preserved unchanged.
- **POST `/api/job-leads/[id]/prospects`:** NEW route. Full 5-field `ScrapedProspect` Zod schema including `profileSnippet: z.string().max(500).nullable()`. Single `db.insert(prospects).values(rows)` bulk insert mapping the validated input (NOT a hardcoded `profileSnippet: null`). Flips lead to `'found'`, emits `job_lead_search_complete` with `prospectCount` metadata. Status guard rejects writes when lead is not in `'searching'`.
- **POST `/api/job-leads/[id]/search`:** Rewritten from 103 lines with fire-and-forget IIFE + Playwright imports → 56 lines of synchronous thin status flip. Uses `canJobLeadTransition(lead.status, 'queued')` — same gate as PATCH /status (single source of truth). Real connection scraping is now out-of-band via the Claude Code skill (Plan 06).
- **GET `/api/job-leads`:** Extended with `?status=` query param using `parseArrayParam` + `inArray(jobLeads.status, ...)`. Multi-value supported via comma-separated input (e.g., `?status=queued,failed`). No-filter behavior preserved.
- **22 new PGlite-backed test cases** lock the contract end-to-end (status transitions, error column lifecycle, bulk insert shape, profileSnippet round-trip via SELECT, transition rejection paths, no-DB-mutation on rejection, eventType-per-transition, IIFE-deletion regression assertion).

## Task Commits

Branch: `worktree-agent-aaf9ef71396818f82`

1. **Task 1 RED — failing PATCH /status tests** — `afb9048` (test)
2. **Task 1 GREEN — state-machine module + PATCH handler** — `992b9a7` (feat)
3. **Task 2 RED — failing prospects + search + list tests** — `4306f19` (test)
4. **Task 2 GREEN — bulk-prospects + thin /search + GET filter** — `28b32cc` (feat)

## Files Created/Modified

### Created
- `src/lib/domain/job-lead-pipeline.ts` — D-08 state-machine module (28 lines)
- `src/app/api/job-leads/[id]/prospects/route.ts` — bulk-prospects POST handler (89 lines)
- `src/app/api/job-leads/[id]/status/route.test.ts` — 8 PATCH + GET tests
- `src/app/api/job-leads/[id]/prospects/route.test.ts` — 7 bulk-insert tests (incl. profileSnippet round-trip)
- `src/app/api/job-leads/[id]/search/route.test.ts` — 5 thin-flip tests (incl. file-content deletion regression)
- `src/app/api/job-leads/route.test.ts` — 3 GET filter tests

### Modified
- `src/app/api/job-leads/[id]/status/route.ts` — added PATCH handler beneath the existing GET (which is preserved verbatim)
- `src/app/api/job-leads/[id]/search/route.ts` — rewritten to thin status flip (103 → 56 lines, fire-and-forget IIFE deleted, scrapeConnections/matchConnections/inferSeniority imports removed)
- `src/app/api/job-leads/route.ts` — GET handler accepts `?status=` via parseArrayParam + inArray

## Routes Touched and Event Types Emitted (per plan output spec)

| Route | Method | Path | Transition | Event Type Emitted |
|-------|--------|------|------------|--------------------|
| status | PATCH | `/api/job-leads/[id]/status` | scraped→queued | `job_lead_search_queued` |
| status | PATCH | `/api/job-leads/[id]/status` | queued→searching | `job_lead_search_claimed` |
| status | PATCH | `/api/job-leads/[id]/status` | searching→failed | `job_lead_search_failed` |
| status | PATCH | `/api/job-leads/[id]/status` | failed→queued (retry) | `job_lead_search_queued` |
| status | PATCH | `/api/job-leads/[id]/status` | other (e.g. found→ready) | `job_lead_status_changed` |
| prospects | POST | `/api/job-leads/[id]/prospects` | searching→found | `job_lead_search_complete` |
| search | POST | `/api/job-leads/[id]/search` | scraped→queued or failed→queued | `job_lead_search_queued` |
| list | GET | `/api/job-leads` | n/a (read) | — |
| status | GET | `/api/job-leads/[id]/status` | n/a (read) | — |

## Plan Output Spec — Per-Bullet Confirmation

1. **`/search` IIFE fully removed (line count 103 → ~30 expected, actual 56):** ✅ Confirmed — `wc -l src/app/api/job-leads/[id]/search/route.ts` returns 56. The expected ~30 was the most-aggressive trim; 56 is the realistic minimum once you keep clear comments, the canJobLeadTransition gate, the timeline emission, and the success envelope return — all required.
2. **POST /search uses `canJobLeadTransition` (no hand-coded equality):** ✅ Confirmed — `grep -c "canJobLeadTransition" src/app/api/job-leads/[id]/search/route.ts` = 3 (1 import + 1 gate call + 1 doc comment). `grep -c "lead\.status !== 'scraped'\|lead\.status !== 'failed'" src/app/api/job-leads/[id]/search/route.ts` = 0.
3. **profileSnippet persisted end-to-end:** ✅ Confirmed — Test 1b PASSES (asserts `persisted.find(p => p.name === 'Alice')!.profileSnippet === 'Building data infra. ex-Stripe.'` AND `persisted.find(p => p.name === 'Bob')!.profileSnippet === null`). `grep -c "profileSnippet" src/app/api/job-leads/[id]/prospects/route.ts` = 4 (Zod field + row mapping + 2 comment mentions). `grep -c "profileSnippet: null" src/app/api/job-leads/[id]/prospects/route.ts` = 0 (no hardcoded null in row mapping).
4. **inferSeniority preserved in /prospects/route.ts (CONTEXT.md D-12):** ✅ Confirmed — `grep -c "import.*inferSeniority.*from '@/features/job-leads/lib/seniority'" src/app/api/job-leads/[id]/prospects/route.ts` = 1. Import is from the dedicated `seniority.ts` module, NOT from the soon-to-be-deleted `scrape-connections.ts`.

## 22 Test Cases — PASS/FAIL Table

### status/route.test.ts (8 cases)

| # | Test name | Status |
|---|-----------|--------|
| 1 | scraped → queued: 200, clears lastError, emits `job_lead_search_queued` | PASS |
| 2 | queued → searching: 200, emits `job_lead_search_claimed` | PASS |
| 3 | searching → failed: 200, sets lastError + lastErrorAt, emits `job_lead_search_failed` | PASS |
| 4 | failed → queued (retry): 200, clears lastError + lastErrorAt | PASS |
| 5 | pending → found: 400 `Invalid transition: pending -> found`, no mutation, no timeline | PASS |
| 6 | Invalid status value: 400 Zod error, no timeline | PASS |
| 7 | Non-existent lead: 404 `Job lead not found` | PASS |
| 8 | GET regression — response shape exactly `{status, prospectCount, updatedAt}` | PASS |

### prospects/route.test.ts (7 cases)

| # | Test name | Status |
|---|-----------|--------|
| 1 | POST 5 prospects: 201, flips to `'found'`, prospectCount=5, lastError cleared, emits `job_lead_search_complete` with metadata.prospectCount=5 | PASS |
| 1b | **profileSnippet round-trip:** Alice persists `'Building data infra. ex-Stripe.'`, Bob persists `null` | **PASS** |
| 2 | Empty name string: 400 Zod, no rows inserted | PASS |
| 3 | 201 prospects: 400 (max 200 cap), no rows inserted | PASS |
| 4 | Lead in `'pending'`: 400 `Cannot write prospects to lead in status 'pending'`, no rows inserted | PASS |
| 5 | Non-existent lead: 404 `Job lead not found` | PASS |
| 6 | Bulk insert is single statement (5 rows after one POST = 5 persisted) | PASS |

### search/route.test.ts (5 cases)

| # | Test name | Status |
|---|-----------|--------|
| 7 | scraped → queued: 200, clears lastError, emits `job_lead_search_queued` | PASS |
| 8 | failed → queued (retry): 200, clears lastError + lastErrorAt | PASS |
| 9 | searching → queued REJECTED via canJobLeadTransition gate: 400 `Cannot queue lead in status 'searching'`, no mutation, no timeline | PASS |
| 10 | Non-existent lead: 404 | PASS |
| 11 | Route file deletion regression (readFileSync content): no `scrapeConnections`/`matchConnections`/`inferSeniority`, contains `canJobLeadTransition` | PASS |

### route.test.ts (3 cases)

| # | Test name | Status |
|---|-----------|--------|
| 12 | `?status=queued` returns only queued lead | PASS |
| 13 | `?status=queued,failed` returns queued + failed (multi-value) | PASS |
| 14 | No status param preserves all-non-archived behavior | PASS |

**Total: 22 PASS / 0 FAIL.** Full suite: 129 PASS / 0 FAIL across 16 test files.

## Verification Grep Checks

| Check | Required | Actual | Result |
|-------|----------|--------|--------|
| `grep -c "canJobLeadTransition" src/app/api/job-leads/[id]/search/route.ts` | ≥ 1 | 3 | ✅ |
| `grep -c "profileSnippet" src/app/api/job-leads/[id]/prospects/route.ts` | ≥ 2 | 4 | ✅ |
| `grep -c "profileSnippet: null" src/app/api/job-leads/[id]/prospects/route.ts` | 0 | 0 | ✅ |
| `grep -c "scrapeConnections\|matchConnections" src/app/api/job-leads/[id]/search/route.ts` | 0 | 0 | ✅ |
| `grep -c "for (const" src/app/api/job-leads/[id]/prospects/route.ts` | 0 | 0 | ✅ |
| `grep -c "lead\.status !== 'scraped'\|lead\.status !== 'failed'"` in /search/route.ts | 0 | 0 | ✅ |
| `grep -c "parseArrayParam" src/app/api/job-leads/route.ts` | ≥ 1 | 2 | ✅ |
| `inArray(jobLeads.status, ...)` in src/app/api/job-leads/route.ts | present | present (multi-line) | ✅ |
| `scrapeConnections\|matchConnections` in `src/app/api/` production code (excluding `.test.ts`) | 0 | 0 | ✅ |
| `src/lib/domain/job-lead-pipeline.ts` exports `canJobLeadTransition` | yes | yes | ✅ |

## TypeScript Status

`npx tsc --noEmit` shows only pre-existing errors that are out of scope:
- `src/features/job-leads/lib/prioritization.ts` lines 70–72 (downlevelIteration / implicit any) — pre-existing, logged in `.planning/phases/04-starter-template-cleanup/deferred-items.md`.
- `src/features/job-leads/lib/scrape-connections.ts` lines 56, 93, 187 (downlevelIteration) — pre-existing; the entire file is scheduled for deletion in Plan 05-07.

No new TypeScript errors introduced by Plan 05-04.

## Decisions Made

1. **`canJobLeadTransition` is the single source of truth.** Both PATCH /status and POST /search import the same function — there is no possibility of drift between the two routes' transition graphs. The plan-checker called this out explicitly, and Test 11 + Test 9 lock it in (Test 11 asserts the import is present in /search; Test 9 verifies the gate rejects searching→queued through the function, not through a hand-coded check).
2. **`'failed'` is recoverable, not terminal.** `jobLeadTerminalStates = ['archived']` only. `jobLeadTransitions['failed'] = ['queued']` enables the retry path.
3. **Empty-prospects-array short-circuit.** Zod's `max(200)` doesn't enforce `min(1)` — the skill may legitimately POST 0 prospects when no mutual connections were found. Added an `if (rows.length > 0)` guard before the `db.insert(...).values(rows)` call, since Drizzle/PostgreSQL would otherwise error on `VALUES ()`.
4. **Test 11 is a deletion regression.** Uses `readFileSync` + `.not.toMatch(/pattern/)` to read the route.ts source verbatim — locks the IIFE deletion in even if a future agent reintroduces the imports. Lighter than mocking Playwright; faster too.
5. **GET regression locked via `Object.keys(body.data).sort()`.** Test 8 asserts the response body has exactly `['prospectCount', 'status', 'updatedAt']` — guards against future PATCH-handler additions accidentally leaking new fields through the GET response.
6. **Atomic per-task commits with explicit TDD RED → GREEN cycle.** Four commits total: RED (Task 1 tests) → GREEN (Task 1 module + handler) → RED (Task 2 tests) → GREEN (Task 2 routes). Clean review history.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Symlinked `node_modules` from main repo into worktree**

- **Found during:** Pre-Task-1 environment check (per Plan 05-01 SUMMARY precedent)
- **Issue:** Worktree spawned without `node_modules`. `npm run test:run` would fail without it.
- **Fix:** `ln -s /Users/sbronstein/Github/heimdall/node_modules /Users/sbronstein/Github/heimdall/.claude/worktrees/agent-aaf9ef71396818f82/node_modules`. Verified `git check-ignore node_modules` returns the gitignore pattern; no tracked-file impact.
- **Note:** Did NOT copy `.env.local` (auto-mode classifier denied it). Tests use PGlite + the vi.hoisted Proxy mock of `@/lib/db` — no live DATABASE_URL needed for the test path. Confirmed: full suite passes (129/129) without `.env.local` in the worktree.

**2. Discovery — Empty-array bulk-insert guard added (Rule 2: missing critical functionality)**

- **Found during:** Task 2 implementation
- **Issue:** Plan body did not specify behavior for `prospects: []`. Zod's `max(200)` allows zero. `db.insert(prospects).values([])` would throw at the SQL layer.
- **Fix:** Added `if (rows.length > 0)` guard around the bulk insert. Lead still flips to `'found'` with `prospectCount: 0` and timeline event still emits — consistent with the rest of the route's semantics (a successful search that produced 0 prospects is still a successful search).
- **Tests cover:** Test 1 and Test 6 cover the non-empty path; the guard is a defensive zero-case (no dedicated test added since the plan didn't enumerate it — covered implicitly by the bulkBody Zod schema accepting `[]`).
- **Committed in:** `28b32cc` (Task 2 GREEN)

**Total deviations:** 2 (1 environment-only Rule 3, 1 Rule 2 defensive guard). No scope creep. All plan acceptance criteria satisfied.

## Issues Encountered

- **Filter glob expansion in zsh:** `npm run test:run -- src/app/api/job-leads/\[id\]/status` returns "No test files found" because zsh expands `[id]` as a character class. Workaround: filter on `src/app/api/job-leads` (which catches all four test files at once). Documented for future task runners.
- **Pre-existing TypeScript errors:** `prioritization.ts` (3) and `scrape-connections.ts` (3) errors. Unchanged before/after this plan — confirmed via `npx tsc --noEmit` diff.

## Threat Model Verification

| Threat ID | Mitigation Verified |
|-----------|---------------------|
| T-05-04-01 (bulk-body tampering) | ✅ Zod schema enforces all field-level + array-level caps. Tests 2 (empty name) + 3 (>200) prove the gate. |
| T-05-04-02 (state-machine bypass) | ✅ `canJobLeadTransition` rejects invalid transitions in both /status (Test 5) and /search (Test 9). No DB mutation, no timeline event on rejection. |
| T-05-04-03 (lastError IDOR/XSS) | ✅ Zod caps `lastError` at 220 chars. Skill is the only writer; UI rendering will use React JSX text content (Plan 05). |
| T-05-04-04 (bulk-endpoint DoS) | ✅ Top-level `.max(200)` cap. profileSnippet bounded at 500 chars. Test 3 verifies. |
| T-05-04-05 (status changes without audit trail) | ✅ Every successful PATCH /status, POST /prospects, POST /search emits `logTimeline()`. Every test asserting a successful path also asserts exactly one timeline row exists. |

## Threat Flags

None — no new trust boundaries or attack surface introduced beyond what the plan's `<threat_model>` already enumerates.

## User Setup Required

None. The routes are immediately consumable:
- **Plan 05-05 (UI):** Can call `POST /api/job-leads/[id]/search` to re-queue a failed lead, render `last_error` from GET /api/job-leads, filter by `?status=` for the queued/failed buckets.
- **Plan 05-06 (Skill):** Can call PATCH /status (`searching` to claim, `failed` with `lastError` on error) and POST /prospects to write extracted ScrapedProspect rows in one bulk request.
- **Plan 05-07 (Deletion):** `scrape-connections.ts` deletion now safe — no production code in `src/app/api/` references it (Test 11 locks the assertion).

## Next Phase Readiness

- **Plan 05-05 (UI):** Unblocked. The API contract is stable and tested.
- **Plan 05-06 (Skill):** Unblocked. profileSnippet round-trip means the skill's DOM-extracted snippet survives the wire and lands in the DB.
- **Plan 05-07 (scrape-connections.ts deletion):** Pre-requisite (no production import) verified.

## Self-Check

Verified before commit:
- `src/lib/domain/job-lead-pipeline.ts` exists (FOUND)
- `src/app/api/job-leads/[id]/status/route.ts` modified, exports both GET and PATCH (FOUND)
- `src/app/api/job-leads/[id]/search/route.ts` modified, line count 56 (FOUND)
- `src/app/api/job-leads/[id]/prospects/route.ts` created (FOUND)
- `src/app/api/job-leads/route.ts` modified with parseArrayParam + inArray (FOUND)
- 4 test files created (FOUND)
- Commit `afb9048` (Task 1 RED) — FOUND in `git log`
- Commit `992b9a7` (Task 1 GREEN) — FOUND in `git log`
- Commit `4306f19` (Task 2 RED) — FOUND in `git log`
- Commit `28b32cc` (Task 2 GREEN) — FOUND in `git log`
- `npm run test:run` exit 0 with 129/129 passing — VERIFIED
- `npm run test:run -- src/app/api/job-leads` exit 0 with 23/23 passing — VERIFIED
- `npx tsc --noEmit` shows only pre-existing errors — VERIFIED

## Self-Check: PASSED

---
*Phase: 05-job-leads-completion*
*Plan: 04*
*Completed: 2026-05-14*
