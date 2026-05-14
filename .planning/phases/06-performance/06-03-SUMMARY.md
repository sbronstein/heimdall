---
phase: 06-performance
plan: "03"
subsystem: contacts-import-categorize
tags: [drizzle, sql-template, bulk-update, values-clause, contacts]
dependency_graph:
  requires: [06-01]
  provides: [PERF-A3-bulk-categorize]
  affects: [src/app/api/contacts/import/categorize/route.ts]
tech_stack:
  added: []
  patterns: [UPDATE...FROM(VALUES) via db.execute(sql), sql.join for parameterized VALUES list]
key_files:
  created:
    - src/app/api/contacts/import/categorize/route.test.ts
  modified:
    - src/app/api/contacts/import/categorize/route.ts
decisions:
  - "VALUES approach instead of unnest — Drizzle v0.45.1 renders JS arrays as row-constructor tuples that Postgres rejects as uuid[] casts; VALUES with per-element bound parameters achieves identical single-round-trip semantics (Rule 1 deviation from plan spec)"
  - "cid column alias instead of id — avoids ambiguous column reference error in WHERE contacts.id = data.id when both tables are in scope"
  - "sql.join with sql\`, \` separator instead of sql.raw(', ') — eliminates sql.raw entirely while achieving identical SQL output; satisfies the plan's grep security gate"
  - "beforeAll pre-warm for PGlite module loading — prevents first-test timeout on cold WASM start; other tests benefit from cached module"
metrics:
  duration: "~25 minutes"
  completed: "2026-05-14"
  tasks_completed: 2
  files_changed: 2
---

# Phase 6 Plan 03: Bulk Categorize UPDATE via db.execute(sql) Summary

Single-round-trip bulk UPDATE replaces the N+1 per-row `db.update()` loop in `PATCH /api/contacts/import/categorize` using Drizzle's `sql` template tag with `UPDATE...FROM (VALUES ...) AS data(cid, cl)` and per-element bound parameters.

## What Was Built

### Task 1: Route Rewrite (GREEN — feat commit 069a180)

Rewrote `src/app/api/contacts/import/categorize/route.ts` to replace the `for (...) { await db.update(contacts) }` N+1 loop with a single `db.execute(sql\`UPDATE contacts SET closeness = data.cl, updated_at = NOW() FROM (VALUES ...) AS data(cid, cl) WHERE contacts.id = data.cid RETURNING contacts.id\`)`.

**Exact SQL emitted (confirmed from implementation):**

```sql
UPDATE contacts
SET closeness = data.cl,
    updated_at = NOW()
FROM (VALUES ($1::uuid, $2::contact_closeness), ($3::uuid, $4::contact_closeness), ...) AS data(cid, cl)
WHERE contacts.id = data.cid
RETURNING contacts.id
```

- `contacts` and `contacts.id` are LITERAL identifiers — NOT Drizzle pgTable interpolations (WARNING 2 fix)
- Each `$N` is a bound parameter from `sql.join(updates.map((u) => sql\`(${u.contactId}::uuid, ${u.closeness}::contact_closeness)\`), sql\`, \``)`
- `cid` alias avoids column-name ambiguity between contacts.id and data.id
- `RETURNING contacts.id` provides deterministic updated row count (rowCount unreliable on neon-http and pglite)

**Postgres enum type used:** `contact_closeness` (confirmed in `drizzle/schema/enums.ts` line 133 — matches plan spec exactly)

### Task 2: Test File (RED commit 6867d7d + GREEN commit 069a180)

Created `src/app/api/contacts/import/categorize/route.test.ts` with 6 tests covering all D-19 invariants:

| Test | What It Pins |
|------|-------------|
| Test 1: happy path | 3 contacts updated, correct closeness values, updated_at advances |
| Test 2: single-statement evidence | All 3 updated_at within 50ms window (single NOW() call) |
| Test 3: RETURNING count + envelope pin | `{ success: true, data: { updated: 3, total: 4 } }` with `toEqual` (N=4, M=3) |
| Test 4: empty-input early-return | No SQL issued — byte-identical updated_at proves no UPDATE ran |
| Test 5: idempotency under retry | Second call: same final state, updated_at strictly greater (proves UPDATE ran) |
| Test 6: Zod validation | 400 on invalid UUID, no rows mutated |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] VALUES approach instead of unnest(${ids}::uuid[]) — Drizzle array rendering incompatibility**

- **Found during:** Task 1 GREEN phase (test failures with 500 responses)
- **Issue:** Plan spec called for `unnest(${ids}::uuid[], ${closenesses}::contact_closeness[])`. Drizzle v0.45.1's `sql` template tag renders a JS array `${['a','b']}` as a row-constructor tuple `($1, $2)` NOT as a Postgres array literal. The SQL generated was `unnest(($1, $2)::uuid[], ($3, $4)::contact_closeness[])` which Postgres rejects with "cannot cast type record to uuid[]".
- **Fix:** Used `UPDATE...FROM (VALUES ...) AS data(cid, cl)` with `sql.join()` and per-element parameters. Achieves identical single-round-trip semantics. Works with both PGlite (test harness) and Neon HTTP (production). The `cid` alias was added to avoid the "column reference 'id' is ambiguous" error.
- **D-06 compliance preserved:** `sql` template tag inside `db.execute()` — no `sql.raw` for user data, no string concatenation.
- **Files modified:** `src/app/api/contacts/import/categorize/route.ts`
- **Commit:** 069a180

**2. [Rule 1 - Bug] sql.raw(', ') separator replaced with sql\`, \` — plan grep security gate**

- **Found during:** Task 1 implementation verification
- **Issue:** Initial implementation used `sql.raw(', ')` as the `sql.join` separator. The plan's acceptance criteria requires `grep -c "sql.raw" route.ts` returns 0 (security gate). While `sql.raw(', ')` for a static comma is safe, the gate is intentionally strict.
- **Fix:** Replaced `sql.raw(', ')` with the tagged template literal `sql\`, \`` which produces equivalent SQL with no `sql.raw` call anywhere in the file.
- **Files modified:** `src/app/api/contacts/import/categorize/route.ts`
- **Commit:** 069a180

**3. [Rule 1 - Bug] Comment text removed ${contacts} reference — grep gate false positive**

- **Found during:** Task 1 verification
- **Issue:** A comment documenting the forbidden `${pgTable}` pattern contained the literal text `${contacts}` / `${contacts.id}`. The plan's grep gate `grep -E '\$\{contacts(\.[a-zA-Z]+)?\}'` matched the comment text, returning count 1 instead of 0.
- **Fix:** Rephrased comment to describe the forbidden pattern without containing the exact characters that match the grep.
- **Files modified:** `src/app/api/contacts/import/categorize/route.ts`
- **Commit:** 069a180

**4. [Rule 1 - Bug] Test timing — PGlite cold-start module loading causes first-test timeout**

- **Found during:** Task 2 test run
- **Issue:** Test 1 intermittently timed out at vitest's default 5000ms limit because PGlite WASM module loading takes 2-4s on first import. Subsequent tests use the cached module and pass quickly.
- **Fix:** Added `beforeAll` that pre-warms the module import with a 30s timeout, so Test 1 doesn't bear the full cold-start cost. Also added 30s timeout to `beforeEach` to allow for PGlite createTestDb overhead.
- **Files modified:** `src/app/api/contacts/import/categorize/route.test.ts`
- **Commit:** 069a180

## Verification Results

All plan acceptance criteria verified:

- `grep -c "sql.raw" route.ts` → 0 (no string-concatenated SQL)
- `grep -E '\$\{contacts(\.[a-zA-Z]+)?\}' route.ts` → 0 (no pgTable interpolation)
- `grep -c "db.execute(sql" route.ts` → 1 (single execute call)
- `grep -c "UPDATE contacts" route.ts` → 1 (literal identifier)
- `grep -c "WHERE contacts.id" route.ts` → 1 (literal identifier)
- `grep -c "updates.length === 0" route.ts` → 1 (empty-input early return)
- All 6 tests pass: `npm run test:run -- src/app/api/contacts/import/categorize/route.test.ts`
- TypeScript errors in route.ts: 0 (pre-existing errors in prioritization.ts are unrelated)

## Performance Impact

Estimated performance improvement for the 1500-contact triage workflow: Previously, categorizing all 1500 contacts required 1500 individual HTTP round-trips to the Neon database. After this change, it requires exactly 1 SQL statement with 3000 bound parameters (1500 ids + 1500 closeness values). At ~50ms per Neon HTTP round-trip, this reduces ~75s of database time to ~50ms — a ~1500x reduction in database round-trips.

## Stub Scan

No stubs. The route returns actual data from `RETURNING contacts.id`. The response shape `{ updated, total }` is fully wired.

## Self-Check: PASSED

- `src/app/api/contacts/import/categorize/route.ts` — FOUND
- `src/app/api/contacts/import/categorize/route.test.ts` — FOUND
- Commit 6867d7d (test RED) — FOUND
- Commit 069a180 (feat GREEN) — FOUND
