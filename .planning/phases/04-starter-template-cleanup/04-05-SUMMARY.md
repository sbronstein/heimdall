---
phase: 04-starter-template-cleanup
plan: 05
subsystem: cleanup
tags:
  - cleanup
  - starter-template
  - deletion
  - verification
  - debt
  - phase-completion
dependency_graph:
  requires:
    - "DEBT-A4 declared in REQUIREMENTS.md v1 Active → Starter-Template Cleanup"
    - "D-13/D-14/D-16/D-17/D-18/D-19 in 04-CONTEXT.md (Wave 2 ordering + verification strategy + atomic commits)"
    - "Wave 1 plans 04-01, 04-02, 04-03, 04-04 completed (DEBT-A1, A2, A3, A5)"
  provides:
    - "Removal of __CLEANUP__/ top-level directory (15 files: clerk/, kanban/, sentry/, scripts/, cleanup.md)"
    - "src/__cleanup__.test.ts — 13 filesystem-existence assertions + 1 source-string assertion pinning every Phase 4 deletion target"
    - "Closure of Phase 4: 5/5 plans complete; ROADMAP SC #1-4 directly verifiable via npm run test:run"
    - "Eliminated tampering surface T-04-11 (cleanup.js script with --force-bypassable safety check)"
  affects:
    - "__CLEANUP__/ (entire directory removed)"
    - "src/__cleanup__.test.ts (new test file)"
    - ".planning/STATE.md, .planning/ROADMAP.md, .planning/REQUIREMENTS.md (phase-completion metadata)"
tech-stack:
  added: []
  patterns:
    - "Atomic commit per DEBT-Ax (D-19 — shared with Phase 3 + Phase 4 Plans 01/02/03/04)"
    - "Filesystem-existence Vitest test (D-16) — alternative to runtime HTTP 404 smoke (D-17) since Next.js's route resolver IS the contract"
    - "Wave 2 ordering (D-14) — __CLEANUP__/ removal sequenced LAST to make accidental cleanup.js invocation against partially-cleaned state structurally impossible"
key-files:
  created:
    - "src/__cleanup__.test.ts"
    - ".planning/phases/04-starter-template-cleanup/04-05-SUMMARY.md"
  modified: []
  deleted:
    - "__CLEANUP__/cleanup.md"
    - "__CLEANUP__/clerk/app-page.tsx"
    - "__CLEANUP__/clerk/app-sidebar.tsx"
    - "__CLEANUP__/clerk/dashboard-page.tsx"
    - "__CLEANUP__/clerk/infoconfig.ts"
    - "__CLEANUP__/clerk/providers.tsx"
    - "__CLEANUP__/clerk/use-nav.ts"
    - "__CLEANUP__/clerk/user-nav.tsx"
    - "__CLEANUP__/kanban/nav-config.ts"
    - "__CLEANUP__/scripts/cleanup-config.js"
    - "__CLEANUP__/scripts/cleanup-interactive.js"
    - "__CLEANUP__/scripts/cleanup.js"
    - "__CLEANUP__/sentry/bar_stats-error.tsx"
    - "__CLEANUP__/sentry/global-error.tsx"
    - "__CLEANUP__/sentry/next.config.ts"
decisions:
  - "Honored D-13/D-14: rm -rf __CLEANUP__/ sequenced LAST in Phase 4 — cleanup.js script (with --force-bypassable safety check per cleanup.md line 18) cannot accidentally overwrite real source against a partially-cleaned tree"
  - "Honored D-16: filesystem-existence Vitest test at src/__cleanup__.test.ts with 13 path assertions + 1 source-string assertion; uses node:fs existsSync (sync, fast); zero PGlite/DB dependencies"
  - "CD-03 exercised: used Vitest's it.each(deletedPaths) rather than a single it() with forEach loop — produces one named test per deletion target so failures point at the specific regression"
  - "CD-05 verified: package.json contains NO cleanup script tied to __CLEANUP__/scripts/cleanup.js (grep -c '__CLEANUP__\\|cleanup\\.js' package.json returned 0) — no package.json edit required"
  - "D-19 atomic commit pattern: DEBT-A4 deletion + new test bundled in single commit c7524c3 (matches Phase 4 pattern across Plans 01-04)"
metrics:
  duration: "~4 min"
  completed: "2026-05-13"
  files_deleted_this_plan: 15
  files_created_this_plan: 1
  test_assertions_added: 14
requirements:
  - DEBT-A4
---

# Phase 4 Plan 05: DEBT-A4 + Filesystem-Existence Verification Test Summary

Removed the `__CLEANUP__/` top-level directory in its entirety (15 files spanning `clerk/`, `kanban/`, `sentry/`, `scripts/`, and `cleanup.md`) per DEBT-A4 / D-13 / D-14, and added `src/__cleanup__.test.ts` — a filesystem-existence Vitest test that pins every Phase 4 deletion target plus the `computeBridgeScore` absence in the job-leads search route. This is the final plan of Phase 4 (Starter-Template Cleanup); ROADMAP SC #1–4 are now directly verifiable on a clean checkout via `npm run test:run`.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Pre-flight check + delete `__CLEANUP__/` directory (DEBT-A4) | c7524c3 | 15 files deleted under `__CLEANUP__/` |
| 2 | Author filesystem-existence verification test (D-16) | c7524c3 | `src/__cleanup__.test.ts` added |
| 3 | Final build verification + atomic commit + SUMMARY | c7524c3 (DEBT-A4) + this commit (metadata) | This SUMMARY.md + STATE/ROADMAP/REQUIREMENTS updates |

Tasks 1 and 2 ship in a single atomic commit per D-19; Task 3 ships the SUMMARY + state docs as a separate `docs(04-05)` commit.

## What Was Done

### Task 1: Pre-flight check + `rm -rf __CLEANUP__/`

1. **CD-05 pre-flight verification.** Confirmed package.json contains zero references to the cleanup script:
   ```
   grep -c "__CLEANUP__\|cleanup\.js" package.json  → 0
   ```
   No package.json edit required.
2. **Source reference check.** Confirmed no `src/` file references `__CLEANUP__`:
   ```
   grep -rn "__CLEANUP__" src/  → (empty)
   ```
3. **Wave 1 prerequisite check.** `git log` shows all four atomic DEBT commits landed:
   - `0323e90` feat(04): DEBT-A1 — products feature
   - `ca82a84` feat(04): DEBT-A2 — starter routes + Infobar machinery
   - `8fa1aa9` feat(04): DEBT-A3 — kanban removal + PROJECT.md update
   - `114dd34` feat(04): DEBT-A5 — drop unused computeBridgeScore import
4. **Deletion via `git rm -r __CLEANUP__/`** — staged 15 files cleanly:
   - `cleanup.md`
   - `clerk/app-page.tsx`, `clerk/app-sidebar.tsx`, `clerk/dashboard-page.tsx`, `clerk/infoconfig.ts`, `clerk/providers.tsx`, `clerk/use-nav.ts`, `clerk/user-nav.tsx`
   - `kanban/nav-config.ts`
   - `scripts/cleanup-config.js`, `scripts/cleanup-interactive.js`, `scripts/cleanup.js`
   - `sentry/bar_stats-error.tsx`, `sentry/global-error.tsx`, `sentry/next.config.ts`
5. **Post-deletion verification.** `test -d __CLEANUP__` returns 1 (DELETED); `git status --short` shows only the expected `D` entries (plus pre-existing dirty-tree items unrelated to this plan).

### Task 2: Author filesystem-existence test (D-16)

Wrote `src/__cleanup__.test.ts` (37 lines) with three structural elements:

1. **`deletedPaths` const array** — 13 relative paths covering all Phase 4 deletion targets:
   - Plan 04-01: `src/features/products`, `src/app/dashboard/product`, `src/constants/mock-api.ts`
   - Plan 04-02: `src/app/dashboard/exclusive`, `src/app/dashboard/workspaces`, `src/app/dashboard/billing`, `src/components/ui/infobar.tsx`, `src/components/ui/info-button.tsx`, `src/components/layout/info-sidebar.tsx`, `src/config/infoconfig.ts`
   - Plan 04-03: `src/app/dashboard/kanban`, `src/features/kanban`
   - Plan 04-05 (this plan): `__CLEANUP__`
2. **`it.each(deletedPaths)` block** — one named test per path: `existsSync(resolve(process.cwd(), relPath))).toBe(false)`. CD-03 noted either `forEach` or `it.each` was acceptable; selected `it.each` because it produces one named test per regression target.
3. **Source-string assertion** — reads `src/app/api/job-leads/[id]/search/route.ts` and asserts the content does NOT match `/computeBridgeScore/`. This complements the build-time unused-import-warning check (which DEBT-A5 satisfies) by giving a structural assertion that's independent of TypeScript settings.

Uses only `node:fs` (existsSync, readFileSync) and `node:path` (resolve). Zero application-code imports — no PGlite, no Drizzle, no Next.js. Sync I/O for sub-50ms execution per D-16.

### Task 3: Build verification + atomic commit

1. **`npm run test:run` (post-deletion):**
   - 12 test files passed (was 11 before this plan; new file: `src/__cleanup__.test.ts`)
   - 101 tests passed (was 87 before; +14 new — 13 path checks + 1 source-string check)
   - Duration: **9.92s** — just under the Phase 2 CD-01 10-second threshold
2. **`npm run build`:**
   - Compilation step: ✓ Compiled successfully in 8.4s (no compilation errors caused by Phase 4 deletions)
   - TypeScript step: fails on the pre-existing `src/features/job-leads/lib/prioritization.ts:70` MapIterator/es5 error documented in `.planning/phases/04-starter-template-cleanup/deferred-items.md`
   - **No new errors or warnings** mentioning `computeBridgeScore`, `Infobar`, `Product`, `SaleUser`, `recentSalesData`, or any deleted dashboard route — confirming the cleanup itself introduced no transitive breakage
3. **Atomic commit (DEBT-A4):** `c7524c3 feat(04): DEBT-A4 — rm __CLEANUP__/ + add filesystem-existence verification test`. Per D-19 atomic-per-DEBT-Ax pattern, this single commit covers both the deletion and the verification test.

## Verification

All `<verification>` checks from the plan satisfied:

- ✓ `test ! -d __CLEANUP__` succeeds.
- ✓ `src/__cleanup__.test.ts` exists and asserts 13 deleted paths + 1 source-string assertion (14 total assertions).
- ✓ `npm run test:run` exits 0; new test file reports 14 passing tests inside `Phase 4 starter-template cleanup` describe block.
- ✓ `npm run build` introduces no new errors/warnings about Phase 4 deletions. The lone failure (`prioritization.ts:70` MapIterator/es5) is pre-existing and out of scope per `deferred-items.md`.
- ✓ `git log -5 --oneline` shows five `feat(04): DEBT-A*` commits — one per requirement, atomic per D-19:
  ```
  c7524c3 feat(04): DEBT-A4 — rm __CLEANUP__/ + add filesystem-existence verification test
  114dd34 feat(04): DEBT-A5 — drop unused computeBridgeScore import in search route
  8fa1aa9 feat(04): DEBT-A3 — delete kanban route + feature folder, record decision in PROJECT.md
  ca82a84 feat(04): DEBT-A2 — delete starter routes + Infobar machinery
  0323e90 feat(04): DEBT-A1 — delete products feature + dead support files
  ```
- ✓ `.planning/phases/04-starter-template-cleanup/04-05-SUMMARY.md` exists (this file) and reports phase-completion state.

## Success Criteria Met

All seven criteria from the plan's `<success_criteria>`:

1. ✓ `__CLEANUP__/` does not exist at the repo root.
2. ✓ `src/__cleanup__.test.ts` exists, runs in Vitest node environment, and asserts all 13 deletion targets + the `computeBridgeScore` absence.
3. ✓ `npm run test:run` exits 0; new test produces 14 passing assertions.
4. ✓ `npm run build` succeeds at the compilation step; only the pre-existing `prioritization.ts:70` deferred error remains. No new error introduced by Phase 4 cleanup.
5. ✓ `package.json` contains no `cleanup` script tied to `__CLEANUP__/scripts/cleanup.js` (CD-05 grep returned 0).
6. ✓ One atomic git commit (`c7524c3`) with `DEBT-A4` in the subject.
7. ✓ This SUMMARY exists and reports satisfaction of ROADMAP SC #1–4.

### ROADMAP SC #1–4 — End-of-Phase Satisfaction

| SC | Statement | Verifier | Status |
|----|-----------|----------|--------|
| #1 | Visiting `/dashboard/{product,exclusive,workspaces,billing}` returns 404 | `src/__cleanup__.test.ts` asserts each route directory is absent. Next.js's framework default 404 takes over for deleted route segments — the route resolver IS the contract (PD-05 / D-17). | ✓ |
| #2 | `src/features/products/`, the 805-line `src/components/ui/infobar.tsx`, and `__CLEANUP__/` no longer exist | `src/__cleanup__.test.ts` asserts all three as `existsSync(...) === false` | ✓ |
| #3 | `/dashboard/kanban` route is either backed by `/api/tasks` or removed (decision recorded in PROJECT.md) | Plan 04-03 deleted the route + feature folder AND appended `(Removed in Phase 4)` to PROJECT.md per D-02 | ✓ |
| #4 | `npm run build` succeeds with no unused-import warnings for `computeBridgeScore` in the job-leads search route | Plan 04-04 removed the import; this plan's test additionally asserts the string is absent. Build's compilation step exits 0. The pre-existing `prioritization.ts:70` error is unrelated (deferred-items.md) | ✓* |

\* SC #4's "build succeeds" subclause is satisfied for the cleanup-specific portion. The repo-wide `npm run build` exits 1 on the deferred pre-existing `prioritization.ts:70` MapIterator/es5 error documented since Plan 04-01 — that's a tsconfig/feature-code issue, not a Phase 4 deletion consequence.

## Phase 4 Summary (End-of-Phase Report)

### Commit Trail

Five atomic `feat(04): DEBT-A*` commits — one per requirement, plus per-plan `docs(04-XX): complete...` SUMMARY commits:

```
c7524c3 feat(04): DEBT-A4 — rm __CLEANUP__/ + add filesystem-existence verification test  ← this plan
4b85798 docs(04-04): complete DEBT-A5 plan — drop unused computeBridgeScore import
114dd34 feat(04): DEBT-A5 — drop unused computeBridgeScore import in search route
1756595 docs(04-03): complete DEBT-A3 kanban removal plan
8fa1aa9 feat(04): DEBT-A3 — delete kanban route + feature folder, record decision in PROJECT.md
5078ab7 docs(04-02): complete starter routes + Infobar machinery cleanup plan
ca82a84 feat(04): DEBT-A2 — delete starter routes + Infobar machinery
1cbdeaa docs(04-01): complete DEBT-A1 (products feature deletion)
0323e90 feat(04): DEBT-A1 — delete products feature + dead support files
b592d28 docs(04): create phase plan
```

### Net Diff

- Files deleted across Phase 4: **~44 total** (29 from Wave 1 + 15 from `__CLEANUP__/`)
- Files modified: ~7 (`src/app/dashboard/layout.tsx`, `src/components/layout/page-container.tsx`, `src/components/ui/heading.tsx`, `src/hooks/use-breadcrumbs.tsx`, `src/constants/data.ts`, `src/app/api/job-leads/[id]/search/route.ts`, `.planning/PROJECT.md` for the kanban out-of-scope note)
- Files created: **1** source file (`src/__cleanup__.test.ts`) + 5 SUMMARY.md docs
- Diff stat (0aa812e → HEAD post-this-commit): ~3,500 lines deleted, ~50 lines added

### Test Suite Delta

- Phase 2 baseline (start of Phase 4): 11 test files, 87 tests, runtime ~6s
- End of Phase 4: 12 test files, 101 tests, runtime 9.92s — under the Phase 2 CD-01 10s threshold
- New test surface added by this plan: `src/__cleanup__.test.ts` with 14 assertions (13 fs.existsSync + 1 source-string)

### Build Runtime Delta

The 805-line `infobar.tsx` no longer bundles; the full `src/features/products/` feature folder no longer bundles. Quantitative bundle-size delta not measured in this plan — would require comparing `next build` output sizes pre/post-phase, which is bundled into a follow-on observability task if needed. Build compilation runtime appears similar (~8s) given the size of the deletions are small relative to the active feature surface.

### Per-Plan CD-* Decisions Exercised

| Plan | CD-* | What was decided |
|------|------|------------------|
| 04-01 | CD-01 | `src/constants/data.ts` deleted entirely (Product/SaleUser/recentSalesData were the only exports) |
| 04-02 | (none) | Plan structure followed CONTEXT.md verbatim — no discretion calls exercised |
| 04-03 | (none) | PROJECT.md append per D-02 satisfied SC #3 directly |
| 04-04 | (none) | One-line edit — no discretion needed |
| 04-05 | CD-03, CD-05 | CD-03: used Vitest `it.each` over `forEach`. CD-05: verified zero cleanup-script references in package.json — no edit needed |

CD-02 (custom 404 not-found.tsx) and CD-06 (additional auth-page chrome cleanup) were left in the recommended "skip" state per CONTEXT.md guidance.

### Pre-Push Gate Hardening

The new `src/__cleanup__.test.ts` enters the husky pre-push gate (Phase 2 `.husky/pre-push` runs `npm run build && npm run test:run`). Any future commit that re-introduces a Phase 4 starter-template path will fail the pre-push test and be blocked from reaching origin. This is durable regression protection, not a one-time check (per CONTEXT.md T-04-12 mitigation).

## Deviations from Plan

**None — plan executed exactly as written.**

The pre-existing `prioritization.ts:70` build failure was already documented in `.planning/phases/04-starter-template-cleanup/deferred-items.md` (logged during Plan 04-01 verification). Per the SCOPE BOUNDARY rule in `execute-plan.md` and the orchestrator's explicit instruction in this plan's prompt ("Don't try to fix it in this plan — it's out of Phase 4 scope. Your `npm run build` verify can capture and acknowledge it, but it should not block the plan."), it was correctly left untouched.

## Auth Gates

None encountered — this plan involves only local filesystem operations and the local Vitest test runner.

## Threat Surface Scan

No new threat surface introduced. Per the plan's `<threat_model>`:

- **T-04-11 (mitigate):** Eliminated tampering surface — `__CLEANUP__/scripts/cleanup.js` (with `--force`-bypassable safety check per cleanup.md line 18) can no longer be invoked against a partially-cleaned tree. Mitigation applied as intended.
- **T-04-12 (mitigate):** Durable repudiation protection — `src/__cleanup__.test.ts` provides a version-controlled assertion that the Phase 4 deletions stayed deleted. Any commit re-introducing a starter-template path or the `computeBridgeScore` import in the search route will fail the husky pre-push gate.
- **T-04-13 (mitigate):** Reduced information-disclosure surface — `__CLEANUP__/clerk/` and `__CLEANUP__/sentry/` template directories (committed reference copies of "what the app looks like with auth/observability stripped") are gone. Smaller repo = smaller surface for misreading historical context as current.

## Known Stubs

None. This plan adds a test file (not application code) and deletes a top-level directory of starter-template artifacts. Zero UI-rendering surface affected.

## Self-Check: PASSED

- File `.planning/phases/04-starter-template-cleanup/04-05-SUMMARY.md` exists (this file).
- File `src/__cleanup__.test.ts` exists with 14 passing assertions.
- Directory `__CLEANUP__/` does NOT exist (verified by `test ! -d __CLEANUP__`).
- Commit `c7524c3` exists in `git log` with `DEBT-A4` in the subject.
- All Phase 4 SC #1–4 verifiable on a clean checkout via `npm run test:run`.
