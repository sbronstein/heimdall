# Spike Manifest

## Idea

Replace the fragile Playwright-based LinkedIn scraper (`src/features/job-leads/lib/scrape-connections.ts`) with **Stagehand** (`@browserbasehq/stagehand`) — an LLM-driven browser automation library built on Playwright that reasons over rendered DOM via an accessibility-tree-with-stable-refs abstraction instead of brittle CSS selectors.

The current scraper has cascaded into ~5 fallback selector strategies plus `page.evaluate` brute-force DOM scans because LinkedIn uses obfuscated/randomized class names. Even with heavy defensive logic, end-to-end scrapes are unreliable. Stagehand's `act()` / `observe()` / `extract()` primitives target the exact failure surface.

**Out of scope:** production-hosted scraping. This spike is exclusively about reliability of **local-dev / Docker** scraping. The prod path is captured as a future seed in `.planning/seeds/prod-hosted-scraping.md`.

Full context in `.planning/notes/linkedin-scraper-agent-browser-evaluation.md`.

## Requirements

- Must reuse the existing `~/.heimdall/linkedin-profile/` user-data dir — same Chrome profile the project's `linkedin-browser.ts` uses, so LinkedIn login persists across both
- Must support **interactive login on first run** in a visible Chrome window (not a headless re-auth)
- Must extract prospects in the same `ScrapedProspect` shape as today: `{ name, title, linkedinUrl, mutualConnectionNames[] }`
- Must work without a Browserbase account (`env: "LOCAL"`)
- Must measure LLM token cost per scrape (via `stagehand.metrics`)
- Must default to a Claude Anthropic model (consistent with the codebase's Anthropic-first preference)

## Spikes

| #   | Name                          | Type     | Validates                                                                                                              | Verdict | Tags                          |
|-----|-------------------------------|----------|------------------------------------------------------------------------------------------------------------------------|---------|-------------------------------|
| 001 | stagehand-cdp-auth            | standard | Stagehand launches headed Chromium, persists/reuses the LinkedIn profile, interactively pauses for login if needed, and reaches `/feed`. | PENDING | stagehand, auth, headed       |
| 002 | stagehand-linkedin-navigate   | standard | `observe()`/`act()` walk job → company → employees → 2nd-degree filter, landing on a company-filtered people search.    | PENDING | stagehand, navigation, linkedin |
| 003 | stagehand-extract-prospects   | standard | `extract()` returns the `ScrapedProspect` shape with measured per-run token cost across 5+ runs (≥80% success).         | PENDING | stagehand, extract, cost       |

Risk-ordered. 001 is gating. 002 is the core test. 003 only matters if 001 and 002 pass.

## How to Run

```bash
# One-time setup
cd .planning/spikes/_pkg
npm install
npx playwright install chromium   # downloads the headed Chromium binary

# Make sure ANTHROPIC_API_KEY is in .env.local (only required env var).
# A Chrome window will open on first run — sign into LinkedIn there.
# Cookies persist at ~/.heimdall/linkedin-profile/ for subsequent runs.

npm run spike:001
npm run spike:002 -- <linkedin-job-url>
npm run spike:003 -- <linkedin-people-search-url> 5
```

If `BROWSER_CDP_ENDPOINT` is set (e.g. you already have Chrome running for the project's main scraper), the spikes will attach to that endpoint instead of launching a new browser.

Each spike prints a `[verdict]` line and the post-run `stagehand.metrics` token counts. Update the corresponding README's **Results** section with what you observed, then flip the verdict in this table.

## Notes on auth

Stagehand uses the standard Anthropic SDK and reads `ANTHROPIC_API_KEY`. There's no first-class browser/OAuth/Claude-sub path in Stagehand 3.x. Community proxies that bridge Claude Pro/Max to OpenAI-compatible endpoints exist (`claude-pro-proxy`-style) but are unofficial and add a moving piece — kept out of scope for this spike. Total token cost across all three spikes with Sonnet 4.5 should land in the low single-digit dollars.
