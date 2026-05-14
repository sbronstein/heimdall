# Phase 5: Job Leads Completion — Context

**Status**: STUB — awaiting fresh context gathering via `/gsd-discuss-phase 5` after architectural reshape on 2026-05-13.

**Prior context**: `.planning/phases/05-job-leads-completion/05-CONTEXT-superseded-in-app-scraper.md` (363 lines) was generated 2026-05-13 against the original phase goal (fix the in-app Playwright scraper). It is preserved verbatim for audit trail but should be treated as historical.

---

## What changed (2026-05-13)

Phase 5's goal pivoted from **fix the in-app scraper** to **delete the in-app scraper and move scraping to a Claude Code skill on `vercel-labs/agent-browser`**.

### Why

The in-app scraper's failure mode is "obfuscated LinkedIn DOM defeats CSS selectors" — a problem better solved by an LLM-driven a11y-tree-with-refs approach. The full evaluation trail:

- `.planning/notes/linkedin-scraper-agent-browser-evaluation.md` — original library comparison (Stagehand vs agent-browser)
- `.planning/spikes/MANIFEST.md` — Stagehand-in-the-app spike, scaffolded then SUPERSEDED by this reshape
- `.planning/seeds/prod-hosted-scraping.md` — prod-hosted scraping deferred to a future trigger

The pivot to a Claude Code skill solves three problems at once:
1. `vercel-labs/agent-browser`'s CLI shape stops being a liability — Claude Code IS the CLI runtime it was designed for
2. Claude Code's existing auth replaces the separate `ANTHROPIC_API_KEY` the Stagehand path required — closes the auth gap
3. The fire-and-forget Playwright IIFE in `/api/job-leads/[id]/search/route.ts` (architectural anti-pattern flagged in `.planning/codebase/ARCHITECTURE.md`) is deleted, not patched

### New phase goal (from ROADMAP §"Phase 5", 2026-05-13)

> LinkedIn connection scraping is reliable. Scraping moves out of the app into a Claude Code skill driving `vercel-labs/agent-browser`; the app holds the queue and the results, scraping runs out-of-band, failures surface back into the UI via the DB.

### What survives from the prior context

A few decisions and pointers from the superseded context still apply and should be carried forward when discuss-phase regenerates this file:

- **Schema additions for surfacing scrape failures** (the old D-01 / D-05: `last_error: text` + `last_error_at: timestamp` columns; UI banner pattern). The columns are still useful — the *writer* changes from the in-app IIFE catch block to the skill writing back via API.
- **Timeline events for success/failure** (old D-09: `job_lead_search_complete` already exists; add `job_lead_search_failed`). Still applies; the API route the skill calls is what emits these.
- **Categorized error taxonomy** (old D-03: 5 categories — Timeout / LinkedIn navigation failed / No prospects found / Browser unavailable / Unknown error). Skill returns categorized failures; API persists.
- **Status enum** — old PD-02 noted `pending|scraping|scraped|searching|found|ready|actioned|archived` has no `failed` value. Still true. New phase needs to decide: do we add `failed`, do we add `queued-for-scrape`, or do we keep using the existing enum + the new error columns? Discuss-phase should re-ask.
- **Phase 2 test harness** (PGlite + `callRoute`) — Still the right pattern for testing the API routes the skill calls into.
- **`logTimeline()` pattern after every write** — Unchanged.

### What's invalidated from the prior context

- All Playwright-in-app fixes: JL-A1 (`'point'` literal), JL-A2 (`waitForTimeout`→`waitForSelector`), JL-A3 (debug log cleanup + `context.close()`), JL-A4 (`Promise.race` 90s timeout), and the `ScrapeTimeoutError` class. These are all **deleted, not fixed**, because the file they live in is deleted.
- The plan grouping (D-20: five plans in two waves) — the new phase has a different shape (skill scaffold + DB queue model + UI affordances + in-app code removal) and will need a fresh plan breakdown.
- The browser-lifecycle decisions (D-12, D-13, D-14: close-context-in-remote-mode-only, scrapeConnections signature) — the browser lifecycle now lives inside agent-browser, outside the app entirely.

### Open questions for `/gsd-discuss-phase` to surface

1. **Skill location and shape**: per-project (`.claude/skills/`) vs. user-global? One skill with two modes (URL arg / drain queue) or two skills?
2. **Status enum evolution**: add a `failed` status? Add `queued`? Keep the existing enum and rely on the new error columns?
3. **Queue draining**: when the skill is run with no arg, does it process leads one at a time with user confirmation, or batch through all unprocessed? What signals "done" — completed all or hit first failure?
4. **In-app code removal scope**: just delete `scrape-connections.ts` + the IIFE in `/search/route.ts`? Keep `scrape-job-page.ts` (still used for the cheerio job-page scrape)? Keep `linkedin-browser.ts` (used for the `~/.heimdall/linkedin-profile/` setup that the skill might still reuse)?
5. **UI affordance**: replace the "Find Connections" button with a "Mark for scrape" CTA + a "scrape pending" badge? Or hide the affordance entirely from the web UI and treat job leads as DB-only entries until the skill processes them?
6. **agent-browser invocation pattern**: does the skill shell out to `npx agent-browser` (or equivalent) and parse JSON output, or use `agent-browser`'s `ai chat` mode where the LLM (Claude in Claude Code) drives interactively?
7. **API write-back contract**: which existing routes does the skill call (`POST /api/job-leads/[id]/prospects`? new bulk endpoint? new failure endpoint?), and what auth — Clerk session cookie reused from a logged-in browser? A service-token path?

These should be the gray areas discuss-phase digs into.

---

*Phase 5 — Context placeholder pending re-discussion. Generated 2026-05-13.*
