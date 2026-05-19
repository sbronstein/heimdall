# Phase 7: Schema + API for Company-Scope Leads - Context

**Gathered:** 2026-05-19
**Status:** Ready for planning

<domain>
## Phase Boundary

The Heimdall data layer + REST API foundation for **"synthetic" job leads** — `job_leads` rows with no `linkedinJobUrl`, created from a company name (and optional LinkedIn company URL). These leads enter the **same queue** (`status = 'queued'`) and downstream pipeline as job-URL leads. Phases 8 (skill input parsing + nav) and 9 (UI for company-scope) both build on this foundation.

**In scope:**
- Drizzle schema migration to drop `NOT NULL` on `job_leads.linkedin_job_url`
- Extension of `POST /api/job-leads` with a discriminated Zod schema that accepts a second body shape: `{ companyName, linkedinCompanyUrl? }` — no `linkedinJobUrl`, no `scrapeJobPage()` call
- Auto-create / auto-link logic to a `companies` row (matched by case-insensitive name; auto-created as a minimal stub on miss; `companies.linkedinUrl` backfilled on existing rows that don't already have one)
- A canonical `COMPANY_SCOPE_ROLE_TITLE` constant in `src/lib/domain/types.ts` and the route writing it as `roleTitle` on the new lead
- Idempotent dedup: if an in-flight company-scope lead (`status IN ('queued', 'searching', 'failed')` AND `archived_at IS NULL`) already exists for the company, the route returns the existing row with HTTP 200 instead of creating a duplicate (HTTP 201)
- Verification that the existing `PATCH /api/job-leads/[id]/status` and `POST /api/job-leads/[id]/prospects` routes accept rows where `linkedinJobUrl IS NULL` without errors (state machine and bulk-prospects write are already input-shape agnostic — pin with a regression test)
- API tests via the Phase 2 PGlite + `callRoute` harness covering: company-scope create path (new row), company-scope dedup path (existing row returned), schema regression (insert a row with `linkedinJobUrl = null` and read it back), state-machine + prospects routes accepting `linkedinJobUrl IS NULL` leads

**Out of scope:**
- The skill's input parsing (URL vs bare name vs UUID), LinkedIn company-search disambiguation UX, navigation branching on `linkedinJobUrl IS NULL` — all Phase 8 (JL-C1, JL-C2, JL-C5, JL-C6, JL-C7)
- UI affordances for company-scope leads on the detail page and list view (the "Company scrape" badge, hidden "View job posting" link, employee count display) — Phase 9 (JL-C8, JL-C9)
- Extending dedup logic to job-URL leads — kept scoped to the new branch only; the existing POST contract is unchanged
- Allowing multiple parallel in-flight company-scope leads on the same company — explicit dedup is the chosen policy
- Backfill of historical leads — no existing row has `linkedinJobUrl = NULL` (the migration just drops the constraint; the live data already satisfies the new shape)

</domain>

<decisions>
## Implementation Decisions

### Route Shape

- **D-01:** **Single endpoint, discriminated POST body.** Extend `POST /api/job-leads` (do not add a sibling route). The Zod schema becomes a discriminated union of two `z.object` shapes — `{ linkedinJobUrl: z.string().url() }` (existing path) or `{ companyName: z.string().min(1).max(200), linkedinCompanyUrl: z.string().url().optional() }` (new path). CLI parity stays clean (one URL for both flows); the existing `scrapeJobPage()` call only runs in the job-URL branch.

- **D-02:** **Implicit discrimination by field presence.** No `scope` tag, no `?kind=company` query string. The Zod union resolves on which shape parses successfully. Keeps the API contract minimal — clients post either shape; the route branches on which one matched. If both shapes parse for some malformed input (e.g., both `linkedinJobUrl` and `companyName` present), the union's first-match-wins order treats it as a job-URL request — document this in the route's header comment.

- **D-03:** **INSERT with `status = 'queued'` directly.** The company-scope branch sets `status: 'queued'` on insert. The state machine (`canJobLeadTransition`) gates PATCH transitions only — INSERTs are unrestricted, so this is mechanical. The lead is immediately visible to `GET /api/job-leads?status=queued` and the drain skill picks it up the moment the response returns.

- **D-04:** **Reuse `job_lead_created` timeline event with a `scope: 'company'` metadata flag.** Existing event type, existing renderer; metadata distinguishes company-scope from job-URL creation. Avoids touching the timeline UI in this phase. (If a future phase wants a dedicated event type, it can split at that point.)

### Schema Migration

- **D-05:** **Drop `NOT NULL` on `linkedin_job_url`.** Edit `drizzle/schema/job-leads.ts:19` to remove `.notNull()`. Run `npm run db:generate -- --name=allow_company_scope_job_leads`; the migration should emit `ALTER TABLE job_leads ALTER COLUMN linkedin_job_url DROP NOT NULL`. No data migration — existing rows all have values, so the constraint relaxation is non-destructive. `roleTitle` and `companyName` are already nullable; no schema change needed for those.

- **D-06:** **Regression test for the schema change** in the Phase 2 PGlite harness: insert a `job_leads` row with `linkedinJobUrl: null, roleTitle: null` (or sentinel) via Drizzle's `db.insert(jobLeads).values({...})`, read it back, assert both fields are accepted. Mirrors the spirit of Phase 6's `__phase6_indexes__.test.ts` — pins the schema shape against regression.

### Company Linking

- **D-07:** **Match strategy: case-insensitive name only.** Reuse the existing pattern from `src/app/api/job-leads/route.ts:88-94` (`lower(companies.name) = lower(input)`). Hits the `companies_name_idx` partial index from Phase 6 (migration 0008). One code path, one query plan. If `linkedinCompanyUrl` is provided but the name doesn't match an existing row, we still auto-create (D-08) rather than falling back to URL-based lookup — keeps the matcher predictable.

- **D-08:** **On miss: auto-create a minimum stub.** When no company matches, INSERT a new `companies` row with `{ name: input, linkedinUrl: linkedinCompanyUrl ?? null }` and let the schema defaults supply the rest (`priority: 'exploring'`, `stage: 'unknown'`, `status: 'active'`, `remotePolicy: 'unknown'`). Everything else null. The user curates the stub later via the companies UI. Matches JL-C3 / SC #3 verbatim ("created on the fly if absent"). Capture the new `companies.id` and use it as the lead's `companyId` foreign key.

- **D-09:** **Backfill `companies.linkedinUrl` on existing rows when we have one to add.** If we match an existing companies row whose `linkedinUrl IS NULL` and the request provided `linkedinCompanyUrl`, UPDATE that row to set the URL. **Never overwrite a non-null `linkedinUrl`** — that protects user-curated data. This is the only side-effect on the matched company row; everything else (priority, stage, notes) stays untouched.

### roleTitle Representation

- **D-10:** **Sentinel string `'Company-wide scrape'`.** Persist `roleTitle = 'Company-wide scrape'` for company-scope leads (not null, not empty). Simpler UI rendering — Phase 9 components can display `lead.roleTitle` directly without null guards.

- **D-11:** **Sentinel lives in `src/lib/domain/types.ts` as a constant.** Add `export const COMPANY_SCOPE_ROLE_TITLE = 'Company-wide scrape' as const;` next to the existing `*Values` enum arrays. Single source of truth. Imported by the Phase 7 create route, and (later) by Phase 9 UI if needed. **Convention only** — no runtime enforcement that other code paths can't write the same string. A docstring on the constant reserves it. Collision risk with a real LinkedIn job title called "Company-wide scrape" is effectively zero.

- **D-12:** **Phase 9 UI discriminator is `linkedinJobUrl === null`, not the sentinel.** The structural fact (no source URL) is the right discriminator; the sentinel is informational/cosmetic. UI branches on URL nullness for "is this company-scope?" decisions. Mentioned here so the Phase 9 planner doesn't need to re-decide.

### Duplicate Detection

- **D-13:** **Idempotent dedup on company-scope creation.** Before insert, query for an existing in-flight company-scope lead: `WHERE companyId = X AND linkedinJobUrl IS NULL AND status IN ('queued', 'searching', 'failed') AND archived_at IS NULL`. If found, return that row with **HTTP 200** via `success(lead)`. If not found, proceed with insert and return **HTTP 201** via `created(lead)`. Standard envelope shape for both. The status code is the signal; no `meta.isExisting` flag pollutes the envelope.

- **D-14:** **In-flight statuses for dedup: `queued`, `searching`, `failed`.** Includes `failed` because the D-08 state machine treats it as recoverable (`failed → queued` retry path). Excludes `found`, `ready`, `actioned` — those represent old completed scrapes that *should not* block a fresh re-scrape (the user may legitimately want a refreshed view of 2nd-degree connections months later). Archived rows are excluded by `archived_at IS NULL`.

- **D-15:** **Dedup is scoped to the company-scope branch only.** The existing job-URL POST path (`linkedinJobUrl` present) is unchanged — it can still create duplicate leads against the same job URL if invoked twice. Phase 7 deliberately does **not** retroactively dedup job-URL leads; that's a separate decision belonging to its own phase if ever warranted. Keeps the Phase 7 diff tight and the existing contract stable.

- **D-16:** **Race acceptable.** Check-then-insert has a TOCTOU window if two requests arrive simultaneously for the same company. Single-user app + single-skill-run-at-a-time pattern means the race is theoretical. If it ever becomes real, a DB-side partial UNIQUE index (`UNIQUE (company_id) WHERE linkedin_job_url IS NULL AND status IN (...) AND archived_at IS NULL`) is a follow-up; not in Phase 7 scope.

### Verification of Existing Routes

- **D-17:** **Pin `PATCH /api/job-leads/[id]/status` and `POST /api/job-leads/[id]/prospects` against company-scope leads.** Both already operate on `id` lookups and don't care about `linkedinJobUrl`/`roleTitle` shape, so they should "just work" — but a regression test for each (using a `linkedinJobUrl: null` fixture lead) locks the invariant explicitly. Counts toward SC #4 ("state machine is input-shape agnostic"). Test files live alongside the existing route tests under `src/app/api/job-leads/[id]/.../*.test.ts`.

### Claude's Discretion

- **CD-01:** **Drizzle Kit migration filename.** Recommended: `0009_allow_company_scope_job_leads`. Planner runs `npm run db:generate -- --name=allow_company_scope_job_leads` and verifies the emitted SQL is the single `ALTER COLUMN ... DROP NOT NULL` statement. If Drizzle Kit emits anything weirder (e.g., recreates the table), hand-edit.

- **CD-02:** **Where the in-flight `(companyId, scope, status)` dedup query sits.** Recommended: inline in the route handler as a focused SELECT before the INSERT. Don't extract to `src/lib/db/job-leads.ts` until a second caller materializes. Keeps Phase 7's code change local.

- **CD-03:** **Whether to also write a brief migration runbook comment.** Recommended: a one-line header comment in the generated migration file explaining what changed (`-- Allow company-scope job leads: drop NOT NULL on linkedin_job_url so synthetic leads created from a company name/URL can exist`). Inline, no separate doc. Planner skips if Drizzle Kit's generated SQL is self-explanatory.

- **CD-04:** **Test fixture location.** Recommended: extend `src/test-utils/pglite.ts` (if needed) with a `createCompanyScopeLead({ companyId })` helper used by D-06 / D-17's tests. Or inline the fixture in each test file. Planner picks based on whether more than one test uses the same fixture (DRY threshold).

- **CD-05:** **Whether to fold the `companies` lookup-or-create logic into a small helper.** Recommended: a private `findOrCreateCompany({ name, linkedinUrl })` function in the same route file (or `src/lib/db/companies.ts` if there's already one). The function encapsulates D-07 + D-08 + D-09 in one place. Planner decides based on whether putting it in `src/lib/db/` materially helps testability.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v1.1 milestone trail
- `.planning/PROJECT.md` §"Current Milestone: v1.1 LinkedIn Scraping by Company" — locked target features for the milestone (synthetic lead model, no new entity, role filter = none)
- `.planning/REQUIREMENTS.md` §"v1.1 Active — LinkedIn Scraping by Company" — JL-C1..JL-C9 with verification criteria; JL-C3 and JL-C4 are Phase 7's
- `.planning/ROADMAP.md` §"Phase 7: Schema + API for Company-Scope Leads" — goal + 4 success criteria
- `.planning/STATE.md` §"Accumulated Context → Decisions" — locked v1.1 data-model decisions (synthetic row, no new entity, drain shares queue, phase order)

### Phase 5 lineage (the in-flight state machine and routes this phase extends)
- `.planning/phases/05-job-leads-completion/05-CONTEXT.md` §"D-06..D-09" — `jobLeadStatusEnum`, `last_error` columns, state machine, error categories
- `.planning/phases/05-job-leads-completion/05-CONTEXT.md` §"D-20" — API routes the skill calls (`GET ?status=queued`, `PATCH /status`, `POST /prospects`)
- `.planning/phases/05-job-leads-completion/05-04-PLAN.md` — Plan that introduced the state machine module and the prospects route (planner reads to understand the existing route invariants)

### Phase 6 lineage (the bulk-write pattern and indexes Phase 7 leverages)
- `.planning/phases/06-performance/06-CONTEXT.md` §"D-02..D-03" — `db.batch()` atomicity pattern (no interactive transactions on neon-http); used here for the same reasons if any multi-statement write becomes necessary
- `drizzle/migrations/0008_*.sql` — Phase 6 indexes including `companies_name_idx` (this phase's company-matcher lookup hits this index)

### Project anchors
- `CLAUDE.md` — TS strict, named exports, REST API (no server actions), Zod on routes, `{ success, data, error, meta }` envelope, soft-delete via `archived_at`
- `.planning/codebase/CONVENTIONS.md` — kebab-case files, camelCase functions, named exports, `import type` for type-only imports, `satisfies` for response shapes
- `.planning/codebase/ARCHITECTURE.md` §"Anti-Patterns" — the patterns to avoid (raw SQL fragments, fire-and-forget IIFEs); Phase 7 stays on the well-trodden path
- `.planning/codebase/STACK.md` — Drizzle 0.45.1, Neon serverless HTTP driver, Zod 4, Next.js 16 App Router

### Source files (under modification — read before planning)
- `drizzle/schema/job-leads.ts:19` — `linkedin_job_url` currently `.notNull()`; drop for Phase 7 (D-05)
- `drizzle/schema/companies.ts:25` — `linkedin_url` already nullable; used for D-09 backfill
- `src/app/api/job-leads/route.ts` — current `POST` handler (lines 66-134); extend Zod schema to a discriminated union + add the company-scope branch (D-01..D-04, D-07..D-09, D-13..D-15)
- `src/app/api/job-leads/[id]/status/route.ts` — existing PATCH; verify it works against `linkedinJobUrl IS NULL` leads (D-17, no code change)
- `src/app/api/job-leads/[id]/prospects/route.ts` — existing POST; verify it works against `linkedinJobUrl IS NULL` leads (D-17, no code change)
- `src/lib/domain/types.ts` — add `COMPANY_SCOPE_ROLE_TITLE` constant (D-11)
- `src/lib/domain/job-lead-pipeline.ts` — current state machine; no change for Phase 7 (D-03 + D-17 confirm INSERTs at `queued` are valid)

### Reusable helpers
- `src/lib/api/types.ts` — `success(lead)` (200) vs `created(lead)` (201) — used for D-13's response signaling
- `src/lib/api/errors.ts` — `validationError`, `serverError`, `notFound` — used as-is
- `src/lib/db/timeline.ts` — `logTimeline()` — used for D-04's `job_lead_created` event with `metadata.scope: 'company'`
- `src/test-utils/pglite.ts`, `src/test-utils/call-route.ts` — Phase 2 harness; used for D-06 + D-17 + the create-path + dedup-path tests

### External references (no new docs needed)
- No external specs or ADRs to research. All decisions follow Phase 5 / Phase 6 patterns already in the repo. Drizzle docs are sufficient for the `ALTER COLUMN DROP NOT NULL` mechanic.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`POST /api/job-leads` handler** (`src/app/api/job-leads/route.ts:66-134`) — extended in place; the existing companies-lookup-by-lowercase-name pattern (lines 87-94) is the basis for D-07. The `scrapeJobPage` call (line 82) is conditionally skipped in the company-scope branch.
- **`canJobLeadTransition`** (`src/lib/domain/job-lead-pipeline.ts`) — unchanged. State machine gates PATCH only; INSERTs at `status = 'queued'` (D-03) are allowed because no transition is occurring.
- **`logTimeline({ eventType: 'job_lead_created', ... })`** (`src/lib/db/timeline.ts`) — already exists; D-04 adds a `metadata.scope: 'company'` key. Timeline UI is metadata-agnostic, so no UI change cascades from this.
- **`companies_name_idx`** (migration 0008, Phase 6) — partial index on `companies(name)` for ilike prefilter. D-07's case-insensitive lookup hits it.
- **`success()` / `created()`** (`src/lib/api/types.ts`) — 200 vs 201 with the standard envelope; D-13's idempotent-dedup response uses both.
- **Phase 2 PGlite + `callRoute` harness** — D-06, D-17, and the new create-path/dedup-path tests run on it. No new test infrastructure needed.

### Established Patterns
- **REST API for all mutations, no server actions** (CLAUDE.md) — Phase 7 follows. The company-scope create path is a POST; same envelope; no client direct DB access.
- **Zod validation on every API route** (CLAUDE.md) — D-01's discriminated union is the standard pattern for shape variants.
- **Drizzle query builder only** (no raw SQL except pgvector) — Phase 7's queries are all builder-mode; the existing `sql\`lower(...) = lower(...)\`` pattern from `route.ts:91` is the one legitimate sql-template-tag use (mirrored for D-07).
- **Soft delete via `archived_at`** — D-13's dedup check includes `archived_at IS NULL` to match the project-wide convention.
- **Timeline event after every write** — D-04 keeps the invariant.
- **`{ success, data, error, meta }` envelope on every route** — both 200 (existing-lead-returned) and 201 (new-lead-created) responses use it.

### Integration Points
- **Phase 8 (skill) → Phase 7 API**: the skill's input-parsing branch for company URLs / bare names will POST `{ companyName, linkedinCompanyUrl? }` to the endpoint defined here. Phase 8 plan must reference D-01's body shape and D-13's idempotent semantics.
- **Phase 9 (UI) → Phase 7 schema**: the detail page and list-view rendering for company-scope leads keys off `linkedinJobUrl === null` (D-12). The "Company scrape" badge can display the `COMPANY_SCOPE_ROLE_TITLE` constant directly or render its own static label — Phase 9 plan decides.
- **Existing job-URL POST flow → Phase 7**: unchanged. The discriminated Zod union routes job-URL requests to the existing branch verbatim. The migration drops a constraint, doesn't add one — so existing inserts continue to satisfy schema.
- **`PATCH /status` and `POST /prospects` → Phase 7 leads**: no code change in those routes; D-17 adds regression tests that pin the input-shape agnostic invariant.

### What the Planner Does NOT Need to Research
- Whether the state machine needs new transitions (D-03: no — INSERT bypasses transition checks)
- Whether to add a new entity / table for company-scope leads (locked by v1.1 milestone — no)
- Whether `linkedinCompanyUrl` needs its own column on `job_leads` (no — stored on `companies.linkedinUrl`, naturally reused)
- Whether to add new timeline event types (D-04: no, reuse `job_lead_created` with metadata)
- Whether to allow multiple in-flight leads per company (D-13/D-14: no, idempotent dedup)
- Whether the dedup logic also applies to job-URL leads (D-15: no, company-scope only)

### What the Planner DOES Need to Verify / Decide
- **Drizzle Kit's emitted migration SQL for the `DROP NOT NULL` change** (CD-01). Run `npm run db:generate -- --name=allow_company_scope_job_leads` and inspect. Likely a single `ALTER TABLE job_leads ALTER COLUMN linkedin_job_url DROP NOT NULL;`. Hand-edit only if Drizzle Kit emits something weirder (table recreation, etc.).
- **Whether `companies` lookup-or-create should be extracted to a helper** (CD-05). Inline first, refactor later if a second caller appears.
- **Test fixture location** (CD-04) — extend `src/test-utils/pglite.ts` only if the fixture is reused across tests.
- **Whether the route's Zod discriminated union complains on ambiguous bodies** (D-02) — verify Zod 4's `z.union(...)` parse order matches first-success semantics for our body shapes. Add a unit test for the ambiguous case (both `linkedinJobUrl` and `companyName` present) and document the resolution behavior in the route's header comment.

</code_context>

<specifics>
## Specific Ideas

- **Discriminated Zod body schema sketch** (concrete shape for the planner):
  ```ts
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

- **`COMPANY_SCOPE_ROLE_TITLE` constant** in `src/lib/domain/types.ts`:
  ```ts
  /**
   * Reserved roleTitle for company-scope job leads (no source job URL).
   * Convention: only the company-scope branch of POST /api/job-leads writes this.
   * Phase 7 D-10/D-11. Phase 9 UI keys off `linkedinJobUrl === null`, not this sentinel.
   */
  export const COMPANY_SCOPE_ROLE_TITLE = 'Company-wide scrape' as const;
  ```

- **Idempotent dedup query** (the SELECT before INSERT, for D-13):
  ```ts
  // After companyId is resolved (existing match or newly-created stub),
  // check for an in-flight company-scope lead on this company.
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
  ```

- **Company auto-create / backfill** (D-07..D-09 combined):
  ```ts
  // Inside the company-scope branch
  const [match] = await db
    .select()
    .from(companies)
    .where(sql`lower(${companies.name}) = lower(${validated.companyName})`)
    .limit(1);

  let companyId: string;
  if (match) {
    companyId = match.id;
    // D-09: backfill linkedinUrl if missing
    if (match.linkedinUrl == null && validated.linkedinCompanyUrl) {
      await db
        .update(companies)
        .set({ linkedinUrl: validated.linkedinCompanyUrl, updatedAt: new Date() })
        .where(eq(companies.id, match.id));
    }
  } else {
    // D-08: create stub
    const [created] = await db
      .insert(companies)
      .values({
        name: validated.companyName,
        linkedinUrl: validated.linkedinCompanyUrl ?? null
        // priority, stage, status, remotePolicy default via schema
      })
      .returning();
    companyId = created.id;
  }
  ```

- **Lead insert** for the company-scope branch:
  ```ts
  const [lead] = await db
    .insert(jobLeads)
    .values({
      linkedinJobUrl: null,  // D-05 (schema now allows)
      roleTitle: COMPANY_SCOPE_ROLE_TITLE,  // D-10/D-11
      companyName: validated.companyName,
      companyId,  // D-08
      status: 'queued'  // D-03
    })
    .returning();

  await logTimeline({
    eventType: 'job_lead_created',  // D-04
    title: `Company scrape: ${validated.companyName}`,
    companyId,
    metadata: { jobLeadId: lead.id, scope: 'company' }  // D-04 metadata flag
  });

  return created(lead);  // 201, D-13
  ```

- **Tests to ship in this phase** (concrete file targets):
  - `src/app/api/job-leads/route.test.ts` — extend with: (a) company-scope create path (new row, returns 201), (b) company-scope dedup path (in-flight match returns 200, no duplicate row), (c) backfill of `companies.linkedinUrl` on existing-match-with-null path, (d) auto-create of stub company on no-match path, (e) discriminated Zod rejection for empty body / both fields present
  - `src/lib/db/__phase7_schema__.test.ts` (new) — D-06 regression: insert a job_leads row with `linkedinJobUrl: null` via Drizzle, read it back, assert success
  - `src/app/api/job-leads/[id]/status/route.test.ts` — extend with one case using a `linkedinJobUrl: null` fixture lead, run a full state-machine traversal (queued → searching → found)
  - `src/app/api/job-leads/[id]/prospects/route.test.ts` — extend with one case using a `linkedinJobUrl: null` fixture lead, verify the bulk-prospects + status flip works

</specifics>

<deferred>
## Deferred Ideas

- **DB-side partial UNIQUE index** to enforce dedup at the schema level (e.g., `UNIQUE (company_id) WHERE linkedin_job_url IS NULL AND status IN ('queued', 'searching', 'failed') AND archived_at IS NULL`) — out of scope (D-16). Single-user race window is theoretical. Revisit only if a concurrency bug surfaces.

- **Extending idempotent dedup to job-URL leads** — explicitly out of scope (D-15). The existing job-URL POST contract is unchanged. A separate phase can decide if/when that behavior should change.

- **Adding a dedicated `job_lead_company_created` timeline event type** — declined in D-04 (reuse `job_lead_created` with metadata). A future "timeline UI overhaul" phase could split event types if it becomes useful.

- **Sentinel runtime enforcement** (a guard in `scrapeJobPage` against accidentally returning `'Company-wide scrape'` as a real role title) — declined in D-11. Convention-only docstring is sufficient. Revisit only if a collision is observed.

- **Backfilling old leads** — no historical leads have `linkedinJobUrl = NULL`, so no backfill is needed. The migration is purely a constraint relaxation.

- **Dedicated `findOrCreateCompany` library helper in `src/lib/db/`** — CD-05 leaves it as inline-first. Refactor only when a second caller appears.

- **A skill / CLI command to bulk-import company-scope leads from a list** — not in v1.1 scope. The skill processes one company per invocation (or drains the existing queue). Bulk-import would be a future tool.

### Reviewed Todos (not folded)
None — `gsd-sdk query todo.match-phase 7` not run; the workflow doesn't surface any pending todos in `.planning/STATE.md` for Phase 7. No deferred-todo bookkeeping needed.

</deferred>

---

*Phase: 07-Schema + API for Company-Scope Leads*
*Context gathered: 2026-05-19*
