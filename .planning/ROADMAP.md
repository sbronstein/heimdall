# Roadmap: Heimdall

Heimdall is brownfield — the executive job-search CRM is already shipped and in daily use. This roadmap tracks improvement milestones. Completed milestones are collapsed below; full per-milestone detail lives in `.planning/milestones/v[X.Y]-ROADMAP.md`.

## Milestones

- ✅ **v1.0 MVP / Brownfield Hardening** — Phases 1–6 (shipped 2026-05-14)
- ✅ **v1.1 LinkedIn Scraping by Company** — Phases 7–10 (shipped 2026-05-20)
- 📋 **v1.2 Networking Outreach Campaigns** — Phases 11–17 (in progress)

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

### 📋 v1.2 Networking Outreach Campaigns (Phases 11–17)

- [ ] **Phase 11: Schema, Enums, and State Machine** — Two new Drizzle tables, three pgEnums, and the `canEmailTransition()` state machine locking the full email status lifecycle before any consumer is built
- [ ] **Phase 12: API Routes** — Full `/api/outreach-campaigns/` route tree (campaign CRUD, bulk email add, status transitions, skill write-back endpoints, generation-context bulk fetch) so skills and UI have a stable REST surface to build against
- [ ] **Phase 13: Triage Connection-Date Filter** — Additive year-range filter on the existing triage workflow; independent of the campaign route tree
- [ ] **Phase 14: Campaign Builder UI** — Contact filter UI (howMet, year, closeness, outreach status), checkbox multi-select, and campaign creation form delivering the owner's ability to name and save a campaign from the browser
- [ ] **Phase 15: Review and Approval UI** — Per-email review cards with inline edit, approve gate, regenerate button, status badges, and campaign progress header
- [ ] **Phase 16: Email Generation Skill** — `generate-outreach-emails` Claude Code skill: drains the pending queue, personalizes emails from CRM context with closeness-tier tone and LLM-tell guardrails, writes back via REST
- [ ] **Phase 17: Gmail Drafting and Email Discovery Skill** — `draft-outreach-emails` Claude Code skill: discovers emails via Gmail thread search, creates Gmail drafts (never sends), idempotent on retry, logs timeline events, flags LinkedIn-only contacts

## Phase Details

### Phase 11: Schema, Enums, and State Machine
**Goal**: The data model for outreach campaigns is in Postgres and the email status lifecycle is enforced at the API boundary before any other code depends on it
**Depends on**: Phase 10 (existing schema baseline)
**Requirements**: REV-05
**Success Criteria** (what must be TRUE):
  1. `outreach_campaigns` and `outreach_emails` tables exist in Neon Postgres with all columns, indexes, and the unique constraint on `(campaign_id, contact_id)` — migration 0011 runs clean against the live DB
  2. `canEmailTransition()` at `src/features/outreach/lib/email-status.ts` rejects invalid moves (e.g. `pending → drafted`, `approved → pending`) and accepts valid ones (`pending → generated → edited → approved → drafted`) — pinned by a Vitest test
  3. Drizzle-inferred types `OutreachCampaign` and `OutreachEmail` are exported from `src/lib/domain/types.ts`
**Plans**: 3 plans
- [ ] 11-01-PLAN.md — Enums, two tables, barrel exports + migration 0011 applied to Neon (Wave 1)
- [ ] 11-02-PLAN.md — Inferred types + enum value arrays + `canEmailTransition()` state machine (Wave 2)
- [ ] 11-03-PLAN.md — Vitest state-machine test + PGlite schema-regression test (Wave 3)

### Phase 12: API Routes
**Goal**: The full REST API surface for outreach campaigns is live and usable from the CLI; skills and UI have working endpoints to build against
**Depends on**: Phase 11
**Requirements**: CAMP-06, CAMP-07, CAMP-08, GEN-05
**Success Criteria** (what must be TRUE):
  1. User (via CLI) can create a named campaign with a goal/instruction (`POST /api/outreach-campaigns`) and get back the new campaign id
  2. User (via CLI) can add a list of contact IDs to a campaign in one request; a second add of the same contact is silently deduped — no duplicate row
  3. User (via CLI) can list campaigns (`GET /api/outreach-campaigns`) and see per-campaign counts: selected / generated / approved / drafted
  4. User (via CLI) can transition an email's status through the lifecycle; invalid transitions (e.g. `generated → drafted`) return 400 with the state machine's rejection reason
  5. All new routes return the standard `{ success, data, error, meta }` envelope and reject unauthenticated requests
**Plans**: TBD

### Phase 13: Triage Connection-Date Filter
**Goal**: The owner can filter the existing triage queue by connection year or date range to surface cohorts of people (e.g. ID.me colleagues from 2021–2022)
**Depends on**: Phase 10 (triage exists); can be built in parallel with Phase 12
**Requirements**: TRGE-01
**Success Criteria** (what must be TRUE):
  1. Year buttons in the triage UI filter the queue to contacts whose `linkedinConnectionDate` falls within that year
  2. A two-year range (e.g. 2021–2022) can be set and the queue shows only matching contacts
  3. The year filter survives a page reload (URL-driven via nuqs query params)
  4. Clearing the filter restores the full triage queue
**Plans**: TBD
**UI hint**: yes

### Phase 14: Campaign Builder UI
**Goal**: The owner can create a named campaign with a goal by filtering contacts and multi-selecting recipients from the browser
**Depends on**: Phase 12 (API routes for campaign creation and contact listing)
**Requirements**: CAMP-01, CAMP-02, CAMP-03, CAMP-04, CAMP-05
**Success Criteria** (what must be TRUE):
  1. Navigating to `/dashboard/outreach/` shows the campaign list with per-campaign progress
  2. The campaign builder lets the owner filter contacts simultaneously by howMet, connection year/date range, closeness tier, and outreach status
  3. The owner can checkbox-select individual contacts or use select-all within the current filter
  4. Providing a campaign name and goal/instruction and saving creates the campaign and navigates to its review page
  5. Selecting the same contact twice across separate saves does not create a duplicate email row
**Plans**: TBD
**UI hint**: yes

### Phase 15: Review and Approval UI
**Goal**: The owner can review generated email content for each contact in a campaign, edit it inline, and approve or regenerate individual emails from the browser
**Depends on**: Phase 14 (campaigns exist); Phase 16 (generation skill) provides the `generated` content to review — UI can be built before the skill runs, showing `pending` cards
**Requirements**: REV-01, REV-02, REV-03, REV-04, REV-06
**Success Criteria** (what must be TRUE):
  1. The campaign review page shows all emails with their current status and, once generated, the subject line and body
  2. The owner can edit a generated email's subject and body inline; saving the edit advances the status to `edited`
  3. The owner can approve an email; the approve button is disabled for contacts with `archived_at` set
  4. The owner can click regenerate on a single email to reset it to `pending`
  5. Contacts with no stored email address show a "needs LinkedIn message" badge; the campaign header shows progress counts (approved / total)
**Plans**: TBD
**UI hint**: yes

### Phase 16: Email Generation Skill
**Goal**: Running the `generate-outreach-emails` skill fills all pending emails in a campaign with personalized subject lines and bodies, in the owner's voice, without hallucinating history
**Depends on**: Phase 12 (API write-back routes and generation-context endpoint)
**Requirements**: GEN-01, GEN-02, GEN-03, GEN-04
**Success Criteria** (what must be TRUE):
  1. Running the skill against a campaign advances all `pending` emails to `generated` with a subject line and body written back via REST
  2. Generated emails reference only facts present in the provided contact context (howMet, company/role, logged interactions, closeness); low-context contacts (fewer than 2 logged interactions) are flagged in the write-back
  3. Generated tone is calibrated to closeness tier — conversational for tiers 1–2, professional-warm for tiers 3–5, brief and direct for tiers 7–8
  4. Every generated email passes a built-in LLM-tell scan: no em-dashes, "leverage", "robust", or generic openers like "I hope this message finds you well"
  5. When generation fails for a contact, that email is marked `failed` and the skill continues to the next without crashing
**Plans**: TBD

### Phase 17: Gmail Drafting and Email Discovery Skill
**Goal**: Approved emails are pushed to Gmail as drafts (never sent), contacts without stored emails have addresses discovered from Gmail thread history, and LinkedIn-only contacts are clearly flagged
**Depends on**: Phase 15 (approve gate), Phase 16 (generated content); Gmail MCP already connected — no OAuth setup required
**Requirements**: DISC-01, DISC-02, DISC-03, DRFT-01, DRFT-02, DRFT-03, DRFT-04, DRFT-05
**Success Criteria** (what must be TRUE):
  1. Running the skill creates a Gmail draft for each approved email with a recipient; the Gmail draft id is stored on the email row, the email is marked `drafted`, the contact's `outreachStatus` is set to `reached_out`, and a timeline event is logged
  2. For approved emails where the contact has no stored email, the skill searches Gmail thread history and writes back a discovered address only when at least two signals match (name + company domain, or confirmed thread participant); ambiguous multi-match candidates are surfaced in the review UI for manual selection
  3. When no email can be found by any method, the contact's channel is set to `linkedin_message` and the "needs LinkedIn message" badge appears in the review UI — the contact is never silently dropped
  4. Re-running the skill is idempotent: no duplicate drafts are created; re-drafting an email that was edited after initial drafting updates the existing Gmail draft in-place
  5. The skill contains zero send-family Gmail calls — every Gmail action is `create_draft` or `drafts.update`; this invariant is verifiable by grepping the skill file for "send" before any real campaign run
**Plans**: TBD
**Research flag**: Phase-level research needed before planning — inspect `mcp__gmail__search_threads` response shape (participant email extraction) and validate confidence-scoring heuristics against real contacts

## Progress

**Execution order:** Phases executed in numeric order 1 → 2 → 3 → … → 17.

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
| 11. Schema, Enums, and State Machine | v1.2 | 0/3 | Planned | - |
| 12. API Routes | v1.2 | 0/TBD | Not started | - |
| 13. Triage Connection-Date Filter | v1.2 | 0/TBD | Not started | - |
| 14. Campaign Builder UI | v1.2 | 0/TBD | Not started | - |
| 15. Review and Approval UI | v1.2 | 0/TBD | Not started | - |
| 16. Email Generation Skill | v1.2 | 0/TBD | Not started | - |
| 17. Gmail Drafting and Email Discovery Skill | v1.2 | 0/TBD | Not started | - |

---
*Last updated: 2026-06-20 — Phase 11 planned (3 plans). v1.2 Networking Outreach Campaigns roadmap created (Phases 11–17). v1.0 (Phases 1–6) and v1.1 (Phases 7–10) shipped and archived in `.planning/milestones/`.*
