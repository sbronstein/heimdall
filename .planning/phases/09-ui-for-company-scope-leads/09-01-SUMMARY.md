---
phase: 09-ui-for-company-scope-leads
plan: 01
subsystem: job-leads-ui
tags: [ui, job-leads, company-scope, tdd, jl-c8, jl-c9]
dependency_graph:
  requires: [Phase 7 schema (linkedinJobUrl nullable), Phase 8 skill (company-scope lead creation)]
  provides: [company-scope lead detail view (JL-C8), company-scope list row (JL-C9)]
  affects: [job-leads detail page, job-leads list page]
tech_stack:
  added: []
  patterns: [SSR-structural test with renderToString + JSDOM, isCompanyScope discriminator pattern]
key_files:
  created:
    - src/features/job-leads/components/scrape-results.test.tsx
    - src/features/job-leads/components/job-lead-card.test.tsx
  modified:
    - src/features/job-leads/components/scrape-results.tsx
    - src/features/job-leads/components/job-lead-card.tsx
decisions:
  - "Discriminator locked to lead.linkedinJobUrl === null — never roleTitle sentinel string (per Phase 7/8 D-12)"
  - "Test fixtures include applicationId: null — field added in Phase 7, missing from UI-SPEC fixtures"
  - "SSR-structural test pattern (renderToString + JSDOM) sufficient for badge/icon/link assertions — no @testing-library/react needed"
metrics:
  duration: "~11 minutes"
  completed: "2026-05-20"
  tasks_completed: 2
  files_changed: 4
---

# Phase 09 Plan 01: UI for Company-Scope Leads Summary

**One-liner:** Conditional branches in two job-lead client components render company-scope leads (`linkedinJobUrl === null`) with company name + "Company scrape" badge (detail) and `IconBuildingCommunity` + "Company" pill (list row), pinned by SSR-structural rendered tests.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing test for scrape-results (JL-C8) | 8f4971b | scrape-results.test.tsx |
| 1 (GREEN) | ScrapeResults company-scope header branch | bb2302d | scrape-results.tsx, scrape-results.test.tsx |
| 2 (RED) | Failing test for job-lead-card (JL-C9) | c41a933 | job-lead-card.test.tsx |
| 2 (GREEN) | JobLeadCard icon swap + pill + sentinel suppression | 2df91d2 | job-lead-card.tsx, job-lead-card.test.tsx |

## Behavior Delivered

**JL-C8 (scrape-results.tsx):**
- Company-scope leads (`linkedinJobUrl === null`): company name in `CardTitle`, `Badge variant='secondary'` with "Company scrape" copy, no role-title line, no "View Job Posting" link (existing null-guard preserved)
- Job-URL leads: unchanged — role title in `CardTitle`, company name as subtitle, "View Job Posting" link conditionally shown
- Null `companyName` fallback: renders "Company scrape" as the title text, never "Unknown Role"

**JL-C9 (job-lead-card.tsx):**
- Company-scope leads: `IconBuildingCommunity` leading icon, role subtitle suppressed (sentinel `'Company-wide scrape'` never renders), `Badge variant='outline'` "Company" pill as first item in right-side cluster
- Job-URL leads: unchanged — `IconBuilding` icon, role subtitle renders normally, no "Company" pill

## Test Results

- `scrape-results.test.tsx`: 10/10 passing (3 describe blocks: company-scope, null-name fallback, job-URL)
- `job-lead-card.test.tsx`: 6/6 passing (icon assertions, pill assertions, sentinel suppression, role subtitle)
- Full `npm test` suite: all passing (no regressions)
- `npx tsc --noEmit`: clean

## Deviations from Plan

**1. [Rule 2 - Missing Field] Test fixtures augmented with `applicationId: null`**
- **Found during:** Task 1 — `npx tsc --noEmit` reported `applicationId` missing from fixtures
- **Issue:** `JobLead` type gained `applicationId: string | null` in Phase 7 schema; the UI-SPEC test fixtures predated this and omitted the field
- **Fix:** Added `applicationId: null` to all three test fixtures in `scrape-results.test.tsx` and both fixtures in `job-lead-card.test.tsx`
- **Files modified:** `scrape-results.test.tsx`, `job-lead-card.test.tsx`
- **Commit:** bb2302d (bundled with GREEN implementation for Task 1)

## TDD Gate Compliance

All tasks followed RED → GREEN discipline:
- Task 1 RED: commit 8f4971b (`test(09-01): add failing test for ScrapeResults...`)
- Task 1 GREEN: commit bb2302d (`feat(09-01): implement ScrapeResults...`)
- Task 2 RED: commit c41a933 (`test(09-01): add failing test for JobLeadCard...`)
- Task 2 GREEN: commit 2df91d2 (`feat(09-01): implement JobLeadCard...`)

## Known Stubs

None. Both components wire live `JobLead` data from RSC page props — no hardcoded empty values or placeholders.

## Threat Flags

None. This phase is a read-only rendering change. React auto-escapes all text children (`lead.companyName`, `lead.roleTitle`). The tests assert HTML-escaped output (`VP Data &amp; AI`) pinning XSS protection. No new endpoints, auth surface, or data mutations introduced.

## Self-Check: PASSED

- [x] `src/features/job-leads/components/scrape-results.tsx` — exists, modified
- [x] `src/features/job-leads/components/scrape-results.test.tsx` — exists, created
- [x] `src/features/job-leads/components/job-lead-card.tsx` — exists, modified
- [x] `src/features/job-leads/components/job-lead-card.test.tsx` — exists, created
- [x] Commits 8f4971b, bb2302d, c41a933, 2df91d2 — all present in git log
- [x] `npx vitest run scrape-results.test.tsx job-lead-card.test.tsx` — 16/16 passing
- [x] `npx tsc --noEmit` — clean
- [x] Full `npm test` suite — passing (no regressions)
