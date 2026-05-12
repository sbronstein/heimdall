# Heimdall — Job Search Command Center

A personal CRM and pipeline tracker for an executive job search targeting VP Data/AI roles at growth-stage companies. Built for dual interaction: web UI and Claude Code CLI.

## Stack

- **Framework**: Next.js 16 (App Router, Server Components by default)
- **Database**: Neon Postgres with Drizzle ORM
- **UI**: shadcn/ui + Tailwind CSS v4 + Recharts
- **Auth**: Clerk
- **Hosting**: Vercel
- **Vector search (Phase 2)**: pgvector on same Neon instance

## Project Structure

```
/app                  → Pages, layouts, API routes (App Router)
/app/api              → REST API routes (all data mutations go here)
/components/ui        → shadcn/ui primitives
/components           → Domain components (company-card, pipeline-board, etc.)
/lib/db               → Drizzle client, queries, helpers
/lib/actions          → Server actions (thin wrappers around db queries)
/drizzle              → Schema definitions, migrations, seed
/docs                 → Architecture reference (schema, API, playbook)
```

## Code Conventions

- TypeScript strict mode, named exports everywhere
- Server Components by default; add `'use client'` only when needed for interactivity
- All data mutations must go through `/app/api/` routes — never client-only state
- This ensures Claude Code can do everything the web UI can via HTTP calls
- Use Drizzle query builder, not raw SQL (except for pgvector queries)
- Prefer `async/await` over `.then()` chains
- Error handling: return `{ success: boolean, data?, error? }` from all API routes
- Use `zod` for request validation on all API routes

## Database

- Neon Postgres, connection via `DATABASE_URL` env var
- Drizzle ORM with `drizzle-kit` for migrations
- Schema defined in `/drizzle/schema/` — one file per table
- UUID primary keys, `created_at`/`updated_at` on every table
- Soft deletes via `archived_at` timestamp (never hard delete during active search)
- JSONB for semi-structured data (compensation details, interview panels, funding info)
- Postgres text arrays for tags

See `@docs/database-schema.md` for full schema with all tables and indexes.

## API Design

- RESTful routes under `/app/api/`
- Standard response envelope: `{ success, data, error, meta }`
- Pagination via cursor (not offset) using `updated_at` timestamps
- Filtering via query params
- All write operations also create a `timeline_events` record

See `@docs/api-conventions.md` for full patterns and examples.

## Key Domain Concepts

- **Companies**: Organizations being tracked (researching, targeting, or applied to)
- **Contacts**: People linked to companies — recruiters, hiring managers, network connections
- **Applications**: A specific role at a specific company progressing through pipeline stages
- **Interactions**: Every communication logged (emails, calls, interviews, intros)
- **Tasks**: To-dos and follow-up reminders linked to any entity
- **Notes**: Research, interview prep, STAR stories, weekly reflections
- **Timeline Events**: Denormalized activity feed for the dashboard
- **Search Metrics**: Weekly snapshots for JSC reporting and trend tracking

## Pipeline Stages

Researching → Applied → Recruiter Screen → Phone Interview → Onsite → Final Round → Offer → Negotiating → Accepted/Rejected/Withdrawn/Ghosted/On Hold

## Commands

```bash
npm run dev           # Start dev server (port 3000)
npm run build         # Production build
npm run db:generate   # Generate Drizzle migration from schema changes
npm run db:migrate    # Run pending migrations
npm run db:push       # Push schema directly (dev only)
npm run db:studio     # Open Drizzle Studio (visual DB browser)
npm run db:seed       # Seed pipeline stages and example data
```

## Environment Variables

Defined in `.env.local` (gitignored):

- `DATABASE_URL` — Neon Postgres connection string
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk auth
- `CLERK_SECRET_KEY` — Clerk auth
- `OPENAI_API_KEY` — For embeddings (Phase 2)

## Testing

- Validate API routes return correct envelope format
- Test pipeline stage transitions (valid moves only)
- Test that all write operations create timeline events

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Heimdall — Job Search Command Center**

A personal CRM and pipeline tracker for an executive job search targeting VP Data/AI roles at growth-stage companies. Built for dual interaction — full-featured web UI **and** Claude Code CLI parity through a REST API surface. Single-user by design (Clerk middleware locks `/dashboard` to `steve@bronstein.org`).

**Core Value:** **The owner can run their entire executive job search from one place — track companies, log interactions, move applications through pipeline stages, and surface the highest-value introduction paths for any role — without leaving the app.** If everything else fails, the pipeline state machine and the timeline activity feed must work: that is the system of record for the search.

### Constraints

- **Tech stack**: Next.js 16 (App Router, RSC) + Neon Postgres + Drizzle ORM + shadcn/ui + Tailwind v4 + Clerk + Recharts — fixed for this project; no framework migrations.
- **Auth**: Clerk only, single-user lock on `steve@bronstein.org`. No multi-tenancy.
- **No server actions**: All mutations must go through REST API routes — CLI parity depends on it.
- **No raw SQL** in app code except for pgvector queries (Phase 2 — not yet active). Use Drizzle query builder.
- **All API routes use Zod** for request validation and return the `{ success, data, error, meta }` envelope.
- **Soft deletes**: never hard-delete during the active search — set `archived_at` instead.
- **Hosting**: Vercel — Playwright/Chromium incompatible with serverless; scraping is local-dev / Docker only.
- **Performance**: 1500+ contacts in the table today; queries that scan the full `contacts` table or do N+1 inserts/updates are already noticeable.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.7.2 - All source code (`src/`, `drizzle/`, scripts)
- Python 3.x - Utility scripts only (`scripts/generate-import-data.py`, `scripts/parse-paste.py`)
## Runtime
- Node.js 22 (pinned in `.nvmrc`)
- npm
- Lockfile: `package-lock.json` present (lockfileVersion 3)
## Frameworks
- Next.js 16.0.10 - Full-stack framework, App Router, Server Components by default
- React 19.2.0 - UI layer
- shadcn/ui (style: "new-york") - Component library via `components.json`; primitives in `src/components/ui/`
- Radix UI primitives - ~20 packages (`@radix-ui/react-*`), all via shadcn/ui
- Tailwind CSS v4 (`tailwindcss: ^4.0.0`) - Utility-first CSS
- `@tailwindcss/postcss` v4 - PostCSS integration (`postcss.config.js`)
- `tailwind-merge` v3 - Class merging (`src/lib/utils.ts`)
- `tailwindcss-animate` + `tw-animate-css` - Animation utilities
- `next-themes` v0.4.6 - Theme switching; active theme stored in cookie, default is "vercel" (`src/components/themes/theme.config.ts`)
- `@tanstack/react-table` v8 - Headless table primitives (`src/lib/data-table.ts`)
- Recharts v2 - Data visualization
- `react-hook-form` v7
- `@hookform/resolvers` v5
- `zod` v4 - Schema validation; used on all API routes
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/modifiers`, `@dnd-kit/utilities` v6-8
- `nuqs` v2 - URL search params state management; adapter in `src/app/layout.tsx`
- `motion` v11 (Framer Motion)
- `playwright` v1.58.2 - Chromium browser automation for LinkedIn scraping (`src/features/job-leads/lib/linkedin-browser.ts`, `src/features/job-leads/lib/scrape-connections.ts`)
- `cheerio` v1.2 - HTML parsing for job page scraping (`src/features/job-leads/lib/scrape-job-page.ts`)
- `date-fns` v4 - Date formatting
- `papaparse` v5 - CSV parsing (LinkedIn import)
- `uuid` v11 - UUID generation
- `zustand` v5 - Client-side state management
- `kbar` v0.1.0-beta.45 - Command palette (`src/components/kbar/`)
- `sonner` v1 - Toast notifications
- `lucide-react` v0.476, `@tabler/icons-react` v3, `@radix-ui/react-icons` v1 - Icon libraries
- Not configured; no jest.config.*, vitest.config.*, or test files detected
- `drizzle-kit` v0.31.9 - Schema migration tooling (`drizzle.config.ts`)
- `husky` v9 + `lint-staged` v15 - Pre-commit hooks
- `eslint` 8.48.0 + `eslint-config-next` v16 + `@typescript-eslint/eslint-plugin` v6
- `prettier` 3.4.2 + `prettier-plugin-tailwindcss` v0.6.11
## Key Dependencies
- `drizzle-orm` v0.45.1 - ORM for all database queries; used throughout `src/lib/db/`, `src/app/api/`
- `@neondatabase/serverless` v1.0.2 - Neon Postgres HTTP driver; initialized in `src/lib/db/index.ts`
- `@clerk/nextjs` v6 - Authentication and session management; middleware in `src/proxy.ts`
- `zod` v4 - Request validation; used in every API route
- `sharp` v0.33.5 - Image optimization (Next.js image processing)
- `nextjs-toploader` v3 - Page load progress indicator
## Configuration
- Configured via `.env.local` (gitignored; `.env.local` file present)
- Template with all variable names documented in `env.example.txt`
- Key variables:
- `tsconfig.json`: strict mode, target es5, path aliases `@/*` → `./src/*` and `~/*` → `./public/*`
- `next.config.ts` - Minimal config; remote image patterns for `img.clerk.com`, `clerk.com`, `api.slingacademy.com`; transpiles `geist`
- `postcss.config.js` - Tailwind v4 PostCSS plugin only
- `drizzle.config.ts` - PostgreSQL dialect, schema at `./drizzle/schema/index.ts`, migrations at `./drizzle/migrations`
## Platform Requirements
- Node.js 22 (`.nvmrc`)
- Dev server runs on port 4000 (`npm run dev` uses `-p 4000 -H 0.0.0.0`)
- LinkedIn scraping requires either: local Chromium install (Playwright), a headed Chrome with CDP (`BROWSER_CDP_ENDPOINT`), or a Playwright remote server (`BROWSER_WS_ENDPOINT`)
- Vercel (inferred from `eslint-config-next`, `@neondatabase/serverless` HTTP driver, App Router patterns)
- Neon Postgres (serverless HTTP driver required for Vercel edge/serverless compatibility)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- kebab-case for all files: `company-form.tsx`, `scrape-job-page.ts`, `pipeline-board.tsx`
- Schema files use kebab-case in `drizzle/schema/`: `job-leads.ts`, `timeline-events.ts`
- API routes follow Next.js convention: `route.ts` in directory-per-endpoint layout
- camelCase for all functions: `scrapeJobPage`, `logTimeline`, `canTransition`, `buildRecommendations`
- Event handlers prefixed with `on`: `onSubmit`, `onDragStart`, `onCardClick`
- Handler callbacks passed as props prefixed with `handle`: `handleCreate`
- Async route handlers named after HTTP verb: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`
- camelCase: `companyId`, `newStatus`, `hasMore`, `searchParams`
- Boolean variables prefixed with `is`/`has`: `isMounted`, `hasMore`, `isOverlay`, `isDragging`
- Constants (enum value arrays) use camelCase with `Values` suffix: `applicationStatusValues`, `companyStageValues`
- PascalCase for types and interfaces: `Company`, `PipelineApplication`, `ScrapedJobData`
- Props interfaces named `[ComponentName]Props`: `PipelineBoardProps`, `ApplicationCardProps`
- Inferred Drizzle types use simple entity names: `Company`, `Contact`, `Application` (defined in `src/lib/domain/types.ts`)
- Insert variants prefixed `New`: `NewCompany`, `NewContact`, `NewApplication`
- Type-only imports use `import type`: `import type { PipelineStage } from '@/lib/domain/types'`
- PascalCase named exports for all React components: `PipelineBoard`, `ApplicationCard`, `JobLeadsPage`
- No default exports for components — Next.js page files (`page.tsx`, `layout.tsx`) are the only exception
- Custom hooks prefixed `use`: `usePipelineStore`, `useDataTable`, `useDebounce`
## Code Style
- Single quotes for strings: `'use client'`, `import ... from '...'`
- No trailing commas
- 2-space indentation
- No semicolons omitted (semi: true)
- Arrow functions always parenthesized: `(s) => s.applications`
- LF line endings
- Tailwind class sorting via `prettier-plugin-tailwindcss`
- `@typescript-eslint/no-unused-vars` — warn (not error)
- `no-console` — warn (allows `console.error` in API error paths)
- `react-hooks/exhaustive-deps` — warn
- `import/no-unresolved` — off (path aliases handled by TS)
- Strict mode enabled (`"strict": true` in `tsconfig.json`)
- `satisfies` operator used to validate response shapes: `{ success: true, data } satisfies ApiResponse<T>`
- Type assertions used for Drizzle enum arrays: `statuses as (typeof applicationStatusValues)[number][]`
- Non-null assertion (`!`) used for env vars: `process.env.DATABASE_URL!`
## Import Organization
- `@/*` → `./src/*` (primary alias for all src imports)
- `~/*` → `./public/*` (public assets)
- Drizzle schema imported as relative paths from API routes: `'../../../../drizzle/schema'`
- Use `import type` for types that are not needed at runtime:
## Error Handling
- `notFound(entity)` → 404 `{ success: false, error: "[entity] not found" }`
- `validationError(message)` → 400 `{ success: false, error: message }`
- `serverError(err)` → 500, logs `console.error('API Error:', err)`
- `success(data)` → 200 `{ success: true, data }`
- `created(data)` → 201 `{ success: true, data }`
- `paginated(data, meta)` → 200 `{ success: true, data, meta }`
## Logging
- Server errors logged in `serverError()` in `src/lib/api/errors.ts` — centralized
- Scrape/search failures logged inline with `console.error('Job page scrape failed:', err)`
- `no-console` ESLint rule is `warn` — `console.log` is discouraged but `console.error` is accepted
- No structured logging or log levels beyond error
## Comments
- Section headers in long files: `// Core info`, `// Verify company exists`
- Non-obvious algorithmic decisions: `// Overall contact score = max of their bridge scores`
- Intentional suppressions: `// ignore malformed JSON-LD`, `// Leave browser open for now (debug mode)`
- TODO/workaround notes are present but rare
## Function Design
- Route handlers receive `(request: Request, { params })` where params is `Promise<{ id: string }>`
- Utility functions use named parameters or options objects for multiple args
- Component props defined as `interface [Name]Props` and destructured in the signature
- API routes always return a `Response` via the helper functions in `src/lib/api/types.ts` and `src/lib/api/errors.ts`
- Business logic returns typed values or throws — never returns error objects
- Async functions always use `async/await`, never `.then()` chains
## Module Design
- Named exports everywhere: `export function`, `export const`, `export type`
- Default exports only for Next.js page/layout files (`page.tsx`, `layout.tsx`) and middleware
- Used selectively at `drizzle/schema/index.ts` (re-exports all schema tables)
- Feature-level barrel files exist only for data-table components: `src/features/tasks/components/task-table/index.tsx`
- No `src/features/*/index.ts` barrel pattern
- `'use client'` directive placed at the very top of files requiring interactivity
- Server Components (no directive) used for all page-level data fetching
- Zustand stores (`src/features/pipeline/utils/store.ts`) used for client-side state shared across components
- No React Context for global state — Zustand is the pattern
## Zod Schema Conventions
- Required fields: `z.string().min(1)` with max bounds
- Optional nullable fields: `.optional().nullable()`
- Enum fields use `z.enum(domainValues)` referencing arrays from `src/lib/domain/types.ts`
- Date fields accept both date strings and datetime strings: `z.union([z.string().date(), z.string().datetime()])`
## Drizzle ORM Conventions
- Query builder only — no raw SQL except for `sql` template tag in complex `WHERE` conditions
- Column names in snake_case in DB, camelCase in TypeScript (Drizzle maps automatically)
- Multi-condition WHERE built by accumulating into `conditions[]` array then `sql.join`:
- Soft deletes via `archivedAt` timestamp; never hard delete
- `updatedAt: new Date()` always set manually on updates (Drizzle does not auto-update)
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```text
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
- Server Components (RSC) perform the initial DB query and pass typed props down to `'use client'` feature components
- All mutations go through `/app/api/` REST routes — never from client components directly to the database
- Every write operation calls `logTimeline()` as a side-effect to populate the activity feed
- Domain types are inferred from Drizzle schema (`$inferSelect`/`$inferInsert`) — no separate DTO layer
- Enum value arrays in `src/lib/domain/types.ts` are shared between Zod schemas in API routes and UI option lists
## Layers
- Purpose: Entry points for each dashboard section; perform server-side DB queries for initial data
- Location: `src/app/dashboard/**/page.tsx`
- Contains: `async function` RSCs importing directly from `drizzle/schema` via `src/lib/db`
- Depends on: `src/lib/db`, `drizzle/schema`, feature components
- Used by: Next.js router
- Purpose: All create/update/delete operations; also read endpoints consumed by the CLI
- Location: `src/app/api/**/route.ts`
- Contains: Zod validation → Drizzle query → `logTimeline()` → response envelope helpers
- Depends on: `src/lib/db`, `src/lib/api/`, `src/lib/domain/`, `src/lib/db/timeline.ts`
- Used by: client components (fetch), Claude Code CLI (HTTP)
- Purpose: Domain-specific UI components
- Location: `src/features/<domain>/components/`
- Contains: `'use client'` interactive components; server-listing components that call DB directly
- Depends on: `src/lib/domain/types.ts`, `src/components/ui/`, Zustand stores where needed
- Used by: page RSCs
- Purpose: Non-UI domain logic specific to a feature
- Location: `src/features/<domain>/lib/`
- Contains: scrapers, matchers, scoring algorithms (e.g., job-leads scrapers, prioritization)
- Depends on: external packages (Playwright, cheerio), `src/lib/domain/types.ts`
- Used by: API routes, feature components
- Purpose: App-wide utilities
- Location: `src/lib/`
- Contains: DB client, API helpers, domain types, pipeline rules, format/parse utilities
- Depends on: Drizzle, Neon, Zod
- Used by: all other layers
- Purpose: Single source of truth for database structure and TypeScript types
- Location: `drizzle/schema/` (one file per table, barrel at `drizzle/schema/index.ts`)
- Contains: `pgTable` definitions; enums in `drizzle/schema/enums.ts`
- Depends on: `drizzle-orm/pg-core`
- Used by: `src/lib/db/index.ts` (passed to `drizzle()` as schema), API routes, page RSCs
- Purpose: shadcn/ui components, shared forms, layout chrome
- Location: `src/components/`
- Contains: `src/components/ui/` (shadcn primitives), `src/components/layout/` (sidebar, header), `src/components/forms/` (controlled form inputs)
- Depends on: Radix UI, Tailwind CSS
- Used by: feature components, page layouts
## Data Flow
### Standard Read (Page Load)
### Standard Write (API Mutation)
### Pipeline Status Transition
### Job Lead Search Flow (Async)
- Server state: Neon Postgres via Drizzle, queried fresh on each RSC render
- Client drag-and-drop state: Zustand (`src/features/pipeline/utils/store.ts`) — optimistic, synced to API on drop
- URL state: `nuqs` for data table filters (search params as state)
- Theme/sidebar: cookie-persisted (`active_theme`, `sidebar_state` cookies read in layouts)
## Key Abstractions
- Purpose: Consistent API response shape across all routes
- Pattern: `{ success: boolean, data?, error?, meta? }` — factories in `src/lib/api/types.ts`
- Functions: `success()`, `created()`, `paginated()`, `error()`, and error variants in `src/lib/api/errors.ts`
- Purpose: Denormalized activity feed entry created on every write
- Pattern: `await logTimeline({ eventType, title, ...entityIds })` called after every DB mutation in API routes
- Location: `src/lib/db/timeline.ts`
- Purpose: Stable pagination using `updatedAt` timestamps (not offset)
- Pattern: `cursor` query param = ISO timestamp of last record's `updatedAt`; next page filters `WHERE updated_at < cursor`
- Helpers: `parseCursor()`, `parseLimit()` in `src/lib/api/filters.ts`
- Purpose: TypeScript types inferred directly from Drizzle schema — single source of truth
- Pattern: `export type Company = typeof companies.$inferSelect` in `src/lib/domain/types.ts`
- Also exports enum value `as const` arrays reused in Zod schemas and UI select options
- Purpose: Numeric score (0–100) for how valuable a contact-prospect introduction would be
- Formula: `0.4 * seniorityWeight + 0.35 * closenessWeight + 0.25 * recencyWeight`
- Location: `src/features/job-leads/lib/prioritization.ts`
## Entry Points
- Location: `src/app/page.tsx`
- Triggers: All traffic to `/`
- Responsibilities: Clerk auth check → redirect to `/dashboard/overview` or `/auth/sign-in`
- Location: `src/app/dashboard/layout.tsx`
- Triggers: All `/dashboard/*` routes
- Responsibilities: Renders sidebar, header, KBar command palette, search overlay
- Location: `src/proxy.ts` (used as `middleware.ts` via `next.config.ts` or conventional routing)
- Triggers: All requests matching `/(dashboard.*)`
- Responsibilities: Clerk auth check + single-user email restriction (`steve@bronstein.org`)
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
### Kanban store uses client-side `localStorage` persistence
## Error Handling
- Zod validation errors → `validationError(err.issues[0].message)` (400)
- Not found → `notFound('EntityName')` (404)
- Unexpected errors → `serverError(err)` (500) + `console.error('API Error:', err)`
- All helpers in `src/lib/api/errors.ts`
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
