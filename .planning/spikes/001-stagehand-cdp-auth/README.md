---
spike: 001
name: stagehand-cdp-auth
type: standard
validates: "Given an ANTHROPIC_API_KEY and either a headed Chromium with persistent profile (default) or a BROWSER_CDP_ENDPOINT, when Stagehand initializes and navigates to LinkedIn /feed, then it either signs in silently from the persisted session or pauses for an interactive login and resumes once /feed is reached."
verdict: SUPERSEDED
related: []
tags: [stagehand, auth, headed, superseded]
---

# Spike 001: stagehand-cdp-auth

> **SUPERSEDED 2026-05-13.** Architectural pivot — scraping is moving out of the app into a Claude Code skill on `vercel-labs/agent-browser`. See `../MANIFEST.md` "Status" section. This spike was never executed.



## What This Validates

**Given** `ANTHROPIC_API_KEY` is set and either:
- `BROWSER_CDP_ENDPOINT` is set (CDP attach path — matches the project's prod-style flow), or
- it isn't (headed-launch path — default; uses persistent profile at `~/.heimdall/linkedin-profile/`),

**when** the spike runs (`npm run spike:001`),
**then** Stagehand initializes, opens (or attaches to) Chrome, signs in interactively if needed, reaches `/feed`, and `observe()` returns at least one candidate element — proving the LLM primitives are wired up.

This is **gating**: if Stagehand can't init or reach an authenticated LinkedIn page, the entire approach is off the table.

## Research

See `.planning/notes/linkedin-scraper-agent-browser-evaluation.md` for the full library comparison. Key facts pulled into this spike:

- Stagehand 3.4.0 (May 2026) supports `env: "LOCAL"` with either `cdpUrl` (attach to existing Chrome) or `headless: false` + `userDataDir` (launch new persistent Chromium)
- Reuses the same `~/.heimdall/linkedin-profile/` dir as `src/features/job-leads/lib/linkedin-browser.ts`, so an existing LinkedIn login is inherited automatically
- `cdpUrl` must be the **WebSocket** URL (`ws://...`); the helper at `_pkg/lib/cdp.ts` resolves it from `BROWSER_CDP_ENDPOINT`'s HTTP form via `/json/version`
- Model: `anthropic/claude-sonnet-4-5` (reads `ANTHROPIC_API_KEY`)

## How to Run

```bash
cd .planning/spikes/_pkg
npm install                       # first time only
npx playwright install chromium   # first time only — Chromium for headed mode
npm run spike:001
```

A Chrome window will open. If you're not signed into LinkedIn yet, the spike will print a banner and wait up to 5 minutes for you to sign in. Once you reach `/feed`, the spike resumes automatically. The login is saved in the persistent profile so subsequent runs are silent.

## What to Expect

Console output ending with one of:

- `[verdict] PASS — Stagehand launched, attached, reached an authenticated LinkedIn /feed, and observe() returned candidates.` (exit 0)
- `[error] <stack>` followed by `[done]` (exit 1)

Followed by a `[metrics]` block with token counts. For this spike, only one `observe()` call runs so `observePromptTokens` should be small (typically <2k). `actPromptTokens` should be 0.

## Observability

The spike logs every step with elapsed ms (`[+NNNNms] [tag] message`). Tags:

- `init` — Stagehand config + setup
- `auth` — login state check, interactive-login banner, login detected
- `observe` — single observe() probe to confirm primitives are live
- `verdict` — PASS line
- `metrics` — final token accounting
- `error` — any thrown exception with stack
- `done` — total elapsed time

## Investigation Trail

_To be filled in after first run. Capture: launch behavior, what the persistent profile looked like, surprises during the interactive-login flow, any anti-bot challenges, attached-context page count._

## Results

- **Verdict:** PENDING
- **Mode:** (headed-launch or CDP-attach)
- **Interactive login required:** (yes/no on first run)
- **Token cost for the observe() probe:**
- **Surprises:**
