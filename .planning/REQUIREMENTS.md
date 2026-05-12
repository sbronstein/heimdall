# Requirements: Heimdall

**Defined:** 2026-05-12
**Core Value:** Owner can run the entire executive job search from one place — track companies, log interactions, move applications through pipeline stages, and surface the highest-value introduction paths — without leaving the app.

> Heimdall is brownfield. The **Validated** section captures the shipped surface area inferred from `.planning/codebase/` and `docs/summary.md`. The **v1 Active** section captures the next-up work derived from `bug.md`, the "Needs Debugging" section of `docs/summary.md`, and `.planning/codebase/CONCERNS.md`.

## Validated (already shipped)

### Authentication & Access
- ✓ **AUTH-V1**: Clerk session auth with single-user email lock on `/dashboard/*`

### Companies
- ✓ **COMP-V1**: Companies CRUD (priority, stage, funding, research notes, soft-delete)
- ✓ **COMP-V2**: Company detail pages with contacts/applications/notes tabs
- ✓ **COMP-V3**: Company filters and data table with priority/stage facets

### Contacts & Networking
- ✓ **CONT-V1**: Contacts CRUD with closeness (8-tier), warmth, outreach status, `howMet`, `metDate`, `linkedinConnectionDate`
- ✓ **CONT-V2**: LinkedIn Connections CSV import (dedup, per-row closeness, auto-populate connected-on date)
- ✓ **CONT-V3**: Keyboard-driven contact triage workflow (autocomplete, year buttons, closeness 1-8, undo/skip, progress bar)
- ✓ **NET-V1**: Networking page (closeness tier stats, outreach tracker)
- ✓ **NET-V2**: Connection finder by company (with company-detail-page Network tab)

### Pipeline & Applications
- ✓ **APP-V1**: Applications CRUD with referral attribution (`via [Contact]`)
- ✓ **PIPE-V1**: Drag-and-drop pipeline kanban with validated transitions and optimistic UI
- ✓ **PIPE-V2**: 13-stage pipeline state machine (Researching → Accepted/Rejected/Withdrawn/Ghosted/On Hold)

### Interactions & Activity
- ✓ **INTR-V1**: Interactions logging (email, call, coffee, interview, intro requested) with auto-update of outreach status
- ✓ **TIME-V1**: Timeline events row emitted on every write via `logTimeline()` side-effect
- ✓ **OVR-V1**: Overview dashboard (KPI cards, funnel, activity timeline, source pie chart)

### Tasks & Notes
- ✓ **TASK-V1**: Tasks CRUD with entity linking, priority, checkbox toggle
- ✓ **NOTE-V1**: Notes CRUD with category filters, markdown content, entity linking

### Recruiters & Metrics
- ✓ **REC-V1**: Recruiters CRUD linked to contacts
- ✓ **METR-V1**: Weekly metrics snapshots + trend charts (JSC reporting)

### Search
- ✓ **SRCH-V1**: Cmd+K cross-entity search (companies, contacts, applications, notes)

### Job Leads (partial — see Active)
- ✓ **JL-V1**: Create job lead from URL — cheerio scrape extracts company, role, location
- ✓ **JL-V2**: LinkedIn browser session bootstrap via CDP (Docker → host Chrome)
- ✓ **JL-V3**: Recommendation API scoring + grouping (`0.40·seniority + 0.35·closeness + 0.25·recency`)

### Platform
- ✓ **API-V1**: Standard envelope `{ success, data, error, meta }` across 34 routes; Zod-validated inputs
- ✓ **API-V2**: Cursor pagination on `updated_at`
- ✓ **CLI-V1**: All mutations via REST API — full CLI ⇄ Web UI parity
- ✓ **DB-V1**: Soft-delete via `archived_at` on every entity

## v1 Active (next-up work)

These are the requirements GSD will track to completion. The roadmap will group them into phases.

### Bug Fix (P0 — blocks daily use after large imports)
- [x] **BUG-01**: Eliminate React hydration crash in `app-sidebar.tsx` so sidebar navigation stays alive after LinkedIn import
  - Remove `{user && ...}` guard around `UserAvatarProfile` (lines 148, 166)
  - Verify `<span>` migration in `user-avatar-profile.tsx` is complete
  - Add a smoke check that catches the regression
- [x] **BUG-02**: Guard `emailAddresses[0]` access — change `user?.emailAddresses[0].emailAddress` to `user?.emailAddresses[0]?.emailAddress ?? ''` in `user-avatar-profile.tsx:31` and `user-nav.tsx:38`

### Job Leads Completion
- [ ] **JL-A1**: Replace hardcoded `'point'` company name in `scrape-connections.ts:62` with the lead's actual `companyName`
- [ ] **JL-A2**: Tune Playwright navigation for heavy LinkedIn pages — `waitUntil: 'domcontentloaded'` + targeted `waitForSelector` instead of fixed `waitForTimeout` calls
- [ ] **JL-A3**: Remove debug-mode noise — strip the 20+ `console.log` dumps and the "leave browser open" pattern in `scrape-connections.ts`
- [ ] **JL-A4**: Bound the fire-and-forget search IIFE with a `Promise.race()` timeout that reverts a stuck lead from `searching` back to `scraped` and surfaces the failure to the UI
- [ ] **JL-A5**: Surface scrape errors to the user — currently the async path swallows errors and the lead silently stalls

### Security Hardening
- [ ] **SEC-A1**: Add Clerk `auth()` check (or a `middleware.ts` matcher) to every `/api/*` route — currently 0/34 routes authenticate
- [ ] **SEC-A2**: Remove the no-op "Continue with GitHub" auth button (`github-auth-button.tsx`) and the residual external `api.github.com` star fetch on the sign-in/sign-up pages

### Starter-Template Cleanup
- [ ] **DEBT-A1**: Delete `src/features/products/` and `src/app/dashboard/product/` routes
- [ ] **DEBT-A2**: Delete `src/app/dashboard/{exclusive,workspaces,billing}/` routes and the 805-line `src/components/ui/infobar.tsx`
- [ ] **DEBT-A3**: Decide on Kanban route — either back it with the `tasks` table via `/api/tasks` or remove the route entirely
- [ ] **DEBT-A4**: Remove the `__CLEANUP__/` directory once the optional features above are stripped
- [ ] **DEBT-A5**: Drop the unused `computeBridgeScore` import in `src/app/api/job-leads/[id]/search/route.ts:10`

### Performance
- [ ] **PERF-A1**: Bulk-insert prospects in `/api/job-leads/[id]/search` (replace `for...of await db.insert(...)` with a single batch insert)
- [ ] **PERF-A2**: Bulk-insert prospect bridges in `match-connections.ts` (single `.values(bridgeValues).onConflictDoNothing()`)
- [ ] **PERF-A3**: Batch the closeness updates in `/api/contacts/import/categorize` (CASE WHEN or transaction)
- [ ] **PERF-A4**: Add Drizzle `index()` definitions on hot columns — `contacts(archived_at)`, `contacts(linkedin_url)`, `contacts(company_id)`, `contacts(linkedin_connection_date)`, `companies(name)`
- [ ] **PERF-A5**: Replace the full `SELECT * FROM contacts` scans in `/api/contacts/import` and `match-connections.ts` with DB-side dedup (`ON CONFLICT DO NOTHING`) and server-side fuzzy matching

### Test Infrastructure
- [x] **TEST-A1**: Stand up Vitest with TypeScript + Drizzle-compatible test DB harness
- [x] **TEST-A2**: Cover the load-bearing logic — API response envelope shape, `canTransition()` pipeline graph, `logTimeline()` side-effect, LinkedIn CSV parsing, bridge-score computation
- [x] **TEST-A3**: Add a regression test for the hydration sidebar crash (BUG-01)

## v2 (deferred)

### Job Leads — Production-Grade Scraping
- **JL2-01**: Decouple scrape worker from API route — move to a long-running sidecar or remote browser service (Browserless / Playwright Cloud) reachable from Vercel
- **JL2-02**: Move `playwright` from `dependencies` to `devDependencies` (or configure `serverExternalPackages: ['playwright']`)
- **JL2-03**: Captcha / rate-limit detection with backoff
- **JL2-04**: Pagination beyond first results page

### Phase 2 (per `CLAUDE.md`)
- **VEC-01**: pgvector embeddings on the same Neon instance for semantic search over notes, interactions, and job descriptions
- **VEC-02**: OpenAI embedding pipeline (`OPENAI_API_KEY` already documented in env)

### Quality
- **OBS-01**: Structured logging beyond `console.error` — error reporting integration (Sentry instrumentation is currently no-op)
- **OBS-02**: Background-job dashboard for scrape status

### UX
- **UX-01**: Mobile-responsive polish (currently desktop-first)
- **UX-02**: Bulk-edit operations beyond triage categorize

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-tenant / multi-user | Personal CRM; Clerk middleware hardcodes `steve@bronstein.org` |
| Mobile / native app | Web-first during the active search; deferred indefinitely |
| Real-time chat / messaging | Outside CRM scope |
| OAuth providers beyond Clerk's built-in | Clerk handles auth; the residual GitHub button is starter residue to delete, not implement |
| Server-side scraping on Vercel serverless | Playwright + Chromium exceed Vercel's bundle/FS limits — scraping stays local-dev/Docker |
| DB-backed `/dashboard/kanban` page | Starter-template residue; will be removed under DEBT-A3 |
| Video or audio content | Not a CRM concern |
| Public-facing pages | The whole app is `/dashboard/*` behind the single-user lock |

## Traceability

> Phase mapping populated by `gsd-roadmapper` on 2026-05-12.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BUG-01 | Phase 1 | Pending |
| BUG-02 | Phase 1 | Pending |
| TEST-A1 | Phase 2 | Complete |
| TEST-A2 | Phase 2 | Complete |
| TEST-A3 | Phase 2 | Complete |
| SEC-A1 | Phase 3 | Pending |
| SEC-A2 | Phase 3 | Pending |
| DEBT-A1 | Phase 4 | Pending |
| DEBT-A2 | Phase 4 | Pending |
| DEBT-A3 | Phase 4 | Pending |
| DEBT-A4 | Phase 4 | Pending |
| DEBT-A5 | Phase 4 | Pending |
| JL-A1 | Phase 5 | Pending |
| JL-A2 | Phase 5 | Pending |
| JL-A3 | Phase 5 | Pending |
| JL-A4 | Phase 5 | Pending |
| JL-A5 | Phase 5 | Pending |
| PERF-A1 | Phase 6 | Pending |
| PERF-A2 | Phase 6 | Pending |
| PERF-A3 | Phase 6 | Pending |
| PERF-A4 | Phase 6 | Pending |
| PERF-A5 | Phase 6 | Pending |

**Coverage:**
- v1 Active requirements: 22 total
- Mapped to phases: 22 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-12*
*Last updated: 2026-05-12 after roadmap creation — traceability populated*
