# Heimdall — Job Search Command Center

## What This Is

A personal CRM and pipeline tracker for an executive job search targeting VP Data/AI roles at growth-stage companies. Built for dual interaction — full-featured web UI **and** Claude Code CLI parity through a REST API surface. Single-user by design (Clerk middleware locks `/dashboard` to `steve@bronstein.org`).

## Core Value

**The owner can run their entire executive job search from one place — track companies, log interactions, move applications through pipeline stages, and surface the highest-value introduction paths for any role — without leaving the app.** If everything else fails, the pipeline state machine and the timeline activity feed must work: that is the system of record for the search.

## Requirements

### Validated

<!-- Inferred from existing code at .planning/codebase/* and docs/summary.md. Shipped and in active use. -->

- ✓ **AUTH-V1**: Clerk auth with single-user email lock (`src/proxy.ts`)
- ✓ **COMP-V1**: Companies CRUD with priority, stage, funding, research notes — soft-delete via `archived_at` (`src/app/api/companies/`, `drizzle/schema/companies.ts`)
- ✓ **CONT-V1**: Contacts CRUD with 8-tier closeness, outreach status, warmth, `howMet`, `metDate`, `linkedinConnectionDate` (`drizzle/schema/contacts.ts`)
- ✓ **CONT-V2**: LinkedIn Connections CSV import — dedup by URL then name+company, per-row closeness selection, auto-populates `linkedinConnectionDate` (`src/features/contacts/components/linkedin-import/`, `POST /api/contacts/import`)
- ✓ **CONT-V3**: Keyboard-driven contact triage workflow — `howMet` autocomplete, year buttons, closeness 1-8, undo/skip (`src/features/contacts/components/triage/`)
- ✓ **APP-V1**: Applications CRUD linked to companies with referral-source tracking ("via [Contact]" attribution) (`src/app/api/applications/`)
- ✓ **PIPE-V1**: Pipeline kanban board with drag-and-drop and validated stage transitions via `canTransition()` state machine (`src/features/pipeline/`, `src/lib/domain/pipeline.ts`)
- ✓ **PIPE-V2**: 13 pipeline stages (Researching → Applied → Recruiter Screen → Phone → Onsite → Final → Offer → Negotiating → Accepted/Rejected/Withdrawn/Ghosted/On Hold)
- ✓ **INTR-V1**: Interactions logging (emails, calls, coffee chats, interviews, intros) with auto-update of outreach status (`src/app/api/interactions/`)
- ✓ **TASK-V1**: Tasks CRUD with entity linking and priority filters (`src/app/api/tasks/`)
- ✓ **NOTE-V1**: Notes CRUD with category filters and markdown content (`src/app/api/notes/`)
- ✓ **REC-V1**: Recruiters tracking linked to contacts (`src/app/api/recruiters/`)
- ✓ **TIME-V1**: Timeline events — every write operation emits a `timeline_events` row via `logTimeline()` side-effect (`src/lib/db/timeline.ts`)
- ✓ **OVR-V1**: Overview dashboard with KPI cards, pipeline funnel, activity timeline, source breakdown pie chart (`src/app/dashboard/overview/`)
- ✓ **METR-V1**: Weekly metrics snapshots + trend charts for JSC reporting (`src/features/metrics/`)
- ✓ **SRCH-V1**: Cross-entity search (companies, contacts, applications, notes) via Cmd+K command palette (`src/components/kbar/`)
- ✓ **NET-V1**: Networking page with closeness-tier stats, outreach tracker, connection finder (`src/app/dashboard/networking/`)
- ✓ **JL-V1**: Job lead creation from URL — cheerio job page scrape extracts company name, role, location (`src/features/job-leads/lib/scrape-job-page.ts`)
- ✓ **JL-V2**: LinkedIn browser session setup via CDP — Docker → headed Chrome on host with `BROWSER_CDP_ENDPOINT` (`src/features/job-leads/lib/linkedin-browser.ts`)
- ✓ **JL-V3**: Recommendation scoring — composite formula `0.40·seniority + 0.35·closeness + 0.25·recency`, grouped by mutual connection (`src/features/job-leads/lib/prioritization.ts`)
- ✓ **API-V1**: Standard response envelope `{ success, data, error, meta }` and cursor pagination on `updated_at` across 34 routes (`src/lib/api/`)
- ✓ **CLI-V1**: All mutations routed through REST API — no server actions — so the Claude Code CLI has full parity with the web UI

### Active

<!-- Current scope being built toward. Hypotheses until shipped and validated. Derived from `bug.md`, `docs/summary.md` "Needs Debugging" section, and `.planning/codebase/CONCERNS.md`. -->

- [ ] **BUG-01**: Fix React hydration crash in sidebar — remove `{user && ...}` guard around `UserAvatarProfile` in `src/components/layout/app-sidebar.tsx` (lines 148, 166); kills all sidebar navigation after LinkedIn import
- [ ] **JL-A1**: Finish Job Leads scraper — parameterize hardcoded `'point'` company name in `scrape-connections.ts:62`, tune Playwright timeouts on heavy LinkedIn pages, surface scrape errors to the UI, and remove debug-mode `console.log` flood + leaked-browser pattern in `scrape-connections.ts`
- [ ] **JL-A2**: Add timeout bound to fire-and-forget search IIFE in `src/app/api/job-leads/[id]/search/route.ts` so leads can't get stuck in `searching` status indefinitely
- [ ] **SEC-A1**: Add Clerk auth check to all `/api/*` routes — currently 0 of 34 routes call `auth()`; only the `/dashboard` middleware lock prevents access
- [ ] **DEBT-A1**: Strip Next.js starter-template residue — delete `src/features/products/`, `src/app/dashboard/{product,overview-old,exclusive,workspaces,billing}/`, the 805-line unused `infobar.tsx`, the no-op GitHub auth button, the external `api.github.com/repos/...` star fetch on auth pages, and the `__CLEANUP__/` directory
- [ ] **PERF-A1**: Eliminate N+1 patterns — bulk-insert prospects in `/api/job-leads/[id]/search`, bulk-insert prospect bridges in `match-connections.ts`, batch update closeness in `/api/contacts/import/categorize`
- [ ] **PERF-A2**: Add indexes on hot-path columns — `contacts(archived_at)`, `contacts(linkedin_url)`, `contacts(company_id)`, `contacts(linkedin_connection_date)`, `companies(name)`; investigate `pg_trgm` GIN for search
- [ ] **TEST-A1**: Stand up a test harness (Vitest) and cover the load-bearing logic — API envelope shape, `canTransition()` pipeline graph, `logTimeline()` side-effect, LinkedIn CSV parsing, bridge-score computation

### Out of Scope

- **Multi-tenant / multi-user** — explicitly single-user; Clerk middleware hardcodes `steve@bronstein.org`. Removing the lock is not a v1 goal.
- **Mobile / native app** — web-first; not a goal during the active search.
- **Real-time chat or messaging** — outside the CRM scope.
- **OAuth providers beyond Clerk's own** — Clerk handles auth; the residual "Continue with GitHub" starter button will be deleted, not implemented.
- **Server-side LinkedIn scraping on Vercel** — Playwright + Chromium cannot run on Vercel serverless (250MB bundle, no persistent FS). Scraping stays in local dev / Docker with a host browser via CDP. Production deployment would need a remote browser service if ever required.
- **Video/voice posts or content** — not a CRM concern.
- **Database-backed Kanban for the `/dashboard/kanban` route** — that page is starter-template residue and will be removed, not wired to `tasks`.

## Context

- **User**: Single owner running an active executive job search (VP Data/AI, growth-stage). The product is also the user's daily driver — bugs that break navigation are show-stoppers, not annoyances.
- **Dual-interface design**: Every data mutation goes through `/app/api/*` so the Claude Code CLI has full parity with the browser UI. This is a load-bearing constraint, not a stylistic choice.
- **Existing codebase**: ~95 feature component files, 34 API routes, 13 database tables, 17 enums, 7 migrations. Built on the Next.js Shadcn dashboard starter — substantial starter residue still in the tree (`__CLEANUP__/`, `src/features/products/`, etc.).
- **Active development**: Job Leads (LinkedIn scrape → prioritized intro paths) was the most recent feature and still has documented rough edges in `docs/summary.md` (the "Needs Debugging" section is the source of truth).
- **Codebase analysis**: `.planning/codebase/` was generated 2026-05-12 by `/gsd-map-codebase` and is the up-to-date reference for stack, architecture, conventions, integrations, structure, testing posture, and concerns.

## Constraints

- **Tech stack**: Next.js 16 (App Router, RSC) + Neon Postgres + Drizzle ORM + shadcn/ui + Tailwind v4 + Clerk + Recharts — fixed for this project; no framework migrations.
- **Auth**: Clerk only, single-user lock on `steve@bronstein.org`. No multi-tenancy.
- **No server actions**: All mutations must go through REST API routes — CLI parity depends on it.
- **No raw SQL** in app code except for pgvector queries (Phase 2 — not yet active). Use Drizzle query builder.
- **All API routes use Zod** for request validation and return the `{ success, data, error, meta }` envelope.
- **Soft deletes**: never hard-delete during the active search — set `archived_at` instead.
- **Hosting**: Vercel — Playwright/Chromium incompatible with serverless; scraping is local-dev / Docker only.
- **Performance**: 1500+ contacts in the table today; queries that scan the full `contacts` table or do N+1 inserts/updates are already noticeable.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| REST API for all mutations (no server actions) | CLI parity — Claude Code can drive everything the web UI can over HTTP | ✓ Good |
| Single-user Clerk lock in middleware | Personal app; multi-tenancy is unnecessary complexity for an exec job search | ✓ Good |
| Drizzle types as the single source of truth (`$inferSelect`/`$inferInsert`) | No DTO layer to maintain; schema changes propagate to TS automatically | ✓ Good |
| Soft deletes via `archived_at` | Never lose history during an active search; preserves timeline integrity | ✓ Good |
| Timeline events emitted from every write | Denormalized activity feed for the dashboard; one cheap row per mutation | ✓ Good |
| Cursor pagination on `updated_at` | Stable under inserts; offsets would shift under writes | ✓ Good |
| Job Leads scraping via Playwright + CDP | Only reliable way to drive LinkedIn's heavily-obfuscated UI; accept Vercel incompatibility | ⚠️ Revisit — scraper is brittle, hardcoded `'point'` debug artifact still present |
| Pipeline state machine via `canTransition()` | Prevents invalid stage moves at the API boundary | ✓ Good |
| 8-tier closeness orthogonal to warmth | Closeness measures underlying relationship strength; warmth measures recent engagement — they decouple cleanly | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-12 after initialization*
