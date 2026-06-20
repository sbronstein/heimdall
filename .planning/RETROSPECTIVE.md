# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.1 — LinkedIn Scraping by Company

**Shipped:** 2026-05-20 (archived 2026-06-20)
**Phases:** 4 (7–10) | **Plans:** 11 | **Timeline:** ~2 days (2026-05-19 → 2026-05-20)

### What Was Built
- Company-scope LinkedIn scraping: the `scrape-linkedin-connections` skill now accepts a company URL or bare name, creating synthetic `job_leads` (`linkedinJobUrl = null`) that reuse the entire existing queue → prospects → recommendations pipeline (Phases 7–9).
- A 5-branch skill argument parser + three-path `linkedin-navigation.md` + drain-mode branching on `linkedinJobUrl` — both lead types drain from one `?status=queued` queue (Phase 8).
- At-connection company/role enrichment for triage: schema + enum (migration 0010), `PATCH /api/contacts/[id]/enrichment` + `GET /api/contacts/enrichment-queue` + CSV seeding, triage card render + just-in-time enrichment, and a paced agent-browser batch-sweep with documented anti-bot pacing (Phase 10).

### What Worked
- **Schema-first phase ordering** (Phase 7 nullable columns + API before skill/UI) meant Phases 8 and 9 never had to renegotiate the data shape — the discriminated-union `POST` and null-URL state machine held.
- **Reusing the synthetic-lead pattern** instead of introducing a new entity kept the blast radius tiny: no new table, route, or status value; the state machine was proven input-shape agnostic with pure regression tests (D-17).
- **TDD on the UI branches** (failing SSR-structural test → implement) for JL-C8/JL-C9 caught the company-scope rendering contract cleanly.
- **Worktree-isolated executors** (per the merge commits) let Phase 10's four plans land without stepping on each other.

### What Was Inefficient
- **Phase 10's requirements (ENR-01..ENR-06) were never added to REQUIREMENTS.md** — they lived only in the ROADMAP phase detail, so the traceability table drifted out of sync and had to be reconciled at archive time.
- **Verification/UAT sign-offs lagged the code** — Phases 1, 6, 8, 9 carried open verification/UAT items into the milestone close (acknowledged as deferred). The automated suite was green, but human UAT wasn't kept current.
- **The milestone close itself was deferred** — v1.0 was declared complete in PROJECT.md but never archived or tagged, so the first real `complete-milestone` run had to reconcile two milestones' worth of drift (stale "Pending" traceability rows, no `milestones/` dir, no tags).

### Patterns Established
- **Synthetic-row reuse over new entities** — extend an existing table with nullable columns + a discriminated input union rather than adding a parallel pipeline.
- **Out-of-app scraping via a Claude Code skill** (continued from v1.0 Phase 5) — keep Playwright/agent-browser entirely out of the serverless runtime; the app owns only the queue and results.
- **Human-paced agent-browser sweeps** with randomized delays + session caps for any bulk LinkedIn operation, documented in the skill references.
- **Close milestones promptly** — archive + tag at the boundary so traceability and `milestones/` don't drift.

### Key Lessons
1. When a phase is inserted mid-milestone (Phase 10), add its requirements to REQUIREMENTS.md immediately — don't leave them only in the ROADMAP, or the traceability table silently rots.
2. Keep human UAT/verification sign-offs flowing with the code; a green automated suite is necessary but not the same as milestone-level verification.
3. Run `/gsd:complete-milestone` at each boundary — a deferred close compounds drift (untagged releases, unarchived requirements, stale statuses).

### Cost Observations
- Model mix / session count: not tracked for this milestone.
- Notable: 11 plans across ~2 calendar days with worktree-parallel executors; docs-heavy phases (8, 10) were largely skill/reference rewrites rather than app code.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 1–6 | 20 | Brownfield hardening; moved LinkedIn scraping out of the app into a Claude Code skill (Phase 5 reshape) |
| v1.1 | 7–10 | 11 | Company-scope scraping via synthetic leads; at-connection enrichment; worktree-parallel execution |

### Cumulative Quality

| Milestone | Test Harness | Migrations (cumulative) | Notable |
|-----------|--------------|-------------------------|---------|
| v1.0 | Vitest + PGlite, 79 tests | through 0008 | All `/api/*` authenticated; N+1 eliminated; starter residue removed |
| v1.1 | extended with company-scope + D-17 route tests | through 0010 | State machine proven input-shape agnostic; SSR-structural UI tests |

### Top Lessons (Verified Across Milestones)

1. Reuse existing tables/routes/state machines via nullable columns + discriminated inputs before reaching for a new entity — held for both the scrape-skill reshape (v1.0) and company-scope leads (v1.1).
2. Keep planning artifacts (REQUIREMENTS traceability, milestone archives, git tags) in lockstep with shipped code; deferring that bookkeeping compounds into reconciliation work.
