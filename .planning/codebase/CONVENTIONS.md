# Coding Conventions

**Analysis Date:** 2026-05-12

## Naming Patterns

**Files:**
- kebab-case for all files: `company-form.tsx`, `scrape-job-page.ts`, `pipeline-board.tsx`
- Schema files use kebab-case in `drizzle/schema/`: `job-leads.ts`, `timeline-events.ts`
- API routes follow Next.js convention: `route.ts` in directory-per-endpoint layout

**Functions:**
- camelCase for all functions: `scrapeJobPage`, `logTimeline`, `canTransition`, `buildRecommendations`
- Event handlers prefixed with `on`: `onSubmit`, `onDragStart`, `onCardClick`
- Handler callbacks passed as props prefixed with `handle`: `handleCreate`
- Async route handlers named after HTTP verb: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`

**Variables:**
- camelCase: `companyId`, `newStatus`, `hasMore`, `searchParams`
- Boolean variables prefixed with `is`/`has`: `isMounted`, `hasMore`, `isOverlay`, `isDragging`
- Constants (enum value arrays) use camelCase with `Values` suffix: `applicationStatusValues`, `companyStageValues`

**Types and Interfaces:**
- PascalCase for types and interfaces: `Company`, `PipelineApplication`, `ScrapedJobData`
- Props interfaces named `[ComponentName]Props`: `PipelineBoardProps`, `ApplicationCardProps`
- Inferred Drizzle types use simple entity names: `Company`, `Contact`, `Application` (defined in `src/lib/domain/types.ts`)
- Insert variants prefixed `New`: `NewCompany`, `NewContact`, `NewApplication`
- Type-only imports use `import type`: `import type { PipelineStage } from '@/lib/domain/types'`

**Components:**
- PascalCase named exports for all React components: `PipelineBoard`, `ApplicationCard`, `JobLeadsPage`
- No default exports for components — Next.js page files (`page.tsx`, `layout.tsx`) are the only exception

**React hooks:**
- Custom hooks prefixed `use`: `usePipelineStore`, `useDataTable`, `useDebounce`

## Code Style

**Formatting (Prettier 3.4.2):**
- Single quotes for strings: `'use client'`, `import ... from '...'`
- No trailing commas
- 2-space indentation
- No semicolons omitted (semi: true)
- Arrow functions always parenthesized: `(s) => s.applications`
- LF line endings
- Tailwind class sorting via `prettier-plugin-tailwindcss`

**Linting (ESLint, `next/core-web-vitals`):**
- `@typescript-eslint/no-unused-vars` — warn (not error)
- `no-console` — warn (allows `console.error` in API error paths)
- `react-hooks/exhaustive-deps` — warn
- `import/no-unresolved` — off (path aliases handled by TS)

**TypeScript:**
- Strict mode enabled (`"strict": true` in `tsconfig.json`)
- `satisfies` operator used to validate response shapes: `{ success: true, data } satisfies ApiResponse<T>`
- Type assertions used for Drizzle enum arrays: `statuses as (typeof applicationStatusValues)[number][]`
- Non-null assertion (`!`) used for env vars: `process.env.DATABASE_URL!`

## Import Organization

**Order (not enforced by tooling, but consistently applied):**
1. React/Next.js core: `'react'`, `'next/navigation'`, `'next/image'`
2. Third-party packages: `'@dnd-kit/core'`, `'sonner'`, `'zod'`
3. Internal `@/` aliases — UI components first: `'@/components/ui/button'`
4. Internal `@/` aliases — lib/domain: `'@/lib/domain/types'`, `'@/lib/api/errors'`
5. Relative imports last: `'./pipeline-column'`, `'../utils/store'`

**Path Aliases (configured in `tsconfig.json`):**
- `@/*` → `./src/*` (primary alias for all src imports)
- `~/*` → `./public/*` (public assets)
- Drizzle schema imported as relative paths from API routes: `'../../../../drizzle/schema'`

**Type-only imports:**
- Use `import type` for types that are not needed at runtime:
  ```typescript
  import type { PipelineStage } from '@/lib/domain/types';
  import type { DragEndEvent } from '@dnd-kit/core';
  ```

## Error Handling

**API routes — standard pattern:**
```typescript
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = schema.parse(body);
    // ... db operations ...
    return created(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}
```

**Helper functions (`src/lib/api/errors.ts`, `src/lib/api/types.ts`):**
- `notFound(entity)` → 404 `{ success: false, error: "[entity] not found" }`
- `validationError(message)` → 400 `{ success: false, error: message }`
- `serverError(err)` → 500, logs `console.error('API Error:', err)`
- `success(data)` → 200 `{ success: true, data }`
- `created(data)` → 201 `{ success: true, data }`
- `paginated(data, meta)` → 200 `{ success: true, data, meta }`

**Client components — fetch pattern:**
```typescript
const res = await fetch('/api/...', { method: 'POST', ... });
if (!res.ok) {
  const data = await res.json();
  throw new Error(data.error || 'Fallback message');
}
const { data } = await res.json();
```
User feedback via `toast.success()` / `toast.error()` (sonner) — never raw `alert()`.

**Nested try/catch for optional async steps:**
When a sub-operation (e.g., scraping) should not abort the primary operation, a nested try/catch is used. See `src/app/api/job-leads/route.ts` POST handler.

## Logging

**Framework:** `console.error` only (no logging library)

**Patterns:**
- Server errors logged in `serverError()` in `src/lib/api/errors.ts` — centralized
- Scrape/search failures logged inline with `console.error('Job page scrape failed:', err)`
- `no-console` ESLint rule is `warn` — `console.log` is discouraged but `console.error` is accepted
- No structured logging or log levels beyond error

## Comments

**When to Comment:**
- Section headers in long files: `// Core info`, `// Verify company exists`
- Non-obvious algorithmic decisions: `// Overall contact score = max of their bridge scores`
- Intentional suppressions: `// ignore malformed JSON-LD`, `// Leave browser open for now (debug mode)`
- TODO/workaround notes are present but rare

**No JSDoc/TSDoc:** Function signatures rely on TypeScript types for documentation.

## Function Design

**Size:** Route handlers typically 20–50 lines. Business logic helpers (`prioritization.ts`, `scrape-job-page.ts`) 30–90 lines.

**Parameters:**
- Route handlers receive `(request: Request, { params })` where params is `Promise<{ id: string }>`
- Utility functions use named parameters or options objects for multiple args
- Component props defined as `interface [Name]Props` and destructured in the signature

**Return Values:**
- API routes always return a `Response` via the helper functions in `src/lib/api/types.ts` and `src/lib/api/errors.ts`
- Business logic returns typed values or throws — never returns error objects
- Async functions always use `async/await`, never `.then()` chains

## Module Design

**Exports:**
- Named exports everywhere: `export function`, `export const`, `export type`
- Default exports only for Next.js page/layout files (`page.tsx`, `layout.tsx`) and middleware

**Barrel Files:**
- Used selectively at `drizzle/schema/index.ts` (re-exports all schema tables)
- Feature-level barrel files exist only for data-table components: `src/features/tasks/components/task-table/index.tsx`
- No `src/features/*/index.ts` barrel pattern

**Server vs. Client split:**
- `'use client'` directive placed at the very top of files requiring interactivity
- Server Components (no directive) used for all page-level data fetching
- Zustand stores (`src/features/pipeline/utils/store.ts`) used for client-side state shared across components
- No React Context for global state — Zustand is the pattern

## Zod Schema Conventions

Zod schemas defined at the top of each API route file (not in a shared schemas directory):
```typescript
const createCompanySchema = z.object({
  name: z.string().min(1).max(200),
  website: z.string().url().optional().nullable(),
  tags: z.array(z.string()).optional().nullable()
});
```
- Required fields: `z.string().min(1)` with max bounds
- Optional nullable fields: `.optional().nullable()`
- Enum fields use `z.enum(domainValues)` referencing arrays from `src/lib/domain/types.ts`
- Date fields accept both date strings and datetime strings: `z.union([z.string().date(), z.string().datetime()])`

## Drizzle ORM Conventions

- Query builder only — no raw SQL except for `sql` template tag in complex `WHERE` conditions
- Column names in snake_case in DB, camelCase in TypeScript (Drizzle maps automatically)
- Multi-condition WHERE built by accumulating into `conditions[]` array then `sql.join`:
  ```typescript
  const conditions = [isNull(table.archivedAt)];
  if (filter) conditions.push(inArray(table.field, values));
  const where = conditions.length > 1
    ? sql`${sql.join(conditions.map(c => sql`(${c})`), sql` AND `)}`
    : conditions[0];
  ```
- Soft deletes via `archivedAt` timestamp; never hard delete
- `updatedAt: new Date()` always set manually on updates (Drizzle does not auto-update)

---

*Convention analysis: 2026-05-12*
