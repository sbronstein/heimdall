# Phase 8: Skill Input Parsing, Navigation Branching + Drain - Pattern Map

**Mapped:** 2026-05-19
**Files analyzed:** 6 (1 API route mod, 1 API test extension, 4 skill docs)
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `.claude/skills/scrape-linkedin-connections/SKILL.md` | skill-prompt (markdown) | LLM prompt + branching pseudo-code | self (current SKILL.md — branches are added, not replaced) | exact (extension-of-self) |
| `.claude/skills/scrape-linkedin-connections/references/linkedin-navigation.md` | domain-ref doc (markdown) | navigation cheat-sheet | self (current Step 1–5 narrative) | exact (restructure-of-self) |
| `.claude/skills/scrape-linkedin-connections/references/heimdall-api.md` | domain-ref doc (markdown) | API contract reference | self (current `## Endpoints` section) | exact (additive edit) |
| `.claude/skills/scrape-linkedin-connections/references/troubleshooting.md` | domain-ref doc (markdown) | error-category mapping | self (current 5-category list) | exact (additive edit) |
| `src/app/api/job-leads/route.ts` (GET only) | API route (read, request-response) | DB read + projection + leftJoin | `src/app/api/recruiters/route.ts:27–52` (leftJoin + explicit projection) | exact |
| `src/app/api/job-leads/route.test.ts` (one new case in `describe('GET ...')`) | test (route) | request-response | self (Tests 12–14 in same `describe`) + Phase 7 POST tests C1–C5 (fixture style) | exact |
| `src/test-utils/pglite.ts` (optional helper) | test fixture helper | n/a | self (`createTestDb`) | exact |

**No new source files. No schema changes. No new API routes.**

---

## Pattern Assignments

### `src/app/api/job-leads/route.ts` — GET handler (API route, read)

**Analog:** `src/app/api/recruiters/route.ts:21–61` is the canonical `leftJoin` + explicit projection pattern in the codebase. `src/app/api/search/route.ts:48–61` is a secondary analog (smaller projection, same shape). The GET handler in this same file is being modified — it currently uses `db.select().from(jobLeads)` (full row, no join, no projection).

**Current GET handler** (`src/app/api/job-leads/route.ts:24–71`) — full row, no join, no projection:

```typescript
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get('limit'));
    const cursor = parseCursor(searchParams.get('cursor'));
    const statuses = parseArrayParam(searchParams.get('status'));

    const conditions = [isNull(jobLeads.archivedAt)];

    if (statuses) {
      conditions.push(
        inArray(
          jobLeads.status,
          statuses as (typeof jobLeadStatusValues)[number][]
        )
      );
    }

    if (cursor) {
      conditions.push(lt(jobLeads.updatedAt, cursor));
    }

    const where =
      conditions.length > 1
        ? sql`${sql.join(conditions.map((c) => sql`(${c})`), sql` AND `)}`
        : conditions[0];

    const results = await db
      .select()                       // ← full-row select, no projection
      .from(jobLeads)                 // ← no leftJoin to companies
      .where(where)
      .orderBy(desc(jobLeads.updatedAt))
      .limit(limit + 1);
    // ...
  }
}
```

**leftJoin + explicit projection pattern** (`src/app/api/recruiters/route.ts:27–52` — copy this shape verbatim):

```typescript
const results = await db
  .select({
    id: recruiters.id,
    contactId: recruiters.contactId,
    firm: recruiters.firm,
    specialty: recruiters.specialty,
    region: recruiters.region,
    engagementStatus: recruiters.engagementStatus,
    lastSubmittedTo: recruiters.lastSubmittedTo,
    qualityRating: recruiters.qualityRating,
    notes: recruiters.notes,
    createdAt: recruiters.createdAt,
    updatedAt: recruiters.updatedAt,
    contactName: sql<string>`concat(${contacts.firstName}, ' ', ${contacts.lastName})`,
    contactEmail: contacts.email,                     // ← cross-table column appears flat
    contactTitle: contacts.title
  })
  .from(recruiters)
  .leftJoin(contacts, eq(recruiters.contactId, contacts.id))
  .where(/* ... */)
  .orderBy(desc(recruiters.updatedAt))
  .limit(limit + 1);
```

**Pattern to apply for Phase 8 D-13** — extend GET projection to include `companyLinkedinUrl` from a left-joined `companies` row. Switch from `.select()` to explicit object-shape projection; add `.leftJoin(companies, eq(jobLeads.companyId, companies.id))`:

```typescript
const results = await db
  .select({
    id: jobLeads.id,
    linkedinJobUrl: jobLeads.linkedinJobUrl,
    roleTitle: jobLeads.roleTitle,
    companyName: jobLeads.companyName,
    companyId: jobLeads.companyId,
    applicationId: jobLeads.applicationId,
    status: jobLeads.status,
    scrapedData: jobLeads.scrapedData,
    prospectCount: jobLeads.prospectCount,
    lastError: jobLeads.lastError,
    lastErrorAt: jobLeads.lastErrorAt,
    createdAt: jobLeads.createdAt,
    updatedAt: jobLeads.updatedAt,
    archivedAt: jobLeads.archivedAt,
    companyLinkedinUrl: companies.linkedinUrl       // ← NEW (D-13)
  })
  .from(jobLeads)
  .leftJoin(companies, eq(jobLeads.companyId, companies.id))
  .where(where)
  .orderBy(desc(jobLeads.updatedAt))
  .limit(limit + 1);
```

**Why explicit projection (not `.select()` + computed merge):**
- `recruiters/route.ts` and `search/route.ts` both use explicit projection with `leftJoin` — no codebase precedent for `.select().from(a).leftJoin(b)` returning a nested `{ a: {...}, b: {...} }` shape from this handler. Flat projection is the convention.
- The `companies.linkedinUrl` column comes through as `null` when `jobLeads.companyId IS NULL` (no join match) — natural left-join semantics; matches the CONTEXT specification ("null or string per lead row").

**Imports — required additions** (`src/app/api/job-leads/route.ts:1–14`):

The route already imports `companies` (line 10) and `eq` from `drizzle-orm` (line 3) — both reused. **No new imports needed for the GET change**; the schema imports and `eq` helper already cover the leftJoin.

**Things to keep unchanged:**
- All other GET logic (statuses filter, cursor pagination, hasMore tail-slice, `paginated()` envelope) stays verbatim.
- The POST handler (lines 73–225) is **untouched** in Phase 8. Phase 7 shipped it.
- The `eq` import is already in the import block (line 3). The `companies` table is already imported (line 10).

**Error handling pattern** — kept verbatim from current code (`src/app/api/job-leads/route.ts:68–70`):

```typescript
} catch (err) {
  return serverError(err);
}
```

---

### `src/app/api/job-leads/route.test.ts` — one new GET test case (CD-04)

**Analog:** Tests 12–14 in same file (lines 25–108) — same `describe('GET /api/job-leads (status filter)')` block, same fixture style. Phase 7's POST tests C1–C7 (lines 110–363) show the company-scope fixture creation pattern.

**Hoisted mock pattern** — already in the file at lines 11–23; reused verbatim (no changes):

```typescript
const { dbRef } = vi.hoisted(() => ({
  dbRef: { current: null as Awaited<ReturnType<typeof createTestDb>> | null }
}));

vi.mock('@/lib/db', () => ({
  db: new Proxy(
    {},
    {
      get: (_: object, prop: string | symbol) =>
        (dbRef.current as unknown as Record<string | symbol, unknown>)[prop]
    }
  )
}));
```

**Existing GET test fixture pattern** (lines 26–57 — one company, three leads of different status):

```typescript
beforeEach(async () => {
  dbRef.current = await createTestDb();

  const [company] = await dbRef.current
    .insert(companies)
    .values({ name: 'AcmeCo' })
    .returning();
  companyId = company.id;

  await dbRef.current.insert(jobLeads).values([
    {
      linkedinJobUrl: 'https://www.linkedin.com/jobs/view/1',
      companyId,
      companyName: 'AcmeCo',
      status: 'queued'
    },
    /* ... */
  ]);
});
```

**Phase 7 company-scope fixture pattern** (route.test.ts:167–181 — for seeding a `linkedinJobUrl: null` lead with a non-null `companies.linkedinUrl`):

```typescript
const [company] = await dbRef.current!
  .insert(companies)
  .values({ name: 'AcmeCo' })            // can add linkedinUrl here too
  .returning();
const [seedLead] = await dbRef.current!
  .insert(jobLeads)
  .values({
    linkedinJobUrl: null,                 // ← company-scope shape
    companyId: company.id,
    companyName: 'AcmeCo',
    roleTitle: 'Company-wide scrape',
    status: 'queued'
  })
  .returning();
```

**Existing GET assertion pattern** (Test 12, lines 59–76):

```typescript
const { GET } = await import('@/app/api/job-leads/route');

const { status, body } = await callRoute(
  GET as unknown as Parameters<typeof callRoute>[0],
  {
    method: 'GET',
    searchParams: { status: 'queued' }
  }
);

expect(status).toBe(200);
const data = (body as { data: Array<{ status: string }> }).data;
expect(data).toHaveLength(1);
```

**Pattern to apply for Phase 8 CD-04** — single new `it()` inside the existing `describe('GET /api/job-leads (status filter)')` block (or a sibling describe for clarity). Inserts a **mixed fixture**: one company-scope lead (`linkedinJobUrl: null`) on a company with `linkedinUrl` set, and one job-URL lead on the same (or another) company. Asserts the new `companyLinkedinUrl` field appears on both rows:

```typescript
it('Test 15 (D-13/CD-04): GET response includes companyLinkedinUrl on both lead types', async () => {
  // Extend the existing fixture, OR use its own beforeEach.
  // Inline-fixture form (no helper extracted yet — DRY threshold not met):
  const [company] = await dbRef.current!
    .insert(companies)
    .values({
      name: 'AcmeCo',
      linkedinUrl: 'https://www.linkedin.com/company/acme'  // ← non-null
    })
    .returning();

  await dbRef.current!.insert(jobLeads).values([
    {
      // Company-scope lead (Phase 7 shape)
      linkedinJobUrl: null,
      companyId: company.id,
      companyName: 'AcmeCo',
      roleTitle: 'Company-wide scrape',
      status: 'queued'
    },
    {
      // Job-URL lead
      linkedinJobUrl: 'https://www.linkedin.com/jobs/view/100',
      companyId: company.id,
      companyName: 'AcmeCo',
      status: 'queued'
    }
  ]);

  const { GET } = await import('@/app/api/job-leads/route');

  const { status, body } = await callRoute(
    GET as unknown as Parameters<typeof callRoute>[0],
    { method: 'GET', searchParams: { status: 'queued' } }
  );

  expect(status).toBe(200);
  const data = (body as {
    data: Array<{ linkedinJobUrl: string | null; companyLinkedinUrl: string | null }>;
  }).data;
  expect(data).toHaveLength(2);

  // Both lead rows must include the field; both are joined to the same company,
  // so both should have the same companyLinkedinUrl value.
  for (const row of data) {
    expect(row).toHaveProperty('companyLinkedinUrl');
    expect(row.companyLinkedinUrl).toBe('https://www.linkedin.com/company/acme');
  }

  // Verify the two leads have different linkedinJobUrl shapes (one null, one URL)
  const sortedByLinkedinJobUrl = [...data].sort((a, b) => {
    if (a.linkedinJobUrl === null) return -1;
    if (b.linkedinJobUrl === null) return 1;
    return 0;
  });
  expect(sortedByLinkedinJobUrl[0].linkedinJobUrl).toBeNull();
  expect(sortedByLinkedinJobUrl[1].linkedinJobUrl).toMatch(/\/jobs\/view\//);
});
```

**Optional second assertion (null case)** — add if planner decides to lock the null-side: a lead whose `companyId` is `null` (no join match) should still have `companyLinkedinUrl: null` in the response. Not required by CD-04 but pins the leftJoin's null-fallthrough behavior.

**Test count placement** — existing tests in the GET describe block end at Test 14 (line 96). Phase 8's new test is `Test 15` (or split into `Test 15a / 15b` if the planner pulls the null-case into its own `it`). Existing POST tests C1–C7 are unrelated and stay below.

**Caveat:** The existing `beforeEach` (lines 28–57) inserts three rows with no `companies.linkedinUrl` set. If extending it directly (vs adding a sibling describe), set `linkedinUrl` on the inserted company and update Tests 12–14 to expect the new field. The cleaner choice is a sibling `describe('GET /api/job-leads (companyLinkedinUrl projection)')` block with its own `beforeEach` — planner decides based on whether existing tests should also assert the new field.

---

### `.claude/skills/scrape-linkedin-connections/SKILL.md` — markdown skill prompt (rewrite of argument parser + drain loop)

**Analog:** Itself. This is a prompt-text artifact, not code. Phase 5 created it; Phase 8 extends the argument parser with two new branches and adds the company-scope branch to the drain loop. Structure stays the same; specific sections are surgically rewritten.

**Current structure (preserved verbatim except where noted):**

| Section | Lines | Phase 8 change |
|---------|-------|----------------|
| Frontmatter (name/description/argument-hint/allowed-tools) | 1–8 | **Keep verbatim.** No new tools needed. |
| `## Overview` | 10–22 | **Update.** Add bullet points for the two new input shapes (company-URL, bare-name) and a one-line note that drain mode now branches on `linkedinJobUrl`. |
| `## Setup` | 24–32 | **Keep verbatim.** Same prerequisites (token, env, dev server, agent-browser, LinkedIn profile). |
| `## Argument parsing` | 34–42 | **Rewrite.** Replace the 4-branch parser with the 5-branch parser from D-01 (drain / UUID / company-URL / job-URL / bare-name). |
| `## Drain mode (no arg)` | 44–55 | **Extend.** Step 4 becomes "For each approved lead, branch on `lead.linkedinJobUrl`" + the D-11/D-14/D-15 pseudo-code. |
| `## Single-lead mode (UUID or URL arg)` | 57–78 | **Extend.** Step 3 ("Navigate") splits into three sub-flows per `references/linkedin-navigation.md`. Steps 4–6 (extract, paginate, write back) unchanged. |
| `## Error handling` | 80–101 | **Keep verbatim.** Same five categories. New failure modes (name-extraction fallback, zero-match, mid-drain disambiguation) folded into existing categories — documented in `troubleshooting.md`, not the SKILL.md error-handling section. |
| `## Constraints` | 103–end | **Keep verbatim.** Same six DO-NOTs. |

**Current argument-parsing block** (SKILL.md:34–42 — the section being rewritten):

```markdown
## Argument parsing

The user's argument is in `$ARGUMENTS`. Branch on its shape:

- **Empty / absent** → drain mode. Go to the "Drain mode" section.
- **UUID-shaped** (matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`) → claim this specific lead by ID. Go to the "Single-lead mode" section.
- **Starts with `https://`** → URL mode. First POST the URL to `/api/job-leads` to create a `pending` → `scraped` → `queued` lead (the existing cheerio job-page scraper runs in-app), capture the returned UUID, then proceed as if a UUID was given.
- **Anything else** → surface "Argument did not look like a UUID or a URL: `<value>`" and stop. Do NOT guess.
```

**Phase 8 rewrite — 5-branch parser** (CONTEXT §specifics + D-01..D-03):

```markdown
## Argument parsing

The user's argument is in `$ARGUMENTS`. After `trim()`, branch in this order (first match wins):

1. **Empty / whitespace-only** → drain mode. Go to "Drain mode".
2. **UUID-shaped** (matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`) → single-lead UUID flow. Go to "Single-lead mode".
3. **Parses as a URL** AND pathname's first segment is `company`:
   - Extract slug: `new URL(arg)` → `pathname.split('/').filter(Boolean)` → `segments[0] === 'company' && segments[1]` → slug = `segments[1]`. Tolerates trailing segments (`/about/`, `/people/`, `?utm=...`).
   - Canonical URL: `https://www.linkedin.com/company/${slug}/`.
   - → Company-URL flow (see `references/linkedin-navigation.md` § Company-URL path).
4. **Parses as a URL** (any other shape) → existing job-URL flow. POST `{ linkedinJobUrl: <arg> }` to `/api/job-leads` (the existing cheerio scrape runs in-app, lead lands in `scraped`; user manually flips to `queued` via the UI, or the skill claims it directly per the original flow). Go to "Single-lead mode".
5. **Anything else** → bare-name flow. Treat `arg` as a company name (no UUID, no URL, non-empty).
   → See `references/linkedin-navigation.md` § Bare-name path.

No "stop and ask" branch — every non-empty input now routes somewhere.
```

**Phase 8 rewrite — drain-mode loop** (CONTEXT §specifics + D-11..D-15):

```markdown
## Drain mode (no arg)

1. Fetch the queue:
   ```bash
   TOKEN=$(cat ~/.heimdall/api-token)
   curl -s -H "Authorization: Bearer $TOKEN" \
     'http://localhost:4000/api/job-leads?status=queued&limit=50'
   ```
   Each row in `data[]` now includes `companyLinkedinUrl` (D-13) — string for company-scope leads whose companies row has a non-null `linkedinUrl`, null otherwise.

2. Render `data` as a markdown table: `id`, `linkedinJobUrl ? 'job-URL' : 'company-scope'`, `companyName`, `roleTitle`, "queued since" (from `updatedAt`).

3. Ask the user: "Process all N? Process the first then ask again? Skip and exit?"

4. For each approved lead, branch on `lead.linkedinJobUrl`:

   ```text
   if lead.linkedinJobUrl == null:
     # Company-scope branch (D-11, D-12, D-15)
     print(`Lead ${lead.id}: company-scope (${lead.companyName}) — navigating to ${lead.companyLinkedinUrl}/people/...`)
     url = lead.companyLinkedinUrl
     if url == null:
       # D-14 fallback: bare-name search → disambiguate → backfill
       url = await runBareNameFlow(lead.companyName)   # interactive: presents matches, waits for user pick
       # Backfill companies.linkedinUrl so the next drain doesn't re-prompt
       PUT /api/companies/<lead.companyId> { linkedinUrl: url }
     navigate(`${url.endsWith('/') ? url : url + '/'}people/`)
     # Continue with name-extraction (best-effort, see references/linkedin-navigation.md § Company-URL path)
   else:
     # Job-URL branch (unchanged from Phase 5)
     navigateJobUrlBranch(lead.linkedinJobUrl)   # Steps 1–3 of the Job-URL path

   # Shared from here (Steps 4–5): apply 2nd-degree filter, extract, paginate, POST /prospects
   applyFilterAndExtract(lead.id)
   ```

5. On failure: write the categorized error (see "Error handling") and CONTINUE to the next lead — do NOT abort the batch.

6. End with a summary: `N processed, M succeeded, K failed (categories: Timeout: x, LinkedIn navigation failed: y, ...)`.
```

**Important pseudo-code note for the planner:** the `PUT /api/companies/<id>` line above uses **PUT** (the actual verb exported by `src/app/api/companies/[id]/route.ts:55` — verified). CONTEXT.md refers to it as "PATCH" but the existing route is PUT. Either:
- Use `PUT` in the SKILL.md prompt (matches the actual route) — recommended.
- OR add a PATCH alias in the companies route — out of scope for Phase 8 (would be a new code change not in the file list).

**Single-lead mode changes** — Step 3 ("Navigate") gets a small lead-in:

```markdown
3. **Navigate** — choose path based on the lead shape and how it arrived:
   - **From URL/UUID job-URL lead** (`lead.linkedinJobUrl !== null`) → follow `references/linkedin-navigation.md` § Job-URL path (Steps 1–3).
   - **From company-URL input** → follow `references/linkedin-navigation.md` § Company-URL path. POST `{ companyName, linkedinCompanyUrl }` to `/api/job-leads` first (200 dedup or 201 new — handle both); claim the returned lead; then navigate.
   - **From bare-name input** → follow `references/linkedin-navigation.md` § Bare-name path (search → disambiguate → user picks → derive URL); then proceed as in the company-URL path.
   - **From company-scope queued lead** (`lead.linkedinJobUrl === null && lead.companyLinkedinUrl !== null`) → follow `references/linkedin-navigation.md` § Company-URL path, starting at the direct `/people/` navigation; do NOT POST `/api/job-leads` again (lead already exists).
   - **From company-scope queued lead with `companyLinkedinUrl === null`** → run the bare-name disambiguation inline (D-14), then PUT `/api/companies/<companyId>` to backfill, then navigate.

   All paths converge at Step 4 (apply 2nd-degree filter — see `references/linkedin-navigation.md` § Shared).
```

**What stays exactly the same:**
- `Setup` section (no new prereqs)
- `Error handling` section (same five categories; new modes documented in `troubleshooting.md`)
- `Constraints` section
- Claim-by-PATCH pattern (`/api/job-leads/<id>/status` with `{ "status": "searching" }`)
- Write-back pattern (POST `/api/job-leads/<id>/prospects`)

---

### `.claude/skills/scrape-linkedin-connections/references/linkedin-navigation.md` — markdown nav cheat-sheet (full restructure)

**Analog:** Itself (current 5-step linear narrative). Phase 8 restructures into three top-level paths plus a shared section. Steps 4 and 5 are pulled out verbatim under a "Shared" heading.

**Current structure** (linkedin-navigation.md as of today):

```
# LinkedIn Navigation Cheat-Sheet
(intro paragraph: 4-step path, selectors are hints, ARIA-first)

## Step 1: Open the job posting
## Step 2: Click the company name link
## Step 3: Click the employees link
## Step 4: Apply the 2nd-degree connections filter
## Step 5: Paginate and extract
## Historically-stable selectors (appendix)
```

**Phase 8 target structure** (CONTEXT §specifics + CD-01):

```
# LinkedIn Navigation Cheat-Sheet
(intro paragraph: three entry points share Steps 4–5; selectors are hints, ARIA-first)

## Choosing the entry point
| When | Path |
|------|------|
| Lead has `linkedinJobUrl !== null` (job-URL lead, queued from UI) | Job-URL path |
| Company-URL input, OR company-scope lead with `companyLinkedinUrl !== null` | Company-URL path |
| Bare-name input, OR company-scope lead with `companyLinkedinUrl === null` | Bare-name path |

## Job-URL path (Steps 1–3)
### Step 1: Open the job posting          [current content verbatim]
### Step 2: Click the company name link   [current content verbatim]
### Step 3: Click the employees link      [current content verbatim]
→ Converges into Shared (Step 4 onward)

## Company-URL path (slug → /people/)
### Step 1: Slug extraction (D-03)
   - `new URL(arg)` → `pathname.split('/').filter(Boolean)` → `segments[0] === 'company' && segments[1]`
   - Slug = `segments[1]`; canonical URL = `https://www.linkedin.com/company/${slug}/`
   - Tolerate trailing segments (`/about/`, `/people/`, `/jobs/`) and query params/fragments
### Step 2: Direct /people/ navigation (D-05)
   - Navigate to `https://www.linkedin.com/company/${slug}/people/`
   - Wait for snapshot to settle
### Step 3: Extract company name from the page header (D-05, CD-02)
   - Look for the first H1 / heading-role element above the people-search-result region.
   - If multiple H1s exist, prefer the one whose text does NOT match common LinkedIn nav keywords
     ("LinkedIn", "Notifications", "Messaging", "Home", "My Network").
   - Fallback (D-06): on extraction failure (null/empty result, sign-in wall, captcha), use the
     slug verbatim and log a warning: `Could not extract company name from <url>; using slug
     "<slug>" as fallback. Rename in the companies UI if needed.`
### Step 4: POST /api/job-leads (D-04, ties to Phase 7's idempotent dedup)
   - Body: `{ companyName: <extracted-or-slug>, linkedinCompanyUrl: <canonical-url> }`
   - Response: 201 (new lead created) or 200 (in-flight dedup — existing lead returned)
   - Capture `data.id` (lead ID) and proceed to claim.
→ Converges into Shared (Step 4 onward) — note: Step "4" here is the API call;
  the SHARED Step 4 is the 2nd-degree filter. Rename to avoid confusion: use
  "Step C-4: POST /api/job-leads" or restructure as a sub-numbered list.

## Bare-name path (search → disambiguate → /people/)
### Step 1: Direct search URL (D-07)
   - Navigate to `https://www.linkedin.com/search/results/companies/?keywords=<urlencoded>`
   - Deterministic; no autocomplete timing dependency. Mirrors the "URL parameter preferred over
     UI chip" convention (Shared Step 4).
### Step 2: Extract top 3–5 company cards
   - Per result card, capture from the agent-browser snapshot:
     - Name (visible text of the company-link anchor)
     - Employee count (text like "5,200 employees" or "10K+ followers — 5K employees" — strip
       commas/units)
     - Industry (the subline beneath the name, e.g., "Software Development")
   - If the a11y snapshot does not expose employee count and industry (collapsible card variant),
     fall back to just `Name` and surface "(employee count not available)" in the disambiguation
     list — do NOT block.
### Step 3: Render disambiguation list (D-10, CD-05)
   - Markdown numbered list, max 5 items:
     ```
     1. **Name** — N employees — Industry
     2. **Name** — N employees — Industry
     ```
   - Prompt: "Pick a number (1–N), or type the company URL directly:"
### Step 4: Handle the pick (D-08, D-09, CD-05)
   - **Zero results** (D-09): fail loudly with `No companies found for "<name>". Try a more
     specific name or pass a LinkedIn company URL.` and exit cleanly. Do NOT create a stub.
   - **Single result** (D-08, CD-05): render as a 1-item numbered list and confirm before
     proceeding. User can reply with `1`, `y`, or Enter.
   - **Multi result**: user types `1`–`N`. Skill resolves the pick to the company URL from the
     card's profile-link anchor.
   - **User pastes a URL instead** (escape hatch): treat it as Company-URL input from Step 1 of
     that path.
### Step 5: Drain-mode backfill (D-14, only when arriving from a `companyLinkedinUrl === null`
            company-scope lead)
   - After the user picks, PUT `/api/companies/<lead.companyId>` with `{ linkedinUrl: <picked> }`
     so subsequent drains find a non-null `companyLinkedinUrl`.
   - Verified: `src/app/api/companies/[id]/route.ts` PUT handler accepts `linkedinUrl` via
     `updateCompanySchema` (line 18). Use **PUT** (not PATCH) — that's the route's actual verb.
→ After pick, behaves like Company-URL path from its Step 2 (direct /people/ navigation onward),
  with the additional name-extraction + POST `/api/job-leads` step UNLESS arriving from drain
  (in which case the lead already exists).

## Shared: 2nd-degree filter + paginate + extract
### Step 4: Apply the 2nd-degree connections filter   [current Step 4 content verbatim]
### Step 5: Paginate and extract                       [current Step 5 content verbatim]

## Historically-stable selectors (appendix)
   [current appendix table verbatim]
```

**What to copy from current `linkedin-navigation.md` verbatim:**
- Intro disclaimer paragraph (lines 1–14) — restructure first sentence to mention three paths instead of one.
- Step 1 / Step 2 / Step 3 of the Job-URL path (current lines 17–98) — drop into the new "Job-URL path" section unchanged.
- Step 4 / Step 5 (current lines 102–174) — drop into the new "Shared" section unchanged.
- Historically-stable selectors appendix (lines 177–193) — drop in verbatim.

**What's new:**
- "Choosing the entry point" table at the top.
- "Company-URL path" section (4 sub-steps: slug extraction → direct nav → name extraction → POST).
- "Bare-name path" section (5 sub-steps: search URL → extract cards → render list → handle pick → optional backfill).

**Sub-numbering note:** the current doc uses `## Step 1` … `## Step 5`. The new structure has THREE entry-point sections each with their own Steps 1–3 (or 1–5), plus a shared Step 4 and Step 5. Use either:
- `### Step J-1`, `### Step C-1`, `### Step B-1`, `### Shared Step 4`, `### Shared Step 5` — prefix-based, unambiguous.
- `### 1.1`, `### 2.1` style nested numbering — terse but reads as "section.step".
- Plain `### Step 1` inside each path — relies on section context; readable but easy to misquote out of context.

CD-01 leaves heading order to the planner. Recommend prefix-based (J-/C-/B-/Shared) for grep-ability.

---

### `.claude/skills/scrape-linkedin-connections/references/heimdall-api.md` — markdown API contract reference (light edits)

**Analog:** Itself. Two surgical additions: (1) document the new `companyLinkedinUrl` field on `GET /api/job-leads` response shape; (2) document the company-scope body shape for `POST /api/job-leads` (Phase 7's discriminated union — the skill now POSTs this shape from the company-URL flow). Optionally cross-reference the existing PUT `/api/companies/<id>` for the D-14 backfill.

**Current `GET /api/job-leads` response shape block** (lines 84–98):

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "linkedinJobUrl": "https://www.linkedin.com/jobs/view/...",
      "roleTitle": "VP Data",
      "companyName": "Example Co",
      "status": "queued",
      "lastError": null,
      "updatedAt": "2026-05-14T08:00:00.000Z"
    }
  ],
  "meta": { "cursor": "2026-05-14T08:00:00.000Z", "hasMore": false }
}
```

**Phase 8 edit — add `companyLinkedinUrl` to the shape:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "linkedinJobUrl": "https://www.linkedin.com/jobs/view/..." | null,
      "roleTitle": "VP Data" | "Company-wide scrape",
      "companyName": "Example Co",
      "companyLinkedinUrl": "https://linkedin.com/company/example" | null,
      "status": "queued",
      "lastError": null,
      "updatedAt": "2026-05-14T08:00:00.000Z"
    }
  ],
  "meta": { "cursor": "2026-05-14T08:00:00.000Z", "hasMore": false }
}
```

Plus a one-paragraph note below the JSON block:

```markdown
**Note (Phase 8 D-13):** `companyLinkedinUrl` is left-joined from `companies.linkedinUrl`.
It is `null` when the lead has no `companyId`, OR when the linked company row has no
`linkedinUrl` set. The drain skill uses this field to navigate directly to
`<companyLinkedinUrl>/people/` for company-scope leads (`linkedinJobUrl === null`),
skipping the job → company link-clicking dance.

**Note (Phase 7 D-12 + Phase 8 D-12):** The discriminator for "is this a company-scope
lead?" is `linkedinJobUrl === null`, not `roleTitle === 'Company-wide scrape'`. The
sentinel role title is informational only.
```

**Current `POST /api/job-leads/[id]/status` block** stays unchanged (no new transitions for company-scope leads — Phase 7 D-17 already verified the state machine is input-shape agnostic).

**New section to add — `POST /api/job-leads` (creation, not just status):**

Currently `heimdall-api.md` documents only `GET`, `PATCH /status`, `POST /prospects`, and (for context) `POST /search`. The Phase 7 `POST /api/job-leads` company-scope branch isn't documented because the Phase 5 skill never called it (job-URL leads were created via the UI). Phase 8's company-URL and bare-name flows POST to this route — needs documentation.

```markdown
### 5. `POST /api/job-leads` (Phase 7 + 8)

**Used by:** company-URL input, bare-name input pick, NOT drain mode (drain only PATCHes status
on existing leads).

**Body — discriminated union (Phase 7 D-01):** two shapes; first-match-wins.

Shape A — job-URL (existing, the Phase 5 skill never used this; UI does):
```json
{ "linkedinJobUrl": "https://www.linkedin.com/jobs/view/..." }
```

Shape B — company-scope (NEW in Phase 7, used by Phase 8 skill):
```json
{
  "companyName": "OpenAI",
  "linkedinCompanyUrl": "https://www.linkedin.com/company/openai/"   // optional
}
```

**Side effects** (company-scope branch, handled by the route — do NOT replicate):

1. Looks up `companies` by case-insensitive name match (`companies_name_idx`).
2. On match: backfills `companies.linkedinUrl` if it was null and the request supplied one
   (D-09). Never overwrites a non-null `linkedinUrl`.
3. On no match: auto-creates a stub `companies` row with `name` + optional `linkedinUrl`,
   plus schema defaults for everything else.
4. Idempotent dedup: if an in-flight company-scope lead already exists for this company
   (status in `queued`/`searching`/`failed`, `archived_at IS NULL`), returns HTTP **200**
   with the existing row. Otherwise inserts a new lead and returns HTTP **201**.
5. Emits a `job_lead_created` timeline event with `metadata.scope: 'company'`.

**Response (both paths):**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "linkedinJobUrl": null,
    "roleTitle": "Company-wide scrape",
    "companyName": "OpenAI",
    "companyId": "uuid",
    "status": "queued",
    ...
  }
}
```

The skill handles 200 and 201 identically — use the returned lead, claim it via PATCH /status.

**Curl:**

```bash
TOKEN=$(cat ~/.heimdall/api-token)
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"companyName":"OpenAI","linkedinCompanyUrl":"https://www.linkedin.com/company/openai/"}' \
  http://localhost:4000/api/job-leads
```
```

**New section to add — `PUT /api/companies/[id]` (D-14 backfill):**

```markdown
### 6. `PUT /api/companies/[id]` (Phase 8 D-14)

**Used by:** drain-mode fallback when a company-scope lead has `companyLinkedinUrl === null`.
After running the bare-name disambiguation flow, the skill backfills the URL so subsequent
drains don't re-prompt.

**Body (the only field the skill writes):**

```json
{ "linkedinUrl": "https://www.linkedin.com/company/openai/" }
```

**Note on verb:** The actual route exports `PUT` (not `PATCH`) — `src/app/api/companies/[id]/route.ts:55`.
Despite the CONTEXT.md referring to it as PATCH, use PUT in curl.

**Response:** `{ success: true, data: <updated company row> }`.

**Curl:**

```bash
TOKEN=$(cat ~/.heimdall/api-token)
curl -s -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"linkedinUrl":"https://www.linkedin.com/company/openai/"}' \
  "http://localhost:4000/api/companies/$COMPANY_ID"
```
```

**What stays exactly the same** in heimdall-api.md:
- Auth section (token format, middleware lock)
- Response envelope description
- Status code table
- `GET /api/job-leads` query params (status filter, limit, cursor)
- `PATCH /api/job-leads/[id]/status` body + transitions table
- `POST /api/job-leads/[id]/prospects` body + side effects
- `POST /api/job-leads/[id]/search` retry note
- Error envelope table at the bottom

---

### `.claude/skills/scrape-linkedin-connections/references/troubleshooting.md` — markdown error mapping (additive)

**Analog:** Itself. Add three new failure-mode entries under the existing categories — no new categories. Per the doc's own guidance ("the bar for adding a sixth category is high"), the new modes map into existing buckets:

1. **Name extraction failure on company page** → falls under `LinkedIn navigation failed` (page header missing/different) BUT is NOT a hard failure — D-06 says "fall back to slug and continue, log warning". Document as a "warning, not a failure" callout inside the `LinkedIn navigation failed` section.

2. **Zero matches on bare-name search** → does NOT map to `LinkedIn navigation failed` (the navigation succeeded — there just are no results). Closest fit: a new bullet under `LinkedIn navigation failed` OR keep as its own callout. D-09 specifies fail-loudly with a specific error message; that message includes "No companies found for..." — distinct from the existing `No prospects found` category (which is for empty 2nd-degree filter results AFTER navigation succeeds). Document under `LinkedIn navigation failed` with a clear note that the failure happens BEFORE the lead is created.

3. **Mid-drain disambiguation triggered** → not actually a failure mode; it's an interactive prompt. Document briefly under "What the skill does NOT handle (yet)" or in a new "Interactive prompts in drain mode" callout. The user picks → backfill happens → drain continues.

**Phase 8 additions — three callouts to fold into existing sections:**

Under `## LinkedIn navigation failed`, add three new bullets to "Common triggers and remediation":

```markdown
- **Company-name-extraction failure (Phase 8 D-05/D-06).** When the skill navigates to
  `/company/<slug>/people/`, it extracts the company name from the page H1 / heading-role
  element. If that extraction returns null/empty (DOM shift, sign-in wall, captcha during
  load), this is NOT a hard failure: the skill falls back to using the slug as the
  `companyName` for the POST `/api/job-leads` call, logs the warning `Could not extract
  company name from <url>; using slug "<slug>" as fallback. Rename in the companies UI if
  needed.`, and proceeds. Remediation is post-hoc curation in the companies UI; no skill
  retry needed.

- **Zero matches on bare-name LinkedIn search (Phase 8 D-09).** When the user passes a bare
  company name and `https://www.linkedin.com/search/results/companies/?keywords=<name>`
  returns no result cards, the skill writes `No companies found for "<name>". Try a more
  specific name or pass a LinkedIn company URL.` and exits cleanly. This is BEFORE any
  Heimdall row is created — no `job_leads` row exists to mark as `failed`; the failure is
  a user-facing message only. Distinguishable from `No prospects found` (which is post-
  navigation, after the lead is created and claimed).

- **Mid-drain disambiguation (Phase 8 D-14).** When draining a company-scope lead whose
  `companyLinkedinUrl IS NULL`, the skill pauses and runs the bare-name disambiguation flow
  inline using `lead.companyName`. The user picks; the skill PUTs
  `/api/companies/<lead.companyId>` to backfill the URL, then resumes navigation. If the
  user cancels (no pick), the skill writes `failed` with `lastError: "LinkedIn navigation
  failed: user cancelled disambiguation for <companyName>"` and continues to the next lead.
```

Under `## What the skill does NOT handle (yet)`, optionally add:

```markdown
- **Auto-pick disambiguation single matches** (Phase 8 D-08 declined). Even when LinkedIn
  returns exactly one result for a bare-name search, the skill confirms with the user
  before proceeding. The cost is one keystroke; the benefit is never silently scraping the
  wrong company on a fuzzy match.

- **Retry-with-broader-query on zero matches** (Phase 8 D-09 declined). The skill does NOT
  auto-strip suffixes like "Inc"/"LLC" or fall back to looser searches. Fail-loudly is the
  v1 policy.
```

**What stays exactly the same** in troubleshooting.md:
- All five top-level category sections (`Timeout`, `LinkedIn navigation failed`, `No prospects found`, `Browser unavailable`, `Unknown error`).
- The Manual recovery section.
- The 5-category-per-failure invariant.

---

### `src/test-utils/pglite.ts` (optional — CD-04 fixture helper)

**Analog:** Itself (the existing `createTestDb` function at lines 14–55).

**Decision rule from CD-04:** "Planner picks fixture location based on whether `src/test-utils/pglite.ts` already has a helper for company creation." Currently it does NOT have one. The new test inserts one company + two leads; that's a single-use fixture — inline is fine.

**Recommendation:** keep the test fixture inline in `route.test.ts` (no new helper). Extract only if a future Phase 8 test or a Phase 9 UI test materializes the same fixture (DRY threshold: 2+ callers).

**If extracted (only if planner finds 2+ uses):** the helper would look like:

```typescript
/**
 * Phase 8 CD-04 / Phase 9 (UI): minimal fixture for a company with a non-null
 * linkedinUrl plus one company-scope lead and one job-URL lead. Used by tests
 * that verify the leftJoin projection or the discriminator-based UI branching.
 */
export async function createMixedLeadFixture(
  db: Awaited<ReturnType<typeof createTestDb>>
): Promise<{
  companyId: string;
  companyLinkedinUrl: string;
  companyScopeLeadId: string;
  jobUrlLeadId: string;
}> {
  const linkedinUrl = 'https://www.linkedin.com/company/acme';
  const [company] = await db
    .insert(companies)
    .values({ name: 'AcmeCo', linkedinUrl })
    .returning();
  const [companyScopeLead] = await db
    .insert(jobLeads)
    .values({
      linkedinJobUrl: null,
      companyId: company.id,
      companyName: 'AcmeCo',
      roleTitle: 'Company-wide scrape',
      status: 'queued'
    })
    .returning();
  const [jobUrlLead] = await db
    .insert(jobLeads)
    .values({
      linkedinJobUrl: 'https://www.linkedin.com/jobs/view/100',
      companyId: company.id,
      companyName: 'AcmeCo',
      status: 'queued'
    })
    .returning();
  return {
    companyId: company.id,
    companyLinkedinUrl: linkedinUrl,
    companyScopeLeadId: companyScopeLead.id,
    jobUrlLeadId: jobUrlLead.id
  };
}
```

---

## Shared Patterns

### Drizzle leftJoin with Explicit Projection
**Source:** `src/app/api/recruiters/route.ts:27–52`
**Apply to:** D-13 — GET `/api/job-leads` projection in `src/app/api/job-leads/route.ts`

```typescript
const results = await db
  .select({
    /* every column you want from the LEFT table */
    id: leftTable.id,
    /* ... */
    /* projected columns from the JOINED table */
    fieldName: joinedTable.column     // null when no join match
  })
  .from(leftTable)
  .leftJoin(joinedTable, eq(leftTable.foreignKeyColumn, joinedTable.id))
  .where(/* same WHERE shape as before */)
  .orderBy(/* unchanged */)
  .limit(limit + 1);
```

The codebase precedent uses **flat projection** (`companyLinkedinUrl: companies.linkedinUrl`) — not nested (`{ company: companies }`). Stick with flat.

---

### Response Envelope (Paginated)
**Source:** `src/lib/api/types.ts` + `src/app/api/job-leads/route.ts:61–67`
**Apply to:** The Phase 8 GET projection's response (unchanged from current shape — only the row contents grow by one field)

```typescript
return paginated(data, {
  cursor:
    data.length > 0
      ? data[data.length - 1].updatedAt.toISOString()
      : null,
  hasMore
});
```

---

### Hoisted `vi.mock('@/lib/db')` Proxy Pattern
**Source:** `src/app/api/job-leads/route.test.ts:11–23` (mandated by Phase 2 D-05/D-07)
**Apply to:** The new Phase 8 GET test case

```typescript
const { dbRef } = vi.hoisted(() => ({
  dbRef: { current: null as Awaited<ReturnType<typeof createTestDb>> | null }
}));

vi.mock('@/lib/db', () => ({
  db: new Proxy(
    {},
    {
      get: (_: object, prop: string | symbol) =>
        (dbRef.current as unknown as Record<string | symbol, unknown>)[prop]
    }
  )
}));
```

Already in `route.test.ts` — no changes; new test reuses it.

---

### Dynamic Route Import in Tests
**Source:** `src/app/api/job-leads/route.test.ts:60, 79, 100, 120, 183, ...`
**Apply to:** The new GET test case

```typescript
const { GET } = await import('@/app/api/job-leads/route');
```

Required because the `vi.mock('@/lib/db')` hoist must run before the route module's top-level `import { db } from '@/lib/db'` executes.

---

### Markdown Skill Section Layout
**Source:** Current `.claude/skills/scrape-linkedin-connections/SKILL.md`
**Apply to:** All edits to SKILL.md and the three reference docs

Convention from Phase 5:
- `##` for top-level sections (Overview, Setup, Argument parsing, Drain mode, Single-lead mode, Error handling, Constraints).
- `###` for sub-steps (Step 1, Step 2, ...).
- Backtick-fenced code blocks for curl examples and pseudo-code.
- Inline references to other docs as relative-link markdown: `[`references/linkedin-navigation.md`](references/linkedin-navigation.md)`.
- "Do NOT ..." bullets for hard constraints (six in current SKILL.md, unchanged in Phase 8).
- YAML frontmatter with `name`, `description`, `argument-hint`, `allowed-tools` — Phase 8 needs no changes to frontmatter (same tools: Read, Bash).

---

## No Analog Found

None for source code. All Phase 8 file changes have a strong analog:

- The leftJoin + projection pattern is well-precedented (`recruiters/route.ts`, `search/route.ts`).
- The route-test scaffolding is well-precedented (Phase 7's POST tests in the same file).
- The skill markdown is its own analog (Phase 8 surgically extends Phase 5's structure).

**Outside-codebase decisions still required of the planner:**
- The agent-browser snapshot's actual shape on `/company/<slug>/people/` — does the H1 / heading-role element reliably contain the human-readable company name? Documented as a planner-verifies-manually item in CONTEXT §"What the Planner DOES Need to Verify / Decide".
- Whether the LinkedIn company-search results page exposes employee count and industry in the a11y snapshot. If only the name is reliably visible, the disambiguation list degrades gracefully (per the Bare-name path Step 2 fallback above).

These are LinkedIn DOM facts, not codebase patterns — outside this pattern map's scope.

---

## Metadata

**Analog search scope:**
- `src/app/api/job-leads/route.ts` (current GET shape — the file being modified)
- `src/app/api/recruiters/route.ts` (canonical leftJoin + projection analog)
- `src/app/api/search/route.ts` (secondary leftJoin analog)
- `src/app/api/job-leads/[id]/recommendations/route.ts` (multi-join analog — innerJoin variant, not directly used)
- `src/app/api/companies/[id]/route.ts` (PUT verb — important for SKILL.md / heimdall-api.md accuracy)
- `src/app/api/job-leads/route.test.ts` (existing GET tests + Phase 7 POST tests for fixture style)
- `.claude/skills/scrape-linkedin-connections/` (all four current files — extension targets)
- `drizzle/schema/job-leads.ts` + `drizzle/schema/companies.ts` (column shapes — `linkedinJobUrl` is nullable as of Phase 7's migration 0009; `companies.linkedinUrl` was already nullable)
- `src/test-utils/pglite.ts` + `src/test-utils/call-route.ts` (test harness — used as-is, no changes)
- `src/lib/domain/types.ts` (`COMPANY_SCOPE_ROLE_TITLE` already exported from Phase 7)

**Files scanned:** 13

**Pattern extraction date:** 2026-05-19

**Key invariants pinned for the planner:**
- GET projection switches from `.select()` (full-row) to explicit object-shape projection. This is a behavior change for API consumers — but since the projection includes EVERY current column on `jobLeads` plus the new field, no consumer should break.
- `leftJoin` (not `innerJoin`) — leads without a `companyId` still appear in the GET result with `companyLinkedinUrl: null`.
- POST handler in `src/app/api/job-leads/route.ts` is untouched (Phase 7 owns it).
- The companies update route is **PUT**, not PATCH — both the SKILL.md pseudo-code and the heimdall-api.md documentation must use PUT to match the actual route handler.
- All skill markdown structure is preserved; only specific sections are surgically rewritten. Phase 5's six "Do NOT ..." constraints stay intact.
- The Phase 8 changes preserve idempotency: a re-run of the company-URL flow against the same company hits Phase 7's dedup logic (200 vs 201) — no skill-side dedup logic needed.
- Test fixture stays inline (CD-04 DRY threshold not met). Extract to `pglite.ts` only on a second caller.
