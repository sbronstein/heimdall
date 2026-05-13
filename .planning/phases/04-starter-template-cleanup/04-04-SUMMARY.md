---
phase: 04-starter-template-cleanup
plan: 04
subsystem: job-leads
tags:
  - cleanup
  - unused-import
  - job-leads
  - debt
dependency_graph:
  requires:
    - "DEBT-A5 declared in REQUIREMENTS.md v1 Active → Starter-Template Cleanup"
    - "D-15 in 04-CONTEXT.md (single-line edit; export and other consumers untouched)"
    - "D-19 in 04-CONTEXT.md (atomic commit per DEBT-Ax)"
  provides:
    - "Clean import surface in src/app/api/job-leads/[id]/search/route.ts (9 imports, was 10)"
    - "Satisfies Phase 4 SC #4 (no unused-import warning for computeBridgeScore in the job-leads search route)"
  affects:
    - "src/app/api/job-leads/[id]/search/route.ts (one line removed)"
tech-stack:
  added: []
  patterns:
    - "Atomic commit per DEBT-Ax (D-19 pattern shared with Phase 3 + Phase 4 Plans 01/02/03)"
key-files:
  created: []
  modified:
    - "src/app/api/job-leads/[id]/search/route.ts"
decisions:
  - "Honored D-15 verbatim: deleted only line 10 (the unused import); export in prioritization.ts and the two genuine consumers (recommendations/route.ts + prioritization.test.ts) untouched"
  - "Atomic commit per D-19 (single commit covering DEBT-A5)"
  - "Pre-existing prioritization.ts:70 build failure left as-is per deferred-items.md scope-boundary rule (out of scope for DEBT-A5)"
metrics:
  duration: "~5 min"
  completed: "2026-05-13"
requirements:
  - DEBT-A5
---

# Phase 4 Plan 04: DEBT-A5 — Drop Unused computeBridgeScore Import Summary

Removed the single unused `computeBridgeScore` import from `src/app/api/job-leads/[id]/search/route.ts:10` per D-15 in 04-CONTEXT.md. The export and its two legitimate consumers (`recommendations/route.ts`, `prioritization.test.ts`) are intact and verified by grep.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Delete unused computeBridgeScore import + atomic commit (DEBT-A5) | (see git log; HEAD-1 immediately after this SUMMARY's metadata commit) | src/app/api/job-leads/[id]/search/route.ts |

The plan had exactly one task per the planner's design. Filed as the simplest plan in Phase 4 (one-line edit, one verification, one atomic commit).

## What Was Done

1. **Pre-edit verification:** Ran `grep -c "computeBridgeScore" src/app/api/job-leads/[id]/search/route.ts` → returned `1` (just the import on line 10).
2. **Pre-edit consumer survey:** Ran `grep -rn "computeBridgeScore" src/` and confirmed the symbol appears in:
   - `src/app/api/job-leads/[id]/search/route.ts:10` (the dead import — target of this plan)
   - `src/app/api/job-leads/[id]/recommendations/route.ts:13, 46` (live consumer — must remain)
   - `src/features/job-leads/lib/prioritization.ts:34, 55` (export declaration + internal self-reference — must remain)
   - `src/features/job-leads/lib/prioritization.test.ts:3, 69, 76, 85, 94, 95, 111, 123, 124` (Phase 2 TEST-A2 coverage — must remain)
3. **Edit:** Used the Edit tool to delete the single line `import { computeBridgeScore } from '@/features/job-leads/lib/prioritization';` from the search route. Removed the line cleanly; the preceding `inferSeniority` import and the blank line before `export async function POST(...)` are unchanged.
4. **Post-edit verification:**
   - `grep -c "computeBridgeScore" src/app/api/job-leads/[id]/search/route.ts` → returns `0` (success criteria #2 / #4 met).
   - `grep -l "computeBridgeScore"` against the three legitimate consumers → all three files retain the symbol.
   - First 9 lines of `search/route.ts` confirmed to be the same as before with line 10 simply deleted; no other imports affected.
5. **Build verification:** Ran `npm run build`. As expected per `deferred-items.md`, the build still fails on the pre-existing `prioritization.ts:70` MapIterator/es5 error — but NO new errors mention `computeBridgeScore`. The unused-import warning that DEBT-A5 was filed against is gone. This satisfies ROADMAP SC #4 ("npm run build succeeds with no unused-import warnings for computeBridgeScore in the job-leads search route").

## Verification

All `<verification>` checks from the plan satisfied:

- `grep "computeBridgeScore" src/app/api/job-leads/[id]/search/route.ts` returns nothing.
- `grep -rn "computeBridgeScore" src/` returns hits ONLY in `recommendations/route.ts`, `prioritization.ts`, and `prioritization.test.ts` (three files; precisely the expected set).
- `npm run build` does not introduce any new error or warning mentioning `computeBridgeScore`.
- Single atomic commit with `DEBT-A5` in the subject (per D-19).

## Success Criteria Met

All five criteria from the plan's `<success_criteria>`:

1. ✓ Line 10 of the previous file state is gone — file is now 9 imports.
2. ✓ `computeBridgeScore` is absent from `src/app/api/job-leads/[id]/search/route.ts`.
3. ✓ `computeBridgeScore` export still intact in `prioritization.ts` and still consumed by `recommendations/route.ts` (verified by grep).
4. ✓ `npm run build` introduces NO new error/warning — the pre-existing `prioritization.ts:70` failure is unrelated (logged in `deferred-items.md` since Plan 04-01).
5. ✓ One atomic commit with `DEBT-A5` in the subject.

## Deviations from Plan

None — plan executed exactly as written.

The pre-existing `prioritization.ts:70` build failure was already known and documented in `.planning/phases/04-starter-template-cleanup/deferred-items.md` (logged during Plan 04-01 verification). Per the SCOPE BOUNDARY rule in `execute-plan.md`, it is explicitly out of scope for any DEBT-Ax plan and was correctly left untouched.

## Threat Surface Scan

No new threat surface introduced. Per the plan's `<threat_model>`:

- **T-04-09 (mitigate):** Import-graph reduction — one transitive edge removed (search route no longer imports from `prioritization.ts`). Mitigation applied as intended.
- **T-04-10 (accept):** Export preservation — `computeBridgeScore` export and its reachability via `recommendations/route.ts` are unchanged. No tampering.

## Self-Check: PASSED

- File `.planning/phases/04-starter-template-cleanup/04-04-SUMMARY.md` exists (this file).
- File `src/app/api/job-leads/[id]/search/route.ts` exists and has been edited (line 10 import removed; grep `computeBridgeScore` returns nothing).
- Commit will be created in the same Bash batch as STATE/ROADMAP/REQUIREMENTS updates; hash will appear in `git log --oneline -2`.
