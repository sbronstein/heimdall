# Phase 7: Schema + API for Company-Scope Leads - Pattern Map

**Mapped:** 2026-05-19
**Files analyzed:** 8 (4 source modifications/additions, 4 test files)
**Analogs found:** 8 / 8

## File Classification

| File | New/Modified | Role | Data Flow | Closest Analog | Match Quality |
|------|---|------|-----------|----------------|---------------|
| `drizzle/schema/job-leads.ts` | modify | schema (table definition) | n/a (DDL) | `drizzle/schema/companies.ts` (already-nullable column) | exact |
| `drizzle/migrations/0009_allow_company_scope_job_leads.sql` | new | migration | n/a (DDL) | `drizzle/migrations/0007_add_queued_failed_status_and_error_columns.sql` | exact (single `ALTER` shape) |
| `src/app/api/job-leads/route.ts` | modify | API route (POST) | request-response | self (existing job-URL branch, lines 66-134) | exact (extension of same handler) |
| `src/lib/domain/types.ts` | modify | domain constants | n/a (compile-time) | existing `*Values as const` exports in same file | exact |
| `src/app/api/job-leads/route.test.ts` | extend | test (route) | request-response | self (existing `GET ?status=queued` tests) + `[id]/status/route.test.ts` | exact |
| `src/lib/db/__phase7_schema__.test.ts` | new | test (schema regression) | DDL introspection | `src/lib/db/__phase6_indexes__.test.ts` | exact |
| `src/app/api/job-leads/[id]/status/route.test.ts` | extend | test (route) | request-response | self (Tests 1-8 in same file) | exact |
| `src/app/api/job-leads/[id]/prospects/route.test.ts` | extend | test (route) | request-response | self (Test 1, Test 1b in same file) | exact |
| `src/test-utils/pglite.ts` | optional extend | test fixture helper | n/a | self (`createTestDb` function) | exact |

---

## Pattern Assignments

### `drizzle/schema/job-leads.ts` (schema, DDL)

**Analog:** `drizzle/schema/companies.ts:25` (column declared nullable — no `.notNull()`)

**Current state** (`drizzle/schema/job-leads.ts:18-19`):

```typescript
// Core
linkedinJobUrl: text('linkedin_job_url').notNull(),
roleTitle: text('role_title'),
```

**Pattern to apply** — drop `.notNull()`, matching the nullable-text shape of `companies.linkedinUrl` (`drizzle/schema/companies.ts:25`):

```typescript
linkedinUrl: text('linkedin_url'),
```

**Resulting line 19** (D-05):

```typescript
linkedinJobUrl: text('linkedin_job_url'),
```

No other column changes. `roleTitle` (line 20) and `companyName` (line 21) are already nullable.

---

### `drizzle/migrations/0009_allow_company_scope_job_leads.sql` (migration, DDL)

**Analog:** `drizzle/migrations/0007_add_queued_failed_status_and_error_columns.sql` (single-table `ALTER` migration)

**Pattern from analog** (the entire file is 4 lines — Drizzle Kit's standard `ALTER` output with `--> statement-breakpoint` separators):

```sql
ALTER TYPE "public"."job_lead_status" ADD VALUE IF NOT EXISTS 'queued' BEFORE 'searching';--> statement-breakpoint
ALTER TYPE "public"."job_lead_status" ADD VALUE IF NOT EXISTS 'failed';--> statement-breakpoint
ALTER TABLE "job_leads" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "job_leads" ADD COLUMN "last_error_at" timestamp with time zone;
```

**Expected output for Phase 7** (CD-01):

```sql
ALTER TABLE "job_leads" ALTER COLUMN "linkedin_job_url" DROP NOT NULL;
```

**Generation command** (CD-01):

```bash
npm run db:generate -- --name=allow_company_scope_job_leads
```

**Optional one-line header comment** (CD-03):

```sql
-- Allow company-scope job leads: drop NOT NULL on linkedin_job_url so synthetic leads created from a company name/URL can exist
```

Also need to verify `drizzle/migrations/meta/_journal.json` is appended with the `0009` entry — Drizzle Kit handles this automatically; planner just verifies.

---

### `src/app/api/job-leads/route.ts` (API route, request-response)

**Analog:** Itself — the existing POST handler at `src/app/api/job-leads/route.ts:66-134` is the closest analog, since this phase extends the same handler in place.

**Imports pattern** (lines 1-11) — extend with `and`, `isNull`, `inArray` (already imported), and `success` (currently only `created` and `paginated`):

```typescript
import { db } from '@/lib/db';
import { jobLeads } from '../../../../drizzle/schema';
import { desc, inArray, isNull, lt, sql, eq } from 'drizzle-orm';
import { created, paginated } from '@/lib/api/types';
import { serverError, validationError } from '@/lib/api/errors';
import { parseArrayParam, parseCursor, parseLimit } from '@/lib/api/filters';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';
import { scrapeJobPage } from '@/features/job-leads/lib/scrape-job-page';
import { companies } from '../../../../drizzle/schema';
import { jobLeadStatusValues } from '@/lib/domain/types';
```

**Required additions for Phase 7:**
- `and` to `drizzle-orm` import (for D-13's compound WHERE)
- `success` to `@/lib/api/types` import (for D-13's 200 response on dedup)
- `COMPANY_SCOPE_ROLE_TITLE` from `@/lib/domain/types`

**Current Zod schema** (line 13-15) — to be replaced with discriminated union:

```typescript
const createJobLeadSchema = z.object({
  linkedinJobUrl: z.string().url()
});
```

**Discriminated Zod union pattern** (D-01, D-02 — sketch from CONTEXT §specifics):

```typescript
const createJobLeadSchema = z.union([
  z.object({ linkedinJobUrl: z.string().url() }),
  z.object({
    companyName: z.string().min(1).max(200),
    linkedinCompanyUrl: z.string().url().optional()
  })
]);
type CreateJobLeadInput = z.infer<typeof createJobLeadSchema>;
// Narrow at use site: `if ('linkedinJobUrl' in validated) { ...existing job-URL branch... }`
```

**Existing job-URL POST flow** (lines 66-134) — kept verbatim, wrapped in the `if ('linkedinJobUrl' in validated)` branch.

**Existing company-match pattern** (lines 87-94 — reused for D-07 verbatim, including the `sql\`lower(...) = lower(...)\`` template tag):

```typescript
let companyId: string | null = null;
if (scraped.companyName) {
  const [match] = await db
    .select()
    .from(companies)
    .where(
      sql`lower(${companies.name}) = lower(${scraped.companyName})`
    )
    .limit(1);
  if (match) companyId = match.id;
}
```

**Existing timeline-after-write pattern** (lines 110-115 — reused for D-04 with `metadata.scope: 'company'`):

```typescript
await logTimeline({
  eventType: 'job_lead_created',
  title: `New job lead: ${scraped.roleTitle || 'Unknown Role'} at ${scraped.companyName || 'Unknown Company'}`,
  companyId: companyId || undefined,
  metadata: { jobLeadId: lead.id }
});
```

**Existing error handling pattern** (lines 128-133 — kept verbatim wrapping the whole handler):

```typescript
} catch (err) {
  if (err instanceof z.ZodError) {
    return validationError(err.issues[0].message);
  }
  return serverError(err);
}
```

**Company-scope branch — full sketch from CONTEXT §specifics (apply after `if ('linkedinJobUrl' in validated)` returns false):**

```typescript
// Lookup-or-create company (D-07, D-08, D-09)
const [match] = await db
  .select()
  .from(companies)
  .where(sql`lower(${companies.name}) = lower(${validated.companyName})`)
  .limit(1);

let companyId: string;
if (match) {
  companyId = match.id;
  // D-09: backfill linkedinUrl if missing and we have one
  if (match.linkedinUrl == null && validated.linkedinCompanyUrl) {
    await db
      .update(companies)
      .set({ linkedinUrl: validated.linkedinCompanyUrl, updatedAt: new Date() })
      .where(eq(companies.id, match.id));
  }
} else {
  // D-08: auto-create stub
  const [createdCompany] = await db
    .insert(companies)
    .values({
      name: validated.companyName,
      linkedinUrl: validated.linkedinCompanyUrl ?? null
      // priority, stage, status, remotePolicy default via schema
    })
    .returning();
  companyId = createdCompany.id;
}

// Idempotent dedup check (D-13, D-14)
const [existing] = await db
  .select()
  .from(jobLeads)
  .where(
    and(
      eq(jobLeads.companyId, companyId),
      isNull(jobLeads.linkedinJobUrl),
      inArray(jobLeads.status, ['queued', 'searching', 'failed']),
      isNull(jobLeads.archivedAt)
    )
  )
  .limit(1);
if (existing) return success(existing); // 200, not 201

// Insert new lead (D-03, D-10, D-11)
const [lead] = await db
  .insert(jobLeads)
  .values({
    linkedinJobUrl: null,
    roleTitle: COMPANY_SCOPE_ROLE_TITLE,
    companyName: validated.companyName,
    companyId,
    status: 'queued'
  })
  .returning();

// Timeline (D-04 — reuse job_lead_created with scope metadata)
await logTimeline({
  eventType: 'job_lead_created',
  title: `Company scrape: ${validated.companyName}`,
  companyId,
  metadata: { jobLeadId: lead.id, scope: 'company' }
});

return created(lead);
```

**Header comment** (D-02 — document first-match-wins on Zod union for ambiguous bodies):

```typescript
// POST /api/job-leads
//
// Accepts a discriminated body (Zod z.union — first-match-wins):
//   1. { linkedinJobUrl }                            — existing job-URL flow (scrapes immediately)
//   2. { companyName, linkedinCompanyUrl? }          — company-scope flow (D-01..D-04, D-07..D-09, D-13..D-15)
//
// If a body matches BOTH shapes (e.g., both linkedinJobUrl and companyName present),
// the union resolves to shape (1) — the job-URL branch — because z.union returns
// the first-successful parse.
```

---

### `src/lib/domain/types.ts` (constants)

**Analog:** Existing `*Values as const` arrays in the same file (e.g., `jobLeadStatusValues` at lines 205-216).

**Pattern from analog** (style — `export const NAME = ... as const;`):

```typescript
export const jobLeadStatusValues = [
  'pending',
  'scraping',
  'scraped',
  'queued',
  'searching',
  'found',
  'ready',
  'actioned',
  'archived',
  'failed'
] as const;
```

**Phase 7 addition** (D-11 — from CONTEXT §specifics, place near the `*Values` block):

```typescript
/**
 * Reserved roleTitle for company-scope job leads (no source job URL).
 * Convention: only the company-scope branch of POST /api/job-leads writes this.
 * Phase 7 D-10/D-11. Phase 9 UI keys off `linkedinJobUrl === null`, not this sentinel.
 */
export const COMPANY_SCOPE_ROLE_TITLE = 'Company-wide scrape' as const;
```

No type alias needed (single literal string, not a union). Convention-only — no runtime enforcement (D-11).

---

### `src/lib/db/__phase7_schema__.test.ts` (new — schema regression test)

**Analog:** `src/lib/db/__phase6_indexes__.test.ts` (sibling phase-N schema regression file)

**Imports pattern** (`__phase6_indexes__.test.ts:1-2`):

```typescript
import { createTestDb } from '@/test-utils/pglite';
import { sql } from 'drizzle-orm';
```

**describe block pattern** (lines 4-22):

```typescript
describe('Phase 6 schema indexes regression (D-20)', () => {
  it('migrations create the 5 hot-path indexes from D-13', async () => {
    const db = await createTestDb();
    const result = await db.execute(sql`
      SELECT indexname, tablename, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('contacts', 'companies')
    `);
    const rows = result.rows as Array<{ indexname: string; tablename: string; indexdef: string }>;
    const indexNames = rows.map((r) => r.indexname);
    expect(indexNames).toEqual(expect.arrayContaining([
      'contacts_archived_at_idx',
      // ...
    ]));
  });
});
```

**Pattern to apply for Phase 7** (D-06 — insert + read-back assertion for `linkedinJobUrl: null`):

```typescript
import { createTestDb } from '@/test-utils/pglite';
import { jobLeads, companies } from '../../../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('Phase 7 schema regression (D-06)', () => {
  it('job_leads accepts linkedinJobUrl: null after 0009 migration', async () => {
    const db = await createTestDb();

    // Seed a company so the FK is valid
    const [company] = await db
      .insert(companies)
      .values({ name: 'TestCo' })
      .returning();

    // INSERT with linkedinJobUrl: null — the constraint relaxation under test
    const [inserted] = await db
      .insert(jobLeads)
      .values({
        linkedinJobUrl: null,
        roleTitle: 'Company-wide scrape',
        companyName: 'TestCo',
        companyId: company.id,
        status: 'queued'
      })
      .returning();

    expect(inserted.linkedinJobUrl).toBeNull();
    expect(inserted.status).toBe('queued');

    // Read back
    const [readBack] = await db
      .select()
      .from(jobLeads)
      .where(eq(jobLeads.id, inserted.id));

    expect(readBack.linkedinJobUrl).toBeNull();
    expect(readBack.roleTitle).toBe('Company-wide scrape');
  });
});
```

**Note:** The `__phase6_indexes__.test.ts` analog uses raw SQL introspection (querying `pg_indexes`). Phase 7's test uses the higher-level Drizzle insert+select pattern because the constraint under test is column nullability, which is easier to verify via a successful insert than by querying `information_schema.columns`. Both patterns are valid; the planner picks the simpler one.

---

### `src/app/api/job-leads/route.test.ts` (extend — POST tests)

**Analog:** Itself (existing `GET /api/job-leads?status=queued` tests at lines 19-102) for fixture setup pattern, and `[id]/status/route.test.ts` for the route-test scaffold (`vi.hoisted`, `vi.mock('@/lib/db')` Proxy pattern).

**Imports pattern** (lines 1-3 of `route.test.ts`, mirrored from `[id]/status/route.test.ts:1-10`):

```typescript
import { createTestDb } from '@/test-utils/pglite';
import { callRoute } from '@/test-utils/call-route';
import { companies, jobLeads } from '../../../../drizzle/schema';
```

**Hoisted mock pattern** (lines 5-17 — verbatim from existing tests):

```typescript
const { dbRef } = vi.hoisted(() => ({
  dbRef: { current: null as Awaited<ReturnType<typeof createTestDb>> | null }
}));

vi.mock('@/lib/db', () => ({
  db: new Proxy(
    {},
    {
      get: (_: object, prop: string | symbol) =>
        (dbRef.current as unknown as Record<string | symbol, unknown>)[prop]
    }
  )
}));
```

**beforeEach + fixture pattern** (lines 22-51 — adapted from GET tests but tailored to POST):

```typescript
beforeEach(async () => {
  dbRef.current = await createTestDb();
  // No fixtures needed — POST creates the rows
});
```

For the dedup test, seed an in-flight company-scope lead first:

```typescript
const [company] = await dbRef.current.insert(companies).values({ name: 'AcmeCo' }).returning();
await dbRef.current.insert(jobLeads).values({
  linkedinJobUrl: null,
  companyId: company.id,
  companyName: 'AcmeCo',
  roleTitle: 'Company-wide scrape',
  status: 'queued'
});
```

**callRoute POST pattern** (from `[id]/status/route.test.ts:50-60`):

```typescript
const { POST } = await import('@/app/api/job-leads/route');

const { status, body } = await callRoute(
  POST as unknown as Parameters<typeof callRoute>[0],
  {
    method: 'POST',
    body: { companyName: 'AcmeCo', linkedinCompanyUrl: 'https://linkedin.com/company/acme' }
  }
);
```

**Assertion pattern** (from existing tests):

```typescript
expect(status).toBe(201);  // 200 for dedup path
expect(body).toMatchObject({
  success: true,
  data: expect.objectContaining({
    linkedinJobUrl: null,
    roleTitle: 'Company-wide scrape',
    status: 'queued'
  })
});
```

**Timeline-verification pattern** (from `[id]/status/route.test.ts:71-74`):

```typescript
const rows = await dbRef.current!.select().from(timelineEvents);
expect(rows).toHaveLength(1);
expect(rows[0].eventType).toBe('job_lead_created');
const meta = rows[0].metadata as Record<string, unknown>;
expect(meta.scope).toBe('company');
```

**Tests to add** (CONTEXT §specifics):
- (a) company-scope create path — new row, returns 201
- (b) company-scope dedup path — in-flight match returns 200, no duplicate row inserted
- (c) backfill of `companies.linkedinUrl` on existing-match-with-null path
- (d) auto-create of stub company on no-match path
- (e) discriminated Zod rejection for empty body / both fields present (D-02 — verify first-match-wins resolves both-present to the job-URL branch)

**Caveat for tests covering the existing job-URL branch:** `scrapeJobPage` performs a real HTTP fetch. Existing POST tests may already mock it; the new company-scope tests do NOT call `scrapeJobPage` so no mock is needed for them. The "both fields present" Zod resolution test (e) DOES hit the job-URL branch — planner decides whether to `vi.mock('@/features/job-leads/lib/scrape-job-page')` or skip the scrape verification and just assert the route doesn't take the company-scope path.

---

### `src/app/api/job-leads/[id]/status/route.test.ts` (extend — D-17 regression)

**Analog:** Itself (Tests 1-8 already in the file).

**beforeEach fixture pattern** (lines 28-48 — extend or duplicate with a null-URL variant):

```typescript
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
      status: 'scraped'
    })
    .returning();
  leadId = lead.id;
});
```

**Pattern to apply for Phase 7 D-17** — add a new `describe` block (or extend the existing one) with a fixture using `linkedinJobUrl: null`:

```typescript
describe('PATCH /api/job-leads/[id]/status — company-scope leads (D-17)', () => {
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
        linkedinJobUrl: null,                       // company-scope shape
        roleTitle: 'Company-wide scrape',
        companyId,
        companyName: 'AcmeCo',
        status: 'queued'                            // start at queued
      })
      .returning();
    leadId = lead.id;
  });

  it('queued -> searching -> found traversal works on a null-URL lead', async () => {
    // Same callRoute pattern as Tests 1-4 — verifies the PATCH handler
    // is input-shape agnostic w.r.t. linkedinJobUrl.
  });
});
```

The state-machine-traversal pattern is exactly what Tests 1-4 already exercise; the only delta is the fixture's `linkedinJobUrl: null`.

---

### `src/app/api/job-leads/[id]/prospects/route.test.ts` (extend — D-17 regression)

**Analog:** Itself (Tests 1, 1b already in the file).

**beforeEach pattern** (lines 36-56 — fixture creates a `searching` lead, since prospects route requires `status = 'searching'`):

```typescript
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
```

**Pattern to apply for Phase 7 D-17** — new describe block with the same shape but `linkedinJobUrl: null`:

```typescript
describe('POST /api/job-leads/[id]/prospects — company-scope leads (D-17)', () => {
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
        linkedinJobUrl: null,                       // company-scope shape
        roleTitle: 'Company-wide scrape',
        companyId,
        companyName: 'AcmeCo',
        status: 'searching'                         // ready for prospects insert
      })
      .returning();
    leadId = lead.id;
  });

  it('bulk-prospects + status flip works on a null-URL lead', async () => {
    // Reuse Test 1's prospect array shape and assertion pattern verbatim
  });
});
```

The bulk-insert + status-flip assertion pattern is identical to Test 1 (lines 99-130); only the fixture changes.

---

### `src/test-utils/pglite.ts` (optional — CD-04 fixture helper)

**Analog:** Itself — the existing `createTestDb` function (lines 14-55).

**Existing export pattern** (line 14):

```typescript
export async function createTestDb() { ... }
```

**Pattern to apply (only if more than one test reuses the fixture — DRY threshold per CD-04):**

```typescript
import { jobLeads } from '../../drizzle/schema';
import { COMPANY_SCOPE_ROLE_TITLE } from '@/lib/domain/types';

/**
 * Phase 7 D-17 / CD-04: minimal in-flight company-scope lead fixture.
 * Use when a test needs a job_leads row with linkedinJobUrl: null but doesn't
 * care about the exact status (caller passes status).
 */
export async function createCompanyScopeLead(
  db: Awaited<ReturnType<typeof createTestDb>>,
  opts: { companyId: string; status?: 'queued' | 'searching' | 'failed' }
) {
  const [lead] = await db
    .insert(jobLeads)
    .values({
      linkedinJobUrl: null,
      roleTitle: COMPANY_SCOPE_ROLE_TITLE,
      companyId: opts.companyId,
      status: opts.status ?? 'queued'
    })
    .returning();
  return lead;
}
```

**Decision rule from CD-04:** extract only if 2+ tests use the same fixture. Inline first; refactor on the second test.

---

## Shared Patterns

### Response Envelope (200 vs 201)
**Source:** `src/lib/api/types.ts:12-20`
**Apply to:** All API route returns

```typescript
export function success<T>(data: T, status = 200): Response {
  return Response.json({ success: true, data } satisfies ApiResponse<T>, { status });
}

export function created<T>(data: T): Response {
  return success(data, 201);
}
```

Phase 7 D-13 uses both: `success(lead)` for the dedup-existing path (200), `created(lead)` for the new-row path (201).

---

### Zod Validation Error Mapping
**Source:** `src/app/api/job-leads/route.ts:128-133` + `src/lib/api/errors.ts:8-13`
**Apply to:** All POST/PATCH handlers

```typescript
} catch (err) {
  if (err instanceof z.ZodError) {
    return validationError(err.issues[0].message);
  }
  return serverError(err);
}
```

Phase 7's extended POST handler keeps this verbatim.

---

### Hoisted `vi.mock('@/lib/db')` Proxy Pattern
**Source:** `src/app/api/job-leads/[id]/status/route.test.ts:10-22` (used in every API route test in the codebase)
**Apply to:** All new/extended API route tests in Phase 7

```typescript
const { dbRef } = vi.hoisted(() => ({
  dbRef: { current: null as Awaited<ReturnType<typeof createTestDb>> | null }
}));

vi.mock('@/lib/db', () => ({
  db: new Proxy(
    {},
    {
      get: (_: object, prop: string | symbol) =>
        (dbRef.current as unknown as Record<string | symbol, unknown>)[prop]
    }
  )
}));
```

This pattern is mandated by Phase 2's D-05/D-07 / 02-03-PLAN — non-negotiable for all route tests.

---

### Dynamic Route Import in Tests
**Source:** `src/app/api/job-leads/[id]/status/route.test.ts:51, 73, 83` (every test imports the handler dynamically inside the `it` block)
**Apply to:** All Phase 7 route tests

```typescript
const { POST } = await import('@/app/api/job-leads/route');
const { PATCH } = await import('@/app/api/job-leads/[id]/status/route');
```

Required because the `vi.mock('@/lib/db')` hoist must be applied before the route module's top-level `import { db } from '@/lib/db'` runs.

---

### Timeline-After-Write Invariant
**Source:** `src/lib/db/timeline.ts:17-22` + every API route mutation
**Apply to:** Every write in Phase 7's company-scope branch

```typescript
export async function logTimeline(input: TimelineInput) {
  return db.insert(timelineEvents).values({
    ...input,
    occurredAt: new Date()
  });
}
```

Phase 7 D-04 emits `job_lead_created` with `metadata.scope: 'company'` — never skip the timeline write.

---

### Drizzle Multi-Condition WHERE via `and(...)`
**Source:** Codebase convention (`drizzle-orm` re-exports `and`, `eq`, `isNull`, `inArray`)
**Apply to:** D-13's dedup query

```typescript
import { and, eq, isNull, inArray } from 'drizzle-orm';

const [existing] = await db
  .select()
  .from(jobLeads)
  .where(
    and(
      eq(jobLeads.companyId, companyId),
      isNull(jobLeads.linkedinJobUrl),
      inArray(jobLeads.status, ['queued', 'searching', 'failed']),
      isNull(jobLeads.archivedAt)
    )
  )
  .limit(1);
```

**Note:** The GET handler in `src/app/api/job-leads/route.ts:24-42` uses a `conditions[]`-array + `sql.join` pattern for dynamic WHERE construction. Phase 7's dedup query is statically-shaped (always 4 conditions, no dynamic optional filters), so the simpler `and(...)` form is preferred. Both patterns exist in the codebase; pick by shape (`and(...)` for fixed, `sql.join(conditions)` for variable-length).

---

### Schema Soft-Delete Convention
**Source:** `drizzle/schema/job-leads.ts:43` + project-wide pattern (CLAUDE.md)
**Apply to:** D-13's dedup check

```typescript
archivedAt: timestamp('archived_at')
```

Always include `isNull(jobLeads.archivedAt)` in dedup/list queries. Phase 7 D-13 honors this.

---

### Case-Insensitive Name Match (Hits `companies_name_idx`)
**Source:** `src/app/api/job-leads/route.ts:91` (the existing companies-match pattern)
**Apply to:** D-07's company lookup

```typescript
.where(sql`lower(${companies.name}) = lower(${input})`)
```

This is the one legitimate `sql` template tag use in the codebase (per CLAUDE.md "no raw SQL except for pgvector"). Phase 6's `companies_name_idx` (migration 0008, line 1) supports this lookup. Phase 7 reuses verbatim.

---

## No Analog Found

None. Every Phase 7 file has a strong (exact or extension-of-self) analog in the codebase. Phase 7 is intentionally a tight extension of existing patterns — no new architectural primitives introduced.

---

## Metadata

**Analog search scope:**
- `src/app/api/job-leads/**` (existing POST + sibling routes)
- `src/lib/db/**` (test files + helpers)
- `src/lib/api/**` (response/error helpers)
- `src/lib/domain/**` (constants + state machine)
- `src/test-utils/**` (PGlite + callRoute harness)
- `drizzle/schema/**` (table definitions)
- `drizzle/migrations/**` (prior ALTER migrations)

**Files scanned:** 18

**Pattern extraction date:** 2026-05-19

**Key invariants pinned:**
- Discriminated Zod union with first-match-wins (D-01, D-02)
- 200 vs 201 status-code signaling for idempotent dedup (D-13)
- Reuse `job_lead_created` event with `metadata.scope: 'company'` (D-04)
- Case-insensitive name match hits `companies_name_idx` (D-07)
- `archived_at IS NULL` in dedup query (project-wide soft-delete convention)
- `vi.hoisted + Proxy` mock pattern for all route tests
- Dynamic `await import('@/app/api/...')` after the mock hoist
