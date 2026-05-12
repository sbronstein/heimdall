---
phase: 02-test-infrastructure
plan: 04
subsystem: testing
tags: [vitest, regression, hydration, ssr, clerk-mock, jsdom, react-dom]

# Dependency graph
requires:
  - phase: 01-critical-bug-fix
    provides: Fixed app-sidebar.tsx (span outer element, unconditional UserAvatarProfile render)
  - phase: 02-test-infrastructure/02-01
    provides: Vitest + jsdom setup, npm run test:run script
provides:
  - BUG-01 SSR structural regression test (app-sidebar.ssr.test.tsx, node env)
  - BUG-01 hydration mount regression test (app-sidebar.hydration.test.tsx, jsdom env)
affects:
  - future refactors of app-sidebar.tsx or user-avatar-profile.tsx

# Tech tracking
tech-stack:
  added: [jsdom@26, @types/jsdom]
  patterns:
    - vi.mock asChild-aware sidebar mock pattern (render <span> when asChild=true, <button> when not)
    - JSDOM structural DOM assertion (querySelectorAll + querySelector for nested element detection)
    - console.error spy with hydration-pattern filter (/hydrat/i, /did not match/i)
    - renderToString + hydrateRoot in-process hydration regression pattern

key-files:
  created:
    - src/components/layout/app-sidebar.ssr.test.tsx
    - src/components/layout/app-sidebar.hydration.test.tsx
  modified:
    - package.json (jsdom, @types/jsdom added to devDependencies)
    - package-lock.json

key-decisions:
  - "jsdom was not a transitive dep of vitest in this project config; installed explicitly as devDependency"
  - "SidebarMenuButton mock respects asChild=true by rendering <span> instead of <button> to avoid false positives on no-div-in-button assertion"
  - "SidebarMenuSubButton mock renders <span> (not <a>) to avoid nested <a>-inside-<a> hydration error from next/link rendering"
  - "All custom sidebar props (isActive, tooltip, asChild) explicitly destructured and discarded to prevent React unknown-prop warnings"
  - "Regression sanity check: introducing <div> outer in user-avatar-profile.tsx caused SSR test FAIL as expected; reverted"

patterns-established:
  - "Component SSR regression: mock UI primitives + use renderToString + JSDOM DOM parsing for structural assertions"
  - "Hydration regression: renderToString -> innerHTML -> hydrateRoot -> setTimeout flush -> spy filter pattern"
  - "asChild-aware mock: if asChild=true render neutral <span>, else render semantic element (<button>)"

requirements-completed: [TEST-A3]

# Metrics
duration: 25min
completed: 2026-05-12
---

# Phase 02 Plan 04: BUG-01 Regression Test Suite Summary

**Two-file regression harness pinning the BUG-01 fix: JSDOM-parsed SSR structural assertion (no div-in-button) + hydrateRoot console.error spy (no hydration warnings) for AppSidebar**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-12T18:40:00Z
- **Completed:** 2026-05-12T18:44:00Z
- **Tasks:** 2
- **Files created:** 2 test files + package.json changes

## Accomplishments

- Created `app-sidebar.ssr.test.tsx` (node env, 4 it-blocks): no-throw render, no-div-in-button via JSDOM DOM walk, UserAvatarProfile markup present, mocked user fullName+email in HTML
- Created `app-sidebar.hydration.test.tsx` (jsdom env, 1 it-block): hydrateRoot + microtask flush + console.error spy filtered to `/hydrat/i` and `/did not match/i`
- Installed `jsdom` + `@types/jsdom` (was not a transitive dep in this vitest node-env config)
- Full test suite passes: 79 tests (10 files) including 5 new tests

## jsdom Installation Note

`jsdom` was NOT a pre-existing transitive dependency. `node -e "require.resolve('jsdom')"` confirmed its absence before Task 1. Installed via `npm install --save-dev jsdom @types/jsdom`.

## Regression Sanity Check Result

As required by the plan's `<verification>` section:

1. Temporarily changed `user-avatar-profile.tsx` line 19 from `<span className='flex items-center gap-2'>` to `<div className='flex items-center gap-2'>`
2. Ran `npx vitest run src/components/layout/app-sidebar.ssr.test.tsx`
3. **Result: FAILED** on `contains no <div> inside any <button>` with the expected error message showing the offending button outerHTML
4. Reverted the change; all 79 tests pass again

The SSR structural test correctly catches re-introduction of the BUG-01 root cause.

## Console.error Noise Observed (Hydration Test)

During development of the hydration test, the following non-hydration console.error was present:

- **"React does not recognize the `isActive` prop on a DOM element"** — triggered by sidebar mock components passing `isActive` through to real DOM elements

This noise was resolved by explicitly destructuring and discarding `isActive`, `tooltip`, and `asChild` props in all sidebar mock component signatures. The hydration spy filter (D-15) correctly ignores non-hydration warnings, but eliminating the noise keeps the test output clean.

No Radix UI warnings were observed during the actual test runs (all Radix UI components are fully mocked).

## Task Commits

1. **Task 1: SSR structural regression test** - `4e091c9` (test)
2. **Task 2: Hydration mount regression test** - `d9c9ca0` (test)

## Files Created/Modified

- `src/components/layout/app-sidebar.ssr.test.tsx` - 4 SSR structural assertions; node env; mocks Clerk, next/navigation, sidebar UI primitives, icons
- `src/components/layout/app-sidebar.hydration.test.tsx` - 1 hydration assertion; jsdom env (`// @vitest-environment jsdom` first line); same mocks; hydrateRoot + spy pattern
- `package.json` - Added jsdom + @types/jsdom to devDependencies
- `package-lock.json` - Updated lockfile

## Decisions Made

- **jsdom install path taken:** explicit install (not pre-existing transitive dep). Confirmed with `node -e "require.resolve('jsdom')"` before and after.
- **SidebarMenuButton mock uses asChild guard:** When `asChild=true`, mock renders `<span>` instead of `<button>`. This prevents false positives in the no-div-in-button assertion — the header area uses `SidebarMenuButton asChild` with a `<Link>` containing `<div>` children, which would incorrectly fail the assertion if the mock always emitted `<button>`.
- **SidebarMenuSubButton mock renders `<span>`:** The nav has an "Account" item with sub-items (Profile). `SidebarMenuSubButton asChild` + `next/link` (which mocks to `<a>`) would create `<a> inside <a>` invalid HTML causing a real hydration warning. Rendering `<span>` avoids this without losing the meaningful assertion coverage.
- **Clerk mock:** `vi.mock('@clerk/nextjs')` returns fixed user; real Clerk runtime never imported. Grep: no `@clerk/themes` or real Clerk import outside `vi.mock` blocks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SidebarMenuButton mock needed asChild awareness**
- **Found during:** Task 1 (SSR structural test)
- **Issue:** Plan specified a simple `<button>` mock for `SidebarMenuButton` but did not account for the header area using `asChild=true` + a `<Link>` child containing `<div>` elements. This caused false positives in the no-div-in-button assertion.
- **Fix:** Added `asChild` parameter check: render `<span>` when `asChild=true`, `<button>` when false/undefined
- **Files modified:** app-sidebar.ssr.test.tsx, app-sidebar.hydration.test.tsx
- **Verification:** Test passes with mocked structure; regression sanity check confirmed the assertion still catches the real bug
- **Committed in:** `d9c9ca0` (Task 2 commit — refinement applied to both files)

**2. [Rule 1 - Bug] SidebarMenuSubButton mock caused nested `<a>` hydration warning**
- **Found during:** Task 2 (hydration test)
- **Issue:** The initial `<a>` mock for `SidebarMenuSubButton` + `next/link` rendering as `<a>` created `<a> inside <a>` invalid HTML. This generated a real React warning matching `/did not match/i`, causing the hydration test to fail for a structural mock reason rather than the real BUG-01.
- **Fix:** Changed `SidebarMenuSubButton` mock to render `<span>` (neutral passthrough) instead of `<a>`
- **Files modified:** app-sidebar.ssr.test.tsx, app-sidebar.hydration.test.tsx
- **Verification:** Hydration test passes cleanly; no unexpected warnings in spy output
- **Committed in:** `d9c9ca0`

---

**Total deviations:** 2 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Both fixes were necessary for mock correctness. No scope creep; the assertions still exercise the BUG-01 regression fence as designed.

## Clerk Runtime Isolation Verification

```bash
grep -n "import.*@clerk" src/components/layout/app-sidebar.ssr.test.tsx
grep -n "import.*@clerk" src/components/layout/app-sidebar.hydration.test.tsx
```

Neither file imports from `@clerk/nextjs` outside of `vi.mock(...)` factory callbacks. The real Clerk runtime is never loaded.

## Issues Encountered

- **jsdom `SecurityError: localStorage is not available for opaque origins`** — JSDOM requires a `url` option to avoid opaque origin restrictions. Fixed by passing `{ url: 'http://localhost/' }` to `new JSDOM(html, ...)`.

## Next Phase Readiness

- TEST-A3 complete: BUG-01 regression fence active. Any future refactor that re-introduces `<div>` inside `<button>` in `AppSidebar` will be caught by the SSR test. Any re-introduction of `{user && ...}` gating will cause the mocked fullName/email to disappear from SSR HTML, failing two assertions.
- Phase 3 (Security Hardening) can proceed without dependency on these tests.

---
*Phase: 02-test-infrastructure*
*Completed: 2026-05-12*
