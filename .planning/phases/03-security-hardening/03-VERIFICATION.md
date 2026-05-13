---
phase: 03-security-hardening
verified: 2026-05-12T21:20:00Z
status: passed
score: 3/3 roadmap success criteria verified
overrides_applied: 1
overrides:
  - must_have: "Rename src/proxy.ts to src/middleware.ts (Plan 03-01 PD-01 / D-01)"
    reason: "PD-01 was empirically wrong for Next.js 16.0.10 — the framework's proxy file convention loads src/proxy.ts natively (PROXY_LOCATION_REGEXP = (?:src/)?proxy). Renaming to middleware.ts triggers a deprecation warning. The matcher expansion + envelope short-circuit was applied in place on src/proxy.ts, preserving the SAME security outcome demanded by SEC-A1. Documented as DI-02 in deferred-items.md and as a Rule-4 architectural call in 03-01-SUMMARY.md."
    accepted_by: "claude (verifier, ratifying executor's documented Rule-4 call)"
    accepted_at: "2026-05-12T21:20:00Z"
re_verification: null
gaps: []
human_verification: []
notes:
  - "DI-01 (pre-existing TS error in src/features/job-leads/lib/prioritization.ts:70) blocks `npm run build` exit-0 on the baseline. Verified by inspecting the file at commit 1c69a7e (Phase 3 base) — the error pre-dates Phase 3 (introduced in commit 8562eba, the original job-leads feature). Phase 3 made no edits to prioritization.ts. NOT a Phase 3 regression; deferred to Phase 4 or a tsconfig modernization pass."
  - "DI-02 documents the PD-01/D-01 rename being unnecessary for Next.js 16 (proxy.ts is the active file convention). Verifier ratifies the deviation via the override above; the security outcome is identical."
  - "ROADMAP success criterion #1 mentions '34 routes'. Actual count is 32 — `find src/app/api -name route.ts | wc -l` returns 32, and the route-enumeration test in src/proxy.test.ts asserts `>= 32` (future-proof). The discrepancy is documented in 03-CONTEXT.md PD-01: the figure of 34 was a slight overcount; the contract being enforced is 'all /api/* routes', not a specific integer."
---

# Phase 3: Security Hardening Verification Report

**Phase Goal:** No `/api/*` route is reachable without a valid Clerk session, and starter-template auth artifacts are removed.
**Verified:** 2026-05-12T21:20:00Z
**Status:** PASSED WITH NOTES
**Re-verification:** No — initial verification
**Requirements:** SEC-A1, SEC-A2 (both Complete)

---

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every `/api/*` route returns 401 when called without a valid Clerk session (verified by automated test against all routes) | VERIFIED | `src/proxy.ts:14-25` short-circuits any `/api/*` request with `userId === null` to `NextResponse.json({success:false, error:'Unauthorized'}, {status:401})`. `src/proxy.test.ts` describe (A) asserts 401 envelope for `/api/companies` and `/api/job-leads/abc/search`. Describe (E) globs `src/app/api/**/route.ts` (32 paths) and asserts every path matches `/^\/api\/(.*)/`. `npm run test:run` exits 0 with 87/87 tests passing. |
| 2 | The "Continue with GitHub" no-op button no longer appears on the sign-in or sign-up pages | VERIFIED | `src/features/auth/components/github-auth-button.tsx` deleted (file not present; verified via `ls`). `grep -rn "github-auth-button\|GithubSignInButton" src` returns ZERO matches. `user-auth-form.tsx` (the only renderer) no longer imports or renders the button. The two view components (`sign-in-view.tsx`, `sign-up-view.tsx`) never rendered the button — they don't reference UserAuthForm either. |
| 3 | Sign-in and sign-up pages no longer issue an outbound fetch to `api.github.com/repos/...` on render | VERIFIED | `grep -rn "api.github.com" src` returns ZERO matches. Both auth page files are now sync server components (no `async function Page`, no `fetch`, no `stars` variable). Both view components no longer accept a `stars` prop. The `<Link>...Star on GitHub...{stars}</Link>` chrome block removed from both views. |

**Score:** 3/3 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/proxy.ts` | Active Next.js proxy middleware with expanded matcher + envelope short-circuit + email lock for both classes | VERIFIED | 50 lines; contains literal substrings `/api/(.*)`, `startsWith('/api/')`, `success: false`, `status: 401`, `ALLOWED_EMAIL = 'steve@bronstein.org'`. Existing matcher list `['/dashboard(.*)', '/api/(.*)']`. Email-lock branch fires for both path classes (lines 27-30 for `/api/*`, lines 37-39 for `/dashboard/*`). |
| `src/proxy.test.ts` | Two-layer verification — middleware behavior + route enumeration | VERIFIED | 198 lines; 5 describe blocks (A 401 envelope, B `/dashboard/*` auth.protect, C wrong-email redirect for BOTH classes, D `/auth/*` passthrough, E route-enumeration asserting `>=32` paths match `/^\/api\/(.*)/`). 8 tests, all passing in 149ms. |
| `src/app/auth/sign-in/[[...sign-in]]/page.tsx` | Sync server component, no fetch, no stars prop | VERIFIED | 11 lines; `export default function Page()` (sync); `return <SignInViewPage />` (no props); no `fetch`, no `stars`, no `try/catch`. |
| `src/app/auth/sign-up/[[...sign-up]]/page.tsx` | Sync server component, no fetch, no stars prop | VERIFIED | 11 lines; mirror of sign-in page; same shape. |
| `src/features/auth/components/sign-in-view.tsx` | View without stars prop, without Star-on-GitHub Link block, with preserved chrome | VERIFIED | 105 lines; `export default function SignInViewPage()` takes no props; no `stars` reference; no `Star on GitHub` text; no `GitHubLogoIcon` or `IconStar` import. Preserved: Random Dude blockquote (line 55), Logo SVG (lines 28-40), InteractiveGridPattern (lines 42-47), Login top-right Link (lines 16-24), ClerkSignInForm (line 61), open-source/View on GitHub/Terms/Privacy Link blocks (preserved per D-13). |
| `src/features/auth/components/sign-up-view.tsx` | View without stars prop, without Star-on-GitHub Link block, with preserved chrome | VERIFIED | 104 lines; mirror of sign-in-view; ClerkSignUpForm at line 61; identical chrome preservation. |
| `src/features/auth/components/user-auth-form.tsx` | UserAuthForm with GithubSignInButton import + render + divider removed | VERIFIED | 69 lines; no `github-auth-button` import; no `<GithubSignInButton />` render; no "Or continue with" divider. Form body preserved for Phase 4 broader cleanup per D-13. |
| `src/features/auth/components/github-auth-button.tsx` | DELETED entirely | VERIFIED | File does not exist (`ls` confirms absence; `git rm` recorded in commit 7290ee3). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `src/proxy.ts` | `@clerk/nextjs/server` | `clerkMiddleware, createRouteMatcher, auth()` | VERIFIED | Line 1 imports `clerkMiddleware`, `createRouteMatcher` from `@clerk/nextjs/server`. Line 9 wraps the handler in `clerkMiddleware`. Line 19 calls `await auth()` (no `.protect()`) for `/api/*`. Line 36 calls `await auth.protect()` for `/dashboard/*`. |
| `src/proxy.ts` | `next/server` | `NextResponse.json for /api/* 401`, `NextResponse.redirect for wrong-email` | VERIFIED | Line 2 imports `NextRequest, NextResponse` from `next/server`. Line 21-24 emits `NextResponse.json({success:false, error:'Unauthorized'}, {status:401})`. Lines 29 + 39 emit `NextResponse.redirect(new URL('/auth/sign-in', req.url))` for wrong-email sessions. |
| `src/proxy.test.ts` | `src/app/api/**/route.ts` | `glob enumeration via readdirSync in describe (E)` | VERIFIED | Lines 168-181 `listApiRoutes()` walks `src/app/api` via `readdirSync({withFileTypes:true})`, derives URL paths from `route.ts` files. Lines 184-197 assert `>= 32` paths and `/^\/api\/(.*)/.test(derived)` for each. |
| `src/app/auth/sign-in/[[...sign-in]]/page.tsx` | `src/features/auth/components/sign-in-view.tsx` | default import + `<SignInViewPage />` render | VERIFIED | Line 2 imports `SignInViewPage`; line 10 renders `<SignInViewPage />` with no props (matches the no-prop signature on the view). |
| `src/app/auth/sign-up/[[...sign-up]]/page.tsx` | `src/features/auth/components/sign-up-view.tsx` | default import + `<SignUpViewPage />` render | VERIFIED | Line 2 imports `SignUpViewPage`; line 10 renders `<SignUpViewPage />` with no props. |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full Vitest suite passes (no regressions to Phase 2's 79 tests; Phase 3 adds 8 proxy tests) | `npm run test:run` | 11 files / 87 tests passing in 5.17s | PASS |
| Proxy middleware tests pass independently | `npm run test:run -- src/proxy.test.ts` | 1 file / 8 tests passing in 149ms | PASS |
| No file `src/features/auth/components/github-auth-button.tsx` | `ls src/features/auth/components/github-auth-button.tsx` | "No such file or directory" | PASS |
| No `api.github.com` reference anywhere in `src/` | `grep -rn "api.github.com" src` | (no output) | PASS |
| No `Star on GitHub` text in auth components | `grep -rn "Star on GitHub" src/features/auth` | (no output) | PASS |
| No `GithubSignInButton` identifier in `src/` | `grep -rn "GithubSignInButton" src` | (no output) | PASS |
| Both auth pages are sync (CD-05) | `grep -n "async function Page" 'src/app/auth/sign-in/[[...sign-in]]/page.tsx' 'src/app/auth/sign-up/[[...sign-up]]/page.tsx'` | (no output) | PASS |
| /api/* route count >= 32 | `find src/app/api -name route.ts \| wc -l` | 32 | PASS |
| Build compile step succeeds (Phase 3 changes themselves compile cleanly) | `npm run build` | "Compiled successfully in 5.7s" before TS check fails on pre-existing prioritization.ts error (DI-01) | PASS (with documented pre-existing DI-01 — not a Phase 3 regression) |
| Preserved chrome present (D-13 boundary) | `grep -c "Random Dude\|InteractiveGridPattern\|ClerkSignInForm" src/features/auth/components/sign-in-view.tsx` | 5 (3 distinct strings, multiple matches) | PASS |

---

### Probe Execution

No project-defined probes (`scripts/*/tests/probe-*.sh`) exist in this codebase. The verification gate for SEC-A1 is the route-enumeration assertion in `src/proxy.test.ts` describe (E), which IS a probe-shaped check (it runs on every push via the Phase 2 husky pre-push hook and fails if a future `/api/*` route escapes the protected matcher). That check is exercised by `npm run test:run` above.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SEC-A1 | 03-01-PLAN.md | Add Clerk auth check / middleware matcher to every /api/* route (currently 0/34 authenticate) | SATISFIED | `src/proxy.ts:7` expands `createRouteMatcher` to include `/api/(.*)`. Middleware short-circuits with API-V1 envelope on `userId === null`. Verified by 8 proxy unit tests + route-enumeration assertion against 32 routes. |
| SEC-A2 | 03-02-PLAN.md | Remove no-op "Continue with GitHub" button + residual api.github.com star fetch on sign-in/up pages | SATISFIED | `github-auth-button.tsx` deleted; no caller references the identifier. Both auth pages converted to sync RSCs with no `fetch`. `stars` prop and `<Link>...Star on GitHub...{stars}</Link>` removed from both view components. |

No orphaned requirements: REQUIREMENTS.md maps Phase 3 to SEC-A1 + SEC-A2 only; both are covered by the two plans.

---

### Locked-Decision Audit (D-01..D-13, CD-01..CD-05)

| Decision | Outcome | Evidence |
|----------|---------|----------|
| **D-01** Rename `src/proxy.ts` → `src/middleware.ts` | DEVIATED (override accepted) | Executor discovered PD-01 was empirically wrong for Next.js 16.0.10 — `proxy.ts` IS the framework's active file convention (renaming triggers a deprecation warning). Kept the filename; applied all matcher + envelope edits in place. Documented in `deferred-items.md` DI-02 and 03-01-SUMMARY.md. Same security outcome achieved. |
| **D-02** Expand matcher to `['/dashboard(.*)', '/api/(.*)']` | HONORED | `src/proxy.ts:7` exactly: `createRouteMatcher(['/dashboard(.*)', '/api/(.*)'])`. |
| **D-03** Email lock applies to both `/dashboard/*` and `/api/*` | HONORED | `src/proxy.ts:27-30` (API branch) and `src/proxy.ts:37-39` (dashboard branch) both redirect non-`steve@bronstein.org` sessions to `/auth/sign-in`. `src/proxy.test.ts` describe (C) covers both. |
| **D-04** Verify Clerk's response shape on `/api/*`; if needed, add explicit 401 short-circuit | HONORED | Executor verified `auth.protect()` emits HTML redirect (wrong shape for CLI). Applied explicit `NextResponse.json` short-circuit per CD-02. |
| **D-05** Public `/auth/*` paths pass through | HONORED | `isProtectedRoute` only matches `/dashboard(.*)` + `/api/(.*)`. `src/proxy.test.ts` describe (D) asserts `auth.protect` is not called for `/auth/sign-in` or `/auth/sign-up`. |
| **D-06** No per-route `auth()` calls inside `src/app/api/**/route.ts` | HONORED | Phase 3 commits touched zero files under `src/app/api/`. Middleware is the single chokepoint. |
| **D-07** Two-layer verification (middleware unit test + route-enumeration assertion) | HONORED | `src/proxy.test.ts` describe (A-D) is layer 1; describe (E) is layer 2. 8 tests, all passing. |
| **D-08** Do NOT add per-route HTTP-level sweep test | HONORED | No per-route handler imports in `src/proxy.test.ts`. |
| **D-09** Use Phase 2 Vitest harness as-is | HONORED | No vitest.config.ts edits; colocated `src/proxy.test.ts`; node env (default); no PGlite. |
| **D-10** Delete `github-auth-button.tsx` outright | HONORED | File does not exist; commit `7290ee3` is a `git rm` recorded by the 03-02 executor. |
| **D-11** Remove `try { fetch(api.github.com) } catch ...` from both auth page.tsx files | HONORED | Both pages now 11 lines, no `fetch`, no `try`/`catch`. |
| **D-12** Remove `stars` prop + `<Link>...Star on GitHub...{stars}</Link>` block from both view components | HONORED | `grep` for `stars` and `Star on GitHub` in both view files returns no matches. |
| **D-13** Do NOT touch other auth-page chrome (Random Dude, Logo SVG, interactive-grid, Login link) | HONORED | All four items present in both view components (verified by grep). The two trailing `<Link>` blocks for `/about` and `https://github.com/...next-shadcn-dashboard-starter` "View on GitHub" also preserved (D-13 explicitly leaves them). |
| **CD-01** Use `git mv` for proxy.ts rename | N/A | Rename was reverted (override). The executor used in-place edits on `src/proxy.ts`. |
| **CD-02** Explicit envelope short-circuit vs Clerk default | EXPLICIT chosen | `NextResponse.json({success:false, error:'Unauthorized'}, {status:401})` for `/api/*`. CLI consumers see the envelope on every response. |
| **CD-03** One commit vs two for proxy edits | ONE COMMIT | `c15a4d5 feat(03-01): activate /api/* clerk auth gate with envelope-preserving 401` covers the matcher expansion + envelope short-circuit + email-lock changes. |
| **CD-04** `git rm` vs leave empty file for github-auth-button.tsx | `git rm` chosen | Commit `7290ee3` records the deletion. |
| **CD-05** Convert auth `page.tsx` files from async to sync | HONORED | Both pages are now `export default function Page()` (sync). |

**Locked-decision result:** 12/13 D-decisions honored; D-01 deviated with override (executor's call was correct — see DI-02). All 5 CD-decisions resolved per recommendations (with CD-01 N/A because the rename it concerns was reverted).

---

### Threat Model Coverage

Plan 03-01 covered T1, T2, T3, T6. Plan 03-02 covered T4, T5, T6. All six threats verified mitigated:

| Threat ID | Description | Status | Evidence |
|-----------|-------------|--------|----------|
| T1 | Auth bypass on 0/32 `/api/*` routes | MITIGATED | Matcher expansion + envelope short-circuit in `src/proxy.ts`. Verified by describe (A) in proxy tests. |
| T2 | Wrong-email session reaches `/api/*` | MITIGATED | Email-lock branch fires for `/api/*` (proxy.ts:27-30) and `/dashboard/*` (lines 37-39). Verified by describe (C). |
| T3 | Matcher drift — new route escapes pattern | MITIGATED | Route-enumeration assertion in describe (E). Husky pre-push runs `npm run test:run`. |
| T4 | SSR fetch to `api.github.com` on auth render | MITIGATED | `grep -rn "api.github.com" src` returns no matches. |
| T5 | No-op GithubSignInButton presents fake auth control | MITIGATED | File deleted; identifier eradicated from `src/`. |
| T6 | Information disclosure via HTML redirect / dead chrome | MITIGATED | Explicit JSON 401 envelope for `/api/*`; `<Link>...Star on GitHub...{stars}</Link>` block removed from both views. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/features/job-leads/lib/prioritization.ts` | 70 | TS error: `MapIterator` iteration requires `--target es2015` or `--downlevelIteration` (DI-01) | Info | Pre-existing on Phase 3 base commit (1c69a7e); introduced by commit 8562eba (job-leads feature). NOT a Phase 3 regression. Blocks `npm run build` exit-0 but does NOT block `npm run test:run` or `next dev`. Carry to Phase 4 (tsconfig modernization). |

No new anti-patterns introduced by Phase 3. No TBD/FIXME/XXX markers added.

---

### Human Verification

None required for goal achievement. The verification gates are:

1. **Automated** — `npm run test:run` (87/87 passing) including `src/proxy.test.ts` (8/8) with route-enumeration assertion against 32 routes.
2. **Pre-push hook** — husky runs `npm run test:run` on every push; matcher drift will fail the pre-push gate.
3. **Smoke (optional, NOT required for PASS)** — Manual sanity check could load `/auth/sign-in` and `/auth/sign-up` in `npm run dev` and confirm DevTools Network panel shows zero outbound to `api.github.com` (informational; the automated grep gate is the binding check).

---

### Gaps Summary

No gaps blocking the phase goal.

**Notable observations:**

1. **D-01 (rename to `src/middleware.ts`) was bypassed** with a documented Rule-4 architectural call by the executor. The verifier accepts this via the `overrides` frontmatter entry above. Rationale: PD-01 was empirically wrong for Next.js 16.0.10 (the framework's proxy file convention loads `src/proxy.ts` natively; renaming triggers a deprecation warning). The matcher expansion + envelope short-circuit was applied in place, achieving the SAME security outcome demanded by SEC-A1. Verified by 8 passing proxy unit tests and a route-enumeration assertion against 32 routes.

2. **DI-01 (pre-existing TS error in `prioritization.ts`)** blocks `npm run build` exit-0 on the baseline. Verified pre-existing by inspecting the file at Phase 3 base commit (`1c69a7e`) and tracing the offending line back to commit `8562eba` (the original job-leads feature). Phase 3 made no edits to `prioritization.ts`. Not a Phase 3 regression. Recommended fix is one-line (bump tsconfig target to ES2015+ or `Array.from(byContact.values())`); deferred to Phase 4 or a dedicated tsconfig modernization pass per `deferred-items.md`.

3. **Route count is 32, not 34** as ROADMAP SC #1 states. Documented in CONTEXT.md PD-01 as a slight overcount. The contract being enforced is "all `/api/*` routes", not a specific integer; the test asserts `>= 32` to future-proof against route additions while still catching matcher drift.

---

_Verified: 2026-05-12T21:20:00Z_
_Verifier: Claude (gsd-verifier)_
