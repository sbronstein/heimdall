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

## Pre-existing test timeouts in `src/app/api/job-leads/[id]/prospects/route.test.ts`

Discovered during Plan 07-01 overall verification (step 1 — `npx vitest run`). Confirmed pre-existing by checking out the source files at `6ee48f0` (last commit before Phase 7) and re-running the same test file; the same 5 tests time out at 60s in both states.

| Test | Line | Failure mode |
|------|------|--------------|
| Test 1: POST 5 prospects flips status to found, bulk-inserts, emits `job_lead_search_complete` | 58 | timeout at 60000 ms |
| Test 1b: profileSnippet round-trip — each row persists the input snippet (including null) | 132 | timeout at 60000 ms |
| Test 6: bulk insert uses single statement (regression — row count matches input length) | 445 | timeout at 60000 ms |
| Test 7: inline matchConnections inserts bridges for matched mutual connections (D-01, D-04) | 295 | timeout at 60000 ms |
| Test 9: second call to same lead returns 400 (status check rejects), DB state unchanged | 394 | timeout at 60000 ms |

5 of 10 tests in the file fail (Tests 2, 3, 4, 5, 8 still pass). Root cause is not the Phase 7 schema change — every failing test uses a fixture with `linkedinJobUrl: 'https://...'` (non-null), so the dropped NOT NULL constraint cannot affect them. Likely a PGlite-batch-shim regression introduced by a prior phase (last modified by Phase 6-02 commit `c736282`). Best diagnosed via `--testTimeout=300000` to surface the underlying error rather than the timeout symptom.

**This blocks the Plan 07-01 "full vitest suite exits 0" verification step.** Recommend either:
1. Fix the pre-existing prospects test timeouts before merging Plan 07-01 (separate, focused bug fix), OR
2. Acknowledge the pre-existing failure in the Plan 07-01 SUMMARY and proceed to Plan 07-02 — the Phase 7 schema work itself is verified correct (new `__phase7_schema__.test.ts` passes, live DB confirmed nullable, single-ALTER migration validated).
