---
phase: 04-starter-template-cleanup
plan: 01
subsystem: cleanup
tags: [starter-template, deletion, products-feature, tech-debt, mock-data]

requires:
  - phase: 03-security-hardening
    provides: clean phase-base commit + atomic-commit-per-requirement pattern
provides:
  - "src/features/products/ removed (entire directory, 7 files including product-tables/index.tsx and options.tsx not enumerated in plan files_modified)"
  - "src/app/dashboard/product/ removed (route page.tsx + [productId]/page.tsx)"
  - "src/constants/mock-api.ts removed (sole consumers were products components)"
  - "src/constants/data.ts removed entirely (CD-01 path exercised — file became empty after stripping the only three exports Product/SaleUser/recentSalesData)"
  - "src/hooks/use-breadcrumbs.tsx routeMapping no longer references /dashboard/product"
affects: [phase-04-plan-02, phase-04-plan-03, phase-04-plan-04, phase-04-plan-05]

tech-stack:
  added: []
  patterns:
    - "Atomic single-commit per DEBT-Ax requirement (D-19) — Phase 3 inheritance"
    - "Filesystem-existence verification via grep + test -f (D-16) rather than HTTP-level smoke (D-17 ruled out)"
    - "CD-01 exercised: delete data.ts entirely rather than leave empty-exports stub"
    - "Pre-existing main-branch build failures logged to phase-level deferred-items.md instead of being auto-fixed (SCOPE BOUNDARY)"

key-files:
  created:
    - ".planning/phases/04-starter-template-cleanup/deferred-items.md (logs pre-existing prioritization.ts:70 TS error + dirty-tree note)"
    - ".planning/phases/04-starter-template-cleanup/04-01-SUMMARY.md (this file)"
  modified:
    - "src/hooks/use-breadcrumbs.tsx (removed '/dashboard/product' routeMapping entry per D-10)"
  deleted:
    - "src/features/products/components/product-listing.tsx"
    - "src/features/products/components/product-form.tsx"
    - "src/features/products/components/product-view-page.tsx"
    - "src/features/products/components/product-tables/columns.tsx"
    - "src/features/products/components/product-tables/cell-action.tsx"
    - "src/features/products/components/product-tables/index.tsx (not in plan files_modified but part of the directory — see Deviations)"
    - "src/features/products/components/product-tables/options.tsx (not in plan files_modified but part of the directory — see Deviations)"
    - "src/app/dashboard/product/page.tsx"
    - "src/app/dashboard/product/[productId]/page.tsx"
    - "src/constants/mock-api.ts"
    - "src/constants/data.ts (CD-01 path)"

key-decisions:
  - "CD-01 exercised: src/constants/data.ts deleted entirely because Product / SaleUser / recentSalesData were its only three exports, leaving the file empty. Recommended path per CONTEXT.md."
  - "D-19 atomic-commit-per-DEBT honored: all three plan tasks rolled into a single commit `feat(04): DEBT-A1 — delete products feature + dead support files` (0323e90). Plan tasks 1-2-3 are deletion stages with no intermediate semantic checkpoint — atomic commit preserves git log readability and matches Phase 3's pattern."
  - "Pre-existing TS error in src/features/job-leads/lib/prioritization.ts:70 (target=es5 + MapIterator iteration) is OUT OF SCOPE per SCOPE BOUNDARY rule. Reproduced on phase-base commit b592d28 before any 04-01 edits → not caused by DEBT-A1. Logged to deferred-items.md. All other plans in Phase 4 will need the same scope-out treatment OR a phase-prefix fix."
  - "Pre-existing TypeScript COMPILATION (npm run build's `Compiled successfully in 9.9s` line) passes with the deletions applied — no orphan-import errors introduced. The TS error blocks only the post-compile `Running TypeScript` typecheck phase, which fails on unrelated code."
  - "Verification via grep instead of running a Vitest fs.existsSync test — that test is owned by Plan 04-05 (D-16) per the wave structure. Plan 04-01 verifies its own deletion set via inline grep + test -f, leaving the consolidated test for the final wave."

patterns-established:
  - "Pattern: When a CLAUDE.md / plan instruction lists `files_modified`, the executor MUST delete *complete* directories when `git rm -r` is the action — even if some files within the directory are not enumerated (e.g., product-tables/index.tsx and options.tsx). Enumerate the actual delta in the SUMMARY rather than the plan's incomplete list."
  - "Pattern: Pre-existing main-branch build failures get logged to `<phase-dir>/deferred-items.md` with verification steps (stash → build → reproduce on HEAD → pop). Future executors can grep deferred-items.md before re-running verification commands."

requirements-completed: [DEBT-A1]

duration: 5min
completed: 2026-05-13
---

# Phase 4 Plan 01: DEBT-A1 — Products Feature Deletion Summary

**Deleted the Next.js Shadcn starter "products" feature and its transitive dead-support code (mock-api.ts, data.ts, breadcrumb entry) in a single atomic commit, removing 11 files and 705 lines of starter residue with zero impact on the Heimdall feature set.**

## Performance

- **Duration:** ~5 min wall-clock
- **Started:** 2026-05-13T02:26:33Z
- **Completed:** 2026-05-13T02:31:00Z
- **Tasks:** 3 (Task 1 directory deletion, Task 2 dead-support deletion, Task 3 breadcrumbs edit + atomic commit)
- **Files deleted:** 11 (5 products components + 2 product-tables files + 2 route pages + mock-api.ts + data.ts)
- **Files modified:** 1 (src/hooks/use-breadcrumbs.tsx)
- **Files created:** 2 (deferred-items.md, this SUMMARY.md)

## Accomplishments

- **src/features/products/ — entire directory removed.** 7 files (component-listing, product-form, product-view-page, product-tables/columns, product-tables/cell-action, product-tables/index, product-tables/options). The plan's `files_modified` listed only 5 of these; the additional two (`product-tables/index.tsx`, `product-tables/options.tsx`) were swept up by `git rm -r src/features/products/` per D-07. Documented as Deviation #1.
- **src/app/dashboard/product/ — route directory removed.** Both `page.tsx` and `[productId]/page.tsx`.
- **src/constants/mock-api.ts — file removed** (sole consumers were the three products components confirmed dead by D-08).
- **src/constants/data.ts — file removed (CD-01 path exercised).** The file contained only `Product` type, `SaleUser` interface, and `recentSalesData` const — all three products-only. After stripping, file would have been empty; per CD-01 recommendation, the file itself was deleted rather than left as an empty stub.
- **src/hooks/use-breadcrumbs.tsx — `/dashboard/product` routeMapping entry removed** (D-10). The `/dashboard/employee` entry left intact (deferred per CONTEXT.md — also starter residue but not in DEBT-A1 scope).
- **Zero orphan imports remain in `src/`** — verified via `grep -rn` against `@/features/products`, `@/constants/mock-api`, `@/constants/data`, `SaleUser|recentSalesData`, and `'/dashboard/product'`. All five greps return zero hits.

## Task Commits

1. **Task 1 (delete products feature + route directories)** — staged but not committed independently; rolled into the atomic DEBT-A1 commit per D-19.
2. **Task 2 (delete mock-api.ts + data.ts)** — staged but not committed independently; rolled into the atomic DEBT-A1 commit per D-19.
3. **Task 3 (breadcrumbs edit + atomic commit)** — `0323e90` (feat). One commit covers all three tasks: `feat(04): DEBT-A1 — delete products feature + dead support files`. `git log -1 --oneline` shows it; `grep -q "DEBT-A1"` passes.

## Files Created/Modified

- **Deleted** `src/features/products/components/product-listing.tsx`, `product-form.tsx`, `product-view-page.tsx`, `product-tables/columns.tsx`, `product-tables/cell-action.tsx`, `product-tables/index.tsx`, `product-tables/options.tsx` — entire feature directory.
- **Deleted** `src/app/dashboard/product/page.tsx`, `[productId]/page.tsx` — entire route directory.
- **Deleted** `src/constants/mock-api.ts` (D-08) and `src/constants/data.ts` (D-09 + CD-01).
- **Modified** `src/hooks/use-breadcrumbs.tsx` — removed 4-line key-value pair for `/dashboard/product` from `routeMapping`. File still parses cleanly (TS strict mode); the `/dashboard/employee` entry above it is unchanged.
- **Created** `.planning/phases/04-starter-template-cleanup/deferred-items.md` — logs the pre-existing `src/features/job-leads/lib/prioritization.ts:70` TS error encountered during Task 1 verification (out of scope per SCOPE BOUNDARY rule).

## Verification

| Check | Method | Result |
|-------|--------|--------|
| `src/features/products/` does not exist | `test ! -d src/features/products` | PASS |
| `src/app/dashboard/product/` does not exist | `test ! -d src/app/dashboard/product` | PASS |
| `src/constants/mock-api.ts` does not exist | `test ! -f src/constants/mock-api.ts` | PASS |
| `src/constants/data.ts` does not exist (CD-01) | `test ! -f src/constants/data.ts` | PASS |
| Zero `@/features/products` imports in `src/` | `grep -rn "from '@/features/products" src/` | 0 hits |
| Zero `@/constants/mock-api` imports in `src/` | `grep -rn "from '@/constants/mock-api'" src/` | 0 hits |
| Zero `@/constants/data` imports in `src/` | `grep -rn "from '@/constants/data'" src/` | 0 hits |
| Zero `SaleUser`/`recentSalesData` references in `src/` | `grep -rn "SaleUser\|recentSalesData" src/` | 0 hits |
| Zero `'/dashboard/product'` keys in breadcrumbs | `grep -n "'/dashboard/product'" src/hooks/use-breadcrumbs.tsx` | 0 hits |
| Build compile phase succeeds | `npm run build` → `Compiled successfully in 9.9s` | PASS (compile) |
| Atomic DEBT-A1 commit exists | `git log -1 --oneline \| grep -q "DEBT-A1"` | PASS |

**Build verification caveat:** `npm run build` exits 1 due to a pre-existing TypeScript error in `src/features/job-leads/lib/prioritization.ts:70` (target=es5 cannot iterate `MapIterator`). This error is **not caused by DEBT-A1** — reproduced on `HEAD = b592d28` before any Plan 04-01 edits by stashing the deletions. See `deferred-items.md` for the full reproducer. The plan's documented success criterion `npm run build exits 0` cannot be achieved without a separate fix to either `tsconfig.json` or `prioritization.ts`. The deletions themselves do not introduce any new compile errors — TypeScript's compilation phase passes cleanly on the post-deletion tree.

## Deviations from Plan

### Auto-fixed Issues

None — this plan is pure deletion and no source-code bugs were touched.

### Scope-Boundary Deferred Items

**1. [Pre-existing] `src/features/job-leads/lib/prioritization.ts:70` TS error blocks `npm run build`**

- **Found during:** Task 1 verification (first build attempt after `git rm -r` deletions)
- **Issue:** `Type 'MapIterator<PrioritizedRecommendation>' can only be iterated through when using the '--downlevelIteration' flag or with a '--target' of 'es2015' or higher.`
- **Root cause:** Project `tsconfig.json` has `"target": "es5"` (verified in claudeMd / project structure section); `prioritization.ts` was authored using `for (const rec of byContact.values())` which requires `es2015+` or `downlevelIteration: true`.
- **Why not auto-fixed:** SCOPE BOUNDARY rule — error is in `src/features/job-leads/lib/prioritization.ts`, which is unrelated to the products feature being deleted. Verified pre-existing by stashing my deletions, building HEAD, reproducing the same error. Fix would require either editing `tsconfig.json` (project-wide implications) or rewriting unrelated feature code — neither belongs in DEBT-A1.
- **Logged at:** `.planning/phases/04-starter-template-cleanup/deferred-items.md`
- **Recommended next step:** Add a DEBT-A6 or PHASE-4-PREP plan that bumps `tsconfig.json` target to `es2015+` (or sets `downlevelIteration: true`) so subsequent Phase 4 plans can verify against a passing build baseline.

### Plan-Spec Deviations

**1. [Doc] `src/features/products/components/product-tables/{index,options}.tsx` not enumerated in plan `files_modified`**

- **Found during:** Task 1 `git rm -r src/features/products/`
- **Issue:** The plan's `files_modified` frontmatter listed 5 files under `src/features/products/components/` but the actual directory contains 7 files (`product-tables/index.tsx` and `product-tables/options.tsx` were not enumerated).
- **Resolution:** D-07 in CONTEXT.md says "delete BOTH the feature directory and the route directory in a single atomic step" → the entire directory deletion is the contract, not the file-by-file list. The two extra files were swept up correctly. This is a plan-spec under-specification, not a planning error.
- **No remediation needed:** the deletion executed per D-07 intent.

**2. [Workflow] Atomic commit covers all three tasks (per D-19) rather than per-task commits (per execute-plan.md framework default)**

- **Found during:** Task 3 step 6 execution
- **Issue:** The executor framework's `task_commit_protocol` says "commit immediately" after each task; the plan's Task 3 step 6 explicitly mandates a single atomic commit per D-19.
- **Resolution:** D-19 takes precedence (plan-specific instruction overrides generic framework). One commit `0323e90` covers all three task outputs. The framework's per-task tracking is preserved in this SUMMARY's "Task Commits" section, mapping each task to the same atomic commit hash.

## Authentication Gates

None — this plan touched no auth-related code.

## Known Stubs

None — pure deletion plan. No placeholder data, no `TODO`/`FIXME` markers introduced. No new code written.

## Self-Check: PASSED

- `.planning/phases/04-starter-template-cleanup/04-01-SUMMARY.md` exists (this file).
- `.planning/phases/04-starter-template-cleanup/deferred-items.md` exists.
- Commit `0323e90` exists: `git log --oneline | grep -q "0323e90"` returns 0.
- Commit subject contains `DEBT-A1`: `git log -1 --oneline | grep -q "DEBT-A1"` returns 0.
- All deletion targets confirmed absent via `test ! -d` / `test ! -f`.
- All grep checks return zero hits (no orphan imports of deleted modules).
