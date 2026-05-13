# Phase 5: Job Leads Completion - Context

**Gathered:** 2026-05-13
**Status:** Ready for planning
**Mode:** `discuss` (interactive — 4 gray areas selected from analysis, each deep-dived; log appended at bottom)

<domain>
## Phase Boundary

The LinkedIn job-leads scraper runs cleanly end-to-end. Hardcoded debug strings are replaced with the lead's actual company name. Heavy LinkedIn pages load reliably with `waitUntil: 'domcontentloaded'` + targeted `waitForSelector`, not fixed `waitForTimeout`. A scrape that hangs or fails is bounded by a 90-second wall-clock timeout and reverts the lead from `searching` back to `scraped`. Errors are surfaced to the UI via a new `lastError` / `lastErrorAt` column on `job_leads` AND a `job_lead_search_failed` timeline event. The detail page renders the last error in an inline banner with a Retry button. Debug noise is trimmed to ~5 navigation-breadcrumb log lines. Browser context is closed after successful scrapes in remote (CDP/WS) mode.

**In scope (JL-A1..A5 verbatim):**
- **JL-A1**: Replace hardcoded `'point'` company name in `src/features/job-leads/lib/scrape-connections.ts:62` with the lead's actual `companyName` (passed through `scrapeConnections(companyName, ...)` already; just propagate into the `page.evaluate(..., 'point')` call).
- **JL-A2**: Tune Playwright navigation on heavy LinkedIn pages — keep `waitUntil: 'domcontentloaded'` on `page.goto`, replace the fixed `page.waitForTimeout(5000)` / `waitForTimeout(3000)` / `waitForTimeout(2000)` sleeps with targeted `page.waitForSelector(...)` calls that wait for the actual element the next step depends on.
- **JL-A3**: Remove debug-mode noise — drop the ~15 noisy `console.log` JSON-dump calls (DOM-dump arrays, link inventories) in `scrape-connections.ts`; keep ~5 navigation-breadcrumb log lines for server-log signal. Restore `await context.close()` in the search-route success path (currently commented out). See D-12 for closure semantics by mode.
- **JL-A4**: Bound the fire-and-forget IIFE in `src/app/api/job-leads/[id]/search/route.ts:39` with `Promise.race()` against a 90-second wall-clock timer. On timeout: revert lead status to `scraped`, write a categorized `lastError` ("Timeout: scrape exceeded 90s"), write a `job_lead_search_failed` timeline event. The Playwright work is allowed to dangle (D-10).
- **JL-A5**: Surface scrape errors to the UI — add `last_error: text` and `last_error_at: timestamp` columns to `job_leads`; update `/api/job-leads/[id]/status` to return them; update `job-lead-detail.tsx` to render an inline banner above the Find Connections button with the error category + raw tail and a Retry button that clears the error and re-POSTs to `/search`.

**In scope by transitive necessity (will not satisfy SC otherwise):**
- **Drizzle migration** for the two new `job_leads` columns (`last_error: text`, `last_error_at: timestamp`) + the corresponding schema edit in `drizzle/schema/job-leads.ts`.
- **`/api/job-leads/[id]/status` response shape** must include `lastError` and `lastErrorAt` so the polling `SearchProgress` and `JobLeadDetail` components can read them without a second fetch.
- **Error categorizer** — a small helper (probably colocated in `scrape-connections.ts` or a new `src/features/job-leads/lib/scrape-errors.ts`) that maps a raw `err` / `err.message` / `err.name` to one of: `Timeout` / `LinkedIn navigation failed` / `No prospects found` / `Browser unavailable` / `Unknown error`. Output format: `<category>: <first 200 chars of err.message>`.
- **Inline-banner UI** — a small component (e.g., `src/features/job-leads/components/scrape-error-banner.tsx`) consumed by `job-lead-detail.tsx`. Renders only when `lastError` is set. Retry button calls a new helper that PATCHes/DELETEs the error fields then POSTs to `/search`.
- **Retry endpoint behavior** — `POST /api/job-leads/[id]/search` should clear `lastError` / `lastErrorAt` to NULL on every fresh invocation (whether the previous attempt succeeded or failed); this keeps the banner from sticking after a retry-success.

**Out of scope (deferred to other phases, captured in `<deferred>` below):**
- N+1 prospect inserts in the search route (PERF-A1 — Phase 6 owns).
- N+1 bridge inserts in `match-connections.ts` (PERF-A2 — Phase 6 owns).
- `playwright` package classification from `dependencies` → `devDependencies` (JL2-02 — v2-deferred).
- Captcha / rate-limit detection with backoff (JL2-03 — v2-deferred).
- Pagination beyond first results page (JL2-04 — v2-deferred). Current scraper already does up to `maxPages = 10` via the Next button; the limit is "what LinkedIn renders," not the code.
- LinkedIn session credentials on filesystem (`~/.heimdall/linkedin-profile/storage-state.json`) — Phase 3 deferred this; not a network leak, local-dev only, no change in Phase 5 unless the planner spots a concrete risk.
- Decoupling the scrape worker from the API route (JL2-01 — v2-deferred). The fire-and-forget IIFE pattern stays; we just bound it.
- `navigateToEmployeeList` strategy reorder / fragile-fallback strip — see CD-04. JL-A1 only fixes the hardcoded `'point'`; whether to also strip the `employeeLinkSelectors` fallback chain is Claude's discretion during planning.
- The `recommendation-list.tsx` / `recommendation-card.tsx` UI — `JL-V3` shipped; not under modification here.

</domain>

<decisions>
## Implementation Decisions

### Critical Pre-Discovery (anchor the whole phase here)

- **PD-01:** The working tree (uncommitted) contains 87 commits worth of cleanup-phase work AND ~457 lines of mid-refactor scraper changes against `linkedin-browser.ts`, `scrape-connections.ts`, `scrape-job-page.ts`, and `src/app/api/job-leads/[id]/search/route.ts`. Phase 1 explicitly left these dirty files for Phase 5 to own (01-CONTEXT.md §D-10). The uncommitted diff is the immediate phase surface — **planner should treat the working-tree state as the starting point, not HEAD**. Key uncommitted changes:
  - `scrape-connections.ts`: completely rewritten from the old `resolveCompanyId` search-based approach to a `navigateToEmployeeList` job→company→employees flow. **Introduces the hardcoded `'point'` debug literal (line 62) and the 15+ `console.log` dumps that Phase 5 must clean up.** The current scraper IS the JL-A1/JL-A2/JL-A3 problem — pre-rewrite code did not have these issues.
  - `linkedin-browser.ts`: adds remote CDP / WS endpoint support (~125 new lines). This is good infra, not bug fix; keep it.
  - `search/route.ts`: passes `{ jobUrl: lead.linkedinJobUrl }` to `scrapeConnections` (correct), but comments out `await context.close()` in the success path ("Leave browser open for now (debug mode)") — **the JL-A3 / SC #3 violation lives in this diff**.
  - `scrape-job-page.ts`: minor — only 24 lines changed (probably title-tag fallback work); irrelevant to Phase 5 scope.

- **PD-02:** `job_leads` schema (`drizzle/schema/job-leads.ts`) currently has columns: `id, linkedinJobUrl, roleTitle, companyName, companyId, applicationId, status, scrapedData, prospectCount, createdAt, updatedAt, archivedAt`. **No error column exists**. The `status` enum (`pending|scraping|scraped|searching|found|ready|actioned|archived`) has no `failed` value, and the ROADMAP SC #2 explicitly mandates revert to `scraped` on failure — so the design constraint is "carry the error in side data, not in the status enum." This locks the answer to "Error storage = column + timeline event" (D-01).

- **PD-03:** Phase 3 activated middleware on `/api/*`. Every API route Phase 5 touches is auth-locked at the edge; **no per-route `auth()` calls are needed**. The new `/api/job-leads/[id]/search` retry POST already inherits the lock. CLI parity: the CLI hits the same envelope, including the new `lastError` / `lastErrorAt` fields in `/status`.

- **PD-04:** `SearchProgress` (the polling component in `src/features/job-leads/components/search-progress.tsx`) polls `/status` every 3s and calls `onComplete(status, prospectCount)` when `status !== 'searching'`. It does **not** read or pass an `error` field today. JL-A5 requires either (a) extending the `onComplete` signature to also pass `lastError`, or (b) letting `JobLeadDetail` re-fetch the lead on poll completion to pick up `lastError`. Recommended: extend `/status` to return `{ status, prospectCount, lastError, lastErrorAt, updatedAt }` and have `SearchProgress` pass the error through. This keeps the polling round-trip count flat (1 per 3s).

### Error Surfacing Model (JL-A5)

- **D-01:** **Both column + timeline event.** Add `last_error: text` and `last_error_at: timestamp` columns to the `job_leads` table. Also write a `job_lead_search_failed` `timeline_events` row on every failure (with category + raw error in `metadata`). The column is the fast "what is the current state of this lead" read; the timeline event is the durable audit trail.

- **D-02:** **Inline banner on the detail page + Retry button** is the UI surface. No toast on poll completion (option rejected) — banner-only keeps signal-to-noise tight; the user is on the detail page anyway when starting a scrape. The banner sits above the Find Connections button. The Retry button (a) clears `lastError`/`lastErrorAt` to NULL, (b) re-POSTs to `/search`. If the banner persists in the DB but the user navigates away, on return it still shows — durable signal.

- **D-03:** **Error message format = `<category>: <first 200 chars of err.message>`.** Categories (closed set, 5 values):
  1. `Timeout` — Promise.race timer fired
  2. `LinkedIn navigation failed` — `navigateToEmployeeList` returned `false` (couldn't find company / employees link)
  3. `No prospects found` — navigation succeeded but `scrapeResultsPage` returned 0 results across all pages
  4. `Browser unavailable` — `getContext()` threw (CDP endpoint unreachable, Playwright launch failure, etc.)
  5. `Unknown error` — anything else thrown in the IIFE catch block

  The category is what the user sees prominently in the banner; the raw tail is for debugging when the user expands. Single column, one string, parsed by colon. No second column needed (rejected option D — `errorCategory` + `errorDetail` is over-structured for the use case).

- **D-04:** **`lastError`/`lastErrorAt` are cleared on every fresh `/search` POST.** On retry-success the banner naturally disappears (column is NULL); on retry-failure it gets overwritten with the new error. No separate "dismiss" UI action — the only way to clear an error is to retry.

- **D-05:** **`/api/job-leads/[id]/status` returns `lastError` and `lastErrorAt`** alongside `status`, `prospectCount`, `updatedAt`. Single round-trip per poll tick (`SearchProgress` already polls every 3s; no new endpoint).

### Timeout Budget + Revert Behavior (JL-A4)

- **D-06:** **Wall-clock budget = 90 seconds** for the entire fire-and-forget IIFE. Captured via `Promise.race([scrapeWork, timeoutPromise(90_000)])`. The 90s figure: current per-step Playwright timeouts (30s `page.goto` + 15s `waitForSelector` + several 5s/3s sleeps that JL-A2 will tighten) sum to ~60s for a clean run; 90s leaves ~30s of headroom for slow LinkedIn responses without letting a hung browser block the lead for minutes. No env-var override (rejected — one knob is more than enough).

- **D-07:** **Timeout label = `Timeout: scrape exceeded 90s`.** Written to `lastError` exactly. Also emits a timeline event of type `job_lead_search_failed` with `metadata.category = 'Timeout'` and `metadata.elapsedMs` if measurable.

- **D-08:** **Status revert on timeout = `searching` → `scraped`** (per ROADMAP SC #2). Not `pending`, not `failed` (no such enum value), not `archived`. The lead remains visible in the UI in a usable state from which Retry is possible.

- **D-09:** **Same revert flow applies to non-timeout failures.** Any `err` thrown inside the scrape IIFE (catch block at `route.ts:89`) also writes `lastError` (category + tail per D-03), writes a `job_lead_search_failed` timeline event, and reverts status to `scraped`. The existing `catch (err) { console.error('Connection search failed:', err); await db.update(...).set({ status: 'scraped', ... }) }` is the right pattern — Phase 5 just adds the error-write + timeline write to it.

- **D-10:** **Promise.race + leave Playwright dangling on timeout.** No `AbortController`, no `context.close()` on the timeout path. The Playwright work is allowed to complete or error out in the background and be GC'd. **Tension flag for the planner:** SC #3 says "no leaked browser instance open after completion" — interpretation here is "successful completion closes the browser; timeout-abort releases ownership of the context promise and lets it eventually GC; SC #3 is about the successful-path leak only." Planner verifies this interpretation against the SC wording during plan-checker. If SC #3 is interpreted strictly (any termination must close), upgrade to option 2 from the discussion (Promise.race + close context after timer fires, accept that in-flight Playwright calls will throw uncaught).

- **D-11:** **Timeout helper colocation.** Put the timeout-wrapper logic inside `src/app/api/job-leads/[id]/search/route.ts` itself — it's a one-time pattern (one call site), not worth extracting to a util. Inline `Promise.race([scrapeWork, new Promise((_, reject) => setTimeout(() => reject(new ScrapeTimeoutError(...)), 90_000))])` plus a category check in the catch block. Custom error class `ScrapeTimeoutError` so the catch block can distinguish `Timeout` from other failures and label accordingly (D-03 category mapping).

### Browser Lifecycle (JL-A3 / SC #3)

- **D-12:** **Close context in remote (CDP/WS) mode only.**
  - In remote mode (`BROWSER_CDP_ENDPOINT` or `BROWSER_WS_ENDPOINT` set): `await context.close()` after every successful scrape. In CDP mode this disconnects from the host browser (the host stays alive); in WS mode it closes the temporary context but leaves the Playwright server running. Either way: no leaked browser instance on the heimdall-app side.
  - In local mode (`chromium.launchPersistentContext` with no env vars): **do NOT call `context.close()`**. Closing the persistent context shuts the entire Chromium process and the next scrape pays a 3–5s relaunch cost. Local-dev is a single-user persistent session; leaving the persistent context alive between scrapes is the expected pattern for `launchPersistentContext`.
  - Detection: re-export an `isRemote()` helper from `linkedin-browser.ts` (already exists internally, line 47) so `scrapeConnections` or the search route can decide whether to close.

- **D-13:** **Failed-scrape close behavior matches success path** in remote mode. Whether the IIFE completes successfully, throws, or times out, the close decision is the same: if remote, close; if local, don't. This eliminates a branch in the catch block.

- **D-14:** **Signature change to `scrapeConnections` is acceptable.** Currently returns `{ prospects, context }`. Phase 5 changes the return to just `{ prospects }` and pushes context lifecycle entirely inside the function (it opens, scrapes, closes per D-12). The search route no longer needs to know about `context` — cleaner API surface, one less footgun. Acceptable because there's only one caller (`src/app/api/job-leads/[id]/search/route.ts`).

### Debug-Log Cleanup Scope (JL-A3 / SC #3)

- **D-15:** **Keep navigation breadcrumbs (~5 lines), drop DOM dumps.** Keep:
  1. `console.log('Navigating to job posting...')` (line ~25)
  2. `console.log('On company page:', page.url())` (line ~78)
  3. `console.log('Navigated to people search: ...')` or `'Clicked employees link'` (one of, depending on which fallback fired) (line ~118 / ~137)
  4. `console.log('Scraping page N...')` (line ~321)
  5. `console.log('Scraping complete. Found X prospects at <company>')` (line ~339)

  Drop:
  - `console.log('Links on job page:', JSON.stringify(pageLinks, null, 2))` (~line 39) — 30-element JSON dump
  - `console.log('Employee-related links found:', JSON.stringify(allLinks, null, 2))` (~line 88) — 10-element JSON dump
  - All `console.log('Extracted X people from page')` / `console.log('Total prospects so far: X')` mid-loop (lines 246, 330) — noisy per-page chatter
  - `console.log('Could not find company link on job page')` / `console.log('Could not find employees link on company page')` (lines 72, 153) → replaced by `console.error` + an `Error` thrown so the IIFE catch block can categorize as `LinkedIn navigation failed` (D-03).
  - `console.log('Clicked company link (href match)')` / `console.log('Navigated to company via text match')` (lines 48, 67) — strategy-debug, drop.
  - `console.log('Timed out waiting for results to render')` (line 168) → replaced by `console.error` + thrown `Error`.

- **D-16:** **`console.error` stays unconditional in catch paths.** `console.error('Connection search failed:', err)` (route.ts:90) and `console.error('Scrape error:', err)` (scrape-connections.ts:341) are kept. These are real failures, not debug noise.

- **D-17:** **No env-flag gating.** Rejected `DEBUG_SCRAPE=1` env-flag option in favor of permanent slim breadcrumbs. If the user needs more verbose output during a future debug session, temporary `console.log` is fine — don't ship debug code behind a flag.

### Verification Strategy (Phase 5 SC #1–4)

- **D-18:** **Three verification layers, all required:**
  1. **Pure-logic tests** (Vitest, node env, no PGlite needed):
     - `src/features/job-leads/lib/scrape-errors.test.ts` (or inline in `scrape-connections.test.ts`) — categorizer function: given various error inputs (`Error('navigation timeout')`, `new ScrapeTimeoutError(...)`, `new Error('Failed to connect to CDP')`, etc.), assert the correct category prefix is produced.
     - Existing `prioritization.test.ts` and `seniority.test.ts` are not under modification; do not retest.
  2. **API-route integration test** (PGlite, simulates the IIFE timeout path):
     - `src/app/api/job-leads/[id]/search/route.test.ts` — POST `/search` for a lead, mock `scrapeConnections` to return a never-resolving promise, advance the Promise.race timer (vitest's `vi.useFakeTimers()`), assert: (a) lead status reverts to `scraped`, (b) `lastError` starts with `Timeout:`, (c) a `timeline_events` row of type `job_lead_search_failed` exists with `metadata.category = 'Timeout'`.
     - Same file: test the categorized non-timeout path — mock `scrapeConnections` to throw `new Error('No prospects found')`, assert `lastError` starts with `No prospects found:`.
  3. **Manual smoke** (dev server, real LinkedIn):
     - Paste a real LinkedIn job URL, trigger scrape, confirm prospects populate (SC #1) and no `'point'` literal remains.
     - Watch server logs during a scrape — confirm exactly 5 navigation-breadcrumb log lines, no JSON dumps (SC #3).
     - Force a hang (disconnect from CDP mid-scrape or scrape a known-bad URL) — confirm lead reverts within 90s and banner appears (SC #2).
     - Check `npm run dev`'s console after a successful scrape — confirm no leaked Chromium process via `ps aux | grep -i chromium` (SC #3) when running in CDP mode.

- **D-19:** **Filesystem-level assertion on `'point'` removal** (mirrors Phase 4 D-16): grep-style assertion in the test suite — read `src/features/job-leads/lib/scrape-connections.ts` as UTF-8, `expect(content).not.toMatch(/'point'/)`. Cheap deterministic check that the most-named bug from REQUIREMENTS is gone.

### Plan Grouping (informs the planner, not a hard rule)

- **D-20:** **Recommended plan breakdown — five plans, two waves**, mirroring Phase 4's grouping pattern. Planner has final authority.

  **Wave 1 (parallel — disjoint file sets):**
  - **05-01-PLAN.md (JL-A1)** — Fix hardcoded `'point'` in `scrape-connections.ts:62`. One-line change (`'point'` → `companyName`) plus the function signature already accepts a `companyName` param at the outer level; the inner `page.evaluate` callback just needs to be parameterized. Add the regression test from D-19. Atomic commit.
  - **05-02-PLAN.md (JL-A2)** — Replace fixed `waitForTimeout` calls with `waitForSelector`. Targeted edits in `scrape-connections.ts`: after `page.goto(jobUrl)`, wait for `a[href*="/company/"]` instead of 5000ms; after company-page goto, wait for the employees/people link instead of 5000ms; after people-search goto, wait for `a[href*="/in/"]` instead of 3000ms. Atomic commit.
  - **05-03-PLAN.md (JL-A3)** — Debug-log cleanup per D-15/D-16/D-17 + restore `await context.close()` in remote mode only per D-12/D-13/D-14. Touches `scrape-connections.ts` and `search/route.ts` and `linkedin-browser.ts` (export `isRemote()`). Atomic commit.

  **Wave 2 (blocked on Wave 1 — schema-dependent):**
  - **05-04-PLAN.md (JL-A4)** — Schema migration (add `last_error` / `last_error_at` columns + `drizzle/schema/job-leads.ts` edit) + 90s `Promise.race()` wrapper around the IIFE + categorizer helper + `ScrapeTimeoutError` class. Touches schema + `search/route.ts`. Adds the integration tests from D-18. **Sequenced after Wave 1 because the cleaned-up `scrape-connections.ts` is what gets wrapped.** Atomic commit (or 2-3 commits: schema migration → wrapper → tests).
  - **05-05-PLAN.md (JL-A5)** — `/status` endpoint returns `lastError`/`lastErrorAt`; `SearchProgress` passes them through; new `ScrapeErrorBanner` component; `JobLeadDetail` renders it with Retry. Touches `status/route.ts`, `search-progress.tsx`, `job-lead-detail.tsx`, new `scrape-error-banner.tsx`. **Sequenced after JL-A4 because the columns must exist before the UI can read them.** Atomic commit.

  **Why this ordering:** Wave 1 is "clean up the scraper as it stands" (no schema dependency); Wave 2 is "add the error-surfacing infrastructure that requires the new columns." The schema migration is the wave boundary.

- **D-21:** **Atomic commits per requirement.** Each JL-Ax gets its own commit so `git log` reads cleanly. Phase 3 / Phase 4 set the pattern. If the planner finds 05-04 too big (schema + wrapper + tests), split it — but commits stay per-requirement-or-finer, never wider.

### Claude's Discretion

- **CD-01:** **Whether to fold the existing working-tree changes into Wave 1 commits or commit them separately first.** The working tree has 457 lines of uncommitted scraper work that introduced exactly the JL-A1/JL-A3 bugs Phase 5 fixes. Two options:
  - **A:** Commit the working tree first as "feat(jl): switch scraper to job→company→employees flow (introduces JL-A1/A3 issues, fixed in Phase 5)" with a clear message that the next 5 commits resolve the issues. Then Wave 1 fixes apply on top.
  - **B:** Stash the working tree, branch off HEAD, replay only the keepable parts (remote browser support in `linkedin-browser.ts`, the `jobUrl` param threading) as Wave 0 commits, then do Phase 5 Wave 1 on top — i.e., never commit the buggy intermediate state.

  Recommended: **A** — the working-tree state is the actual development history; rewriting it to be "clean" is busywork that hides the timeline. Phase 5's purpose is to ship the fixes, not to retcon the history. Planner verifies during plan-checker.

- **CD-02:** **Whether the regression test for `'point'` removal (D-19) lives as a filesystem grep or as a behavioral test.** Filesystem grep is bulletproof and fast (<10ms); behavioral test would require mocking Playwright and checking `companyName` actually flows into the `page.evaluate` second-arg. Recommended: **filesystem grep** per D-19 — the bug is a literal string; the test should be a literal-string assertion. Behavioral coverage of the scraper is OOS per Phase 2 D-13.

- **CD-03:** **Whether to lift the existing `ScrapedJobData` / `ScrapedProspect` types into a shared `src/features/job-leads/lib/types.ts`** to avoid the existing import-from-internal pattern. Recommended: **skip** — premature factoring. The types are used in 2 files; barrel/refactor adds noise without value. Defer.

- **CD-04:** **Whether to also reorder or strip the `navigateToEmployeeList` fallback chain** (the 3 strategies: direct href, text match, employee-link selectors). Currently strategy 2 is where `'point'` lives; after JL-A1 fix it becomes a real text-match strategy. The fallback chain may be over-engineered (most LinkedIn job pages have a direct `/company/` href and never fall through to strategy 2 or 3). Recommended: **defer / leave as-is** — JL-A1 only asks for the literal fix; broader refactoring of fragile fallbacks is its own phase. If the planner finds strategy 3 (`employeeLinkSelectors`) is provably dead during a manual smoke, ship a one-line `git rm` of the loop — otherwise leave.

- **CD-05:** **Whether the inline banner shows `lastErrorAt` ("5 min ago") via `date-fns`** or just the message. `date-fns` is already a dep. Recommended: **show "5 min ago"** — cheap, makes "is this a fresh error or stale?" visible. Use `formatDistanceToNow(new Date(lastErrorAt), { addSuffix: true })`.

- **CD-06:** **Whether the Retry button uses optimistic UI** (set status to `searching`, clear `lastError` client-side, then POST) **or waits for the server**. Recommended: **optimistic** — matches the existing `handleFindConnections` in `job-lead-detail.tsx` (line 26–34) which already sets `isSearching = true` before the POST resolves. Consistent UX.

- **CD-07:** **Whether to add a `job_lead_search_complete` timeline event count toward the same `metadata.category` taxonomy** as failures. Today the success path emits `job_lead_search_complete` with `prospectCount` etc.; the failure side adds `job_lead_search_failed` with `category`. They're disjoint event types, so no naming collision. Recommended: **keep them disjoint** — different event types for different outcomes is clearer in the timeline feed.

- **CD-08:** **Whether the new test files use the `callRoute` helper** (Phase 2 `src/test-utils/call-route.ts`) **or hand-construct `Request` objects.** Recommended: **`callRoute`** — Phase 2 D-09 established the pattern; consistent with existing API tests.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §"Job Leads Completion" — JL-A1..A5 verbatim acceptance criteria.
- `.planning/ROADMAP.md` §"Phase 5: Job Leads Completion" (lines 93–101) — Goal + 4 success criteria. SC #2 explicitly mandates revert to `scraped` (locks status enum choice).
- `.planning/PROJECT.md` §"Active" lines 45–46 — JL-A1, JL-A2 phrased slightly differently from REQUIREMENTS; PROJECT.md groups them as a single concern. REQUIREMENTS.md is the canonical contract.
- `.planning/PROJECT.md` §"Key Decisions" — Job Leads scraping via Playwright + CDP (⚠️ Revisit — scraper is brittle, hardcoded `'point'` debug artifact still present). Phase 5 closes this revisit.

### Codebase Maps (read before planning)
- `.planning/codebase/CONCERNS.md` §"Fragile Areas → LinkedIn Scraper — Entire Feature Is Brittle" — Names every bug Phase 5 must fix, including line-level pointers to the hardcoded `'point'` (line 62), the leaked browser comment (lines 344–346), and the fixed `waitForTimeout` antipatterns.
- `.planning/codebase/CONCERNS.md` §"Fragile Areas → Fire-and-Forget Async Pattern with No Timeout" — JL-A4 source.
- `.planning/codebase/CONCERNS.md` §"Fragile Areas → `scrape-connections.ts` Debug Code in Production" — JL-A3 source.
- `.planning/codebase/CONCERNS.md` §"Performance Bottlenecks → N+1 Prospect Inserts" — **OOS for Phase 5** (PERF-A1 / Phase 6); note for the planner so they don't accidentally bundle it.
- `.planning/codebase/ARCHITECTURE.md` §"Anti-Patterns → Async fire-and-forget" — Architectural context for D-04 / D-10.
- `.planning/codebase/STACK.md` — Playwright 1.58.2, cheerio 1.2, Drizzle 0.45.1, Neon serverless HTTP driver, Next.js 16 App Router.

### Prior Phase Context (decisions to carry forward)
- `.planning/phases/01-critical-bug-fix/01-CONTEXT.md` §"D-10" — Phase 1 explicitly handed the dirty job-leads files to Phase 5. Working-tree state at the start of Phase 5 is the expected starting point.
- `.planning/phases/02-test-infrastructure/02-CONTEXT.md` §"D-09, §"D-13" — Vitest harness + colocated `*.test.ts` pattern; explicitly deferred Job Leads scraper coverage to Phase 5. D-09 confirms PGlite-backed Drizzle is available for the IIFE-timeout integration test. `src/test-utils/{pglite,call-route}.ts` are the reusable helpers.
- `.planning/phases/03-security-hardening/03-CONTEXT.md` §"deferred → LinkedIn cookie file" — Phase 3 explicitly deferred LinkedIn session file handling to Phase 5 if any work was needed. Phase 5 does **not** revisit it (no concrete risk identified; local-dev only path) — captured in `<deferred>` below.
- `.planning/phases/04-starter-template-cleanup/04-CONTEXT.md` §"D-19, D-18" — Atomic commits per requirement + parallel-on-disjoint-file-sets plan pattern. Phase 5 follows both.

### Source Files (under modification)
- `src/features/job-leads/lib/scrape-connections.ts` — Largest target. JL-A1 (line 62 `'point'`), JL-A2 (lines 29/77/117/144/289 fixed `waitForTimeout` calls), JL-A3 (lines 25/39/48/67/72/78/88/118/137/153/168/246/321/325/330/339/341 console.log/error), plus signature change per D-14.
- `src/features/job-leads/lib/linkedin-browser.ts` — Export `isRemote()` so the search route / scrape-connections can branch close behavior. No other changes needed (the remote CDP/WS infrastructure from the working-tree diff is correct as-is).
- `src/features/job-leads/lib/scrape-job-page.ts` — **Not modified by Phase 5.** The working-tree diff (24 lines) appears to be unrelated title-tag-fallback work; planner should commit it separately (CD-01).
- `src/app/api/job-leads/[id]/search/route.ts` — JL-A4 (Promise.race + 90s timer), JL-A3 (restore `context.close()` in remote mode), JL-A5 (write `lastError`/`lastErrorAt` in catch block, write timeline event on failure, clear error on every fresh POST).
- `src/app/api/job-leads/[id]/status/route.ts` — JL-A5 (return `lastError`/`lastErrorAt` in the response payload).
- `src/features/job-leads/components/search-progress.tsx` — JL-A5 (extend `onComplete` to pass `lastError`; or have it not handle that and let `JobLeadDetail` re-fetch — D-PD-04 / planner picks).
- `src/features/job-leads/components/job-lead-detail.tsx` — JL-A5 (render the new `ScrapeErrorBanner` above Find Connections; pipe `lastError` from poll into state).
- `src/features/job-leads/components/scrape-error-banner.tsx` — **New file.** Banner + Retry button per D-02.
- `drizzle/schema/job-leads.ts` — Add `last_error: text` + `last_error_at: timestamp`. Drizzle migration generated via `npm run db:generate`.
- `drizzle/migrations/` — New migration file (auto-named) for the schema change.

### Tooling / Build / Test
- `vitest.config.ts` — No edits. Phase 2 config supports both node + jsdom; new tests are node-only.
- `src/test-utils/pglite.ts` + `src/test-utils/call-route.ts` — Reusable per Phase 2 D-09. New `search/route.test.ts` uses both.
- `package.json` — No new dependencies expected. `date-fns` already present (CD-05).
- `drizzle.config.ts` — Migration target dir.

### Coding Conventions
- `CLAUDE.md` — TypeScript strict, named exports, REST API (no server actions), Zod on all routes, `{ success, data, error, meta }` envelope. New `Retry` POST inherits the existing `/search` route's POST handler (just clears `lastError` before scraping).
- `.planning/codebase/CONVENTIONS.md` — kebab-case files; banner component file = `scrape-error-banner.tsx`.

### External References (Playwright / LinkedIn)
- Playwright docs: `page.waitForSelector` (replacing `waitForTimeout`), `context.close()` semantics in `connectOverCDP` vs `launchPersistentContext`. Planner/researcher to confirm exact close semantics in CDP mode for D-12.
- No LinkedIn API docs — scraper is selector-driven. JL-A1/A2 don't require deeper LinkedIn knowledge than what's already in `scrape-connections.ts`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 2 PGlite harness** (`src/test-utils/pglite.ts`, `src/test-utils/call-route.ts`) — Reused for the JL-A4 integration test (D-18 layer 2). PGlite handles `text` and `timestamp` column types natively; no harness changes.
- **`getContext()` / `isRemote()` in `linkedin-browser.ts`** — `isRemote()` is currently a private function (line 47); Phase 5 needs to either export it or duplicate the env-var check elsewhere. Export is cleaner.
- **`logTimeline()`** — Already imported by `search/route.ts`; reused for the new `job_lead_search_failed` event type. No new helper needed.
- **`date-fns` `formatDistanceToNow`** — For CD-05's "5 min ago" timestamp in the banner.
- **Existing `SearchProgress` poll loop** — Polls `/status` every 3s; needs no architectural change, just signature extension to pass `lastError` through `onComplete`.
- **The current uncommitted working-tree state** — IS the starting point per CD-01. Don't rewrite history; commit it and fix forward.

### Established Patterns
- **Fire-and-forget IIFE pattern** in `search/route.ts:39-96` — Stays as-is, just wrapped in `Promise.race()`. JL2-01 (decouple to sidecar) is OOS / v2-deferred.
- **`logTimeline()` after every write** — JL-A5 adds two new event types: `job_lead_search_failed` (on every failure / timeout), distinct from existing `job_lead_search_complete` (on success). Both follow the standard `{ eventType, title, companyId, metadata }` shape.
- **Cursor pagination on `updated_at`** — Not relevant this phase, but the `updatedAt` column gets bumped on every error-write so polling cursors stay correct.
- **Drizzle schema migration via `npm run db:generate`** — Standard pattern; the new migration file will be auto-named by Drizzle Kit. Planner should NOT hand-write the SQL.
- **Atomic commits per requirement** (Phase 3 D-12, Phase 4 D-19) — Phase 5 inherits.
- **Parallel plans on disjoint file sets** (Phase 4 D-18) — Wave 1's three plans touch different files; Wave 2's two plans are sequenced because of the schema dependency.

### Integration Points
- **`/api/job-leads/[id]/search` → `scrapeConnections()`** — Currently passes `lead.companyName` and `{ jobUrl: lead.linkedinJobUrl }`. After Phase 5, also clears `lastError`/`lastErrorAt` on entry (D-04).
- **`SearchProgress` → `/api/job-leads/[id]/status`** — Polls every 3s. After Phase 5, the response shape includes `lastError`/`lastErrorAt` and `SearchProgress.onComplete` passes them up to `JobLeadDetail`.
- **`JobLeadDetail` → `ScrapeErrorBanner` (new)** — When `lead.lastError` is non-null, banner renders above the Find Connections button. Banner's Retry button calls a new `handleRetry` that mirrors `handleFindConnections` but uses the same `/search` POST endpoint (the endpoint itself clears the error on entry).
- **`scrapeConnections()` → context lifecycle** — Currently returns `{ prospects, context }`; after Phase 5 returns just `{ prospects }` (D-14). Caller signature updates accordingly.
- **`timeline_events` table → activity feed** — A new event type `job_lead_search_failed` joins the existing event vocabulary. The activity-feed component reads them generically (no per-type rendering today); planner verifies the feed surface still looks reasonable with a `failed` row.

### What the Planner Does NOT Need to Research
- Whether to add a `failed` enum value to `jobLeadStatusEnum` (PD-02 / D-08 lock: NO — revert to `scraped`).
- Where to put the error text (D-01 locks: `last_error: text` column + `timeline_events` row).
- Wall-clock budget (D-06 locks: 90s, no env override).
- Close-on-success policy (D-12 locks: remote mode only).
- Whether to gate logs behind a flag (D-17 locks: no flag, permanent slim breadcrumbs).
- Whether to extract a timeout-helper util (D-11 locks: inline).
- Whether to test the categorizer (D-18 locks: yes, layer 1).
- Whether `'point'` removal needs a behavioral test (CD-02 locks: filesystem grep is sufficient).

### What the Planner DOES Need to Research / Decide
- **Exact Playwright `context.close()` behavior** in CDP mode (does it disconnect from the host browser cleanly without sending a `Browser.close` message?) and WS mode. The planner / researcher confirms via Playwright docs before locking D-12 in code. If WS-mode `close()` is destructive in a way that breaks the next scrape, the policy may need to be CDP-only.
- **Whether `vi.useFakeTimers()` correctly advances `setTimeout` inside the IIFE** when the route handler is invoked via `callRoute`. The integration test in D-18 layer 2 depends on this — if vitest's fake timers don't fire inside the unawaited IIFE, the test needs `vi.advanceTimersByTime(90_000)` + `await flushPromises()` or a similar pattern. Planner verifies during plan-checker.
- **Exact `waitForSelector` targets** for each replaced `waitForTimeout` (JL-A2). Researcher / planner picks the right selector per nav step:
  - After job-posting goto → `a[href*="/company/"]` (already exists in the file at line 44; reused).
  - After company-page goto → `a[href*="currentCompany"]` or `a:has-text("employees")` (the existing fallback selectors give the menu of candidates).
  - After people-search goto → `a[href*="/in/"]` (already exists at line 166; reused).
- **Whether the existing 24-line `scrape-job-page.ts` diff** in the working tree is JL-related Phase 5 work or unrelated cleanup. Quick inspection: lines look like title-tag fallback enhancements unrelated to JL-A1..A5. Commit separately as part of CD-01.
- **Whether `npm run db:migrate` is idempotent** if the migration runs in dev twice. Standard Drizzle Kit behavior says yes (uses `_journal.json` to track applied migrations), but worth a quick sanity check before plan-execute.

</code_context>

<specifics>
## Specific Ideas

- **The banner copy** should read something like: `Last search failed: Timeout: scrape exceeded 90s — 5 min ago` with the category in bold and a `Retry` button on the right. Use `bg-destructive/10` + `border-destructive/30` for the banner styling (matches the existing destructive-variant pattern in shadcn/ui). Look at how the existing `ScrapeResults` component shows the scraped job summary for layout cues — banner sits in the same vertical stack just above the Find Connections button.

- **The `ScrapeTimeoutError` class** can be a one-liner: `class ScrapeTimeoutError extends Error { constructor(ms: number) { super(`scrape exceeded ${ms}ms`); this.name = 'ScrapeTimeoutError'; } }`. Inline in `search/route.ts`. The catch block checks `err.name === 'ScrapeTimeoutError'` to pick the `Timeout` category.

- **The categorizer** can be ~15 lines:
  ```ts
  function categorizeError(err: unknown): string {
    if (err instanceof ScrapeTimeoutError) return `Timeout: ${err.message}`;
    const msg = err instanceof Error ? err.message : String(err);
    const tail = msg.slice(0, 200);
    if (/navigat|company link|employees link/i.test(msg)) return `LinkedIn navigation failed: ${tail}`;
    if (/no prospects|0 prospects|no results/i.test(msg)) return `No prospects found: ${tail}`;
    if (/CDP|WS|connect|launch|Chromium|browser/i.test(msg)) return `Browser unavailable: ${tail}`;
    return `Unknown error: ${tail}`;
  }
  ```
  Test cases in D-18 layer 1 cover each branch.

- **For the integration test** (D-18 layer 2), use `vi.useFakeTimers({ shouldAdvanceTime: true })` and call `vi.advanceTimersByTimeAsync(90_000)` after triggering the POST. Then `await new Promise(r => setImmediate(r))` to flush microtasks, then assert the DB row state. Pattern reference: search Vitest docs for "async fake timers" if the planner is unsure.

- **The `last_error` column should be NULLABLE** with no default. NULL = "no error to surface"; a non-null value = "the most recent scrape failed with this category + tail." Same for `last_error_at`.

- **Index considerations:** No new indexes required for Phase 5's columns. The `/status` lookup is by `id` primary key; banner reads are by primary key. Phase 6 (PERF-A4) covers index strategy globally.

- **Migration name suggestion:** `add_last_error_to_job_leads` or similar — Drizzle Kit will auto-generate but the planner can pass a name via `npm run db:generate -- --name=...`.

</specifics>

<deferred>
## Deferred Ideas

These came up during analysis but are out of Phase 5 scope. Captured so future phases don't lose them.

- **PERF-A1 (Phase 6)** — N+1 prospect inserts in the search route IIFE (`for (const sp of scrapedProspects) { await db.insert(prospects).values({...}) }`). Phase 6 (Performance) owns; Phase 5 does NOT touch the loop even though it's in the same file.
- **PERF-A2 (Phase 6)** — N+1 bridge inserts in `match-connections.ts`. Same as above.
- **JL2-01 (v2)** — Decouple scrape worker from the API route (move to a sidecar / remote browser service). The fire-and-forget IIFE pattern is being bounded, not removed.
- **JL2-02 (v2)** — Move `playwright` from `dependencies` to `devDependencies` (or `serverExternalPackages`). Heimdall doesn't deploy the scraper to Vercel currently; this is a future deploy-config question.
- **JL2-03 (v2)** — Captcha / rate-limit detection with exponential backoff. Phase 5's categorizer surfaces "Browser unavailable" or "LinkedIn navigation failed" today; recognizing a captcha specifically + backing off is its own feature.
- **JL2-04 (v2)** — Pagination beyond page 10 (current `maxPages` cap). LinkedIn's results page is the source of truth; not a Phase 5 concern.
- **Phase 3 deferred — LinkedIn cookie file handling** (`~/.heimdall/linkedin-profile/storage-state.json`). Phase 3 03-CONTEXT.md `<deferred>` flagged this for Phase 5 if any work was needed. Phase 5 finds no concrete production risk (local-dev / Docker only, file is on local FS not in repo, Vercel can't reach `homedir()` anyway). **Decision: leave as-is.** Document in 05-CONTEXT.md (here) and consider closed. A future phase can revisit if Heimdall ever ships scraping to a multi-tenant runtime.
- **navigateToEmployeeList fallback reorder / dead-fallback strip** (CD-04) — Strategy 3 (`employeeLinkSelectors`) may be dead given that LinkedIn always renders the people-search `currentCompany` link. Stripping it would simplify the file but isn't in scope. Defer to a follow-on scraper-hardening phase or v2.
- **Captcha-aware error category** — If "Browser unavailable" turns out to be the most common failure category in production, the planner may want to split it into "CDP unreachable" vs "LinkedIn captcha detected." For now, the 5-category taxonomy is intentionally coarse — wait until usage data justifies more granularity.
- **Persisting scrape duration** — Could write `metadata.elapsedMs` on every `job_lead_search_complete` and `job_lead_search_failed` event for an "average scrape duration" metric later. Phase 5 includes `elapsedMs` in the failed-event metadata (D-07) but doesn't add it to the success path. Could be a future polish task.
- **The 24-line `scrape-job-page.ts` working-tree diff** — Appears to be unrelated title-tag-fallback enhancements. Commit separately per CD-01; not part of any JL-A requirement. If this turns out to introduce a regression in `JL-V1` job-page scraping, that's a separate bug to file.
- **`org-switcher.tsx`, `demo-form.tsx`, `user-auth-form.tsx`, profile route chrome** — Phase 4 deferred-section items. Not Phase 5's problem.
- **Architecture-doc rewrites** — `.planning/codebase/ARCHITECTURE.md` and `.planning/codebase/CONCERNS.md` will need a sweep after Phase 5 to mark the JL fragility as resolved. Doc-update task, not Phase 5 implementation.

### Reviewed Todos (not folded)
None — no project-level todos cross-referenced this phase via `gsd-sdk query todo.match-phase`.

</deferred>

---

## Discussion Log

For each gray area surfaced during analysis, the user picked one option per sub-question. Default mode — 4 areas, multiple sub-questions per area, no `--auto`.

### Area 1: Error surfacing model
- **Q:** "Where should the scrape-failure error live so the UI can render it?" → **Selected: Both — column + timeline event** (D-01).
- **Q:** "What does the user see when a scrape fails?" → **Selected: Inline banner on job-lead detail + Retry button** (D-02). Toast rejected — banner-only signal.
- **Q:** "What error message gets stored — raw or normalized?" → **Selected: Categorized + short raw tail** (D-03). 5-category taxonomy.

### Area 2: Timeout budget + revert behavior
- **Q:** "What's the wall-clock budget for a single scrape before the IIFE is killed and the lead reverts to `scraped`?" → **Selected: 90 seconds** (D-06). No env-var override.
- **Q:** "When the 90s timeout fires, how do we clean up the in-flight Playwright work?" → **Selected: Promise.race + leave Playwright dangling** (D-10). Tension flag against SC #3 captured for plan-checker — interpretation is "successful completion closes the browser; timeout-abort releases ownership and lets it GC."

### Area 3: Browser lifecycle
- **Q:** "How should the browser context be closed after a successful scrape?" → **Selected: Close in remote (CDP/WS) mode only** (D-12). Local `launchPersistentContext` stays alive between scrapes (relaunch cost).

### Area 4: Debug-log cleanup scope
- **Q:** "How aggressive should the console.log cleanup be in scrape-connections.ts?" → **Selected: Keep navigation breadcrumbs (~5 lines), drop DOM dumps** (D-15). No env-flag gating (D-17).

### Skipped gray area (5th, not selected)
- **navigateToEmployeeList resilience** — The fallback-chain reorder / dead-fallback strip question wasn't picked. Captured as CD-04 / `<deferred>` — Claude's discretion during planning, with a recommendation to leave as-is.

---

*Phase: 05-Job Leads Completion*
*Context gathered: 2026-05-13*
