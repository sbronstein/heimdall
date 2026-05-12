---
phase: 02-test-infrastructure
reviewed: 2026-05-12T00:00:00Z
depth: deep
files_reviewed: 17
files_reviewed_list:
  - vitest.config.ts
  - src/test-utils/pglite.ts
  - src/test-utils/call-route.ts
  - .husky/pre-push
  - src/lib/domain/pipeline.test.ts
  - src/lib/api/types.test.ts
  - src/lib/api/filters.test.ts
  - src/features/job-leads/lib/prioritization.test.ts
  - src/features/job-leads/lib/seniority.test.ts
  - src/app/api/applications/[id]/status/route.test.ts
  - src/app/api/contacts/import/route.test.ts
  - src/app/api/contacts/route.test.ts
  - src/components/layout/app-sidebar.ssr.test.tsx
  - src/components/layout/app-sidebar.hydration.test.tsx
  - package.json
  - tsconfig.json
  - src/app/api/contacts/import/__fixtures__/linkedin-connections.csv
findings:
  critical: 2
  warning: 3
  info: 2
  total: 7
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-05-12
**Depth:** deep
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Phase 2 added a complete Vitest + PGlite test harness with 79 tests across 10 files. The
infrastructure choices are sound: PGlite in-memory DB with migration replay, a Proxy-based
db mock that survives per-test DB swapping via `vi.hoisted`, and a `callRoute()` helper that
exercises real route handlers without HTTP. Most tests are correct and the math in the
prioritization tests was verified against the actual production formula.

Two blockers emerged. The pre-push hook hardcodes `bun` which is not the project's package
manager and will break on any machine without bun installed. More significantly, the React 19
hydration regression test is structurally inert — React 19 no longer routes hydration
mismatch errors through `console.error`, so the spy-based assertion will always pass whether
or not there is a real hydration mismatch.

## Critical Issues

### CR-01: Pre-push hook requires `bun` but project uses `npm`

**File:** `.husky/pre-push:1`
**Issue:** Line 1 is `bun run build`. The project's package manager is npm (lockfile is
`package-lock.json`, CLAUDE.md stack section says "npm", the pre-commit hook uses
`npx lint-staged`). On any machine where bun is not installed, every `git push` will
immediately fail with `bun: command not found`, blocking the developer.

**Fix:**
```sh
npm run build
npm run test:run
```

---

### CR-02: Hydration test spy cannot intercept React 19 hydration errors — always passes silently

**File:** `src/components/layout/app-sidebar.hydration.test.tsx:113-128`
**Issue:** The test spies on `console.error` and filters for calls matching `/hydrat/i` or
`/did not match/i`. In React 19, hydration mismatch errors are no longer dispatched through
`console.error`. They pass through `defaultOnRecoverableError` → `reportGlobalError`, which
in a jsdom environment fires a DOM `error` event on `window`, not a `console.error` call.
Searching `react-dom-client.development.js` (v19.2) reveals zero `console.error` calls
containing "hydrat" or "did not match".

As a result this test will always pass regardless of whether BUG-01 is actually fixed. The
regression it was built to guard is not guarded.

**Fix:** Use React's `act()` to flush all updates and check that no error was thrown, or
listen on the `window` error event, or use `onRecoverableError` on the `hydrateRoot` call:

```tsx
it('hydrates without React hydration warnings', async () => {
  const html = renderToString(React.createElement(AppSidebar));
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);

  const caughtErrors: Error[] = [];

  await act(async () => {
    hydrateRoot(container, React.createElement(AppSidebar), {
      onRecoverableError: (err) => {
        // React 19 routes hydration mismatches here
        if (/hydrat/i.test(err.message) || /did not match/i.test(err.message)) {
          caughtErrors.push(err as Error);
        }
      }
    });
  });

  expect(
    caughtErrors,
    `Hydration errors:\n${caughtErrors.map((e) => e.message).join('\n')}`
  ).toHaveLength(0);
});
```

`act` from `@testing-library/react` or `react` must be imported. This requires adding
`@testing-library/react` as a devDependency or using the built-in `import { act } from 'react'`.

---

## Warnings

### WR-01: Proxy db mock does not bind `this` — latent type error if Drizzle methods rely on receiver

**File:** `src/app/api/applications/[id]/status/route.test.ts:9`, `src/app/api/contacts/import/route.test.ts:10`, `src/app/api/contacts/route.test.ts:10`
**Issue:** The Proxy handler returns `dbRef.current[prop]` directly without binding `this`:

```ts
get: (_, prop) => (dbRef.current as ...)[prop]
```

When `db.select()` is called on the Proxy, `this` inside `select` is the Proxy, not
`dbRef.current`. Drizzle's `PgDatabase` class methods capture `this.session` (the Neon/PGlite
session). If a method accesses instance state via `this`, it will read from the Proxy, which
re-dispatches to `dbRef.current`. This works only because the Proxy's `get` trap acts as
infinite-depth delegation. The tests pass in practice, but this is a fragile implicit
invariant — any Drizzle upgrade that adds a method using `this` in a way not delegated
through property access could silently break.

**Fix:** Bind the return value:
```ts
get: (_, prop: string | symbol) => {
  const val = (dbRef.current as Record<string | symbol, unknown>)[prop];
  return typeof val === 'function' ? val.bind(dbRef.current) : val;
}
```

---

### WR-02: Hydration test `setTimeout(resolve, 0)` flush is not guaranteed to drain all React work

**File:** `src/components/layout/app-sidebar.hydration.test.tsx:118`
**Issue:** A single `setTimeout(resolve, 0)` advances one macrotask tick. React 19 schedules
some reconciler work in microtasks (via `queueMicrotask`) and some in additional scheduler
tasks. If any hydration-triggered effects run in a later tick the test will not see them.
This issue is secondary to CR-02, but if the spy approach is retained after fixing CR-02, the
flush must be more robust.

**Fix:** Use `await act(async () => { hydrateRoot(...); })` (React's `act` drains the full
scheduler queue including microtasks and pending state updates) instead of a bare
`setTimeout`.

---

### WR-03: SSR test assertion on CSS class string is brittle and under-specified

**File:** `src/components/layout/app-sidebar.ssr.test.tsx:130`
**Issue:** The test `'renders UserAvatarProfile markup (no {user && ...} gating)'` asserts:
```ts
expect(html).toContain('flex items-center gap-2');
```
This passes if any element in the rendered HTML has that Tailwind class — not specifically
`UserAvatarProfile`. If the class is renamed, split across breakpoints, or deduplicated by a
future CSS-in-JS change, the test breaks for the wrong reason. Conversely, it could pass even
if `UserAvatarProfile` were removed and another component happened to use those classes.

**Fix:** Assert on user content that is meaningfully tied to `UserAvatarProfile` rendering,
not on an internal CSS string:
```ts
it('renders UserAvatarProfile unconditionally (no {user && ...} gating)', () => {
  // UserAvatarProfile always renders a <span> wrapping avatar + name/email
  // Asserting on actual user data output is a stronger guarantee:
  expect(html).toContain('Steve Bronstein');
  expect(html).toContain('steve@bronstein.org');
});
```
The tests on lines 133-136 already do this. The line-130 test can be merged into or replaced
by those stronger assertions.

---

## Info

### IN-01: `vitest.config.ts` missing the `~/` path alias defined in `tsconfig.json`

**File:** `vitest.config.ts:9-11`
**Issue:** `tsconfig.json` defines both `@/*` and `~/*` aliases. The Vitest config only maps
`@/`. If any test file or helper imported via test imports a module that uses `~/*` (public
assets), resolution would fail at test-time. Currently no test files use `~/*`, so this is
not an active failure, but it is an inconsistency that could surprise future contributors.

**Fix:**
```ts
alias: {
  '@': path.resolve(__dirname, './src'),
  '~': path.resolve(__dirname, './public')
}
```

---

### IN-02: `pipeline.test.ts` has no coverage of `on_hold` as a source of transitions

**File:** `src/lib/domain/pipeline.test.ts`
**Issue:** The `on_hold` state has outbound transitions to `applied`, `recruiter_screen`,
`phone_interview`, `withdrawn`, and `ghosted`. No test exercises an `on_hold → X` or
`on_hold → invalid` path. The "valid forward moves" loop covers valid destinations but there
is no explicit guard showing that `on_hold → offer` (an invalid jump) returns `false`.

**Fix:** Add targeted cases:
```ts
it('allows on_hold → applied (re-activation)', () => {
  expect(canTransition('on_hold', 'applied')).toBe(true);
});

it('blocks on_hold → offer (invalid jump from hold)', () => {
  expect(canTransition('on_hold', 'offer')).toBe(false);
});
```

---

_Reviewed: 2026-05-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
