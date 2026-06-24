---
quick_id: 260624-eht
slug: fix-two-job-leads-bugs
date: 2026-06-24
status: in-progress
---

# Quick Task: Fix two job-leads page bugs

Two display bugs on the job-leads page, both root-caused.

## Bug 1 — HTML entity in company name ("Walker &amp; Dunlop" shows literal code)

**Root cause:** `src/features/job-leads/lib/scrape-job-page.ts` reads `companyName` from JSON-LD
via `JSON.parse($(el).html())`. LinkedIn HTML-encodes ampersands inside its
`application/ld+json`, and `JSON.parse` does NOT decode HTML entities, so `&amp;` is stored
literally. The `og:title` `.attr()` and `$('title').text()` fallback paths decode via cheerio,
so only the JSON-LD path is affected. Verified: 2 `job_leads` rows have
`company_name = 'Walker &amp; Dunlop'`; prospects are clean.

**Fix:**
- Add an exported, dependency-free `decodeHtmlEntities()` helper in `scrape-job-page.ts`.
- Apply it to the final `companyName`, `roleTitle`, `location` before returning.
- Order: numeric (`&#nn;`, `&#xnn;`), `&lt;`/`&gt;`/`&quot;`/`&#39;`/`&apos;`, then `&amp;` LAST
  (so a double-encoded `&amp;lt;` is not mangled into `<`). Idempotent on already-clean strings.
- New unit test `scrape-job-page.test.ts` exercising the decoder.

**Backfill:** decode literal entities in existing `job_leads` text columns
(`company_name`, `role_title`, `location`).

## Bug 2 — SVP categorized as IC

**Root cause:** `src/features/job-leads/lib/seniority.ts` VP rule `/\b(vp|vice\s+president)\b/i`.
`\bvp\b` cannot match "SVP" (no word boundary inside "SVP"), so an SVP title falls through to the
role-word pattern (matches "Operations"/"Strategy") → `level: 'ic'`.

**Fix:** broaden the VP rule to `/\b([se]?vp|senior\s+vice\s+president|executive\s+vice\s+president|vice\s+president)\b/i`
— matches `svp`/`evp`/`vp`. Do NOT add `a` (Assistant VP should not become `vp`; "Assistant Vice
President" already matches the `vice\s+president` alternative). Add tests: SVP/EVP → `vp` (85),
and "SVP, Strategy & Operations" ≠ `ic`.

**Backfill:** `prospects.seniorityLevel` is computed + stored at ingest
(`src/app/api/job-leads/[id]/prospects/route.ts`) and read downstream by
`prioritization.ts:39`. Re-run the (fixed) inference over existing prospects and update rows
whose stored level is wrong.

## Verification
- `npx vitest run` on `seniority.test.ts` + `scrape-job-page.test.ts` → green.
- Backfill: confirm zero remaining `&amp;`/`&#` in `job_leads`; confirm SVP/EVP prospects now `vp`.

## Commits (atomic)
1. `fix(job-leads): recognize SVP/EVP as VP in seniority inference` (+ tests)
2. `fix(job-leads): decode HTML entities in scraped job-page fields` (+ test)
3. data backfill run (reported in SUMMARY; no committed migration — one-off)
