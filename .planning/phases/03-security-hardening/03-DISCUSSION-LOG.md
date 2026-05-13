# Phase 3: Security Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-12
**Phase:** 3-Security Hardening
**Mode:** `--auto` (Claude auto-selected the recommended option for every gray area; no interactive AskUserQuestion calls were issued)
**Areas discussed:** Enforcement layer, Email lock scope, Verification strategy, Starter-auth cleanup scope, `stars` prop fate, `proxy.ts` → `middleware.ts` rename

---

## Enforcement Layer (middleware vs per-route)

| Option | Description | Selected |
|--------|-------------|----------|
| A: Middleware-only | Rename `src/proxy.ts` → `src/middleware.ts`, expand matcher to `[/dashboard(.*), /api/(.*)]`. Single chokepoint. | ✓ |
| B: Per-route `auth()` calls | Add a Clerk `auth()` check at the top of each of 32 `route.ts` files (or via a `requireAuth()` helper in `src/lib/api/`). | |
| C: Hybrid | Middleware for the session check; per-route for the email lock. | |

**Auto-selected:** A — Middleware-only.
**Reason:** 32 route files; per-route enforcement creates drift risk. The existing `clerkMiddleware()` file is already authored and just needs to be activated (per PD-01 — the file is misnamed and not currently loaded by Next.js).

---

## Email Lock Scope (api routes too?)

| Option | Description | Selected |
|--------|-------------|----------|
| A: Same email lock | `steve@bronstein.org` lock applies to both `/dashboard/*` and `/api/*`. | ✓ |
| B: Session-only on `/api/*` | Any authenticated Clerk session passes; only `/dashboard/*` enforces the email. | |

**Auto-selected:** A — Same email lock.
**Reason:** CLI parity uses Steve's Clerk session; multi-user is out-of-scope per CLAUDE.md / PROJECT.md / REQUIREMENTS.md.

---

## Verification Strategy (Phase 3 SC #1)

| Option | Description | Selected |
|--------|-------------|----------|
| A: Middleware unit test + route-enumeration assertion | One Vitest file: mocks Clerk, asserts middleware returns 401/redirect for unauthenticated `/api/*` and `/dashboard/*` requests; separately globs `src/app/api/**/route.ts` and asserts every path matches the protected-route matcher. | ✓ |
| B: Per-route HTTP sweep | Dynamically import every `route.ts`, simulate a `NextRequest` with no Clerk session, assert each handler/middleware returns 401. | |
| C: Single-route smoke | Pick one representative route, assert middleware rejects it. Manual verification for the rest. | |

**Auto-selected:** A — Middleware unit test + route-enumeration assertion.
**Reason:** Middleware is the chokepoint after D-01; per-route tests would have to mock middleware to even reach the handler, which defeats the point. Enumeration + chokepoint test together satisfy SC #1's "automated test against all routes" contract.

---

## Starter-Auth Cleanup Scope (SEC-A2)

| Option | Description | Selected |
|--------|-------------|----------|
| A: Surgical | Delete only what SEC-A2 names: GitHub button + `api.github.com` fetch + dead `stars` prop + the `Star on GitHub` Link block (dead after prop removal). | ✓ |
| B: Sweep auth-page chrome | Also delete the "Random Dude" quote, placeholder `Logo` SVG, `interactive-grid` background, `Login` top-right link. | |

**Auto-selected:** A — Surgical.
**Reason:** Phase 4 (Starter-Template Cleanup) owns DEBT-A1..A5; the un-named auth-page chrome is starter residue but not a security concern. Stay narrow.

---

## `stars` Prop Fate

| Option | Description | Selected |
|--------|-------------|----------|
| A: Remove prop + dead `<Link>` block | Drop `stars` from both view component signatures; delete the `<Link>...Star on GitHub...{stars}</Link>` block in both view components since it exists solely to render the now-removed prop. | ✓ |
| B: Hardcode `stars = 0` | Keep the prop with a hardcoded literal value, leave the Link block. | |
| C: Keep Link, remove count | Keep the Link block with static text, remove only the `{stars}` interpolation. | |

**Auto-selected:** A — Remove prop and dead block.
**Reason:** Minimum complete change after removing the fetch. Leaving the dead Link block creates a TypeScript / lint warning and the block has no purpose without the count.

---

## Rename `src/proxy.ts` → `src/middleware.ts`

| Option | Description | Selected |
|--------|-------------|----------|
| A: `git mv` rename | Preserves git history via `git mv`. Single-file change; existing matcher config is already correct after the D-02 expansion. | ✓ |
| B: Add new `middleware.ts`, delete `proxy.ts` | Two-file diff; loses blame on the matcher config. | |
| C: Leave `proxy.ts`, register it some other way | Next.js does not support custom middleware file paths — this is not actually viable, listed only to document why it was not picked. | |

**Auto-selected:** A — `git mv`.
**Reason:** Preserves history. Documented in CONCERNS.md's recommended fix path. Activates the existing dead file (per PD-01).

---

## Claude's Discretion

Documented in CONTEXT.md under "Claude's Discretion":

- **CD-01:** Use `git mv` (vs `rm` + `add`) — locked by selection above.
- **CD-02:** Whether middleware emits an explicit `NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })` for `/api/*` paths (preserves API-V1 envelope) or relies on Clerk's default response. **Planner must verify Clerk's behavior in Next.js 16.** Recommended default: explicit short-circuit.
- **CD-03:** Single commit vs two commits for rename + matcher expansion — recommended single (one logical change).
- **CD-04:** `git rm` the deleted `github-auth-button.tsx` (no caller remains).
- **CD-05:** Convert both auth `page.tsx` files from `async` to sync after the `await fetch` is removed.

---

## Deferred Ideas

Captured in CONTEXT.md `<deferred>`:

- Codebase-wide CSRF / security headers audit
- Rate limiting
- API audit logging (distinct from `logTimeline()`)
- Architecture doc correction post-phase (`.planning/codebase/ARCHITECTURE.md` and `CLAUDE.md` describe the middleware as if active — update after the phase lands)
- `src/app/dashboard/<feature>/page.tsx` defense-in-depth audit (no longer correctness-critical once middleware is active)
- LinkedIn cookie file security (Phase 5 concern, local-dev only)
- Auth-page visual chrome scrub (Phase 4 or follow-on)
- Removing the now-redundant page-level `auth()` redirects in `src/app/page.tsx` and `src/app/dashboard/page.tsx`

---

*Generated under `--auto` mode — no interactive prompts issued.*
