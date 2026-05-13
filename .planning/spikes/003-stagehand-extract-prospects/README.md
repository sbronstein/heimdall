---
spike: 003
name: stagehand-extract-prospects
type: standard
validates: "Given Stagehand on a LinkedIn people-search results page, when extract() runs with a Zod prospect schema, then it returns the ScrapedProspect shape with measured per-run token cost across 5+ runs."
verdict: PENDING
related: [001, 002]
tags: [stagehand, extract, cost]
---

# Spike 003: stagehand-extract-prospects

## What This Validates

**Given** Stagehand attached/launched (same headed-launch flow as spike 001) and on a LinkedIn people-search URL (`/search/results/people/?currentCompany=[...]&network=["S"]`),
**when** `extract(instruction, schema)` runs with a Zod schema matching the existing `ScrapedProspect` type,
**then** it returns an array of `{ name, title, linkedinUrl, mutualConnectionNames[] }` matching the shape, with per-run token cost captured for cost-vs.-toil comparison.

This proves Stagehand can replace not just navigation but also the **DOM extraction** step in `scrape-connections.ts` — the part that today uses `page.evaluate` to brute-force the obfuscated DOM. Schema-first extraction is also where TypeScript safety re-enters the picture.

## Research

From the Stagehand docs (verified via context7 against `/websites/stagehand_dev`):

- `stagehand.extract(instruction, zodSchema)` — positional args in v3, returns inferred typed data
- Zod 4 is the project's standard (already in main `package.json`); Stagehand peer-deps allow `^3.25.76 || ^4.2.0`, so we use 4
- `stagehand.metrics` exposes `extractPromptTokens`, `extractCompletionTokens`, `extractReasoningTokens`, `extractCachedInputTokens`, `extractInferenceTimeMs` — sample at start/end of each run for per-run cost attribution

The matching shape in `src/features/job-leads/lib/scrape-connections.ts`:

```ts
export type ScrapedProspect = {
  name: string;
  title: string | null;
  linkedinUrl: string | null;
  mutualConnectionNames: string[];
};
```

## How to Run

```bash
cd .planning/spikes/_pkg
npm install                       # first time only
npx playwright install chromium   # first time only

# Pre-built people-search URL with currentCompany + 2nd-degree filter.
# The URL has square brackets that need quoting in the shell.
npm run spike:003 -- 'https://www.linkedin.com/search/results/people/?currentCompany=%5B%22<company-id>%22%5D&network=%5B%22S%22%5D' 5
```

The trailing `5` is the number of runs (default 1). Use **5** for the real reliability measurement; **1** for a quick smoke test.

Headed-Chromium-with-persistent-profile flow: same as spike 001. Interactive login pause on first run if needed.

## What to Expect

Per-run logs showing prospect count, plus a final summary:

- `[summary] N/M runs returned at least one prospect.`
- `[summary] First-run sample (up to 3): <JSON>`
- `[verdict] PASS / PARTIAL / FAIL` — PASS requires ≥80% success rate across runs
- `[metrics-final]` — totals across all runs; divide by run count for per-run averages
- `[cost-table]` — per-run elapsed time and count breakdown

## Observability

The spike retains per-run snapshots (`{ run, count, sample, metricsAtEnd, errored, errMsg, elapsedMs }`) so the Results section below can be filled in directly from the console log. For deeper analysis, redirect output to a file:

```bash
npm run spike:003 -- '<url>' 5 2>&1 | tee spike-003-run.log
```

## Investigation Trail

_To be filled in after first run. Capture: extraction quality (does it match what's actually on the page?), schema validation failures, hallucinated profile URLs, mutual-connection extraction reliability (this field was the hardest in the current Playwright path), per-run cost variance._

## Results

- **Verdict:** PENDING
- **Reliability:** N/M runs succeeded
- **Average tokens per scrape (Sonnet 4.5):**
  - prompt: ?
  - completion: ?
  - inference time: ?ms
- **Approximate USD per scrape:** (multiply by Anthropic pricing — Sonnet 4.5 input $3/Mtok, output $15/Mtok at time of writing)
- **Extraction quality vs. current Playwright scraper:**
- **Surprises:**
