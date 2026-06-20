---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: LinkedIn Scraping by Company
status: shipped
stopped_at: v1.1 milestone archived
last_updated: "2026-06-20T00:00:00.000Z"
last_activity: 2026-06-20 -- v1.1 milestone archived (Phases 7-10); tagged v1.1
progress:
  total_phases: 10
  completed_phases: 10
  total_plans: 36
  completed_plans: 36
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-20)

**Core value:** Owner can run the entire executive job search from one place — track companies, log interactions, move applications through pipeline stages, and surface the highest-value introduction paths — without leaving the app.
**Current focus:** Between milestones — scope v1.2 via `/gsd:new-milestone`.

## Current Position

Milestone: v1.1 LinkedIn Scraping by Company — ✅ SHIPPED 2026-05-20, archived 2026-06-20 (tag `v1.1`)
Phases: 7–10 complete (11 plans)
Status: Milestone closed. No active phase.
Last activity: 2026-06-20 -- v1.1 milestone archived to .planning/milestones/

**Shipped milestones:** v1.0 (Phases 1–6) · v1.1 (Phases 7–10)

## Performance Metrics

**Velocity (v1.0 reference):**

- Total plans completed: 31 (Phases 1–6)
- Average duration: ~10 min/plan

**By Phase (v1.0):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-critical-bug-fix | 1 | ~15 min | ~15 min |
| 02-test-infrastructure | 5 | ~75 min | ~15 min |
| 03-security-hardening | 2 | ~20 min | ~10 min |
| 04-starter-template-cleanup | 5 | ~23 min | ~5 min |
| 05-job-leads-completion | 7 | TBD | TBD |
| 06-performance | 5 | TBD | TBD |
| 07 | 3 | - | - |
| 08 | 3 | - | - |

**v1.1 plans completed:** 0 / TBD

*Updated after each plan completion*
| Phase 09 P01 | 11m | 2 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v1.1 data model: synthetic `job_leads` row (`linkedinJobUrl = null`, `roleTitle = null` or "Company-wide scrape"). No new entity, no new table for company scrapes. Reuse existing routes/UI/state machine.
- v1.1 role filter: none — the skill returns all 2nd-degree connections at the company.
- v1.1 disambiguation: when a bare company name matches multiple LinkedIn companies, the skill presents top 3–5 results inline (name + employee count + industry) and waits for user pick.
- v1.1 drain mode: same `/api/job-leads?status=queued` queue. Skill navigation branches on whether `linkedinJobUrl` is null.
- v1.1 phase structure: Schema + API (Phase 7) → Skill (Phase 8) → UI (Phase 9). Schema first because skill and UI both depend on the nullable-column shape and synthetic-lead creation route.

### Pending Todos

None yet.

### Blockers/Concerns

- LinkedIn scraping requires local dev / Docker with host browser; cannot run on Vercel serverless (acknowledged out-of-scope)
- Phase 7 must verify whether `linkedinJobUrl` and `roleTitle` are already nullable in the current schema (Phase 5 may have added nullable `linkedinJobUrl`) — planner should check `drizzle/schema/job-leads.ts` before writing the migration plan
- **Pending user action (quick task 260520-n3s):** run `node scripts/backfill-enrichment-reset.mjs` (dry-run) then `--apply` to reset the ~1500 legacy contacts whose at-connection fields equal current — repopulates the enrichment queue. Live Neon prod write; not yet run.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260520-n3s | Correct current-vs-at-connection contact model (import seeds current-only; triage shows both; backfill script) | 2026-05-20 | 4cafde2 | [260520-n3s-current-vs-at-connection-fields](./quick/260520-n3s-current-vs-at-connection-fields/) |
| 260521-b6x | Fix scrape-linkedin-connections skill: enrichment reconstructs company/role AS OF connection date (not current/most-recent), with date-matching + 3 fallbacks | 2026-05-21 | 1b237c6 | [260521-b6x-enrich-as-of-connection-date](./quick/260521-b6x-enrich-as-of-connection-date/) |
| 260521-bhf | Split career_contact closeness into close_career (bridge weight 50) + career (40) across enum, types, weights, color map, triage bar, networking selects; raw-SQL enum-swap migration remaps existing rows to career | 2026-05-21 | 10d430f | [260521-bhf-split-career-closeness-into-close-career](./quick/260521-bhf-split-career-closeness-into-close-career/) |
| 260521-dwi | Add LinkedIn link rectangle next to names and titles on job lead drilldown page | 2026-05-21 | 48acb3d | [260521-dwi-add-linkedin-link-rectangle-next-to-name](./quick/260521-dwi-add-linkedin-link-rectangle-next-to-name/) |
| 260611-kqi | Add do-not-use-for-intros override flag to contacts (schema + REST + form toggle) with hard exclusion in buildRecommendations | 2026-06-11 | 9766e5b | [260611-kqi-add-do-not-use-for-intros-override-flag-](./quick/260611-kqi-add-do-not-use-for-intros-override-flag-/) |
| 260611-l44 | Clickable contact names (link to contact record) + Override button next to LinkedIn badge in RecommendationCard, optimistic removal on override | 2026-06-11 | b1a20b3 | [260611-l44-make-contact-names-clickable-and-add-ove](./quick/260611-l44-make-contact-names-clickable-and-add-ove/) |

### Roadmap Evolution

- Phase 10 added (2026-05-20): Connection Company + Role Enrichment for Triage — surface company/role-at-time-of-connection in triage, agent-browser skill to backfill the CSV gap with anti-bot pacing across 1000+ profiles, plus just-in-time enrichment of mutual connections during company shared-connection triage.

## Deferred Items

Items acknowledged and carried forward from v1.0:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Performance | pg_trgm GIN for cross-entity ilike search | Deferred to v2 | Phase 6 |
| Playwright | Move playwright from dependencies to devDependencies | Deferred to v2 as JL2-02 | Phase 5 |

Items acknowledged and deferred at v1.1 milestone close (2026-06-20):

| Category | Item | Status |
|----------|------|--------|
| UAT | Phase 6 human UAT — 1 open scenario | partial |
| UAT | Phase 8 human UAT — 4 open scenarios | partial |
| Verification | Phase 1 verification sign-off | human_needed |
| Verification | Phase 6 verification sign-off | human_needed |
| Verification | Phase 8 verification sign-off | human_needed |
| Verification | Phase 9 verification | gaps_found |
| Data | Run `backfill-enrichment-reset.mjs` dry-run then `--apply` to reset ~1500 legacy contacts + repopulate enrichment queue (live Neon prod write — quick task 260520-n3s) | pending |

## Session Continuity

Last session: 2026-06-20
Stopped at: v1.1 milestone archived + tagged
Resume file: None
Next action: `/clear` then `/gsd:new-milestone` to scope v1.2
