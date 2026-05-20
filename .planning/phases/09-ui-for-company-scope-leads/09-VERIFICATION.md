---
phase: 09-ui-for-company-scope-leads
verified: 2026-05-20T23:07:30Z
status: gaps_found
score: 4/5 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Company name and employee count (once scraped) are displayed prominently on the detail page for company-scope leads (ROADMAP SC #3)"
    status: partial
    reason: "Company name is now shown prominently in the CardTitle slot (shipped). Employee count display is intentionally absent — documented as deferred in 09-CONTEXT.md <deferred> section before planning began. No later milestone phase in ROADMAP.md picks this up; it is an open roadmap item."
    artifacts:
      - path: "src/features/job-leads/components/scrape-results.tsx"
        issue: "Employee-count line deliberately omitted. No join to companies.employeeCount; scrape-results.tsx does not read scrapedData.employeeCount. Detail page RSC (app/dashboard/job-leads/[id]/page.tsx) does not join companies table."
    missing:
      - "When the skill starts writing employeeCount during the /people/ scrape, the detail RSC must join companies (or read scrapedData.employeeCount) and scrape-results.tsx must render a count line under the company-name CardTitle slot"
---

# Phase 9: UI for Company-Scope Leads — Verification Report

**Phase Goal:** The job-lead detail page and list view render company-scope leads (where `linkedinJobUrl` is null) cleanly — no broken links, clear labeling, scannable at a glance.
**Verified:** 2026-05-20T23:07:30Z
**Status:** gaps_found — 1 gap (ROADMAP SC #3 employee count, pre-planned deferral)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | D-01: Company-scope lead detail shows company name in CardTitle + "Company scrape" Badge variant='secondary'; role-title line absent; no broken link | ✓ VERIFIED | `scrape-results.tsx:9` — `const isCompanyScope = lead.linkedinJobUrl === null`; line 21-27 — ternary renders `<div className='flex items-center gap-2'><CardTitle>{lead.companyName \|\| 'Company scrape'}</CardTitle><Badge variant='secondary'>Company scrape</Badge></div>` when isCompanyScope |
| 2  | D-02: Job-URL lead detail unchanged — role title as CardTitle, company name as subtitle, "View Job Posting" link present via existing null-guard | ✓ VERIFIED | `scrape-results.tsx:29-37` — false branch renders `<CardTitle>{lead.roleTitle \|\| 'Unknown Role'}</CardTitle>` + `<p>{lead.companyName \|\| 'Unknown Company'}</p>`; null-guard at line 46 `{lead.linkedinJobUrl && (...)}` untouched |
| 3  | D-03: Company-scope list row shows IconBuildingCommunity + "Company" outline pill; job-URL rows keep IconBuilding, no pill; sentinel never renders | ✓ VERIFIED | `job-lead-card.tsx:23` — `const isCompanyScope = lead.linkedinJobUrl === null`; line 31-34 ternary swaps icons; line 39 — `{!isCompanyScope && lead.roleTitle && (...)}` suppresses subtitle; line 46-48 — `{isCompanyScope && <Badge variant='outline'>Company</Badge>}` as first child of right-side cluster |
| 4  | Null companyName company-scope lead renders "Company scrape" as CardTitle text — never "Unknown Role" | ✓ VERIFIED | `scrape-results.tsx:24` — `{lead.companyName \|\| 'Company scrape'}` in the isCompanyScope branch; "Unknown Role" only appears in the `isCompanyScope === false` branch (line 31) |
| 5  | Company name and employee count displayed prominently on detail page (ROADMAP SC #3) | ✗ PARTIAL | Company name: shipped (see truth #1). Employee count: intentionally absent per `09-CONTEXT.md <deferred>`. No `employeeCount` line in `scrape-results.tsx`; detail RSC does not join `companies` table. No later phase in ROADMAP.md closes this gap. |

**Score:** 4/5 truths verified (truth #5 is partial — the name-density half shipped, the employee-count half is an open product backlog item).

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/features/job-leads/components/scrape-results.tsx` | Detail header conditional branch keyed off `linkedinJobUrl === null`; Badge import; "Company scrape" copy | ✓ VERIFIED | Contains `isCompanyScope`, `import { Badge }`, `Company scrape` badge copy. 63 lines, substantive. Wired via RSC prop chain `[id]/page.tsx → JobLeadDetail → ScrapeResults`. |
| `src/features/job-leads/components/scrape-results.test.tsx` | SSR-structural rendered tests for detail view with company-scope + job-URL + null-name fixtures | ✓ VERIFIED | 145 lines; 3 describe blocks; 9 assertions; uses `renderToString` + `JSDOM`. Contains "Company scrape" text assertions. |
| `src/features/job-leads/components/job-lead-card.tsx` | List-row icon swap + "Company" pill + sentinel suppression; `IconBuildingCommunity` import | ✓ VERIFIED | `IconBuildingCommunity` appears at import (line 7) and usage (line 32) — 2 occurrences. `isCompanyScope` discriminator, sentinel suppression `!isCompanyScope && lead.roleTitle`, pill present. |
| `src/features/job-leads/components/job-lead-card.test.tsx` | SSR-structural rendered tests with mixed company-scope + job-URL fixtures | ✓ VERIFIED | 117 lines; 6 assertions; `data-icon="building-community"` assertions for icon verification; outline badge text assertions for pill verification. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scrape-results.tsx` | `lead.linkedinJobUrl === null` | `isCompanyScope` drives CardHeader branch | ✓ WIRED | Line 9 declares discriminator; line 21 branches JSX on it |
| `job-lead-card.tsx` | `lead.linkedinJobUrl === null` | `isCompanyScope` drives icon swap, subtitle suppression, pill | ✓ WIRED | Line 23 declares discriminator; lines 31, 39, 46 branch on it |
| `scrape-results.tsx` | `lead.linkedinJobUrl` null-guard | `{lead.linkedinJobUrl && (...)}` at line 46 | ✓ WIRED | Existing guard preserved; "View Job Posting" link hidden for company-scope leads |
| `job-lead-card.tsx` | `!isCompanyScope && lead.roleTitle` | Sentinel suppression guard | ✓ WIRED | Line 39 — sentinel `'Company-wide scrape'` never renders as visible subtitle |

---

### Data-Flow Trace (Level 4)

Both components are leaf `'use client'` components that receive a `JobLead` prop from the RSC page → `JobLeadDetail` (for scrape-results) or `JobLeadsPage` → map (for job-lead-card). They render prop data only — no client-side fetch. The data-flow verification belongs to the upstream RSC pages (Phase 7 scope). For Phase 9 the relevant check is that the discriminator `linkedinJobUrl` on the prop drives the conditional branches — confirmed by Level 3 wiring verification above.

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `scrape-results.tsx` | `lead.linkedinJobUrl` | RSC prop (Drizzle-typed `JobLead`) | Yes — Drizzle `$inferSelect` on nullable column | ✓ FLOWING |
| `job-lead-card.tsx` | `lead.linkedinJobUrl` | RSC prop (Drizzle-typed `JobLead`) | Yes — same | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| scrape-results.test.tsx — all 9 assertions | `npx vitest run src/features/job-leads/components/scrape-results.test.tsx` | 1 file, 9 tests passed | ✓ PASS |
| job-lead-card.test.tsx — all 6 assertions | `npx vitest run src/features/job-leads/components/job-lead-card.test.tsx` | 1 file, 6 tests passed | ✓ PASS |
| Both test files together | `npx vitest run scrape-results.test.tsx job-lead-card.test.tsx` | 2 files, 16 tests passed in 907ms | ✓ PASS |
| TypeScript strict mode | `npx tsc --noEmit` | Exit 0, no errors | ✓ PASS |

---

### Probe Execution

Step 7c: SKIPPED — no `probe-*.sh` files declared in PLAN or present in `scripts/*/tests/`. Phase 9 is a UI rendering phase, not a migration or CLI tooling phase.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| JL-C8 | 09-01-PLAN.md | Detail page renders gracefully when `linkedinJobUrl` is null — link hidden, "Company scrape" badge shown, company name prominent | ✓ SATISFIED | `scrape-results.tsx` isCompanyScope branch ships company name in CardTitle + "Company scrape" Badge + null-guard on link. Pinned by `scrape-results.test.tsx` (9 tests). Employee count not yet satisfied (ROADMAP SC #3 partial). |
| JL-C9 | 09-01-PLAN.md | List view visually distinguishes company-scope from job-URL leads | ✓ SATISFIED | `job-lead-card.tsx` ships IconBuildingCommunity + "Company" outline pill for isCompanyScope leads; sentinel suppressed. Pinned by `job-lead-card.test.tsx` (6 tests). |

**REQUIREMENTS.md traceability:** Both JL-C8 and JL-C9 are marked `[x]` (complete) in `.planning/REQUIREMENTS.md` lines 133-134 and recorded as Phase 9 / Complete in the traceability table (lines 209-210). No orphaned requirements found.

**Partial gap note on JL-C8:** REQUIREMENTS.md text for JL-C8 includes "company name + employee count (once scraped) are shown prominently." The employee count clause is explicitly unmet and flagged in the gaps section below.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | No TBD/FIXME/XXX/TODO/HACK/placeholder markers found in either modified component | — | — |

Scan ran on `scrape-results.tsx` and `job-lead-card.tsx`. Both files are clean. No stub `return null`, no hardcoded empty arrays, no `dangerouslySetInnerHTML`. React text children auto-escape (`VP Data &amp; AI` confirmed by test assertions).

---

### Human Verification Required

None. All must-have behaviors are mechanically testable via the rendered tests. The phase is a read-only rendering change of server-fetched props — no real-time behavior, no external service, no visual-only assertion.

The one item that might warrant a visual check (that the "Company scrape" badge sits inline without overflowing the card at narrow widths) is not gating — the `flex items-center gap-2` wrapper is well-established in the codebase and the badge is not critical-path information per the UI spec.

---

### Gaps Summary

**1 gap — ROADMAP SC #3 employee count (pre-planned product backlog item)**

ROADMAP Phase 9 success criterion #3 requires: "Company name and employee count (once scraped) are displayed prominently on the detail page for company-scope leads."

- The company-name half shipped (CardTitle slot, truth #1 verified).
- The employee-count half is absent. This was explicitly documented as out-of-scope before planning began (`09-CONTEXT.md <deferred>` section) because no upstream pipeline currently writes employee count for company-scope leads — `companies.employeeCount` exists in the schema but is not populated by the Phase 8 skill, and the detail RSC does not join `companies`.

This is a known product gap deliberately parked, not an execution failure. The CONTEXT.md records it clearly: "This is the one partial gap against ROADMAP Phase 9 success criterion #3 — name density ships, numeric count does not." However, since Phase 9 is the final phase in the ROADMAP and no subsequent phase absorbs this item, it cannot be deferred per Step 9b and must remain as a reported gap.

**Root cause:** The Phase 8 skill does not capture `employeeCount` during the LinkedIn `/company/<slug>/people/` scrape, so no data to display exists yet. The fix requires two coordinated steps: (1) skill-side: write employee count to `companies.employeeCount` or `scrapedData` during scrape; (2) UI-side: join `companies` in the detail RSC and render a count line in `scrape-results.tsx` under the company-name CardTitle.

---

_Verified: 2026-05-20T23:07:30Z_
_Verifier: Claude (gsd-verifier)_
