<!-- refreshed: 2026-05-12 -->
# Architecture

**Analysis Date:** 2026-05-12

## System Overview

```text
┌────────────────────────────────────────────────────────────────────┐
│                     Browser / Claude Code CLI                       │
│           HTTP requests to /app/api/* or page navigation            │
└──────────────────┬───────────────────────┬─────────────────────────┘
                   │                       │
                   ▼                       ▼
┌──────────────────────────┐  ┌────────────────────────────────────┐
│   Next.js App Router     │  │   Next.js API Routes               │
│   Pages (Server RSC)     │  │   src/app/api/***/route.ts         │
│   src/app/dashboard/**   │  │   All mutations go here            │
└──────────┬───────────────┘  └──────────────┬─────────────────────┘
           │  direct DB query                 │ Zod validate → Drizzle
           │  for initial page data           │ + logTimeline() side-effect
           ▼                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                     src/lib/db/index.ts                           │
│              Drizzle ORM client (neon/serverless)                 │
│                  drizzle/schema/*.ts tables                       │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Neon Postgres (DATABASE_URL)                    │
│   companies · contacts · applications · interactions · tasks      │
│   notes · pipeline_stages · timeline_events · job_leads           │
│   prospects · prospect_bridges · recruiters · search_metrics      │
└──────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File(s) |
|-----------|----------------|---------|
| Root Layout | Theme, providers, auth shell | `src/app/layout.tsx` |
| Dashboard Layout | Sidebar, header, KBar, search overlay | `src/app/dashboard/layout.tsx` |
| Clerk Middleware | Auth guard, single-user email lock | `src/proxy.ts` |
| API Routes | All data mutations, REST endpoints | `src/app/api/**/route.ts` |
| Feature Listing Pages | Async RSC: DB query → pass data to feature component | `src/app/dashboard/**/page.tsx` |
| Feature Components | `'use client'` interactive UI | `src/features/**/components/*.tsx` |
| Drizzle Client | Singleton DB connection | `src/lib/db/index.ts` |
| Timeline Logger | Side-effect: record every write as activity event | `src/lib/db/timeline.ts` |
| API Helpers | Response envelopes, error factories, filter parsers | `src/lib/api/` |
| Domain Types | Drizzle-inferred TS types + enum value arrays | `src/lib/domain/types.ts` |
| Pipeline Logic | Valid transition graph + terminal state list | `src/lib/domain/pipeline.ts` |
| Job Lead Scrapers | Playwright browser automation (LinkedIn) + Cheerio (job page) | `src/features/job-leads/lib/` |
| Prioritization | Bridge score algorithm for intro recommendations | `src/features/job-leads/lib/prioritization.ts` |
| Zustand Stores | Client-side optimistic state for drag-and-drop boards | `src/features/pipeline/utils/store.ts`, `src/features/kanban/utils/store.ts` |

## Pattern Overview

**Overall:** Feature-sliced Next.js App Router with a clean API boundary.

**Key Characteristics:**
- Server Components (RSC) perform the initial DB query and pass typed props down to `'use client'` feature components
- All mutations go through `/app/api/` REST routes — never from client components directly to the database
- Every write operation calls `logTimeline()` as a side-effect to populate the activity feed
- Domain types are inferred from Drizzle schema (`$inferSelect`/`$inferInsert`) — no separate DTO layer
- Enum value arrays in `src/lib/domain/types.ts` are shared between Zod schemas in API routes and UI option lists

## Layers

**Routing Layer (pages):**
- Purpose: Entry points for each dashboard section; perform server-side DB queries for initial data
- Location: `src/app/dashboard/**/page.tsx`
- Contains: `async function` RSCs importing directly from `drizzle/schema` via `src/lib/db`
- Depends on: `src/lib/db`, `drizzle/schema`, feature components
- Used by: Next.js router

**API Layer:**
- Purpose: All create/update/delete operations; also read endpoints consumed by the CLI
- Location: `src/app/api/**/route.ts`
- Contains: Zod validation → Drizzle query → `logTimeline()` → response envelope helpers
- Depends on: `src/lib/db`, `src/lib/api/`, `src/lib/domain/`, `src/lib/db/timeline.ts`
- Used by: client components (fetch), Claude Code CLI (HTTP)

**Feature Layer:**
- Purpose: Domain-specific UI components
- Location: `src/features/<domain>/components/`
- Contains: `'use client'` interactive components; server-listing components that call DB directly
- Depends on: `src/lib/domain/types.ts`, `src/components/ui/`, Zustand stores where needed
- Used by: page RSCs

**Feature Lib Layer:**
- Purpose: Non-UI domain logic specific to a feature
- Location: `src/features/<domain>/lib/`
- Contains: scrapers, matchers, scoring algorithms (e.g., job-leads scrapers, prioritization)
- Depends on: external packages (Playwright, cheerio), `src/lib/domain/types.ts`
- Used by: API routes, feature components

**Shared Library Layer:**
- Purpose: App-wide utilities
- Location: `src/lib/`
- Contains: DB client, API helpers, domain types, pipeline rules, format/parse utilities
- Depends on: Drizzle, Neon, Zod
- Used by: all other layers

**Schema Layer:**
- Purpose: Single source of truth for database structure and TypeScript types
- Location: `drizzle/schema/` (one file per table, barrel at `drizzle/schema/index.ts`)
- Contains: `pgTable` definitions; enums in `drizzle/schema/enums.ts`
- Depends on: `drizzle-orm/pg-core`
- Used by: `src/lib/db/index.ts` (passed to `drizzle()` as schema), API routes, page RSCs

**UI Primitives Layer:**
- Purpose: shadcn/ui components, shared forms, layout chrome
- Location: `src/components/`
- Contains: `src/components/ui/` (shadcn primitives), `src/components/layout/` (sidebar, header), `src/components/forms/` (controlled form inputs)
- Depends on: Radix UI, Tailwind CSS
- Used by: feature components, page layouts

## Data Flow

### Standard Read (Page Load)

1. User navigates to `/dashboard/companies` — Next.js renders `src/app/dashboard/companies/page.tsx` as RSC
2. Page function queries DB: `db.select().from(companies).where(isNull(companies.archivedAt))` (`src/app/dashboard/companies/page.tsx:14`)
3. Data passed as props to `<CompanyListingPage />` (`src/features/companies/components/company-listing.tsx`)
4. Client component renders table; no client-side fetch needed for initial view

### Standard Write (API Mutation)

1. Client component calls `fetch('/api/companies', { method: 'POST', body })` 
2. `src/app/api/companies/route.ts` — `POST` handler: parse body, Zod validate
3. `db.insert(companies).values(validated).returning()` — Drizzle writes to Neon
4. `logTimeline({ eventType: 'company_added', ... })` — side-effect insert into `timeline_events`
5. Return `created(company)` → `{ success: true, data: company }` with 201 status

### Pipeline Status Transition

1. Drag-and-drop triggers `fetch('/api/applications/[id]/status', { method: 'PATCH', body: { status } })`
2. `src/app/api/applications/[id]/status/route.ts` — fetch current status, call `canTransition(oldStatus, newStatus)` (`src/lib/domain/pipeline.ts`)
3. If invalid: return `validationError('Invalid transition: ...')` (400)
4. If valid: `db.update(applications).set({ status, statusChangedAt })`, then `logTimeline()`
5. Zustand store `moveApplication()` (`src/features/pipeline/utils/store.ts`) updates UI optimistically on drag start

### Job Lead Search Flow (Async)

1. `POST /api/job-leads` → `scrapeJobPage(url)` (Cheerio) → insert `job_leads` row as `scraped`
2. `POST /api/job-leads/[id]/search` → set status `searching`, then fire-and-forget async IIFE:
   - `scrapeConnections(companyName)` — Playwright automation via `getContext()` (`src/features/job-leads/lib/linkedin-browser.ts`)
   - `inferSeniority(title)` per prospect → insert `prospects` rows
   - `matchConnections(jobLeadId, prospects)` — match scraped names to existing `contacts`
   - Insert `prospect_bridges` rows with computed `score`
   - Update `job_leads.status` to `found` (if triage needed) or `ready`
3. `GET /api/job-leads/[id]/recommendations` — builds prioritized list via `buildRecommendations()` (`src/features/job-leads/lib/prioritization.ts`)

**State Management:**
- Server state: Neon Postgres via Drizzle, queried fresh on each RSC render
- Client drag-and-drop state: Zustand (`src/features/pipeline/utils/store.ts`) — optimistic, synced to API on drop
- URL state: `nuqs` for data table filters (search params as state)
- Theme/sidebar: cookie-persisted (`active_theme`, `sidebar_state` cookies read in layouts)

## Key Abstractions

**Response Envelope:**
- Purpose: Consistent API response shape across all routes
- Pattern: `{ success: boolean, data?, error?, meta? }` — factories in `src/lib/api/types.ts`
- Functions: `success()`, `created()`, `paginated()`, `error()`, and error variants in `src/lib/api/errors.ts`

**Timeline Logger:**
- Purpose: Denormalized activity feed entry created on every write
- Pattern: `await logTimeline({ eventType, title, ...entityIds })` called after every DB mutation in API routes
- Location: `src/lib/db/timeline.ts`

**Cursor Pagination:**
- Purpose: Stable pagination using `updatedAt` timestamps (not offset)
- Pattern: `cursor` query param = ISO timestamp of last record's `updatedAt`; next page filters `WHERE updated_at < cursor`
- Helpers: `parseCursor()`, `parseLimit()` in `src/lib/api/filters.ts`

**Domain Types:**
- Purpose: TypeScript types inferred directly from Drizzle schema — single source of truth
- Pattern: `export type Company = typeof companies.$inferSelect` in `src/lib/domain/types.ts`
- Also exports enum value `as const` arrays reused in Zod schemas and UI select options

**Bridge Score:**
- Purpose: Numeric score (0–100) for how valuable a contact-prospect introduction would be
- Formula: `0.4 * seniorityWeight + 0.35 * closenessWeight + 0.25 * recencyWeight`
- Location: `src/features/job-leads/lib/prioritization.ts`

## Entry Points

**Root Page:**
- Location: `src/app/page.tsx`
- Triggers: All traffic to `/`
- Responsibilities: Clerk auth check → redirect to `/dashboard/overview` or `/auth/sign-in`

**Dashboard Layout:**
- Location: `src/app/dashboard/layout.tsx`
- Triggers: All `/dashboard/*` routes
- Responsibilities: Renders sidebar, header, KBar command palette, search overlay

**Clerk Middleware (`src/proxy.ts`):**
- Location: `src/proxy.ts` (used as `middleware.ts` via `next.config.ts` or conventional routing)
- Triggers: All requests matching `/(dashboard.*)`
- Responsibilities: Clerk auth check + single-user email restriction (`steve@bronstein.org`)

**API Routes:**
- Location: `src/app/api/**/route.ts`
- Triggers: HTTP requests (browser fetch or CLI HTTP calls)
- Responsibilities: Validate, mutate, log timeline, return envelope

## Architectural Constraints

- **Auth lock:** Middleware in `src/proxy.ts` restricts `/dashboard` to a single hardcoded email address — the app is single-tenant by design
- **No server actions:** Mutations use REST API routes only — this ensures Claude Code CLI can perform all operations via HTTP without needing the browser
- **DB queries in RSC pages:** Page-level RSCs directly import `drizzle/schema` and call `db.*` — there is no separate repository/service layer between pages and the database
- **Async fire-and-forget:** `src/app/api/job-leads/[id]/search/route.ts` spawns an unawaited IIFE for the Playwright scrape — errors in the async path are caught internally but cannot propagate to the HTTP response
- **Global DB singleton:** `src/lib/db/index.ts` exports a single `db` instance via module-level `neon()` + `drizzle()` — safe for serverless (neon/serverless uses HTTP transport, not connection pooling)
- **Playwright in server runtime:** `src/features/job-leads/lib/linkedin-browser.ts` launches or connects to Chromium from a Next.js API route — requires `BROWSER_CDP_ENDPOINT` or `BROWSER_WS_ENDPOINT` env vars in production (Docker/Vercel); falls back to local Chromium in dev

## Anti-Patterns

### Raw SQL fragments in Drizzle multi-condition WHERE

**What happens:** Multiple `where()` conditions are joined using `sql.join()` with manual `AND` fragments (e.g., `src/app/api/companies/route.ts` lines 61-63) instead of Drizzle's `and()` helper.
**Why it's wrong:** Bypasses type checking and is harder to read; Drizzle's `and(...conditions)` handles the same case cleanly.
**Do this instead:** `import { and } from 'drizzle-orm'; .where(and(...conditions))` — see `src/app/api/metrics/dashboard/route.ts` for correct usage.

### Kanban store uses client-side `localStorage` persistence

**What happens:** `src/features/kanban/utils/store.ts` uses `zustand/middleware` `persist` with `name: 'task-store'` — data lives only in the browser.
**Why it's wrong:** The Kanban board (at `/dashboard/kanban`) is not backed by the database, so tasks added there are not visible via the API and will be lost on browser clear.
**Do this instead:** The domain tasks table (`drizzle/schema/tasks.ts`) should back the Kanban board; mutations should go through `/api/tasks`.

## Error Handling

**Strategy:** Try/catch in every API route handler; never let unhandled exceptions reach Next.js.

**Patterns:**
- Zod validation errors → `validationError(err.issues[0].message)` (400)
- Not found → `notFound('EntityName')` (404)
- Unexpected errors → `serverError(err)` (500) + `console.error('API Error:', err)`
- All helpers in `src/lib/api/errors.ts`

## Cross-Cutting Concerns

**Logging:** `console.error` for unexpected errors in API routes; structured activity logging via `logTimeline()` for all domain events
**Validation:** Zod schemas defined inline in each API route file; enum value arrays sourced from `src/lib/domain/types.ts`
**Authentication:** Clerk (`@clerk/nextjs/server`) — `auth()` in RSC pages, `clerkMiddleware` in `src/proxy.ts`; single-user email lock enforced in middleware

---

*Architecture analysis: 2026-05-12*
