# Milestones: Heimdall

Historical ledger of shipped versions. Newest first. Full per-milestone detail lives in `.planning/milestones/v[X.Y]-{ROADMAP,REQUIREMENTS}.md`.

---

## v1.1 — LinkedIn Scraping by Company

**Shipped:** 2026-05-20
**Phases:** 7–10 (4 phases) · **Plans:** 11 · **Tasks:** ~22
**Git range:** `d1528c6` feat(07-01) → `1e7ce3e` merge(10-04)
**Code delta:** 30 files in `src/` + `drizzle/` + `.claude/skills`, +6,183 / −112 lines
**Archives:** [v1.1-ROADMAP.md](./milestones/v1.1-ROADMAP.md) · [v1.1-REQUIREMENTS.md](./milestones/v1.1-REQUIREMENTS.md)

**Delivered:** The `scrape-linkedin-connections` skill can now scrape 2nd-degree connections at any target company (LinkedIn company URL or bare name), not just at companies attached to a job posting — via synthetic `job_leads` rows reusing the existing pipeline. Triage also surfaces each connection's company and role *at the time of connection*, backfilled by a paced agent-browser sweep.

**Key accomplishments:**

1. **Schema + API foundation (Phase 7)** — Nullable `linkedin_job_url`/`role_title` (migration 0009) + `POST /api/job-leads` company-scope branch (discriminated Zod union, auto-create/dedup company); state machine proven input-shape agnostic via D-17 regression pins.
2. **Skill input parsing + drain (Phase 8)** — `scrape-linkedin-connections` rewritten with a 5-branch argument parser (job URL / company URL / bare name / UUID / drain), three-path `linkedin-navigation.md`, drain-mode loop branching on `linkedinJobUrl`, and a `companyLinkedinUrl` projection on `GET /api/job-leads`.
3. **UI for company-scope leads (Phase 9)** — Detail page and list view render null-URL leads cleanly (hide "View job posting", "Company scrape" badge, distinct list icon) — JL-C8/JL-C9, SSR-structural tests.
4. **At-connection enrichment (Phase 10)** — Schema + `contact_enrichment_status` enum (migration 0010), `PATCH /api/contacts/[id]/enrichment` + `GET /api/contacts/enrichment-queue` + CSV import seeding, triage recommendation-card render + just-in-time enrichment, and skill per-profile + paced batch-sweep modes with anti-bot pacing docs.

**Requirements:** JL-C1..JL-C9 + ENR-01..ENR-06 — all complete (15 requirements).

**Known deferred items at close (acknowledged, carried forward):**

- Open UAT scenarios: Phase 6 (1), Phase 8 (4) — partial human UAT.
- Verification sign-off `human_needed`: Phases 1, 6, 8; Phase 9 verification `gaps_found`.
- Pending user action (quick task 260520-n3s): run `node scripts/backfill-enrichment-reset.mjs` dry-run then `--apply` to reset ~1500 legacy contacts and repopulate the enrichment queue (live Neon prod write — not yet run).
- See STATE.md → Deferred Items for the full table.

---

## v1.0 — MVP / Brownfield Hardening

**Shipped:** 2026-05-14 *(recorded retroactively at the v1.1 close; v1.0 was declared complete in PROJECT.md but never formally archived — Phases 1–6 detail remains in the reorganized `ROADMAP.md` and the v1.1 requirements archive)*
**Phases:** 1–6 (6 phases) · **Plans:** 20

**Delivered:** Stabilized and hardened the brownfield job-search CRM — eliminated the LinkedIn-import hydration crash, stood up a Vitest + PGlite test harness, authenticated all `/api/*` routes, stripped starter-template residue, completed the LinkedIn-scrape skill (moving scraping out of the app into a Claude Code skill driving `vercel-labs/agent-browser`), and eliminated the N+1 patterns straining the 1500-contact dataset.

**Key accomplishments:**

1. **Critical bug fix (Phase 1)** — Removed the `app-sidebar.tsx` hydration crash that broke navigation after large LinkedIn imports (BUG-01/BUG-02).
2. **Test infrastructure (Phase 2)** — Vitest + PGlite-backed Drizzle harness; 79 tests covering the API envelope, `canTransition()`, `logTimeline()`, CSV parse, bridge-score; BUG-01 regression pinned; husky pre-push gate.
3. **Security hardening (Phase 3)** — Every `/api/*` route requires a valid Clerk session via `middleware.ts`; removed the no-op GitHub auth button + external star fetch.
4. **Starter-template cleanup (Phase 4)** — Deleted `products` feature, starter routes, the 805-line `infobar.tsx`, the kanban route, and `__CLEANUP__/`.
5. **Job Leads completion (Phase 5)** — Scraping moved out of the app into the `scrape-linkedin-connections` skill; queue + categorized failures surface via the DB (JL-B1..JL-B5).
6. **Performance (Phase 6)** — Bulk inserts/updates in transactions, DB-side dedup, 5 hot-path indexes (migration 0008), N+1 patterns eliminated (PERF-A1..A5).

**Requirements:** BUG-01/02, TEST-A1..A3, SEC-A1/A2, DEBT-A1..A5, JL-B1..B5 (JL-A1..A5 superseded), PERF-A1..A5 — all complete.
