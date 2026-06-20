# Roadmap: Heimdall

Heimdall is brownfield — the executive job-search CRM is already shipped and in daily use. This roadmap tracks improvement milestones. Completed milestones are collapsed below; full per-milestone detail lives in `.planning/milestones/v[X.Y]-ROADMAP.md`.

## Milestones

- ✅ **v1.0 MVP / Brownfield Hardening** — Phases 1–6 (shipped 2026-05-14)
- ✅ **v1.1 LinkedIn Scraping by Company** — Phases 7–10 (shipped 2026-05-20)
- 📋 **v1.2 (next)** — to be defined via `/gsd:new-milestone`

## Phases

<details>
<summary>✅ v1.0 MVP / Brownfield Hardening (Phases 1–6) — SHIPPED 2026-05-14</summary>

- [x] Phase 1: Critical Bug Fix (1/1 plan) — completed 2026-05-12 — eliminated the sidebar hydration crash that broke navigation after LinkedIn imports
- [x] Phase 2: Test Infrastructure (5/5 plans) — completed 2026-05-12 — Vitest + PGlite harness pinning load-bearing logic + the BUG-01 regression
- [x] Phase 3: Security Hardening (2/2 plans) — completed 2026-05-13 — authenticate every `/api/*` route + strip starter-template auth artifacts
- [x] Phase 4: Starter-Template Cleanup (5/5 plans) — completed 2026-05-13 — delete unused routes, components, dead imports, `__CLEANUP__/`
- [x] Phase 5: Job Leads Completion (7/7 plans) — completed 2026-05-14 — scraping moved out of the app into a Claude Code skill driving `vercel-labs/agent-browser`; queue + categorized failures in the DB
- [x] Phase 6: Performance (5/5 plans) — completed 2026-05-14 — eliminate N+1 patterns + add hot-path indexes (migration 0008)

_Full Phase 1–6 detail remains in git history (v1.0 was recorded retroactively at the v1.1 close; see `.planning/MILESTONES.md`)._

</details>

<details>
<summary>✅ v1.1 LinkedIn Scraping by Company (Phases 7–10) — SHIPPED 2026-05-20</summary>

- [x] Phase 7: Schema + API for Company-Scope Leads (3/3 plans) — completed 2026-05-19 — nullable `linkedinJobUrl`/`roleTitle` + API route for synthetic job leads without a job URL
- [x] Phase 8: Skill Input Parsing, Navigation Branching + Drain (3/3 plans) — completed 2026-05-19 — skill accepts company URLs and bare names, navigates direct to employees when no job URL, disambiguates multi-match
- [x] Phase 9: UI for Company-Scope Leads (1/1 plan) — completed 2026-05-20 — detail + list render company-scope leads cleanly without broken job-URL affordances
- [x] Phase 10: Connection Company + Role Enrichment for Triage (4/4 plans) — completed 2026-05-20 — surface company/role at-time-of-connection in triage; paced agent-browser backfill + just-in-time enrichment

_Full Phase 7–10 detail: `.planning/milestones/v1.1-ROADMAP.md`._

</details>

### 📋 v1.2 (next milestone — to be defined)

Run `/gsd:new-milestone` to scope the next milestone. Candidate sources: the v2 deferred backlog in `.planning/milestones/v1.1-REQUIREMENTS.md` (production-grade scraping JL2-01..04, pgvector VEC-01/02, structured logging OBS-01/02, mobile/bulk-edit UX-01/02) and the deferred items in STATE.md.

## Progress

**Execution order:** Phases executed in numeric order 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Critical Bug Fix | v1.0 | 1/1 | Complete | 2026-05-12 |
| 2. Test Infrastructure | v1.0 | 5/5 | Complete | 2026-05-12 |
| 3. Security Hardening | v1.0 | 2/2 | Complete | 2026-05-13 |
| 4. Starter-Template Cleanup | v1.0 | 5/5 | Complete | 2026-05-13 |
| 5. Job Leads Completion | v1.0 | 7/7 | Complete | 2026-05-14 |
| 6. Performance | v1.0 | 5/5 | Complete | 2026-05-14 |
| 7. Schema + API for Company-Scope Leads | v1.1 | 3/3 | Complete | 2026-05-19 |
| 8. Skill Input Parsing, Navigation Branching + Drain | v1.1 | 3/3 | Complete | 2026-05-19 |
| 9. UI for Company-Scope Leads | v1.1 | 1/1 | Complete | 2026-05-20 |
| 10. Connection Company + Role Enrichment for Triage | v1.1 | 4/4 | Complete | 2026-05-20 |

---
*Last updated: 2026-06-20 — v1.1 milestone archived. Completed-milestone detail in `.planning/milestones/`.*
