---
phase: 08-skill-input-parsing-navigation-branching-drain
plan: "03"
subsystem: skill-docs
tags:
  - skill
  - drain-mode
  - api-docs
  - troubleshooting
dependency_graph:
  requires:
    - 08-01 (GET /api/job-leads projection ships companyLinkedinUrl)
    - 08-02 (SKILL.md argument parser 5-branch + linkedin-navigation.md Company-URL/Bare-name paths)
  provides:
    - SKILL.md drain loop with linkedinJobUrl branch (D-11/D-12/JL-C7)
    - heimdall-api.md sections 5 and 6 (POST /api/job-leads, PUT /api/companies/[id])
    - troubleshooting.md three new failure-mode bullets under LinkedIn navigation failed
  affects:
    - skill runtime behavior: drain mode now branches on lead.linkedinJobUrl
    - skill docs: three reference files updated
tech_stack:
  added: []
  patterns:
    - single-loop drain with inline linkedinJobUrl null-branch (D-11/D-12/JL-C7)
    - D-14 mid-drain fallback: bare-name search + PUT /api/companies backfill
    - D-15 per-lead confirmation line
key_files:
  created: []
  modified:
    - .claude/skills/scrape-linkedin-connections/SKILL.md
    - .claude/skills/scrape-linkedin-connections/references/heimdall-api.md
    - .claude/skills/scrape-linkedin-connections/references/troubleshooting.md
decisions:
  - "Discriminator is lead.linkedinJobUrl === null (D-12); roleTitle sentinel never used as control-flow"
  - "D-14 backfill verb is PUT (not PATCH) matching src/app/api/companies/[id]/route.ts:55"
  - "Could not extract company name warning kept on single line for grep-ability"
  - "awk /Mid-drain/ range check in acceptance criteria has a known awk edge-case; PUT verified via grep -A10 instead"
metrics:
  duration: "6m 20s"
  completed_date: "2026-05-19"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 3
  insertions: 178
  deletions: 8
---

# Phase 8 Plan 03: Drain Mode Branching + API Doc Updates Summary

**One-liner:** Drain loop rewritten with single `lead.linkedinJobUrl === null` branch (D-11/D-12/JL-C7), D-14 mid-drain fallback (bare-name search + PUT `/api/companies/<id>` backfill), D-15 per-lead confirmation; heimdall-api.md extended with GET `companyLinkedinUrl` field + two new endpoint sections; troubleshooting.md gains three new Phase 8 failure-mode bullets.

## Tasks Completed

| # | Task | Commit | Files | +/- |
|---|------|--------|-------|-----|
| 1 | Rewrite SKILL.md Drain mode loop with linkedinJobUrl branch, D-14 fallback, D-15 confirmation | 533df4f | SKILL.md | +41/-6 |
| 2 | Update heimdall-api.md — extend GET response, add POST /api/job-leads + PUT /api/companies sections | 36357b6 | heimdall-api.md | +105/-2 |
| 3 | Add three new failure-mode bullets to troubleshooting.md under existing categories | d127704 | troubleshooting.md | +32/-0 |

## What Was Built

### Task 1 — SKILL.md Drain Mode Loop Rewrite

Replaced the 6-step drain mode list with a branched loop:

- **Step 1:** Fetch queue via `GET /api/job-leads?status=queued&limit=50`. Notes that each row now includes `companyLinkedinUrl` (D-13).
- **Step 2:** Render markdown table with scope column (`linkedinJobUrl ? 'job-URL' : 'company-scope'`).
- **Step 3:** User confirmation unchanged.
- **Step 4:** For each approved lead, branch on `lead.linkedinJobUrl`:
  - `null` → company-scope branch: use `lead.companyLinkedinUrl` or run D-14 fallback (bare-name flow + `PUT /api/companies/<id>`) if null; emit D-15 confirmation line.
  - non-null → existing job-URL branch (navigate to lead.linkedinJobUrl).
  - Both branches converge at Shared Steps 4–5.
- **Step 5:** On failure, continue (new: user cancel of D-14 disambiguation writes `LinkedIn navigation failed: user cancelled disambiguation for <companyName>`).
- **Step 6:** Summary unchanged.

Hard constraints verified: PUT not PATCH, no sentinel control-flow, single loop/endpoint.

### Task 2 — heimdall-api.md Updates

Three surgical edits:

1. **GET /api/job-leads response shape** — added `companyLinkedinUrl` field (null or string) plus D-13 note (left-joined from companies.linkedinUrl) and D-12 discriminator note (linkedinJobUrl === null, not roleTitle sentinel).
2. **Section 5: POST /api/job-leads** — documents discriminated union body (Shape A: `{ linkedinJobUrl }`, Shape B: `{ companyName, linkedinCompanyUrl? }`), side effects (company lookup/create, linkedinUrl backfill on null, idempotent dedup 200 vs 201), curl example.
3. **Section 6: PUT /api/companies/[id]** — D-14 backfill; explicitly notes verb is PUT not PATCH (per route.ts:55), documents `updateCompanySchema` `linkedinUrl` field, curl with `-X PUT`.

Sections 1–4 and Error envelopes table are byte-identical to their pre-edit state.

### Task 3 — troubleshooting.md Updates

Three new bullets appended to `## LinkedIn navigation failed` > "Common triggers and remediation":

1. **Company-name-extraction failure (D-05/D-06)** — NOT a hard failure; falls back to slug + warning `Could not extract company name from <url>; using slug "<slug>" as fallback.`
2. **Zero matches on bare-name LinkedIn search (D-09)** — before any DB row is created; distinguishable from `No prospects found`.
3. **Mid-drain disambiguation (D-14)** — interactive prompt; PUT backfill; user cancel → `failed` with `LinkedIn navigation failed: user cancelled disambiguation for <companyName>`.

Two new bullets appended to "What the skill does NOT handle (yet)":

4. Auto-pick disambiguation single matches (D-08 declined)
5. Retry-with-broader-query on zero matches (D-09 declined)

No new top-level `## ` category added — 7 sections total, unchanged.

## Line-Count Delta per File

| File | Insertions | Deletions | Net |
|------|------------|-----------|-----|
| SKILL.md | +47 | -6 | +41 |
| references/heimdall-api.md | +107 | -2 | +105 |
| references/troubleshooting.md | +32 | 0 | +32 |
| **Total** | **+186** | **-8** | **+178** |

## Heading Count Before/After

| File | Before | After |
|------|--------|-------|
| heimdall-api.md `### N.` sections | 4 | 6 |
| troubleshooting.md `## ` headings | 7 | 7 (unchanged) |

## Deviations from Plan

### Auto-fixed Issues

None.

### Minor Adjustments

1. **Warning text reformatted for grep-ability** — the plan's bullet text had `Could not extract\n  company name from <url>` split across two lines (following natural prose wrapping). The acceptance criterion uses `grep -q "Could not extract company name"` which fails on multi-line matches. Merged to one long line so the grep check passes. No content change.

2. **awk /Mid-drain/ acceptance check has a range-pattern edge case** — the plan's acceptance criterion `awk '/Mid-drain disambiguation/,/^- \*\*|^## /' | grep -q "PUT"` stops awk at the same line it starts (the line matches both the start pattern and the end pattern `^- \*\*`). Verified correctness via `grep -A10 "Mid-drain disambiguation" | grep "PUT"` instead — the content is correct (PUT appears on the very next lines of the bullet). Logged as a known awk edge-case; the planner's check was overly narrow.

## Known Stubs

None. This plan updates markdown skill documentation only — no code or UI changes.

## Threat Flags

None. This plan adds three endpoint-documentation paragraphs and three troubleshooting bullets — same disclosure surface as the existing docs (bearer-token pattern, route paths). No new credentials, no new secrets.

## Phase Verification Next Steps

Manual dev-server smoke test to exercise the two new branches end-to-end. These are agent-browser-driven flows and are not unit-testable per Phase 5 D-21:

1. **Company-URL branch:** `/scrape-linkedin-connections https://www.linkedin.com/company/openai/` — confirm argument parser routes to Company-URL flow, skill navigates to `/people/`, extracts name from page header, POSTs to `/api/job-leads`.

2. **Bare-name branch:** `/scrape-linkedin-connections OpenAI` — confirm argument parser routes to bare-name flow, skill navigates to search URL, presents disambiguation list, user picks, skill POSTs to `/api/job-leads`.

3. **Drain mode with company-scope lead:** Manually create a company-scope lead (`POST /api/job-leads { companyName: "OpenAI", linkedinCompanyUrl: "..." }`), then invoke `/scrape-linkedin-connections` with no argument — confirm drain loop emits `Lead <id>: company-scope (OpenAI) — navigating to .../people/...` and proceeds.

4. **D-14 fallback:** Create a company-scope lead with `linkedinCompanyUrl: null`, invoke drain — confirm mid-drain disambiguation prompt appears, after user pick confirm `PUT /api/companies/<id>` writes back the URL.

## Self-Check: PASSED

All files found and all commits verified:

- SKILL.md: exists, drain loop rewritten with linkedinJobUrl branch
- heimdall-api.md: exists, 6 endpoint sections confirmed
- troubleshooting.md: exists, 7 top-level sections, 3 new bullets added
- 08-03-SUMMARY.md: exists
- Commit 533df4f (Task 1): verified
- Commit 36357b6 (Task 2): verified
- Commit d127704 (Task 3): verified
