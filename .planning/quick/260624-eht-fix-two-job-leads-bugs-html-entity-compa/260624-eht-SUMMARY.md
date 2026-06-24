---
quick_id: 260624-eht
slug: fix-two-job-leads-bugs
date: 2026-06-24
status: complete
commits: [c4d3f13, f257039]
---

# Summary: Fix two job-leads page bugs

## Bug 1 — HTML entity in company name ("Walker &amp; Dunlop")
- **Cause:** `scrape-job-page.ts` read `companyName` from JSON-LD via `JSON.parse($(el).html())`;
  `JSON.parse` does not decode HTML entities, and LinkedIn HTML-encodes `&` inside its
  `application/ld+json`, so `&amp;` was stored/displayed literally. The cheerio `.attr()`/`.text()`
  fallback paths already decode, so only the JSON-LD path was affected.
- **Fix (commit f257039):** added exported `decodeHtmlEntities()` and applied it to `companyName`,
  `roleTitle`, `location` on return. `&amp;` decoded last (double-encode safe), idempotent on
  clean strings. New `scrape-job-page.test.ts`.

## Bug 2 — SVP categorized as IC
- **Cause:** VP rule `/\b(vp|vice\s+president)\b/i` — `\bvp\b` can't match "SVP" (no internal word
  boundary), so SVP titles fell to the role-word pattern → `ic`. `prioritization.ts:39` reads the
  stored `prospects.seniorityLevel`, so this showed as SVPs ranked/displayed as ICs.
- **Fix (commit c4d3f13):** rule → `/\b([se]?vp|senior\s+vice\s+president|executive\s+vice\s+president|vice\s+president)\b/i`.
  AVP excluded from the acronym class (not over-ranked). Regression tests added incl. the exact
  "SVP, Strategy & Operations" case.

## Tests
- `npx vitest run` on `seniority.test.ts`, `scrape-job-page.test.ts`, `prioritization.test.ts` →
  30 passed. (jsdom component tests unchanged/orthogonal.)

## Data backfill (live DB, owner-authorized, targeted by explicit id)
- `prospects`: 11 rows recomputed to `vp` (4 `ic→vp`, 5 `unknown→vp`, 1 `manager→vp`,
  1 `senior_manager→vp`). The 8 SVP/VP-titled rows left non-`vp` are legitimately `c_suite`
  (titles also carry CTO/CPO/CMO/CIO/Chief… which correctly outrank VP).
- `job_leads`: 2 rows `company_name` `"Walker &amp; Dunlop"` → `"Walker & Dunlop"`; 0 entities remain.
- No committed migration — one-off, reproducible from the fixed `inferSeniority`/`decodeHtmlEntities`.

## Status: complete
