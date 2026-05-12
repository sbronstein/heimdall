# Technology Stack

**Analysis Date:** 2026-05-12

## Languages

**Primary:**
- TypeScript 5.7.2 - All source code (`src/`, `drizzle/`, scripts)

**Secondary:**
- Python 3.x - Utility scripts only (`scripts/generate-import-data.py`, `scripts/parse-paste.py`)

## Runtime

**Environment:**
- Node.js 22 (pinned in `.nvmrc`)

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present (lockfileVersion 3)

## Frameworks

**Core:**
- Next.js 16.0.10 - Full-stack framework, App Router, Server Components by default
- React 19.2.0 - UI layer

**UI Component Systems:**
- shadcn/ui (style: "new-york") - Component library via `components.json`; primitives in `src/components/ui/`
- Radix UI primitives - ~20 packages (`@radix-ui/react-*`), all via shadcn/ui

**Styling:**
- Tailwind CSS v4 (`tailwindcss: ^4.0.0`) - Utility-first CSS
- `@tailwindcss/postcss` v4 - PostCSS integration (`postcss.config.js`)
- `tailwind-merge` v3 - Class merging (`src/lib/utils.ts`)
- `tailwindcss-animate` + `tw-animate-css` - Animation utilities
- `next-themes` v0.4.6 - Theme switching; active theme stored in cookie, default is "vercel" (`src/components/themes/theme.config.ts`)

**Data / Tables:**
- `@tanstack/react-table` v8 - Headless table primitives (`src/lib/data-table.ts`)
- Recharts v2 - Data visualization

**Forms:**
- `react-hook-form` v7
- `@hookform/resolvers` v5
- `zod` v4 - Schema validation; used on all API routes

**Drag and Drop:**
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/modifiers`, `@dnd-kit/utilities` v6-8

**Routing / URL State:**
- `nuqs` v2 - URL search params state management; adapter in `src/app/layout.tsx`

**Animation:**
- `motion` v11 (Framer Motion)

**Web Scraping:**
- `playwright` v1.58.2 - Chromium browser automation for LinkedIn scraping (`src/features/job-leads/lib/linkedin-browser.ts`, `src/features/job-leads/lib/scrape-connections.ts`)
- `cheerio` v1.2 - HTML parsing for job page scraping (`src/features/job-leads/lib/scrape-job-page.ts`)

**Utilities:**
- `date-fns` v4 - Date formatting
- `papaparse` v5 - CSV parsing (LinkedIn import)
- `uuid` v11 - UUID generation
- `zustand` v5 - Client-side state management
- `kbar` v0.1.0-beta.45 - Command palette (`src/components/kbar/`)
- `sonner` v1 - Toast notifications
- `lucide-react` v0.476, `@tabler/icons-react` v3, `@radix-ui/react-icons` v1 - Icon libraries

**Testing:**
- Not configured; no jest.config.*, vitest.config.*, or test files detected

**Build/Dev:**
- `drizzle-kit` v0.31.9 - Schema migration tooling (`drizzle.config.ts`)
- `husky` v9 + `lint-staged` v15 - Pre-commit hooks
- `eslint` 8.48.0 + `eslint-config-next` v16 + `@typescript-eslint/eslint-plugin` v6
- `prettier` 3.4.2 + `prettier-plugin-tailwindcss` v0.6.11

## Key Dependencies

**Critical:**
- `drizzle-orm` v0.45.1 - ORM for all database queries; used throughout `src/lib/db/`, `src/app/api/`
- `@neondatabase/serverless` v1.0.2 - Neon Postgres HTTP driver; initialized in `src/lib/db/index.ts`
- `@clerk/nextjs` v6 - Authentication and session management; middleware in `src/proxy.ts`
- `zod` v4 - Request validation; used in every API route

**Infrastructure:**
- `sharp` v0.33.5 - Image optimization (Next.js image processing)
- `nextjs-toploader` v3 - Page load progress indicator

## Configuration

**Environment:**
- Configured via `.env.local` (gitignored; `.env.local` file present)
- Template with all variable names documented in `env.example.txt`
- Key variables:
  - `DATABASE_URL` - Neon Postgres connection string
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key
  - `CLERK_SECRET_KEY` - Clerk secret key
  - `NEXT_PUBLIC_CLERK_SIGN_IN_URL` - `/auth/sign-in`
  - `NEXT_PUBLIC_CLERK_SIGN_UP_URL` - `/auth/sign-up`
  - `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` - `/dashboard/overview`
  - `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` - `/dashboard/overview`
  - `WEBHOOK_SECRET` - Clerk webhook secret (optional)
  - `BROWSER_CDP_ENDPOINT` - Chrome DevTools Protocol endpoint for LinkedIn scraping (optional)
  - `BROWSER_WS_ENDPOINT` - Playwright WebSocket endpoint for LinkedIn scraping (optional)
  - `NEXT_PUBLIC_SENTRY_DSN` - Sentry DSN (optional; Sentry instrumentation is currently no-op in `src/instrumentation.ts`)

**TypeScript:**
- `tsconfig.json`: strict mode, target es5, path aliases `@/*` → `./src/*` and `~/*` → `./public/*`

**Build:**
- `next.config.ts` - Minimal config; remote image patterns for `img.clerk.com`, `clerk.com`, `api.slingacademy.com`; transpiles `geist`
- `postcss.config.js` - Tailwind v4 PostCSS plugin only
- `drizzle.config.ts` - PostgreSQL dialect, schema at `./drizzle/schema/index.ts`, migrations at `./drizzle/migrations`

## Platform Requirements

**Development:**
- Node.js 22 (`.nvmrc`)
- Dev server runs on port 4000 (`npm run dev` uses `-p 4000 -H 0.0.0.0`)
- LinkedIn scraping requires either: local Chromium install (Playwright), a headed Chrome with CDP (`BROWSER_CDP_ENDPOINT`), or a Playwright remote server (`BROWSER_WS_ENDPOINT`)

**Production:**
- Vercel (inferred from `eslint-config-next`, `@neondatabase/serverless` HTTP driver, App Router patterns)
- Neon Postgres (serverless HTTP driver required for Vercel edge/serverless compatibility)

---

*Stack analysis: 2026-05-12*
