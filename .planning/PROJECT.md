# Heimdall — Job Search Command Center

## Current State

**Shipped:** v1.1 LinkedIn Scraping by Company (Phases 7–10, 2026-05-20). The `scrape-linkedin-connections` skill now accepts a LinkedIn company URL or bare company name in addition to job IDs/URLs, creating synthetic `job_leads` (`linkedinJobUrl = null`) that flow through the existing queue, prospects, and recommendation pipeline. Triage also surfaces each connection's company and role *at the time of connection*, backfilled by a paced agent-browser sweep and just-in-time enrichment during company-scope triage.

Prior milestone: v1.0 MVP / Brownfield Hardening (Phases 1–6, 2026-05-14) — hydration-crash fix, Vitest + PGlite test harness, `/api/*` auth, starter-template removal, the out-of-app LinkedIn scrape skill, and N+1 elimination + indexes.

See `.planning/MILESTONES.md` for the full ledger and `.planning/milestones/` for per-milestone archives.

## Current Milestone: v1.2 Networking Outreach Campaigns

**In progress:** Phase 11 (Schema, Enums, and State Machine) complete (2026-06-20) — `outreach_campaigns` + `outreach_emails` tables, three pgEnums, and the `canEmailTransition()` email state machine landed and the `0013_outreach_campaigns.sql` migration is applied to live Neon. Next: Phase 12 (API Routes).

**Goal:** Run targeted networking-email campaigns end to end from Heimdall — filter and select contacts, let a skill draft personalized emails, review/edit/approve each, then push approved ones to Gmail as drafts.

**Target features:**
- **Saved campaigns + contact selection** — Filterable contact search (how I know them / `howMet`, connection year or date range, closeness tier, outreach status) with checkbox multi-select, saved as **named campaigns** carrying a campaign goal/instruction. New `outreach_campaigns` table + one `outreach_email` row per contact per campaign.
- **Triage connection-date filter** — Filter the existing triage workflow by connection year / date range (e.g. 2021–2022 to surface ID.me people), feeding the selection flow.
- **AI email-generation skill** — Per campaign, generates a subject line + body per contact, personalized from contact data (howMet, company/role, closeness, prior interactions) + the campaign goal, in the owner's voice (reusing the voice + LLM-tell conventions from the `tailor-application-materials` skill).
- **Email discovery** — For contacts with no stored email: look up via Google Contacts + Gmail search; store what's found; if nothing, flag the contact for a **LinkedIn message** instead.
- **Review & approval UI** — Per-email inline edit, regenerate a single email, and an **approve gate** (generated → edited → approved). Only approved emails with a recipient get drafted.
- **Gmail drafting skill** — Creates Gmail **drafts** (never sends) for approved emails, stores the Gmail draft id, marks status `drafted`, logs a timeline event; missing-email contacts surface as "needs email / LinkedIn".

### Deferred themes (not in v1.2)

Carried in the v2 backlog and deferred-items ledger:
- Production-grade scraping — remote browser service reachable from Vercel (JL2-01), move `playwright` to devDependencies (JL2-02), captcha/rate-limit backoff (JL2-03), pagination beyond page 1 (JL2-04)
- Drain the legacy enrichment backlog (run `backfill-enrichment-reset.mjs`; ~1500 contacts) and close out the paced sweep
- pgvector semantic search over notes/interactions/JDs (VEC-01/02)
- Structured logging / error reporting beyond `console.error` (OBS-01), background-job dashboard for scrape status (OBS-02)
- Close the open UAT scenarios + verification sign-offs deferred from v1.0/v1.1 (Phases 1, 6, 8, 9 — see STATE.md → Deferred Items)

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

#### v1.0 Hardening (Phases 1–6) — shipped 2026-05-14

- ✓ **BUG-01 / BUG-02**: React hydration crash in `app-sidebar.tsx` eliminated (removed the `{user && ...}` guard around `UserAvatarProfile`, guarded `emailAddresses[0]` access); sidebar navigation survives large LinkedIn imports. (Phase 1)
- ✓ **SEC-A1 / SEC-A2**: Every `/api/*` route requires a valid Clerk session via `middleware.ts`; the no-op "Continue with GitHub" button + external `api.github.com` star fetch removed. (Phase 3)
- ✓ **DEBT-A1..A5**: Starter-template residue gone — `features/products`, starter routes, the 805-line `infobar.tsx`, the kanban route, `__CLEANUP__/`, and the dead `computeBridgeScore` import all deleted; pinned by `src/__cleanup__.test.ts`. (Phase 4)
- ✓ **JL-B1..B5**: LinkedIn connection scraping moved out of the app into the `scrape-linkedin-connections` Claude Code skill driving `vercel-labs/agent-browser`; the app holds the queue + categorized failures (`queued`/`failed` enum, `last_error` columns); the in-app fire-and-forget Playwright IIFE + `scrape-connections.ts` + `search-progress.tsx` deleted. (Phase 5)
- ✓ **PERF-A1..A5**: N+1 patterns eliminated and hot-path indexes shipped. `POST /api/job-leads/[id]/prospects` wraps prospect insert + `matchConnections` + status flip in `db.transaction()`; `match-connections.ts` does a single bulk bridge insert with `onConflictDoNothing()`; `PATCH /api/contacts/import/categorize` is one bulk UPDATE; `POST /api/contacts/import` is one bulk INSERT with `onConflictDoNothing` + narrowed dedup SELECT; `GET /api/job-leads/[id]/recommendations` is now a pure read. Migration 0008 adds 5 indexes; pinned by `__phase6_indexes__.test.ts`. `pg_trgm` GIN remains a v2 item. (Phase 6)
- ✓ **TEST-A1..A3**: Vitest harness with PGlite-backed Drizzle DB; `npm run test:run` exits 0 in ~6s; pre-push hook runs build + tests. Covers the API envelope, `canTransition()`, `logTimeline()` side-effect, LinkedIn CSV parse, `computeBridgeScore`, plus the BUG-01 SSR + hydration regression. 79 tests across 10 files. (Phase 2)

#### v1.1 LinkedIn Scraping by Company (Phases 7–10) — shipped 2026-05-20

- ✓ **JL-C3 / JL-C4**: `job_leads.linkedinJobUrl`/`roleTitle` nullable (migration 0009); `POST /api/job-leads` accepts a company-scope shape (`{ companyName, linkedinCompanyUrl? }`) via a discriminated Zod union, auto-creating/deduping the `companies` row; state machine input-shape agnostic (D-17 pins). (Phase 7)
- ✓ **JL-C1 / JL-C2 / JL-C5 / JL-C6 / JL-C7**: `scrape-linkedin-connections` accepts a LinkedIn company URL or bare company name, navigates direct to `/company/<slug>/people/` when there's no job URL, disambiguates multi-match searches inline (top 3–5), and drains company-scope leads from the same `?status=queued` queue. `GET /api/job-leads` projects `companyLinkedinUrl`. (Phase 8)
- ✓ **JL-C8 / JL-C9**: Job-lead detail + list render company-scope leads cleanly — "View job posting" hidden, "Company scrape" badge, distinct list icon; SSR-structural tests. (Phase 9)
- ✓ **ENR-01..ENR-06**: At-connection company/role enrichment — `contacts` columns + `contact_enrichment_status` enum (migration 0010), CSV import seeding, `PATCH /api/contacts/[id]/enrichment` + `GET /api/contacts/enrichment-queue`, triage recommendation-card render + just-in-time enrichment, and skill per-profile + paced batch-sweep modes with anti-bot pacing docs. (Phase 10)

### Active

<!-- v1.2 Networking Outreach Campaigns — requirements defined in .planning/REQUIREMENTS.md, mapped to phases in .planning/ROADMAP.md. -->

- ☐ **v1.2 Networking Outreach Campaigns** — see `.planning/REQUIREMENTS.md` for the scoped requirement set (campaigns, contact selection, triage date filter, email generation, email discovery, review/approve, Gmail drafting).

### Out of Scope

- **Multi-tenant / multi-user** — explicitly single-user; Clerk middleware hardcodes `steve@bronstein.org`. Removing the lock is not a v1 goal.
- **Mobile / native app** — web-first; not a goal during the active search.
- **Real-time chat or messaging** — outside the CRM scope.
- **OAuth providers beyond Clerk's own** — Clerk handles auth; the residual "Continue with GitHub" starter button was deleted in Phase 3, not implemented.
- **Server-side LinkedIn scraping on Vercel** — Playwright + Chromium cannot run on Vercel serverless (250MB bundle, no persistent FS). Scraping stays in local dev / Docker with a host browser via CDP. Production deployment would need a remote browser service if ever required.
- **Video/voice posts or content** — not a CRM concern.
- **Database-backed Kanban for the `/dashboard/kanban` route** — that page is starter-template residue and will be removed, not wired to `tasks`. (Removed in Phase 4)

## Context

- **User**: Single owner running an active executive job search (VP Data/AI, growth-stage). The product is also the user's daily driver — bugs that break navigation are show-stoppers, not annoyances.
- **Dual-interface design**: Every data mutation goes through `/app/api/*` so the Claude Code CLI has full parity with the browser UI. This is a load-bearing constraint, not a stylistic choice.
- **Existing codebase**: built on the Next.js Shadcn dashboard starter, now substantially hardened — starter residue removed (Phase 4), all `/api/*` routes authenticated (Phase 3), Vitest + PGlite test harness in place (Phase 2). As of v1.1: 10 Drizzle migrations (through 0010 — enrichment columns). LinkedIn scraping lives entirely in the `.claude/skills/scrape-linkedin-connections` skill driving `vercel-labs/agent-browser`; the app holds the queue, results, and categorized failures.
- **Most recent work**: v1.1 (Phases 7–10) added company-scope scraping (synthetic `job_leads`) and at-connection company/role enrichment for triage. The legacy enrichment backlog (~1500 contacts) is paced-sweep-backfillable but not yet drained.
- **Codebase analysis**: `.planning/codebase/` was generated 2026-05-12 by `/gsd-map-codebase`; predates Phases 5–10, so re-run `/gsd-map-codebase` before the next milestone if a fresh reference is needed.

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
| Job Leads scraping via a Claude Code skill (`vercel-labs/agent-browser`), not in-app Playwright | The in-app fire-and-forget Playwright IIFE was brittle (hardcoded `'point'`, leaked browsers); moving scraping out-of-band into a skill removed it from the serverless runtime entirely | ✓ Good — reshaped in Phase 5; the `'point'` artifact and IIFE are deleted |
| Pipeline state machine via `canTransition()` | Prevents invalid stage moves at the API boundary | ✓ Good |
| 8-tier closeness orthogonal to warmth | Closeness measures underlying relationship strength; warmth measures recent engagement — they decouple cleanly | ✓ Good |
| Company-scope scrapes as synthetic `job_leads` (`linkedinJobUrl = null`) | Reuse the entire existing queue/prospects/recommendations pipeline rather than adding a new entity or table | ✓ Good (v1.1, Phase 7) |
| Single shared drain queue; skill nav branches on `linkedinJobUrl` | No separate queue, status value, or route for company-scope vs job-URL leads — one loop drains both | ✓ Good (v1.1, Phase 8) |
| At-connection company/role captured at CSV-import + backfilled by paced agent-browser sweep | LinkedIn's CSV export omits company/role *as of* connection date; a human-paced sweep avoids bot-detection across the 1000+ backlog | ✓ Good (v1.1, Phase 10) — backlog drain still pending |
| JIT enrichment on the company-triage read path does no inline DB write | Keep the recommendations read pure; enrichment writes happen only via the explicit PATCH endpoint | ✓ Good (v1.1, Phase 10) |

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
*Last updated: 2026-06-20 — v1.2 Phase 11 (Schema, Enums, and State Machine) complete: outreach tables + enums + `canEmailTransition()` state machine, migration 0013 applied to live Neon. v1.0 (Phases 1–6) and v1.1 (Phases 7–10) shipped and archived in `.planning/milestones/`. Next: `/gsd:discuss-phase 12` (API Routes).*
