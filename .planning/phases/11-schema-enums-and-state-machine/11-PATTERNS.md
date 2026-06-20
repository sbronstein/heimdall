# Phase 11: Schema, Enums, and State Machine - Pattern Map

**Mapped:** 2026-06-20
**Files analyzed:** 9 (3 modified, 4 new, 2 test analogs)
**Analogs found:** 9 / 9 (all in-repo, exact or near-exact)

This is a backend/schema phase. No UI, no API routes (those are Phase 12+). Every new file has a strong existing analog — there is **no "no analog found" bucket**. The planner should treat the excerpts below as copy-from sources and apply the listed adaptations.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `drizzle/schema/enums.ts` (MODIFY) | model / schema | transform (DDL) | `jobLeadStatusEnum` in same file | exact |
| `drizzle/schema/outreach-campaigns.ts` (NEW) | model / schema | CRUD (table) | `jobLeads` table in `job-leads.ts` | exact |
| `drizzle/schema/outreach-emails.ts` (NEW) | model / schema | CRUD (table) | `jobLeads` (cols) + `prospectBridges` (3rd-arg unique/index) | exact |
| `drizzle/schema/index.ts` (MODIFY) | config / barrel | — | existing barrel lines | exact |
| `src/lib/domain/types.ts` (MODIFY) | model / types | — | `JobLead`/`NewJobLead`/`jobLeadStatusValues` block | exact |
| `src/features/outreach/lib/email-status.ts` (NEW) | utility / domain logic | transform (pure fn) | `src/lib/domain/pipeline.ts` | exact |
| `src/features/outreach/lib/email-status.test.ts` (NEW) | test | transform | `src/lib/domain/pipeline.test.ts` | exact |
| `src/lib/db/__phase11_schema__.test.ts` (NEW) | test | CRUD (DB) | `src/lib/db/__phase7_schema__.test.ts` | exact |
| `src/test-utils/pglite.ts` (MAYBE MODIFY — CD-04) | test harness | — | existing `createTestDb()` | exact |

---

## Pattern Assignments

### `drizzle/schema/enums.ts` (MODIFY — append 3 pgEnums)

**Analog:** `jobLeadStatusEnum` in the same file (lines 161–172).

**Pattern** (lines 161–172):
```typescript
export const jobLeadStatusEnum = pgEnum('job_lead_status', [
  'pending',
  'scraping',
  // ...
  'failed'
]);
```

**Adaptation** — append three exports at the end of the file (after `contactEnrichmentStatusEnum`, line 191). Snake_case DB name string, camelCase `*Enum` export:
```typescript
export const outreachCampaignStatusEnum = pgEnum('outreach_campaign_status', [
  'draft',
  'active',
  'completed'
]);

export const outreachChannelEnum = pgEnum('outreach_channel', [
  'email',
  'linkedin_message'
]);

export const outreachEmailStatusEnum = pgEnum('outreach_email_status', [
  'pending',
  'generated',
  'edited',
  'approved',
  'drafted',
  'failed'
]);
```
Values are locked by D-01 / D-07 / D-10. Do **not** add the rejected richer values (`generating`, `drafting`, `skipped`, `needs_linkedin_message`).

---

### `drizzle/schema/outreach-campaigns.ts` (NEW table, campaign CRUD)

**Analog:** `jobLeads` table in `drizzle/schema/job-leads.ts` (lines 15–44) for column conventions; soft-delete via `archivedAt`.

**Imports + table pattern to mirror** (`job-leads.ts` lines 1–28, 40–44):
```typescript
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { jobLeadStatusEnum } from './enums';
// ...
export const jobLeads = pgTable('job_leads', {
  id: uuid('id').defaultRandom().primaryKey(),
  // ...
  status: jobLeadStatusEnum('status').default('pending').notNull(),
  // ...
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at')
});
```

**Adaptation** — columns per CONTEXT line 160 (D-10):
```typescript
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { outreachCampaignStatusEnum } from './enums';

export const outreachCampaigns = pgTable('outreach_campaigns', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  goalInstruction: text('goal_instruction').notNull(),
  status: outreachCampaignStatusEnum('status').default('draft').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at') // soft delete — never hard delete
});
```
No state machine for campaigns (D-10). Soft-delete column present per project convention.

---

### `drizzle/schema/outreach-emails.ts` (NEW table, email CRUD + unique + 3 indexes)

**Analog A — columns:** `jobLeads` in `job-leads.ts` (status enum, failure columns `lastError`/`lastErrorAt` lines 36–38, timestamps).
**Analog B — 3rd-arg unique/index style:** `prospectBridges` in `job-leads.ts` (lines 66–86) + `contacts.ts` index naming (lines 68–79).

**Failure-column pattern** (`job-leads.ts` lines 36–38) — CD-01 says match this exactly:
```typescript
// Error tracking (D-07)
lastError: text('last_error'),
lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
```

**Third-arg unique + index pattern** (`prospectBridges`, `job-leads.ts` lines 66–86):
```typescript
export const prospectBridges = pgTable(
  'prospect_bridges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    prospectId: uuid('prospect_id').references(() => prospects.id).notNull(),
    contactId: uuid('contact_id').references(() => contacts.id).notNull(),
    // ...
  },
  (table) => [unique('prospect_bridge_unique').on(table.prospectId, table.contactId)]
);
```

**Index naming pattern** (`contacts.ts` lines 68–79): `index('<table>_<col>_idx').on(table.col)`.

**Adaptation** — full table per CONTEXT line 159 (D-07/D-09 + CD-01/CD-02). FK targets: `outreachCampaigns.id` and `contacts.id`:
```typescript
import { pgTable, uuid, text, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { outreachChannelEnum, outreachEmailStatusEnum } from './enums';
import { outreachCampaigns } from './outreach-campaigns';
import { contacts } from './contacts';

export const outreachEmails = pgTable(
  'outreach_emails',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    // Links
    campaignId: uuid('campaign_id').references(() => outreachCampaigns.id).notNull(),
    contactId: uuid('contact_id').references(() => contacts.id).notNull(),

    // Channel (D-07) — "needs LinkedIn" is a channel, not a status
    channel: outreachChannelEnum('channel').default('email').notNull(),
    recipientEmail: text('recipient_email'),

    // Generated vs edited content (D-09) — final = editedX ?? generatedX
    generatedSubject: text('generated_subject'),
    generatedBody: text('generated_body'),
    editedSubject: text('edited_subject'),
    editedBody: text('edited_body'),

    // Status (state machine guarded — D-01..D-06)
    status: outreachEmailStatusEnum('status').default('pending').notNull(),

    // Gmail draft linkage (Phase 17)
    gmailDraftId: text('gmail_draft_id'),

    // Failure tracking (CD-01 — mirror job-leads.ts:36-38)
    lastError: text('last_error'),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),

    // Lifecycle timestamps (CD-02 — set by Phase 12 routes on transition)
    generatedAt: timestamp('generated_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    draftedAt: timestamp('drafted_at', { withTimezone: true }),

    // Metadata
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    unique('outreach_emails_campaign_contact_unique').on(table.campaignId, table.contactId),
    index('outreach_emails_campaign_id_idx').on(table.campaignId),
    index('outreach_emails_status_idx').on(table.status),
    index('outreach_emails_contact_id_idx').on(table.contactId)
  ]
);
```
Notes for the planner:
- No `archivedAt` on `outreach_emails` (CONTEXT line 159 omits it — emails belong to a campaign that soft-deletes; planner may confirm but the spec does not list it).
- The `UNIQUE (campaign_id, contact_id)` backs Phase 12's `onConflictDoNothing()` bulk-add (CONTEXT line 129).
- CONTEXT line 159 lists `createdAt`/`updatedAt` without timezone (like `job-leads.ts`); lifecycle + failure timestamps use `{ withTimezone: true }` to match `job-leads.ts:38`. Keep that asymmetry — it mirrors the analog.

---

### `drizzle/schema/index.ts` (MODIFY — barrel)

**Analog:** the existing barrel lines (current line 12 `export * from './job-leads';`).

**Adaptation** — append two lines:
```typescript
export * from './outreach-campaigns';
export * from './outreach-emails';
```
Order matters only for readability, not resolution. Place after `./job-leads`.

---

### `src/lib/domain/types.ts` (MODIFY — 4 types + 3 value arrays)

**Analog:** the `JobLead`/`NewJobLead`/`jobLeadStatusValues` block (lines 28, 43, 206–217).

**Pattern** (lines 28, 43, 206–217):
```typescript
export type JobLead = typeof jobLeads.$inferSelect;
export type NewJobLead = typeof jobLeads.$inferInsert;

export const jobLeadStatusValues = [
  'pending', 'scraping', /* ... */ 'failed'
] as const;
```

**Adaptation — three edits:**

1. Add to the `import type { ... } from '../../../drizzle/schema'` block (lines 1–15):
```typescript
  outreachCampaigns,
  outreachEmails
```

2. Add inferred select + insert types (alongside lines 28–30 / 43–45):
```typescript
export type OutreachCampaign = typeof outreachCampaigns.$inferSelect;
export type OutreachEmail = typeof outreachEmails.$inferSelect;
export type NewOutreachCampaign = typeof outreachCampaigns.$inferInsert;
export type NewOutreachEmail = typeof outreachEmails.$inferInsert;
```

3. Add three `*Values as const` arrays (mirroring the enum in `enums.ts`, for Zod schemas in Phase 12 + UI):
```typescript
export const outreachCampaignStatusValues = ['draft', 'active', 'completed'] as const;
export const outreachChannelValues = ['email', 'linkedin_message'] as const;
export const outreachEmailStatusValues = [
  'pending', 'generated', 'edited', 'approved', 'drafted', 'failed'
] as const;
```
Optionally export `(typeof X)[number]` union types as `seniorityLevelValues` does (line 238) — discretionary, not required by CONTEXT (which only names the 4 inferred types + 3 arrays).

---

### `src/features/outreach/lib/email-status.ts` (NEW — pure-function state machine)

**Analog:** `src/lib/domain/pipeline.ts` (entire file, 55 lines) — copy structure verbatim.

**Pattern** (`pipeline.ts` lines 46–55):
```typescript
export function canTransition(from: string, to: string): boolean {
  if (terminalStates.includes(from)) return false;
  return validTransitions[from]?.includes(to) ?? false;
}

export function isTerminalState(status: string): boolean {
  return terminalStates.includes(status);
}

export { validTransitions, terminalStates };
```

**Adaptation** — exact map from CONTEXT D-03/D-04/D-05/D-06 (lines 141–157). Note `src/features/outreach/lib/` does not exist yet — the directory is created with this file:
```typescript
const validEmailTransitions: Record<string, string[]> = {
  pending:   ['generated', 'failed'],
  generated: ['edited', 'approved', 'failed', 'pending'], // pending = regenerate (D-04)
  edited:    ['approved', 'pending'],                      // pending = regenerate (D-04)
  approved:  ['drafted', 'edited'],                        // edited = un-approve (D-06)
  drafted:   ['edited'],                                   // revise after draft (D-05, DRFT-03)
  failed:    ['pending']                                   // retry
};

const terminalEmailStates: string[] = []; // empty — every state recoverable (D-06)

export function canEmailTransition(from: string, to: string): boolean {
  if (terminalEmailStates.includes(from)) return false;
  return validEmailTransitions[from]?.includes(to) ?? false;
}

export function isEmailTerminalState(status: string): boolean {
  return terminalEmailStates.includes(status);
}

export { validEmailTransitions, terminalEmailStates };
```
Guard order (terminal check first, then map lookup with `?? false`) is load-bearing — keep it identical to `pipeline.ts` so an empty terminal set still short-circuits correctly and unknown `from` returns `false`.

---

### `src/features/outreach/lib/email-status.test.ts` (NEW — Vitest, pure)

**Analog:** `src/lib/domain/pipeline.test.ts` (85 lines). No DB — pure function, skips the PGlite harness (CD-04).

**Pattern** (`pipeline.test.ts` lines 1–13) — globals-style `describe`/`it` (no imports of `describe`/`expect`; vitest globals are configured):
```typescript
import { canTransition, isTerminalState, validTransitions, terminalStates } from '@/lib/domain/pipeline';

describe('pipeline', () => {
  describe('canTransition', () => {
    describe('valid forward moves', () => {
      it('allows all valid transitions in the graph', () => {
        for (const [from, destinations] of Object.entries(validTransitions)) {
          for (const to of destinations) {
            expect(canTransition(from, to)).toBe(true);
          }
        }
      });
    });
```

**Adaptation** — import from `@/features/outreach/lib/email-status` and `outreachEmailStatusValues` from `@/lib/domain/types`. Required cases per CONTEXT line 161 (SC #2):
- Valid chain accepted: `pending→generated→edited→approved→drafted` (and the loop-over-`validEmailTransitions` assertion like the analog line 7–13).
- Rejected: `pending→drafted`, `approved→pending`, `pending→approved`.
- Regenerate accepted: `edited→pending`, `generated→pending`.
- `drafted→edited` accepted (D-05).
- Unknown `from` returns `false` (e.g. `canEmailTransition('nonexistent', 'pending')`).
- `isEmailTerminalState` returns `false` for **all** values (terminal set empty, D-06) — invert the analog's "returns true for accepted" block: iterate `outreachEmailStatusValues`, assert every one is `false`.

Filename note: CONTEXT names this `src/lib/domain/pipeline.test.ts` as the *analog*; place the new test next to its subject at `src/features/outreach/lib/email-status.test.ts` (co-located like `pipeline.test.ts` sits beside `pipeline.ts`).

---

### `src/lib/db/__phase11_schema__.test.ts` (NEW — schema-regression, PGlite)

**Analog:** `src/lib/db/__phase7_schema__.test.ts` (77 lines).

**Pattern** (`__phase7_schema__.test.ts` lines 1–42):
```typescript
import { createTestDb } from '@/test-utils/pglite';
import { jobLeads, companies } from '../../../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('Phase 7 schema regression (D-06)', () => {
  it('job_leads accepts linkedinJobUrl: null ...', async () => {
    const db = await createTestDb();
    const [company] = await db.insert(companies).values({ name: 'TestCo' }).returning();
    const [inserted] = await db.insert(jobLeads).values({ /* ... */ }).returning();
    expect(inserted.linkedinJobUrl).toBeNull();
    const [readBack] = await db.select().from(jobLeads).where(eq(jobLeads.id, inserted.id));
    expect(readBack.status).toBe('queued');
  });
});
```

**Adaptation** — per CD-05 (CONTEXT line 77). `createTestDb()` auto-applies all `drizzle/migrations/*.sql` in sorted order, so 0011 must be generated/committed before this test passes:
- Insert one `contacts` row (FK target; `contacts.firstName`/`lastName` are `.notNull()` — supply both) + one `outreachCampaigns` row.
- Insert one `outreachEmails` row for `(campaignId, contactId)` with `editedSubject: null` — assert it reads back null (D-09 nullable content).
- Insert a **second** `outreachEmails` row with the same `(campaignId, contactId)` — assert it is rejected by the unique constraint (`await expect(db.insert(...)).rejects.toThrow()`).
- Optionally assert defaults: `status` defaults `'pending'`, `channel` defaults `'email'`.

Import tables from `'../../../drizzle/schema'` (relative, matching the analog line 2 — not the `@/` alias).

---

### `src/test-utils/pglite.ts` (MAYBE MODIFY — CD-04 fixtures)

**Analog:** existing `createTestDb()` in the same file (the only export).

**Decision gate (CD-04, CONTEXT line 76):** Add `createOutreachCampaign()` / `createOutreachEmail()` helpers here **only if reused across both** the state-machine test and the schema-regression test. The state-machine test is pure (no DB), so reuse is across **one** DB test only → **recommendation: do NOT add fixtures**; inline the inserts in `__phase11_schema__.test.ts` (as `__phase7_schema__.test.ts` does — it inlines `db.insert(companies)` rather than using a helper). The existing file already provides everything the DB test needs (`createTestDb()` + the `db.batch` shim). Leave this file untouched unless the planner introduces a third DB consumer.

---

## Shared Patterns

### Enum ↔ `*Values` mirror (cross-cutting, all 3 enums)
**Source:** `drizzle/schema/enums.ts` + `src/lib/domain/types.ts`
**Apply to:** every new enum
Each enum is declared once as a `pgEnum` in `enums.ts` and re-listed as an `as const` array in `types.ts`. The two must stay value-identical (same strings, same order). Phase 12 Zod schemas and UI option lists consume the `*Values` arrays, never the `pgEnum`.

### Column conventions (both new tables)
**Source:** `drizzle/schema/job-leads.ts`
**Apply to:** `outreach-campaigns.ts`, `outreach-emails.ts`
```typescript
id: uuid('id').defaultRandom().primaryKey(),
status: <enum>('status').default(<x>).notNull(),
createdAt: timestamp('created_at').defaultNow().notNull(),
updatedAt: timestamp('updated_at').defaultNow().notNull(),
archivedAt: timestamp('archived_at') // campaigns only — soft delete
```
Snake_case DB column name string, camelCase TS property. `updatedAt` defaults `defaultNow()` but is set manually (`new Date()`) on UPDATE in Phase 12 routes — not relevant to Phase 11 inserts but the default must be present.

### State-machine module shape
**Source:** `src/lib/domain/pipeline.ts`
**Apply to:** `src/features/outreach/lib/email-status.ts`
`canX(from, to)` guards: terminal check first → `map[from]?.includes(to) ?? false`. Export `canX`, `isXTerminalState`, and re-export the `validX`/`terminalX` consts for the test to iterate.

### Migration generation (CD-03)
**Source:** Phase 7 lineage (`07-CONTEXT.md` D-05).
Run `npm run db:generate -- --name=outreach_campaigns` → expect `0011_outreach_campaigns.sql` containing `CREATE TYPE` ×3, `CREATE TABLE` ×2, the unique constraint, and 3 indexes. Inspect before `npm run db:migrate`. `createTestDb()` replays this file from `drizzle/migrations/`, so the schema-regression test is the gate that proves the migration is well-formed.

---

## No Analog Found

None. Every file maps to an in-repo analog. The planner does not need RESEARCH.md fallbacks for this phase.

---

## Metadata

**Analog search scope:** `drizzle/schema/`, `src/lib/domain/`, `src/lib/db/`, `src/test-utils/`, `src/features/`
**Files scanned:** enums.ts, job-leads.ts, contacts.ts, schema/index.ts, pipeline.ts, pipeline.test.ts, __phase7_schema__.test.ts, pglite.ts, types.ts, package.json, vitest.config.ts
**Test runner:** Vitest 4 (globals — `describe`/`it`/`expect` not imported), config at `vitest.config.ts`, scripts `npm test` / `npm run test:run`
**Pattern extraction date:** 2026-06-20
