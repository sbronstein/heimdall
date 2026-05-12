# Codebase Structure

**Analysis Date:** 2026-05-12

## Directory Layout

```
heimdall/
├── src/
│   ├── app/                      # Next.js App Router root
│   │   ├── layout.tsx            # Root HTML shell (theme, providers)
│   │   ├── page.tsx              # / → redirect to /dashboard/overview
│   │   ├── proxy.ts              # Clerk middleware (auth + email lock)
│   │   ├── api/                  # REST API routes (all mutations here)
│   │   │   ├── applications/     # GET, POST + [id]/ PATCH/DELETE + [id]/status/ PATCH
│   │   │   ├── companies/        # GET, POST + [id]/ + [id]/applications/ + [id]/contacts/
│   │   │   ├── contacts/         # GET, POST + [id]/ + [id]/interactions/ + import/ + connections/
│   │   │   ├── interactions/     # GET, POST + [id]/
│   │   │   ├── job-leads/        # GET, POST + [id]/ + [id]/search/ + [id]/recommendations/ + [id]/status/
│   │   │   ├── metrics/          # GET + dashboard/
│   │   │   ├── notes/            # GET, POST + [id]/
│   │   │   ├── pipeline-stages/  # GET
│   │   │   ├── recruiters/       # GET, POST + [id]/
│   │   │   ├── search/           # GET (cross-entity full-text search)
│   │   │   ├── tasks/            # GET, POST + [id]/
│   │   │   └── timeline/         # GET
│   │   ├── auth/                 # Clerk sign-in/sign-up pages
│   │   └── dashboard/            # All authenticated pages
│   │       ├── layout.tsx        # Sidebar + header shell
│   │       ├── overview/         # Dashboard home (parallel routes for charts)
│   │       ├── pipeline/         # Kanban pipeline board
│   │       ├── companies/        # Company list + [companyId]/ detail
│   │       ├── contacts/         # Contact list + [contactId]/ detail + triage/
│   │       ├── job-leads/        # Job lead list + [id]/ detail + [id]/triage/
│   │       ├── networking/       # Networking outreach dashboard
│   │       ├── tasks/            # Tasks list
│   │       ├── notes/            # Notes list + [noteId]/
│   │       ├── metrics/          # Weekly metrics tracker
│   │       ├── kanban/           # Generic kanban (client-only, not DB-backed)
│   │       └── profile/          # Clerk profile page
│   ├── features/                 # Domain feature slices
│   │   ├── companies/components/ # CompanyTable, company-listing RSC
│   │   ├── contacts/
│   │   │   ├── components/       # ContactTable, triage, linkedin-import UI
│   │   │   └── lib/              # closeness-colors.ts
│   │   ├── job-leads/
│   │   │   ├── components/       # JobLeadDetail, RecommendationList, SearchProgress, TriageTrigger
│   │   │   └── lib/              # scrape-job-page.ts, scrape-connections.ts, linkedin-browser.ts,
│   │   │                         # match-connections.ts, prioritization.ts, seniority.ts
│   │   ├── kanban/
│   │   │   ├── components/       # KanbanBoard, BoardColumn, TaskCard
│   │   │   └── utils/store.ts    # Zustand store (localStorage-persisted, not DB-backed)
│   │   ├── metrics/components/   # MetricsPage, MetricsTrends, WeeklySnapshotForm
│   │   ├── networking/components/# NetworkingDashboard, OutreachList, ConnectionFinder
│   │   ├── notes/components/     # NoteForm, NoteTable
│   │   ├── overview/components/  # KpiCards, AreaGraph, BarGraph, PieGraph, ActivityTimeline
│   │   ├── pipeline/
│   │   │   ├── components/       # PipelineBoard, PipelineColumn, ApplicationCard, NewApplicationDialog
│   │   │   └── utils/store.ts    # Zustand store for drag-and-drop optimistic updates
│   │   ├── recruiters/components/# RecruiterListing
│   │   ├── search/components/    # SearchCommand (KBar-triggered overlay)
│   │   └── tasks/components/     # TaskTable, TaskForm
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts          # Drizzle client singleton (neon/serverless)
│   │   │   └── timeline.ts       # logTimeline() — side-effect for every write
│   │   ├── api/
│   │   │   ├── types.ts          # Response envelope helpers: success(), created(), paginated(), error()
│   │   │   ├── errors.ts         # notFound(), validationError(), serverError()
│   │   │   └── filters.ts        # parseArrayParam(), parseCursor(), parseLimit()
│   │   ├── domain/
│   │   │   ├── types.ts          # Drizzle-inferred TS types + all enum value arrays
│   │   │   └── pipeline.ts       # canTransition(), isTerminalState(), validTransitions map
│   │   ├── utils.ts              # cn() (clsx/tailwind-merge), misc helpers
│   │   ├── format.ts             # Date/string formatting utilities
│   │   └── parsers.ts            # URL param parsers
│   ├── components/
│   │   ├── ui/                   # shadcn/ui primitives (button, card, dialog, sidebar, etc.)
│   │   ├── layout/               # AppSidebar, Header, PageContainer, InfoSidebar
│   │   ├── forms/                # Controlled form inputs (FormInput, FormSelect, FormDatePicker, etc.)
│   │   ├── kbar/                 # KBar command palette wrapper
│   │   ├── modal/                # Modal provider
│   │   └── themes/               # ThemeProvider, font config, theme config
│   ├── hooks/                    # Custom React hooks
│   │   ├── use-breadcrumbs.tsx
│   │   ├── use-data-table.ts     # TanStack Table integration
│   │   ├── use-debounce.tsx
│   │   ├── use-media-query.ts
│   │   ├── use-mobile.tsx
│   │   ├── use-nav.ts            # Navigation item filtering
│   │   └── use-multistep-form.tsx
│   ├── config/
│   │   ├── nav-config.ts         # Sidebar navigation items definition
│   │   ├── data-table.ts         # Data table configuration helpers
│   │   └── infoconfig.ts         # Info sidebar configuration
│   ├── constants/
│   │   ├── data.ts               # Static data constants
│   │   └── mock-api.ts           # Mock API data (dev use)
│   ├── types/
│   │   ├── index.ts              # NavItem, FooterItem, SidebarNavItem types
│   │   ├── base-form.ts          # Base form types
│   │   └── data-table.ts         # Data table column/filter types
│   └── styles/
│       ├── globals.css           # Tailwind CSS v4 base styles
│       └── themes/               # Custom theme CSS variables
├── drizzle/
│   ├── schema/                   # One file per table + barrel index
│   │   ├── index.ts              # Re-exports all tables
│   │   ├── enums.ts              # All pgEnum definitions
│   │   ├── companies.ts
│   │   ├── contacts.ts
│   │   ├── applications.ts
│   │   ├── interactions.ts
│   │   ├── tasks.ts
│   │   ├── notes.ts
│   │   ├── pipeline-stages.ts
│   │   ├── timeline-events.ts
│   │   ├── recruiters.ts
│   │   ├── search-metrics.ts
│   │   └── job-leads.ts          # Also contains prospects + prospect_bridges tables
│   └── migrations/               # Drizzle-kit generated SQL migrations
├── docs/                         # Architecture reference docs
│   ├── database-schema.md
│   ├── api-conventions.md
│   └── job-search-playbook.md
├── scripts/                      # One-off utility scripts
├── __CLEANUP__/                  # Removed/archived code (clerk, kanban, sentry variants)
├── public/                       # Static assets
├── drizzle.config.ts             # Drizzle Kit config (schema path, migrations dir)
├── next.config.ts                # Next.js config
├── tsconfig.json                 # TypeScript (strict mode, path alias @/ → ./src/)
├── .prettierrc                   # Prettier config
├── .eslintrc.json                # ESLint config
└── CLAUDE.md                     # Project conventions for Claude Code
```

## Directory Purposes

**`src/app/api/`:**
- Purpose: All REST API handlers — the only place data mutations occur
- Contains: `route.ts` files with named `GET`, `POST`, `PATCH`, `DELETE` exports
- Key pattern: Every handler imports `db` from `@/lib/db`, validates with Zod, calls `logTimeline()`, returns response envelope

**`src/features/`:**
- Purpose: Domain feature slices; co-locates components and feature-specific utilities
- Contains: `components/` (UI) and optionally `lib/` (business logic, scrapers)
- Key pattern: Listing components are often Server Components that query DB directly; interactive components are `'use client'`

**`src/lib/`:**
- Purpose: App-wide shared utilities with no feature coupling
- Contains: DB client, API response helpers, domain type definitions, pipeline rules
- Key pattern: `src/lib/domain/types.ts` is the central source for all TypeScript entity types and enum value arrays

**`drizzle/schema/`:**
- Purpose: Postgres schema definitions — single source of truth for table structure and TS types
- Contains: One `.ts` file per logical entity (note: `job-leads.ts` contains three tables: `jobLeads`, `prospects`, `prospectBridges`)
- Key pattern: `drizzle/schema/index.ts` barrel-exports everything; API routes import from `../../../../drizzle/schema`

**`src/features/job-leads/lib/`:**
- Purpose: LinkedIn automation and intro-recommendation algorithms
- Contains: Playwright browser management, job page scraper (Cheerio), connection scraper, seniority inference, bridge score computation
- Key files: `linkedin-browser.ts`, `scrape-connections.ts`, `scrape-job-page.ts`, `prioritization.ts`, `seniority.ts`, `match-connections.ts`

## Key File Locations

**Entry Points:**
- `src/app/page.tsx`: Root redirect (auth check → dashboard)
- `src/app/layout.tsx`: Root HTML layout with theme and providers
- `src/app/dashboard/layout.tsx`: Dashboard shell (sidebar, header, KBar)
- `src/proxy.ts`: Clerk auth middleware (file is the middleware, not named `middleware.ts`)

**Configuration:**
- `drizzle.config.ts`: Drizzle Kit migration config
- `src/config/nav-config.ts`: Sidebar nav items
- `tsconfig.json`: `@/` path alias pointing to `./src/`
- `CLAUDE.md`: Project conventions and commands

**Core Logic:**
- `src/lib/db/index.ts`: Database client (import `db` from here everywhere)
- `src/lib/db/timeline.ts`: `logTimeline()` — call after every write
- `src/lib/api/types.ts`: Response envelope factories
- `src/lib/api/errors.ts`: Error response factories
- `src/lib/domain/types.ts`: All entity types and enum value arrays
- `src/lib/domain/pipeline.ts`: `canTransition()` and `isTerminalState()`
- `drizzle/schema/index.ts`: Barrel export for all tables — import tables from here

**Feature-Specific Logic:**
- `src/features/job-leads/lib/scrape-job-page.ts`: Cheerio scraper for LinkedIn job pages
- `src/features/job-leads/lib/scrape-connections.ts`: Playwright scraper for LinkedIn employee connections
- `src/features/job-leads/lib/linkedin-browser.ts`: Playwright browser context management (CDP/WS/local)
- `src/features/job-leads/lib/prioritization.ts`: `buildRecommendations()` and `computeBridgeScore()`
- `src/features/pipeline/utils/store.ts`: Zustand store for pipeline drag-and-drop

## Naming Conventions

**Files:**
- Kebab-case for all files: `company-listing.tsx`, `scrape-job-page.ts`
- API routes always named `route.ts`
- Page files always named `page.tsx`
- Layout files always named `layout.tsx`
- Loading/error states named `loading.tsx`, `error.tsx`, `default.tsx`

**Directories:**
- Feature directories: kebab-case singular noun — `job-leads/`, `pipeline/`, `networking/`
- Parallel routes (overview page): `@area_stats/`, `@bar_stats/`, `@pie_stats/`, `@sales/`

**Components:**
- React component functions: PascalCase named exports — `export function PipelineViewPage()`
- Page-level default exports: PascalCase — `export default function PipelinePage()`

**API route segment patterns:**
- Collection: `/api/[entity]/route.ts`
- Single item: `/api/[entity]/[id]/route.ts`
- Sub-resource: `/api/[entity]/[id]/[sub-resource]/route.ts`
- Actions (non-CRUD): `/api/[entity]/[id]/[action]/route.ts` (e.g., `search/`, `status/`, `recommendations/`)

## Where to Add New Code

**New domain entity (table + API + UI):**
1. Schema: `drizzle/schema/<entity>.ts` → re-export in `drizzle/schema/index.ts`
2. Run `npm run db:generate && npm run db:migrate`
3. Types: Add inferred types and enum arrays to `src/lib/domain/types.ts`
4. API routes: `src/app/api/<entity>/route.ts` (collection) + `src/app/api/<entity>/[id]/route.ts` (single)
5. Feature components: `src/features/<entity>/components/`
6. Page: `src/app/dashboard/<entity>/page.tsx`
7. Nav item: `src/config/nav-config.ts`

**New API endpoint for an existing entity:**
- Collection-level: `src/app/api/<entity>/route.ts` (add `GET`/`POST`)
- Item-level: `src/app/api/<entity>/[id]/route.ts` (add `PATCH`/`DELETE`)
- Action endpoint: `src/app/api/<entity>/[id]/<action>/route.ts`
- Always: validate with Zod, call `logTimeline()` after writes, return via helpers in `src/lib/api/types.ts`

**New feature component:**
- Interactive: `src/features/<domain>/components/<name>.tsx` with `'use client'` at top
- Server listing (fetches own data): `src/features/<domain>/components/<name>-listing.tsx` (no directive, async function)

**New utility/shared logic:**
- App-wide: `src/lib/utils.ts` or a new file in `src/lib/`
- Domain-specific non-UI logic: `src/features/<domain>/lib/<name>.ts`
- Enum value arrays and types: `src/lib/domain/types.ts`

**New page:**
- Create `src/app/dashboard/<section>/page.tsx`
- Query DB directly in the RSC function
- Wrap in `<PageContainer>` from `@/components/layout/page-container`
- Add to sidebar nav: `src/config/nav-config.ts`

**New schema table:**
- Add `drizzle/schema/<table>.ts`
- Add export to `drizzle/schema/index.ts`
- Add Drizzle-inferred types to `src/lib/domain/types.ts`

## Special Directories

**`__CLEANUP__/`:**
- Purpose: Archived/removed code variants (Clerk setup alternatives, Kanban variations, Sentry config)
- Generated: No
- Committed: Yes (historical reference)

**`.planning/`:**
- Purpose: GSD planning documents (codebase maps, phase plans)
- Generated: Yes (by GSD tools)
- Committed: Yes

**`drizzle/migrations/`:**
- Purpose: SQL migration files generated by `drizzle-kit`
- Generated: Yes (`npm run db:generate`)
- Committed: Yes

**`.next/`:**
- Purpose: Next.js build output
- Generated: Yes
- Committed: No (`.gitignore`)

---

*Structure analysis: 2026-05-12*
