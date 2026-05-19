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

> **SUPERSEDED 2026-05-13:** Phase 5 was reshaped from an in-app-scraper-fix direction to a Claude Code skill driving `vercel-labs/agent-browser`. JL-A1..A5 targeted code that is being deleted (`src/features/job-leads/lib/scrape-connections.ts`, the fire-and-forget IIFE in `/api/job-leads/[id]/search/route.ts`, the polling `SearchProgress` component, and the `Find Connections` button). The new requirement set is **JL-B1..JL-B5**, defined below and mapped 1:1 to the five Success Criteria in `ROADMAP.md §Phase 5 (RESHAPED)`. The original JL-A items remain in the list strikethrough'd for audit trail; their status in the Traceability table is **SUPERSEDED**.

- [ ] ~~**JL-A1**: Replace hardcoded `'point'` company name in `scrape-connections.ts:62` with the lead's actual `companyName`~~
- [ ] ~~**JL-A2**: Tune Playwright navigation for heavy LinkedIn pages — `waitUntil: 'domcontentloaded'` + targeted `waitForSelector` instead of fixed `waitForTimeout` calls~~
- [ ] ~~**JL-A3**: Remove debug-mode noise — strip the 20+ `console.log` dumps and the "leave browser open" pattern in `scrape-connections.ts`~~
- [ ] ~~**JL-A4**: Bound the fire-and-forget search IIFE with a `Promise.race()` timeout that reverts a stuck lead from `searching` back to `scraped` and surfaces the failure to the UI~~
- [ ] ~~**JL-A5**: Surface scrape errors to the user — currently the async path swallows errors and the lead silently stalls~~

- [ ] **JL-B1**: A Claude Code skill at `.claude/skills/scrape-linkedin-connections/` accepts a job-lead UUID or LinkedIn URL as a positional argument, OR drains all leads with `status = 'queued'` when invoked with no argument. Verifiable via the SKILL.md frontmatter (`argument-hint: "[job-lead-id-or-url]"`) and the skill prompt body's no-arg branch.

- [ ] **JL-B2**: The skill drives `vercel-labs/agent-browser` through the canonical LinkedIn nav: job posting → company page → employees list → 2nd-degree filter, and extracts prospects in the existing `ScrapedProspect` shape (`{ name, title, linkedinUrl, profileSnippet, mutualConnectionNames }`). Verifiable via `.claude/skills/scrape-linkedin-connections/references/linkedin-navigation.md` documenting the nav steps and the skill prompt body invoking `agent-browser` subcommands.

- [ ] **JL-B3**: The skill writes results back through `POST /api/job-leads/[id]/prospects` (new bulk-insert route) and `PATCH /api/job-leads/[id]/status` (extended state-machine). The fire-and-forget IIFE in `src/app/api/job-leads/[id]/search/route.ts` is removed; `src/features/job-leads/lib/scrape-connections.ts` (hardcoded `'point'`, `waitForTimeout`, 20+ `console.log` dumps) is deleted; `src/features/job-leads/components/search-progress.tsx` is deleted. Verifiable via `src/__cleanup__.test.ts` Phase 5 block + grep for `scrapeConnections` returning zero matches in `src/`.

- [ ] **JL-B4**: The `job_lead_status` enum has two new values — `'queued'` (between `'scraped'` and `'searching'`) and `'failed'` (terminal-recoverable, after `'archived'`) — and the `job_leads` table has nullable `last_error` (text, ≤200 chars) and `last_error_at` (timestamp) columns. The state machine enforces `scraped → queued`, `queued → searching`, `searching → found | failed`, `failed → queued` (retry). Verifiable via Drizzle migration + `PATCH /api/job-leads/[id]/status` rejecting invalid transitions with `validationError(...)`.

- [ ] **JL-B5**: The job-lead detail page renders: (a) on `status = 'queued'` — a subtle badge labeled `queued for connection scrape` + a `Copy skill invocation` button that copies `claude /scrape-linkedin-connections <lead-id>` to the clipboard with a sonner toast confirmation; (b) on `status = 'failed'` — a `bg-destructive/10` border-destructive/30 banner showing the error category (bold) + truncated detail + a `Retry` button that POSTs to `/api/job-leads/[id]/search` to flip back to `queued`. Verifiable via the rendered component output and a click-handler test.

### Security Hardening
- [ ] **SEC-A1**: Add Clerk `auth()` check (or a `middleware.ts` matcher) to every `/api/*` route — currently 0/34 routes authenticate
- [ ] **SEC-A2**: Remove the no-op "Continue with GitHub" auth button (`github-auth-button.tsx`) and the residual external `api.github.com` star fetch on the sign-in/sign-up pages

### Starter-Template Cleanup
- [x] **DEBT-A1**: Delete `src/features/products/` and `src/app/dashboard/product/` routes
- [x] **DEBT-A2**: Delete `src/app/dashboard/{exclusive,workspaces,billing}/` routes and the 805-line `src/components/ui/infobar.tsx`
- [x] **DEBT-A3**: Decide on Kanban route — either back it with the `tasks` table via `/api/tasks` or remove the route entirely
- [x] **DEBT-A4**: Remove the `__CLEANUP__/` directory once the optional features above are stripped
- [x] **DEBT-A5**: Drop the unused `computeBridgeScore` import in `src/app/api/job-leads/[id]/search/route.ts:10`

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

## v1.1 Active — LinkedIn Scraping by Company

> Extends the v1 `scrape-linkedin-connections` skill (JL-B1..JL-B5) so it can scrape 2nd-degree connections at any target company, not just at companies attached to a specific LinkedIn job posting. Reuses the existing `job_leads` + `prospects` tables via "synthetic" leads where `linkedinJobUrl` is null.

### Skill Input Parsing
- [ ] **JL-C1**: `/scrape-linkedin-connections` accepts a LinkedIn company URL (`https://(www.)?linkedin.com/company/<slug>(/.*)?`) as a positional argument and uses it as the navigation entry point — distinct from the existing job-URL branch which starts at `/jobs/...`. Verifiable via the skill's argument-parsing block branching on URL path shape.
- [ ] **JL-C2**: `/scrape-linkedin-connections` accepts a bare company-name string (anything that isn't a UUID, an https URL, or empty) as a positional argument; the skill performs a LinkedIn company search and selects/disambiguates the target company before scraping. Verifiable via the skill prompt body invoking agent-browser against LinkedIn's company search results.

### Company-Scope Job Lead Creation
- [ ] **JL-C3**: The Heimdall API accepts a company-scope job-lead creation request — either `POST /api/job-leads` with `{ companyName, linkedinCompanyUrl? }` and no job URL, or a dedicated route — and returns a `job_leads` row with `linkedinJobUrl = null`, `roleTitle = null` (or a canonical "Company-wide scrape" sentinel), `status = 'queued'`, and a foreign-key link to a `companies` row (created on the fly if absent). Verifiable via a route test that POSTs without `linkedinJobUrl` and confirms the resulting row + envelope.
- [ ] **JL-C4**: The `job_leads` schema permits the company-scope row shape end-to-end — `linkedinJobUrl` is nullable, `roleTitle` is nullable, no constraints/indexes/types assume non-null on these columns. Verifiable via Drizzle schema inspection + a regression test that inserts a row with both fields null and reads it back.

### Disambiguation UX
- [ ] **JL-C5**: When the skill's bare-company-name input matches more than one LinkedIn company, the skill extracts the top 3–5 results from LinkedIn's company search page (name + employee count + industry), presents them inline as a numbered list, waits for the user to pick one, and uses the picked company's URL for the remaining scrape. Verifiable via `references/linkedin-navigation.md` documenting the search → disambiguate path and the skill prompt body's selection branch.

### Navigation Branching
- [ ] **JL-C6**: The skill's LinkedIn navigation logic branches on the lead's `linkedinJobUrl`: when null, navigation starts directly at the company employees page (`/company/<slug>/people/`); when non-null, the existing job → company → employees flow runs unchanged. Verifiable via the skill prompt body's null-branch + `references/linkedin-navigation.md` documenting both paths.

### Drain Mode Integration
- [ ] **JL-C7**: Drain mode (no-arg invocation) processes company-scope leads via the same `GET /api/job-leads?status=queued` endpoint as job-URL leads and runs the `linkedinJobUrl=null` nav branch automatically — no separate queue, no separate status enum value, no separate route. Verifiable via a manual drain run mixing both lead types + the skill prompt body using a single loop.

### UI for Company-Scope Leads
- [ ] **JL-C8**: The job-lead detail page renders gracefully when `linkedinJobUrl` is null — the "View job posting" link/affordance is hidden (not broken), a "Company scrape" label/badge replaces the role-title display area, and the company name + employee count (once scraped) are shown prominently. Verifiable via a rendered component snapshot or DOM-shape test with a `linkedinJobUrl: null` fixture.
- [ ] **JL-C9**: The job-lead list view visually distinguishes company-scope leads from job-URL leads (different icon, label, or row badge) so the user can scan the queue without opening every lead. Verifiable via the rendered list with a mixed-lead fixture.

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
| DEBT-A1 | Phase 4 | Complete |
| DEBT-A2 | Phase 4 | Complete |
| DEBT-A3 | Phase 4 | Complete |
| DEBT-A4 | Phase 4 | Complete |
| DEBT-A5 | Phase 4 | Complete |
| JL-A1 | Phase 5 | SUPERSEDED |
| JL-A2 | Phase 5 | SUPERSEDED |
| JL-A3 | Phase 5 | SUPERSEDED |
| JL-A4 | Phase 5 | SUPERSEDED |
| JL-A5 | Phase 5 | SUPERSEDED |
| JL-B1 | Phase 5 | Pending |
| JL-B2 | Phase 5 | Pending |
| JL-B3 | Phase 5 | Pending |
| JL-B4 | Phase 5 | Pending |
| JL-B5 | Phase 5 | Pending |
| PERF-A1 | Phase 6 | Pending |
| PERF-A2 | Phase 6 | Pending |
| PERF-A3 | Phase 6 | Pending |
| PERF-A4 | Phase 6 | Pending |
| PERF-A5 | Phase 6 | Pending |

**Coverage:**
- v1 Active requirements: 22 total (5 superseded; net 22 active, with JL-A1..A5 replaced by JL-B1..B5)
- Mapped to phases: 22 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-12*
*Last updated: 2026-05-19 — milestone v1.1 added (JL-C1..JL-C9 for LinkedIn Scraping by Company). v1.0 active items JL-B1..JL-B5 + PERF-A1..A5 shipped in Phase 5/6.*
