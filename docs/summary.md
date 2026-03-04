# Heimdall — Iterative Buildout Plan

## Context

Heimdall is a personal CRM and pipeline tracker for a VP Data/AI job search. Built on Next.js 16 (App Router), Neon Postgres with Drizzle ORM, shadcn/ui, Tailwind v4, and Clerk auth.

**Target state**: Companies, contacts, applications, interactions, tasks, notes — all with CRUD, data tables, forms, a real pipeline kanban board, activity timeline dashboard, cross-entity search, and weekly metrics.

---

## Progress Summary

All files for Phases 1–7 have been **created** (118 files, 22k+ lines) and the backend has been **verified end-to-end**.

### What's done
- Drizzle schema (10 tables, 13 enums) migrated to Neon Postgres
- All API routes created (companies, contacts, applications, interactions, tasks, notes, metrics, recruiters, pipeline stages, timeline, search)
- All feature components created (listings, tables, forms, detail pages, pipeline board, dashboard widgets, search command)
- API helpers (`types.ts`, `errors.ts`, `filters.ts`), timeline logger, pipeline transition validation, domain types
- Nav config updated with Heimdall domain routes
- Domain icons added
- Pipeline seed script created
- `DataTable` supports `onRowClick` for row-click navigation
- Sentry removed for lighter dev footprint
- Dev server configured on port 4000

### Verified (2026-03-04)
- [x] `npm run build` — passes with zero TypeScript errors
- [x] `npm run db:seed` — 13 pipeline stages populated
- [x] All 11 API routes return correct envelope format (`{ success, data, meta }`)
- [x] CRUD flow tested: create company → create application → transition status → timeline events logged
- [x] Pipeline transition validation: valid moves succeed, invalid moves rejected with error message
- [x] Search API: cross-entity ILIKE search returns matching companies/contacts/applications/notes
- [x] Dashboard metrics API: returns aggregated stats (activeApplications, companiesTracked, etc.)
- [x] Timeline events: every write operation creates timeline entries

### Build fixes applied
- Zod 4 compatibility: `z.record(z.unknown())` → `z.record(z.string(), z.unknown())` (5 files)
- Zod 4 compatibility: `err.errors[0].message` → `err.issues[0].message` (16 API routes)
- `MetricSnapshot` type: `weekStarting: string` → `string | Date` to match Drizzle output
- `ApiResponse.meta.cursor` type: added `| null` to match paginated() usage
- `PRIORITY_OPTIONS`: removed emoji string `icon` (type expects SVG component)
- Seed script: `dotenv/config` → `config({ path: '.env.local' })`
- Date fields: `z.string().datetime()` → `z.union([z.string().date(), z.string().datetime()])` for CLI-friendly input (accepts `2026-03-10` or `2026-03-10T00:00:00Z`)

### Additional verifications (2026-03-04)
- [x] Dashboard overview already wired to real data (all parallel slots use Drizzle queries)
- [x] Cross-entity linking: company→contacts, company→applications, contact→interactions all working
- [x] Interaction auto-updates: creating interaction sets contact.lastContactDate + nextFollowUpDate
- [x] Task completion: sets status=done, completedAt=now(), logs timeline event
- [x] Dashboard metrics: returns real counts (activeApplications, companiesTracked, pipelineByStage, etc.)

### Component audit (2026-03-04)
- [x] Pipeline board: drag-and-drop with optimistic updates, client+server validation, revert on failure
- [x] Company components: listing, table, form, detail page — all clean
- [x] Contact components: listing, table, form (now with nextFollowUpDate date picker), detail page — all clean
- [x] Task components: listing, table with checkbox toggle, form with entity linking — all clean
- [x] Note components: listing, table, form, detail page — all clean
- [x] Search command (Cmd+K): debounced cross-entity search with abort controller — clean
- [x] Missing planned files (entity-linker.tsx, task-quick-add.tsx) confirmed not imported anywhere — non-blocking

### What still needs verification
- [ ] Visual testing in browser (requires Clerk auth session — all pages behind auth middleware)

---

## Phase 1: Foundation — API Layer, Navigation, Seed Data ✅

**Outcome**: Sidebar shows Heimdall nav, API helpers ready, pipeline stages seeded.

### Create
| File | Purpose |
|------|---------|
| `src/lib/api/types.ts` | `ApiResponse<T>` envelope type + `success()`, `error()`, `paginated()` helpers |
| `src/lib/api/errors.ts` | `notFound()`, `validationError()`, `serverError()` factory functions |
| `src/lib/api/filters.ts` | `parseArrayParam()`, `parseCursor()`, `parseLimit()` query param utilities |
| `src/lib/db/timeline.ts` | `logTimeline()` helper — inserts timeline_events, used by every write |
| `src/lib/domain/pipeline.ts` | `validTransitions` map + `canTransition(from, to)` |
| `src/lib/domain/types.ts` | Drizzle inferred types (`Company`, `NewCompany`, etc.) + enum value arrays |
| `drizzle/seed.ts` | Insert 13 pipeline stages (idempotent with ON CONFLICT DO NOTHING) |
| `src/app/dashboard/companies/page.tsx` | Placeholder page |
| `src/app/dashboard/pipeline/page.tsx` | Placeholder page |
| `src/app/dashboard/contacts/page.tsx` | Placeholder page |
| `src/app/dashboard/tasks/page.tsx` | Placeholder page |
| `src/app/dashboard/notes/page.tsx` | Placeholder page |

### Modify
| File | Change |
|------|--------|
| `src/config/nav-config.ts` | Replace template nav with: Dashboard, Companies, Pipeline, Contacts, Tasks, Notes, Account |
| `src/components/icons.tsx` | Add domain icons: building, checklist, addressBook, notebook, timeline |
| `package.json` | Add `"db:seed": "npx tsx drizzle/seed.ts"` |

### Key patterns
- `ApiResponse<T>` matches `docs/api-conventions.md` envelope exactly
- `logTimeline()` accepts optional entity IDs (companyId, contactId, applicationId, etc.)
- Pipeline transitions: terminal states (accepted/rejected/withdrawn/ghosted) cannot transition
- Inferred types use `typeof companies.$inferSelect` to stay in sync with schema

### Verify
- `npm run dev` — sidebar shows new nav items, placeholders render
- `npm run db:seed` — 13 rows in `pipeline_stages` (check via `db:studio`)

---

## Phase 2: Companies — CRUD, Data Table, Detail View ✅ (files created, needs testing)

**Outcome**: Full company tracker with listing, filtering, create/edit, detail page.

### Create
| File | Purpose |
|------|---------|
| `src/app/api/companies/route.ts` | GET (list, cursor pagination, filtering) + POST (create, zod, timeline) |
| `src/app/api/companies/[id]/route.ts` | GET + PUT + DELETE (soft archive via `archived_at`) |
| `src/app/api/companies/[id]/contacts/route.ts` | GET contacts for company |
| `src/app/api/companies/[id]/applications/route.ts` | GET applications for company |
| `src/features/companies/components/company-listing.tsx` | Server component — fetches data, passes to table |
| `src/features/companies/components/company-table/index.tsx` | Client DataTable + `useDataTable` wrapper |
| `src/features/companies/components/company-table/columns.tsx` | Name, Priority (faceted), Stage (faceted), Industry, Location, Status, Actions |
| `src/features/companies/components/company-table/options.tsx` | Filter options derived from schema enums |
| `src/features/companies/components/company-table/cell-action.tsx` | View, Edit, Archive row actions |
| `src/features/companies/components/company-form.tsx` | Create/edit with collapsible sections (Basic, Profile, Assessment, Notes) |
| `src/features/companies/components/company-detail-page.tsx` | Tabbed detail: Overview, Contacts, Applications, Notes, Timeline |
| `src/app/dashboard/companies/[companyId]/page.tsx` | Detail route |

### Modify
- `src/app/dashboard/companies/page.tsx` — render listing instead of placeholder

### Reuse
- `src/components/ui/table/data-table.tsx` + full table system (toolbar, filters, pagination)
- `src/hooks/use-data-table.ts` — URL-synced state via nuqs
- `src/components/forms/` — FormInput, FormSelect, FormTextarea
- `src/components/layout/page-container.tsx` — page wrapper
- Pattern: `src/features/products/` — exact same listing/table/form architecture

### Key details
- Server Component fetches via Drizzle directly for reads; API routes for mutations + CLI access
- Priority badges: dream=emerald, strong=blue, interested=violet, exploring=gray, backburner=red
- Tags stored as comma-separated input → Postgres text array on save
- `updated_at` must be explicitly set on every update

### Verify
- Create company via UI → appears in table
- Filter by priority → faceted filter works
- `curl -X POST localhost:3000/api/companies -d '{"name":"Acme","priority":"strong"}'` → 201
- Check `timeline_events` → company_added event exists

---

## Phase 3: Pipeline — Kanban Board, Status Transitions ✅ (files created, needs testing)

**Outcome**: Real pipeline kanban with drag-and-drop status changes, validated transitions.

### Create
| File | Purpose |
|------|---------|
| `src/app/api/applications/route.ts` | GET (list, filters) + POST (create, validate company exists) |
| `src/app/api/applications/[id]/route.ts` | GET + PUT + DELETE |
| `src/app/api/applications/[id]/status/route.ts` | PATCH — validate transition via `canTransition()`, log timeline |
| `src/app/api/pipeline-stages/route.ts` | GET stages (read-only) |
| `src/features/pipeline/components/pipeline-view-page.tsx` | Fetches stages + applications, renders board |
| `src/features/pipeline/components/pipeline-board.tsx` | Adapted from kanban — columns from DB, cards are applications |
| `src/features/pipeline/components/pipeline-column.tsx` | Stage header with color + count, terminal columns muted |
| `src/features/pipeline/components/application-card.tsx` | Company name, role, excitement, days-in-stage badge |
| `src/features/pipeline/components/new-application-dialog.tsx` | Company picker + role details |
| `src/features/pipeline/components/application-detail-sheet.tsx` | Sheet slide-out with full application data |
| `src/features/pipeline/utils/store.ts` | Zustand store for optimistic drag updates |

### Modify
- `src/app/dashboard/pipeline/page.tsx` — render PipelineViewPage

### Reuse
- `src/features/kanban/components/kanban-board.tsx` — DndContext, SortableContext, DragOverlay architecture
- `src/features/kanban/utils/store.ts` — Zustand persist pattern
- `@dnd-kit/core`, `@dnd-kit/sortable` — already installed
- `sonner` — toast on invalid transitions
- `src/components/ui/sheet.tsx` — for detail slide-out

### Key details
- Columns are NOT reorderable — pipeline has a fixed sequence from `displayOrder`
- Invalid drops: revert card position + show toast error message
- Days-in-stage counter: orange if >7 days, red if >14 days
- Terminal columns have muted/dimmed styling
- `on_hold` can transition back to active stages (unlike true terminal states)

### Verify
- 13 columns render with correct names and colors
- Drag Researching → Applied → succeeds
- Drag Applied → Offer → rejected with toast
- `curl -X PATCH .../applications/{id}/status -d '{"status":"phone_interview"}'` → works
- `timeline_events` has status change entries with `{from, to}` metadata

---

## Phase 4: Contacts & Interactions — Relationship Tracking ✅ (files created, needs testing)

**Outcome**: Contact directory with warmth tracking, interaction logging, follow-up reminders.

### Create
| File | Purpose |
|------|---------|
| `src/app/api/contacts/route.ts` | GET + POST |
| `src/app/api/contacts/[id]/route.ts` | GET + PUT + DELETE |
| `src/app/api/contacts/[id]/interactions/route.ts` | GET interactions for contact |
| `src/app/api/interactions/route.ts` | GET + POST |
| `src/app/api/interactions/[id]/route.ts` | GET + PUT + DELETE |
| `src/features/contacts/components/contact-listing.tsx` | Server listing component |
| `src/features/contacts/components/contact-table/{index,columns,options,cell-action}.tsx` | Data table with warmth/relationship faceted filters |
| `src/features/contacts/components/contact-form.tsx` | Company picker, warmth, relationship, follow-up date |
| `src/features/contacts/components/contact-detail-page.tsx` | Tabs: Overview, Interactions, Notes |
| `src/features/contacts/components/interaction-form.tsx` | Type, direction, content, sentiment, follow-up |
| `src/features/contacts/components/interaction-list.tsx` | Chronological timeline-style list |
| `src/app/dashboard/contacts/[contactId]/page.tsx` | Detail route |

### Modify
- `src/app/dashboard/contacts/page.tsx` — render listing
- `src/features/companies/components/company-detail-page.tsx` — Contacts tab shows real data

### Key details
- Overdue follow-ups: `nextFollowUpDate < now()` → row highlighted orange/red
- Creating an interaction auto-updates `contacts.lastContactDate`
- If `followUpRequired` on interaction, auto-set `contacts.nextFollowUpDate`
- "Introduced by" field is a searchable contact dropdown (self-referential)

### Verify
- Create contact linked to company → appears in table and company detail
- Log interaction → appears in contact's interaction timeline
- Set overdue follow-up → row highlighted in table

---

## Phase 5: Tasks & Notes — To-Do System, Research Notes ✅ (files created, needs testing)

**Outcome**: Prioritized task list with "what to do today" view, markdown notes linked to entities.

### Create
| File | Purpose |
|------|---------|
| `src/app/api/tasks/route.ts` | GET + POST |
| `src/app/api/tasks/[id]/route.ts` | GET + PUT + DELETE (set `completedAt` on done) |
| `src/app/api/notes/route.ts` | GET + POST |
| `src/app/api/notes/[id]/route.ts` | GET + PUT + DELETE |
| `src/features/tasks/components/task-listing.tsx` | Server component |
| `src/features/tasks/components/task-table/{index,columns,options}.tsx` | Checkbox toggle, priority filter, due date filter |
| `src/features/tasks/components/task-form.tsx` | Title, priority, due date, entity linker |
| `src/features/tasks/components/task-quick-add.tsx` | Inline add for embedding in detail pages |
| `src/features/notes/components/note-listing.tsx` | Server component |
| `src/features/notes/components/note-table/{index,columns}.tsx` | Category filter, entity link |
| `src/features/notes/components/note-form.tsx` | Title, category, markdown content, entity linker |
| `src/features/notes/components/note-detail-page.tsx` | Full note view with rendered markdown |
| `src/components/entity-linker.tsx` | Shared: radio (Company/Contact/Application) + searchable select |
| `src/app/dashboard/notes/[noteId]/page.tsx` | Detail route |

### Modify
- `src/app/dashboard/tasks/page.tsx`, `src/app/dashboard/notes/page.tsx` — render listings
- Entity detail pages (companies, contacts, applications) — wire up tasks/notes sections

### Key details
- Checkbox in table row → optimistic PATCH to toggle done/todo
- "Today" filter: `dueDate <= endOfToday AND status IN (todo, in_progress)`
- Task completion: set status=done, completedAt=now(), log timeline event
- Entity linker component shared between tasks and notes

### Verify
- Create task linked to company → appears in table and company detail
- Click checkbox → toggles done, `completedAt` set
- Create note with category "interview_prep" → appears in listing and linked entity

---

## Phase 6: Dashboard — Real KPIs, Activity Feed, Charts ✅ (files created, needs wiring)

**Outcome**: Landing page with pipeline funnel, activity timeline, upcoming tasks, follow-up reminders.

### Create
| File | Purpose |
|------|---------|
| `src/app/api/timeline/route.ts` | GET activity feed, cursor pagination on `occurredAt` |
| `src/app/api/metrics/dashboard/route.ts` | GET aggregated stats (all queries in `Promise.all`) |
| `src/features/overview/components/kpi-cards.tsx` | Active Applications, Interviews This Week, Overdue Follow-ups, Companies Tracked |
| `src/features/overview/components/pipeline-funnel.tsx` | Recharts bar chart by pipeline stage (replaces bar-graph.tsx) |
| `src/features/overview/components/activity-timeline.tsx` | Recent timeline_events list (replaces recent-sales.tsx) |
| `src/features/overview/components/upcoming-tasks.tsx` | Next 5 due tasks |
| `src/features/overview/components/follow-up-reminders.tsx` | Contacts with overdue follow-ups |
| `src/features/overview/components/source-breakdown.tsx` | Application source pie chart (replaces pie-graph.tsx) |

### Modify
- `src/app/dashboard/overview/layout.tsx` — real KPI data instead of hardcoded
- `src/app/dashboard/overview/@bar_stats/page.tsx` → PipelineFunnel
- `src/app/dashboard/overview/@sales/page.tsx` → ActivityTimeline
- `src/app/dashboard/overview/@pie_stats/page.tsx` → SourceBreakdown
- `src/app/dashboard/overview/@area_stats/page.tsx` → UpcomingTasks + FollowUpReminders

### Reuse
- `recharts` — already installed
- Parallel routes architecture in `src/app/dashboard/overview/` — loading/error states
- `date-fns/formatDistanceToNow` — relative time ("2 hours ago")

### Verify
- Dashboard shows real counts (or zeros with empty state messages)
- Pipeline funnel bars match actual application stage counts
- Activity timeline shows recent events, clickable to navigate to entities

---

## Phase 7: Search, Metrics & Polish ✅ (files created, needs wiring)

**Outcome**: Cross-entity search via Cmd+K, weekly JSC metrics, recruiter tracking.

### Create
| File | Purpose |
|------|---------|
| `src/app/api/search/route.ts` | ILIKE search across companies, contacts, applications, notes |
| `src/app/api/metrics/route.ts` | GET + POST weekly snapshots |
| `src/app/api/recruiters/route.ts` | GET + POST |
| `src/app/api/recruiters/[id]/route.ts` | GET + PUT + DELETE |
| `src/features/search/components/search-command.tsx` | Enhanced KBar with live entity search |
| `src/features/metrics/components/metrics-page.tsx` | Record + view weekly metrics |
| `src/features/metrics/components/metrics-trends.tsx` | Line/bar charts for trends over time |
| `src/features/metrics/components/weekly-snapshot-form.tsx` | Auto-populate counts from system data |
| `src/features/recruiters/components/recruiter-listing.tsx` | Recruiter management page |
| `src/app/dashboard/metrics/page.tsx` | Metrics route |

### Modify
- `src/config/nav-config.ts` — add Metrics nav item
- `src/components/kbar/index.tsx` — integrate live entity search
- Application detail — add interaction chronology section

### Verify
- `Cmd+K`, type "acme" → results from companies/contacts/notes
- Record weekly snapshot → trends chart shows data points
- Auto-populate → numeric fields filled from system data

---

## Dependency Map

```
Phase 1 (Foundation)
  └── Phase 2 (Companies)
        └── Phase 3 (Pipeline)
              └── Phase 4 (Contacts & Interactions)
                    └── Phase 5 (Tasks & Notes)
                          └── Phase 6 (Dashboard)
                                └── Phase 7 (Search & Polish)
```

Each phase is independently deployable. The app is usable for real job search tracking after Phase 3.

---

## Infrastructure Changes

- **Sentry removed** — stripped `@sentry/nextjs` to reduce dev server memory footprint (~1GB savings). `instrumentation.ts`, `instrumentation-client.ts`, `global-error.tsx`, and `next.config.ts` cleaned.
- **Dev server** — runs on port 4000 (`npm run dev`), using Turbopack. Requires ~4GB container memory (Colima `--memory 4`).
- **DataTable `onRowClick`** — added to `src/components/ui/table/data-table.tsx` so clicking any row navigates to its detail page.
- **Git identity** — Stephen Bronstein <steve@bronstein.org>

---

## File Count Summary

| Phase | Files Created | Status |
|-------|--------------|--------|
| 1. Foundation | 15 | ✅ Done |
| 2. Companies | 12 | ✅ Created, needs testing |
| 3. Pipeline | 11 | ✅ Created, needs testing |
| 4. Contacts | 14 | ✅ Created, needs testing |
| 5. Tasks & Notes | 12 | ✅ Created, needs testing |
| 6. Dashboard | 8 | ✅ Created, needs wiring to real data |
| 7. Search & Polish | 10 | ✅ Created, needs wiring |
| **Total** | **118 files committed** | **Next: verify & fix** |
