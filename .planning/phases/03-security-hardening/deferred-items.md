# Phase 3 — Deferred Items

Out-of-scope discoveries surfaced during plan execution. Each item has been
verified to pre-exist on the phase base commit (`1c69a7e`) and is NOT caused
by changes in plans 03-01 or 03-02. These do not block the security-hardening
work and should be addressed in a follow-on cleanup phase.

## DI-01: Pre-existing TypeScript compile error in `src/features/job-leads/lib/prioritization.ts`

**Discovered during:** Plan 03-01 Task 1, while running `npm run build` to satisfy the plan's verification gate.

**Symptom:**
```
./src/features/job-leads/lib/prioritization.ts:70:21
Type error: Type 'MapIterator<PrioritizedRecommendation>' can only be iterated through
when using the '--downlevelIteration' flag or with a '--target' of 'es2015' or higher.

  70 |   for (const rec of byContact.values()) {
```

**Root cause:** `tsconfig.json` has `"target": "es5"` (from the starter template), but
the source uses `Map.prototype.values()` iteration which requires ES2015 iterators.
The error exists on the phase base commit (verified via `git stash` + `npm run build`).

**Impact on plan 03-01:** The plan's verification step `npm run build exits 0` cannot
succeed in the base state. The middleware change ITSELF compiles cleanly — the build
gets through "Compiled successfully in N.Ns" and fails only at the unrelated TS check.
Auth-related verification (test suite, file/grep assertions) is unaffected.

**Recommended fix (one-line, deferred):** Either
- `for (const rec of Array.from(byContact.values())) { ... }` (minimal change), OR
- Bump `tsconfig.json` `target` from `es5` → `es2015` or higher (Next.js 16 already
  requires Node 22; ES5 target is dead weight).

**Scope:** Not security; out of scope for SEC-A1/SEC-A2. Defer to Phase 4
(Starter-Template Cleanup) or a dedicated tsconfig modernization pass.

## DI-02: PD-01 in `03-CONTEXT.md` is incorrect for Next.js 16

**Discovered during:** Plan 03-01 Task 1, while validating that the rename was needed.

**Symptom:** PD-01 claims `src/proxy.ts` is "not currently loaded by Next.js" and that
Next.js requires the file to be named `middleware.ts`. Empirically false for Next.js
16.0.10 (the version pinned in `package.json`): the framework now uses the **proxy**
file convention with `PROXY_LOCATION_REGEXP = (?:src/)?proxy`. `src/proxy.ts` IS
loaded as the framework proxy file in v16. Renaming to `middleware.ts` instead
triggers a deprecation warning:

```
⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.
  Learn more: https://nextjs.org/docs/messages/middleware-to-proxy
```

**Evidence:**
- Next.js 16 upgrade guide (vercel/next.js docs/01-app/02-guides/upgrading/version-16.mdx):
  "The `middleware` filename is deprecated, and has been renamed to `proxy`."
- `packages/next/src/lib/constants.ts`: `PROXY_FILENAME = 'proxy'`,
  `PROXY_LOCATION_REGEXP = (?:src/)?proxy`.

**Impact on plan 03-01:** The rename was unnecessary; PD-01's framing of "activate
dead middleware via rename" rests on a false premise. The actual gap was that the
existing `src/proxy.ts` callback's `createRouteMatcher` argument list excluded
`/api/(.*)`. The matcher expansion + envelope short-circuit is the load-bearing
change; the rename would be a downgrade. See SUMMARY for the deviation log.

**Recommended doc fix (deferred):**
- Update `.planning/codebase/ARCHITECTURE.md` §"Entry Points → Clerk Middleware
  (`src/proxy.ts`)" to reflect that proxy IS the active Next.js 16 file convention,
  not legacy.
- Update CLAUDE.md "Single-user Clerk lock in middleware" to call it the proxy file
  (or remain silent about filename).
- The plan-output instruction in 03-01-PLAN.md to flag these as Phase 3 wrap-up
  doc-correction targets still applies, but for a different reason than the planner
  thought (rename was unnecessary, not that the file was renamed).
