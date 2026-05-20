# Phase 9: UI for Company-Scope Leads — Pattern Map

**Mapped:** 2026-05-19
**Files analyzed:** 4 (2 modified components + 2 new test files)
**Analogs found:** 4 / 4

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/features/job-leads/components/scrape-results.tsx` | component (modify) | request-response (RSC-fed) | `src/features/job-leads/components/job-lead-card.tsx` | exact — same feature, same `JobLead` prop, same `'use client'` RSC-fed pattern |
| `src/features/job-leads/components/job-lead-card.tsx` | component (modify) | request-response (RSC-fed) | `src/features/job-leads/components/scrape-results.tsx` | exact — same feature, same `JobLead` prop, same `'use client'` RSC-fed pattern |
| `src/features/job-leads/components/scrape-results.test.tsx` | test | SSR-structural + jsdom | `src/components/layout/app-sidebar.ssr.test.tsx` | role-match — same pattern: `renderToString` + JSDOM structural assertions, no `@testing-library/react` |
| `src/features/job-leads/components/job-lead-card.test.tsx` | test | SSR-structural + jsdom | `src/components/layout/app-sidebar.ssr.test.tsx` | role-match — same pattern as above |

---

## Pattern Assignments

### `src/features/job-leads/components/scrape-results.tsx` (component, modify)

**Analog:** self (current file) + `src/features/job-leads/components/job-lead-card.tsx`

**Current file — full source** (`src/features/job-leads/components/scrape-results.tsx`, lines 1–48):

```tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { IconMapPin, IconExternalLink } from '@tabler/icons-react';
import type { JobLead } from '@/lib/domain/types';

export function ScrapeResults({ lead }: { lead: JobLead }) {
  const scraped = lead.scrapedData as {
    companyName?: string;
    roleTitle?: string;
    location?: string;
    companyLinkedinUrl?: string;
  } | null;

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='text-base'>
          {lead.roleTitle || 'Unknown Role'}
        </CardTitle>
        <p className='text-muted-foreground text-sm'>
          {lead.companyName || 'Unknown Company'}
        </p>
      </CardHeader>
      <CardContent className='space-y-2'>
        {scraped?.location && (
          <div className='text-muted-foreground flex items-center gap-2 text-sm'>
            <IconMapPin className='h-4 w-4' />
            {scraped.location}
          </div>
        )}
        {lead.linkedinJobUrl && (
          <div className='flex gap-2'>
            <a
              href={lead.linkedinJobUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='text-primary flex items-center gap-1 text-sm hover:underline'
            >
              <IconExternalLink className='h-3.5 w-3.5' />
              View Job Posting
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

**What changes for D-01:**
- Add `Badge` to the Card imports and add `import { Badge } from '@/components/ui/badge'`
- Derive `const isCompanyScope = lead.linkedinJobUrl === null;` as the first line of the function body
- Branch the `<CardHeader>` content: when `isCompanyScope` is true, render the company-name-as-title + badge structure (replacing both the `CardTitle` line and the `<p>` subtitle); when false, keep the existing render unchanged
- The `{lead.linkedinJobUrl && (...)}` guard at line 32 already handles JL-C8's link-hidden clause — do not re-add it
- `Badge` already used in `job-lead-card.tsx` at line 6/47–50; copy that import line

**Discriminator pattern from UI-SPEC.md:**

```tsx
const isCompanyScope = lead.linkedinJobUrl === null;
```

**New company-scope CardHeader structure from UI-SPEC.md (lines 73–81):**

```tsx
<CardHeader className='pb-3'>
  <div className='flex items-center gap-2'>
    <CardTitle className='text-base'>
      {lead.companyName || 'Company scrape'}
    </CardTitle>
    <Badge variant='secondary'>Company scrape</Badge>
  </div>
  {/* role-title line is intentionally absent for company-scope leads */}
</CardHeader>
```

**Badge import to add** (copy from `job-lead-card.tsx` line 6):

```tsx
import { Badge } from '@/components/ui/badge';
```

---

### `src/features/job-leads/components/job-lead-card.tsx` (component, modify)

**Analog:** self (current file)

**Current file — full source** (`src/features/job-leads/components/job-lead-card.tsx`, lines 1–61):

```tsx
'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { JobLead } from '@/lib/domain/types';
import { IconBuilding, IconUsers } from '@tabler/icons-react';

const statusColors: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  scraping: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  scraped: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  queued: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
  searching: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  found: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  ready: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  actioned: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  archived: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
  failed: 'bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-200'
};

export function JobLeadCard({ lead }: { lead: JobLead }) {
  return (
    <Link href={`/dashboard/job-leads/${lead.id}`}>
      <Card className='hover:bg-accent/50 transition-colors'>
        <CardContent className='flex items-center justify-between p-4'>
          <div className='min-w-0 flex-1'>
            <div className='flex items-center gap-2'>
              <IconBuilding className='text-muted-foreground h-4 w-4 shrink-0' />
              <span className='truncate font-medium'>
                {lead.companyName || 'Unknown Company'}
              </span>
            </div>
            {lead.roleTitle && (
              <p className='text-muted-foreground mt-1 truncate text-sm'>
                {lead.roleTitle}
              </p>
            )}
          </div>
          <div className='flex items-center gap-3'>
            {lead.prospectCount > 0 && (
              <div className='text-muted-foreground flex items-center gap-1 text-sm'>
                <IconUsers className='h-3.5 w-3.5' />
                {lead.prospectCount}
              </div>
            )}
            <Badge
              variant='outline'
              className={statusColors[lead.status] || ''}
            >
              {lead.status.replace(/_/g, ' ')}
            </Badge>
            <span className='text-muted-foreground text-xs'>
              {new Date(lead.createdAt).toLocaleDateString()}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
```

**What changes for D-03:**
- Add `IconBuildingCommunity` to the tabler import at line 7 (icon is confirmed exported by installed `@tabler/icons-react` v3.38.0 — verified in `tabler-icons-react.d.ts`)
- Derive `const isCompanyScope = lead.linkedinJobUrl === null;` as the first line of the function body (before JSX)
- Replace the hardcoded `<IconBuilding ...>` at line 29 with the conditional icon swap (UI-SPEC lines 112–115)
- Replace the `{lead.roleTitle && (...)}` subtitle at lines 34–38 with the suppressed version (UI-SPEC line 122–124) — adds `!isCompanyScope &&` guard so the `'Company-wide scrape'` sentinel never renders as visible text
- Add `{isCompanyScope && (<Badge variant='outline'>Company</Badge>)}` as the first item in the right-side `flex items-center gap-3` div (UI-SPEC lines 130–134)

**Icon swap pattern from UI-SPEC.md (lines 112–115):**

```tsx
{isCompanyScope
  ? <IconBuildingCommunity className='text-muted-foreground h-4 w-4 shrink-0' />
  : <IconBuilding className='text-muted-foreground h-4 w-4 shrink-0' />
}
```

**Subtitle suppression pattern from UI-SPEC.md (lines 122–124):**

```tsx
{!isCompanyScope && lead.roleTitle && (
  <p className='text-muted-foreground mt-1 truncate text-sm'>{lead.roleTitle}</p>
)}
```

**Right-side badge group with "Company" pill from UI-SPEC.md (lines 130–149):**

```tsx
<div className='flex items-center gap-3'>
  {isCompanyScope && (
    <Badge variant='outline'>Company</Badge>
  )}
  {lead.prospectCount > 0 && (
    <div className='text-muted-foreground flex items-center gap-1 text-sm'>
      <IconUsers className='h-3.5 w-3.5' />
      {lead.prospectCount}
    </div>
  )}
  <Badge
    variant='outline'
    className={statusColors[lead.status] || ''}
  >
    {lead.status.replace(/_/g, ' ')}
  </Badge>
  <span className='text-muted-foreground text-xs'>
    {new Date(lead.createdAt).toLocaleDateString()}
  </span>
</div>
```

---

### `src/features/job-leads/components/scrape-results.test.tsx` (test, new)

**Analog:** `src/components/layout/app-sidebar.ssr.test.tsx`

**Test harness facts (verified):**
- Vitest config (`vitest.config.ts` line 14): global `environment: 'node'` — per-file jsdom override requires the `// @vitest-environment jsdom` docblock comment
- `@testing-library/react` is **NOT installed** — devDependencies contains only `jsdom` v29 and `@types/jsdom` v28
- Render approach: `renderToString` from `react-dom/server` + `JSDOM` from the `jsdom` package for structural DOM queries
- Hydration mount approach (when needed): `// @vitest-environment jsdom` docblock + `hydrateRoot` from `react-dom/client` + React `act`
- For Phase 9 component tests, the SSR-structural pattern (`renderToString` + JSDOM queries) is sufficient — these are pure rendering assertions (badge present, link absent, text content), not interaction tests

**File-header pattern** (from `app-sidebar.ssr.test.tsx` lines 1–4):

```tsx
import React from 'react';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { describe, it, beforeAll, vi, expect } from 'vitest';
```

**Mock pattern for shadcn/ui Card components** (adapt from `app-sidebar.ssr.test.tsx` lines 37–68 passThrough pattern):

```tsx
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children, className }: { children?: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
  CardTitle: ({ children, className }: { children?: React.ReactNode; className?: string }) => <h3 className={className}>{children}</h3>,
  CardContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: { children?: React.ReactNode; variant?: string }) => (
    <span data-variant={variant}>{children}</span>
  )
}));

vi.mock('@tabler/icons-react', () => ({
  IconMapPin: () => <span />,
  IconExternalLink: () => <span />,
  IconBuilding: () => <span data-icon='building' />,
  IconBuildingCommunity: () => <span data-icon='building-community' />,
  IconUsers: () => <span />
}));
```

**SSR-structural test body pattern** (from `app-sidebar.ssr.test.tsx` lines 103–137):

```tsx
describe('ScrapeResults — company-scope lead (JL-C8)', () => {
  let html: string;
  let dom: JSDOM;

  beforeAll(() => {
    html = renderToString(React.createElement(ScrapeResults, { lead: companyLead }));
    dom = new JSDOM(html, { url: 'http://localhost/' });
  });

  it('renders company name in the title slot', () => {
    expect(html).toContain('OpenAI');
  });

  it('renders "Company scrape" badge', () => {
    expect(html).toContain('Company scrape');
  });

  it('does not render "View Job Posting" link', () => {
    const { document } = dom.window;
    expect(document.querySelector('a')).toBeNull();
  });

  it('does not render "Unknown Role"', () => {
    expect(html).not.toContain('Unknown Role');
  });
});
```

**Fixtures** (directly from UI-SPEC.md lines 261–307 — use verbatim):

```tsx
import type { JobLead } from '@/lib/domain/types';

const companyLead: JobLead = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  companyId: 'cccccccc-0000-0000-0000-000000000001',
  companyName: 'OpenAI',
  linkedinJobUrl: null,
  roleTitle: 'Company-wide scrape',
  status: 'queued',
  prospectCount: 0,
  scrapedData: null,
  lastError: null,
  lastErrorAt: null,
  createdAt: new Date('2026-05-19T00:00:00Z'),
  updatedAt: new Date('2026-05-19T00:00:00Z'),
  archivedAt: null,
}

const jobLead: JobLead = {
  id: 'bbbbbbbb-0000-0000-0000-000000000002',
  companyId: 'cccccccc-0000-0000-0000-000000000002',
  companyName: 'Acme Corp',
  linkedinJobUrl: 'https://www.linkedin.com/jobs/view/123456',
  roleTitle: 'VP Data & AI',
  status: 'queued',
  prospectCount: 0,
  scrapedData: null,
  lastError: null,
  lastErrorAt: null,
  createdAt: new Date('2026-05-18T00:00:00Z'),
  updatedAt: new Date('2026-05-18T00:00:00Z'),
  archivedAt: null,
}

const nullNameLead: JobLead = {
  ...companyLead,
  id: 'aaaaaaaa-0000-0000-0000-000000000003',
  companyName: null,
  roleTitle: null,
}
```

---

### `src/features/job-leads/components/job-lead-card.test.tsx` (test, new)

**Analog:** `src/components/layout/app-sidebar.ssr.test.tsx` (same SSR-structural pattern)

**Additional mock needed** — `next/link` (same pattern as `app-sidebar.ssr.test.tsx` line 31–34):

```tsx
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: React.ReactNode }) =>
    React.createElement('a', { href }, children)
}));
```

**Mixed-lead list render pattern** — render each card separately (no list container needed since `JobLeadCard` takes a single `lead` prop); run two `renderToString` calls in the same `beforeAll` and store both HTML strings for cross-assertions:

```tsx
describe('JobLeadCard — company-scope vs job-URL (JL-C9)', () => {
  let companyHtml: string;
  let jobHtml: string;
  let companyDom: JSDOM;
  let jobDom: JSDOM;

  beforeAll(() => {
    companyHtml = renderToString(React.createElement(JobLeadCard, { lead: companyLead }));
    jobHtml = renderToString(React.createElement(JobLeadCard, { lead: jobLead }));
    companyDom = new JSDOM(companyHtml, { url: 'http://localhost/' });
    jobDom = new JSDOM(jobHtml, { url: 'http://localhost/' });
  });

  it('company-scope lead renders "Company" pill', () => {
    expect(companyHtml).toContain('Company');
  });

  it('job-URL lead does not render "Company" pill', () => {
    // status badge text is "queued", not "Company" — verify pill absent
    const { document } = jobDom.window;
    const badges = document.querySelectorAll('[data-variant="outline"]');
    const texts = Array.from(badges).map((b) => b.textContent?.trim());
    expect(texts).not.toContain('Company');
  });

  it('company-scope lead does not render the sentinel role subtitle', () => {
    expect(companyHtml).not.toContain('Company-wide scrape');
  });

  it('job-URL lead renders role subtitle', () => {
    expect(jobHtml).toContain('VP Data &amp; AI');
  });
});
```

**Icon assertion approach** — the `@tabler/icons-react` mock uses `data-icon` attributes; query them:

```tsx
it('company-scope lead renders IconBuildingCommunity icon', () => {
  const { document } = companyDom.window;
  expect(document.querySelector('[data-icon="building-community"]')).not.toBeNull();
  expect(document.querySelector('[data-icon="building"]')).toBeNull();
});

it('job-URL lead renders IconBuilding icon', () => {
  const { document } = jobDom.window;
  expect(document.querySelector('[data-icon="building"]')).not.toBeNull();
  expect(document.querySelector('[data-icon="building-community"]')).toBeNull();
});
```

---

## Shared Patterns

### `'use client'` component structure
**Source:** Both target files (lines 1, 22–23 of `scrape-results.tsx`; lines 1, 22 of `job-lead-card.tsx`)
**Apply to:** Both modified components (unchanged — they are already `'use client'`)

```tsx
'use client';
// imports
export function ComponentName({ lead }: { lead: JobLead }) {
  // derivations first
  const isCompanyScope = lead.linkedinJobUrl === null;
  // JSX
}
```

### Discriminator derivation
**Source:** UI-SPEC.md lines 53–57 / CONTEXT.md D-01/D-03
**Apply to:** Both `scrape-results.tsx` and `job-lead-card.tsx` — identical line in both

```tsx
const isCompanyScope = lead.linkedinJobUrl === null;
```

Rule: declared as the first line of the function body, before any JSX. Never key off `lead.roleTitle` sentinel string.

### SSR-structural test file-level mock pattern
**Source:** `src/components/layout/app-sidebar.ssr.test.tsx` lines 1–100
**Apply to:** Both new test files

Key points:
- No `// @vitest-environment jsdom` docblock — default `node` environment supports `renderToString` natively; `JSDOM` is imported directly from `jsdom` package for DOM queries
- All shadcn UI primitives (`Card`, `Badge`, etc.) are mocked as simple passThrough divs/spans
- `@tabler/icons-react` icons are mocked as `() => <span />` stubs (add `data-icon` attributes to distinguish them for icon-swap assertions)
- `next/link` is mocked as a plain `<a>` element
- Clerk and navigation hooks are mocked if the component tree imports them (not needed for the two target components)
- Fixtures are declared at module scope, before `describe` blocks

### Error / null defensive rendering
**Source:** `scrape-results.tsx` lines 19, 22, 26, 32; `job-lead-card.tsx` lines 31, 34
**Apply to:** All new branches in both components

```tsx
// Existing pattern — extend it, don't replace it:
lead.companyName || 'Unknown Company'   // null-coalesce for display
lead.roleTitle && (<p>...</p>)          // existence-guard for optional lines
lead.linkedinJobUrl && (<a>...</a>)     // existence-guard for optional links
```

For company-scope title fallback (CD-04): `lead.companyName || 'Company scrape'`

---

## No Analog Found

None. All four files have clear analogs in the existing codebase.

---

## Metadata

**Analog search scope:** `src/features/job-leads/components/`, `src/components/layout/`
**Files scanned:** 6 source files + 2 test files
**Pattern extraction date:** 2026-05-19

**Critical test harness finding:** `@testing-library/react` is NOT installed. The only React component render pattern in the codebase is `renderToString` (SSR-structural, using raw `jsdom` for DOM queries) and `hydrateRoot` (jsdom mount, requires `// @vitest-environment jsdom` docblock). For Phase 9's assertions (badge present, link absent, icon type, text content), the `renderToString` + `JSDOM` SSR-structural pattern is sufficient and matches the existing Phase 2 BUG-01 tests exactly. Do not introduce `@testing-library/react`.

**`IconBuildingCommunity` confirmed:** Present in `node_modules/@tabler/icons-react/dist/tabler-icons-react.d.ts` (installed version 3.38.0, declared `^3.31.0` in `package.json`).
