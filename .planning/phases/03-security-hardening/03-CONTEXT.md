# Phase 3: Security Hardening - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning
**Mode:** `--auto` (Claude auto-selected recommended option for every gray area; log appended at bottom)

<domain>
## Phase Boundary

Authenticate every `/api/*` route with a valid Clerk session enforcing the single-user email lock, and strip the two starter-template auth artifacts that leak third-party network calls into the auth pages.

**In scope:**
- SEC-A1: Every `/api/*` route returns 401 (or a redirect) when called without a valid Clerk session. Enforcement is at the Next.js middleware layer, not per-route.
- SEC-A1: Same `steve@bronstein.org` email lock that protects `/dashboard/*` is applied to `/api/*`.
- SEC-A2: Delete `src/features/auth/components/github-auth-button.tsx` and remove every rendered reference to it (sign-in-view, sign-up-view).
- SEC-A2: Remove the `https://api.github.com/repos/kiranism/...` fetch from `src/app/auth/sign-in/[[...sign-in]]/page.tsx` and `src/app/auth/sign-up/[[...sign-up]]/page.tsx`, plus the `stars` prop it feeds.
- Automated test (per Phase 3 SC #1) that proves the gate fires for unauthenticated requests against the API surface.

**Out of scope (deferred to other phases):**
- Other starter-template residue (`infobar.tsx`, `__CLEANUP__/`, `products/`, `exclusive/`, `workspaces/`, `billing/`, the no-op kanban, demo-form, user-auth-form) — Phase 4 (Starter-Template Cleanup) owns DEBT-A1..A5.
- Other auth-page starter chrome that is not a network leak or fake auth control (the "Random Dude" quote, the placeholder `Logo` SVG, the `interactive-grid` decoration, the `Login` top-right link) — visual cleanup is not a security concern and stays untouched this phase.
- LinkedIn cookie file (`~/.heimdall/linkedin-profile/storage-state.json`) handling — local-dev only path, already documented in CONCERNS.md; addressed by Phase 5 (Job Leads Completion) if at all.
- Rotating or scoping any actual Clerk-side configuration (OAuth providers, session lifetimes) — Clerk is the source of truth; this phase only adds enforcement on the Next.js side.
- Rate limiting, CSRF, audit logging, security headers — not requested in SEC-A1/SEC-A2 and not in Phase 3 success criteria.

</domain>

<decisions>
## Implementation Decisions

### Critical Pre-Discovery (anchor the whole phase here)

- **PD-01:** `src/proxy.ts` is **not currently loaded by Next.js**. Next.js convention requires the file to be named `middleware.ts` at the project root or under `src/`. A repo-wide search confirms there is no `middleware.ts` anywhere; the only `clerkMiddleware()` invocation lives in `src/proxy.ts`, which is dead code as far as the framework is concerned. This means the claim throughout PROJECT.md / ARCHITECTURE.md / CLAUDE.md that "Clerk middleware enforces the single-user email lock on `/dashboard`" is currently **inaccurate** — `/dashboard/*` is enforced only by page-level `auth()` calls in `src/app/page.tsx` and `src/app/dashboard/page.tsx`, and individual `/dashboard/<feature>/page.tsx` RSCs may or may not check. This discovery reframes the whole phase: SEC-A1 is not "extend the existing middleware" — it is "activate the middleware for the first time, then expand its scope to `/api/*`."
- **PD-02:** Existing dashboard auth still works because of the redirect chain in `src/app/page.tsx` (root → sign-in if no session) and `src/app/dashboard/page.tsx` (overview → sign-in if no session). After this phase those page-level redirects become belt-and-suspenders behind the now-active middleware; they are NOT removed in Phase 3 (out of scope — leave for any future hardening).

### Enforcement Strategy

- **D-01:** Rename `src/proxy.ts` → `src/middleware.ts`. This is the single highest-leverage change in the phase. After the rename, Next.js auto-loads the file and the existing matcher (`'/(api|trpc)(.*)'` + `/((?!_next|...).*)`) starts firing for the first time. No new file needed; preserve git history via `git mv`.
- **D-02:** Expand the protected-route matcher inside `clerkMiddleware()` from `['/dashboard(.*)']` to `['/dashboard(.*)', '/api/(.*)']`. Both `/dashboard/*` and `/api/*` now go through `auth.protect()` + the `steve@bronstein.org` email check.
- **D-03:** Email lock applies to **both** route classes equally. The CLI consumes the API surface using Steve's Clerk session token; multi-user is explicitly out-of-scope (CLAUDE.md, PROJECT.md). API requests carrying a session for any other email get redirected to `/auth/sign-in`, same as `/dashboard/*`.
- **D-04:** For API routes, an unauthenticated request returns Clerk's default 401-style response from `auth.protect()` (HTTP 404 or 401 depending on Clerk's `protect()` behavior in Next.js 16 — Clerk emits a redirect to sign-in by default, which for `/api/*` should be a 401 or an immediate redirect). Planner should verify the exact response code Clerk emits and, if needed, add an explicit `if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })` for API routes so the envelope shape stays `{ success: false, error }` per API-V1 contract.
- **D-05:** Public auth pages (`/auth/sign-in/*`, `/auth/sign-up/*`) MUST remain reachable without a session. The existing matcher already excludes static assets but **not** `/auth/*`. The negative matcher pattern currently catches everything except `_next` and static-file extensions; the explicit protected list inside `clerkMiddleware` is what scopes enforcement. Since the protected list is `[dashboard, api]` only, `/auth/*` passes through unblocked. No matcher edit needed; just confirm it during implementation.
- **D-06:** Do NOT add per-route `auth()` calls inside `src/app/api/**/route.ts`. Middleware is the single chokepoint. Per-route checks would create 32+ places where the lock could drift, and the existing helper layer (`src/lib/api/types.ts`, `src/lib/api/errors.ts`) does not currently expose a `requireAuth()` helper — adding one is unnecessary if middleware handles enforcement.

### Verification Strategy (Phase 3 SC #1 — "automated test against all 34 routes")

- **D-07:** Verification has **two layers**, both required to call SEC-A1 done:
  1. **Middleware unit test** (one test file, e.g. `src/middleware.test.ts`). Imports the default export from `src/middleware.ts`, constructs `NextRequest` instances for representative API + dashboard paths with no Clerk session and asserts the middleware returns a 401 / sign-in redirect response. Uses `vi.mock('@clerk/nextjs/server')` to stub `auth.protect()` behavior. This is the deterministic core test — middleware is the chokepoint.
  2. **Route-enumeration assertion** (one test). Globs `src/app/api/**/route.ts`, builds the list of all API paths, and asserts that every path matches the protected-route matcher pattern from `src/middleware.ts`. This catches the failure mode where the matcher list drifts from the actual route surface. Number of routes today: **32** (not 34 — the ROADMAP figure of 34 was a slight overcount; the planner should treat "all `/api/*` routes" as the contract, not a specific integer).
- **D-08:** Do NOT attempt a per-route HTTP-level sweep test that imports each `route.ts` and calls each verb. Middleware runs at the edge **before** route handlers; a per-route unit test would have to mock the middleware to even reach the handler, which defeats the point. The two tests in D-07 satisfy SC #1.
- **D-09:** Use the existing Phase 2 test harness (Vitest, colocated `*.test.ts`, no PGlite for these tests since they don't touch the DB). No new harness work needed.

### Starter-Template Auth Artifact Removal (SEC-A2)

- **D-10:** Delete `src/features/auth/components/github-auth-button.tsx` outright (the entire file). It is the no-op "Continue with GitHub" button referenced in Phase 3 SC #2 and CONCERNS.md §"Security Considerations". Remove the rendered `<GithubSignInButton />` invocation from `src/features/auth/components/sign-in-view.tsx` (line ~63, per CONCERNS.md) and `src/features/auth/components/sign-up-view.tsx`.
- **D-11:** Remove the `try { fetch('https://api.github.com/repos/...') } catch ...` block from both `src/app/auth/sign-in/[[...sign-in]]/page.tsx` and `src/app/auth/sign-up/[[...sign-up]]/page.tsx`. After removal, both pages render synchronously with no outbound network call beyond the standard Clerk SDK calls.
- **D-12:** Remove the `stars` prop entirely from `SignInViewPage` and `SignUpViewPage`. Once `stars` is dead, also delete the `<Link href='https://github.com/kiranism/next-shadcn-dashboard-starter'>... {stars} ...</Link>` block in both view components — it exists solely to render the now-removed prop, and leaving it as dead chrome creates a TypeScript error (unused prop / unbound interpolation). This is the minimum complete change to satisfy SC #3 ("no outbound fetch to `api.github.com` on render").
- **D-13:** Do NOT touch other auth-page chrome (Random Dude quote, placeholder `Logo` SVG, `interactive-grid` decoration, `Login` top-right link). They are starter residue but not network leaks and not fake auth controls. They survive Phase 3; Phase 4 (or a follow-on) can decide whether to scrub them.

### Claude's Discretion

- **CD-01:** Whether to use `git mv src/proxy.ts src/middleware.ts` (preserves history) vs `git rm` + `git add` (cleaner diff but loses blame). Recommended: `git mv`.
- **CD-02:** Whether to add an explicit `NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })` short-circuit at the top of the `clerkMiddleware` callback for `/api/*` paths so the envelope shape is preserved (consistent with API-V1 in PROJECT.md) — OR rely on Clerk's default redirect/401 behavior. The planner should verify Clerk's default response shape for unauthenticated `/api/*` calls in Next.js 16 and pick the option that yields `{ success: false, error }` for the CLI consumer. Recommended default: explicit short-circuit, since the CLI is documented to expect the envelope on every response.
- **CD-03:** Whether to commit `git mv` and matcher expansion as one commit or two. Recommended: one — they are a single logical change ("activate and expand middleware").
- **CD-04:** Whether to delete the empty `src/features/auth/components/github-auth-button.tsx` file via `git rm` vs leave it as an empty file. Recommended: `git rm` — there is no caller after D-10 lands.
- **CD-05:** Whether the auth-pages-page-files (`sign-in/[[...sign-in]]/page.tsx`, `sign-up/[[...sign-up]]/page.tsx`) should remain `async` after the `await fetch` is removed. Recommended: convert both to non-`async` server components since they have no remaining awaited work; minor diff cleanup.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §"SEC-A1, SEC-A2" — Acceptance criteria for this phase.
- `.planning/ROADMAP.md` §"Phase 3: Security Hardening" — Goal + 3 success criteria.
- `.planning/PROJECT.md` §"Constraints", §"Key Decisions" — Single-user lock, no server actions, CLI parity.

### Codebase Maps (read before designing the gate)
- `.planning/codebase/ARCHITECTURE.md` §"Entry Points → Clerk Middleware (`src/proxy.ts`)" — Lists `src/proxy.ts` as the middleware, but PD-01 contradicts this; planner should treat the architecture note as **aspirational, not current**. The architecture doc will need a follow-up correction after Phase 3 lands.
- `.planning/codebase/CONCERNS.md` §"Security Considerations → No Authentication on Any API Route" — Current-state description of the auth gap; names the recommended fix ("`middleware.ts` using Clerk's `clerkMiddleware()`").
- `.planning/codebase/CONCERNS.md` §"Security Considerations → Starter Template GitHub Auth Button Is a No-Op" — Names `github-auth-button.tsx` line 16.
- `.planning/codebase/CONCERNS.md` §"Security Considerations → External Fetch on Auth Pages" — Names both sign-in/sign-up page.tsx files (lines 10–26).

### Prior Phase Context (decisions to carry forward)
- `.planning/phases/02-test-infrastructure/02-CONTEXT.md` §"Deferred Ideas → Auth-gate test sweep" — Phase 2 explicitly handed off SC #1 verification to this phase. D-08 in 02-CONTEXT.md confirms that pure-logic tests do NOT need PGlite; D-09 documents the single-config + `@vitest-environment` pragma pattern; the middleware test in D-07 above follows that pattern (node environment, no PGlite).

### Source Files (under modification)
- `src/proxy.ts` — File to rename to `src/middleware.ts` and expand. Currently contains `clerkMiddleware` callback and matcher config.
- `src/app/auth/sign-in/[[...sign-in]]/page.tsx` — Strip the `api.github.com` fetch + `stars` prop pass.
- `src/app/auth/sign-up/[[...sign-up]]/page.tsx` — Same as sign-in.
- `src/features/auth/components/sign-in-view.tsx` — Remove `<GithubSignInButton />` render, `stars` prop, `<Link>...Star on GitHub...</Link>` block.
- `src/features/auth/components/sign-up-view.tsx` — Same as sign-in-view.
- `src/features/auth/components/github-auth-button.tsx` — **Delete entirely.**

### Reference for Verification Test
- `src/app/api/` — 32 route.ts files; glob target for D-07's enumeration test.
- `vitest.config.ts` — Phase 2 config, no edits expected.
- `package.json` — `test:run` script exists from Phase 2; the husky pre-push hook already runs it.

### Coding Conventions
- `CLAUDE.md` — TypeScript strict mode, named exports, no server actions, all mutations through `/api/*`.
- `.planning/codebase/CONVENTIONS.md` — Naming patterns, response envelope shape `{ success, data, error, meta }` (relevant to D-04/CD-02 — preserve envelope on 401).

### External Reference
- Clerk docs for Next.js 16 `clerkMiddleware()` + `auth.protect()` behavior on API routes (planner/researcher to confirm: does `auth.protect()` emit 401 JSON or a redirect for `/api/*`? Drives CD-02 default).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/proxy.ts` — Already contains a working `clerkMiddleware()` callback. The only change to its body is expanding the protected-route matcher list (D-02); the file itself just needs to be renamed (D-01).
- Phase 2 test harness — Vitest + colocated `*.test.ts` pattern is already in place; this phase reuses it without modification.

### Established Patterns
- **API envelope `{ success, data, error, meta }`** is a contract per API-V1 (PROJECT.md) — the 401 response from middleware must match (drives CD-02).
- **Page-level `auth()` checks** exist in `src/app/page.tsx` and `src/app/dashboard/page.tsx`. After Phase 3 these become belt-and-suspenders; PD-02 explicitly leaves them in place.
- **Clerk single-user email lock pattern** is already implemented in `src/proxy.ts`. Just needs to be extended to API routes (D-03).

### Integration Points
- **Middleware → all `/api/*` routes:** After D-01 + D-02, every API route is gated. No edits to individual `route.ts` files required.
- **Sign-in / sign-up pages → view components:** Both auth pages currently pass `stars` to their view component. After D-11/D-12, the page files become trivial RSCs that just render the Clerk form view; the view components lose one prop and one `<Link>` block each.
- **`__CLEANUP__/clerk/`** — exists at repo root per CONCERNS.md §"Tech Debt → `__CLEANUP__`"; not relevant this phase (Phase 4 deletes `__CLEANUP__/` under DEBT-A4).

### What the Planner Does NOT Need to Research
- Whether to add a `requireAuth()` helper to `src/lib/api/` (D-06 — no, middleware-only).
- Whether to use middleware vs per-route enforcement (D-01..D-06 lock middleware).
- Test harness setup (Phase 2 already shipped Vitest).

### What the Planner DOES Need to Research / Decide
- Exact response Clerk emits for `auth.protect()` on `/api/*` in Next.js 16 — JSON 401, HTML redirect, or both? Drives CD-02.
- Whether `src/proxy.ts` is referenced anywhere outside the file itself (build config, imports). A `grep -rn "proxy"` across the repo turned up no callers, but a final sanity check during planning is worth the 30 seconds.
- Whether renaming `src/proxy.ts` → `src/middleware.ts` triggers any pre-existing lint, format, or Husky hook (it should not, but verify).

</code_context>

<specifics>
## Specific Ideas

- The middleware test (D-07 layer 1) should live at `src/middleware.test.ts` to colocate with the source. Two `describe` blocks: one for "unauthenticated `/api/*`" (asserts 401 or sign-in redirect), one for "wrong-email session" (asserts redirect to sign-in). Stub Clerk via `vi.mock('@clerk/nextjs/server')` and return a fake `auth.protect()` behavior; or, more practically, test that `clerkMiddleware`'s callback returns the expected `NextResponse` shape given a constructed `NextRequest`.
- The route-enumeration assertion (D-07 layer 2) can live in the same file as a third `describe` block: glob `src/app/api/**/route.ts`, derive the URL pattern, assert each pattern matches `/api/(.*)`. Cheap and discoverability-friendly.
- If Clerk's `auth.protect()` returns an HTML redirect for `/api/*` (rather than a JSON 401), the planner should add a short-circuit in the middleware callback: detect `/api/*` path and explicitly emit `NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })`. This preserves the API-V1 envelope for CLI consumers (CD-02 recommended default).
- After D-10..D-13 land, both sign-in/sign-up `page.tsx` should be one-liners: `export default function Page() { return <SignInViewPage />; }`. Minor diff cleanup (CD-05).

</specifics>

<deferred>
## Deferred Ideas

- **Codebase-wide CSRF / security headers audit** — `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`, etc. Not in SEC-A1/SEC-A2; deferred to a future security pass if Heimdall ever leaves single-user.
- **Rate limiting** — single-user app, low priority; not in scope.
- **API audit logging** — separate from `logTimeline()` (which is domain-event logging, not security logging); not requested.
- **Architecture doc correction** — `.planning/codebase/ARCHITECTURE.md` §"Entry Points → Clerk Middleware (`src/proxy.ts`)" and `CLAUDE.md` "Single-user Clerk lock in middleware" both describe the middleware as if it were currently active. After Phase 3 lands, both should be updated to reflect the rename + scope expansion. Owned by the post-phase doc-update step, not this phase's implementation.
- **`src/app/dashboard/<feature>/page.tsx` audit** — verify that page-level `auth()` checks exist (or don't) on individual dashboard pages. With middleware active, this becomes a defense-in-depth question, not a correctness one. Deferred.
- **LinkedIn cookie file at `~/.heimdall/linkedin-profile/`** (CONCERNS.md §"Security Considerations" item 2) — local-dev only path, not a production security concern; Phase 5 (Job Leads) may revisit when reworking the scraper.
- **Auth-page visual chrome scrub** — Random Dude quote, placeholder Logo, `interactive-grid`, `Login` top-right link, `Star on GitHub` link text. Not security concerns; not named in SEC-A2. Phase 4 or a follow-on cleanup phase may handle.
- **Removing page-level `auth()` redirect in `src/app/page.tsx` and `src/app/dashboard/page.tsx`** after middleware is active — they become redundant. Belt-and-suspenders for now (PD-02).

</deferred>

---

## --auto Discussion Log

For each gray area surfaced during analysis, Claude auto-selected the recommended option:

- **[auto] Enforcement layer** — Q: "Middleware vs per-route auth?" → Selected: "Middleware (single chokepoint)" (recommended). Reason: 32 route files; per-route drift risk; PD-01 shows the middleware needs to be activated anyway.
- **[auto] Email lock on `/api/*`?** — Q: "Apply `steve@bronstein.org` lock to API too, or just any session?" → Selected: "Same email lock" (recommended). Reason: CLI parity uses Steve's session; multi-user is OOS per CLAUDE.md/PROJECT.md.
- **[auto] Verification strategy** — Q: "How to satisfy SC #1's '34 routes' contract?" → Selected: "Middleware unit test + route-enumeration assertion" (recommended). Reason: middleware is the chokepoint; per-route HTTP sweep would have to mock middleware to reach handlers, defeating the point.
- **[auto] Starter-auth cleanup scope** — Q: "Surgical (SEC-A2 only) vs sweep auth-page chrome?" → Selected: "Surgical" (recommended). Reason: Phase 4 owns broader cleanup; SEC-A2 names two specific artifacts.
- **[auto] `stars` prop fate** — Q: "Keep prop with hardcoded value vs remove prop and Link block entirely?" → Selected: "Remove prop and the dead `<Link>...Star on GitHub...</Link>` block" (recommended). Reason: minimum complete change after removing the fetch; TS would otherwise warn on dead prop.
- **[auto] Rename `proxy.ts` → `middleware.ts`?** — Q: "Activate the dead middleware file via rename, or leave it and add a new file?" → Selected: "Rename (`git mv`)" (recommended). Reason: preserves git history; single-file change; existing matcher config is correct.

---

*Phase: 3-Security Hardening*
*Context gathered: 2026-05-12*
