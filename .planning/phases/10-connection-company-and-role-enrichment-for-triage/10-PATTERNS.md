# Phase 10: Connection Company + Role Enrichment for Triage - Pattern Map

**Mapped:** 2026-05-20
**Files analyzed:** 9 new/modified targets
**Analogs found:** 9 / 9 (all in-repo, exact or strong role+data-flow matches)

This phase has unusually high analog coverage: every new/modified file maps to an
existing file in the same feature area following the same conventions. The planner
should copy patterns directly — there is little need to fall back to RESEARCH.md.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `drizzle/schema/contacts.ts` (add 4 columns + indexes) | model/schema | n/a (DDL) | self (existing column + index block) + `drizzle/schema/enums.ts` for the status enum | exact |
| `drizzle/migrations/00XX_*.sql` (new migration) | migration | DDL | `drizzle/migrations/0007_add_queued_failed_status_and_error_columns.sql` + `0008_phase6_indexes.sql` | exact |
| `src/app/api/contacts/import/route.ts` (seed at-connection fields) | route | batch/transform | self (existing field-mapping + ON CONFLICT block) | exact |
| `src/app/api/contacts/[id]/enrichment/route.ts` (NEW write-back PATCH) | route | request-response (CRUD update) | `src/app/api/job-leads/[id]/status/route.ts` (PATCH) + `src/app/api/contacts/[id]/route.ts` (PUT) | exact |
| Batch-sweep selection query (in a route or lib helper) | query/utility | CRUD read | `src/app/api/contacts/import/route.ts` STEP 2 narrowed select + `src/app/api/contacts/connections/route.ts` conditions[] | exact |
| `src/app/api/job-leads/[id]/recommendations/route.ts` (JIT enrich hook) | route | request-response | self (existing join + buildRecommendations) | exact |
| `src/features/job-leads/components/recommendation-list.tsx` (render new fields) + `recommendation-card.tsx` | component | request-response (fetch+render) | self + `recommendation-card.tsx` per-card field block | exact |
| `.claude/skills/scrape-linkedin-connections/SKILL.md` (per-profile mode) | skill/doc | n/a | self (Single-lead mode / Drain mode structure) | exact |
| `.claude/skills/.../references/{heimdall-api,linkedin-navigation,troubleshooting}.md` | skill/doc | n/a | self (endpoint sections, nav paths, error categories) | exact |

## Pattern Assignments

### `drizzle/schema/contacts.ts` — add at-connection columns + indexes (model, DDL)

**Analog:** the file itself — `contacts.ts:11-71`. Append new `text()` columns in the
`// Import tracking` group, an `enrichmentStatus` enum column, an `enrichedAt` timestamp,
and new partial indexes in the index array.

**Column pattern** (`drizzle/schema/contacts.ts:34-37`):
```typescript
// Import tracking
linkedinConnectionDate: timestamp('linkedin_connection_date'),
importSource: text('import_source'),
importedAt: timestamp('imported_at'),
```
New columns follow the same shape: `companyAtConnection: text('company_at_connection')`,
`roleAtConnection: text('role_at_connection')`, `enrichedAt: timestamp('enriched_at')`.

**Enum-status pattern** — define a `pgEnum` in `drizzle/schema/enums.ts` following the
existing `jobLeadStatusEnum` (`enums.ts:160-171`) and `outreachStatusEnum` (`enums.ts:144-150`),
then reference it in the schema exactly as the existing enum columns do
(`contacts.ts:27-30`, e.g. `outreachStatus: outreachStatusEnum('outreach_status').default('not_reached_out')`).
Suggested values mirror the job-lead lifecycle vocabulary already in the codebase:
`['unenriched', 'pending', 'enriched', 'failed']` (final names at planner discretion).

**Index pattern** (`contacts.ts:58-69`) — partial index for the sweep selection:
```typescript
index('contacts_archived_at_idx').on(table.archivedAt),
uniqueIndex('contacts_linkedin_url_unique_idx')
  .on(table.linkedinUrl)
  .where(sql`${table.linkedinUrl} IS NOT NULL AND ${table.archivedAt} IS NULL`),
```
Add an index supporting the batch-sweep predicate (active rows missing at-connection
fields) — e.g. `index('contacts_enrichment_status_idx').on(table.enrichmentStatus)`,
optionally partial on `WHERE archived_at IS NULL`.

---

### New Drizzle migration `00XX_*.sql` (migration, DDL)

**Analog:** `drizzle/migrations/0007_add_queued_failed_status_and_error_columns.sql:1-4`
(adds an enum value + columns) and `0008_phase6_indexes.sql:1-5` (creates indexes).

**Column + enum add pattern** (`0007_...sql:1-4`):
```sql
ALTER TYPE "public"."job_lead_status" ADD VALUE IF NOT EXISTS 'queued' BEFORE 'searching';--> statement-breakpoint
ALTER TABLE "job_leads" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "job_leads" ADD COLUMN "last_error_at" timestamp with time zone;
```

**Index create pattern** (`0008_phase6_indexes.sql:2-3`):
```sql
CREATE INDEX "contacts_archived_at_idx" ON "contacts" USING btree ("archived_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_linkedin_url_unique_idx" ON "contacts" USING btree ("linkedin_url") WHERE "contacts"."linkedin_url" IS NOT NULL AND "contacts"."archived_at" IS NULL;
```

**Generation note:** migration is produced by `npm run db:generate` from the schema diff,
then applied with `npm run db:push` (per CONTEXT.md). Do not hand-author the file unless the
generator misses the partial-index predicate (the existing migrations show the exact emitted
syntax to verify against). Statements are separated by `--> statement-breakpoint`.

---

### `src/app/api/contacts/import/route.ts` — seed at-connection fields (route, batch/transform)

**Analog:** the file itself. Two edit points; **do not disturb** the ON CONFLICT path
(CONTEXT.md §specifics).

**Candidate-mapping point** (`import/route.ts:79-101`) — the CSV row already extracts
`company` (`Company`) and `position` (`Position`). Add them to the `Candidate` type
(`route.ts:56-65`) and the `candidates.push({...})` object as `companyAtConnection: company`
and `roleAtConnection: position` — reusing the already-parsed locals, no new CSV parsing:
```typescript
const company = row['Company']?.trim() || null;
const position = row['Position']?.trim() || null;
// ...
candidates.push({
  firstName, lastName, email, linkedinUrl,
  currentCompany: company,
  title: position,
  linkedinConnectionDate,
  key: `...`
});
```

**Insert-values point** (`import/route.ts:142-156`) — add the seed fields to the bulk
`.values(...)` map. Set `enrichmentStatus` to a terminal/seeded value when the CSV provided
both fields (so the sweep skips them), else the unenriched default:
```typescript
.values(
  toInsert.map((c) => ({
    firstName: c.firstName,
    // ... existing fields ...
    currentCompany: c.currentCompany,
    title: c.title,
    // NEW: at-connection seed from CSV baseline
    companyAtConnection: c.companyAtConnection,
    roleAtConnection: c.roleAtConnection,
    tags: ['linkedin-import']
  }))
)
```

**Untouched** (`import/route.ts:171-174`) — the `.onConflictDoNothing({ target, where })`
partial-index conflict path must remain byte-for-byte intact; the seed fields are added to
the `.values()` rows only, never to the conflict target/predicate.

---

### `src/app/api/contacts/[id]/enrichment/route.ts` — NEW write-back PATCH (route, request-response)

**Primary analog:** `src/app/api/job-leads/[id]/status/route.ts:58-119` (PATCH handler with
Zod, conditional field stamping, `logTimeline`, envelope).
**Secondary analog:** `src/app/api/contacts/[id]/route.ts:56-94` (contact PUT — params shape,
`updatedAt: new Date()`, `notFound('Contact')`, contact timeline event).

**Imports** (`job-leads/[id]/status/route.ts:1-9`):
```typescript
import { db } from '@/lib/db';
import { contacts } from '../../../../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';
```
(Relative-depth note: a route at `api/contacts/[id]/enrichment/route.ts` is 6 levels deep, so
the schema import is `'../../../../../../drizzle/schema'` — matches the status route's depth.)

**Zod schema** (model on `statusChangeSchema`, `status/route.ts:38-41`; nullable optional
strings per `contacts/[id]/route.ts:21-22`):
```typescript
const enrichmentSchema = z.object({
  companyAtConnection: z.string().max(300).optional().nullable(),
  roleAtConnection: z.string().max(300).optional().nullable()
});
```

**Handler body** (copy structure from `status/route.ts:58-118`):
```typescript
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = enrichmentSchema.parse(body);

    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
    if (!contact) return notFound('Contact');

    const [updated] = await db
      .update(contacts)
      .set({
        companyAtConnection: validated.companyAtConnection ?? contact.companyAtConnection,
        roleAtConnection: validated.roleAtConnection ?? contact.roleAtConnection,
        enrichmentStatus: 'enriched',        // terminal status drives sweep/JIT skip
        enrichedAt: new Date(),
        updatedAt: new Date()                // CLAUDE.md: Drizzle never auto-updates updatedAt
      })
      .where(eq(contacts.id, id))
      .returning();

    await logTimeline({
      eventType: 'contact_enriched',
      title: `Enriched ${updated.firstName} ${updated.lastName} (at-connection company/role)`,
      contactId: updated.id,
      companyId: updated.companyId || undefined
    });

    return success(updated);
  } catch (err) {
    if (err instanceof z.ZodError) return validationError(err.issues[0].message);
    return serverError(err);
  }
}
```
The `logTimeline` call shape and the `contactId`/`companyId || undefined` arguments come
directly from `contacts/[id]/route.ts:82-87`. The `validationError(err.issues[0].message)`
catch is the universal route pattern (CONVENTIONS).

---

### Batch-sweep selection query (query/utility, CRUD read)

**Analog A — narrowed conditions[] + active filter:** `src/app/api/contacts/connections/route.ts:37-44`:
```typescript
const conditions = [isNull(contacts.archivedAt)];
if (companyId) conditions.push(eq(contacts.companyId, companyId));
```
**Analog B — active-only narrowed select with selected columns:** `import/route.ts:113-123`
(`db.select({...}).from(contacts).where(and(isNull(contacts.archivedAt), ...))`).

**Pattern to build** — select active contacts missing at-connection fields and not in a
terminal enrichment state, ordered for steady progress (oldest connection first), capped:
```typescript
import { and, isNull, or, ne, asc } from 'drizzle-orm';

const queue = await db
  .select({ id: contacts.id, linkedinUrl: contacts.linkedinUrl, firstName: contacts.firstName, lastName: contacts.lastName })
  .from(contacts)
  .where(and(
    isNull(contacts.archivedAt),
    or(isNull(contacts.companyAtConnection), isNull(contacts.roleAtConnection)),
    ne(contacts.enrichmentStatus, 'enriched')   // skip already-enriched / terminal
  ))
  .orderBy(asc(contacts.linkedinConnectionDate))
  .limit(perSessionCap);
```
Use the Drizzle query builder with helper combinators (`and`/`or`/`isNull`/`ne`) — the
codebase prefers these over the `sql.join` accumulator except where a composed key forces it
(see the `import/route.ts:122` composed-key note). The per-session cap + randomized delays
are enforced in the **skill harness**, not the query (CONTEXT.md §pacing).

---

### `src/app/api/job-leads/[id]/recommendations/route.ts` — JIT enrichment hook (route, request-response)

**Analog:** the file itself — `recommendations/route.ts:13-55`. The route currently joins
`prospectBridges → prospects → contacts` (`route.ts:31-40`) and passes rows to
`buildRecommendations` (`route.ts:42`).

**Hook point** — after the join (`route.ts:40`) and before `buildRecommendations`
(`route.ts:42`), detect contacts in `rows` whose `companyAtConnection`/`roleAtConnection` are
null and trigger inline enrichment. Per CONTEXT.md the enrichment WRITE must go through the
REST PATCH endpoint above (architectural invariant — no direct DB write here); this route may
flag/return which contacts need enrichment, or call a thin enrichment trigger. Keep the route
a "pure read" for the recommendation computation as documented at `route.ts:28-30`.

**Existing read+meta shape to preserve** (`route.ts:42-52`):
```typescript
const recommendations = buildRecommendations(rows);
return success({
  recommendations,
  meta: { totalProspects: lead.prospectCount, totalBridges: rows.length, totalContacts: recommendations.length }
});
```
If the JIT path surfaces enrichment state, extend `meta` (e.g. `pendingEnrichment: n`) rather
than changing the existing keys — downstream `recommendation-list.tsx:25` reads
`data.recommendations`.

---

### `recommendation-list.tsx` + `recommendation-card.tsx` — render at-connection fields (component)

**Analog:** the two files themselves. `recommendation-list.tsx:74-89` maps recommendations to
`<RecommendationCard>` props; `recommendation-card.tsx:23-101` renders the per-card fields.

**Prop-passing point** (`recommendation-list.tsx:75-87`) — the card is fed flattened props
from `rec.contact`. Add the new fields here:
```tsx
<RecommendationCard
  key={rec.contact.id}
  contactName={`${rec.contact.firstName} ${rec.contact.lastName}`}
  closeness={rec.contact.closeness}
  lastContactDate={rec.contact.lastContactDate}
  companyAtConnection={rec.contact.companyAtConnection}   // NEW
  roleAtConnection={rec.contact.roleAtConnection}         // NEW
  score={rec.score}
  prospects={/* ... */}
  onRequestIntro={() => handleRequestIntro(rec.contact.id)}
/>
```
(`PrioritizedRecommendation.contact` is the full `Contact` Drizzle type per
`prioritization.ts:25-26`, so the new columns are available once the schema/migration land —
no `prioritization.ts` change needed; CONTEXT.md confirms the bridge formula is unchanged.)

**Render point** (`recommendation-card.tsx:60-64`) — model the new line on the existing
"Last contact" muted subline:
```tsx
{lastContactDate && (
  <p className='text-muted-foreground mt-0.5 text-xs'>
    Last contact: {new Date(lastContactDate).toLocaleDateString()}
  </p>
)}
```
Add a sibling muted line rendering company + role-at-connection (and the `RecommendationCardProps`
interface at `recommendation-card.tsx:23-35` gains the two optional `string | null` props).
For a labeled pill instead of plain text, the `<Badge variant='outline'>` pattern at
`recommendation-card.tsx:51-58` / `93-98` is the in-component badge convention.

---

### `.claude/skills/scrape-linkedin-connections/SKILL.md` — add per-profile mode (skill/doc)

**Analog:** the existing `## Single-lead mode` (`SKILL.md:116-141`) and `## Drain mode`
(`SKILL.md:67-114`) sections. The new individual-profile mode is a sibling mode with the same
shape: claim/setup → navigate → extract → write-back → error-handling.

**Structure to mirror:**
- **Argument parsing** branch (`SKILL.md:47-65`) — add a branch that recognizes a contact UUID
  or a `/in/<slug>` LinkedIn profile URL routing to the new profile mode (first-match-wins
  ordering, same as the existing 5-branch ladder).
- **Setup prerequisites** (`SKILL.md:36-43`) — reuse verbatim (token, env, dev server,
  agent-browser, signed-in Chrome).
- **Extract step** (`SKILL.md:131-137`) — replace the 5-field `ScrapedProspect` extraction
  with a 2-field profile extraction: `companyAtConnection`, `roleAtConnection` (from the
  profile's current/most-recent experience — best-effort, NOT historical reconstruction per
  CONTEXT.md §deferred).
- **Write-back step** (`SKILL.md:138-141`) — instead of POST `/prospects`, PATCH the new
  `/api/contacts/<id>/enrichment` endpoint. Reuse the bearer-auth curl pattern verbatim from
  the failure-PATCH block (`SKILL.md:156-163`).
- **Batch-sweep mode** — model the per-session loop on `## Drain mode` (`SKILL.md:67-114`):
  fetch the enrichment queue (the batch-sweep selection above, exposed via a GET endpoint or a
  query the harness drives), render a table, ask the user, loop per-profile with per-lead error
  isolation (`SKILL.md:112` "write the categorized error and CONTINUE — do NOT abort the batch").
- **Pacing (success criterion #4)** — document in the loop: randomized inter-request delays, a
  per-session profile cap, back-off on anti-bot signals. The existing ~5-min per-lead budget
  (`SKILL.md:169`) and constraints (`SKILL.md:165-172`) carry forward.

**Frontmatter** (`SKILL.md:1-8`) — `allowed-tools` and `argument-hint` already cover the new
mode (Read/Bash; UUID-or-URL arg). Update the `description` to mention the profile-enrichment
mode.

### `references/heimdall-api.md` — document the enrichment endpoint (skill/doc)

**Analog:** the numbered endpoint sections, e.g. `### 2. PATCH /api/job-leads/[id]/status`
(`heimdall-api.md:122-176`) and `### 6. PUT /api/companies/[id]` (`heimdall-api.md:317-342`).
Add a new numbered section for `PATCH /api/contacts/[id]/enrichment` with: Used-by, Body
(the Zod shape), Side effects (sets `enrichmentStatus`/`enrichedAt`, emits timeline event),
Response envelope, and a bearer-auth Curl block mirroring `heimdall-api.md:336-341`. Reuse the
Auth section (`heimdall-api.md:10-35`) and Response-envelope/status-code tables
(`heimdall-api.md:37-65`, `346-356`) unchanged.

### `references/linkedin-navigation.md` — add profile-page extraction section (skill/doc)

**Analog:** the existing entry-point path sections (Job-URL / Company-URL / Bare-name) plus
`## Shared` Steps 4–5 referenced throughout `SKILL.md`. Add a "Profile-page path" section:
navigate to `/in/<slug>/`, locate the current-experience block, extract company + role, with
selector hints in the same style as the existing nav doc.

### `references/troubleshooting.md` — document pacing / anti-bot back-off (skill/doc)

**Analog:** the five-category structure (`troubleshooting.md:1-15` preamble; per-category
sections like `## Timeout` at `:18-39` and `## LinkedIn navigation failed` at `:42-60`).
Pacing belongs under the navigation/anti-bot categories: document the randomized delay ranges,
per-session cap, and back-off-on-signal strategy here (CONTEXT.md §pacing requires it
documented in references). Reuse the per-action budget guidance (`troubleshooting.md:33-38`)
and map any new anti-bot observation into the existing five categories rather than adding a
sixth (`troubleshooting.md:10-15` explicitly raises the bar for a new category).

## Shared Patterns

### Response envelope + error factories
**Source:** `src/lib/api/types.ts` (`success`, `created`, `paginated`), `src/lib/api/errors.ts`
(`notFound`, `serverError`, `validationError`).
**Apply to:** the new enrichment PATCH route and any new sweep/JIT endpoint.
Every route ends with `return success(data)` and catches with:
```typescript
} catch (err) {
  if (err instanceof z.ZodError) return validationError(err.issues[0].message);
  return serverError(err);
}
```
(verbatim from `contacts/[id]/route.ts:90-93`, `job-leads/[id]/status/route.ts:113-118`).

### Timeline side-effect on every write
**Source:** `src/lib/db/timeline.ts` — `logTimeline({ eventType, title, contactId?, companyId?, metadata? })`.
**Apply to:** the enrichment PATCH and any sweep write.
Called AFTER the committed write, with the entity ids:
```typescript
await logTimeline({
  eventType: 'contact_enriched',
  title: `Enriched ${updated.firstName} ${updated.lastName}`,
  contactId: updated.id,
  companyId: updated.companyId || undefined
});
```
(shape from `contacts/[id]/route.ts:82-87`; post-commit ordering rationale at
`job-leads/[id]/prospects/route.ts:125-136`).

### Manual `updatedAt` on every update
**Source:** CLAUDE.md / CONVENTIONS — Drizzle does not auto-update.
**Apply to:** every `db.update(contacts).set({...})`. Always include `updatedAt: new Date()`
(see `contacts/[id]/route.ts:65`, `job-leads/[id]/status/route.ts:84`).

### Bearer-auth REST write-back from the skill (never direct DB)
**Source:** `references/heimdall-api.md:10-35` (auth) + `SKILL.md:156-163` (failure PATCH curl).
**Apply to:** the profile-enrichment write-back and the batch-sweep loop.
```bash
TOKEN=$(cat ~/.heimdall/api-token)
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"companyAtConnection":"OpenAI","roleAtConnection":"Member of Technical Staff"}' \
  "http://localhost:4000/api/contacts/$CONTACT_ID/enrichment"
```
Architectural invariant (CONTEXT.md §decisions, CLAUDE.md): the skill writes via REST only,
never touches the DB; CLI parity depends on it.

### Active-rows / soft-delete filter
**Source:** `isNull(contacts.archivedAt)` — ubiquitous (`contacts_archived_at_idx` exists for it).
**Apply to:** the batch-sweep selection and any JIT contact lookup. Never hard-delete; the
sweep must scope to `archived_at IS NULL` (`connections/route.ts:37`, `import/route.ts:120`).

## No Analog Found

None. All nine targets have strong in-repo analogs.

## Metadata

**Analog search scope:** `drizzle/schema/`, `drizzle/migrations/`, `src/app/api/contacts/**`,
`src/app/api/job-leads/**`, `src/features/job-leads/{components,lib}/`,
`.claude/skills/scrape-linkedin-connections/**`, `src/lib/api/`, `src/lib/db/timeline.ts`.
**Files scanned:** ~16 read in full or in targeted ranges.
**Pattern extraction date:** 2026-05-20
