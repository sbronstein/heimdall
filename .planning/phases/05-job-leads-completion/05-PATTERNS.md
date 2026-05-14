# Phase 5: Job Leads Completion - Pattern Map

**Mapped:** 2026-05-13
**Files analyzed:** 17 (5 new / 7 modified / 5 deleted)
**Analogs found:** 14 / 17 (3 deletions have no analog by design; 1 skill-asset is a first-of-kind in-repo file pattern but has user-global SKILL.md analogs)

## File Classification

| New/Modified/Deleted File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------------|------|-----------|----------------|---------------|
| **NEW** `src/app/api/job-leads/[id]/prospects/route.ts` | api-route (POST) | bulk-insert, request-response | `src/app/api/contacts/import/route.ts` (POST, bulk-with-timeline) + `src/app/api/contacts/import/categorize/route.ts` (PATCH, validated bulk body) | exact (composite) |
| **NEW** `scripts/generate-api-token.ts` | script (TS, one-shot CLI) | file-I/O, hash-and-print | `scripts/import-linkedin.ts` (TS script, .env.local + neon + main() + process.exit) | role-match (only TS script in `scripts/`; not a DB script but mirrors top-level shape and shebang-style entry) |
| **NEW** `.claude/skills/scrape-linkedin-connections/SKILL.md` | skill-asset (frontmatter + prompt body) | event-driven (Claude reasons over a11y tree) | No in-repo analog. **User-global reference:** `~/.claude/skills/gsd-review/SKILL.md` for frontmatter shape (`name`, `description`, `argument-hint`, `allowed-tools` keys + `---` fences + prompt body following). | external-only |
| **NEW** `.claude/skills/scrape-linkedin-connections/references/linkedin-navigation.md` | skill-asset (reference doc) | request-response (read by Claude during skill run) | No in-repo analog. Style reference: any `.planning/*.md` reference doc with checklists. | external-only |
| **NEW** `.claude/skills/scrape-linkedin-connections/references/heimdall-api.md` | skill-asset (reference doc) | request-response | No in-repo analog. Content is derived from this PATTERNS.md and the bulk-prospects route signature. | external-only |
| **NEW** `.claude/skills/scrape-linkedin-connections/references/troubleshooting.md` | skill-asset (reference doc) | request-response | No in-repo analog. | external-only |
| **MOD** `src/proxy.ts` | middleware (auth, route-matcher) | request-response | self (existing pattern in the same file) — extend the early `isApiPath` branch (lines 12–32) with a bearer-token bypass *before* `auth()` is called | exact (extension of an existing branch) |
| **MOD** `src/app/api/job-leads/[id]/status/route.ts` (currently GET-only) | api-route (PATCH new + GET keep) | request-response, state-machine | `src/app/api/applications/[id]/status/route.ts` (PATCH with `canTransition` + Zod + Drizzle update + timeline event) | exact |
| **MOD** `src/app/api/job-leads/[id]/search/route.ts` | api-route (POST → thin status-flip) | request-response | `src/app/api/applications/[id]/status/route.ts` (PATCH state-machine — apply same shape but POST-without-body, fixed target `queued`); plus self (drop the fire-and-forget IIFE at lines 39–96 entirely) | exact |
| **MOD** `src/app/api/job-leads/route.ts` (GET extension) | api-route (GET filter extension) | request-response | `src/app/api/tasks/route.ts` GET handler (`parseArrayParam('status')` + `inArray(tasks.status, statuses as ...)` + cursor + cursor-pagination) | exact |
| **MOD** `src/features/job-leads/components/job-lead-detail.tsx` | feature-component (client, `'use client'`) | event-driven (click → fetch → toast) | `src/features/contacts/components/interaction-form.tsx` (toast on success/error + REST fetch + router.refresh) | role-match (replace `Find Connections` button + remove `SearchProgress` import + add copy-to-clipboard + error banner) |
| **MOD** `drizzle/schema/enums.ts` | schema (pgEnum) | n/a | self (line 160 `jobLeadStatusEnum` — append `'queued'` and `'failed'`) | exact |
| **MOD** `drizzle/schema/job-leads.ts` | schema (table column add) | n/a | self (lines 36–39 timestamp column pattern: `archivedAt: timestamp('archived_at')`); for `last_error`: `roleTitle: text('role_title')` (line 20, nullable text) | exact |
| **NEW** `drizzle/migrations/<auto>_add_queued_failed_status_and_error_columns.sql` | migration (DDL) | n/a | `drizzle/migrations/0002_shocking_preak.sql` (single-line `ALTER TYPE ... ADD VALUE 'x' BEFORE 'y'` — pre-existing analog for non-transactional enum-add); for column adds: `drizzle/migrations/0001_volatile_mastermind.sql` (`ALTER TABLE ... ADD COLUMN ... timestamp;` pattern) | exact |
| **MOD** `env.example.txt` | config (env template) | n/a | self (existing structure: section header + `KEY=` lines) — add `API_TOKEN_HASH=` and `SINGLE_USER_EMAIL=` placeholders | exact |
| **DELETE** `src/features/job-leads/lib/scrape-connections.ts` | feature-lib (Playwright) | n/a (removal) | No analog — file is being removed. Cleanup verification: `src/__cleanup__.test.ts` pattern (lines 8–22 `deletedPaths` array + `expect(existsSync(...)).toBe(false)`) | cleanup-test-match |
| **DELETE** `src/features/job-leads/components/search-progress.tsx` | feature-component (polling) | n/a (removal) | Same cleanup pattern as above | cleanup-test-match |
| **DELETE (or in-place edit)** `Find Connections` button block in `src/features/job-leads/components/job-lead-detail.tsx` | feature-component fragment | n/a (removal) | Same cleanup pattern; the *file* survives, only the button + `SearchProgress` + `useCallback handleFindConnections` go | partial — file remains, content changes |

---

## Pattern Assignments

### NEW `src/app/api/job-leads/[id]/prospects/route.ts` (api-route, bulk-insert with timeline)

**Primary analog:** `src/app/api/contacts/import/route.ts` (POST handler — bulk row insertion with deduplication and a single timeline-event-on-success)
**Secondary analog:** `src/app/api/contacts/import/categorize/route.ts` (PATCH — Zod-validated array body; same `bulkCategorizeSchema = z.object({ updates: z.array(...) })` shape)
**State-machine analog:** `src/app/api/applications/[id]/status/route.ts` (canTransition + `notFound('Application')` + Drizzle `.set({ status, updatedAt: new Date() })` + timeline event with metadata)

**Imports pattern** (compose from `src/app/api/contacts/import/route.ts` lines 1–9 + `src/app/api/applications/[id]/status/route.ts` lines 1–9):
```typescript
import { db } from '@/lib/db';
import { jobLeads, prospects } from '../../../../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { created } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';
```

**Zod schema pattern** (per CONTEXT.md D-22; shape mirrors `bulkCategorizeSchema` in `src/app/api/contacts/import/categorize/route.ts` lines 9–16):
```typescript
const prospectSchema = z.object({
  name: z.string().min(1).max(200),
  title: z.string().max(300).nullable(),
  linkedinUrl: z.string().url().nullable(),
  mutualConnectionNames: z.array(z.string().max(200)).max(50)
});
const bulkBody = z.object({ prospects: z.array(prospectSchema).max(200) });
```

**Route handler shell** (copy from `src/app/api/applications/[id]/status/route.ts` lines 15–77 — the `async function PATCH(request, { params })` shape, except this is `POST`):
```typescript
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { prospects: scraped } = bulkBody.parse(body);

    // Verify lead exists and is in 'searching' status (D-08 state-machine guard)
    const [lead] = await db.select().from(jobLeads).where(eq(jobLeads.id, id)).limit(1);
    if (!lead) return notFound('Job lead');
    if (lead.status !== 'searching') {
      return validationError(`Cannot write prospects to lead in status '${lead.status}'`);
    }

    // Single bulk insert — array values (NOT a for-loop; the perf antipattern at
    // src/app/api/job-leads/[id]/search/route.ts:47-57 is what this route avoids)
    const rows = scraped.map((p) => ({
      jobLeadId: id,
      name: p.name,
      title: p.title,
      linkedinUrl: p.linkedinUrl,
      // seniorityLevel: skill writes 'unknown'; planner may infer here via inferSeniority(p.title)
    }));
    await db.insert(prospects).values(rows);

    // Flip lead to 'found', clear error state, set prospectCount
    const [updated] = await db
      .update(jobLeads)
      .set({
        status: 'found',
        prospectCount: rows.length,
        lastError: null,
        lastErrorAt: null,
        updatedAt: new Date()
      })
      .where(eq(jobLeads.id, id))
      .returning();

    // Timeline event — copy shape from src/app/api/job-leads/[id]/search/route.ts:75-85
    await logTimeline({
      eventType: 'job_lead_search_complete',
      title: `Found ${rows.length} prospects at ${lead.companyName}`,
      companyId: lead.companyId || undefined,
      metadata: { jobLeadId: id, prospectCount: rows.length }
    });

    return created({ insertedCount: rows.length, lead: updated });
  } catch (err) {
    if (err instanceof z.ZodError) return validationError(err.issues[0].message);
    return serverError(err);
  }
}
```

**Error handling pattern** (copy from `src/lib/api/errors.ts` + `src/app/api/contacts/import/route.ts` lines 154–157):
- `z.ZodError` → `validationError(err.issues[0].message)` (400)
- `!lead` → `notFound('Job lead')` (404)
- unknown → `serverError(err)` (500 + `console.error('API Error:', err)`)

---

### NEW `scripts/generate-api-token.ts` (script, file-I/O)

**Primary analog:** `scripts/import-linkedin.ts` (only existing TS script in `scripts/`)

**Imports pattern** (copy from `scripts/import-linkedin.ts` lines 1–11, drop the DB bits):
```typescript
import { config } from 'dotenv';
config({ path: '.env.local' });
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomBytes, createHash } from 'crypto';
```

**Entry-point pattern** (copy `scripts/import-linkedin.ts` lines 30–131 shape — top-level `async function main()` + `main().catch(...)` with `process.exit`):
```typescript
async function main() {
  // 1. Generate 32-byte random hex
  const token = randomBytes(32).toString('hex');
  // 2. SHA-256 hash
  const hash = createHash('sha256').update(token).digest('hex');
  // 3. Write token to ~/.heimdall/api-token (chmod 600)
  const dir = path.join(os.homedir(), '.heimdall');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tokenPath = path.join(dir, 'api-token');
  fs.writeFileSync(tokenPath, token, { mode: 0o600 });
  // 4. Print hash + instructions to stdout
  console.log(`Token written to ${tokenPath}.`);
  console.log(`Add to .env.local:\n  API_TOKEN_HASH=${hash}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

**Run pattern** (the script must be invokable via `npx tsx scripts/generate-api-token.ts` — same pattern as `db:seed` in `package.json:23` which uses `npx tsx`). Planner may also add a `package.json` script entry, e.g. `"token:generate": "tsx scripts/generate-api-token.ts"`, to align with existing scripts shape.

---

### NEW `.claude/skills/scrape-linkedin-connections/SKILL.md` (skill-asset)

**No in-repo analog** — this is the first `.claude/skills/*/SKILL.md` file in the heimdall repo.

**External reference for frontmatter shape:** `~/.claude/skills/gsd-review/SKILL.md` (user-global). Concrete frontmatter pattern to copy:
```yaml
---
name: scrape-linkedin-connections
description: "Scrape 2nd-degree LinkedIn connections at a target company. Drives vercel-labs/agent-browser through job → company → employees → 2nd-degree filter, extracts prospects, writes them back to Heimdall."
argument-hint: "[job-lead-id-or-url]"
allowed-tools:
  - Read
  - Bash
---
```

**Notes for planner (per CONTEXT.md D-03, CD-07, and specifics):**
- Body should walk Claude (in Claude Code) through: arg parsing → claim lead (PATCH /status to `searching`) → bash-call `agent-browser` → reason over a11y tree → POST /prospects → on failure PATCH /status to `failed` with `last_error`.
- Reference the four supporting files in `references/` via Markdown links (those files are skill-asset siblings).
- Single-quote scalar style + 2-space YAML indentation in the frontmatter to match the repo's Prettier conventions (single quotes, 2-space) per CONVENTIONS.md.

---

### NEW `.claude/skills/scrape-linkedin-connections/references/linkedin-navigation.md`, `heimdall-api.md`, `troubleshooting.md`

**No in-repo analog.** These are plain Markdown documentation files Claude reads during a skill run.

**Style guidance:** Use the same warm earth-tone HTML conventions are *not* applicable (these are referenced by Claude, not rendered as HTML companions per the user's global CLAUDE.md note — they're under `.claude/skills/`, not `.planning/`). Pure markdown.

**heimdall-api.md content source:** This PATTERNS.md (the bulk-prospects POST shape, the `/api/job-leads?status=queued` filter shape, the `/api/job-leads/[id]/status` PATCH shape, the `Authorization: Bearer <token>` header).

---

### MOD `src/proxy.ts` (middleware — extend with bearer-token bypass)

**Analog:** self — extend the existing `isApiPath` branch (lines 12–32).

**Existing pattern to preserve** (`src/proxy.ts` lines 12–32):
```typescript
if (isApiPath) {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
  // ... email lock check ...
  return;
}
```

**Bearer-token bypass to add — BEFORE the `await auth()` call** (per CONTEXT.md D-19 / D-21 and the specifics block):
```typescript
if (isApiPath) {
  // D-19/D-21: long-lived bearer token bypass for Claude Code skill (single-user only)
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    const hash = await sha256Hex(token);
    const expected = process.env.API_TOKEN_HASH;
    const singleUser = process.env.SINGLE_USER_EMAIL;
    if (expected && hash === expected && singleUser === ALLOWED_EMAIL) {
      // Bypass Clerk entirely — return undefined to let the request through
      return;
    }
    // Invalid token → fall through to Clerk session check (returns 401 envelope below)
  }

  // ... existing Clerk session check (lines 19–31 preserved as-is) ...
}
```

**`sha256Hex` helper** — add at top of file or import from a new `src/lib/auth/token.ts` (planner decides). Pattern (Web Crypto, Edge-compatible since middleware runs at the edge):
```typescript
async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
```

**Note on file rename:** CONTEXT.md says "the middleware in `src/middleware.ts` (Phase 3) is extended" — but the actual file is `src/proxy.ts` (confirmed `ls`). Phase 3's 03-01-PLAN renamed `src/proxy.ts` → `src/middleware.ts` per ROADMAP.md, but the rename did not land — the file is still `src/proxy.ts` and is referenced as such by `src/proxy.test.ts`. **The planner edits `src/proxy.ts` directly** unless they also want to land the rename (recommend: leave the rename out; out-of-scope for Phase 5).

**Test analog** — `src/proxy.test.ts` is the existing test harness (vi.hoisted + Proxy mock of `@clerk/nextjs/server`). New test cases to add (per CONTEXT.md D-25 layer 1 bullet 4):
- Bearer token present + valid hash + `SINGLE_USER_EMAIL` set → returns `undefined` (pass-through), Clerk `auth()` is NOT called
- Bearer token present + invalid hash → falls through to Clerk; returns 401 envelope
- Bearer token absent → existing behavior unchanged
- `SINGLE_USER_EMAIL` env not set → bearer token rejected even with valid hash (multi-tenant safety)

---

### MOD `src/app/api/job-leads/[id]/status/route.ts` (extend GET-only file with PATCH)

**Primary analog:** `src/app/api/applications/[id]/status/route.ts` (PATCH state-machine handler)

**Existing GET to preserve** (`src/app/api/job-leads/[id]/status/route.ts` lines 7–30 unchanged; the polling client is being deleted but the endpoint itself stays for the timeline-page or for any external poller).

**PATCH to add** (copy from `src/app/api/applications/[id]/status/route.ts` lines 11–77, swap table + enum):
```typescript
import { jobLeads } from '../../../../../../drizzle/schema';
import { z } from 'zod';
import { jobLeadStatusValues } from '@/lib/domain/types';

// D-08: Job-lead state machine (new local function or moved to src/lib/domain/job-lead-pipeline.ts)
const jobLeadTransitions: Record<string, string[]> = {
  pending: ['scraping'],
  scraping: ['scraped', 'pending'],
  scraped: ['queued'],
  queued: ['searching'],
  searching: ['found', 'failed'],
  found: ['ready', 'actioned', 'archived'],
  failed: ['queued'],   // retry path
  ready: ['actioned', 'archived'],
  actioned: ['archived'],
  archived: []
};

function canJobLeadTransition(from: string, to: string): boolean {
  return jobLeadTransitions[from]?.includes(to) ?? false;
}

const statusChangeSchema = z.object({
  status: z.enum(jobLeadStatusValues),       // values array updated in domain/types.ts to include 'queued' + 'failed'
  lastError: z.string().max(220).nullable().optional()  // CD-02: fold error-write into PATCH /status
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status: newStatus, lastError } = statusChangeSchema.parse(body);

    const [lead] = await db.select().from(jobLeads).where(eq(jobLeads.id, id)).limit(1);
    if (!lead) return notFound('Job lead');

    if (!canJobLeadTransition(lead.status, newStatus)) {
      return validationError(`Invalid transition: ${lead.status} -> ${newStatus}`);
    }

    const updateSet: Record<string, unknown> = {
      status: newStatus,
      updatedAt: new Date()
    };
    if (newStatus === 'failed') {
      updateSet.lastError = lastError ?? null;
      updateSet.lastErrorAt = new Date();
    } else if (newStatus === 'queued' || newStatus === 'found') {
      // Retry-from-failed and success-write clear error fields
      updateSet.lastError = null;
      updateSet.lastErrorAt = null;
    }

    const [updated] = await db
      .update(jobLeads)
      .set(updateSet)
      .where(eq(jobLeads.id, id))
      .returning();

    // Timeline event — pattern from src/app/api/applications/[id]/status/route.ts:62-68
    const eventType =
      newStatus === 'queued' ? 'job_lead_search_queued'
      : newStatus === 'failed' ? 'job_lead_search_failed'
      : newStatus === 'searching' ? 'job_lead_search_claimed'
      : 'job_lead_status_changed';

    await logTimeline({
      eventType,
      title: `${lead.companyName || 'Job lead'}: ${lead.status} -> ${newStatus}`,
      companyId: lead.companyId || undefined,
      metadata: { jobLeadId: id, from: lead.status, to: newStatus, lastError: lastError ?? null }
    });

    return success(updated);
  } catch (err) {
    if (err instanceof z.ZodError) return validationError(err.issues[0].message);
    return serverError(err);
  }
}
```

---

### MOD `src/app/api/job-leads/[id]/search/route.ts` (convert to thin status-flip)

**Analog:** `src/app/api/applications/[id]/status/route.ts` (state-machine pattern) + `src/app/api/job-leads/[id]/status/route.ts` PATCH (sibling — once added per above)

**What to delete** (per CONTEXT.md D-12 + D-13):
- The import `scrapeConnections` (line 7) and `matchConnections` (line 8 if no other caller after deletes — planner verifies) and `inferSeniority` (line 9, may stay if needed elsewhere)
- The fire-and-forget IIFE block (lines 39–96)
- The hardcoded synchronous status flip to `'searching'` (lines 33–36)

**What the file becomes** (a thin `scraped → queued` or `failed → queued` flip; recommended new shape per CONTEXT.md D-13):
```typescript
import { db } from '@/lib/db';
import { jobLeads } from '../../../../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [lead] = await db.select().from(jobLeads).where(eq(jobLeads.id, id)).limit(1);
    if (!lead) return notFound('Job lead');

    // Allowed entry states: 'scraped' (first time) or 'failed' (retry)
    if (lead.status !== 'scraped' && lead.status !== 'failed') {
      return validationError(`Cannot queue lead in status '${lead.status}'`);
    }

    const [updated] = await db
      .update(jobLeads)
      .set({
        status: 'queued',
        lastError: null,
        lastErrorAt: null,
        updatedAt: new Date()
      })
      .where(eq(jobLeads.id, id))
      .returning();

    await logTimeline({
      eventType: 'job_lead_search_queued',
      title: `Queued for connection scrape: ${lead.companyName || 'Unknown'}`,
      companyId: lead.companyId || undefined,
      metadata: { jobLeadId: id, from: lead.status, to: 'queued' }
    });

    return success(updated);
  } catch (err) {
    return serverError(err);
  }
}
```

**Alt-path** (CONTEXT.md D-13): if no callers remain after UI changes, delete the route file entirely. The UI's retry button (D-16 / CD-02) currently targets `/search` per the superseded D-02; planner verifies whether the retry button is moved to call `PATCH /status` instead and removes `/search` accordingly.

---

### MOD `src/app/api/job-leads/route.ts` (extend GET with `status` filter)

**Analog:** `src/app/api/tasks/route.ts` GET handler (lines 23–60) — closest existing route with `parseArrayParam('status')` + `inArray(table.status, statuses as ...)` + cursor pagination

**Imports to add** (compose with current `src/app/api/job-leads/route.ts` lines 1–10):
```typescript
import { desc, isNull, inArray, lt, sql } from 'drizzle-orm';
import { parseArrayParam, parseCursor, parseLimit } from '@/lib/api/filters';
import { jobLeadStatusValues } from '@/lib/domain/types';   // values array updated to include 'queued' + 'failed'
```

**Concrete change to current `src/app/api/job-leads/route.ts` lines 17–32** (insert between cursor parse and the `where` build, exactly mirroring `src/app/api/tasks/route.ts` lines 28 + 34–36):
```typescript
const statuses = parseArrayParam(searchParams.get('status'));

const conditions = [isNull(jobLeads.archivedAt)];

if (statuses) {
  conditions.push(
    inArray(jobLeads.status, statuses as (typeof jobLeadStatusValues)[number][])
  );
}

if (cursor) {
  conditions.push(lt(jobLeads.updatedAt, cursor));
}
```

Rest of the GET handler (lines 28–52) unchanged.

---

### MOD `src/features/job-leads/components/job-lead-detail.tsx`

**Primary analog:** `src/features/contacts/components/interaction-form.tsx` (use-client component with REST fetch + sonner toast on success/failure)
**Clipboard analog:** No in-repo `navigator.clipboard` usage exists today (`grep` returns zero hits) — the new copy-skill-invocation button is a first-of-kind for this codebase. Use standard `navigator.clipboard.writeText(...)` per the specifics block.
**Badge analog:** `src/components/ui/badge.tsx` — use `<Badge variant='secondary'>` for `queued`, `<Badge variant='destructive'>` for `failed`, or pass the explicit Tailwind classes from CONTEXT.md specifics (`bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200`).

**Imports to update** (current `src/features/job-leads/components/job-lead-detail.tsx` lines 1–11):
```typescript
'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { IconCopy, IconArrowLeft, IconRefresh } from '@tabler/icons-react';
import { toast } from 'sonner';
import Link from 'next/link';
import type { JobLead } from '@/lib/domain/types';
import { ScrapeResults } from './scrape-results';
import { TriageTrigger } from './triage-trigger';
import { RecommendationList } from './recommendation-list';
// DELETED: import { SearchProgress } from './search-progress';   // D-12
```

**Copy-skill-invocation handler** (the new feature; pattern blended from `src/features/contacts/components/interaction-form.tsx` lines 33–67):
```typescript
const handleCopyInvocation = useCallback(async () => {
  try {
    await navigator.clipboard.writeText(`claude /scrape-linkedin-connections ${lead.id}`);
    toast.success('Skill invocation copied — paste in Claude Code');
  } catch {
    toast.error('Failed to copy to clipboard');
  }
}, [lead.id]);
```

**Retry handler** (per CONTEXT.md D-16 — retry button for `failed` status):
```typescript
const handleRetry = useCallback(async () => {
  try {
    const res = await fetch(`/api/job-leads/${lead.id}/search`, { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      setLead((prev) => ({ ...prev, status: 'queued', lastError: null, lastErrorAt: null }));
      toast.success('Re-queued for connection scrape');
    } else {
      toast.error(json.error || 'Retry failed');
    }
  } catch {
    toast.error('Retry failed');
  }
}, [lead.id]);
```

**`queued` badge block** (replaces lines 60–67 of the current file):
```tsx
{lead.status === 'queued' && (
  <div className='space-y-2'>
    <Badge variant='secondary'>queued for connection scrape</Badge>
    <Button variant='secondary' onClick={handleCopyInvocation}>
      <IconCopy className='mr-1 h-4 w-4' />
      Copy skill invocation
    </Button>
    <p className='text-muted-foreground text-xs'>
      Paste in Claude Code (this directory) to run.
    </p>
  </div>
)}
```

**`failed` error banner block** (new; styling from CONTEXT.md specifics, structure mirrors any inline-callout in the codebase — closest visual analog is `src/components/ui/alert.tsx` if planner wants to use the primitive directly):
```tsx
{lead.status === 'failed' && (
  <div className='rounded-md border border-destructive/30 bg-destructive/10 p-4'>
    <p className='font-medium'>
      {lead.lastError?.split(':')[0] || 'Scrape failed'}
    </p>
    <p className='text-muted-foreground text-sm'>
      {lead.lastError?.split(':').slice(1).join(':').trim() || 'No detail captured'}
    </p>
    <Button onClick={handleRetry} variant='outline' className='mt-2'>
      <IconRefresh className='mr-1 h-4 w-4' />
      Retry
    </Button>
  </div>
)}
```

**Lines to remove** (CONTEXT.md D-12 + D-16):
- Line 9 `import { SearchProgress } ...`
- Lines 24, 26–34, 36–46 (`isSearching` state, `handleFindConnections`, `handleSearchComplete`)
- Lines 60–75 (`Find Connections` button + `SearchProgress` rendering)

---

### MOD `drizzle/schema/enums.ts` (add `queued` + `failed` to `jobLeadStatusEnum`)

**Analog:** self — `drizzle/schema/enums.ts` lines 160–169 (the existing `jobLeadStatusEnum` definition)

**Change** (insert `'queued'` after `'scraped'`, append `'failed'` at end — order matters because Drizzle Kit generates `ALTER TYPE ... ADD VALUE ... AFTER ...` SQL based on the array order):
```typescript
export const jobLeadStatusEnum = pgEnum('job_lead_status', [
  'pending',
  'scraping',
  'scraped',
  'queued',       // NEW (D-06) — inserted after 'scraped'
  'searching',
  'found',
  'ready',
  'actioned',
  'archived',
  'failed'        // NEW (D-06) — appended; terminal-recoverable
]);
```

**Parallel update in `src/lib/domain/types.ts` lines 205–214** — the `jobLeadStatusValues` `as const` array MUST be kept in sync (per CONVENTIONS.md "Enum value arrays in `src/lib/domain/types.ts` are shared between Zod schemas in API routes and UI option lists"):
```typescript
export const jobLeadStatusValues = [
  'pending', 'scraping', 'scraped', 'queued',
  'searching', 'found', 'ready', 'actioned', 'archived', 'failed'
] as const;
```

---

### MOD `drizzle/schema/job-leads.ts` (add `last_error` + `last_error_at` columns)

**Analog:** self — `drizzle/schema/job-leads.ts` lines 36–40 (existing nullable-timestamp pattern: `archivedAt: timestamp('archived_at')`)
**Secondary analog (text-nullable):** lines 20–22 (`roleTitle: text('role_title')`, `companyName: text('company_name')` — nullable text columns)

**Change** (append between `prospectCount` and `createdAt`, OR with the other metadata columns — planner picks):
```typescript
export const jobLeads = pgTable('job_leads', {
  // ... existing columns 15–34 ...

  // Error state (D-07) — written by the skill on failure, cleared on retry/success
  lastError: text('last_error'),
  lastErrorAt: timestamp('last_error_at'),

  // Metadata (existing)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at')
});
```

**Note on timezone:** Existing schema columns (`outreachDate`, `linkedinConnectionDate`, etc.) do not pass `{ withTimezone: true }`. CONTEXT.md D-07 says "timestamp with time zone" — planner should override to `timestamp('last_error_at', { withTimezone: true })` if strictly following D-07. Recommended: match existing schema convention (no `withTimezone`) for consistency unless the planner has a reason to break pattern.

---

### NEW `drizzle/migrations/<auto>_add_queued_failed_status_and_error_columns.sql`

**Primary analog (enum-add):** `drizzle/migrations/0002_shocking_preak.sql` (single-line `ALTER TYPE ... ADD VALUE ... BEFORE ...`)
**Secondary analog (column-add):** `drizzle/migrations/0001_volatile_mastermind.sql` (multiple `ALTER TABLE ... ADD COLUMN` statements separated by `--> statement-breakpoint`)

**Existing pattern** (`drizzle/migrations/0002_shocking_preak.sql` full content, 1 line):
```sql
ALTER TYPE "public"."contact_closeness" ADD VALUE 'career_contact' BEFORE 'acquaintance';
```

**Existing column-add pattern** (`drizzle/migrations/0001_volatile_mastermind.sql` lines 3–8):
```sql
ALTER TABLE "contacts" ADD COLUMN "closeness" "contact_closeness" DEFAULT 'acquaintance';--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "outreach_date" timestamp;--> statement-breakpoint
...
```

**Generated migration shape** (per CONTEXT.md D-23 — what Drizzle Kit will likely emit, verified by `npm run db:generate -- --name=add_queued_failed_status_and_error_columns`):
```sql
ALTER TYPE "public"."job_lead_status" ADD VALUE 'queued' AFTER 'scraped';--> statement-breakpoint
ALTER TYPE "public"."job_lead_status" ADD VALUE 'failed' AFTER 'archived';--> statement-breakpoint
ALTER TABLE "job_leads" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "job_leads" ADD COLUMN "last_error_at" timestamp;
```

**D-23 fallback:** Postgres `ALTER TYPE ADD VALUE` is non-transactional. If Drizzle Kit wraps the migration in a `BEGIN`/`COMMIT`, Postgres will reject. Hand-edit to use `ADD VALUE IF NOT EXISTS` and remove any transaction wrapping (the existing `0002` migration is non-transactional by construction — it's just one statement). The 0001 migration's `--> statement-breakpoint` markers separate statements but do not wrap them in a transaction at the Drizzle migration runner level.

---

### MOD `env.example.txt`

**Analog:** self — existing pattern is section header (`# ====...`) + `KEY=    # Example: value` lines.

**Additions** (per CONTEXT.md D-19 and D-21):
```text
# =================================================================
# Heimdall Service-Token Bypass (Phase 5)
# =================================================================
# Generate via: npx tsx scripts/generate-api-token.ts
# The script writes the raw token to ~/.heimdall/api-token (chmod 600)
# and prints the SHA-256 hash to paste below.

API_TOKEN_HASH=     # Example: 64-char hex SHA-256 of the raw token
SINGLE_USER_EMAIL=  # Example: steve@bronstein.org — must match middleware ALLOWED_EMAIL
```

---

### DELETE `src/features/job-leads/lib/scrape-connections.ts`, `src/features/job-leads/components/search-progress.tsx`

**Analog (deletion verification test):** `src/__cleanup__.test.ts` lines 8–22 (`deletedPaths` array + `it.each(...)` asserting `existsSync(...) === false`)

**Test addition pattern** (append to existing `src/__cleanup__.test.ts`, mirroring the Phase 4 block — per CONTEXT.md D-26):
```typescript
// Phase 5 deletion targets. Per .planning/phases/05-job-leads-completion/05-CONTEXT.md D-12.
const phase5DeletedPaths = [
  'src/features/job-leads/lib/scrape-connections.ts',
  'src/features/job-leads/components/search-progress.tsx'
];

describe('Phase 5 in-app scraper deletion', () => {
  it.each(phase5DeletedPaths)('removes %s', (relPath) => {
    expect(existsSync(resolve(process.cwd(), relPath))).toBe(false);
  });

  it('removes scrapeConnections import from job-leads search route', () => {
    const file = resolve(process.cwd(), 'src/app/api/job-leads/[id]/search/route.ts');
    const content = readFileSync(file, 'utf-8');
    expect(content).not.toMatch(/scrapeConnections/);
  });

  it('removes SearchProgress import from job-lead detail', () => {
    const file = resolve(process.cwd(), 'src/features/job-leads/components/job-lead-detail.tsx');
    const content = readFileSync(file, 'utf-8');
    expect(content).not.toMatch(/SearchProgress/);
  });
});
```

**Planner verification step** — before deleting `scrape-connections.ts`, grep for `scrapeConnections` and `ScrapedProspect` callers:
- `scrapeConnections` is imported only by `src/app/api/job-leads/[id]/search/route.ts:7` (will be removed in same change)
- `ScrapedProspect` type is imported by `src/features/job-leads/lib/match-connections.ts:4` — **type must be relocated** to `src/features/job-leads/lib/types.ts` (or `src/lib/domain/types.ts`) before deletion (per CONTEXT.md `<code_context>` "Reusable Assets" bullet 6)

---

## Shared Patterns

### Authentication (CLERK + bearer-token bypass)
**Source:** `src/proxy.ts` (existing Clerk middleware, lines 12–32) — extended in Phase 5
**Apply to:** All `/api/job-leads/[id]/*` routes (`prospects`, `status`, `search`) — these are reached either via Clerk session (browser) OR bearer token (skill). Routes themselves do NOT add per-route `auth()` calls; the middleware is the sole gate (Phase 3 pattern preserved).

### Response envelope
**Source:** `src/lib/api/types.ts` (`success`, `created`, `paginated`, `error`) + `src/lib/api/errors.ts` (`notFound`, `validationError`, `serverError`)
**Apply to:** Every new/modified API route in this phase — `POST /prospects`, `PATCH /status`, `POST /search`, `GET /job-leads?status=`

### Timeline event emission
**Source:** `src/lib/db/timeline.ts` (`logTimeline({ eventType, title, ...entityIds, metadata })`)
**Apply to:** Every write in this phase
- `POST /prospects` (success) → `job_lead_search_complete` (reuse existing event type from `src/app/api/job-leads/[id]/search/route.ts:76`)
- `PATCH /status status=searching` → `job_lead_search_claimed` (new event type)
- `PATCH /status status=found` → folded into `job_lead_search_complete` via the bulk-prospects route — `PATCH /status status=found` standalone is uncommon (prospects route does the flip)
- `PATCH /status status=failed` → `job_lead_search_failed` (new event type)
- `PATCH /status status=queued` (and `POST /search` thin route) → `job_lead_search_queued` (new event type)

### Zod validation
**Source:** Each route defines schemas at the top of the file (per CONVENTIONS.md "Zod schemas defined at the top of each API route file, not in a shared schemas directory")
**Apply to:** `POST /prospects` (`bulkBody`), `PATCH /status` (`statusChangeSchema` with optional `lastError`), `GET /job-leads?status=` (uses `parseArrayParam` + `inArray` — no body to validate)

### Drizzle bulk-insert (NOT for-loop)
**Source:** Conspicuously *absent* from current codebase — see `src/features/job-leads/lib/match-connections.ts:104-111` and `src/app/api/job-leads/[id]/search/route.ts:47-57` for the antipatterns being replaced.
**Pattern to apply** (`src/app/api/job-leads/[id]/prospects/route.ts`):
```typescript
await db.insert(prospects).values(rows);   // rows: Array — single round-trip
```
**Closest existing analog of correct pattern:** `scripts/import-linkedin.ts:115` (`await db.insert(contacts).values(batch);` — batched in groups of 50). The new route should NOT batch (the prospect count is bounded at 200 per D-22, well under any single-statement limit).

### Filesystem-existence cleanup test
**Source:** `src/__cleanup__.test.ts` (Phase 4 pattern)
**Apply to:** Deletions of `scrape-connections.ts` and `search-progress.tsx`

### Vitest + PGlite + callRoute API test harness
**Source:** `src/test-utils/pglite.ts` + `src/test-utils/call-route.ts` + existing test pattern in `src/app/api/applications/[id]/status/route.test.ts` (vi.hoisted + Proxy mock of `@/lib/db`)
**Apply to:** New tests for `POST /prospects/route.test.ts`, `PATCH /status/route.test.ts`, `POST /search/route.test.ts` (the thin status-flip variant), `GET /job-leads/route.test.ts` (status filter)

### Middleware test (vi.mock of `@clerk/nextjs/server`)
**Source:** `src/proxy.test.ts` (the configurable `mockAuthReturn` pattern + `clerkMiddleware` stub + `createRouteMatcher` regex stub)
**Apply to:** Bearer-token-bypass test additions (per CONTEXT.md D-25 bullet 4)

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `.claude/skills/scrape-linkedin-connections/SKILL.md` | skill-asset (frontmatter + prompt) | event-driven | First `.claude/skills/` file in this repo. Reference user-global `~/.claude/skills/gsd-review/SKILL.md` for frontmatter shape. |
| `.claude/skills/scrape-linkedin-connections/references/linkedin-navigation.md` | skill-asset (reference doc) | request-response | First skill reference doc in this repo. Plain markdown; no rendering convention beyond standard Claude Code skill conventions. |
| `.claude/skills/scrape-linkedin-connections/references/heimdall-api.md` | skill-asset (reference doc) | request-response | Same as above. Content derives from this PATTERNS.md. |
| `.claude/skills/scrape-linkedin-connections/references/troubleshooting.md` | skill-asset (reference doc) | request-response | Same as above. Content derives from the deleted `scrape-connections.ts` debug logs (categorize known failure modes per CONTEXT.md D-09's five error categories). |

**Note on `scripts/generate-api-token.ts`:** Initially flagged as "first TS script in scripts/" but `scripts/import-linkedin.ts` already exists (162-line TS script with `dotenv`, neon, drizzle, top-level `main()` + `process.exit`). The new token-gen script is *not* a first-of-kind in shape — only in role (crypto-and-fs vs DB-import). Analog row is `scripts/import-linkedin.ts` with role-match quality.

---

## Metadata

**Analog search scope:**
- `src/app/api/**/route.ts` — all 32+ API routes
- `src/features/job-leads/**` — entire job-leads feature
- `src/features/contacts/components/*.tsx` — for client-component / toast / fetch patterns
- `src/components/ui/*.tsx` — badge/alert primitives
- `drizzle/schema/*.ts` + `drizzle/migrations/*.sql` — schema + migration shape
- `scripts/*.ts` — TS scripts
- `src/test-utils/*` + `src/app/api/**/route.test.ts` + `src/proxy.test.ts` + `src/__cleanup__.test.ts` — test patterns
- `~/.claude/skills/*/SKILL.md` — user-global skill frontmatter shape (for SKILL.md only; no in-repo analog)

**Files scanned:** ~50 source files read in full or with targeted offset/limit reads.

**Pattern extraction date:** 2026-05-13
