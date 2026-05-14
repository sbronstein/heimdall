---
phase: 05-job-leads-completion
plan: 07
subsystem: cleanup

tags: [deletion, cleanup, regression-test, vitest, job-leads, playwright]

# Dependency graph
requires:
  - phase: 05-job-leads-completion
    plan: 01
    provides: ScrapedProspect type relocated to src/features/job-leads/lib/types.ts; match-connections.ts imports from there
  - phase: 05-job-leads-completion
    plan: 04
    provides: POST /api/job-leads/[id]/search rewritten as thin status flip — no scrapeConnections import; existing search/route.test.ts Test 11 already asserts the import is absent
  - phase: 05-job-leads-completion
    plan: 05
    provides: src/features/job-leads/components/job-lead-detail.tsx no longer imports SearchProgress
provides:
  - Two source files physically removed from the repo (scrape-connections.ts, search-progress.tsx)
  - src/__cleanup__.test.ts extended with a Phase 5 deletion block (phase5DeletedPaths array + 4 it cases) — durable regression lock against accidental re-introduction
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Append-only extension of src/__cleanup__.test.ts mirroring the Phase 4 D-16 block — new const array + new describe block, reusing the existing top-level imports (existsSync, readFileSync, resolve from node:fs and node:path)"
    - "Forward-guarded grep verification pattern: pre-delete safety greps filter out the cleanup test via `grep -v __cleanup__.test.ts` so Task 2's regression-lock additions don't register as surviving consumers"

key-files:
  created: []
  modified:
    - src/__cleanup__.test.ts
  deleted:
    - src/features/job-leads/lib/scrape-connections.ts
    - src/features/job-leads/components/search-progress.tsx

key-decisions:
  - "Used `git rm` (not bare `rm`) for atomic stage+remove — keeps the working tree and the index in sync in one step, avoids a separate `git add -u` round-trip"
  - "Committed deletions and the cleanup-test extension as TWO atomic commits (not bundled) so the deletion commit is reviewable in isolation and the cleanup-test commit can be reverted independently if a future plan needs to temporarily reintroduce a stub"
  - "CD-04 disposition: kept playwright in `package.json` dependencies. linkedin-browser.ts remains (no consumer in production source, but kept per D-14 for future Stagehand spike reuse). scrape-job-page.ts uses cheerio + fetch, NOT playwright — confirmed via grep. Moving playwright to devDependencies is the dependency-hygiene follow-up the plan recommended deferring."
  - "Did NOT migrate the existing `search/route.test.ts` Test 11 string reference to `scrapeConnections` — that test is itself a regression-lock assertion (`.not.toMatch(/scrapeConnections/)`) verifying the production route file does NOT import the symbol. Removing the test would lose regression coverage. The reference is intentional, defensive, and parallel in spirit to the cleanup-test additions."

patterns-established:
  - "src/__cleanup__.test.ts is the canonical lockdown surface for any phase that intentionally deletes files. Future phases should follow the same pattern: new const array, new describe block, reuse the top-level imports, append-only."

requirements-completed: [JL-B3]

# Metrics
duration: ~10min (commit-to-commit, including pre-delete safety greps + full test suite run)
completed: 2026-05-14
---

# Phase 05 Plan 07: Delete in-app scraper + regression lock Summary

**Deleted the two brittle in-app LinkedIn scraping files that the Claude Code skill replaced (Plan 06) — the 360-line `scrape-connections.ts` with its hardcoded `'point'`, 20+ debug `console.log` dumps, `waitForTimeout` antipatterns, and "leave browser open" debug branch, plus the `search-progress.tsx` polling component — and locked the deletions in via 4 new regression assertions in `src/__cleanup__.test.ts`. The cleanup test now fails immediately if either file (or its symbols) returns.**

## Performance

- **Duration:** ~10 min (0c07f1f → 10698ff, 2 task commits + SUMMARY commit)
- **Tasks:** 2
- **Files deleted:** 2 (-397 lines)
- **Files modified:** 1 (+32 lines on src/__cleanup__.test.ts)
- **Net repo delta:** -365 LOC

## Accomplishments

- `src/features/job-leads/lib/scrape-connections.ts` — physically removed from disk. Contained the hardcoded `'point'` bug (line 62 of the deleted file), 20+ debug `console.log` dumps, `waitForTimeout` antipatterns, and the `linkedin-browser.ts` "leave browser open for now (debug mode)" branch.
- `src/features/job-leads/components/search-progress.tsx` — physically removed from disk. Was the polling component for the in-app scrape that no longer exists.
- `src/__cleanup__.test.ts` — gained a new `Phase 5 in-app scraper deletion` describe block with 4 `it` cases:
  - `removes src/features/job-leads/lib/scrape-connections.ts` (filesystem existence)
  - `removes src/features/job-leads/components/search-progress.tsx` (filesystem existence)
  - `removes scrapeConnections import from job-leads search route` (`readFileSync` + `.not.toMatch(/scrapeConnections/)` on the route file)
  - `removes SearchProgress import from job-lead detail` (`readFileSync` + `.not.toMatch(/SearchProgress/)` on the component file)

## Task Commits

Branch: `worktree-agent-a2cf77208bfe5c3c1`

1. **Task 1 — delete the two files (atomic `git rm`)** — `0c07f1f` (feat)
2. **Task 2 — extend `src/__cleanup__.test.ts` with Phase 5 block** — `10698ff` (test)

## Files Affected

### Deleted (Task 1)

| Path | Lines removed |
|------|---------------|
| `src/features/job-leads/lib/scrape-connections.ts` | ~360 |
| `src/features/job-leads/components/search-progress.tsx` | ~37 |

### Modified (Task 2)

| Path | Delta |
|------|-------|
| `src/__cleanup__.test.ts` | +32 / -0 (append-only) |

Parent directories of the deleted files remain present and populated:

```
src/features/job-leads/lib/:
  linkedin-browser.ts
  match-connections.ts
  prioritization.test.ts
  prioritization.ts
  scrape-job-page.ts
  seniority.test.ts
  seniority.ts
  types.ts          # Phase 5-01 — ScrapedProspect lives here now

src/features/job-leads/components/:
  job-lead-card.tsx
  job-lead-detail.tsx
  job-leads-page.tsx
  recommendation-card.tsx
  recommendation-list.tsx
  scrape-results.tsx
  triage-trigger.tsx
  url-input-form.tsx
```

## Pre-Delete Safety Check Result

**First-run all-clean — zero dangling consumers found.** The dependency chain (Plan 01 → 04 → 05 → 07) was designed precisely so this plan does not have to rewrite any consumer code, and that design held. Pre-deletion grep output (run from the worktree root before Task 1 file deletion):

| Check | Pre-delete result |
|-------|--------------------|
| `grep -rn "scrapeConnections" src/` | 3 matches: 2 in `search/route.test.ts` (Test 11 regression assertion `.not.toMatch(/scrapeConnections/)`) + 1 in `scrape-connections.ts` itself (the export). Zero production consumers. |
| `grep -rn "SearchProgress" src/` | 2 matches: both in `search-progress.tsx` itself (the props interface + the export). Zero production consumers. |
| `grep -rnE "from ['\"]\\./scrape-connections\|from ['\"]@/features/job-leads/lib/scrape-connections" src/` | 0 matches. |
| `grep -rn "search-progress" src/` | 0 matches. |

None of these required earlier-plan re-execution. The references to `scrapeConnections` in `search/route.test.ts` Test 11 are themselves a regression-lock assertion (defense-in-depth, same purpose as Task 2's cleanup-test additions); they verify the production route file does NOT import the deleted symbol. Leaving them in place is correct.

## Post-Delete Verification

| Check | Required | Actual | Result |
|-------|----------|--------|--------|
| `test ! -f src/features/job-leads/lib/scrape-connections.ts` | file absent | absent | ✅ |
| `test ! -f src/features/job-leads/components/search-progress.tsx` | file absent | absent | ✅ |
| `grep -rn "scrapeConnections" src/ \| grep -v "__cleanup__.test.ts"` | 0 production matches | only `search/route.test.ts` regression assertions remain | ✅ (test-file regression locks are expected and desirable) |
| `grep -rn "SearchProgress" src/ \| grep -v "__cleanup__.test.ts"` | 0 matches | 0 matches | ✅ |
| `npx tsc --noEmit` | only pre-existing `prioritization.ts` errors | only `prioritization.ts:70-72` (4 errors) | ✅ — the 3 errors that lived in `scrape-connections.ts` are gone with the file |
| `npm run test:run -- src/__cleanup__.test.ts` | passes | **18/18 passing** | ✅ |
| `npm run test:run` (full suite) | passes | **133/133 passing across 16 files** | ✅ |

`npm run test:run -- src/__cleanup__.test.ts` output:

```
Test Files  1 passed (1)
     Tests  18 passed (18)
  Start at  08:35:13
  Duration  177ms
```

The 18 cases = 13 Phase 4 deletedPaths + 1 Phase 4 computeBridgeScore regression + 2 Phase 5 phase5DeletedPaths + 1 Phase 5 scrapeConnections regression + 1 Phase 5 SearchProgress regression.

`npm run test:run` (full suite) output:

```
Test Files  16 passed (16)
     Tests  133 passed (133)
  Duration  13.18s
```

The 133 = 129 baseline (per Plan 04 SUMMARY) + 4 new Phase 5 deletion cases. No existing tests regressed.

## CD-04 Disposition: playwright dependency

Per Task 1 Step 4 of the plan, the planner has discretion on whether to move `playwright` from `dependencies` to `devDependencies`. Analysis:

| Check | Result |
|-------|--------|
| `grep -c "playwright" src/features/job-leads/lib/scrape-job-page.ts` | 0 (cheerio + fetch only) |
| `grep -nE "linkedin-browser" src/features/job-leads/lib/scrape-job-page.ts` | 0 matches |
| Remaining `from 'playwright'` consumers in `src/` | only `src/features/job-leads/lib/linkedin-browser.ts` itself |

`linkedin-browser.ts` remains in the repo per CONTEXT.md D-14 (kept for future Stagehand spike reuse). It has no production consumers now that `scrape-connections.ts` is deleted. Strictly speaking, `playwright` could move to `devDependencies`.

**Decision: kept in `dependencies` as-is.** Per the plan's explicit recommendation in Task 1 Step 4: *"the safer move is to defer the package.json change to a follow-up so this plan stays narrowly focused on deletions."* Dependency hygiene is a separate concern (and the move risks breaking a future plan that wires `linkedin-browser.ts` back into a production route). Logged here for the follow-up plan to pick up.

## Plan Output Spec — Per-Bullet Confirmation

Per `<output>` section of the plan:

1. **Final confirmation that both files are absent (`ls` output of parent dirs):** ✅ Confirmed. `ls src/features/job-leads/lib/` and `ls src/features/job-leads/components/` (output above in "Files Affected") show neither `scrape-connections.ts` nor `search-progress.tsx`; sibling files including `types.ts` (Phase 5-01) and `job-lead-detail.tsx` (Phase 5-05) remain intact.
2. **Output of `npm run test:run -- src/__cleanup__.test.ts`:** ✅ 18/18 passing, 177ms. Full output in "Post-Delete Verification" section above.
3. **Pre-delete grep safety check result — first-run all-clean or dangling reference?** ✅ First-run all-clean. Zero production consumers. No earlier-plan re-execution needed. The dependency chain (Plan 01 → 04 → 05 → 07) functioned as designed.
4. **CD-04 disposition (playwright in dependencies or moved):** ✅ Kept in `dependencies` as-is, per plan recommendation. Detailed analysis in "CD-04 Disposition" section above.

## Decisions Made

1. **Used `git rm` rather than bare `rm` + `git add -u`.** Atomic stage+remove in one step; cleaner working tree state during commit. The output (`rm 'src/features/...'`) makes the deletion explicit in the shell history.
2. **Two commits, not one.** Could have bundled the deletion and the cleanup-test extension as a single atomic change. Chose two commits because: (a) the deletion commit is independently reviewable — a reader can see exactly what was removed without scrolling past test additions; (b) the cleanup-test commit is independently revertable if a future plan needs to temporarily reintroduce a stub for migration purposes.
3. **Append-only edit to `src/__cleanup__.test.ts`.** Did not modify the Phase 4 block at all; did not move imports; did not refactor. The new Phase 5 block sits below the existing Phase 4 block, separated by a blank line and a comment. Matches the plan's `<action>` instruction verbatim.
4. **Kept `search/route.test.ts` Test 11 unchanged.** The existing `.not.toMatch(/scrapeConnections/)` assertion is itself a regression lock — same purpose as Task 2's cleanup-test additions. Defense-in-depth: two test files would now fail if `scrapeConnections` reappeared in `search/route.ts`. Removing Test 11 would have lost that redundancy.
5. **CD-04 deferred.** playwright stays in `dependencies`. See dedicated section above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Symlinked `node_modules` from main repo into worktree**

- **Found during:** Pre-Task-1 environment check (per Plan 05-01, 05-04, 05-05 SUMMARY precedent)
- **Issue:** Worktree spawned without `node_modules`. `npx tsc --noEmit` and `npm run test:run` (which the plan's `<verify>` block requires) would fail without it.
- **Fix:** `ln -s /Users/sbronstein/Github/heimdall/node_modules /Users/sbronstein/Github/heimdall/.claude/worktrees/agent-a2cf77208bfe5c3c1/node_modules`. Verified `node_modules/` is gitignored; symlink does not appear in `git status`.
- **Files modified:** None tracked.
- **Committed in:** N/A (environment-only fix)

**Total deviations:** 1 (environment-only Rule 3). No code-level deviations. All plan acceptance criteria satisfied without scope creep.

## Issues Encountered

- **Pre-existing TypeScript errors in `prioritization.ts`:** lines 70–72 (downlevelIteration + implicit any). Unchanged before/after this plan — confirmed via `npx tsc --noEmit` diff. Logged in `.planning/phases/04-starter-template-cleanup/deferred-items.md` per Plan 04 SUMMARY.
- **Husky pre-commit hook warning:** `hint: The '/Users/sbronstein/Github/heimdall/.husky/pre-commit' hook was ignored because it's not set as executable.` Same hint emitted in Plan 05-04 and 05-05 SUMMARYs. Not a blocker — commits succeed and the project's lint-staged config is unchanged. Out of scope for this plan.

## Threat Model Verification

| Threat ID | Disposition | Mitigation Verified |
|-----------|-------------|---------------------|
| T-05-07-01 | mitigate (re-introduction of deleted file) | ✅ `src/__cleanup__.test.ts` Phase 5 block `it.each(phase5DeletedPaths)('removes %s', ...)` asserts the absence of both files. Failure message names the exact path. Verified by running the suite (18/18 passing). |
| T-05-07-02 | mitigate (consumer file re-imports deleted symbol) | ✅ Two grep-based regression checks on `search/route.ts` (scrapeConnections) and `job-lead-detail.tsx` (SearchProgress). Verified by running the suite. Plus `search/route.test.ts` Test 11 (Plan 04) gives defense-in-depth on the route file. |
| T-05-07-03 | accept (debug logs preserved in git history) | ✅ Per plan: the user wants the in-app failed approach preserved as an audit trail. No PII/secrets in the deleted files (confirmed visually before deletion). Git history retains both files at all commit hashes prior to `0c07f1f`. |
| T-05-07-04 | mitigate (audit trail for deletion) | ✅ Commit `0c07f1f` (Task 1) has a descriptive multi-line message referencing JL-B3 + the specific bugs the deletion fixes. SUMMARY.md (this file) records exact paths and the dependency-chain verification. |

## Threat Flags

None — no new trust boundaries, no new attack surface, no new network endpoints, no new auth paths. The deletion strictly removes code; the regression-lock additions are read-only file existence + content greps in a test file.

## User Setup Required

None. The deletions and test additions take effect immediately on the next `npm run test:run`.

## Next Phase Readiness

- **Phase 5 complete after this plan.** Per `.planning/STATE.md`, Plan 05-07 is the final wave (Wave 4) of Phase 05-job-leads-completion. The phase's requirement coverage:
  - JL-B1 (queued + failed statuses): Plan 05-01 ✓
  - JL-B2 (error column lifecycle): Plan 05-01 + 05-04 ✓
  - JL-B3 (in-app scraper deleted): **Plan 05-07 ✓ (THIS PLAN)**
  - JL-B4 (state-machine + API contract): Plan 05-01 + 05-04 ✓
  - JL-B5 (UI affordances for queued/failed): Plan 05-05 ✓
  - JL-B6 (Claude Code skill): Plan 05-06 ✓
- **Follow-up dependency hygiene (out of scope for Phase 5):** Consider moving `playwright` from `dependencies` to `devDependencies` if no production consumer of `linkedin-browser.ts` is added in a future phase. Logged here for visibility.
- **Follow-up `0006_snapshot.json` reconstruction (out of scope for Phase 5):** Per Plan 05-01 SUMMARY's "Deferred Issues" — the missing snapshot file from Phase 4-era migration 0006 still exists as a latent issue but is self-mitigating going forward.

## Self-Check

Verified before committing this SUMMARY:

- `src/features/job-leads/lib/scrape-connections.ts` does NOT exist on disk — VERIFIED (`test ! -f` exit 0)
- `src/features/job-leads/components/search-progress.tsx` does NOT exist on disk — VERIFIED (`test ! -f` exit 0)
- `src/__cleanup__.test.ts` contains `phase5DeletedPaths` const — VERIFIED (`grep -c` = 2 = declaration + usage)
- `src/__cleanup__.test.ts` contains literal `'src/features/job-leads/lib/scrape-connections.ts'` — VERIFIED (line 43)
- `src/__cleanup__.test.ts` contains literal `'src/features/job-leads/components/search-progress.tsx'` — VERIFIED (line 44)
- `src/__cleanup__.test.ts` contains `describe('Phase 5 in-app scraper deletion', ...)` — VERIFIED
- `src/__cleanup__.test.ts` contains `.not.toMatch(/scrapeConnections/)` — VERIFIED
- `src/__cleanup__.test.ts` contains `.not.toMatch(/SearchProgress/)` — VERIFIED
- Commit `0c07f1f` (Task 1) — FOUND in `git log`
- Commit `10698ff` (Task 2) — FOUND in `git log`
- `npm run test:run` exit 0 with 133/133 passing across 16 files — VERIFIED
- `npm run test:run -- src/__cleanup__.test.ts` exit 0 with 18/18 passing — VERIFIED
- `npx tsc --noEmit` shows only pre-existing prioritization.ts errors — VERIFIED
- Phase 4 deletedPaths array unchanged (13 entries) — VERIFIED (no modification, append-only)
- Phase 4's existing `it('removes unused computeBridgeScore import ...')` remains and passes — VERIFIED

## Self-Check: PASSED

---
*Phase: 05-job-leads-completion*
*Plan: 07*
*Completed: 2026-05-14*
