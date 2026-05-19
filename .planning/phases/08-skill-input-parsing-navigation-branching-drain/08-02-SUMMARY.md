---
phase: 08-skill-input-parsing-navigation-branching-drain
plan: "02"
subsystem: skill-docs
tags:
  - skill
  - linkedin
  - navigation
  - argument-parsing
  - docs-only
dependency_graph:
  requires:
    - "08-01 (GET /api/job-leads companyLinkedinUrl projection — provides the field the drain-mode drain reads)"
    - "Phase 7 POST /api/job-leads discriminated union (company-scope shape)"
  provides:
    - "5-branch argument parser routing (JL-C1, JL-C2)"
    - "Three-path linkedin-navigation.md (JL-C6)"
    - "Bare-name disambiguation UX spec (JL-C5)"
    - "Company-URL and Bare-name navigation cheat-sheets for executor"
  affects:
    - "08-03 (drain loop rewrite reads the updated SKILL.md and navigation doc)"
    - "Phase 9 (UI discriminator uses same lead.linkedinJobUrl === null predicate)"
tech_stack:
  added: []
  patterns:
    - "Skill markdown surgical extension (keep Setup/Error handling/Constraints verbatim, rewrite specific sections)"
    - "Prefix-based sub-heading naming (Job-URL Step N / Company-URL Step N / Bare-name Step N / Shared Step N)"
key_files:
  created: []
  modified:
    - .claude/skills/scrape-linkedin-connections/SKILL.md
    - .claude/skills/scrape-linkedin-connections/references/linkedin-navigation.md
decisions:
  - "PUT (not PATCH) for /api/companies/<id> — matches the actual route handler at src/app/api/companies/[id]/route.ts:55"
  - "Job-URL Steps 1–3 and Shared Steps 4–5 preserved verbatim from the previous doc"
  - "5-branch argument parser replaces 4-branch; old stop-and-ask terminal branch removed"
  - "Sub-heading prefix scheme: Job-URL Step N / Company-URL Step N / Bare-name Step N / Shared Step N"
metrics:
  duration: "~20 minutes"
  completed: "2026-05-19"
  tasks: 2
  files: 2
---

# Phase 08 Plan 02: Skill Input Parsing + Navigation Branching Summary

**One-liner:** 5-branch argument parser (empty/UUID/company-URL/job-URL/bare-name) and three-path
navigation cheat-sheet (Job-URL / Company-URL / Bare-name) with shared Steps 4–5 preserved verbatim.

## What Was Built

### Task 1: Rewrite references/linkedin-navigation.md

`linkedin-navigation.md` was a single 5-step linear narrative for the job-posting-to-employees
flow. It is now a three-path cheat-sheet with a routing table at the top.

**Line-count delta:** 193 → 439 lines (+246 lines)

**Six top-level section headings (in order):**

```
## Choosing the entry point
## Job-URL path (Steps 1–3)
## Company-URL path (slug → /people/)
## Bare-name path (search → disambiguate → /people/)
## Shared: 2nd-degree filter + paginate + extract
## Historically-stable selectors (hints, not guarantees)
```

**Content breakdown:**

- `## Choosing the entry point` — routing table mapping lead/input condition to path.
- `## Job-URL path (Steps 1–3)` — current Steps 1–3 preserved verbatim under prefixed headings
  (`Job-URL Step 1 / Job-URL Step 2 / Job-URL Step 3`).
- `## Company-URL path (slug → /people/)` — 4 new sub-steps: slug extraction via `new URL()` +
  `pathname.split('/').filter(Boolean)` (D-03), direct `/people/` navigation (D-05), H1
  name-extraction with slug fallback and warning (D-06, CD-02), POST `/api/job-leads` with
  idempotent dedup handling (D-04 + Phase 7).
- `## Bare-name path (search → disambiguate → /people/)` — 5 new sub-steps: direct search URL
  `https://www.linkedin.com/search/results/companies/?keywords=<urlencoded>` (D-07), top 3–5
  card extraction, markdown numbered list disambiguation (D-10, CD-05), always-confirm pick
  (D-08, D-09), drain-mode backfill via PUT `/api/companies/<id>` (D-14).
- `## Shared: 2nd-degree filter + paginate + extract` — current Steps 4–5 preserved verbatim
  under `Shared Step 4` and `Shared Step 5` headings.
- `## Historically-stable selectors` — appendix table unchanged.

**Key invariants documented:**

- `PUT /api/companies/<id>` (not PATCH) for D-14 drain backfill, with explicit reference to
  `src/app/api/companies/[id]/route.ts:55`.
- Zero-match policy: fail loudly with `No companies found for "<name>". Try a more specific name or pass a LinkedIn company URL.`
- Company-name extraction fallback: `Could not extract company name from <url>; using slug "<slug>" as fallback. Rename in the companies UI if needed.`
- Always-confirm even on single match (D-08, CD-05) — same 1-item numbered list format.

### Task 2: Rewrite SKILL.md argument parser + Single-lead Step 3

**Line-count delta:** 110 → 137 lines (+27 lines net; argument parser rewritten, Overview extended,
Step 3 Navigate block rewritten)

**Changes:**

- `## Overview` — added two bullets noting company-URL and bare-name input shapes; noted drain-mode
  branching on `linkedinJobUrl === null`.
- `## Argument parsing` — replaced 4-branch parser with 5-branch ordered first-match-wins parser:
  1. Empty/whitespace → drain (D-02)
  2. UUID regex → single-lead UUID flow (unchanged)
  3. URL with `/company/` segment → company-URL flow (D-03)
  4. Any other URL → existing job-URL flow (unchanged)
  5. Anything else → bare-name flow
  — Removed old `"Argument did not look like a UUID or a URL"` stop-and-ask terminal branch.
  — Added closing line "No 'stop and ask' branch — every non-empty input now routes somewhere."
  — Added cross-reference paragraph pointing to `references/linkedin-navigation.md` for
    Company-URL and Bare-name path navigation details.
- `## Single-lead mode` Step 3 (Navigate) — replaced single bullet list with 5-sub-flow router:
  - From URL/UUID job-URL lead → Job-URL path
  - From company-URL input → Company-URL path (POST `/api/job-leads` at Step 4)
  - From bare-name input → Bare-name path then Company-URL Step 4
  - From company-scope queued lead with `companyLinkedinUrl !== null` → Company-URL Step 2 (no POST)
  - From company-scope queued lead with `companyLinkedinUrl === null` → Bare-name path + PUT
    `/api/companies/<id>` (not PATCH) backfill
- `## Setup`, `## Error handling`, `## Constraints`, `## Drain mode` — preserved byte-identical.

## Deviations from Plan

None — plan executed exactly as written.

The one note worth calling out: the acceptance check `grep -q "PUT /api/companies"` needed the
text to appear without a backtick between `PUT ` and `/api/companies`. The Bare-name Step 5 text
was updated from `PUT \`/api/companies/...` (backtick-wrapped path) to `PUT /api/companies/...`
(bare path) in the action description. This is consistent with the plan's intent and passes all
acceptance checks.

## What 08-03 Will Append on Top

Plan 08-03 owns:
- **Drain-mode loop rewrite** in `SKILL.md` — the current `## Drain mode` section (Step 4:
  "For each approved lead, run the single-lead flow") will be replaced with the `lead.linkedinJobUrl`
  branch pseudo-code (D-11, D-14, D-15 SKILL.md sketch from 08-PATTERNS.md).
- **`references/heimdall-api.md` additions** — document `companyLinkedinUrl` in the GET response
  shape (D-13), document the Phase 7 company-scope POST body shape, add PUT `/api/companies/<id>`
  section (D-14 backfill).
- **`references/troubleshooting.md` additions** — three new callouts under existing categories:
  name-extraction failure (warning not hard failure), zero-match on bare-name search (pre-lead
  failure distinct from No prospects found), mid-drain disambiguation prompt (interactive, not
  a failure mode).

## Known Stubs

None. Both files are skill-prompt markdown artifacts. There is no data wired to a UI render
surface — the skill drives a real browser and calls real REST endpoints; no placeholder values
exist.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes introduced.
Both files are read-only markdown prompts interpreted by an LLM executor. The threat model
in the plan (`T-08-04` through `T-08-08`) covers all URL-construction and disambiguation
surface introduced — none require new mitigations at the documentation level.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `.claude/skills/scrape-linkedin-connections/references/linkedin-navigation.md` exists | FOUND |
| `.claude/skills/scrape-linkedin-connections/SKILL.md` exists | FOUND |
| `08-02-SUMMARY.md` exists | FOUND |
| Commit `1523191` (Task 1: linkedin-navigation.md rewrite) | FOUND |
| Commit `fc9a120` (Task 2: SKILL.md argument parser rewrite) | FOUND |
