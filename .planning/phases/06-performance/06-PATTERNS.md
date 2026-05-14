# Phase 6: Performance - Pattern Map

**Mapped:** 2026-05-14
**Files analyzed:** 9 (5 route/lib modifications + 2 schema modifications + 1 new migration + 1 test family)
**Analogs found:** 7 strong / 9 total — 2 patterns (`db.transaction`, `index()`/`uniqueIndex()`) have **no existing analog in the repo**; planner must establish them from Drizzle docs (see "No Analog Found" section).

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/app/api/job-leads/[id]/prospects/route.ts` | API route (POST) | bulk-write + transaction | `src/app/api/job-leads/[id]/prospects/route.ts` (self — already bulk-insert; add inline `matchConnections` + transaction wrap) | exact (extends self) |
| `src/features/job-leads/lib/match-connections.ts` | service / domain lib | bulk read + bulk write | `src/app/api/contacts/import/route.ts` (lines 55-74 narrowed SELECT building Set-of-keys for in-app dedup) | role + flow match |
| `src/app/api/contacts/import/categorize/route.ts` | API route (PATCH) | bulk UPDATE via single SQL | `src/app/api/metrics/dashboard/route.ts` (only existing `sql` template + `import { sql }` pattern in api routes — but no UPDATE example) | partial (no `db.execute(sql\`UPDATE…\`)` analog exists) |
| `src/app/api/contacts/import/route.ts` | API route (POST, multipart) | CSV ingest + bulk insert + ON CONFLICT | `drizzle/seed.ts` lines 107-112 (`onConflictDoNothing({ target: pipelineStages.name })` — only existing `onConflictDoNothing` with explicit target) + `src/app/api/job-leads/[id]/prospects/route.ts` (bulk values insert) | role + flow match |
| `src/app/api/job-leads/[id]/recommendations/route.ts` | API route (GET) | per-row UPDATE → bulk UPDATE | self (lines 44-52 is the N+1 to replace); same `UPDATE … FROM unnest()` shape as `categorize/route.ts` (D-05) | exact (extends self) |
| `drizzle/schema/contacts.ts` | schema definition | DDL (index declarations) | `drizzle/schema/job-leads.ts` line 85 — `(table) => [unique('prospect_bridge_unique').on(...)]` is the only third-callback table-constraint pattern in the repo; **`index()` / `uniqueIndex()` have no prior usage** | partial (constraint syntax shape only) |
| `drizzle/schema/companies.ts` | schema definition | DDL (index declarations) | same as `contacts.ts` | partial |
| `drizzle/migrations/0008_*.sql` (new) | migration | DDL | `drizzle/migrations/0007_add_queued_failed_status_and_error_columns.sql` (most recent; `--> statement-breakpoint` format) | exact (format) |
| `src/app/api/**/route.test.ts` (each rewritten route) + new index-presence test | tests | PGlite-backed assertions | `src/app/api/contacts/import/route.test.ts`, `src/app/api/job-leads/[id]/prospects/route.test.ts`, `src/app/api/applications/[id]/status/route.test.ts` | exact |

---

## Pattern Assignments

### `src/app/api/job-leads/[id]/prospects/route.ts` (API route, bulk-write + transaction wrap)

**Analog:** self (the route already implements the canonical shell; D-02 adds a `db.transaction` wrap and the inline `matchConnections` call between the bulk prospect insert and the status flip).

**Canonical route shell** — exactly preserved across the Phase 6 rewrite. Current lines 25-89:

```typescript
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = bulkBody.parse(body);

    const [lead] = await db
      .select()
      .from(jobLeads)
      .where(eq(jobLeads.id, id))
      .limit(1);

    if (!lead) return notFound('Job lead');

    if (lead.status !== 'searching') {
      return validationError(
        `Cannot write prospects to lead in status '${lead.status}'`
      );
    }
    // ... mutations ...
    return created({ insertedCount: rows.length, lead: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}
```

**Bulk insert pattern** (lines 50-61 — already correct, **DO NOT regress**):

```typescript
const rows = validated.prospects.map((p) => ({
  jobLeadId: id,
  name: p.name,
  title: p.title,
  linkedinUrl: p.linkedinUrl,
  profileSnippet: p.profileSnippet,
  seniorityLevel: inferSeniority(p.title ?? '').level
}));

if (rows.length > 0) {
  await db.insert(prospects).values(rows);  // SINGLE statement, not a loop
}
```

**Manual `updatedAt` on UPDATE** (lines 63-73 — Drizzle does NOT auto-update; every UPDATE in Phase 6 must include `updatedAt: new Date()`):

```typescript
const [updated] = await db
  .update(jobLeads)
  .set({
    status: 'found',
    prospectCount: rows.length,
    lastError: null,
    lastErrorAt: null,
    updatedAt: new Date()         // <-- mandatory; D-05 must do the same in SQL via `updated_at = NOW()`
  })
  .where(eq(jobLeads.id, id))
  .returning();
```

**Timeline side-effect** (lines 75-80 — preserved in all rewrites; exactly **one** event per successful write):

```typescript
await logTimeline({
  eventType: 'job_lead_search_complete',
  title: `Found ${rows.length} prospects at ${lead.companyName || 'Unknown'}`,
  companyId: lead.companyId || undefined,
  metadata: { jobLeadId: id, prospectCount: rows.length }
});
```

**D-02 transaction wrap — NO existing analog in repo.** Drizzle's neon-http adapter exposes `db.transaction(async (tx) => { ... })`. The planner introduces this pattern. Inside the callback, every Drizzle call MUST use `tx` (not the imported `db`) for atomicity to hold. The `matchConnections` callee (D-03 discretion) either accepts `tx` as a parameter, or runs free-standing and the planner wraps both insert + matchConnections + status-flip in the outer transaction using a shared `tx` handle. See `lib/db/index.ts` line 7 — `db` is the drizzle instance returned from `drizzle(sql, { schema })`, so `db.transaction` is the Drizzle API.

---

### `src/features/job-leads/lib/match-connections.ts` (service lib, bulk read + narrowed SELECT + bulk insert)

**Analog:** `src/app/api/contacts/import/route.ts` lines 55-74 — the same shape (narrowed SELECT building a `Set` keyed on tuple-ish strings, then in-memory filter). Phase 6 keeps the in-memory fuzzy match but narrows the WHERE clause from `WHERE archived_at IS NULL` (full table) to one keyed on tokens from scraped mutual-connection names.

**Current N+1 to replace** (lines 103-112 — the per-row bridge insert loop with swallow-exceptions):

```typescript
// Insert bridges
if (bridgeValues.length > 0) {
  for (const val of bridgeValues) {
    try {
      await db.insert(prospectBridges).values(val).onConflictDoNothing();
    } catch {
      // Ignore duplicate bridge errors
    }
  }
}
```

**D-04 replacement** — single bulk insert leveraging the existing `unique('prospect_bridge_unique')` constraint on `(prospect_id, contact_id)` from `drizzle/schema/job-leads.ts:85`:

```typescript
// Per D-04: ONE statement, no try/catch around it.
if (bridgeValues.length > 0) {
  await tx.insert(prospectBridges).values(bridgeValues).onConflictDoNothing();
  // ^ tx (transaction handle) if matchConnections takes tx (D-03), else db
}
```

**Narrowed SELECT pattern** (`contacts/import/route.ts` lines 55-64 — the analog for D-11's narrowing approach):

```typescript
// Analog showing narrowed SELECT keyed on application-built tuples
const existing = await db
  .select({
    id: contacts.id,
    linkedinUrl: contacts.linkedinUrl,
    firstName: contacts.firstName,
    lastName: contacts.lastName,
    currentCompany: contacts.currentCompany
  })
  .from(contacts)
  .where(isNull(contacts.archivedAt));
```

**Soft-delete invariant** (lines 43-47 of `match-connections.ts` — `WHERE archived_at IS NULL` filter MUST be preserved when narrowing per D-11):

```typescript
const allContacts = await db
  .select()
  .from(contacts)
  .where(isNull(contacts.archivedAt));
```

The Phase 6 rewrite replaces the `where(isNull(contacts.archivedAt))` with `where(and(isNull(contacts.archivedAt), <narrow-token-clause>))` — soft-delete filter stays, full-table scan goes away.

**Tuple-IN clause idiom** — for D-11's `WHERE lower(first_name) IN (...) OR lower(last_name) IN (...)`, see `src/app/api/contacts/route.ts:68` for the `sql` template tag composing an OR'd `ilike` cluster:

```typescript
sql`(${ilike(contacts.firstName, `%${search}%`)} OR ${ilike(contacts.lastName, `%${search}%`)})`
```

Same `sql` template tag is used to express tuple-IN. The planner refines exact binding (Drizzle's `inArray(contacts.firstName, lowerNamesArray)` is the cleanest builder-native option; `sql` template tag is the fallback).

---

### `src/app/api/contacts/import/categorize/route.ts` (API route, bulk UPDATE via `db.execute(sql\`...\`)`)

**Analog:** `src/app/api/metrics/dashboard/route.ts` is the only file in the repo that imports `sql` from `drizzle-orm` for non-WHERE use, but no `db.execute(sql\`UPDATE…\`)` analog exists anywhere. **The pattern is new to this codebase.** Reference points to assemble it:

**Current N+1 to replace** (entire file, lines 18-38):

```typescript
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { updates } = bulkCategorizeSchema.parse(body);

    let updated = 0;
    for (const { contactId, closeness } of updates) {
      const [result] = await db
        .update(contacts)
        .set({ closeness, updatedAt: new Date() })
        .where(eq(contacts.id, contactId))
        .returning();
      if (result) updated++;
    }

    return success({ updated, total: updates.length });
  } catch (err) {
    if (err instanceof z.ZodError) return validationError(err.issues[0].message);
    return serverError(err);
  }
}
```

**D-05 replacement** — single `db.execute(sql\`UPDATE … FROM unnest(${ids}::uuid[], ${vals}::contact_closeness[]) AS data(id, cl) WHERE contacts.id = data.id\`)`. The planner picks the exact parameter-binding shape (Drizzle template-tag interpolation vs. `sql.raw` for the ARRAY literal). Reference shape from CONTEXT D-05:

```typescript
// CONTEXT D-05 reference (planner refines exact binding):
await db.execute(sql`
  UPDATE contacts
  SET closeness = data.cl, updated_at = NOW()
  FROM (
    SELECT * FROM unnest(${ids}::uuid[], ${vals}::contact_closeness[]) AS d(id, cl)
  ) AS data
  WHERE contacts.id = data.id
`);
// updated_at = NOW() is the SQL-side analog of the `updatedAt: new Date()`
// mandatory in builder UPDATEs.
```

**Imports needed** — add `sql` to the `drizzle-orm` import (see `src/app/api/metrics/dashboard/route.ts:9` for the existing pattern):

```typescript
import { sql, isNull, inArray, lte, gte, and, count } from 'drizzle-orm';
```

**Response envelope** — unchanged. `success({ updated, total })`:

```typescript
return success({ updated, total: updates.length });
```

**Row-count derivation** — Drizzle's `db.execute()` returns a result with `rowCount` (Neon-HTTP) or `rowsAffected`. Planner picks. Alternative: `.execute(sql\`... RETURNING id\`)` and use `.length`.

**Error handling shell preserved** (lines 34-37 — the canonical `ZodError → validationError; default → serverError` shape):

```typescript
} catch (err) {
  if (err instanceof z.ZodError) return validationError(err.issues[0].message);
  return serverError(err);
}
```

---

### `src/app/api/contacts/import/route.ts` (API route, multipart POST → bulk insert + ON CONFLICT)

**Analog:** `drizzle/seed.ts` lines 107-112 — the only `onConflictDoNothing({ target: ... })` with an explicit target in the codebase + `src/app/api/job-leads/[id]/prospects/route.ts` lines 50-61 for the bulk values insert shape.

**`onConflictDoNothing` with target column** (`drizzle/seed.ts:108-111`):

```typescript
await db
  .insert(pipelineStages)
  .values(stage)
  .onConflictDoNothing({ target: pipelineStages.name });
```

D-08 uses the **same `{ target: ... }` shape** keyed on `contacts.linkedinUrl`, but requires the UNIQUE partial index from the schema (added in Wave 1) so Postgres has a unique constraint matching the `target`:

```typescript
// D-10 replacement shape:
await db
  .insert(contacts)
  .values(rowsToInsert)  // built from filtered CSV
  .onConflictDoNothing({ target: contacts.linkedinUrl });
```

**Current N+1 to replace** (lines 80-143 — per-row insert with try/catch and per-row error string):

```typescript
for (const row of parsed.data) {
  const firstName = row['First Name']?.trim();
  // ... validation + per-row dedup checks ...
  try {
    const [contact] = await db.insert(contacts).values({...}).returning();
    created++;
  } catch (err) {
    errors.push(`Failed to import ${firstName} ${lastName}: ${String(err)}`);
  }
}
```

**D-10 wave structure** — five-step rewrite per CONTEXT:
1. Filter/validate rows (collect `errors[]` for missing-name + Zod-style failures only)
2. Build name+company tuple set from validated rows
3. Issue narrowed name+company SELECT (D-09) — only tuples appearing in the CSV
4. Filter out rows that match either dedup branch (URL via DB-side ON CONFLICT, name+company via narrowed SELECT)
5. ONE bulk insert with ON CONFLICT DO NOTHING (D-08)
6. `logTimeline` once with aggregate counts

**Narrowed name+company SELECT** (D-09) — keep `archivedAt IS NULL` filter, narrow to tuples from the CSV. See `match-connections.ts` pattern guidance above (same `sql` template tuple-IN approach).

**Single `logTimeline` aggregate event** (already correct at lines 145-151):

```typescript
if (created > 0) {
  await logTimeline({
    eventType: 'contacts_imported',
    title: `Imported ${created} contacts from LinkedIn CSV`,
    metadata: { created, skipped, errors: errors.length }
  });
}
```

**Response envelope** unchanged: `success({ created, skipped, errors })`.

---

### `src/app/api/job-leads/[id]/recommendations/route.ts` (API route GET, per-row UPDATE → bulk UPDATE)

**Analog:** self (lines 44-52 is the N+1) + the D-05 unnest-update pattern from `categorize/route.ts` planning.

**Current N+1 to replace** (lines 43-53):

```typescript
// Compute and persist scores for any bridges missing them
for (const row of rows) {
  if (row.bridge.score === null) {
    const score = computeBridgeScore(row.prospect, row.contact);
    await db
      .update(prospectBridges)
      .set({ score })
      .where(eq(prospectBridges.id, row.bridge.id));
    row.bridge.score = score;
  }
}
```

**D-15 replacement** — two acceptable variants, planner picks:

**Variant A — bulk UPDATE persist (same shape as D-05):**

```typescript
const missing = rows.filter((r) => r.bridge.score === null);
if (missing.length > 0) {
  const ids = missing.map((r) => r.bridge.id);
  const scores = missing.map((r) => computeBridgeScore(r.prospect, r.contact));
  await db.execute(sql`
    UPDATE prospect_bridges
    SET score = data.s
    FROM (SELECT * FROM unnest(${ids}::uuid[], ${scores}::integer[]) AS d(id, s)) AS data
    WHERE prospect_bridges.id = data.id
  `);
  // Mutate the rows array in-memory so the rest of the handler sees updated scores
  for (let i = 0; i < missing.length; i++) {
    missing[i].bridge.score = scores[i];
  }
}
```

**Variant B — compute on-the-fly, drop persistence entirely.** Planner greps for other consumers of `prospectBridges.score`; if none rely on the persisted column, just compute scores in-handler without writing them back. See CONTEXT D-15 "Decision deferred to planner based on whether other callers rely on `prospectBridges.score` being persisted (grep + decide)."

**Note:** No `updatedAt` column on `prospect_bridges` (see `drizzle/schema/job-leads.ts:66-86` — only `createdAt`). So Variant A does NOT need a `SET ..., updated_at = NOW()` clause for this table specifically.

---

### `drizzle/schema/contacts.ts` (schema, add `index()` + `uniqueIndex()`)

**Analog:** `drizzle/schema/job-leads.ts:85` — the only third-callback table-constraint usage in the codebase. **`index()` and `uniqueIndex()` themselves have no prior usage.** This is the canonical Drizzle PG-core API; planner adds it.

**Existing table-constraint shape** (`drizzle/schema/job-leads.ts:66-86`):

```typescript
export const prospectBridges = pgTable(
  'prospect_bridges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    prospectId: uuid('prospect_id').references(() => prospects.id).notNull(),
    contactId: uuid('contact_id').references(() => contacts.id).notNull(),
    score: integer('score'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [unique('prospect_bridge_unique').on(table.prospectId, table.contactId)]
);
```

**D-12/D-13 additions** — `index()` and `uniqueIndex().where()` from `drizzle-orm/pg-core`. Add to the import block, then declare in the third-callback array (same shape as `unique('...')` above). Planner pattern:

```typescript
import {
  pgTable, uuid, text, timestamp,
  index, uniqueIndex   // <-- NEW imports for D-12
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';  // <-- NEW for the partial-index WHERE clause

export const contacts = pgTable(
  'contacts',
  {
    // ... existing column block unchanged ...
  },
  (table) => [
    index('contacts_archived_at_idx').on(table.archivedAt),
    uniqueIndex('contacts_linkedin_url_unique_idx')
      .on(table.linkedinUrl)
      .where(sql`${table.linkedinUrl} IS NOT NULL`),  // partial UNIQUE per D-08
    index('contacts_company_id_idx').on(table.companyId),
    index('contacts_linkedin_connection_date_idx').on(table.linkedinConnectionDate)
  ]
);
```

**Index naming convention** — no precedent in the repo. Planner picks (CONTEXT "Claude's Discretion" calls this out: `idx_contacts_archived_at` vs `contacts_archived_at_idx`). Recommended: `<table>_<column>_idx` (Drizzle default convention; what `drizzle-kit` emits when no name is given) — but explicit names are required for D-13 because the regression test (D-20) queries `pg_indexes.indexname`.

---

### `drizzle/schema/companies.ts` (schema, add `index()` on name)

**Analog:** same as `contacts.ts`. Single index per D-13 point 5:

```typescript
import {
  pgTable, uuid, text, timestamp, integer, jsonb,
  index   // <-- NEW
} from 'drizzle-orm/pg-core';

export const companies = pgTable(
  'companies',
  {
    // ... existing column block unchanged ...
  },
  (table) => [
    index('companies_name_idx').on(table.name)
  ]
);
```

---

### `drizzle/migrations/0008_*.sql` (NEW — generated by `npm run db:generate`)

**Analog:** `drizzle/migrations/0007_add_queued_failed_status_and_error_columns.sql` (most recent migration; format reference):

```sql
ALTER TYPE "public"."job_lead_status" ADD VALUE IF NOT EXISTS 'queued' BEFORE 'searching';--> statement-breakpoint
ALTER TYPE "public"."job_lead_status" ADD VALUE IF NOT EXISTS 'failed';--> statement-breakpoint
ALTER TABLE "job_leads" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "job_leads" ADD COLUMN "last_error_at" timestamp with time zone;
```

**Format invariants:**
- Each DDL statement followed by `--> statement-breakpoint` marker (except the final one)
- Double-quoted identifiers: `"public"."job_lead_status"`, `"job_leads"`, `"last_error"`
- `_journal.json` auto-updated by `drizzle-kit`; planner does NOT hand-edit this file

**Generation step:** `npm run db:generate` after the schema edits (Wave 1). The generated migration filename has a random slug after the sequential number (see `0005_closed_cassandra_nova.sql`, `0006_add_job_leads.sql` — only `0006` and `0007` use descriptive slugs because they were renamed; D-14 says `0008_*.sql` is fine, planner can rename to a descriptive slug post-generation if desired).

**Expected DDL content (6 statements):**

```sql
CREATE INDEX "contacts_archived_at_idx" ON "contacts" USING btree ("archived_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_linkedin_url_unique_idx" ON "contacts" USING btree ("linkedin_url") WHERE "linkedin_url" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "contacts_company_id_idx" ON "contacts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "contacts_linkedin_connection_date_idx" ON "contacts" USING btree ("linkedin_connection_date");--> statement-breakpoint
CREATE INDEX "companies_name_idx" ON "companies" USING btree ("name");
```

Plain `CREATE INDEX` — **not** `CREATE INDEX CONCURRENTLY` per D-12 (Drizzle migration runner wraps DDL in transactions, conflicts with CONCURRENTLY; tiny tables make the brief lock irrelevant).

---

### Test Files (PGlite harness reuse — D-19, D-20)

**Analogs (multiple, all use the same harness):**
- `src/app/api/contacts/import/route.test.ts` — formData + CSV fixture + dedup assertion
- `src/app/api/job-leads/[id]/prospects/route.test.ts` — bulk insert + status flip + timeline event
- `src/app/api/applications/[id]/status/route.test.ts` — params-dynamic-route handler shape

**Canonical harness boilerplate** (used identically in all five existing route tests — `import/route.test.ts:1-11`):

```typescript
import { createTestDb } from '@/test-utils/pglite';
import { callRoute } from '@/test-utils/call-route';
import { contacts, timelineEvents } from '../../../../../drizzle/schema';

// vi.hoisted + Proxy pattern — mandated by D-05/D-07/02-03-PLAN
const { dbRef } = vi.hoisted(() => ({
  dbRef: { current: null as Awaited<ReturnType<typeof createTestDb>> | null }
}));

vi.mock('@/lib/db', () => ({
  db: new Proxy({}, {
    get: (_: object, prop: string | symbol) =>
      (dbRef.current as unknown as Record<string | symbol, unknown>)[prop]
  })
}));
```

**Per-test seed pattern** (`prospects/route.test.ts:25-49` — beforeEach creates fresh PGlite, seeds dependent rows):

```typescript
describe('POST /api/job-leads/[id]/prospects (bulk insert)', () => {
  let leadId: string;
  let companyId: string;

  beforeEach(async () => {
    dbRef.current = await createTestDb();

    const [company] = await dbRef.current
      .insert(companies)
      .values({ name: 'AcmeCo' })
      .returning();
    companyId = company.id;

    const [lead] = await dbRef.current
      .insert(jobLeads)
      .values({
        linkedinJobUrl: 'https://www.linkedin.com/jobs/view/4001',
        companyId,
        companyName: 'AcmeCo',
        roleTitle: 'VP Data',
        status: 'searching'
      })
      .returning();
    leadId = lead.id;
  });
  // ... it() blocks ...
});
```

**Dynamic-params handler call shape** (`prospects/route.test.ts:92-100` — the cast required because `callRoute`'s `params` signature is `Record<string,string>` but route handlers declare narrower):

```typescript
const { status, body } = await callRoute(
  POST as unknown as Parameters<typeof callRoute>[0],
  {
    method: 'POST',
    body: { prospects: inputProspects },
    params: { id: leadId }
  }
);
```

**Idempotency-under-retry assertion shape** (D-19 requirement) — pattern available in `import/route.test.ts:82-108` (dedup within import returns `created: 1, skipped: 1` and ends with `expect(contactRows).toHaveLength(1)`).

**Index-presence regression test (D-20) — NEW pattern, no analog.** Strategy: query `pg_indexes` via the PGlite handle and assert all 6 indexes exist on the expected columns. Sketch:

```typescript
import { createTestDb } from '@/test-utils/pglite';
import { sql } from 'drizzle-orm';

describe('Phase 6 schema indexes regression', () => {
  it('migrations create 6 hot-path indexes (D-13)', async () => {
    const db = await createTestDb();
    const result = await db.execute(sql`
      SELECT indexname, tablename, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('contacts', 'companies')
    `);
    const indexNames = (result.rows as Array<{ indexname: string }>).map((r) => r.indexname);
    expect(indexNames).toEqual(expect.arrayContaining([
      'contacts_archived_at_idx',
      'contacts_linkedin_url_unique_idx',
      'contacts_company_id_idx',
      'contacts_linkedin_connection_date_idx',
      'companies_name_idx'
    ]));
  });
});
```

PGlite supports `pg_indexes` (real Postgres catalog), so this works against the in-memory instance after `createTestDb()` has replayed all migrations including `0008`.

---

## Shared Patterns

### Response Envelope
**Source:** `src/lib/api/types.ts:12-39` and `src/lib/api/errors.ts:1-22`
**Apply to:** All four code-change atomics in Wave 2 (Plans 2a, 2b, 2c, 2d).

Every API route in the phase preserves these factories exactly:
- `success(data)` → 200 `{ success: true, data }`
- `created(data)` → 201 `{ success: true, data }`
- `notFound('Job lead')` → 404 `{ success: false, error: 'Job lead not found' }`
- `validationError(msg)` → 400 `{ success: false, error: msg }`
- `serverError(err)` → 500 `{ success: false, error: 'Internal server error' }` (also logs via `console.error('API Error:', err)`)

Canonical try/catch shell (every Phase 6 route preserves this):

```typescript
try {
  // params + parse + query + mutation + logTimeline + return success/created
} catch (err) {
  if (err instanceof z.ZodError) return validationError(err.issues[0].message);
  return serverError(err);
}
```

### Soft-Delete Filter
**Source:** `src/features/job-leads/lib/match-connections.ts:47`, `src/app/api/contacts/import/route.ts:64`
**Apply to:** `match-connections.ts` narrowed SELECT (D-11), `contacts/import/route.ts` narrowed name+company SELECT (D-09).

`WHERE archived_at IS NULL` MUST be preserved when narrowing. Code form: `isNull(contacts.archivedAt)` combined via `and(...)` with the narrowing predicates.

### Manual `updatedAt` on UPDATE
**Source:** `src/app/api/job-leads/[id]/prospects/route.ts:70`
**Apply to:** All Phase 6 UPDATEs.
- Drizzle builder UPDATE: explicit `.set({ ..., updatedAt: new Date() })`
- SQL-side UPDATE (D-05, D-15): explicit `SET ..., updated_at = NOW()` in the SQL string
- Exception: `prospect_bridges` table has no `updated_at` column — D-15 SQL skips it.

### `logTimeline` Side-Effect
**Source:** `src/lib/db/timeline.ts:17-22`
**Apply to:** Plan 2a (`POST /prospects` already emits one event — keep it), Plan 2b (no timeline emission currently — preserve absence), Plan 2c (one aggregate event per import, D-10).

**Invariant:** exactly one `logTimeline` call per successful write path. The phase MUST NOT emit per-row timeline events even when bulk-inserting multiple rows.

### Drizzle `sql` Template Tag (CLAUDE.md "no raw SQL" exception per D-06)
**Source:** `src/app/api/metrics/dashboard/route.ts:9` (import) + every multi-condition WHERE clause in the codebase (e.g., `src/app/api/contacts/route.ts:68-77`)
**Apply to:** Plan 2b (D-05 UPDATE), Plan 2c (D-09 narrowed name+company SELECT), Plan 2d (D-15 if Variant A), `drizzle/schema/contacts.ts` (partial UNIQUE index WHERE clause).

CLAUDE.md says "no raw SQL in app code except for pgvector queries." D-06 documents that `sql` template tag inside `db.execute()` is the standard Drizzle escape for batched UPDATEs and **is not** the "raw SQL" the rule forbids. The rule targets handwritten string-concatenated SQL bypassing the query builder. **Document this exception inline** with a one-line comment on the `db.execute()` call.

### `onConflictDoNothing` with Target
**Source:** `drizzle/seed.ts:108-111`
**Apply to:** Plan 2a (D-04 `prospectBridges` — uses `prospect_bridge_unique` constraint, no `target` needed because Postgres will infer from the only unique constraint), Plan 2c (D-08 `contacts.linkedinUrl` — requires `{ target: contacts.linkedinUrl }` because the partial UNIQUE index is what Postgres matches).

Two callsite variants:
- `await db.insert(prospectBridges).values([...]).onConflictDoNothing()` — D-04
- `await db.insert(contacts).values([...]).onConflictDoNothing({ target: contacts.linkedinUrl })` — D-08/D-10

---

## No Analog Found

Two patterns have **zero precedent** in the repo and require the planner to introduce them from Drizzle docs:

| Pattern | Files Affected | Why No Analog | Planner Reference |
|---------|----------------|---------------|-------------------|
| `db.transaction(async (tx) => {...})` | `src/app/api/job-leads/[id]/prospects/route.ts` (D-02 wrap), optionally `src/features/job-leads/lib/match-connections.ts` (D-03 if signature takes `tx`) | The codebase has never used transactions — every write so far was single-statement or fire-and-forget | Drizzle neon-http transaction API; CONTEXT D-02 confirms `drizzle-orm` v0.45.1 supports it via the adapter |
| `index()` / `uniqueIndex().where()` in Drizzle schema | `drizzle/schema/contacts.ts`, `drizzle/schema/companies.ts` | The codebase has never declared explicit indexes — only `unique('prospect_bridge_unique')` and primary-key indexes (auto) | `drizzle-orm/pg-core` exports both; partial UNIQUE via `.where(sql\`...\`)` — see CONTEXT D-08 |

Both patterns are well-documented in Drizzle's docs. Planner refines exact syntax during plan authoring.

---

## Metadata

**Analog search scope:**
- `src/app/api/**` (all 34 route files surveyed via Grep)
- `src/features/job-leads/lib/**`
- `drizzle/schema/**` (all 13 schema files)
- `drizzle/migrations/**` (8 SQL files)
- `src/test-utils/**`
- `src/lib/{api,db,domain}/**`

**Files Grep-scanned:** ~60 TypeScript files, 8 SQL migrations.

**Key absences** confirmed by exhaustive Grep:
- No `db.transaction` callsite anywhere in `src/` or `drizzle/`
- No `index(` or `uniqueIndex(` in `drizzle/schema/`
- No `db.execute(sql\`UPDATE` or `db.execute(sql\`INSERT` pattern — only `sql` template inside WHERE clauses
- No `sql.raw(` usage in src/ or drizzle/

**Pattern extraction date:** 2026-05-14
