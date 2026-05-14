# Phase 6: Performance - Context

**Gathered:** 2026-05-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Eliminate per-row DB round-trips and add hot-path indexes so the 1500-contact dataset stops straining import, bulk categorize, prospect writes, bridge-building, and recommendations. The scope is **horizontal: N+1 elimination + index migration**, scoped to the five PERF-A* requirements **plus** three incidentals discovered during codebase scout (see Critical Findings below) and **plus** the restoration of the `matchConnections` caller that Phase 5's reshape unintentionally orphaned.

**In scope:**
- **PERF-A1 (bridges half):** Bulk-insert `prospectBridges` in `matchConnections`. The prospect-bulk-insert half is **already satisfied** by Phase 5 (`/api/job-leads/[id]/prospects/route.ts:60` uses a single `db.insert(prospects).values(rows)`).
- **PERF-A2:** Restore `matchConnections` caller by invoking it **inline inside `POST /api/job-leads/[id]/prospects`**, wrapped in `db.transaction()` with the existing prospect bulk-insert and status flip. Make the bridge insert itself a single `db.insert(prospectBridges).values(bridgeValues).onConflictDoNothing()`.
- **PERF-A3:** Batch closeness updates in `/api/contacts/import/categorize` using a single `UPDATE contacts SET closeness = data.cl FROM (SELECT * FROM unnest(${ids}::uuid[], ${closenesses}::text[]) AS data(id, cl)) WHERE contacts.id = data.id` via Drizzle's `sql` template tag inside `db.execute()`.
- **PERF-A4:** Add Drizzle `index()` definitions on `contacts(archived_at)`, `contacts(linkedin_url)`, `contacts(company_id)`, `contacts(linkedin_connection_date)`, and `companies(name)`. Plus a **UNIQUE partial index** on `contacts(linkedin_url) WHERE linkedin_url IS NOT NULL` to enable PERF-A5's `ON CONFLICT DO NOTHING`. Generated via `npm run db:generate` and applied via `npm run db:migrate`.
- **PERF-A5 (DB-side dedup):** `/api/contacts/import` becomes a single bulk insert: build rows array, then `db.insert(contacts).values([...rows]).onConflictDoNothing({ target: contacts.linkedinUrl })`. The full `SELECT * FROM contacts` scan goes away. Name+company secondary dedup stays in-app but uses a **narrowed SELECT** keyed only on `(lower(first_name), lower(last_name), lower(coalesce(current_company,'')))` tuples that appear in the CSV — not a full scan.
- **PERF-A5 (match-connections half):** `match-connections.ts` no longer does `SELECT * FROM contacts WHERE archived_at IS NULL`. It does a narrowed `SELECT` keyed on tokens drawn from the scraped `mutualConnectionNames` list (e.g., `WHERE lower(last_name) IN (...)` ORed with `lower(first_name) IN (...)`). The in-memory fuzzy match stays as-is — server-side fuzzy match (e.g., `pg_trgm`) is **out of scope** (see Deferred).
- **Incidental fold #1 — Refresh ROADMAP SC #1 wording.** The current SC text names `/api/job-leads/[id]/search` as the prospect-insert path; that route is now a thin status-flip. Update the SC to point at the actual current path and mark the prospect-insert half satisfied.
- **Incidental fold #2 — Bulk insert in `/api/contacts/import`.** The PERF-A5 ON-CONFLICT change is meaningless without converting the surrounding `for (row of parsed.data) { await db.insert(contacts) }` loop into a single bulk insert. Per-row error reporting drops; aggregate counts (`created` / `skipped`) replace it. Inputs that fail Zod-style validation (missing names) still get filtered up-front and surfaced via the existing `errors[]` array.
- **Incidental fold #3 — Recommendations bridge-score N+1.** `src/app/api/job-leads/[id]/recommendations/route.ts:44-52` runs a per-row `db.update(prospectBridges).set({score})` in a `for` loop. Replace with a single bulk `UPDATE ... FROM unnest(...)` (same shape as PERF-A3) for any bridges missing a score; planner chooses between "compute and persist up-front" vs "compute on-the-fly without persisting" — both are correct.

**Out of scope:**
- Server-side fuzzy matching via `pg_trgm` GIN indexes for `match-connections.ts` or the cross-entity `/api/search` route — heavier extension dependency, planner research item only.
- `pg_trgm` GIN indexes on the 18 `ilike`-using API routes (companies, contacts, applications, notes, recruiters search). REQUIREMENTS.md PERF-A4 says "investigate `pg_trgm` GIN for search" but ROADMAP SC #3 only locks the five btree indexes. Investigation deferred to v2.
- Deleting `matchConnections` or retiring the bridges/recommendations feature — the inline-call decision (D-01) restores it.
- New caching layers, materialized views, query result memoization. Pure SQL-shape and index changes only.
- `CREATE INDEX CONCURRENTLY` for the migration — single-user app, 1500-row table, plain `CREATE INDEX` is fine and works with Drizzle's transactional migration runner.
- Migrating the bridge-score column away from `prospectBridges` (planner picks "persist up-front" vs "on-the-fly" inside the recommendations route — column stays either way for now).
- Removing the `archivedAt IS NULL` filter from contacts dedup — the existing behavior (dedup only against active contacts, allowing re-import of archived ones) is the documented intent.

</domain>

<decisions>
## Implementation Decisions

### Bridge-Building Flow (PERF-A2 Caller Restoration)

- **D-01:** **`matchConnections` is called inline inside `POST /api/job-leads/[id]/prospects`** — after the bulk prospect insert, before the status flip to `'found'`. Single HTTP call from the skill; one atomic operation from the skill's perspective. This is the **most natural restoration** of the caller Phase 5 orphaned, and it makes PERF-A2 land inside the now-active path.
- **D-02:** **The entire `POST /prospects` handler runs inside `db.transaction()`** — prospect bulk insert, `matchConnections` (which fetches `prospectRecords` + does the narrowed contacts SELECT + bulk inserts bridges), and the `jobLeads` status update all commit or rollback together. If bridges fail, prospects rollback, status stays `'searching'`, skill sees a 500 and can retry. **No partial state ever observed by the UI.** Implementation note: Neon's HTTP driver supports `db.transaction(async (tx) => {...})` via the neon-http adapter — all statements are coalesced into a single transactional HTTP request.
- **D-03:** **`matchConnections` signature changes minimally** — it currently takes `(jobLeadId, scrapedProspects)`. Either keep that and have the caller pass `scrapedProspects` derived from the validated request body (the body already contains `mutualConnectionNames` per the Zod schema at `prospects/route.ts:13-19`), or refactor to take a `tx` (transaction) handle so it can run inside the outer transaction. Planner picks. **Both prospect insert and bridge insert must use the same `tx` handle for the atomicity guarantee in D-02 to hold.**
- **D-04:** **Bridge bulk insert pattern:** `await tx.insert(prospectBridges).values(bridgeValues).onConflictDoNothing()` — single statement, leverages the existing `unique('prospect_bridge_unique')` constraint on `(prospect_id, contact_id)` declared in `drizzle/schema/job-leads.ts`. The current per-row `for (val of bridgeValues) { try { await db.insert(...).onConflictDoNothing() } catch {} }` swallow-exceptions pattern goes away.

### Bulk Update Mechanism (PERF-A3)

- **D-05:** **`UPDATE ... FROM unnest()` via `sql` template tag** is the chosen mechanism. Shape:
  ```ts
  await db.execute(sql`
    UPDATE contacts
    SET closeness = data.cl, updated_at = NOW()
    FROM (SELECT * FROM unnest(${sql.raw(`ARRAY[${ids.map(quote).join(',')}]::uuid[]`)}, ${sql.raw(`ARRAY[${vals.map(quote).join(',')}]::contact_closeness[]`)}) AS d(id, cl)) AS data
    WHERE contacts.id = data.id
  `);
  ```
  Planner refines the exact parameterization (Drizzle's `sql` tag supports parameter binding so `sql.raw` isn't strictly needed — use `${ids}` with proper casting where supported). One round-trip, no N+1. The `updated` count in the response is derived from `result.rowCount` or by `RETURNING id` from the UPDATE.
- **D-06:** **CLAUDE.md "no raw SQL" guard is respected** — `sql` template tag inside `db.execute()` is the standard Drizzle escape hatch for batched updates and **is not** the "raw SQL" the guard forbids. The guard targets handwritten string-concatenated SQL bypassing the query builder. Document this exception inline in a one-line comment on the `db.execute()` call.
- **D-07:** **Response shape is unchanged** — `{ updated, total }` envelope from `success()`. `updated` reflects rows actually mutated; `total` is the input length.

### DB-Side Dedup (PERF-A5)

- **D-08:** **UNIQUE partial index on `contacts(linkedin_url) WHERE linkedin_url IS NOT NULL`** — added in the Drizzle schema via `uniqueIndex(...).where(sql\`linkedin_url IS NOT NULL\`)` or the equivalent helper, and surfaced in the migration. Postgres `ON CONFLICT` accepts a partial unique index as its conflict target. This index doubles as the `contacts(linkedin_url)` btree from PERF-A4 — **one index covers both purposes**.
- **D-09:** **Name+company dedup stays in-app, but uses a narrowed SELECT** — not a full scan. Build the set of `(lower(firstName), lower(lastName), lower(coalesce(currentCompany,'')))` tuples from the CSV first, then issue a single `SELECT` filtering by `WHERE (lower(first_name), lower(last_name), lower(coalesce(current_company,''))) IN (...)`. Drizzle's `sql` tag is used to express the tuple-IN clause if the query builder doesn't support it natively. Planner picks the exact expression; the narrow filter SHOULD return zero or near-zero rows in the steady state.
- **D-10:** **The contacts-import handler becomes a single bulk insert.** The current `for (row of parsed.data) { ... await db.insert(contacts) ... }` loop is rewritten as:
  ```ts
  // 1. Filter/validate rows (collect errors[])
  // 2. Build name+company set from validated rows
  // 3. Issue narrowed name+company SELECT (D-09) — get existing tuples
  // 4. Filter out rows that match either dedup branch
  // 5. ONE bulk insert with ON CONFLICT DO NOTHING (D-08)
  // 6. logTimeline once with aggregate counts
  ```
  Per-row error messages in the `errors[]` array are reduced to validation-stage errors only (missing names, malformed rows). Database-level errors after the bulk insert are reported as a single aggregate failure if `INSERT` throws.
- **D-11:** **`match-connections.ts` narrowed contacts SELECT** — replace `SELECT * FROM contacts WHERE archived_at IS NULL` with a narrowed query keyed on tokens extracted from `scrapedProspects.flatMap(p => p.mutualConnectionNames)`. Strategy: split each mutual name on whitespace, lowercase, then `SELECT ... FROM contacts WHERE archived_at IS NULL AND (lower(first_name) IN (...) OR lower(last_name) IN (...))`. Returns a much smaller working set for the in-memory `fuzzyMatch`. **The fuzzy match itself stays in Node** — `pg_trgm` is deferred. Planner verifies this narrowing preserves match accuracy on a representative dataset.

### Index Migration (PERF-A4)

- **D-12:** **Indexes are declared in the Drizzle schema** using `index('idx_name').on(table.column)` in each table file's third callback argument. Plain `CREATE INDEX` — **not** `CREATE INDEX CONCURRENTLY` (Drizzle's migration runner wraps DDL in transactions, which conflicts with CONCURRENTLY; single-user app + tiny tables makes the brief lock irrelevant).
- **D-13:** **Index list (5 + 1 UNIQUE = 6 total):**
  1. `contacts(archived_at)` — btree, the `WHERE archived_at IS NULL` filter is everywhere
  2. `contacts(linkedin_url) UNIQUE WHERE linkedin_url IS NOT NULL` — supports D-08 ON CONFLICT and the import URL-dedup lookup
  3. `contacts(company_id)` — btree, the JOIN key from `companies` and the filter in `/api/companies/[id]/contacts`
  4. `contacts(linkedin_connection_date)` — btree, ordering on the triage page
  5. `companies(name)` — btree, `ilike` prefilter on the cross-entity search and companies list filter
- **D-14:** **Migration filename + format** — generated by `npm run db:generate`, picks the next sequential number (`0008_*.sql`). Single migration file with all six DDL statements. The migration is committed to `drizzle/migrations/` and applied via `npm run db:migrate` against the local Neon dev branch and then production at deploy time.

### Recommendations N+1 (Incidental Fold #3)

- **D-15:** **Bridge-score persistence loop** in `recommendations/route.ts:44-52` is replaced by a single bulk `UPDATE ... FROM unnest(...)` for bridges with `score IS NULL`. Same shape as D-05; planner reuses the helper if extracted. Alternative — compute scores on-the-fly without persistence — is acceptable if the planner prefers (saves the UPDATE entirely). Decision deferred to planner based on whether other callers rely on `prospectBridges.score` being persisted (grep + decide).

### Wave Structure (Planner Guidance)

- **D-16:** **Wave 1 — Schema + migration.** Add `index()` and `uniqueIndex()` calls to `drizzle/schema/contacts.ts` and `drizzle/schema/companies.ts`. Run `npm run db:generate` to produce `drizzle/migrations/0008_*.sql`. Single atomic commit. **Blocks all of Wave 2** (D-08 ON CONFLICT depends on the UNIQUE index).
- **D-17:** **Wave 2 — Four parallel code-change atomics** (disjoint file sets):
  - **Plan 2a (PERF-A1 bridges half + PERF-A2):** Refactor `POST /prospects` + `matchConnections` for transactional inline call + bulk bridge insert + narrowed contacts SELECT. Refresh ROADMAP SC #1 wording in the same commit.
  - **Plan 2b (PERF-A3):** Rewrite `/api/contacts/import/categorize/route.ts` to use `UPDATE ... FROM unnest()`.
  - **Plan 2c (PERF-A5 import half):** Rewrite `/api/contacts/import/route.ts` for bulk insert + ON CONFLICT + narrowed name+company SELECT.
  - **Plan 2d (Incidental #3):** Rewrite `recommendations/route.ts:44-52` for bulk bridge-score update (or remove persistence if planner chooses on-the-fly).
- **D-18:** **Atomic-per-requirement commit pattern (D-19 carried from Phases 1-5)** — each plan above lands as a single commit. The schema migration in Wave 1 is its own commit. ROADMAP SC #1 wording refresh ships in the same commit as Plan 2a since it documents the same change.

### Testing Strategy (Reuse Phase 2 Harness)

- **D-19:** **PGlite-backed route tests** assert post-conditions on each rewritten path (correct row counts, idempotency under retry, timeline event emitted). The harness from Phase 2 (`src/test-utils/{pglite,call-route}.ts`) handles all the new tests — no new infrastructure.
- **D-20:** **Index presence regression test** — add a single test that queries `pg_indexes` on the PGlite instance after migrations run, asserting all six indexes from D-13 exist on the expected columns. This pins PERF-A4 against future schema drift.
- **D-21:** **No micro-benchmarks.** Wall-clock timing assertions are environment-dependent and brittle. The behavior tests above + code review (`for...of await db.X` greppable as a forbidden pattern in changed routes) provide the durable signal.

### Claude's Discretion

- The exact parameter-binding shape for the `UPDATE ... FROM unnest()` SQL in D-05 and D-15 (whether to use Drizzle's `${array}` interpolation or build the `ARRAY[...]` literal explicitly).
- Whether to refactor `matchConnections`'s signature in D-03 to take a `tx` handle, or keep it free-standing and wrap the whole `POST /prospects` body in a transaction that uses the outer `tx` for both inserts.
- Index naming convention (`idx_contacts_archived_at` vs `contacts_archived_at_idx` etc.) — pick what matches existing Drizzle conventions in `drizzle/migrations/`.
- Whether D-15 persists bridge scores or computes on-the-fly — decided by grep evidence on other consumers of `prospectBridges.score`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context & Requirements
- `.planning/ROADMAP.md` §"Phase 6: Performance" — Goal + 5 SCs (note SC #1 wording refresh per D-18)
- `.planning/REQUIREMENTS.md` §"Performance" — PERF-A1..A5 full definitions
- `.planning/PROJECT.md` §"Constraints" — "No raw SQL in app code except for pgvector queries" (PERF-A3 `sql` template usage is the documented escape, see D-06); "1500+ contacts in the table today; queries that scan the full `contacts` table or do N+1 inserts/updates are already noticeable" — the phase's reason for being

### Code Paths Touched
- `src/app/api/job-leads/[id]/prospects/route.ts` — current bulk-prospect insert (line 60); becomes the host for inline `matchConnections` per D-01
- `src/features/job-leads/lib/match-connections.ts` — currently dead post-Phase-5; restored as callee per D-01, narrowed SELECT per D-11, bulk bridge insert per D-04
- `src/app/api/contacts/import/categorize/route.ts` — per-row UPDATE loop replaced per D-05
- `src/app/api/contacts/import/route.ts` — per-row INSERT loop + full SELECT scan replaced per D-08..D-10
- `src/app/api/job-leads/[id]/recommendations/route.ts` (lines 44-52) — per-row UPDATE loop replaced per D-15
- `drizzle/schema/contacts.ts` — add `index()` + `uniqueIndex()` calls per D-12..D-13
- `drizzle/schema/companies.ts` — add `index()` for `name` per D-13
- `drizzle/migrations/0008_*.sql` (new) — generated migration per D-14

### Phase 5 Context (Background for Phase 5 Reshape Implications)
- `.planning/phases/05-job-leads-completion/05-CONTEXT.md` — explains the matchConnections orphan and the new prospect-write flow
- `.planning/phases/05-job-leads-completion/05-PATTERNS.md` — the bulk-prospects route's reference patterns
- `.claude/skills/scrape-linkedin-connections/references/heimdall-api.md` — the skill's contract with `/api/job-leads/[id]/prospects` (planner verifies the inline `matchConnections` call doesn't break that contract — return envelope stays `{ insertedCount, lead }`)

### Codebase Codified Knowledge
- `.planning/codebase/CONCERNS.md` §"Performance Bottlenecks" — confirms the N+1 loci and the missing indexes (source of the phase's evidence base)
- `.planning/codebase/ARCHITECTURE.md` §"Data Flow" — confirms the API-route-as-mutation-boundary pattern; all four code-change atomics in D-17 are API routes or libs called from API routes
- `.planning/codebase/CONVENTIONS.md` §"Drizzle ORM Conventions" — "Query builder only — no raw SQL except for `sql` template tag in complex WHERE conditions" — D-06 extends this to bulk UPDATE/INSERT

### Existing Drizzle Patterns to Reuse
- `drizzle/schema/job-leads.ts` line ~end — example of `unique('prospect_bridge_unique').on(...)` syntax for D-08's UNIQUE partial index pattern
- `drizzle/migrations/0007_add_queued_failed_status_and_error_columns.sql` — most recent migration file; format reference for D-14

### Test Infrastructure
- `src/test-utils/pglite.ts`, `src/test-utils/call-route.ts` — Phase 2 harness; reused for D-19, D-20

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`db.transaction(async (tx) => {...})` via neon-http** — Drizzle's neon-http adapter supports transactions; D-02's atomic wrap depends on this. Verify the adapter version (`drizzle-orm` v0.45.1) does coalesce statements into one HTTP request.
- **`prospect_bridge_unique` constraint on `prospectBridges(prospect_id, contact_id)`** — already exists (`drizzle/schema/job-leads.ts`). D-04 piggybacks on it for `onConflictDoNothing()`.
- **PGlite test harness** — Phase 2's `createTestDb()` returns a fresh in-memory Postgres for each test, with all migrations replayed. D-19 and D-20 use it as-is.
- **`canJobLeadTransition` state machine** — unchanged by Phase 6; the new inline `matchConnections` inside `POST /prospects` does NOT alter the state graph (`'searching' → 'found'` already exists).
- **`logTimeline()` side-effect** — preserved in all rewrites; each refactored route still emits exactly one timeline event on success (D-10's import becomes one event with aggregate counts, not 1500).

### Established Patterns
- **API route shape:** `try { Zod parse → query → success() } catch (ZodError → validationError; default → serverError)` — every Phase 6 rewrite must keep this exact shell.
- **`updatedAt: new Date()` set manually on updates** (Drizzle doesn't auto-update) — the unnest UPDATE in D-05 must explicitly write `updated_at = NOW()` in the SET clause.
- **Soft-delete via `archivedAt`** — D-11's narrowed SELECT keeps the `WHERE archived_at IS NULL` filter; PERF-A5 doesn't change the dedup-vs-archived rule.
- **No server actions; all mutations via REST** — D-01's inline `matchConnections` call stays inside an API route. Confirmed compatible.

### Integration Points
- **Skill → `POST /prospects`** — the skill's contract with the API is `(prospects[]) → { insertedCount, lead }`. D-01 adds bridge-building inside this call but the response envelope stays the same. The skill's reference doc (`heimdall-api.md`) does not need updating for the inline-call decision; the response shape is unchanged.
- **`/triage` and `/recommendations` pages** — currently silently empty because no bridges exist post-Phase-5. After D-01..D-04 land, they start returning real data without any UI change.
- **Drizzle migration runner** — `npm run db:migrate` against Neon dev branch, then auto-applied at Vercel deploy via the project's existing deploy hook (verify in planner phase).

</code_context>

<specifics>
## Specific Ideas

- **`UPDATE ... FROM unnest()`** is the named idiom for D-05 and D-15. Both calls use the same shape; planner may extract a helper if both end up identical (`updateColumnByIdMap(table, columnName, idMap)`).
- **D-11's narrowing strategy:** split mutual-name strings on whitespace, lowercase, dedup, then `WHERE lower(first_name) IN (...) OR lower(last_name) IN (...)`. Don't over-engineer — this is a coarse pre-filter, the existing `fuzzyMatch` does the final comparison in Node.
- **D-08's partial UNIQUE index:** Postgres ON CONFLICT requires the conflict target to match a unique constraint OR a unique partial index whose `WHERE` predicate the inserted rows satisfy. The skill ensures `linkedinUrl !== null` is the LinkedIn-URL-present case; rows without URL won't trigger ON CONFLICT and pass through normally. Drizzle supports the partial UNIQUE via `uniqueIndex(...).on(...).where(sql\`...\`)`.

</specifics>

<deferred>
## Deferred Ideas

- **`pg_trgm` GIN indexes for `ilike` search** — across `/api/search`, companies/contacts/notes/applications/recruiters list-search routes. REQUIREMENTS.md PERF-A4 mentions "investigate `pg_trgm` GIN for search" but ROADMAP SC #3 only locks the five btree indexes. This is a separate v2 line item (call it `PERF-V2-01` if it makes the roadmap).
- **Server-side fuzzy matching in `match-connections.ts`** — `pg_trgm` `similarity()` or full-text search to replace the in-memory `fuzzyMatch`. Deferred for the same reason as above; D-11's narrowed SELECT is sufficient for the current 1500-contact dataset.
- **Materialized view for `recommendations`** — the join across `prospectBridges + prospects + contacts` could be precomputed. Out of scope; bulk-insert + bulk-update + indexes deliver the required perf without a new abstraction layer.
- **Bulk-import error reporting at row granularity** — D-10 trades per-row error messages for aggregate counts. If row-level visibility becomes a UX requirement later, revisit (could re-introduce per-row INSERT inside a single transaction, accepting the perf cost in exchange for granular errors — or stream the bulk-insert result via `RETURNING id` and reconcile against input).
- **Index for `prospectBridges(prospect_id)` or `(contact_id)`** — recommendations and triage routes JOIN on these. Current `unique('prospect_bridge_unique')` covers the pair; whether each column individually warrants its own btree is a planner research item if joins start lagging.
- **`prospectBridges.score` column retirement** — if D-15 picks the "compute on-the-fly" variant, the persisted `score` becomes unused. Removing the column is a follow-up cleanup, not Phase 6 scope.

</deferred>

---

*Phase: 6-Performance*
*Context gathered: 2026-05-14*
