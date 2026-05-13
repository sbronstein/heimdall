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
- [ ] **Phase 4: Starter-Template Cleanup** - Delete unused routes, components, and dead imports
- [ ] **Phase 5: Job Leads Completion** - Finish the LinkedIn scraper (bug fixes, timeouts, error surfacing)
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
- [ ] 04-04-PLAN.md — DEBT-A5: drop unused computeBridgeScore import in job-leads search route

**Wave 2** *(blocked on Wave 1 completion — must be last)*
- [ ] 04-05-PLAN.md — DEBT-A4: rm -rf __CLEANUP__/ + add filesystem-existence verification test
**UI hint**: yes

### Phase 5: Job Leads Completion
**Goal**: The Job Leads scraper runs cleanly end-to-end and surfaces failures to the user instead of stalling silently
**Depends on**: Phase 4
**Requirements**: JL-A1, JL-A2, JL-A3, JL-A4, JL-A5
**Success Criteria** (what must be TRUE):
  1. Pasting a LinkedIn job URL for any company produces a populated prospect list — no hardcoded `'point'` string remains in `scrape-connections.ts`
  2. A scrape that hangs or fails reverts the lead from `searching` back to `scraped` within a bounded timeout and the failure is visible in the UI
  3. Running a scrape no longer produces the 20+ debug `console.log` dumps or leaves a browser instance open after completion
  4. Heavy LinkedIn pages load reliably (uses `waitUntil: 'domcontentloaded'` + targeted `waitForSelector`, not fixed `waitForTimeout`)

### Phase 6: Performance
**Goal**: The 1500-contact dataset operations (import, scrape match, triage categorize) run without N+1 round-trips, and hot-path columns are indexed
**Depends on**: Phase 5
**Requirements**: PERF-A1, PERF-A2, PERF-A3, PERF-A4, PERF-A5
**Success Criteria** (what must be TRUE):
  1. `/api/job-leads/[id]/search` inserts all scraped prospects in a single bulk insert, and `match-connections.ts` inserts all prospect bridges in a single bulk insert (no per-row `await db.insert()` loops remain in those paths)
  2. `/api/contacts/import/categorize` updates closeness for all selected contacts in a single batched statement (or transaction) instead of one UPDATE per contact
  3. Drizzle `index()` definitions exist on `contacts(archived_at)`, `contacts(linkedin_url)`, `contacts(company_id)`, `contacts(linkedin_connection_date)`, and `companies(name)`, applied via a migration
  4. `/api/contacts/import` and `match-connections.ts` no longer load the entire `contacts` table into memory for dedup — dedup is pushed to the database (`ON CONFLICT DO NOTHING` or equivalent)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Critical Bug Fix | 1/1 | Complete | 2026-05-12 |
| 2. Test Infrastructure | 5/5 | Complete    | 2026-05-12 |
| 3. Security Hardening | 2/2 | Complete   | 2026-05-13 |
| 4. Starter-Template Cleanup | 3/5 | In Progress|  |
| 5. Job Leads Completion | 0/TBD | Not started | - |
| 6. Performance | 0/TBD | Not started | - |
