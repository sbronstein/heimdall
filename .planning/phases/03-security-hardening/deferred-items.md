# Phase 3 - Deferred Items

Pre-existing issues discovered during execution that are out of scope for current plans.

## Pre-existing TS build failure in `src/features/job-leads/lib/prioritization.ts:70`

Discovered during plan 03-02 execution.

`for (const rec of byContact.values())` triggers `Type 'MapIterator<PrioritizedRecommendation>' can only be iterated through when using the '--downlevelIteration' flag or with a '--target' of 'es2015' or higher.`

Pre-existing — verified by stashing all 03-02 changes and running `npm run build` against the baseline: the same error reproduces. Root cause is `tsconfig.json` `target: "es5"` combined with `downlevelIteration` not being set; Drizzle-style `Map.values()` iteration fails strict TS gates.

**Not fixed under 03-02** (out of scope — pre-existing, not introduced by these edits). Recommend filing as a Phase 4 cleanup task (raise tsconfig target to ES2020 or enable `downlevelIteration`).

