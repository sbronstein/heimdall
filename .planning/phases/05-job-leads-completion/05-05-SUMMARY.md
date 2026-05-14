---
phase: 05-job-leads-completion
plan: 05
subsystem: ui

tags: [ui, react, shadcn, sonner, clipboard, job-leads, claude-skill]

# Dependency graph
requires:
  - phase: 05-job-leads-completion
    plan: 01
    provides: jobLeadStatusValues now contains 'queued' and 'failed'; JobLead.lastError / lastErrorAt columns
  - phase: 05-job-leads-completion
    plan: 04
    provides: POST /api/job-leads/[id]/search rewritten as thin state-machine flip — used by handleRetry to re-queue a failed lead
provides:
  - src/features/job-leads/components/job-lead-detail.tsx — new render branches for scraped/queued/searching/failed with copy-skill-invocation button and categorized failure banner
  - src/features/job-leads/components/job-lead-card.tsx — extended statusColors map with distinct visual treatment for queued (amber) and failed (red)
affects: [05-06, 05-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Copy-to-clipboard via navigator.clipboard.writeText, wrapped in try/catch with sonner toast.success / toast.error"
    - "Local optimistic state flip on retry: setLead((prev) => ({...prev, status: 'queued', lastError: null, lastErrorAt: null})) after successful POST — no full page refresh needed for the visual feedback"
    - "Categorized failure banner pattern: lead.lastError?.split(':')[0] for category in bold, .split(':').slice(1).join(':').trim() for detail tail in muted text — matches D-09 format 'Category: detail'"
    - "Status-driven render branches via {lead.status === 'X' && (...)} chains — no useEffect-based polling component (D-17 explicitly defers real-time notifications)"

key-files:
  created: []
  modified:
    - src/features/job-leads/components/job-lead-detail.tsx
    - src/features/job-leads/components/job-lead-card.tsx

key-decisions:
  - "Used the explicit amber Tailwind classes (bg-amber-100/text-amber-900 dark:bg-amber-900/30 dark:text-amber-200) for the queued status in the card, matching CONTEXT.md <specifics> verbatim rather than the simpler `Badge variant='secondary'` — visually clearer in a list of mostly cool-toned status colors."
  - "Used explicit red Tailwind classes (bg-red-100/text-red-900 dark:bg-red-900/30 dark:text-red-200) for the failed status in the card rather than the `Badge variant='destructive'` shadcn variant — the card already renders all statuses via the className-on-Badge pattern with variant='outline', so the explicit-color approach keeps the table-row visual rhythm intact."
  - "Dropped the optional 'Or mark queued' convenience button on the scraped branch — Task 1's <action> flagged it as optional, and per D-16 the copy-skill-invocation button is the primary affordance. Adding a second button on the same branch would muddy the user's mental model (the skill itself flips scraped→queued when it claims the lead; the user shouldn't need a manual UI shortcut)."
  - "Did NOT edit job-leads-page.tsx — the page is a plain card list with no status-filter UI. The new queued + failed values are absorbed automatically via the card's statusColors map, exactly what Task 2's <action> says to do in this case."
  - "Searching status remains amber in the card (unchanged from baseline). It now visually overlaps with queued, but the label text ('queued for connection scrape' vs 'searching') disambiguates. Plan acceptance criteria explicitly says 'Other 8 statuses: preserve existing rendering exactly' — touching the searching color would violate that. The detail page's queued+searching branches both render Badge variant='secondary' for consistency."
  - "handleRetry POSTs to /api/job-leads/<id>/search (Wave 2's thin status-flip route), NOT PATCH /status — this is the canonical retry entrypoint per Plan 04's state-machine design: both scraped→queued and failed→queued go through the same /search route, which delegates the transition gate to canJobLeadTransition."
  - "On retry success, the response envelope is checked via json.success rather than res.ok — robust against routes that return 200 with success:false bodies (none currently do, but the pattern aligns with the broader codebase's API contract)."

patterns-established:
  - "Status-driven render branch pattern for entity-detail pages: each state in the domain enum gets its own {entity.status === 'X' && (...)} block; the component is essentially a state-machine view. Avoids useEffect polling components and lets the next agent extend by adding one more branch."
  - "Clipboard copy via navigator.clipboard.writeText wrapped in try/catch with sonner toast — gracefully degrades when the browser blocks clipboard access (e.g., non-https origins, iframes)."

requirements-completed: [JL-B5]

# Metrics
duration: ~3min (commit-to-commit, including tsc + test verification)
completed: 2026-05-14
---

# Phase 05 Plan 05: UI rewrite — queued/failed affordances Summary

**Replaced the in-app Find Connections workflow on the lead detail page with a copy-skill-invocation button and a categorized failure banner with retry, and surfaced the new queued + failed statuses in the list card. The detail page is now the user's launchpad for the Claude Code scraping skill.**

## Performance

- **Duration:** ~3 min (e45548f → e4ee474, 2 commits, ~50 LOC delta)
- **Tasks:** 2 (1 commit each)
- **Test results:** **129/129 passing** project-wide (no regression from baseline)
- **TypeScript:** Only pre-existing prioritization.ts (4) + scrape-connections.ts (3) errors — no new errors

## Accomplishments

- **`job-lead-detail.tsx` rewritten** (97 → 156 lines):
  - Imports: removed `IconSearch` + `SearchProgress`; added `IconCopy`, `IconRefresh`, `Badge`, `toast`
  - State: removed `isSearching` + `handleSearchComplete`; added `handleCopyInvocation` + `handleRetry`
  - 4 new render branches: scraped (copy button + helper text), queued (badge + copy button + helper text), searching (passive badge, no polling per D-17), failed (categorized banner with destructive-toned wrapper + Retry button)
  - 3 preserved branches: found, ready/actioned, found+untriagedCount===0 — all rendered verbatim from the previous version
- **`job-lead-card.tsx` extended** statusColors map:
  - `queued`: amber (`bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200`)
  - `failed`: red (`bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-200`)
  - Other 8 entries preserved verbatim
- **`job-leads-page.tsx` untouched** — the page has no status-filter UI, so Plan 01's enum-array update propagates automatically through the card's status renderer.

## Task Commits

Branch: `worktree-agent-a425c2664988daa1c`

1. **Task 1 — replace Find Connections with copy-skill-invocation + failure banner** — `e45548f` (feat)
2. **Task 2 — render queued + failed statuses in card** — `e4ee474` (feat)

## Files Modified

| Path | Lines changed | Description |
|------|---------------|-------------|
| `src/features/job-leads/components/job-lead-detail.tsx` | +94 / -36 | Rewrote imports + state + render branches; removed SearchProgress consumption |
| `src/features/job-leads/components/job-lead-card.tsx` | +3 / -1 | Added queued (amber) and failed (red) entries to statusColors |

## Plan Output Spec — Per-Bullet Confirmation

Per `<output>` section of the plan:

1. **Confirmation that `handleCopyInvocation` copies the canonical command string:** ✅ Confirmed — the callback body contains `await navigator.clipboard.writeText(\`claude /scrape-linkedin-connections ${lead.id}\`)` (verified by `grep -c "claude /scrape-linkedin-connections" src/features/job-leads/components/job-lead-detail.tsx` = 1).
2. **Whether the optional "Or mark queued" convenience button was kept or dropped:** Dropped — see key-decisions §3. The copy-skill-invocation button is the sole affordance on the scraped branch per D-16.
3. **Whether `job-leads-page.tsx` needed editing or if the filter was already derived from `jobLeadStatusValues`:** Not edited — the page has no status-filter UI at all (it's a flat card list). The card itself absorbs the new statuses via its statusColors map.
4. **One sentence on visual treatment chosen for queued and failed in the card:** Amber Tailwind classes for queued (matching CONTEXT.md `<specifics>` verbatim) and red Tailwind classes for failed (destructive-toned to match the detail-page failure banner).

## Verification Grep Checks

| Check | Required | Actual | Result |
|-------|----------|--------|--------|
| `grep -c "SearchProgress" src/features/job-leads/components/job-lead-detail.tsx` | 0 | 0 | ✅ |
| `grep -c "Find Connections" src/features/job-leads/components/job-lead-detail.tsx` | 0 | 0 | ✅ |
| `grep -c "IconSearch" src/features/job-leads/components/job-lead-detail.tsx` | 0 | 0 | ✅ |
| `grep -c "handleFindConnections" src/features/job-leads/components/job-lead-detail.tsx` | 0 | 0 | ✅ |
| `grep -c "isSearching" src/features/job-leads/components/job-lead-detail.tsx` | 0 | 0 | ✅ |
| `grep -c "handleCopyInvocation" src/features/job-leads/components/job-lead-detail.tsx` | ≥ 1 | 3 | ✅ |
| `grep -c "handleRetry" src/features/job-leads/components/job-lead-detail.tsx` | ≥ 1 | 2 | ✅ |
| `grep -c "claude /scrape-linkedin-connections" src/features/job-leads/components/job-lead-detail.tsx` | ≥ 1 | 1 | ✅ |
| `grep -c "writeText" src/features/job-leads/components/job-lead-detail.tsx` | ≥ 1 | 1 | ✅ |
| `grep -c "bg-destructive/10" src/features/job-leads/components/job-lead-detail.tsx` | ≥ 1 | 1 | ✅ |
| `grep -c "IconCopy" src/features/job-leads/components/job-lead-detail.tsx` | ≥ 1 | 3 | ✅ |
| `grep -c "IconRefresh" src/features/job-leads/components/job-lead-detail.tsx` | ≥ 1 | 2 | ✅ |
| `grep -c "from '@/components/ui/badge'" src/features/job-leads/components/job-lead-detail.tsx` | ≥ 1 | 1 | ✅ |
| `grep -c "from 'sonner'" src/features/job-leads/components/job-lead-detail.tsx` | ≥ 1 | 1 | ✅ |
| `grep -cE "queued\|failed" src/features/job-leads/components/job-lead-card.tsx` | ≥ 1 | 2 | ✅ |
| `grep -n "fetch" src/features/job-leads/components/job-lead-detail.tsx` posts to `/api/job-leads/${lead.id}/search` | yes | yes (line 43) | ✅ |

## Render Branch Coverage Table

| `lead.status` | Render content | Source of truth |
|---------------|----------------|-----------------|
| `pending` | ScrapeResults only (back-link + scraped data block at top) | preserved from previous version |
| `scraping` | ScrapeResults only | preserved |
| `scraped` | Copy skill invocation button + helper text | NEW (D-16) |
| `queued` | "queued for connection scrape" badge + Copy skill invocation button + helper text | NEW (D-16) |
| `searching` | "scrape in progress" badge + "Skill is running. Refresh the page to see the result." | NEW (D-17 — no polling) |
| `found` | TriageTrigger (and RecommendationList if untriagedCount === 0) | preserved |
| `ready` | RecommendationList | preserved |
| `actioned` | RecommendationList | preserved |
| `archived` | ScrapeResults only | preserved (no explicit branch — falls through) |
| `failed` | Categorized failure banner (bg-destructive/10 border-destructive/30) + Retry button | NEW (D-18) |

## TypeScript Status

`npx tsc --noEmit` shows only the pre-existing errors documented in Plan 04's SUMMARY:
- `src/features/job-leads/lib/prioritization.ts` lines 70–72 (downlevelIteration, implicit any) — scheduled for cleanup in `.planning/phases/04-starter-template-cleanup/deferred-items.md`
- `src/features/job-leads/lib/scrape-connections.ts` lines 56, 93, 187 — scheduled for deletion in Plan 05-07

No new TypeScript errors introduced by Plan 05-05.

## Test Suite Status

`npm run test:run` exit 0 with **129/129 tests passing across 16 files**. No new tests added — the changes are pure UI components with no test infrastructure for client React (the project has no jsdom/RTL setup wired up); regression coverage relies on the existing API-layer tests + the project-wide tsc + the manual verification grep table above.

## Decisions Made

1. **Dropped the optional "Or mark queued" convenience button on scraped.** Plan flagged it as optional and D-16 names the copy button as the primary affordance. Adding a second button on the same branch would duplicate state-machine entry points (the skill flips scraped→queued automatically when it claims the lead via PATCH /status; the user shouldn't need a manual UI shortcut for that).
2. **Used explicit Tailwind classes for queued + failed in the card** rather than `Badge variant='secondary'` / `Badge variant='destructive'`. The card already renders all statuses via the className-on-Badge pattern with `variant='outline'`; mixing variants would break the table-row visual rhythm. Both new entries follow the same shape as the 8 existing entries.
3. **Searching color unchanged** — both queued and searching are amber-toned. Plan acceptance criteria says "Other 8 statuses: preserve existing rendering exactly," so this is intentional. The badge label text disambiguates ("queued for connection scrape" vs "searching"). On the detail page, both render `Badge variant='secondary'` for visual consistency.
4. **Did NOT edit job-leads-page.tsx.** Task 2's `<action>` explicitly says: "If the existing filter is built from `jobLeadStatusValues` already, no change is needed — Plan 01's enum update propagates automatically. Verify by reading the file before editing; if no change is needed, document that in the SUMMARY and skip the edit." The page is a plain card list with no filter UI at all, so this matches the skip path.
5. **handleRetry POSTs to /search, not PATCH /status.** This is the canonical retry route per Plan 04's design: `/search` is now the thin state-machine flip for both scraped→queued and failed→queued (it delegates to `canJobLeadTransition`). Using PATCH /status would have worked but would have spread the retry logic across two routes.
6. **Optimistic local state update on retry.** After a successful POST, the component does `setLead((prev) => ({...prev, status: 'queued', lastError: null, lastErrorAt: null}))` — the user sees the queued badge instantly without a page reload. If the user wants to re-issue the skill invocation, the queued branch renders the copy button.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Symlinked `node_modules` from main repo into worktree**

- **Found during:** Pre-Task-1 environment check
- **Issue:** Worktree spawned without `node_modules`. `npx tsc --noEmit` and `npm run test:run` would fail without it.
- **Fix:** `ln -s /Users/sbronstein/Github/heimdall/node_modules /Users/sbronstein/Github/heimdall/.claude/worktrees/agent-a425c2664988daa1c/node_modules`. Verified `node_modules/` is gitignored.

**Total deviations:** 1 (environment-only). No code-level deviations. All plan acceptance criteria satisfied.

## Issues Encountered

- **Color overlap between queued and searching in the card.** Both end up amber-toned per CONTEXT.md `<specifics>`. The badge label disambiguates, and the plan's acceptance criteria forbids changing searching's color. Acceptable; documented under decisions §3.
- **Pre-commit husky hook not executable.** Warning emitted on every commit (`hint: The '/Users/sbronstein/Github/heimdall/.husky/pre-commit' hook was ignored because it's not set as executable.`). Not a blocker — commits succeed and the project's lint-staged config is unchanged. Documented for visibility; outside scope to fix.

## Threat Model Verification

| Threat ID | Disposition | Mitigation Verified |
|-----------|-------------|---------------------|
| T-05-05-01 | mitigate (lastError XSS in UI) | ✅ React JSX text content auto-escapes; no `dangerouslySetInnerHTML` anywhere in `job-lead-detail.tsx`; `lead.lastError` is rendered via `{lead.lastError?.split(':')[0]}` and `{lead.lastError?.split(':').slice(1).join(':').trim()}` — pure string operations, never converted to HTML. Plan 04's API layer caps `lastError` at 220 chars upstream. |
| T-05-05-02 | accept (clipboard sniffing) | ✅ Single-user app; clipboard payload is a benign command string (`claude /scrape-linkedin-connections <uuid>`); no secrets/tokens written. |
| T-05-05-03 | mitigate (forged retry POST) | ✅ Browser path goes through Clerk middleware (Phase 3 single-user lock on steve@bronstein.org). CLI path uses the bearer-token bypass added in Plan 05-02. Both gates are enforced before the route handler runs. |
| T-05-05-04 | accept (tight-loop retry DoS) | ✅ User click rate is the natural throttle; the underlying API is sub-100ms per Plan 04's measurement. Explicit "disable during pending" YAGNI for single-user. |

## Threat Flags

None — no new trust boundaries or attack surface introduced. The component reads from props (server-vouched via the RSC page query) and writes to the existing `/api/job-leads/[id]/search` endpoint (Plan 04 contract, Zod-validated, state-machine-gated).

## User Setup Required

None. The page renders immediately on the next `/dashboard/job-leads/<id>` request. To exercise the copy-invocation flow:

1. Visit `/dashboard/job-leads/<id>` for a lead in `scraped` or `queued` status.
2. Click "Copy skill invocation."
3. Paste in Claude Code (this directory) — runs `claude /scrape-linkedin-connections <id>` (skill ships in Plan 05-06).

To exercise the retry flow:

1. Visit a lead in `failed` status (the skill will write this state via PATCH /status on its first failure — Plan 05-06).
2. Read the category + detail from the destructive-toned banner.
3. Click "Retry" — the local state flips to `queued`, ready for another skill run.

## Next Phase Readiness

- **Plan 05-06 (Claude Code skill):** Unblocked. The skill needs only the lead UUID (which the user pastes from the Copy button) + the Plan 04 API contract. The detail page surfaces every state the skill produces (queued / searching / failed / found).
- **Plan 05-07 (scrape-connections.ts + search-progress.tsx deletion):** Pre-requisite verified — `grep -r "SearchProgress" src/features/job-leads/components/` returns only the file itself; the detail page no longer imports it.

## Self-Check

Verified before commit:
- `src/features/job-leads/components/job-lead-detail.tsx` modified (FOUND, line 1–156)
- `src/features/job-leads/components/job-lead-card.tsx` modified (FOUND)
- Commit `e45548f` (Task 1) — FOUND in `git log --oneline`
- Commit `e4ee474` (Task 2) — FOUND in `git log --oneline`
- `npm run test:run` exit 0 with 129/129 passing — VERIFIED
- `npx tsc --noEmit` shows only pre-existing prioritization + scrape-connections errors — VERIFIED
- All 16 grep checks in the verification table PASS — VERIFIED
- `job-leads-page.tsx` unchanged (`git diff --name-only HEAD~2 HEAD` returns only detail + card files) — VERIFIED

## Self-Check: PASSED

---
*Phase: 05-job-leads-completion*
*Plan: 05*
*Completed: 2026-05-14*
