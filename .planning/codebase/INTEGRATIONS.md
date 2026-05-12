# External Integrations

**Analysis Date:** 2026-05-12

## APIs & External Services

**Authentication:**
- Clerk - User authentication, session management, organizations, billing
  - SDK/Client: `@clerk/nextjs` v6, `@clerk/themes` v2
  - Middleware: `src/proxy.ts` — `clerkMiddleware` protects `/dashboard/**`; single-user lockdown enforced (only `steve@bronstein.org` passes)
  - Auth URLs: `/auth/sign-in`, `/auth/sign-up` configured via env vars
  - Sign-in page: `src/app/auth/sign-in/[[...sign-in]]/page.tsx`
  - Sign-up page: `src/app/auth/sign-up/[[...sign-up]]/page.tsx`
  - Providers component wraps app: `src/components/layout/providers.tsx`
  - Clerk Organizations: configured (workspaces feature, RBAC, billing)
  - Clerk Billing: configured via Clerk Dashboard (Stripe used only for payment processing)
  - Required env vars: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
  - Optional: `WEBHOOK_SECRET` for Clerk webhooks

**LinkedIn (scraped, not official API):**
- LinkedIn job pages - Scraped for company name, role title, location
  - Implementation: `src/features/job-leads/lib/scrape-job-page.ts`
  - Method: direct HTTP fetch + cheerio HTML parsing (no auth required)
  - Invoked from: `src/app/api/job-leads/route.ts` POST handler
- LinkedIn people/company search - Scraped for employee connections
  - Implementation: `src/features/job-leads/lib/scrape-connections.ts`, `src/features/job-leads/lib/linkedin-browser.ts`
  - Method: Playwright Chromium browser automation; requires logged-in LinkedIn session
  - Session storage: `~/.heimdall/linkedin-profile/` (persistent profile or `storage-state.json`)
  - Invoked from: `src/app/api/job-leads/[id]/search/route.ts` POST handler (async fire-and-forget)

**GitHub API (read-only, unauthenticated):**
- Used only in auth pages to display star count for the template repo
- Endpoint: `https://api.github.com/repos/kiranism/next-shadcn-dashboard-starter`
- No auth required; 24h cache via Next.js `revalidate: 86400`
- Files: `src/app/auth/sign-in/[[...sign-in]]/page.tsx`, `src/app/auth/sign-up/[[...sign-up]]/page.tsx`

## Data Storage

**Databases:**
- Neon Postgres (serverless)
  - Connection: `DATABASE_URL` env var
  - Client: `@neondatabase/serverless` HTTP driver + `drizzle-orm/neon-http`
  - Initialization: `src/lib/db/index.ts` — exports singleton `db` instance
  - ORM: Drizzle ORM v0.45.1
  - Schema: `drizzle/schema/` — one file per table, all exported from `drizzle/schema/index.ts`
  - Tables: `companies`, `contacts`, `applications`, `interactions`, `tasks`, `notes`, `pipeline_stages`, `timeline_events`, `recruiters`, `search_metrics`, `job_leads`, `prospects`, `prospect_bridges`
  - Migrations: `drizzle/migrations/` — managed with `drizzle-kit`
  - Key patterns: UUID PKs, `created_at`/`updated_at` on all tables, soft deletes via `archived_at`, JSONB for semi-structured data, Postgres text arrays for tags

**File Storage:**
- Local filesystem only
  - LinkedIn browser profile: `~/.heimdall/linkedin-profile/` (Playwright persistent context)
  - LinkedIn session state: `~/.heimdall/linkedin-profile/storage-state.json`
  - No cloud file storage (no S3, GCS, or Vercel Blob detected)

**Caching:**
- None (no Redis, Memcached, or Upstash detected)
- Next.js built-in fetch caching used in auth pages (24h revalidation)

## Authentication & Identity

**Auth Provider:** Clerk
- Implementation: JWT-based sessions via Clerk middleware
- Access control: Single-user lockdown in `src/proxy.ts` — email must match `steve@bronstein.org`
- Protected routes: `/dashboard/**` — all others are public
- Session claims: `sessionClaims.email` used for email check

## Monitoring & Observability

**Error Tracking:**
- Sentry - configured in `env.example.txt` but currently disabled
  - `src/instrumentation.ts` - `register()` is a no-op ("Sentry removed to reduce dev server memory footprint")
  - `src/instrumentation-client.ts` - no-op
  - Would require: `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ORG`, `NEXT_PUBLIC_SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`

**Logs:**
- `console.log` / `console.error` throughout (no structured logging framework)
- Notable: LinkedIn scraper logs extensively to console during operation (`src/features/job-leads/lib/scrape-connections.ts`)

## CI/CD & Deployment

**Hosting:**
- Vercel (inferred; `@neondatabase/serverless` HTTP driver is required for Vercel's serverless/edge environment; `eslint-config-next` v16 alignment)
- No `vercel.json` present — default Vercel Next.js detection applies

**CI Pipeline:**
- None detected (no `.github/workflows/`, no CircleCI, no Buildkite config)
- Pre-commit only: `husky` + `lint-staged` run Prettier on staged files

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - Neon Postgres connection string (used in `src/lib/db/index.ts`)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key
- `CLERK_SECRET_KEY` - Clerk server secret key

**Optional env vars:**
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL` - Default: `/auth/sign-in`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL` - Default: `/auth/sign-up`
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` - Default: `/dashboard/overview`
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` - Default: `/dashboard/overview`
- `WEBHOOK_SECRET` - Clerk webhook secret (format: `whsec_...`)
- `BROWSER_CDP_ENDPOINT` - Chrome CDP URL for remote LinkedIn scraping (e.g., `http://host.docker.internal:3005`)
- `BROWSER_WS_ENDPOINT` - Playwright WebSocket server URL for remote scraping
- `NEXT_PUBLIC_SENTRY_DSN` - Sentry DSN (currently unused)
- `NEXT_PUBLIC_SENTRY_ORG` - Sentry org (currently unused)
- `NEXT_PUBLIC_SENTRY_PROJECT` - Sentry project (currently unused)
- `SENTRY_AUTH_TOKEN` - Sentry source maps token (currently unused)
- `NEXT_PUBLIC_SENTRY_DISABLED` - Disable Sentry in dev (currently unused)

**Secrets location:**
- `.env.local` (gitignored); template in `env.example.txt`

## Webhooks & Callbacks

**Incoming:**
- Clerk webhooks - infrastructure present (`WEBHOOK_SECRET` env var defined in template)
  - No active webhook handler route detected in `src/app/api/`
  - Would be implemented at `/api/webhooks/clerk` or similar

**Outgoing:**
- None detected

## LinkedIn Browser Automation — Deployment Modes

The LinkedIn scraping system supports three operating modes (configured via env vars):

| Mode | Env Var | When Used |
|------|---------|-----------|
| Local headed | (none) | Development: launches Chromium directly with persistent profile |
| Remote CDP | `BROWSER_CDP_ENDPOINT` | Docker: connects to host Chrome via Chrome DevTools Protocol |
| Remote WS | `BROWSER_WS_ENDPOINT` | Playwright server: connects over WebSocket, uses saved storage state |

Session setup script: `src/features/job-leads/lib/linkedin-browser.ts` — `launchSetup()` and `getContext()` exports.

---

*Integration audit: 2026-05-12*
