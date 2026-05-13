# Phase 4 — Deferred Items

Pre-existing issues discovered during execution but explicitly out of scope per the SCOPE BOUNDARY rule in `execute-plan.md` ("Only auto-fix issues DIRECTLY caused by the current task's changes").

## Pre-Existing `npm run build` TypeScript Failure (not caused by DEBT-A1)

**Discovered during:** Plan 04-01 execution (Task 1 verification)

**Error:**

```
./src/features/job-leads/lib/prioritization.ts:70:21
Type error: Type 'MapIterator<PrioritizedRecommendation>' can only be iterated through
when using the '--downlevelIteration' flag or with a '--target' of 'es2015' or higher.

  68 |
  69 |   // Overall contact score = max of their bridge scores
> 70 |   for (const rec of byContact.values()) {
     |                     ^
  71 |     rec.score = Math.max(...rec.prospects.map((p) => p.bridgeScore));
```

**Verification it is pre-existing:** Stashed all Plan 04-01 deletions, ran `npm run build` against clean `HEAD` (commit `b592d28 docs(04): create phase plan`) — same error reproduces. The error is in `src/features/job-leads/lib/prioritization.ts` which was last touched by commit `8562eba Add job leads feature: LinkedIn URL → prioritized intro recommendations` and is fully unrelated to the products feature being deleted.

**Root cause:** `tsconfig.json` `"target": "es5"` (project default) does not permit `Map.values()` iteration without `--downlevelIteration`. The file uses `for (const rec of byContact.values())` which requires either `target: es2015+` or `downlevelIteration: true`. This is a tsconfig-level setting that was never updated when the feature shipped.

**Why deferred:** Per SCOPE BOUNDARY rule, this is out of scope for DEBT-A1 (products feature deletion). The plan-level `npm run build exits 0` success criterion was written under the assumption that `main` builds clean; it does not. Fixing this requires editing either `tsconfig.json` (`target`/`downlevelIteration`) or `src/features/job-leads/lib/prioritization.ts` (rewrite to `Array.from(byContact.values())`), neither of which is part of any DEBT-Ax requirement.

**Impact on Plan 04-01 verification:** The plan's "npm run build exits 0" task-verification line cannot pass on top of a `main` branch that already fails. The deletion verification (no orphan imports of `@/features/products`, `@/constants/mock-api`, `Product`/`SaleUser`/`recentSalesData`) was performed via `grep` and passes cleanly. Build output confirms the only failure is the unrelated pre-existing `prioritization.ts` error — there are no new errors caused by the deletions.

**Recommended follow-up:**
- Add a new DEBT entry (DEBT-A6 or BUILD-A1) in a follow-on phase to either:
  - Bump `tsconfig.json` `target` from `es5` to `es2015` (or `es2020`), OR
  - Set `"downlevelIteration": true` in `tsconfig.json`, OR
  - Refactor `src/features/job-leads/lib/prioritization.ts` to use `Array.from(byContact.values())`.
- Phase 4's other plans (04-02..04-05) will hit the same pre-existing failure on their own build verifications. Either fix it as a sixth tiny plan early in Phase 4 or accept the same scope-out treatment across the phase.

## Pre-Existing Dirty Working Tree (orchestrator note)

The orchestrator prompt stated "the working tree is clean — pre-existing Phase 5 WIP has been stashed", but at executor startup `git status` showed:

- `M .planning/config.json`
- `M .planning/STATE.md`
- `?? .claude/`

None of these overlap with DEBT-A1's `files_modified` set, so they did not affect this plan's execution. Left untouched.
