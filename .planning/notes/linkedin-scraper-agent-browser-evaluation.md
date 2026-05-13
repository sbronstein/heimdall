---
title: LinkedIn scraper — agent-browser evaluation
date: 2026-05-13
context: exploration session before spiking a replacement for Playwright-based LinkedIn scraping
---

# LinkedIn scraper — agent-browser evaluation

## Problem

The current Playwright-based scraper in `src/features/job-leads/lib/scrape-connections.ts` is fighting LinkedIn on two fronts:

1. **Obfuscated DOM** — LinkedIn uses randomized/obfuscated class names. The pending diff has cascaded into ~5 fallback selector strategies plus `page.evaluate` brute-force DOM scans plus hardcoded `waitForTimeout` waits. 326-line diff of defensive heuristics is unsustainable.
2. **Multi-step navigation** — Job posting → company page → employees list → 2nd-degree filter. Each hop has its own fragile selectors and timing.

Even with the latest fixes, end-to-end scrapes are unreliable.

## Two decoupled problems

| Problem | What fixes it |
|---|---|
| Selector brittleness (obfuscated DOM) | LLM-driven browser automation that reasons over rendered DOM / a11y tree instead of CSS selectors |
| Hosting constraint (local-dev/Docker only) | Hosted browser cloud (Browserbase, Browserless, Kernel) — paid, requires CDP endpoint |

These are independent. Production hosting is intentionally staying off-limits for now, so only the selector-brittleness problem is in scope.

## Evaluated: `vercel-labs/agent-browser`

- **Rust CLI**, not a TypeScript library. Distributed via npm but ships a native binary; no `main`/`exports` in `package.json`.
- Speaks Chrome DevTools Protocol directly (not Playwright).
- Accessibility-tree-with-stable-refs model (`@e1`, `@e2`) for LLM consumption — the right abstraction for obfuscated class names.
- LLM via Vercel AI Gateway, default model `anthropic/claude-sonnet-4.6`.
- ~32.9k stars, actively maintained, Apache-2.0.

**Verdict**: solves the selector problem brilliantly. But integration cost from a Next.js API route is high — `execSync`-ing a Rust binary, no TS types on inputs/outputs, parsing JSON stdout. Strongest use cases are CLI/agent-driving, not "called from a Next.js route handler."

## Decision: spike Stagehand

`@browserbasehq/stagehand` is the better fit for this codebase:

- TS-native, MIT, built on Playwright (drops in next to existing Playwright code in `src/features/job-leads/lib/`)
- Three LLM primitives that target the exact failure points:
  - `page.act("click the employees link")` — natural-language action
  - `page.observe()` — enumerate actionable elements
  - `page.extract(schema)` — pull structured data from a rendered page
- Runs against **local Chromium** without Browserbase (Browserbase is optional, not required)
- Pays only LLM tokens per scrape — no per-browser-minute fees while staying local

## Why not agent-browser

The selector-fix benefit is comparable, but Stagehand wins on DX:

- Same Playwright `Page` object shape — minimal refactor to scrape-connections.ts
- Type-safe `extract(schema)` aligns with the Zod-everywhere convention in this codebase
- No child-process boundary, no native binary packaging concerns

If we ever decide to unlock prod-hosted scraping (see [[prod-hosted-scraping]]), Stagehand's Browserbase path is also the natural extension — same library, swap the runtime.

## Next step

Spike Stagehand on one scrape path. Likely `scrape-connections.ts` because multi-step nav is where Playwright breaks worst — proves the a11y-tree-with-refs approach on the hardest case. Spike should capture:

- Does it actually navigate job → company → employees end-to-end?
- LLM token cost per scrape (target: comparable to or below current Playwright runtime cost)
- Reliability across 5–10 runs against different companies
- Whether the existing logged-in-Chrome session (`BROWSER_CDP_ENDPOINT`) flow still works
