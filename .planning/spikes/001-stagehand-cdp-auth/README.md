---
spike: 001
name: stagehand-cdp-auth
type: standard
validates: "Given Chrome with logged-in LinkedIn at BROWSER_CDP_ENDPOINT, when Stagehand initializes against that endpoint, then it attaches to the existing context and can navigate to /feed without re-auth."
verdict: PENDING
related: []
tags: [stagehand, cdp, auth]
---

# Spike 001: stagehand-cdp-auth

## What This Validates

**Given** a Chrome instance running with `--remote-debugging-port=<port>`, with the user already signed into LinkedIn, and `BROWSER_CDP_ENDPOINT` set to the HTTP URL of that port,
**when** Stagehand is constructed with `env: "LOCAL"` and `localBrowserLaunchOptions.cdpUrl: <ws-url>` and `await stagehand.init()` runs,
**then** the resulting context shares the logged-in session, and `page.goto('https://www.linkedin.com/feed')` lands on `/feed` (not `/login` or `/checkpoint`).

This is **gating**: if Stagehand can't reuse the existing logged-in browser, the entire approach is off the table (or requires a separate auth flow, which violates a project requirement).

## Research

See `.planning/notes/linkedin-scraper-agent-browser-evaluation.md` for the full library comparison and prior-art capture. Key facts pulled into this spike:

- Stagehand 3.4.0 (May 2026) accepts an existing CDP endpoint via `localBrowserLaunchOptions.cdpUrl`
- `cdpUrl` must be the **WebSocket** URL (`ws://...`); the helper at `_pkg/lib/cdp.ts` resolves it from the project's HTTP form via `/json/version`
- `env: "LOCAL"` means no Browserbase account required — pure pay-per-LLM-token
- Model defaults to OpenAI; explicit `model: "anthropic/claude-sonnet-4-5"` selects Claude (reads `ANTHROPIC_API_KEY` from env)

## How to Run

```bash
# In a separate shell, ensure Chrome is running with the remote-debugging port
# that BROWSER_CDP_ENDPOINT points to, signed into LinkedIn. Then:
cd .planning/spikes/_pkg
npm install     # first time only
npm run spike:001
```

## What to Expect

Console output ending with one of:

- `[verdict] PASS — Stagehand attached to existing logged-in Chrome and reached /feed without re-auth.` (exit 0)
- `[verdict] FAIL — Landed on <url>, expected /feed. ...` (exit 1)

Followed by a `[metrics]` block with token counts. For this spike, `actPromptTokens` / `actCompletionTokens` should be 0 (no `act()` calls) and `observePromptTokens` should be small (one `observe()` call).

## Observability

The spike logs every step with elapsed ms (`[+NNNNms] [tag] message`). Tags:

- `init` — Stagehand setup
- `nav` — page navigation
- `check` — URL inspection at landing
- `verdict` — PASS / FAIL line
- `observe` — single observe() probe to confirm primitives are live
- `metrics` — final token accounting
- `error` — any thrown exception with stack
- `done` — total elapsed time

## Investigation Trail

_To be filled in after first run. Capture: what the metrics showed, surprises around URL redirects, anything weird about the attached context (e.g. multiple pages, unexpected URLs)._

## Results

_To be filled in after first run. Update the `verdict` in frontmatter and the row in `../MANIFEST.md`._

- **Verdict:** PENDING
- **Evidence:**
- **Surprises:**
