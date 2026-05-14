# Phase 5: Job Leads Completion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-13
**Phase:** 05-job-leads-completion
**Areas discussed:** Error surfacing model, Timeout budget + revert behavior, Browser lifecycle, Debug-log cleanup scope

---

## Gray Area Selection

User was offered 4 phase-specific gray areas (5th, `navigateToEmployeeList` resilience, dropped due to AskUserQuestion's 4-option cap and folded into CONTEXT.md CD-04).

| Option | Selected |
|--------|----------|
| Error surfacing model | ✓ |
| Timeout budget + revert behavior | ✓ |
| Browser lifecycle | ✓ |
| Debug-log cleanup scope | ✓ |

**Outcome:** All 4 selected → all 4 deep-dived below.

---

## Error surfacing model

### Q1: Where should the scrape-failure error live so the UI can render it?

| Option | Description | Selected |
|--------|-------------|----------|
| New `lastError` text column on job_leads | Add `last_error: text` + `last_error_at: timestamp` to job_leads schema. On failure: revert status, write error message + timestamp. `/status` endpoint returns it. Cleared on next successful scrape. Persistent, dead simple. | |
| timeline_events row only | On failure, write a `job_lead_search_failed` timeline event with the error message in `metadata.error`. UI joins / queries timeline for the latest failure event. Uses existing infra (no migration), but the UI has to fetch + filter timeline. | |
| Both — column + timeline event | Write to both: `lastError` column for fast 'current state of this lead' read, AND a timeline_events row for the activity feed / audit trail. Most informative. Two writes per failure. | ✓ |
| Toast on the click + nothing persisted | Return the error from `/search` POST synchronously when known fast, or have `/status` return a one-shot `error` field that clears on next read. No new column, no timeline event. If the user navigates away, the error is gone. | |

**User's choice:** Both — column + timeline event.
**Notes:** Captured as D-01 in CONTEXT.md. Drives Drizzle migration + extending `/status` payload + new timeline event type.

### Q2: What does the user see when a scrape fails?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline banner on job-lead detail + Retry button | Banner above Find Connections; Retry clears error and re-POSTs to `/search`. | ✓ |
| Toast on poll completion + persistent timeline entry | Sonner toast when `SearchProgress` poll detects status reverted with `lastError` set; no banner. | |
| Both — inline banner AND toast | Toast for immediate feedback + banner for durable signal. | |
| Inline banner only, no toast | Banner on detail page only. | |

**User's choice:** Inline banner on job-lead detail + Retry button.
**Notes:** Captured as D-02. New `scrape-error-banner.tsx` component. No sonner integration this phase.

### Q3: What error message gets stored — raw or normalized?

| Option | Description | Selected |
|--------|-------------|----------|
| Categorized + short raw tail | `<category>: <first 200 chars of err.message>`. 5 categories. | ✓ |
| Raw err.message (truncated to 500 chars) | Honest but ugly. | |
| Category only, no raw text | Cleanest UI but no per-scrape diagnostic. | |
| Two columns — `errorCategory` + `errorDetail` | Most structure, most schema cost. | |

**User's choice:** Categorized + short raw tail.
**Notes:** Captured as D-03. 5-category taxonomy: `Timeout`, `LinkedIn navigation failed`, `No prospects found`, `Browser unavailable`, `Unknown error`.

---

## Timeout budget + revert behavior

### Q1: What's the wall-clock budget for a single scrape before the IIFE is killed and the lead reverts to `scraped`?

| Option | Description | Selected |
|--------|-------------|----------|
| 90 seconds | Long enough for nav + 10 pages under normal load; ~30s headroom over the per-step timeout sum. | ✓ |
| 120 seconds | More generous; trades responsiveness for resilience. | |
| 60 seconds | Tight; aggressive feedback loop. | |
| Configurable via env (SCRAPE_TIMEOUT_MS), default 90s | Same default, adds one knob. | |

**User's choice:** 90 seconds.
**Notes:** Captured as D-06. No env override.

### Q2: When the 90s timeout fires, how do we clean up the in-flight Playwright work?

| Option | Description | Selected |
|--------|-------------|----------|
| Promise.race + AbortController + close context | Aborts in-flight Playwright + closes context. Cleanest. | |
| Promise.race + close context (no abort) | Closes context; in-flight calls throw and are caught. | |
| Promise.race + leave Playwright dangling | Just race against 90s and revert status. Lingering promise GC'd later. | ✓ |
| Promise.race + close context + log full error to timeline | Option 1 + separate `job_lead_search_timeout` event type. | |

**User's choice:** Promise.race + leave Playwright dangling.
**Notes:** Captured as D-10. Tension flag against SC #3 ("no leaked browser instance open after completion") documented for plan-checker — interpretation is "successful completion closes the browser; timeout-abort releases promise ownership and lets the context GC; SC #3 is about the success-path leak only."

---

## Browser lifecycle

### Q1: How should the browser context be closed after a successful scrape?

| Option | Description | Selected |
|--------|-------------|----------|
| Always close context after scrape finishes | Simplest, satisfies SC #3 cleanly; pays open/close cost per scrape. | |
| Close in remote (CDP/WS) mode only | In remote mode `close()` is cheap (just disconnect); in local mode `close()` shuts the whole persistent Chromium and the next scrape relaunches. | ✓ |
| Always close + return result without context | Same as option 1, but scrapeConnections no longer returns `context`. | |
| Module-level shared context singleton + idle timeout | Caches context, idle-times-out after 5 min. Best perf, most complex. | |

**User's choice:** Close in remote (CDP/WS) mode only.
**Notes:** Captured as D-12. Export `isRemote()` from `linkedin-browser.ts`. Local-dev `launchPersistentContext` left alive between scrapes.

---

## Debug-log cleanup scope

### Q1: How aggressive should the console.log cleanup be in scrape-connections.ts?

| Option | Description | Selected |
|--------|-------------|----------|
| Gate behind DEBUG_SCRAPE=1 env flag, silent by default | Wrap every `console.log` in env check. | |
| Delete all console.log calls outright | Strip everything; `console.error` only in catch. | |
| Replace logs with a small `scrapeLog()` helper | DRY version of env-flag option. | |
| Keep navigation breadcrumbs (~5 lines), drop DOM dumps | Middle ground — high-level breadcrumbs stay, JSON dumps go. | ✓ |

**User's choice:** Keep navigation breadcrumbs (~5 lines), drop DOM dumps.
**Notes:** Captured as D-15/D-16/D-17. Specific keep/drop list in CONTEXT.md D-15.

---

## Claude's Discretion

Areas not asked but locked by analysis or roadmap text (full list in CONTEXT.md `### Claude's Discretion`):

- **CD-01:** How to handle the existing 457-line working-tree diff (commit as-is then fix forward, vs rewrite history). Recommended: commit as-is.
- **CD-02:** Regression test for `'point'` removal as filesystem grep, not behavioral test.
- **CD-03:** Whether to lift `Scraped*` types into a shared types file — skip (premature).
- **CD-04:** Whether to reorder/strip `navigateToEmployeeList` fallback chain — defer; leave as-is.
- **CD-05:** Show "5 min ago" timestamp in banner via `date-fns formatDistanceToNow`.
- **CD-06:** Retry button uses optimistic UI (matches existing `handleFindConnections` pattern).
- **CD-07:** Keep `job_lead_search_complete` and `job_lead_search_failed` as disjoint event types.
- **CD-08:** New tests use the `callRoute` helper from Phase 2.

---

## Deferred Ideas

Ideas mentioned during discussion that belong in other phases (full list in CONTEXT.md `<deferred>`):

- PERF-A1, PERF-A2 — N+1 inserts (Phase 6).
- JL2-01..JL2-04 — decouple scrape worker, package classification, captcha detection, deeper pagination (v2).
- LinkedIn cookie file handling (Phase 3 deferred → Phase 5 closes as "no action needed").
- Architecture-doc rewrites to mark JL fragility resolved.
- Possible split of "Browser unavailable" into "CDP unreachable" vs "Captcha detected" once usage data justifies it.
- Persisting scrape duration on success-path timeline events.

---

*Phase: 05-Job Leads Completion*
*Logged: 2026-05-13*
