# Codebase Concerns

**Analysis Date:** 2026-05-12

---

## Known Bugs

**React Hydration Crash — Kills All Navigation (ACTIVE, documented in `bug.md`):**
- Symptoms: After LinkedIn import of ~1500 contacts, sidebar nav links become unclickable; React hydration error crashes the client-side tree; user is stuck on Networking page
- Files: `src/components/layout/app-sidebar.tsx` (lines 148–154, 166–172), `src/components/user-avatar-profile.tsx` (line 19)
- Trigger: `useUser()` from Clerk returns `undefined` on the server and a user object on the client; the `{user && <UserAvatarProfile />}` guard causes a server/client HTML mismatch; `UserAvatarProfile` was also wrapping content in a `<div>` inside a `<button>` (invalid HTML), though `user-avatar-profile.tsx` now uses `<span>`
- Current state: `user-avatar-profile.tsx` root element has been changed to `<span>`, but `app-sidebar.tsx` still conditionally renders `user && ...` at lines 148 and 166 — the root hydration guard is unresolved
- Fix: Remove the `{user && ...}` guard in `app-sidebar.tsx` and render `UserAvatarProfile` unconditionally (it already handles `user === null` via optional chaining)

**Unsafe `emailAddresses[0]` Array Access:**
- Symptoms: Runtime crash if a Clerk user object has no email addresses (edge case: SSO-only accounts)
- Files: `src/components/user-avatar-profile.tsx` (line 31), `src/components/layout/user-nav.tsx` (line 38)
- Trigger: `user?.emailAddresses[0].emailAddress` — optional chaining protects `user` but not the `[0]` access
- Fix: Change to `user?.emailAddresses[0]?.emailAddress || ''`

---

## Security Considerations

**No Authentication on Any API Route:**
- Risk: All `/app/api/` routes are publicly accessible — no `auth()` / `getAuth()` / `currentUser()` call exists in any route handler; there is also no `middleware.ts` to protect routes at the Next.js layer
- Files: All 31 route files under `src/app/api/` — confirmed by grep finding zero auth imports in route handlers; no `src/middleware.ts` or `middleware.ts` exists
- Current mitigation: None. This is a personal single-user app on a private Vercel deployment, which reduces exposure, but the database is fully accessible to anyone who can reach the deployment URL
- Recommendation: Add a `middleware.ts` using Clerk's `clerkMiddleware()` to protect all `/api/*` and `/dashboard/*` routes; alternatively add `auth()` checks to routes that mutate data

**LinkedIn Session Credentials Stored on Filesystem:**
- Risk: The LinkedIn Playwright scraping flow saves browser cookies/storage as `~/.heimdall/linkedin-profile/storage-state.json` — this file contains LinkedIn session cookies that would allow impersonation if leaked
- Files: `src/features/job-leads/lib/linkedin-browser.ts` (lines 69–70, 86–87, 120–123)
- Current mitigation: File is on local filesystem (not in the repo), but Vercel/serverless deployment would not have access to `homedir()` anyway — see Vercel incompatibility concern below
- Recommendation: Acknowledge and document that this feature is local-dev only; add a `.gitignore` entry for `~/.heimdall/` if scripts ever reference it

**Starter Template GitHub Auth Button Is a No-Op:**
- Risk: `GithubSignInButton` renders a "Continue with Github" button that only calls `console.log()` — if a user tries this on the sign-in page they receive no feedback and no auth occurs; could mislead users about available auth methods
- Files: `src/features/auth/components/github-auth-button.tsx` (line 16), rendered in `src/features/auth/components/sign-in-view.tsx` (line 63) and `sign-up-view.tsx`
- Recommendation: Remove the button or implement proper Clerk OAuth for GitHub

**External Fetch on Auth Pages (Starter Template Residue):**
- Risk: Sign-in and sign-up pages make an outbound fetch to `https://api.github.com/repos/kiranism/next-shadcn-dashboard-starter` on every server render to display a star count for a third-party repo; this is pure starter template noise and adds latency to auth page rendering
- Files: `src/app/auth/sign-in/[[...sign-in]]/page.tsx` (lines 10–26), `src/app/auth/sign-up/[[...sign-up]]/page.tsx` (lines 10–26)
- Recommendation: Remove the `stars` fetch; remove the `stars` prop from `SignInViewPage` / `SignUpViewPage`

---

## Tech Debt

**Entire Starter Template Product Feature Unreferenced by App:**
- Issue: `src/features/products/` (product listing, product form, demo data) exists from the Next.js Shadcn dashboard starter and has nothing to do with the job-search CRM; `src/app/dashboard/product/` routes and `src/app/dashboard/overview/` parallel routes are also starter artifacts
- Files: `src/features/products/`, `src/app/dashboard/product/`, `src/app/dashboard/overview/`, `src/features/auth/components/demo-form.tsx`, `src/features/auth/components/user-auth-form.tsx`
- Impact: Dead code increases bundle size, confuses navigation, and pollutes the codebase mental model
- Fix approach: Run `node __CLEANUP__/scripts/cleanup.js kanban` (for kanban) and manually remove product/overview routes; or simply delete `src/features/products/` and the corresponding pages

**`__CLEANUP__` Directory Not Yet Removed:**
- Issue: `__CLEANUP__/` exists at the repo root and is intended to be deleted after optional features are stripped (per `__CLEANUP__/cleanup.md` line 33: "Once you've finished cleaning up features you don't need, delete the `__CLEANUP__` folder")
- Files: `/Users/sbronstein/Github/heimdall/__CLEANUP__/` — contains `clerk/`, `kanban/`, `sentry/`, `scripts/`
- Impact: Misleading to contributors; scripts could accidentally be run and remove real code
- Fix approach: Decide which features to keep/strip, run cleanup scripts if desired, then `rm -rf __CLEANUP__`

**Starter Template Infobar / Workspaces / Billing / Exclusive Pages:**
- Issue: Several dashboard pages are starter template scaffolding with no Heimdall-specific content: `src/app/dashboard/exclusive/page.tsx` (Clerk org Pro plan gating demo), `src/app/dashboard/billing/page.tsx`, `src/app/dashboard/workspaces/`, `src/config/infoconfig.ts` (805-line `infobar.tsx` component, workspace/billing info content)
- Files: `src/components/ui/infobar.tsx` (805 lines), `src/config/infoconfig.ts`, `src/app/dashboard/exclusive/`, `src/app/dashboard/workspaces/`, `src/app/dashboard/billing/`
- Impact: Reachable routes that display placeholder/demo content to the app owner; infobar.tsx is a large bundle contribution for unused UX
- Fix approach: Remove pages and routes not used in the job-search workflow

**`computeBridgeScore` Imported But Unused in Search Route:**
- Issue: `src/app/api/job-leads/[id]/search/route.ts` imports `computeBridgeScore` (line 10) but never calls it in the file body — score computation happens in `recommendations/route.ts` and `prioritization.ts`
- Files: `src/app/api/job-leads/[id]/search/route.ts`
- Impact: Dead import; TypeScript does not catch it because the symbol is used elsewhere
- Fix approach: Remove the import

**`any` Types in KBar Search Component:**
- Issue: `src/components/kbar/index.tsx` uses `any[]` for `entityActions` state and `any` for each entity type in `.forEach()` callbacks (lines 21, 39, 42, 52, 62, 72) — loses type safety for the command palette
- Files: `src/components/kbar/index.tsx`
- Impact: Refactors to entity types will silently break command palette actions
- Fix approach: Define typed interfaces matching the API search response shape and replace `any`

**`any` in Weekly Snapshot Form:**
- Issue: `src/features/metrics/components/weekly-snapshot-form.tsx` line 18 uses `any` for the `onSaved` metric callback
- Files: `src/features/metrics/components/weekly-snapshot-form.tsx`
- Fix approach: Import or define the `SearchMetric` type from the schema

---

## Performance Bottlenecks

**N+1 Prospect Inserts After LinkedIn Scrape:**
- Problem: `src/app/api/job-leads/[id]/search/route.ts` (lines 48–57) inserts each scraped prospect individually in a `for` loop: `for (const sp of scrapedProspects) { await db.insert(prospects).values({...}) }` — for a 10-page scrape yielding ~100 prospects this is 100 sequential round-trips to Neon Postgres
- Files: `src/app/api/job-leads/[id]/search/route.ts`
- Cause: Sequential `await` inside `for...of` instead of batch insert
- Improvement path: Replace with a single `db.insert(prospects).values([...scrapedProspects.map(...)])` call

**N+1 Bridge Inserts in `matchConnections`:**
- Problem: `src/features/job-leads/lib/match-connections.ts` (lines 104–111) inserts prospect bridges one at a time in a loop, wrapping each in a try/catch for conflict handling
- Files: `src/features/job-leads/lib/match-connections.ts`
- Cause: Loop with `await db.insert(prospectBridges).values(val).onConflictDoNothing()`
- Improvement path: Collect all `bridgeValues` and issue a single bulk insert with `.values(bridgeValues).onConflictDoNothing()`

**N+1 Updates in Bulk Categorize Route:**
- Problem: `src/app/api/contacts/import/categorize/route.ts` (lines 24–30) updates each contact's closeness individually in a `for...of` loop — for a 1500-contact triage pass this issues 1500 sequential DB updates
- Files: `src/app/api/contacts/import/categorize/route.ts`
- Cause: No batch-update path in Drizzle ORM without raw SQL; current code issues one UPDATE per contact
- Improvement path: Use a single `UPDATE ... SET closeness = CASE WHEN id = ... THEN ... END` or a batched transaction

**No Database Indexes on Frequently Filtered Columns:**
- Problem: Schema files define no indexes; all filtering is against unindexed columns. The search route runs `ilike` against `companies.name`, `contacts.firstName`, `contacts.lastName`, `contacts.title`, `contacts.currentCompany`, `notes.title`, `notes.content` (18 `ilike` usages across API routes). The contacts import route fetches all contacts to build in-memory dedup sets. The triage page orders by `contacts.linkedinConnectionDate` without an index.
- Files: `drizzle/schema/contacts.ts`, `drizzle/schema/companies.ts`, `drizzle/schema/applications.ts`, `drizzle/schema/notes.ts`
- Cause: No `index()` calls in any `pgTable` definition
- Improvement path: Add indexes on `contacts(archived_at)`, `contacts(linkedin_url)`, `contacts(company_id)`, `contacts(linkedin_connection_date)`, `companies(name)` using Drizzle's `index()` helper; for `ilike` search consider `pg_trgm` GIN indexes

**Full Contacts Table Scan on Every Import and Match:**
- Problem: `src/app/api/contacts/import/route.ts` (lines 55–64) and `src/features/job-leads/lib/match-connections.ts` (lines 44–47) both `SELECT *` from `contacts` with no pagination or filter beyond `archivedAt IS NULL` — at 1500+ contacts this loads the entire table into Node memory on every import or scrape match
- Files: `src/app/api/contacts/import/route.ts`, `src/features/job-leads/lib/match-connections.ts`
- Improvement path: For import dedup, push dedup to the database with `ON CONFLICT DO NOTHING`; for name matching, implement server-side fuzzy search rather than loading all contacts

---

## Fragile Areas

**LinkedIn Scraper — Entire Feature Is Brittle:**
- Files: `src/features/job-leads/lib/scrape-connections.ts`, `src/features/job-leads/lib/linkedin-browser.ts`, `src/features/job-leads/lib/scrape-job-page.ts`, `src/app/api/job-leads/[id]/search/route.ts`, `src/app/api/job-leads/linkedin-setup/route.ts`
- Why fragile:
  1. LinkedIn can change their DOM structure at any time — the scraper relies on `a[href*="/in/"]`, `a[href*="/company/"]`, `button[aria-label="Next"]`, `span[aria-hidden="true"]`, and text matching against `"employees"` — any layout update breaks extraction silently
  2. Hardcoded company name `'point'` is passed to `page.evaluate()` in `scrape-connections.ts` line 62 — this should use `companyName` from the function parameter but instead matches text against the literal string `"point"`; this is likely a debug artifact left in production code
  3. Browser instance is intentionally never closed: `// Don't close page or context — leave browser open for debugging` (lines 344–346) — this leaks browser resources on every invocation
  4. LinkedIn aggressively detects bot traffic; the scraper uses `waitForTimeout` with fixed delays (5000ms, 3000ms, 1000ms) that may be too short or trigger rate limiting
  5. The feature assumes a long-lived server process with a local filesystem (`~/.heimdall/linkedin-profile/`) — completely incompatible with Vercel serverless deployment
  6. The fire-and-forget async IIFE in the search route means scrape errors only update the DB to `status: 'scraped'` with no user-facing notification
- Safe modification: Only touch this code locally with a running headed browser; test against a specific job URL before shipping changes; resolve the hardcoded `'point'` immediately

**Fire-and-Forget Async Pattern with No Timeout:**
- Files: `src/app/api/job-leads/[id]/search/route.ts` (lines 40–97)
- Why fragile: The async IIFE is launched with no timeout bound; if the Playwright scrape hangs (e.g., LinkedIn captcha), the `jobLead.status` stays `'searching'` indefinitely with no way to recover except a direct DB update
- Safe modification: Add a `Promise.race()` against a timeout that sets the lead back to `'scraped'` status

**`scrape-connections.ts` Debug Code in Production:**
- Files: `src/features/job-leads/lib/scrape-connections.ts`
- Issues:
  - 20+ `console.log()` calls including full JSON dumps of page link arrays (line 39 dumps up to 30 links as JSON)
  - Hardcoded `'point'` company name in evaluate callback (line 62) — bug, not debug
  - "Leave browser open for now (debug mode)" comment with commented-out `context.close()` (lines 344–346)
- Why fragile: These logs will flood server stdout in production; the leaked browser accumulates until the process restarts

---

## Scaling Limits

**Playwright / Chromium Cannot Run on Vercel Serverless:**
- Current capacity: Works only in local dev or Docker environments with a headed browser
- Limit: Vercel Functions have no persistent filesystem, no display server, and a 250 MB bundle limit — Playwright's Chromium binary alone exceeds this; `homedir()` returns an ephemeral path that does not persist between invocations
- Impact: The entire job-leads search feature (`POST /api/job-leads/[id]/search`) silently fails on Vercel deployment
- Scaling path: Use a remote browser service (Browserless, Playwright Cloud) via `BROWSER_WS_ENDPOINT`/`BROWSER_CDP_ENDPOINT` env vars (already supported in `linkedin-browser.ts`) or move scraping to a long-running sidecar service

---

## Dependencies at Risk

**`playwright` as a Production Dependency:**
- Risk: `playwright` (^1.58.2) is listed under `dependencies` (not `devDependencies`) in `package.json` — Playwright installs browser binaries on `npm install` which dramatically increases deployment bundle size and install time; Vercel will attempt to bundle it
- Impact: Build/deploy failures or oversized serverless functions on Vercel
- Migration plan: Move to `devDependencies` if scraping stays local-only; or configure `serverExternalPackages: ['playwright']` in `next.config.ts`

---

## Test Coverage Gaps

**Zero Test Files Exist:**
- What's not tested: All API routes, all domain logic, all UI components, all scraping logic, all schema migrations
- Files: Entire `src/` directory — no `*.test.ts`, `*.test.tsx`, `*.spec.ts`, or `*.spec.tsx` files exist
- Risk: Silent regressions in pipeline stage transitions, API response envelope format, timeline event creation, LinkedIn CSV parsing, bridge score computation, and the hydration bug documented in `bug.md`
- Priority: High — the CLAUDE.md spec explicitly calls for validating API envelope format, pipeline stage transitions, and timeline event creation but none of these are tested

---

*Concerns audit: 2026-05-12*
