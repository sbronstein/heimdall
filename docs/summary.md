# Heimdall — Project Summary

> Last updated: 2026-03-10

## What It Is

Personal CRM and pipeline tracker for an executive job search targeting VP Data/AI roles at growth-stage companies. Built for dual interaction: web UI and Claude Code CLI.

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Server Components, Turbopack) |
| Database | Neon Postgres + Drizzle ORM |
| UI | shadcn/ui + Tailwind CSS v4 + Recharts |
| Auth | Clerk (restricted to steve@bronstein.org) |
| Hosting | Vercel |
| State | Zustand (pipeline board), nuqs (URL state) |
| DnD | @dnd-kit (pipeline kanban) |
| Forms | React Hook Form + Zod v4 |

## Current State

**Fully built and verified.** All core features are live with real data flowing through Neon Postgres. The app runs on port 4000.

### Database: 10 Tables, 15 Enums, 4 Migrations

| Table | Purpose |
|-------|---------|
| companies | Target companies with priority, stage, funding, research notes |
| contacts | People — recruiters, peers, friends, coaches. Closeness, outreach, met date tracking |
| applications | Job opportunities progressing through pipeline stages |
| interactions | Every communication logged (emails, calls, coffees, interviews) |
| tasks | To-dos and follow-up reminders linked to any entity |
| notes | Research, interview prep, STAR stories, reflections |
| pipeline_stages | 13 stages from Researching → Accepted/Rejected/etc. |
| timeline_events | Denormalized activity feed for dashboard |
| recruiters | Recruiter tracking linked to contacts |
| search_metrics | Weekly snapshots for JSC reporting |

**Migrations applied:**
1. `0000_luxuriant_redwing.sql` — initial schema (10 tables, 13 enums)
2. `0001_volatile_mastermind.sql` — networking enhancement (closeness, outreach status, import fields)
3. `0002_shocking_preak.sql` — add career_contact closeness tier
4. `0003_neat_silver_sable.sql` — add met_date column to contacts

### API: 26 Routes

**Core CRUD:**
- Companies: GET/POST `/api/companies`, GET/PUT/DELETE `/api/companies/[id]`
- Contacts: GET/POST `/api/contacts`, GET/PUT/DELETE `/api/contacts/[id]`
- Applications: GET/POST `/api/applications`, GET/PUT/DELETE `/api/applications/[id]`
- Interactions: GET/POST `/api/interactions`, GET/PUT/DELETE `/api/interactions/[id]`
- Tasks: GET/POST `/api/tasks`, GET/PUT/DELETE `/api/tasks/[id]`
- Notes: GET/POST `/api/notes`, GET/PUT/DELETE `/api/notes/[id]`

**Specialized:**
- `PATCH /api/applications/[id]/status` — validated pipeline transitions
- `GET /api/companies/[id]/contacts` — contacts at a company
- `GET /api/companies/[id]/applications` — applications for a company
- `GET /api/contacts/[id]/interactions` — interaction history
- `GET /api/contacts/connections` — 2nd-degree connection lookup
- `POST /api/contacts/import` — LinkedIn CSV import
- `PATCH /api/contacts/import/categorize` — bulk closeness update
- `GET /api/pipeline-stages` — pipeline stage definitions
- `GET /api/timeline` — activity feed
- `GET /api/metrics/dashboard` — aggregated KPIs
- `GET/POST /api/metrics` — weekly snapshots
- `GET /api/search` — cross-entity search
- `GET/POST /api/recruiters`, GET/PUT/DELETE `/api/recruiters/[id]`

**All routes follow the standard envelope:** `{ success, data, error, meta }`

### Dashboard Pages: 9 Sections

| Page | Features |
|------|----------|
| Overview | KPI cards, pipeline funnel chart, activity timeline, source breakdown pie chart |
| Companies | Data table with priority/stage filters, detail pages with tabs |
| Pipeline | Drag-and-drop kanban board, validated transitions, excitement badges, days-in-stage |
| Networking | KPI cards, closeness tier stats, outreach tracker, connection finder |
| Contacts | Data table with warmth/closeness/outreach filters, Known From/Connected On/Met columns, LinkedIn import, detail pages |
| Tasks | Data table with checkbox toggle, priority filters, entity linking |
| Notes | Data table with category filters, markdown content, entity linking |
| Metrics | Weekly snapshots, trend charts |
| Search | Cmd+K cross-entity search (companies, contacts, applications, notes) |

### Navigation

Dashboard → Companies → Pipeline → **Networking** → Contacts → Tasks → Notes → Metrics → Account

## Networking Features (New — 2026-03-09)

### Closeness Hierarchy
Orthogonal to warmth (engagement heat). Measures underlying relationship strength:

| Tier | Color | Description |
|------|-------|-------------|
| Friend | Emerald | Personal friends |
| Close Colleague | Teal | Worked closely together |
| Colleague | Cyan | Same company/team |
| Career Contact | Indigo | Coaches, salespeople, professional services |
| Acquaintance | Slate | Met once or twice |
| LinkedIn Only | Sky | Connected online, never met |
| Never Met | Gray | Cold outreach targets |

### Outreach Tracking
Every contact has an outreach status that auto-updates from interactions:

| Status | Trigger |
|--------|---------|
| Not Reached Out | Default for new/imported contacts |
| Reached Out | Auto-set when logging email_sent or linkedin_message_sent |
| Meeting Scheduled | Set manually |
| Meeting Completed | Auto-set when logging coffee_chat, phone_call, or video_call |
| Ongoing | Set manually for active relationships |

### Contact Context Fields
- **Known From** (`howMet`) — where you know the person (Andover, Penn, WebYes, ID.me, etc.)
- **Met Date** (`metDate`) — when you first met the person
- **LinkedIn Connected On** (`linkedinConnectionDate`) — auto-populated from LinkedIn CSV import, also editable in form
- All three shown in contact table columns and editable in contact form

### LinkedIn Import
- Upload LinkedIn Connections CSV (Settings → Data Privacy → Get a copy)
- Deduplicates by LinkedIn URL, then by name + company
- Review table with per-row closeness dropdown before confirming
- Tags imported contacts with `linkedin-import`
- Auto-populates "Connected On" date from CSV

### Connection Finder
- Search by company name → shows "Your Contacts There" and "People Who Could Introduce You"
- Sorted by closeness tier
- Also available as "Network" tab on company detail pages

### Lead Attribution
- Applications show "via [Contact Name]" on pipeline cards when referred
- "Referred By" field on application detail sheet links to contact
- New application dialog includes contact selector that auto-sets source to "referral"

## Key Architecture Patterns

- **Server Components by default** — client only for interactivity (`'use client'`)
- **All mutations via API routes** — ensures CLI parity with web UI
- **Soft deletes** — `archivedAt` timestamp, never hard delete
- **Timeline audit trail** — every write operation logs to `timeline_events`
- **Cursor pagination** — `updatedAt`/`occurredAt` based, not offset
- **Pipeline state machine** — `canTransition(from, to)` validates all moves
- **Optimistic UI** — Zustand store for drag-drop, revert on API failure

## Commands

```bash
npm run dev           # Dev server on port 4000
npm run build         # Production build
npm run db:generate   # Generate migration from schema changes
npm run db:migrate    # Run pending migrations
npm run db:push       # Push schema directly (dev only)
npm run db:studio     # Drizzle Studio (visual DB browser)
npm run db:seed       # Seed pipeline stages
```

## File Counts

| Area | Count |
|------|-------|
| Feature directories | 14 |
| Feature component files | ~80 |
| API routes | 26 |
| Dashboard pages | ~23 |
| Database tables | 10 |
| Database enums | 15 |
| Migrations | 4 |
