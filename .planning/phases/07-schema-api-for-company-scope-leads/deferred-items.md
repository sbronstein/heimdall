# Phase 7 Deferred Items

Items discovered during execution but out of scope for the current plan.

## Pre-existing TypeScript errors in `src/features/job-leads/lib/prioritization.ts`

Discovered during Plan 07-01 `npx tsc --noEmit` verification. Confirmed pre-existing (not introduced by Phase 7 schema change) via `git stash` reproduction against `main` HEAD `6ee48f0`.

| File | Line | Error |
|------|------|-------|
| `src/features/job-leads/lib/prioritization.ts` | 70 | TS2802: `MapIterator<PrioritizedRecommendation>` requires `--downlevelIteration` or `--target` es2015+ |
| `src/features/job-leads/lib/prioritization.ts` | 71 | TS7006: Parameter `p` implicitly has an `any` type |
| `src/features/job-leads/lib/prioritization.ts` | 72 | TS7006: Parameter `a` implicitly has an `any` type |
| `src/features/job-leads/lib/prioritization.ts` | 72 | TS7006: Parameter `b` implicitly has an `any` type |

These are independent of the Phase 7 schema change. They affect a code path (`prioritization.ts`) that this plan does not modify. `npm run build` and the Vitest suite still pass; only `npx tsc --noEmit` reports them. Best fixed in a dedicated typing pass or as part of a future Job Leads cleanup.
