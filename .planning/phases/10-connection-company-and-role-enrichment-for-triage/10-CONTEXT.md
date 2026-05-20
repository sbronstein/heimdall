# Phase 10: Connection Company + Role Enrichment for Triage - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Source:** Inline discussion during /gsd-plan-phase (3 plan-shaping decisions locked)

<domain>
## Phase Boundary

The triage flow must show each connection's **company and role at the time of connection**
so the owner can judge an introduction's value at a glance. Two data sources feed this:

1. **LinkedIn `Connections.csv` import** — already captures `Company` → `currentCompany`
   and `Position` → `title` at import time (`src/app/api/contacts/import/route.ts`). These
   are the best-available baseline for many connections.
2. **Per-profile agent-browser scrape** — backfills company + role for connections the CSV
   left blank, and refreshes the dedicated at-connection fields. Paced to survive a 1000+
   profile sweep without presenting as bot activity.

The data is consumed in two places: the standalone triage/recommendation view, and the
just-in-time enrichment of mutual connections surfaced when triaging a specific company.

**In scope:** schema fields, CSV import seeding, an extended agent-browser per-profile scrape
mode, a paced batch-sweep runner, just-in-time enrichment on the company-triage path, and the
triage UI rendering the new fields.

**Out of scope:** changing the bridge-score formula to weight company/role; multi-tenant
concerns; true historical "as-of-date" role reconstruction beyond best-effort (see Deferred).
</domain>

<decisions>
## Implementation Decisions

### Scraper harness — EXTEND the existing skill (locked)
Add an **individual-profile scrape mode** to the existing `scrape-linkedin-connections`
skill and its harness rather than creating a new dedicated skill. Reuse the existing
agent-browser plumbing (CDP/WS/local browser modes), the `~/.heimdall/api-token` bearer-auth
pattern, and the REST write-back convention. One harness to maintain.
- The existing skill scrapes a *company's employee list* into `prospects`. The new mode
  scrapes a *single connection's profile* for company + role and writes back to that
  `contacts` record.

### Backlog model — BOTH batch sweep AND just-in-time (locked)
- A **runnable paced batch sweep** chips away at the 1000+ connection backlog (success
  criterion #4).
- **Just-in-time enrichment** runs when triaging a specific company: any mutual connections
  still missing company/role are enriched on demand at that moment, without requiring the
  full backlog to be processed first (success criterion #5).
- Scrape/queue state lives on the `contacts` record (enrichment status/timestamp columns) —
  no separate queue table unless the planner finds a strong reason.

### Schema shape — ADD dedicated at-connection fields (locked)
Add new columns distinct from the existing `title` / `currentCompany`, e.g.
`companyAtConnection` / `roleAtConnection` (final names at planner discretion), plus an
enrichment-status marker (e.g. `enrichmentStatus` / `enrichedAt`) to drive the sweep and JIT
paths and avoid re-scraping. Requires a Drizzle migration + `npm run db:push`.
- **CSV seeding:** at import, seed the new at-connection fields from the CSV `Company`/`Position`
  as the best-available baseline. The scraper backfills only where these are blank.

### Pacing strategy (success criterion #4 — must be documented)
The per-profile sweep must mimic human behavior: randomized inter-request delays, a per-session
profile cap, and throttling so a 1000+ profile sweep does not present as obvious bot activity.
The chosen pacing strategy (delay ranges, session caps, back-off on anti-bot signals) must be
documented in the skill's references. Reuse the existing per-lead ~5-min budget and the
troubleshooting error categories where applicable.

### Architectural invariants (from CLAUDE.md — non-negotiable)
- All DB writes go through REST API routes (`/app/api/`). The scrape skill writes back via
  REST only — never touches the DB directly. CLI parity depends on this.
- All API routes use Zod validation and return the `{ success, data, error, meta }` envelope.
- Every write operation creates a `timeline_events` record via `logTimeline()`.
- Soft deletes only (`archivedAt`); never hard delete.
- Drizzle query builder only — no raw SQL except pgvector.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema + import
- `drizzle/schema/contacts.ts` — the `contacts` table; today has `title`, `currentCompany`,
  `linkedinConnectionDate`, `linkedinUrl` (partial unique idx), `triagedAt`. No at-connection
  fields yet. New columns + indexes go here.
- `src/app/api/contacts/import/route.ts` — LinkedIn CSV parse + field mapping
  (`Company`→`currentCompany`, `Position`→`title`, `Connected On`→`linkedinConnectionDate`).
  CSV-seeding of the new fields happens here.

### Scrape skill / harness (to be extended)
- `.claude/skills/scrape-linkedin-connections/SKILL.md` — the skill to extend with a
  per-profile mode.
- `.claude/skills/scrape-linkedin-connections/references/linkedin-navigation.md` — navigation
  paths; add a profile-page navigation/extraction section.
- `.claude/skills/scrape-linkedin-connections/references/heimdall-api.md` — REST endpoints +
  bearer auth + envelope; add the new write-back endpoint.
- `.claude/skills/scrape-linkedin-connections/references/troubleshooting.md` — anti-bot error
  categories; document pacing/back-off here.
- `src/features/job-leads/lib/linkedin-browser.ts` — browser launch/attach plumbing to reuse.
- `src/features/job-leads/lib/scrape-connections.ts` — existing scrape flow reference.

### Triage / recommendation UI + data
- `src/features/job-leads/components/recommendation-list.tsx` — renders mutual connections by
  bridge score; add company + role-at-connection display.
- `src/app/api/job-leads/[id]/recommendations/route.ts` — recommendation query; JIT enrichment
  hook point for mutual connections missing company/role.
- `src/features/job-leads/lib/prioritization.ts` — bridge-score formula (NOT changing it).
- `src/app/api/contacts/connections/route.ts` — direct-contacts-at-company query.

### Conventions
- `src/lib/api/types.ts`, `src/lib/api/errors.ts` — response envelope + error factories.
- `src/lib/db/timeline.ts` — `logTimeline()` side-effect on every write.
</canonical_refs>

<specifics>
## Specific Ideas

- New write-back endpoint shape: a PATCH on a contact (or a dedicated enrichment endpoint)
  that accepts `{ companyAtConnection, roleAtConnection }`, sets `enrichmentStatus`/`enrichedAt`,
  validates with Zod, returns the envelope, and logs a timeline event.
- Batch sweep selects active contacts where the at-connection fields are blank and
  `enrichmentStatus` is not yet terminal, ordered for steady progress; respects the per-session
  cap and randomized delays.
- JIT path: in the recommendations route (or a thin enrichment call it triggers), detect mutual
  connections missing company/role and enrich them inline at triage time.
- CSV import already de-dupes on `linkedin_url` (partial unique idx) — seeding must not disturb
  that ON CONFLICT path.
</specifics>

<deferred>
## Deferred Ideas

- **True as-of-connection-date role reconstruction.** Inferring which role a connection held on
  the exact `linkedinConnectionDate` from their profile experience history is best-effort only.
  The practical target is the company+role we can attribute to the connection (CSV value first,
  then scraped current/most-recent), not a guaranteed historical snapshot. Documented as a
  limitation; a stricter reconstruction is out of scope for this phase.
- **Bridge-score weighting by company/role.** Feeding the new fields into `prioritization.ts`
  is explicitly out of scope here.
</deferred>

---

*Phase: 10-connection-company-and-role-enrichment-for-triage*
*Context gathered: 2026-05-20 via inline discussion during /gsd-plan-phase*
