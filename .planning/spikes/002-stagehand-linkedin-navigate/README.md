---
spike: 002
name: stagehand-linkedin-navigate
type: standard
validates: "Given an authenticated Stagehand session (via the headed-launch flow or BROWSER_CDP_ENDPOINT) starting on a LinkedIn job posting, when observe()/act() runs natural-language steps for company → employees → 2nd-degree filter, then the browser lands on a company-filtered people search."
verdict: SUPERSEDED
related: [001]
tags: [stagehand, navigation, linkedin, superseded]
---

# Spike 002: stagehand-linkedin-navigate

> **SUPERSEDED 2026-05-13.** See `../MANIFEST.md` "Status" section. This spike was never executed.



## What This Validates

**Given** Stagehand attached/launched and on a LinkedIn job posting URL,
**when** `observe()` → `act()` runs in sequence for three steps —
1. click the company name link on the job posting
2. click the employees list link on the company page
3. apply the 2nd-degree connections filter —
**then** the browser ends up on `https://www.linkedin.com/search/results/people/?currentCompany=[...]&network=["S"]` (or equivalent client-side filtered state).

This is the **core question**: does the LLM-driven a11y-tree-with-refs approach actually beat brittle selectors on the very flow that scrape-connections.ts struggles with?

## Research

Pattern from Stagehand docs: prefer `observe()` → `act(actions[0])` over `act("free-form instruction")` for click steps. `observe()` returns enumerated candidate elements with selectors; `act()` consumes one. This gives the LLM one bite at element identification rather than two and degrades more gracefully when LinkedIn restructures the DOM.

For the filter step, we use the freer-form `act("...")` because the filter UI is multi-stage (open chip → select option → apply) and harder to enumerate in one observe call.

The success criteria check both URL pattern (`/search/results/people` + `currentCompany=`) and the optional 2nd-degree URL param (`network=` or `%22S%22`). If LinkedIn applies the filter client-side without a URL update, the verdict drops to PARTIAL and requires manual inspection.

## How to Run

```bash
cd .planning/spikes/_pkg
npm install                       # first time only
npx playwright install chromium   # first time only
npm run spike:002 -- 'https://www.linkedin.com/jobs/view/<id>'
```

Use a job posting at a company where you have 2nd-degree connections (otherwise the filter will return an empty list and the verdict is harder to read). The spike runs through the same headed-Chromium-with-persistent-profile flow as spike 001 — if you're not signed in, it pauses for an interactive login.

## What to Expect

Per-step logs:
- `[auth]` lines — login check / interactive pause if needed
- `[nav]` lines — URL after each Playwright navigation
- `[act]` lines — `observe()` candidate counts and `act()` results per step
- `[verdict]` ending with PASS / PARTIAL / FAIL
- `[metrics]` — token counts per primitive

Approximate token budget for one run: 3 × `observe()` + 3-5 × `act()`. With Claude Sonnet 4.5, expect roughly 5k–15k input + 1k–3k output tokens total. Capture the real numbers in Results below.

## Observability

Step tags:
- `init` / `auth` / `nav` — setup, login state, page navigation
- `act` — every observe()/act() call, with truncated payload of candidate elements
- `warn` — non-fatal surprises (no filter UI found, unexpected URL pattern)
- `check` — final URL pattern analysis
- `verdict` — PASS / PARTIAL / FAIL
- `metrics` — token accounting

## Investigation Trail

_To be filled in after first run. Capture: which step (if any) failed, how the LLM described elements that don't exist, surprises about LinkedIn's response to the agent-driven clicks, anti-bot warnings, whether the 2nd-degree filter applied via URL or client-side state only._

## Results

- **Verdict:** PENDING
- **Evidence (URL trail):**
- **Token cost (Sonnet 4.5):**
- **Approximate USD per run:**
- **Surprises:**
- **Comparison to current Playwright behavior:**
