# Phase 2: Test Infrastructure - Pattern Map

**Mapped:** 2026-05-12
**Files analyzed:** 14 new files
**Analogs found:** 14 / 14 (note: no test-file analogs exist — this is a greenfield test harness. Analogs are configuration/wiring patterns and the source-under-test modules whose signatures the tests must respect.)

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `vitest.config.ts` | config | n/a | `drizzle.config.ts`, `next.config.ts` | wiring-pattern |
| `src/test-utils/pglite.ts` | utility (test infra) | DB bootstrap | `src/lib/db/index.ts`, `drizzle/seed.ts` | wiring-pattern |
| `src/test-utils/call-route.ts` | utility (test infra) | request-response | API route handler signature (`src/app/api/contacts/route.ts`) | signature-mirror |
| `src/lib/api/types.test.ts` | test (pure logic) | transform | `src/lib/api/types.ts` (source under test) | source-mirror |
| `src/lib/domain/pipeline.test.ts` | test (pure logic) | transform | `src/lib/domain/pipeline.ts` (source under test) | source-mirror |
| `src/lib/api/filters.test.ts` | test (pure logic) | transform | `src/lib/api/filters.ts` (source under test) | source-mirror |
| `src/features/job-leads/lib/prioritization.test.ts` | test (pure logic) | transform | `src/features/job-leads/lib/prioritization.ts` | source-mirror |
| `src/features/job-leads/lib/seniority.test.ts` | test (pure logic) | transform | `src/features/job-leads/lib/seniority.ts` | source-mirror |
| `src/app/api/contacts/import/route.test.ts` | test (DB integration) | request-response | `src/app/api/contacts/import/route.ts` + `__fixtures__/linkedin-connections.csv` | source-mirror |
| `src/app/api/applications/[id]/status/route.test.ts` | test (DB integration) | request-response | `src/app/api/applications/[id]/status/route.ts` | source-mirror |
| `src/app/api/contacts/route.test.ts` | test (DB integration) | request-response, CRUD | `src/app/api/contacts/route.ts` | source-mirror |
| `src/components/layout/app-sidebar.test.tsx` | test (component, SSR + hydration) | render-only | `src/components/layout/app-sidebar.tsx`, `src/components/user-avatar-profile.tsx` | source-mirror |
| `src/features/.../__fixtures__/linkedin-connections.csv` | fixture | data | LinkedIn export format documented inline in `route.ts` (lines 13-21, 39-48) | format-mirror |
| `package.json` (modify) | config | n/a | existing `scripts` block | additive |

## Pattern Assignments

### `vitest.config.ts` (config)

**Analog:** `drizzle.config.ts` + `tsconfig.json` path aliases

**Imports + define pattern** (`drizzle.config.ts` lines 1-13):
```ts
import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '.env.local' });

export default defineConfig({
  out: './drizzle/migrations',
  schema: './drizzle/schema/index.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!
  }
});
```

**Path-alias resolution** (must mirror `tsconfig.json` lines 21-28):
```json
"paths": {
  "@/*": ["./src/*"],
  "~/*": ["./public/*"]
}
```

**Apply pattern:** Use `defineConfig` from `vitest/config`. Default `environment: 'node'`. Wire path alias `@/*` → `./src/*` via `resolve.alias` so test files can do `import { canTransition } from '@/lib/domain/pipeline'` (D-09, D-10). Single config — no projects mode. The jsdom test opts in via `// @vitest-environment jsdom` pragma at the top of the file.

**Project convention reminders** (from `CLAUDE.md` + CONVENTIONS):
- Single quotes, 2-space indent, no trailing commas, no semicolon omission
- `process.env.DATABASE_URL!` non-null assertion is the established env pattern

---

### `src/test-utils/pglite.ts` (utility)

**Analog:** `src/lib/db/index.ts` (Drizzle client wiring) + `drizzle/seed.ts` (programmatic Drizzle setup)

**Singleton + drizzle init pattern** (`src/lib/db/index.ts` lines 1-7):
```ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../../../drizzle/schema';

const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle(sql, { schema });
```

**Programmatic drizzle init from a script** (`drizzle/seed.ts` lines 1-8):
```ts
import { config } from 'dotenv';
config({ path: '.env.local' });
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { pipelineStages } from './schema';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);
```

**Apply pattern:** Export a single named helper `createTestDb()` (per D-05, D-08, CD-04, CD-05). Internally:
1. Construct a fresh PGlite instance (`new PGlite()`).
2. Bind it to Drizzle via `drizzle()` — use `drizzle-orm/pglite` adapter (the planner picks the exact import; the wiring shape mirrors `neon-http` above with the same `{ schema }` second argument).
3. Apply migrations from `drizzle/migrations/` (CD-04 — planner picks `migrate()` vs. `drizzle-kit push` vs. raw SQL replay; the contract is: every test gets a freshly-migrated PGlite with no leakage).
4. Return the `db` instance; caller is responsible for `vi.mock('@/lib/db', () => ({ db }))` binding (D-05, D-07 — `logTimeline` reaches the same singleton, so the timeline assertions just query `timelineEvents` table after the route runs).

**Migration file count to apply** (`drizzle/migrations/` directory):
- `0000_luxuriant_redwing.sql` through `0006_add_job_leads.sql` — 7 files total + `meta/`

---

### `src/test-utils/call-route.ts` (utility)

**Analog:** Route handler signatures across `src/app/api/**/route.ts`

**Standard route handler signatures** (from `src/app/api/applications/[id]/status/route.ts` lines 15-18 and `src/app/api/contacts/route.ts` lines 41, 99):
```ts
// No-params route:
export async function GET(request: Request) { ... }
export async function POST(request: Request) { ... }

// With-params route (Next.js 16 async params):
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) { ... }
```

**Apply pattern:** Export `callRoute(handler, { method, body, params, searchParams })` per the specifics block (line 147 of CONTEXT.md). Internally builds a `new Request(url, { method, body: JSON.stringify(body) })`, wraps `params` in `Promise.resolve(...)`, awaits the handler, and returns the parsed JSON body alongside the `Response` status. Mirrors the exact shape Next.js passes so route handlers run unchanged.

---

### `src/lib/api/types.test.ts` (test — pure logic, node env)

**Source under test:** `src/lib/api/types.ts`

**Source signatures to assert against** (lines 1-39 of source):
```ts
export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  meta?: { total?: number; cursor?: string | null; hasMore?: boolean };
};

export function success<T>(data: T, status = 200): Response
export function created<T>(data: T): Response  // delegates to success(data, 201)
export function paginated<T>(data: T[], meta: {...}): Response
export function error(message: string, status = 400): Response
```

**Cross-reference for error envelope** (`src/lib/api/errors.ts` lines 1-21):
```ts
export function notFound(entity: string)        // 404, { success: false, error: `${entity} not found` }
export function validationError(message: string) // 400, { success: false, error: message }
export function serverError(error: unknown)     // 500, console.error then { success: false, error: 'Internal server error' }
```

**Apply pattern:**
- Call each factory directly, `await response.json()`, assert envelope shape: `{ success: true, data: ... }` for happy paths, `{ success: false, error: ... }` for errors (D-11.1).
- Assert correct status codes (200 default, 201 for `created`, 400 default for `error`, 404 for `notFound`, 500 for `serverError`).
- `serverError` writes to `console.error('API Error:', err)` — spy on it; required so `no-console: warn` doesn't break and so the assertion is deterministic.

---

### `src/lib/domain/pipeline.test.ts` (test — pure logic, node env)

**Source under test:** `src/lib/domain/pipeline.ts`

**Transition graph** (source lines 1-44):
```ts
const validTransitions: Record<string, string[]> = {
  researching: ['applied', 'withdrawn'],
  applied: ['recruiter_screen', 'rejected', 'ghosted', 'withdrawn', 'on_hold'],
  // ...
  offer: ['negotiating', 'accepted', 'rejected', 'withdrawn'],
  negotiating: ['accepted', 'rejected', 'withdrawn'],
  on_hold: ['applied', 'recruiter_screen', 'phone_interview', 'withdrawn', 'ghosted']
};

const terminalStates = ['accepted', 'rejected', 'withdrawn', 'ghosted'];
```

**Functions to test** (source lines 46-55):
```ts
export function canTransition(from: string, to: string): boolean {
  if (terminalStates.includes(from)) return false;
  return validTransitions[from]?.includes(to) ?? false;
}
export function isTerminalState(status: string): boolean { ... }
export { validTransitions, terminalStates };
```

**Apply pattern** (D-11.2):
- Valid forward moves: `expect(canTransition('researching', 'applied')).toBe(true)`, etc. — iterate the `validTransitions` map.
- Blocked from terminal: `for (const t of terminalStates) expect(canTransition(t, 'applied')).toBe(false)`.
- Blocked invalid jumps: `expect(canTransition('researching', 'offer')).toBe(false)`, `expect(canTransition('applied', 'accepted')).toBe(false)`.
- `isTerminalState` exhaustive: every value of `applicationStatusValues` (imported from `@/lib/domain/types`) returns the right boolean.

---

### `src/lib/api/filters.test.ts` (test — pure logic, node env)

**Source under test:** `src/lib/api/filters.ts` (lines 1-19, full file):
```ts
export function parseArrayParam(param: string | null): string[] | null { ... }
export function parseCursor(param: string | null): Date | null {
  if (!param) return null;
  const date = new Date(param);
  return isNaN(date.getTime()) ? null : date;
}
export function parseLimit(param: string | null, max = 100): number {
  const limit = parseInt(param || '20', 10);
  if (isNaN(limit) || limit < 1) return 20;
  return Math.min(limit, max);
}
```

**Apply pattern** (D-12 — keep small, ~5 cases each per specifics line 148):
- `parseCursor`: valid ISO string returns Date, invalid string returns null, null returns null, empty string returns null (treated as falsy → null per `if (!param)`).
- `parseLimit`: null → 20, valid number → that number, `'0'` → 20 (because `< 1`), value above max → clamped to max, non-numeric → 20.
- `parseArrayParam`: comma-list → trimmed array, `'a, , b'` → `['a','b']`, null → null.

---

### `src/features/job-leads/lib/prioritization.test.ts` (test — pure logic, node env)

**Source under test:** `src/features/job-leads/lib/prioritization.ts`

**Formula and weights** (source lines 4-43):
```ts
const closenessWeights: Record<string, number> = {
  close_friend: 100, close_colleague: 90, friend: 75, colleague: 60,
  career_contact: 45, acquaintance: 30, linkedin_only: 15, never_met: 5
};

function recencyWeight(lastContactDate: Date | null): number {
  if (!lastContactDate) return 0;
  const daysSince = (Date.now() - lastContactDate.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, 100 - daysSince / 3.65);
}

export function computeBridgeScore(prospect: Prospect, contact: Contact): number {
  const seniority = seniorityWeights[prospect.seniorityLevel] ?? 15;
  const closeness = closenessWeights[contact.closeness ?? 'acquaintance'] ?? 30;
  const recency = recencyWeight(contact.lastContactDate);
  return Math.round(0.4 * seniority + 0.35 * closeness + 0.25 * recency);
}
```

**`buildRecommendations` aggregation** (source lines 45-76):
```ts
// Overall contact score = max of their bridge scores
for (const rec of byContact.values()) {
  rec.score = Math.max(...rec.prospects.map((p) => p.bridgeScore));
  rec.prospects.sort((a, b) => b.bridgeScore - a.bridgeScore);
}
return Array.from(byContact.values()).sort((a, b) => b.score - a.score);
```

**Apply pattern** (D-11.5):
- Weight composition: feed a known `Prospect` (e.g. `seniorityLevel: 'vp'` → weight 85) and `Contact` (`closeness: 'close_friend'` → 100, `lastContactDate: new Date()` → ~100). Assert `Math.round(0.4*85 + 0.35*100 + 0.25*100)` = 94.
- Bounds: assert `0 <= score <= 100` across a fuzz of inputs (use `@faker-js/faker` from `devDependencies` per CONTEXT line 117).
- Monotonicity sanity: raising `seniority` from `ic` (20) to `c_suite` (100) with all else equal must increase the score.
- `buildRecommendations`: when same contact appears in multiple bridges, overall `score === max(prospects[].bridgeScore)` and `prospects` array is sorted desc.

**Type signature reminders** (from `src/lib/domain/types.ts` and `prioritization.ts`):
```ts
export type ProspectWithBridge = Prospect & { bridge: ProspectBridge };
export type PrioritizedRecommendation = {
  contact: Contact;
  score: number;
  prospects: Array<{ prospect: Prospect; bridgeScore: number }>;
};
```

---

### `src/features/job-leads/lib/seniority.test.ts` (test — pure logic, node env)

**Source under test:** `src/features/job-leads/lib/seniority.ts`

**Rules table** (source lines 9-45):
```ts
const rules: SeniorityRule[] = [
  { patterns: /\b(chief|ceo|cto|cfo|coo|cmo|cpo|c-suite)\b/i, level: 'c_suite', weight: 100 },
  { patterns: /\b(vp|vice\s+president)\b/i, level: 'vp', weight: 85 },
  { patterns: /\bdirector\b/i, level: 'director', weight: 70 },
  { patterns: /\b(senior\s+manager|head\s+of)\b/i, level: 'senior_manager', weight: 55 },
  { patterns: /\bmanager\b/i, level: 'manager', weight: 40 },
  { patterns: /\b(senior|staff|principal|lead)\b/i, level: 'senior_ic', weight: 30 },
  { patterns: /\b(entry|intern|junior|associate)\b/i, level: 'entry_level', weight: 10 }
];
```

**Function shape** (source lines 50-66):
```ts
export function inferSeniority(title: string): { level: SeniorityLevel; weight: number }
```

**Apply pattern** (D-12):
- One assertion per rule with a representative title: `'Chief Data Officer'` → `c_suite/100`, `'VP of Engineering'` → `vp/85`, `'Senior Director'` → `director/70` (director wins because rules array order), etc.
- Edge cases: empty string → `unknown/15`, `'Software Engineer'` (matches roleWordPattern only) → `ic/20`, gibberish `'Banana'` → `unknown/15`.
- Order-sensitivity: `'Senior Manager'` must hit the `senior_manager` rule BEFORE the looser `senior` rule (regression guard for rule order changes).

---

### `src/app/api/contacts/import/route.test.ts` (test — DB integration, node env)

**Source under test:** `src/app/api/contacts/import/route.ts`

**Route shape** (source lines 23-48):
```ts
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const defaultCloseness = defaultClosenessSchema.parse(
      formData.get('defaultCloseness') || 'acquaintance'
    );
    if (!file || !(file instanceof File)) return validationError('CSV file is required');

    let text = await file.text();
    // LinkedIn CSV exports include a notes preamble before the actual headers.
    const headerIndex = text.indexOf('First Name');
    if (headerIndex > 0) text = text.substring(headerIndex);

    const parsed = Papa.parse<LinkedInRow>(text, {
      header: true, skipEmptyLines: true,
      transformHeader: (h: string) => h.trim()
    });
    ...
```

**Expected LinkedIn CSV columns** (source lines 13-21):
```ts
interface LinkedInRow {
  'First Name'?: string;
  'Last Name'?: string;
  'Email Address'?: string;
  'Company'?: string;
  'Position'?: string;
  'Connected On'?: string;
  'URL'?: string;
}
```

**Timeline side-effect** (source lines 145-151):
```ts
if (created > 0) {
  await logTimeline({
    eventType: 'contacts_imported',
    title: `Imported ${created} contacts from LinkedIn CSV`,
    metadata: { created, skipped, errors: errors.length }
  });
}
```

**Apply pattern** (D-11.4 + D-11.3):
1. `beforeEach`: `const db = await createTestDb(); vi.mock('@/lib/db', () => ({ db }))`.
2. Happy path: build a `FormData` with a sample LinkedIn CSV (UTF-8, header row present, 3 valid rows). Construct `new Request('http://localhost/api/contacts/import', { method: 'POST', body: formData })`. Call `POST(request)`. Assert response is `{ success: true, data: { created: 3, skipped: 0, errors: [] } }` and that `db.select().from(contacts)` returns 3 rows.
3. Edge case (preamble): CSV with LinkedIn's notes-preamble text before `First Name` — must still parse (verifies the `headerIndex > 0` strip logic).
4. Edge case (malformed row): one row missing `First Name` — must record an error in `errors[]` but not crash. Other valid rows succeed.
5. Edge case (empty file): `validationError('CSV file is required')` returns `{ success: false, error: ... }` with status 400.
6. Timeline assertion (D-07, D-11.3): after success, query the real `timeline_events` table via PGlite; expect exactly one row with `eventType: 'contacts_imported'` and a `title` matching `/Imported 3 contacts/`.

**Fixture location** (D-04, CONTEXT line 33):
- `src/app/api/contacts/import/__fixtures__/linkedin-connections.csv` — colocated with the test. No global fixtures dir.

---

### `src/app/api/applications/[id]/status/route.test.ts` (test — DB integration, node env)

**Source under test:** `src/app/api/applications/[id]/status/route.ts`

**Validation + transition flow** (source lines 15-77):
```ts
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status: newStatus } = statusChangeSchema.parse(body);

    const [application] = await db.select().from(applications).where(eq(applications.id, id));
    if (!application) return notFound('Application');

    const oldStatus = application.status;
    if (!canTransition(oldStatus, newStatus)) {
      return validationError(`Invalid transition: ${oldStatus} -> ${newStatus}`);
    }

    const [updated] = await db.update(applications).set({
      status: newStatus, statusChangedAt: new Date(), updatedAt: new Date(),
      ...(newStatus === 'applied' && !application.appliedDate ? { appliedDate: new Date() } : {}),
      lastActivityDate: new Date()
    }).where(eq(applications.id, id)).returning();

    const [company] = await db.select({ name: companies.name })
      .from(companies).where(eq(companies.id, application.companyId));

    await logTimeline({
      eventType: 'application_status_changed',
      title: `${company?.name || 'Unknown'}: ${oldStatus.replace('_', ' ')} -> ${newStatus.replace('_', ' ')}`,
      applicationId: id, companyId: application.companyId,
      metadata: { from: oldStatus, to: newStatus }
    });

    return success(updated);
  } catch (err) { ... }
}
```

**Apply pattern** (D-11.1, D-11.2, D-11.3 — the write-path + transition + timeline + envelope trifecta):
1. Seed a `company` and `application` (status `'researching'`) in PGlite via Drizzle inserts (use the same shape as `drizzle/seed.ts` for pipeline_stages, adapt for the entity).
2. Valid transition: `callRoute(PATCH, { method: 'PATCH', body: { status: 'applied' }, params: { id } })`. Assert 200, `{ success: true, data: { status: 'applied', ... } }`, and that `timeline_events` has one new row with `eventType: 'application_status_changed'`.
3. Invalid transition: body `{ status: 'offer' }` from `'researching'` → assert 400, `{ success: false, error: /Invalid transition/ }`.
4. Not found: random UUID → 404, `{ success: false, error: 'Application not found' }`.
5. Zod failure: body `{ status: 'made_up_status' }` → 400, `{ success: false, error: ... }`.

---

### `src/app/api/contacts/route.test.ts` (test — DB integration, node env)

**Source under test:** `src/app/api/contacts/route.ts`

**GET pattern with cursor pagination** (source lines 41-97):
```ts
const limit = parseLimit(searchParams.get('limit'));
const cursor = parseCursor(searchParams.get('cursor'));
// ... build conditions[], execute query, paginated()
return paginated(data, {
  cursor: data.length > 0 ? data[data.length - 1].updatedAt.toISOString() : null,
  hasMore
});
```

**POST pattern (create + timeline)** (source lines 99-137):
```ts
const validated = createContactSchema.parse(body);
const [contact] = await db.insert(contacts).values(values).returning();
await logTimeline({
  eventType: 'contact_added',
  title: `Added ${validated.firstName} ${validated.lastName} (${validated.relationship || 'contact'})`,
  contactId: contact.id, companyId: validated.companyId || undefined
});
return created(contact);
```

**Apply pattern** — pick this as the representative "read endpoint" for envelope shape coverage (D-11.1):
- `GET` empty: `{ success: true, data: [], meta: { cursor: null, hasMore: false } }`.
- `GET` with seeded contacts: assert `data.length`, `meta.hasMore`, status 200.
- `POST` happy path: 201, envelope `{ success: true, data: <Contact> }`, plus a `timeline_events` row with `eventType: 'contact_added'` and matching `contactId` (D-11.3).
- `POST` invalid body (e.g. empty `firstName`): 400, `{ success: false, error: ... }`.

---

### `src/components/layout/app-sidebar.test.tsx` (test — BUG-01 regression, mixed env)

**Sources under test:**
- `src/components/layout/app-sidebar.tsx` (lines 49-198 — default export `AppSidebar`; uses `useUser` from `@clerk/nextjs`, `usePathname`/`useRouter` from `next/navigation`)
- `src/components/user-avatar-profile.tsx` (lines 13-39 — named export `UserAvatarProfile`)

**Key risk locations** (the BUG-01 footprint per CONTEXT line 92):
- `app-sidebar.tsx` line 148: `UserAvatarProfile` inside `SidebarMenuButton` (this is the `<button>` parent). The SSR output must NOT contain a `<div>` descendant of any `<button>`.
- `app-sidebar.tsx` line 164: `UserAvatarProfile` inside `DropdownMenuLabel` (second render — also must survive).
- `user-avatar-profile.tsx` line 19: outermost element is `<span class='flex items-center gap-2'>` — this is the post-fix structure. The SSR test asserts this `<span>` shows up.

**Clerk dependency to mock** (`app-sidebar.tsx` lines 34, 43):
```ts
import { useUser } from '@clerk/nextjs';
import { SignOutButton } from '@clerk/nextjs';
```

**Apply pattern** (D-14, D-15, D-16):

**File layout — one file, two describes** (per specifics CONTEXT line 145):
```
// SSR describe block — default node environment
describe('AppSidebar SSR structural (BUG-01)', ...)

// Hydration describe block — opted into jsdom
// @vitest-environment jsdom
describe('AppSidebar hydration mount (BUG-01)', ...)
```
The pragma `// @vitest-environment jsdom` must be on its own line at the top of the file (vitest only honors per-file pragmas, not per-describe). If both envs are required in one file, the planner may need to split into `app-sidebar.ssr.test.tsx` (node) and `app-sidebar.hydration.test.tsx` (jsdom). This is a wiring detail to confirm; the contract from D-14 is "two tests, BUG-01 fence visible in one place."

**Clerk mock pattern** (D-16):
```ts
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    user: {
      fullName: 'Steve Bronstein',
      imageUrl: 'https://img.clerk.com/test',
      emailAddresses: [{ emailAddress: 'steve@bronstein.org' }]
    }
  }),
  SignOutButton: ({ children }: { children?: React.ReactNode }) => children ?? null
}));
```
Also stub `next/navigation`: `usePathname() → '/dashboard/overview'`, `useRouter() → { push: vi.fn() }`.

**SSR structural assertions** (D-14 bullet 1):
```ts
import { renderToString } from 'react-dom/server';
import AppSidebar from '@/components/layout/app-sidebar';

const html = renderToString(<AppSidebar />);
// Assert 1: no <div> inside any <button>
expect(html).not.toMatch(/<button[^>]*>[^<]*(?:<(?!\/button)[^>]*>)*?<div\b/i);
// Or parse with a DOM lib (jsdom is available even in node tests if imported directly) and walk
// every <button>, verify .querySelector('div') is null.

// Assert 2: UserAvatarProfile rendered in SSR output — its <span class='flex items-center gap-2'>
// outermost is a stable signature.
expect(html).toContain('flex items-center gap-2');
// Stronger assertion: name + email from the mock user appear in markup
expect(html).toContain('Steve Bronstein');
expect(html).toContain('steve@bronstein.org');
```

**Hydration mount assertions** (D-14 bullet 2, D-15):
```ts
// @vitest-environment jsdom  (top of file)
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

const html = renderToString(<AppSidebar />);
const container = document.createElement('div');
container.innerHTML = html;
document.body.appendChild(container);

const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
hydrateRoot(container, <AppSidebar />);
// Flush microtasks / wait a tick so React commits.
await new Promise((r) => setTimeout(r, 0));

const hydrationCalls = errorSpy.mock.calls.filter(([msg]) =>
  typeof msg === 'string' && (/hydrat/i.test(msg) || /did not match/i.test(msg))
);
expect(hydrationCalls).toEqual([]);
errorSpy.mockRestore();
```

**Default-export note:** `AppSidebar` is a **default export** (`app-sidebar.tsx` line 49: `export default function AppSidebar()`). Per CONVENTIONS this is the legacy shape — the test imports it as a default. Do not change the export to fix conventions; that is out of scope for this phase.

---

### Fixture: `src/app/api/contacts/import/__fixtures__/linkedin-connections.csv`

**Analog:** LinkedIn CSV column shape documented in `src/app/api/contacts/import/route.ts` lines 13-21 and the preamble-strip logic at lines 39-42.

**Apply pattern:** Generate a CSV with:
1. A LinkedIn-style preamble (3-4 lines of notes text) followed by a blank line, then the header row starting with `First Name`. The route strips everything before the first occurrence of `First Name`.
2. Header row: `First Name,Last Name,Email Address,Company,Position,Connected On,URL`.
3. ~3-5 happy-path rows with realistic data.
4. At least one malformed row variant (missing `First Name` or empty fields) for the edge-case test (D-11.4).
5. UTF-8 encoding. No BOM unless adding a separate fixture for that specific edge case.

---

## Shared Patterns

### `vi.mock('@/lib/db')` to wire PGlite into the singleton

**Source:** `src/lib/db/index.ts` (singleton) + `src/lib/db/timeline.ts` line 1 (`import { db } from './index';`)

**Apply to:** Every test that exercises an API route or `logTimeline`.

```ts
import { createTestDb } from '@/test-utils/pglite';

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeEach(async () => {
  db = await createTestDb();
  vi.doMock('@/lib/db', () => ({ db }));
});

afterEach(() => {
  vi.resetModules();
});
```

Once `@/lib/db` is mocked, `logTimeline` (which imports `db` from `./index`) automatically writes to the PGlite-backed instance. No second mock of `@/lib/db/timeline` needed (D-07).

### Envelope assertions

**Source:** `src/lib/api/types.ts` lines 1-10 (`ApiResponse<T>`) + `src/lib/api/errors.ts` lines 1-21

**Apply to:** Every API-route test.

```ts
const res = await POST(request);
const body = await res.json();

// Success:
expect(res.status).toBe(201);
expect(body).toMatchObject({ success: true, data: expect.any(Object) });

// Error:
expect(res.status).toBe(400);
expect(body).toMatchObject({ success: false, error: expect.any(String) });
```

### Timeline side-effect assertion

**Source:** `src/lib/db/timeline.ts` lines 17-22 (single insert into `timeline_events`)

**Apply to:** Every write-path API test under `D-11.3`.

```ts
import { timelineEvents } from '../../../drizzle/schema';

await POST(request);

const rows = await db.select().from(timelineEvents);
expect(rows).toHaveLength(1);
expect(rows[0]).toMatchObject({
  eventType: 'contact_added',
  title: expect.stringContaining('Added '),
  contactId: expect.any(String)
});
```

### Path-alias imports (mirror `tsconfig.json`)

**Source:** `tsconfig.json` lines 21-28

**Apply to:** All test files.

```ts
import { canTransition } from '@/lib/domain/pipeline';
import { computeBridgeScore } from '@/features/job-leads/lib/prioritization';
import { createTestDb } from '@/test-utils/pglite';
```

Vitest config must wire the same alias via `resolve.alias` for these imports to resolve.

### Naming + style (CONVENTIONS.md + CLAUDE.md)

**Apply to:** All test files.

- File names: kebab-case + `.test.ts` (D-03). For React component tests: `.test.tsx`.
- Test functions/variables: camelCase.
- Single quotes, 2-space indent, no trailing commas, semicolons present.
- Named exports only for helpers (`createTestDb`, `callRoute`).
- Path alias `@/*` everywhere; never relative-walk from `src/` (the exception is API routes that use deep `../../../../drizzle/schema` — tests should still use `@/lib/...` for helpers but matching schema imports can either stay relative or use `@/...` depending on whether the planner adds a `drizzle` alias).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | | | Every new file has a config, wiring, or source-under-test analog. The "no existing tests" situation makes this entire phase greenfield for *test* analogs, but the **wiring** (drizzle.config, db/index.ts singleton) and **source-under-test** files give the planner concrete signatures and behaviors to assert against, which is what tests actually need. |

## Metadata

**Analog search scope:**
- `src/lib/` (api helpers, db, domain)
- `src/app/api/` (all route handlers)
- `src/features/job-leads/lib/` (prioritization, seniority)
- `src/components/layout/` and `src/components/` (BUG-01 components)
- `drizzle/` (schema, migrations, seed)
- Root config files (`tsconfig.json`, `next.config.ts`, `drizzle.config.ts`, `package.json`)

**Files scanned:** ~18 source files read in full; directory listings of api routes and migrations.

**Pattern extraction date:** 2026-05-12
