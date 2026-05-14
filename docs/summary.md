# Heimdall — Project Summary

> Last updated: 2026-03-19

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
| Scraping | Cheerio (HTML parsing) + Playwright (browser automation) |

## Current State

**Fully built and verified.** All core features are live with real data flowing through Neon Postgres. The app runs on port 4000.

### Database: 13 Tables, 17 Enums, 7 Migrations

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
| job_leads | LinkedIn job URLs with scrape status, company match, prospect counts |
| prospects | 2nd-degree connections found at target companies via LinkedIn |
| prospect_bridges | Junction linking prospects to user's contacts (mutual connections) with priority scores |

**Migrations applied:**
1. `0000_luxuriant_redwing.sql` — initial schema (10 tables, 13 enums)
2. `0001_volatile_mastermind.sql` — networking enhancement (closeness, outreach status, import fields)
3. `0002_shocking_preak.sql` — add career_contact closeness tier
4. `0003_neat_silver_sable.sql` — add met_date column to contacts
5. `0004_*` — triage workflow fields (triagedAt, howMet on contacts)
6. `0005_closed_cassandra_nova.sql` — add close_friend closeness tier
7. `0006_add_job_leads.sql` — job_leads, prospects, prospect_bridges tables + job_lead_status and seniority_level enums

### API: 34 Routes

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

**Job Leads:**
- `GET/POST /api/job-leads` — list and create (POST scrapes job page via cheerio)
- `GET/PUT /api/job-leads/[id]` — get and update lead
- `POST /api/job-leads/[id]/search` — trigger Playwright 2nd-degree connection scrape (async)
- `GET /api/job-leads/[id]/status` — poll scrape progress
- `GET /api/job-leads/[id]/recommendations` — scored & ranked intro paths
- `POST /api/job-leads/linkedin-setup` — launch headed browser for LinkedIn login

**All routes follow the standard envelope:** `{ success, data, error, meta }`

### Dashboard Pages: 10 Sections

| Page | Features |
|------|----------|
| Overview | KPI cards, pipeline funnel chart, activity timeline, source breakdown pie chart |
| Companies | Data table with priority/stage filters, detail pages with tabs |
| Pipeline | Drag-and-drop kanban board, validated transitions, excitement badges, days-in-stage |
| **Job Leads** | **Paste LinkedIn URL → scrape job → find 2nd-degree connections → triage → prioritized intro recommendations** |
| Networking | KPI cards, closeness tier stats, outreach tracker, connection finder |
| Contacts | Data table with warmth/closeness/outreach filters, Known From/Connected On/Met columns, LinkedIn import, detail pages, **triage workflow** |
| Tasks | Data table with checkbox toggle, priority filters, entity linking |
| Notes | Data table with category filters, markdown content, entity linking |
| Metrics | Weekly snapshots, trend charts |
| Search | Cmd+K cross-entity search (companies, contacts, applications, notes) |

### Navigation

Dashboard → Companies → Pipeline → **Job Leads** → **Networking** → Contacts → Tasks → Notes → Metrics → Account

## Networking Features (2026-03-09)

### Closeness Hierarchy (8 tiers)
Orthogonal to warmth (engagement heat). Measures underlying relationship strength:

| Tier | Color | Description |
|------|-------|-------------|
| Close Friend | Rose | Closest personal friends |
| Close Colleague | Teal | Worked closely together |
| Friend | Emerald | Personal friends |
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

### Contact Triage Workflow (2026-03-16)
Keyboard-driven bulk triage for classifying imported contacts:
- **Flow:** howMet input (auto-focused) → Tab → year buttons → Enter → closeness buttons (1-8)
- **howMet autocomplete:** frequency-sorted suggestions (prefix-first, then contains, by count desc), first match auto-highlighted so Tab accepts immediately
- **Last Contact Year:** fixed buttons (2026, 2021, 2018, 2013, 2011, Earlier) with arrow key navigation
- **Closeness buttons:** 8 tiers, press 1-8 or Enter to submit + advance to next contact
- **Undo (U / Ctrl+Z):** restores previous closeness, howMet, lastContactDate, triagedAt
- **Skip (S):** advance without saving
- **Progress bar** with count and percentage
- **LinkedIn profile link** on each triage card (opens in new tab)

## Job Leads Feature (2026-03-16)

Automated intro-path finder: paste a LinkedIn job URL → get a prioritized list of who to ask for an intro.

### Status: In Progress

**Working:**
- Job page scraping via cheerio (company name, role title, location extraction)
- Job lead CRUD (create from URL, list, detail, status updates)
- LinkedIn browser setup via CDP (login, session save)
- Navigation flow: job posting → company page → find `currentCompany` link → build people search URL
- People search result extraction via `page.evaluate()` (26 people extracted in test run)
- Seniority inference, prioritization scoring, recommendation API

**Needs Debugging:**
- The Playwright navigation sometimes times out on `page.goto` for LinkedIn pages (heavy JS). Using `waitUntil: 'domcontentloaded'` helps but isn't fully reliable yet. The `waitForTimeout` calls may need tuning.
- The hardcoded company name `'point'` in Strategy 2 of `navigateToEmployeeList` should be parameterized from the lead's company name.
- Debug logging and browser-stays-open mode are currently active for development.

### Flow
1. **Paste URL** — auto-submits on paste, scrapes job page with cheerio for company name, role title, location. Parses both `"Company hiring Role in Location | LinkedIn"` and `"Role - Company | LinkedIn"` title formats.
2. **Find Connections** — Playwright navigates the actual LinkedIn UI: job posting → click company link → find `currentCompany=NNNN` link on company page → build clean people search URL with `network=["S"]` (2nd degree only). Extracts results via `page.evaluate()` using `a[href*="/in/"]` profile links (resilient to LinkedIn's obfuscated CSS class names).
3. **Match & Triage** — mutual connection names fuzzy-matched to contacts in DB; untriaged contacts routed through existing triage workflow (with `exitUrl` prop to return to job lead detail page).
4. **Recommendations** — scored and ranked by composite formula: `0.40 × seniority + 0.35 × closeness + 0.25 × recency`

### LinkedIn Browser Architecture (Docker)

The app runs in Docker but needs to control a browser on the host for LinkedIn auth and scraping.

**Three connection modes** (set via env vars in `.env.local`):

| Mode | Env Var | Use Case |
|------|---------|----------|
| CDP | `BROWSER_CDP_ENDPOINT=http://IP:PORT` | Docker → headed Chrome on host (best for login + scraping) |
| WebSocket | `BROWSER_WS_ENDPOINT=ws://IP:PORT` | Docker → Playwright run-server on host (headless only) |
| Local | neither set | Direct Chromium launch (local dev, non-Docker) |

**CDP setup (recommended for Docker):**
1. On host: `google-chrome --remote-debugging-port=3005 --user-data-dir=~/.heimdall/linkedin-profile about:blank`
2. In `.env.local`: `BROWSER_CDP_ENDPOINT=http://192.168.5.2:3005` (use IP, not `host.docker.internal` — Chrome rejects non-IP/localhost Host headers)
3. CDP mode reuses the browser's default context (already logged in), no storage state file needed

**Gotcha:** Chrome's DevTools server rejects requests where the `Host` header is a hostname (like `host.docker.internal`). Must use the resolved IP address directly.

### Seniority Inference
Title keyword matching (first match wins): C-Suite (100) → VP (85) → Director (70) → Senior Manager (55) → Manager (40) → Senior IC (30) → IC (20) → Entry Level (10) → Unknown (15)

### Prioritization Score
- **Seniority weight** — from the prospect's title (higher = better intro target)
- **Closeness weight** — from your relationship to the mutual connection (close_friend=100 → never_met=5)
- **Recency weight** — days since last contact, decaying over ~1 year

### Recommendation Grouping
Results grouped by mutual connection (the person you'd reach out to), each showing the prospects they can connect you to with seniority badges. "Request Intro" button creates an `intro_requested` interaction.

### LinkedIn Scraping Notes
- LinkedIn uses obfuscated/hashed CSS class names — cannot rely on semantic selectors like `.entity-result__item`. Instead, use `page.evaluate()` with structural queries (`a[href*="/in/"]`, `a[href*="/company/"]`, etc.)
- The company page has a "See all" link with `currentCompany=NNNN` in the href — this is the most reliable way to get the numeric company ID (don't search by company name, especially for generic names like "Point")
- LinkedIn people search URLs from company pages may include extra filters (e.g. `schoolFilter`) — strip these and build a clean URL with only `currentCompany` and `network` params
- Pages are heavy JS apps; `waitUntil: 'domcontentloaded'` is better than default `'load'` for `page.goto()`, combined with `waitForSelector` for specific elements

### Dependencies Added
- `cheerio` — server-side HTML parsing for job page scraping
- `playwright` — browser automation for LinkedIn connection search

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
| Feature directories | 15 |
| Feature component files | ~95 |
| API routes | 34 |
| Dashboard pages | ~26 |
| Database tables | 13 |
| Database enums | 17 |
| Migrations | 7 |
