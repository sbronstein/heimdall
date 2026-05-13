---
spike: 002
name: stagehand-linkedin-navigate
type: standard
validates: "Given an authenticated Stagehand session on a LinkedIn job posting, when act() runs natural-language steps (click company → click employees → filter 2nd-degree), then the browser lands on the 2nd-degree employee search filtered to that company."
verdict: PENDING
related: [001]
tags: [stagehand, navigation, linkedin]
---

# Spike 002: stagehand-linkedin-navigate

## What This Validates

**Given** Stagehand attached via spike 001's CDP flow and starting on a LinkedIn job posting URL,
**when** `observe()` → `act()` runs in sequence for three steps —
1. click the company name link on the job posting
2. click the employees list link on the company page
3. apply the 2nd-degree connections filter —
**then** the browser ends up on `https://www.linkedin.com/search/results/people/?currentCompany=[...]&network=["S"]` (or equivalent client-side filtered state).

This is the **core question**: does the LLM-driven a11y-tree-with-refs approach actually beat brittle selectors on the very flow that scrape-connections.ts struggles with?

## Research

Pattern from Stagehand docs: prefer `observe()` → `act(actions[0])` over `act("free-form instruction")` for click steps. `observe()` returns enumerated candidate elements with selectors; `act()` consumes one. This gives the LLM one bite at element identification rather than two (action + selection), and degrades more gracefully when LinkedIn restructures the DOM.

For the filter step, we use the freer-form `act()` form because the filter UI is multi-stage (open chip → select option → apply) and harder to enumerate in one observe call.

The success criteria check both URL pattern (`/search/results/people` + `currentCompany=`) and the optional 2nd-degree URL param (`network=` or `%22S%22`). If LinkedIn applies the filter client-side without a URL update, the verdict drops to PARTIAL and requires manual inspection of the page.

## How to Run

```bash
cd .planning/spikes/_pkg
npm install   # first time only
npm run spike:002 -- https://www.linkedin.com/jobs/view/<id>
```

Use a job posting at a company where you have 2nd-degree connections (otherwise the filter will return an empty list and the verdict is harder to read).

## What to Expect

Per-step logs:
- `[nav]` lines showing URL after each Playwright navigation
- `[act]` lines showing `observe()` candidate counts and `act()` results
- `[verdict]` ending with PASS / PARTIAL / FAIL
- `[metrics]` block with token counts per primitive

Approximate token budget for one run: 3 × `observe()` + 3-5 × `act()`. With Claude Sonnet 4.5, expect roughly 5k–15k input + 1k–3k output tokens total. Capture the real numbers in Results below.

## Observability

Step tags:
- `init` / `nav` — setup and page navigation
- `act` — every observe()/act() call, with truncated payload of candidate elements
- `warn` — non-fatal surprises (no filter UI found, unexpected URL pattern)
- `check` — final URL pattern analysis
- `verdict` — PASS / PARTIAL / FAIL
- `metrics` — token accounting

## Investigation Trail

_To be filled in after first run. Capture: which step (if any) failed, how the LLM described elements that don't exist, surprises about LinkedIn's response to the agent-driven clicks, anti-bot warnings._

## Results

- **Verdict:** PENDING
- **Evidence (URL trail):**
- **Token cost (Sonnet 4.5):**
- **Surprises:**
- **Comparison to current Playwright behavior:**
