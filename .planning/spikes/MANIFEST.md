# Spike Manifest

## Idea

Replace the fragile Playwright-based LinkedIn scraper (`src/features/job-leads/lib/scrape-connections.ts`) with **Stagehand** (`@browserbasehq/stagehand`) — an LLM-driven browser automation library built on Playwright that reasons over rendered DOM via an accessibility-tree-with-stable-refs abstraction instead of brittle CSS selectors.

The current scraper has cascaded into ~5 fallback selector strategies plus `page.evaluate` brute-force DOM scans because LinkedIn uses obfuscated/randomized class names. Even with heavy defensive logic, end-to-end scrapes are unreliable. Stagehand's `act()` / `observe()` / `extract()` primitives target the exact failure surface.

**Out of scope:** production-hosted scraping. This spike is exclusively about reliability of **local-dev / Docker** scraping. The prod path is captured as a future seed in `.planning/seeds/prod-hosted-scraping.md`.

Full context in `.planning/notes/linkedin-scraper-agent-browser-evaluation.md`.

## Requirements

- Must reuse the existing `BROWSER_CDP_ENDPOINT` flow — no new auth path or separate Chrome session
- Must extract prospects in the same `ScrapedProspect` shape as today: `{ name, title, linkedinUrl, mutualConnectionNames[] }`
- Must work without a Browserbase account (`env: "LOCAL"`)
- Must measure LLM token cost per scrape (Stagehand exposes per-primitive token counts via `stagehand.metrics`)
- Must default to a Claude Anthropic model (consistent with the rest of the codebase's Anthropic-first preference)

## Spikes

| #   | Name                          | Type     | Validates                                                                                                              | Verdict | Tags                          |
|-----|-------------------------------|----------|------------------------------------------------------------------------------------------------------------------------|---------|-------------------------------|
| 001 | stagehand-cdp-auth            | standard | Given Chrome with logged-in LinkedIn at `BROWSER_CDP_ENDPOINT`, when Stagehand initializes, then it attaches and reaches `/feed` without re-auth. | PENDING | stagehand, cdp, auth          |
| 002 | stagehand-linkedin-navigate   | standard | Given an authenticated Stagehand session on a job posting, when `act()` runs natural-language steps, then the browser lands on a 2nd-degree employee search filtered to that company. | PENDING | stagehand, navigation, linkedin |
| 003 | stagehand-extract-prospects   | standard | Given Stagehand on a people-search results page, when `extract()` runs with a Zod prospect schema, then it returns the `ScrapedProspect` shape with measured token cost across 5+ runs. | PENDING | stagehand, extract, cost       |

Spikes are ordered by risk. 001 is gating (no point continuing if Stagehand can't even attach). 002 is the core "does the a11y-tree-with-refs actually navigate LinkedIn." 003 is the breadth / cost / extraction-shape test that only matters if 001 and 002 pass.

## How to Run

```bash
# One-time setup
cd .planning/spikes/_pkg
npm install

# Make sure your Chrome is running with --remote-debugging-port=<port>
# and BROWSER_CDP_ENDPOINT is set (e.g. http://localhost:3005) — same flow
# as the existing scraper. ANTHROPIC_API_KEY also required.

# Run sequentially. Stop and fix if any verdict is FAIL.
npm run spike:001
npm run spike:002 -- <linkedin-job-url>
npm run spike:003 -- <linkedin-people-search-url>
```

Each spike prints a `[verdict]` line and the post-run `stagehand.metrics` token counts. Update the corresponding README's **Results** section with what you observed, then flip the verdict in this table.
