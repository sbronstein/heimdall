# Testing Patterns

**Analysis Date:** 2026-05-12

## Test Framework

**Runner:** None. No test runner is configured in this project.

**Assertion Library:** None.

**Test Config Files:** No `jest.config.*`, `vitest.config.*`, or equivalent found.

**Run Commands:**
```bash
# No test commands exist in package.json scripts
npm run lint          # Lint only (no test equivalent)
npm run build         # Build validation (used as pre-push check via Husky)
```

## Current Quality Gates

Although there are no automated tests, two quality gates are enforced via Husky hooks in `.husky/`:

**Pre-commit (`lint-staged`):**
- Runs Prettier (`prettier --write`) on all staged `*.js`, `*.jsx`, `*.tsx`, `*.ts`, `*.css`, `*.less`, `*.scss`, `*.sass` files
- Config: `package.json` `lint-staged` key

**Pre-push:**
- Runs `bun run build` — a failing TypeScript build blocks the push
- This catches type errors and broken imports before they reach remote

## Test File Organization

**No test files exist.** A search across the entire repository (excluding `node_modules` and `.next`) found zero `.test.ts`, `.test.tsx`, `.spec.ts`, or `.spec.tsx` files.

## Test Infrastructure Status

This codebase has **no testing infrastructure**. The following are absent:

- No test runner (Jest, Vitest, Playwright test runner)
- No assertion library
- No mock framework
- No test utilities or factories
- No fixtures or test data helpers
- No coverage tooling or thresholds
- No CI test step (`.github/` directory exists but its contents were not observed running tests)

**Note:** `@faker-js/faker` is present in `devDependencies` (`package.json`) and `playwright` is in `dependencies`, but neither is wired into a test suite. Faker is likely used in `drizzle/seed.ts` for seed data. Playwright is imported in scraping code (`src/features/job-leads/lib/linkedin-browser.ts`, `src/features/job-leads/lib/scrape-connections.ts`) as a browser automation tool, not a test framework.

## What Would Need to Exist to Add Tests

If tests were added, the natural framework choice given the stack would be **Vitest** (compatible with Next.js/ESM, faster than Jest). The following patterns from the codebase suggest how tests would be structured:

**Unit test candidates (pure functions, no DB or network):**
- `src/lib/domain/pipeline.ts` — `canTransition()`, `isTerminalState()`: pure functions with enum inputs, ideal for unit tests
- `src/lib/api/filters.ts` — `parseArrayParam()`, `parseCursor()`, `parseLimit()`: pure string/date parsing functions
- `src/features/job-leads/lib/prioritization.ts` — `computeBridgeScore()`, `buildRecommendations()`: scoring logic with no side effects
- `src/features/job-leads/lib/seniority.ts` — `inferSeniority()`: title-to-enum inference logic
- `src/lib/format.ts` — `formatDate()`: date formatting utility

**Integration test candidates (require DB mock or real Neon):**
- All `src/app/api/*/route.ts` files: test request/response envelope format, status codes, and `logTimeline` side effects
- Pipeline status transitions: `src/app/api/applications/[id]/status/route.ts` validates `canTransition` is enforced at the API layer

**E2E test candidates (Playwright already installed):**
- LinkedIn scraping flows in `src/features/job-leads/lib/scrape-connections.ts` and `scrape-job-page.ts` — Playwright is used here as a live browser tool, not a test harness

## Conventions to Follow When Adding Tests

Given the existing code style:

**File location:** Co-locate test files with source, e.g.:
- `src/lib/domain/pipeline.test.ts` alongside `src/lib/domain/pipeline.ts`
- `src/lib/api/filters.test.ts` alongside `src/lib/api/filters.ts`

**Naming:** `[file-being-tested].test.ts` or `[file-being-tested].spec.ts`

**Suggested mock approach for API routes:**
```typescript
// Mock the Drizzle db client
vi.mock('@/lib/db', () => ({ db: mockDb }));

// Mock timeline logger (side-effect only)
vi.mock('@/lib/db/timeline', () => ({ logTimeline: vi.fn() }));
```

**Suggested unit test structure based on existing patterns:**
```typescript
import { describe, it, expect } from 'vitest';
import { canTransition, isTerminalState } from '@/lib/domain/pipeline';

describe('canTransition', () => {
  it('allows valid forward transitions', () => {
    expect(canTransition('researching', 'applied')).toBe(true);
  });

  it('blocks transitions from terminal states', () => {
    expect(canTransition('accepted', 'applied')).toBe(false);
  });

  it('blocks invalid transitions', () => {
    expect(canTransition('researching', 'offer')).toBe(false);
  });
});
```

## Coverage Gaps (High Priority if Tests Are Added)

**Critical business logic with no test coverage:**

- **Pipeline transition enforcement** (`src/lib/domain/pipeline.ts`) — `canTransition` is the only guard preventing invalid status changes; currently untested
- **API response envelope format** — All `route.ts` files must return `{ success, data?, error?, meta? }` but this is never verified
- **Zod validation schemas** — Input validation in each route is untested; malformed inputs could expose unexpected behavior
- **Cursor-based pagination** (`src/lib/api/filters.ts`) — `parseCursor` date parsing and `parseLimit` bounds are untested
- **Connection scoring algorithm** (`src/features/job-leads/lib/prioritization.ts`) — `computeBridgeScore` weight calculations are untested
- **Seniority inference** (`src/features/job-leads/lib/seniority.ts`) — Title-to-seniority-level mapping logic is untested
- **Soft delete behavior** — DELETE routes set `archivedAt` rather than removing rows; no test verifies this invariant

---

*Testing analysis: 2026-05-12*
