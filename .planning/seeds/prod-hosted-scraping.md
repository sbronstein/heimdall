---
title: Re-evaluate prod-hosted scraping
trigger_condition: local-dev/Docker scraping becomes a bottleneck — scrape volume grows, scrapes need to run unattended/scheduled, or CLI parity needs to work without a local Chrome running
planted_date: 2026-05-13
---

# Seed: Re-evaluate prod-hosted scraping

## What's planted

Today, all LinkedIn scraping is pinned to local-dev / Docker because Playwright/Chromium is incompatible with Vercel serverless (constraint documented in CLAUDE.md). This decision is intentional — for the current cadence of an executive job search, running scrapes locally is fine.

If/when the cadence changes, the path forward is a **hosted browser cloud + CDP client**.

## Options to revisit when triggered

| Option | Notes |
|---|---|
| Browserbase + Stagehand | Natural extension if the [[linkedin-scraper-agent-browser-evaluation]] spike commits to Stagehand. Same library, swap local Chromium for Browserbase WS endpoint. ~$0.16/browser-min as of 2026-05. |
| Browserless | Generic CDP endpoint, cheaper per-minute, no LLM abstraction layer — would pair with Stagehand or raw Playwright. |
| Hyperbrowser / Kernel | Browserbase competitors. Worth a quick pricing pass at trigger time. |
| `vercel-labs/agent-browser` + remote CDP | Rust CLI route — viable but child-process DX problems remain (see evaluation note). |

## Trigger watchlist

Pull this seed when **any** of:

- Scraping volume grows past what manual local runs comfortably handle (e.g. >10 job leads/week needing fresh scrapes)
- Need for **scheduled** scraping (cron, daily refresh of prospect lists, etc.) — can't be cron'd locally without a daemon
- Need for **CLI parity to work end-to-end without a local Chrome running** — e.g. running scrapes from Claude Code while the dev machine is off
- Browserbase or competitor drops pricing significantly (current ~$0.16/min would be ~$3–10/month at current cadence — fine; ~$50+/month would be a real signal)

## Why this isn't worth doing now

- Current cadence is low (handful of active job leads at a time)
- Adds a paid dependency before the scrape itself is even reliable — sequencing the [[linkedin-scraper-agent-browser-evaluation]] spike first is correct
- The local Chrome workflow already supports `BROWSER_CDP_ENDPOINT` env var, so the future swap is a config change, not a rewrite

## Related

- [[linkedin-scraper-agent-browser-evaluation]] — the analysis that explicitly punted hosting
