# Roadmap: Heimdall

## Overview

Heimdall is brownfield — the executive job-search CRM is already shipped and in daily use. This roadmap covers the 22 v1 Active requirements that close out the current improvement cycle: an urgent navigation-breaking hydration bug, a test harness to land subsequent work safely, an authentication hardening pass on the open `/api/*` surface, deletion of starter-template residue, completion of the in-flight Job Leads scraper, and the performance work (N+1 elimination + indexes) that the 1500-contact dataset is already straining against. Each phase is a coherent improvement layer rather than a new end-to-end user feature, reflecting the horizontal-layers character of the work.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Critical Bug Fix** - Eliminate the sidebar hydration crash that breaks navigation after LinkedIn imports
- [x] **Phase 2: Test Infrastructure** - Stand up Vitest + cover load-bearing logic and regression-pin BUG-01 (completed 2026-05-12)
- [x] **Phase 3: Security Hardening** - Authenticate every `/api/*` route and strip starter-template auth artifacts (completed 2026-05-13)
- [x] **Phase 4: Starter-Template Cleanup** - Delete unused routes, components, and dead imports (completed 2026-05-13)
- [x] **Phase 5: Job Leads Completion** - LinkedIn scraping moved out of app into a Claude Code skill driving vercel-labs/agent-browser; queue + categorized failures surface in the DB (completed 2026-05-14, reshaped 2026-05-13)
- [ ] **Phase 6: Performance** - Eliminate N+1 patterns and add hot-path indexes

## Phase Details

### Phase 1: Critical Bug Fix
**Goal**: Restore reliable dashboard navigation after large LinkedIn imports
**Depends on**: Nothing (first phase)
**Requirements**: BUG-01, BUG-02
**Success Criteria** (what must be TRUE):
  1. After importing 1500+ LinkedIn contacts, every sidebar nav link on every dashboard page remains clickable and routes correctly
  2. Loading any `/dashboard/*` page produces no React hydration warnings or errors in the browser console
  3. `UserAvatarProfile` renders correctly inside `SidebarMenuButton` for both signed-in users and edge-case users with no email addresses (no runtime crash on `emailAddresses[0]` access)
**Plans**: 1 plan
Plans:
- [x] 01-01-PLAN.md — Audit pre-existing BUG-01 working-tree edits, apply BUG-02 optional-chain guards, dev-server smoke verify, surgical commits per requirement
**UI hint**: yes

### Phase 2: Test Infrastructure
**Goal**: A working test harness exists and pins the load-bearing logic + the BUG-01 regression
**Depends on**: Phase 1
**Requirements**: TEST-A1, TEST-A2, TEST-A3
**Success Criteria** (what must be TRUE):
  1. `npm test` runs a Vitest suite against the TypeScript codebase and exits 0 on a clean checkout
  2. Tests assert the `{ success, data, error, meta }` API envelope shape, valid/invalid `canTransition()` pipeline moves, `logTimeline()` side-effect on writes, LinkedIn CSV parsing, and bridge-score computation
  3. A regression test fails if the `app-sidebar.tsx` hydration mismatch from BUG-01 is reintroduced
**Plans**: 5 plans
Plans:
**Wave 1**
- [x] 02-01-PLAN.md — Vitest + PGlite harness foundation (config, scripts, createTestDb, callRoute)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 02-02-PLAN.md — Pure-logic coverage (pipeline, envelope, filters, seniority, bridge-score)
- [x] 02-03-PLAN.md — DB-backed API route coverage (status transition + CSV import with timeline side-effect via PGlite)
- [x] 02-04-PLAN.md — BUG-01 regression tests (SSR structural + jsdom hydration mount)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 02-05-PLAN.md — Husky pre-push integration (gated on <10s suite runtime per CD-01)

### Phase 3: Security Hardening
**Goal**: No `/api/*` route is reachable without a valid Clerk session, and starter-template auth artifacts are removed
**Depends on**: Phase 2
**Requirements**: SEC-A1, SEC-A2
**Success Criteria** (what must be TRUE):
  1. Every `/api/*` route returns 401 when called without a valid Clerk session (verified by automated test against all 34 routes)
  2. The "Continue with GitHub" no-op button no longer appears on the sign-in or sign-up pages
  3. Sign-in and sign-up pages no longer issue an outbound fetch to `api.github.com/repos/...` on render
**Plans**: 2 plans
Plans:
**Wave 1** *(both plans parallel — disjoint file sets)*
- [x] 03-01-PLAN.md — Activate `src/middleware.ts` (rename from `src/proxy.ts`), expand matcher to `/api/(.*)`, explicit 401 envelope short-circuit, two-layer verification test (SEC-A1)
- [x] 03-02-PLAN.md — Delete `github-auth-button.tsx`, remove its references, strip `api.github.com` fetch + `stars` prop + dead Link block from auth pages/views (SEC-A2)

### Phase 4: Starter-Template Cleanup
**Goal**: Dead starter-template code is gone — the repo contains only Heimdall code
**Depends on**: Phase 3
**Requirements**: DEBT-A1, DEBT-A2, DEBT-A3, DEBT-A4, DEBT-A5
**Success Criteria** (what must be TRUE):
  1. Visiting `/dashboard/product`, `/dashboard/exclusive`, `/dashboard/workspaces`, or `/dashboard/billing` returns 404
  2. `src/features/products/`, the 805-line `src/components/ui/infobar.tsx`, and the `__CLEANUP__/` directory no longer exist in the repo
  3. The `/dashboard/kanban` route is either backed by `/api/tasks` or removed (decision recorded in PROJECT.md)
  4. `npm run build` succeeds with no unused-import warnings for `computeBridgeScore` in the job-leads search route
**Plans**: 5 plans
Plans:
**Wave 1** *(four plans parallel — disjoint file sets)*
- [x] 04-01-PLAN.md — DEBT-A1: delete products feature + dead support (mock-api.ts, data.ts product types, breadcrumb entry)
- [x] 04-02-PLAN.md — DEBT-A2: delete starter routes (exclusive, workspaces, billing) + Infobar machinery transitive teardown
- [x] 04-03-PLAN.md — DEBT-A3: delete /dashboard/kanban route + features/kanban folder + record decision in PROJECT.md
- [x] 04-04-PLAN.md — DEBT-A5: drop unused computeBridgeScore import in job-leads search route

**Wave 2** *(blocked on Wave 1 completion — must be last)*
- [x] 04-05-PLAN.md — DEBT-A4: rm -rf __CLEANUP__/ + add filesystem-existence verification test
**UI hint**: yes

### Phase 5: Job Leads Completion — *RESHAPED 2026-05-13*
**Goal**: LinkedIn connection scraping is reliable. Scraping moves **out of the app** into a Claude Code skill driving `vercel-labs/agent-browser`; the app holds the queue and the results, scraping runs out-of-band, failures surface back into the UI via the DB.
**Depends on**: Phase 4
**Requirements**: JL-B1, JL-B2, JL-B3, JL-B4, JL-B5 (defined in `.planning/REQUIREMENTS.md` §Job Leads Completion; JL-A1..A5 superseded 2026-05-13 — see `.planning/phases/05-job-leads-completion/05-03-PLAN.md`)
**Success Criteria** (what must be TRUE):
  1. A Claude Code skill exists (under `.claude/skills/` or per-project skill location) that accepts a job URL argument **or**, when invoked with no argument, drains unprocessed job leads from the Heimdall DB
  2. The skill drives `vercel-labs/agent-browser` to navigate job → company → employees → 2nd-degree filter and extract prospects in the same `ScrapedProspect` shape the existing UI consumes
  3. The skill writes results back to the DB through existing REST routes; the in-app fire-and-forget Playwright IIFE in `src/app/api/job-leads/[id]/search/route.ts` and `src/features/job-leads/lib/scrape-connections.ts` are **deleted** (the hardcoded `'point'`, the `waitForTimeout` antipatterns, and the 20+ debug `console.log` dumps go with them)
  4. Job-lead status in the DB cleanly represents the scraping queue — at minimum: needs-scrape, in-progress (by the skill), scraped, failed-with-category — so the skill knows what to drain and the UI knows what to show
  5. The job-lead detail UI surfaces a clear "Run scrape from Claude Code" affordance for unprocessed leads and a categorized failure surface when the skill last attempted and failed, with a retry that re-queues the lead

**Plans**: 7 plans
Plans:
**Wave 1** *(three plans parallel — disjoint file sets)*
- [x] 05-01-PLAN.md — Schema additions (queued/failed enum values, last_error columns), ScrapedProspect type relocation, Drizzle migration
- [x] 05-02-PLAN.md — Middleware bearer-token bypass + token-generation script + env example placeholders
- [x] 05-03-PLAN.md — REQUIREMENTS.md supersession of JL-A1..A5, definition of JL-B1..JL-B5, HTML companion regen

**Wave 2** *(blocked on Wave 1)*
- [x] 05-04-PLAN.md — API routes: state-machine module, PATCH /status, POST /prospects (bulk), POST /search (thin flip), GET /job-leads status filter + tests

**Wave 3** *(blocked on Waves 1 + 2)*
- [x] 05-05-PLAN.md — Job-lead detail UI rewrite: queued badge, copy-skill-invocation button, categorized failure banner, retry; list-view status rendering
- [x] 05-06-PLAN.md — Skill assets at .claude/skills/scrape-linkedin-connections/ (SKILL.md + three references docs)

**Wave 4** *(blocked on Waves 1, 2, 3 — must be last)*
- [x] 05-07-PLAN.md — Delete scrape-connections.ts + search-progress.tsx; lock the deletions in src/__cleanup__.test.ts

**Note**: This phase's old `05-CONTEXT.md` (363 lines of context for the in-app-scraper-fix direction) is preserved at `.planning/phases/05-job-leads-completion/05-CONTEXT-superseded-in-app-scraper.md` and reflects the prior plan. A fresh `05-CONTEXT.md` for the new direction will be produced by `/gsd-discuss-phase 5`.

### Phase 6: Performance
**Goal**: The 1500-contact dataset operations (import, scrape match, triage categorize) run without N+1 round-trips, and hot-path columns are indexed
**Depends on**: Phase 5
**Requirements**: PERF-A1, PERF-A2, PERF-A3, PERF-A4, PERF-A5
**Success Criteria** (what must be TRUE):
  1. `/api/job-leads/[id]/prospects` (the route Phase 5 introduced for bulk prospect writes) performs a single bulk insert of scraped prospects, and `match-connections.ts` performs a single bulk insert of prospect bridges (`onConflictDoNothing()` on the `prospect_bridge_unique` constraint). The entire `POST /prospects` handler runs inside `db.transaction()` so prospect insert + bridge insert + status flip commit or roll back together.
  2. `/api/contacts/import/categorize` updates closeness for all selected contacts in a single batched statement (or transaction) instead of one UPDATE per contact
  3. Drizzle `index()` definitions exist on `contacts(archived_at)`, `contacts(linkedin_url)`, `contacts(company_id)`, `contacts(linkedin_connection_date)`, and `companies(name)`, applied via a migration
  4. `/api/contacts/import` and `match-connections.ts` no longer load the entire `contacts` table into memory for dedup — dedup is pushed to the database (`ON CONFLICT DO NOTHING` or equivalent)
**Plans**: 5 plans
Plans:
**Wave 1**
- [x] 06-01-PLAN.md — Schema additions (5 index() + 1 partial UNIQUE index on contacts/companies), migration 0008 generation + apply, pg_indexes regression test (D-20)

**Wave 2** *(four plans parallel — disjoint file sets — all blocked on Wave 1)*
- [ ] 06-02-PLAN.md — PERF-A1 (bridges half) + PERF-A2: transactional POST /prospects with inline matchConnections, bulk bridge insert with onConflictDoNothing, narrowed contacts SELECT; ROADMAP SC #1 wording refresh in the same commit
- [ ] 06-03-PLAN.md — PERF-A3: bulk UPDATE ... FROM unnest() in /api/contacts/import/categorize replacing per-row loop
- [ ] 06-04-PLAN.md — PERF-A5 (import half): bulk INSERT + onConflictDoNothing on linkedin_url partial UNIQUE + narrowed name+company dedup in /api/contacts/import
- [ ] 06-05-PLAN.md — Incidental fold #3: GET /api/job-leads/[id]/recommendations becomes a pure read (Variant B per D-15 — compute scores on-the-fly via prioritization.ts:55 fallback)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Critical Bug Fix | 1/1 | Complete | 2026-05-12 |
| 2. Test Infrastructure | 5/5 | Complete    | 2026-05-12 |
| 3. Security Hardening | 2/2 | Complete   | 2026-05-13 |
| 4. Starter-Template Cleanup | 5/5 | Complete | 2026-05-13 |
| 5. Job Leads Completion | 7/7 | Complete   | 2026-05-14 |
| 6. Performance | 0/5 | Plans created | - |
