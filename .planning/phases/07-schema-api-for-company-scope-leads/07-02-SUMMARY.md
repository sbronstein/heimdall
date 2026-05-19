---
phase: 07-schema-api-for-company-scope-leads
plan: 02
subsystem: api-route
tags: [next-js, drizzle, zod, neon, postgres, vitest, api-route, job-leads]
requirements_addressed: [JL-C3]

requires:
  - 'Phase 7 Plan 01: drizzle/schema/job-leads.ts linkedin_job_url NULLABLE'
  - 'Phase 7 Plan 01: COMPANY_SCOPE_ROLE_TITLE constant exported from src/lib/domain/types.ts'
  - 'Migration 0009_allow_company_scope_job_leads applied to live DB'
provides:
  - 'POST /api/job-leads accepts { companyName, linkedinCompanyUrl? } body shape'
  - 'Discriminated z.union schema with first-match-wins resolution on ambiguous bodies'
  - 'Idempotent dedup against in-flight company-scope leads (200 on existing, 201 on new)'
  - 'Auto-create + linkedinUrl backfill for companies row resolution'
  - 'job_lead_created timeline event with metadata.scope=company tag'
  - '7 POST contract tests pinning the company-scope behavior'
affects:
  - Phase 8 (skill input-parsing) — POSTs to this endpoint with company-scope body
  - Phase 9 (UI) — renders rows where linkedinJobUrl === null (per D-12)
  - GET /api/job-leads?status=queued queue — company-scope leads now appear here

tech-stack:
  added: []
  patterns:
    - 'discriminated Zod union (z.union) with implicit field-presence narrowing via in-operator'
    - 'idempotent POST with HTTP status code as signal (200 existing vs 201 new)'
    - 'case-insensitive name lookup via sql`lower(...) = lower(...)` reusing companies_name_idx'
    - 'vi.spyOn for module-level function mocking in route tests (restored via afterEach)'

key-files:
  created:
    - .planning/phases/07-schema-api-for-company-scope-leads/07-02-SUMMARY.md
  modified:
    - src/app/api/job-leads/route.ts
    - src/app/api/job-leads/route.test.ts

decisions:
  - 'Used drizzle and(...) helper for the fixed-shape dedup WHERE (matches Anti-Pattern guidance in ARCHITECTURE.md vs. the GET handler''s sql.join used for dynamic-length conditions).'
  - 'Inline-first per CD-02/CD-05: company-scope branch lives inline in the route handler, not extracted to src/lib/db/companies.ts (no second caller yet).'
  - 'Used vi.spyOn(scrapeJobPageModule, ''scrapeJobPage'') for Test C7 ambiguous-body case, mirroring the pattern at src/app/api/job-leads/[id]/prospects/route.test.ts:341. afterEach calls vi.restoreAllMocks() so the mock never leaks.'
  - 'Test C7 mock asserts the scraper''s ScrapedJobData shape (4 fields: companyName, roleTitle, location, companyLinkedinUrl) per the type at src/features/job-leads/lib/scrape-job-page.ts:3-8.'

metrics:
  duration_minutes: ~8
  tasks_completed: 2
  files_modified: 2
  files_created: 1
  tests_added: 7
  tests_passing: 10
  date_completed: 2026-05-19
---

# Phase 7 Plan 02: API route extension for company-scope job leads — Summary

POST /api/job-leads now accepts a second body shape `{ companyName, linkedinCompanyUrl? }` via a discriminated Zod union, resolves the company (case-insensitive name match → auto-create stub on miss → linkedinUrl backfill on match-with-null without overwrite), idempotently dedups against in-flight leads, inserts the new lead with `linkedinJobUrl: null`, `roleTitle: 'Company-wide scrape'`, `status: 'queued'`, and emits a `job_lead_created` timeline event tagged with `metadata.scope: 'company'`.

## What was built

### Task 1 — POST handler extension (`src/app/api/job-leads/route.ts`)

Replaced the single-shape Zod schema with a discriminated `z.union([...])` where the job-URL shape sits first (first-match-wins per D-02). Added a header comment block documenting the union order and ambiguous-body resolution. Wrapped the existing job-URL POST logic (lines 66-127 of the prior implementation) verbatim inside an `if ('linkedinJobUrl' in validated)` narrow. Added the company-scope branch as the else path:

1. **Company resolution (D-07/D-08/D-09)** — case-insensitive name lookup against `companies` (hits the Phase 6 `companies_name_idx`). On match: capture id, backfill `linkedinUrl` *only* if existing value is null AND request supplied one (never overwrites). On miss: insert minimum stub `{ name, linkedinUrl: linkedinCompanyUrl ?? null }` and let schema defaults supply `priority/stage/status/remotePolicy`.

2. **Idempotent dedup (D-13/D-14)** — SELECT for an in-flight company-scope lead using `and(eq(jobLeads.companyId, companyId), isNull(jobLeads.linkedinJobUrl), inArray(jobLeads.status, ['queued', 'searching', 'failed']), isNull(jobLeads.archivedAt))`. If found, return `success(existing)` (HTTP 200). If not, proceed.

3. **Lead insert (D-03/D-10/D-11)** — INSERT with `{ linkedinJobUrl: null, roleTitle: COMPANY_SCOPE_ROLE_TITLE, companyName, companyId, status: 'queued' }`. The `'queued'` status bypasses the state machine because INSERT is unrestricted (gates apply to PATCH only).

4. **Timeline event (D-04)** — `await logTimeline({ eventType: 'job_lead_created', title: \`Company scrape: ${companyName}\`, companyId, metadata: { jobLeadId, scope: 'company' } })`. Reuses the existing event type; the metadata flag distinguishes the scrape origin.

5. **Response** — `created(lead)` (HTTP 201).

Imports updated: added `and` to drizzle-orm, `success` to `@/lib/api/types`, `COMPANY_SCOPE_ROLE_TITLE` from `@/lib/domain/types`. Outer try/catch preserved verbatim (still maps `ZodError → validationError(...)`, everything else → `serverError(...)`).

### Task 2 — POST test suite (`src/app/api/job-leads/route.test.ts`)

Added a new `describe('POST /api/job-leads (company-scope, D-01..D-15)', ...)` block with 7 scenarios; existing 3 GET tests preserved verbatim. Reused the existing `vi.hoisted + Proxy` mock for the DB. Added `afterEach(() => vi.restoreAllMocks())` so Test C7's `vi.spyOn(scrapeJobPageModule, 'scrapeJobPage')` cannot leak into other tests.

- **C1**: empty DB → 201 + correct lead shape + companies row + timeline event with `metadata.scope='company'`
- **C2**: pre-seeded in-flight lead → second POST returns 200 with same `data.id`, exactly 1 `job_leads` row, 0 timeline events
- **C3**: pre-seeded company with `linkedinUrl: null` → after POST with `linkedinCompanyUrl`, matched row's `linkedinUrl` is set; only 1 companies row exists
- **C4**: pre-seeded company with non-null `linkedinUrl` → after POST with a different `linkedinCompanyUrl`, matched row's `linkedinUrl` remains unchanged (user-curated data protected)
- **C5**: no existing company, POST with name only → auto-created stub has `linkedinUrl: null` and all schema-default fields (`stage='unknown'`, `priority='exploring'`, `remotePolicy='unknown'`, `status='active'`)
- **C6**: POST `{}` → 400 envelope; 0 leads, 0 companies, 0 timeline events
- **C7**: POST `{ linkedinJobUrl, companyName }` ambiguous body → resolves to job-URL branch (Test asserts `data.companyName === 'ScrapedCo'` from the mocked scraper, not `'AcmeCo'` from the request body; also asserts no lead with `linkedinJobUrl: null` exists)

All 10 tests pass in ~10s on PGlite.

## Verification

```
$ npx vitest run src/app/api/job-leads/route.test.ts --reporter=verbose
 ✓ Test 12, 13, 14 (GET ?status filter — pre-existing, regression-pinned)
 ✓ Test C1: company-scope create → 201 + lead + companies + timeline
 ✓ Test C2: dedup → 200 + same id + 1 lead + 0 new timeline events
 ✓ Test C3: backfill linkedinUrl on match-with-null
 ✓ Test C4: no-overwrite on existing linkedinUrl
 ✓ Test C5: auto-create stub with schema defaults
 ✓ Test C6: Zod reject empty body → 400, 0 rows
 ✓ Test C7: ambiguous body → job-URL branch wins (D-02)

 Test Files  1 passed (1)
      Tests  10 passed (10)
   Duration  9.82s
```

`npx tsc --noEmit` is clean apart from the pre-existing 4 errors in `src/features/job-leads/lib/prioritization.ts` documented in `deferred-items.md` (`TS2802` + 3× `TS7006`). These existed at main HEAD `6ee48f0` prior to Phase 7 and are out of scope for this plan.

All Task-1 acceptance greps return their expected counts: `z.union(\[` = 1, `'linkedinJobUrl' in validated` = 1, `COMPANY_SCOPE_ROLE_TITLE` = 2 (import + usage), `scope: 'company'` = 1, `and(` = 1, `isNull(jobLeads.archivedAt)` = 2 (GET dedup + company-scope dedup), `return success(existing)` = 1, `scrapeJobPage(validated.linkedinJobUrl)` = 1, `first-match-wins` = 1 (header comment).

## Deviations from Plan

None. Plan executed exactly as written. The implementation matches the code sketches in `07-PATTERNS.md §"src/app/api/job-leads/route.ts"` and `07-CONTEXT.md §specifics` line-for-line.

Test C7's `vi.spyOn` mock asserts the full `ScrapedJobData` shape (4 fields including the `companyLinkedinUrl` field that the plan's example omitted) — this was a faithful match of the type at `src/features/job-leads/lib/scrape-job-page.ts:3-8`, not a deviation. The plan said "synthetic `{ companyName, roleTitle, ... }`" and the four-field object satisfies the type contract.

## Known Stubs

None. The company-scope branch writes real values to all required columns: `linkedinJobUrl: null` (intentional sentinel), `roleTitle: COMPANY_SCOPE_ROLE_TITLE` (deliberate sentinel string per D-10/D-11), `status: 'queued'` (deliberate, drains via existing skill queue). The stub companies row created on no-match (D-08) is also intentional and matches JL-C3 SC #3 verbatim ("created on the fly if absent").

## Commits

- `68a3a7b` — `feat(07-02): extend POST /api/job-leads with company-scope branch`
- `ac9ecb5` — `test(07-02): add 7 POST tests for company-scope create + dedup contract`

## Hand-off to Phase 8 / Plan 03

- Plan 03 (the only remaining plan in Phase 7 — `[id]/status` + `[id]/prospects` regression coverage for null-URL leads) is unblocked. The route this plan touches is independent of Plan 03's two route files; no merge conflict expected.
- Phase 8 (skill) can now POST `{ companyName, linkedinCompanyUrl? }` directly. Re-POST during drain retries is safe (idempotent dedup returns 200 with the same row).
- Phase 9 (UI) gets the structural guarantee that `linkedinJobUrl === null` ⟺ company-scope lead (D-12). The `roleTitle` is always populated (`'Company-wide scrape'`) so no null-guard is needed in the title render path.

## Self-Check: PASSED

- `src/app/api/job-leads/route.ts` — FOUND (modified, hash `68a3a7b`)
- `src/app/api/job-leads/route.test.ts` — FOUND (modified, hash `ac9ecb5`)
- `.planning/phases/07-schema-api-for-company-scope-leads/07-02-SUMMARY.md` — FOUND (this file)
- Commit `68a3a7b` — FOUND (`git log --oneline` confirms)
- Commit `ac9ecb5` — FOUND (`git log --oneline` confirms)
- `npx vitest run src/app/api/job-leads/route.test.ts` exits 0 with 10/10 tests passing — CONFIRMED
