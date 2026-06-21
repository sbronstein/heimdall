# Phase 14: Campaign Builder UI - Pattern Map

**Mapped:** 2026-06-21
**Files analyzed:** 8 new/modified files
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/app/dashboard/outreach/page.tsx` | page (RSC) | request-response | `src/app/dashboard/job-leads/page.tsx` | exact |
| `src/app/dashboard/outreach/[id]/page.tsx` | page (RSC) | request-response | `src/app/dashboard/job-leads/[id]/page.tsx` | exact |
| `src/features/outreach/components/campaign-list.tsx` | component | request-response | `src/features/contacts/components/contact-listing.tsx` + `src/features/job-leads/components/job-leads-page` (inferred) | role-match |
| `src/features/outreach/components/campaign-builder.tsx` | component | CRUD + event-driven | `src/features/contacts/components/triage/triage-workflow.tsx` | exact (load-set + in-memory filter shell) |
| `src/features/outreach/components/contact-selection-list.tsx` | component | transform | `src/features/contacts/components/triage/triage-workflow.tsx` (row rendering, filter application) | role-match |
| `src/features/outreach/components/builder-filter-bar.tsx` | component | event-driven | `src/features/contacts/components/triage/connection-year-filter.tsx` + `closeness-button-bar.tsx` | exact (reuse directly) |
| `src/features/outreach/components/campaign-name-panel.tsx` | component | request-response | `src/features/contacts/components/triage/how-met-input.tsx` (controlled input + forwardRef pattern) | role-match |
| `src/config/nav-config.ts` (modify) | config | — | `src/config/nav-config.ts` itself | exact |

---

## Pattern Assignments

### `src/app/dashboard/outreach/page.tsx` (page RSC, request-response)

**Analog:** `src/app/dashboard/job-leads/page.tsx`

**Imports pattern** (lines 1–6):
```typescript
import PageContainer from '@/components/layout/page-container';
import { db } from '@/lib/db';
import { outreachCampaigns, outreachEmails } from '../../../../drizzle/schema';
import { desc, isNull } from 'drizzle-orm';
import { CampaignList } from '@/features/outreach/components/campaign-list';
```

**Core RSC pattern** — DB query → PageContainer → client feature component (job-leads/page.tsx lines 11–27):
```typescript
export const metadata = { title: 'Dashboard: Outreach' };

export default async function OutreachPage() {
  // Server-side fetch of campaigns with emailCounts — same shape GET /api/outreach-campaigns returns
  // but done directly via db for SSR; no fetch() in RSC pages
  const campaigns = await db
    .select({ /* id, name, goalInstruction, status, createdAt, updatedAt */ })
    .from(outreachCampaigns)
    .where(isNull(outreachCampaigns.archivedAt))
    .orderBy(desc(outreachCampaigns.updatedAt));

  return (
    <PageContainer
      scrollable
      pageTitle='Outreach'
      pageDescription='Manage email campaigns for your job search network.'
      pageHeaderAction={/* "New Campaign" link/button */}
    >
      <CampaignList initialCampaigns={campaigns} />
    </PageContainer>
  );
}
```

**PageContainer props pattern** (`src/components/layout/page-container.tsx` lines 20–38):
```typescript
// All props are optional strings/nodes
export default function PageContainer({
  children,
  scrollable = true,       // set false for non-scroll (builder page)
  isloading = false,
  pageTitle,               // e.g. 'Outreach'
  pageDescription,
  pageHeaderAction         // ReactNode — rendered top-right of header
}: { ... }) { ... }
```

---

### `src/app/dashboard/outreach/[id]/page.tsx` (page RSC, request-response)

**Analog:** `src/app/dashboard/job-leads/[id]/page.tsx`

**Dynamic route + notFound pattern** (lines 12–26):
```typescript
export default async function OutreachCampaignPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [campaign] = await db
    .select()
    .from(outreachCampaigns)
    .where(eq(outreachCampaigns.id, id))
    .limit(1);

  if (!campaign) return notFound();

  // Also fetch associated outreach emails with contact join for the placeholder list
  // (mirrors job-leads/[id]/page.tsx multi-query pattern lines 28–50)

  return (
    <PageContainer scrollable pageTitle={campaign.name}>
      <CampaignReviewPage campaign={campaign} emails={emails} />
    </PageContainer>
  );
}
```

**Import additions for dynamic route:**
```typescript
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { outreachCampaigns, outreachEmails, contacts } from '../../../../../drizzle/schema';
import { CampaignReviewPage } from '@/features/outreach/components/campaign-review-page';
```

---

### `src/features/outreach/components/campaign-builder.tsx` (component, CRUD + event-driven)

**Analog:** `src/features/contacts/components/triage/triage-workflow.tsx`

This is the primary shell component implementing D-05/D-06 (load all, filter in memory) and D-12 (two-POST save sequence). Mirror the `triage-workflow.tsx` structure closely.

**Top-of-file directive + imports pattern** (triage-workflow.tsx lines 1–38):
```typescript
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { Button } from '@/components/ui/button';
import type { Contact } from '@/lib/domain/types';
import {
  clampConnectionYear,
  deriveConnectionYears,
  filterByConnectionYearRange
} from '@/features/contacts/lib/connection-year';
import { ConnectionYearFilter } from '@/features/contacts/components/triage/connection-year-filter';
import { ClosenessButtonBar } from '@/features/contacts/components/triage/closeness-button-bar';
import { BuilderFilterBar } from './builder-filter-bar';
import { ContactSelectionList } from './contact-selection-list';
import { CampaignNamePanel } from './campaign-name-panel';
```

**Props interface pattern** (triage-workflow.tsx lines 49–53):
```typescript
interface CampaignBuilderProps {
  contacts: Contact[];  // all non-archived contacts, loaded by RSC page
}

export function CampaignBuilder({ contacts }: CampaignBuilderProps) { ... }
```

**Load-set + nuqs URL filter state pattern** (triage-workflow.tsx lines 77–94):
```typescript
// Mirror triage-workflow.tsx: read URL params the filter controls write
const [{ connectionYearStart, connectionYearEnd, closeness, howMet, outreachStatus }] =
  useQueryStates({
    connectionYearStart: parseAsInteger,
    connectionYearEnd: parseAsInteger,
    closeness: parseAsString,       // new for builder
    howMet: parseAsString,          // new for builder
    outreachStatus: parseAsString   // new for builder; defaults to 'not_reached_out' in filter component
  });

// All filtering is client-side over the loaded set (D-05)
const filteredContacts = useMemo(
  () => applyBuilderFilters(contacts, { connectionYearStart, connectionYearEnd, closeness, howMet, outreachStatus }),
  [contacts, connectionYearStart, connectionYearEnd, closeness, howMet, outreachStatus]
);
```

**Selection set state** (D-03 persist-across-filters — kept in a Set<string> by contact ID):
```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

const toggleContact = useCallback((id: string) => {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}, []);

// D-08: select-all adds all currently-filtered contacts to the set
const selectAllFiltered = useCallback(() => {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    filteredContacts.forEach((c) => next.add(c.id));
    return next;
  });
}, [filteredContacts]);
```

**Two-POST save sequence pattern** (D-12; mirrors triage-workflow.tsx fetch pattern lines 147–177):
```typescript
const [isSaving, setIsSaving] = useState(false);
const router = useRouter();

const handleSave = useCallback(async () => {
  if (!campaignName || selectedIds.size === 0 || isSaving) return;
  setIsSaving(true);
  try {
    // Step 1: create campaign
    const res1 = await fetch('/api/outreach-campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: campaignName, goalInstruction: goalInstruction ?? '' })
    });
    if (!res1.ok) throw new Error('Failed to create campaign');
    const { data: campaign } = await res1.json();

    // Step 2: bulk-add contacts (CD-02: handle partial failure explicitly)
    const res2 = await fetch(`/api/outreach-campaigns/${campaign.id}/emails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactIds: Array.from(selectedIds) })
    });
    if (!res2.ok) throw new Error('Failed to add contacts to campaign');

    router.push(`/dashboard/outreach/${campaign.id}`);
  } catch (err) {
    console.error('Campaign save failed:', err);
    // surface error to user (toast or inline error state)
  } finally {
    setIsSaving(false);
  }
}, [campaignName, goalInstruction, selectedIds, isSaving, router]);
```

**Empty-filter state pattern** (triage-workflow.tsx lines 260–284):
```typescript
// When filter active but no contacts match (CD-05)
if (filteredContacts.length === 0 && filtersAreActive) {
  return (
    <div className='py-12 text-center'>
      <p className='text-muted-foreground'>
        No contacts match the current filters — adjust the filter to see contacts.
      </p>
    </div>
  );
}
```

---

### `src/features/outreach/components/contact-selection-list.tsx` (component, transform)

**Analog:** `src/features/contacts/components/triage/triage-workflow.tsx` (rendered row concept) + `src/features/contacts/components/contact-table/columns.tsx` (field groups)

**Props interface:**
```typescript
interface ContactSelectionListProps {
  contacts: Contact[];          // already-filtered slice from parent
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
}

export function ContactSelectionList({
  contacts,
  selectedIds,
  onToggle,
  onSelectAll
}: ContactSelectionListProps) { ... }
```

**Row structure** (D-02 four field groups, D-04 closeness-first order applied by parent):
```typescript
// Each row: Checkbox + name/howMet/closeness badge + company/role + connection date + outreach status
// Checkbox from shadcn: import { Checkbox } from '@/components/ui/checkbox'
// Badge from shadcn: import { Badge } from '@/components/ui/badge'
// closenessColors from: import { closenessColors } from '@/features/contacts/lib/closeness-colors'
```

**Select-all header row:**
```typescript
<div className='flex items-center gap-2 border-b py-2 text-sm font-medium'>
  <Checkbox
    checked={contacts.every((c) => selectedIds.has(c.id))}
    onCheckedChange={onSelectAll}
  />
  <span>Select all {contacts.length} matching</span>
</div>
```

---

### `src/features/outreach/components/builder-filter-bar.tsx` (component, event-driven)

**Analog:** `src/features/contacts/components/triage/connection-year-filter.tsx` + `closeness-button-bar.tsx` (directly reused, not re-implemented)

**Import + composition pattern** (triage-workflow.tsx lines 13–32 show how these are composed):
```typescript
'use client';

import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import {
  ConnectionYearFilter,
  type ConnectionYearFilterHandle
} from '@/features/contacts/components/triage/connection-year-filter';
import {
  ClosenessButtonBar,
  type ClosenessButtonBarHandle
} from '@/features/contacts/components/triage/closeness-button-bar';
// New sibling button-bar controls for howMet + outreachStatus follow the same
// forwardRef + tabIndex={0} + onKeyDown pattern as closeness-button-bar.tsx
```

**nuqs URL state pattern** (connection-year-filter.tsx lines 28–33):
```typescript
const [{ connectionYearStart, connectionYearEnd }, setRange] = useQueryStates({
  connectionYearStart: parseAsInteger,
  connectionYearEnd: parseAsInteger
});
// Similarly for closeness, howMet, outreachStatus using parseAsString
// Default outreachStatus = 'not_reached_out' (D-07) set via parseAsString.withDefault('not_reached_out')
```

**Button-bar button style pattern** (connection-year-filter.tsx lines 122–145 / closeness-button-bar.tsx lines 64–83):
```typescript
// Every filter option: <button type='button' tabIndex={-1} className={cn('flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors', isSelected ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-accent')} />
// Container: tabIndex={0} + onKeyDown for arrow-key nav
```

**forwardRef handle pattern** (closeness-button-bar.tsx lines 30–37):
```typescript
export interface BuilderFilterBarHandle {
  focus: () => void;
}

export const BuilderFilterBar = forwardRef<BuilderFilterBarHandle, BuilderFilterBarProps>(
  function BuilderFilterBar({ years }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => ({ focus: () => containerRef.current?.focus() }));
    ...
  }
);
```

---

### `src/features/outreach/components/campaign-name-panel.tsx` (component, request-response)

**Analog:** `src/features/contacts/components/triage/how-met-input.tsx`

**Controlled text input pattern** (how-met-input.tsx lines 21–29, 118–162):
```typescript
'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface CampaignNamePanelProps {
  name: string;
  onNameChange: (value: string) => void;
  goalInstruction: string;
  onGoalChange: (value: string) => void;
}

export interface CampaignNamePanelHandle {
  focus: () => void;
}

export const CampaignNamePanel = forwardRef<CampaignNamePanelHandle, CampaignNamePanelProps>(
  function CampaignNamePanel({ name, onNameChange, goalInstruction, onGoalChange }, ref) {
    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));

    return (
      <div className='space-y-3'>
        <div className='space-y-1'>
          <label className='text-sm font-medium'>Campaign Name *</label>
          <Input
            ref={inputRef}
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder='e.g. ID.me colleagues 2021–2022'
            maxLength={200}
          />
        </div>
        <div className='space-y-1'>
          <label className='text-sm font-medium'>
            Goal / Instruction
            <span className='text-muted-foreground ml-1 text-xs font-normal'>
              (optional — used by AI generation in Phase 16)
            </span>
          </label>
          <Textarea
            value={goalInstruction}
            onChange={(e) => onGoalChange(e.target.value)}
            placeholder='e.g. Reconnect and ask for a 20-minute intro call about their hiring plans'
            rows={3}
          />
        </div>
      </div>
    );
  }
);
```

---

### `src/features/outreach/components/campaign-list.tsx` (component, request-response)

**Analog:** `src/features/contacts/components/contact-listing.tsx` (thin client wrapper) + job-leads card pattern

**Shell pattern** (contact-listing.tsx line 7 — thin async RSC or client component that renders cards):
```typescript
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { OutreachCampaign } from '@/lib/domain/types';
import Link from 'next/link';

interface CampaignListProps {
  initialCampaigns: OutreachCampaign[];  // passed from RSC page
}

export function CampaignList({ initialCampaigns }: CampaignListProps) {
  // D-10: render cards with name, goal snippet, status, segmented progress counts
  // emailCounts shape from GET /api/outreach-campaigns:
  // { pending, generated, edited, approved, drafted, failed }
  return (
    <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
      {initialCampaigns.map((campaign) => (
        <Link key={campaign.id} href={`/dashboard/outreach/${campaign.id}`}>
          <Card className='hover:border-primary transition-colors'>
            <CardHeader>
              <CardTitle className='text-base'>{campaign.name}</CardTitle>
              {campaign.goalInstruction && (
                <p className='text-muted-foreground line-clamp-2 text-sm'>
                  {campaign.goalInstruction}
                </p>
              )}
            </CardHeader>
            <CardContent>
              {/* Per-status count badges */}
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
```

---

### `src/config/nav-config.ts` (modify — add Outreach entry)

**Analog:** itself

**Existing entry shape** (nav-config.ts lines 3–11):
```typescript
{
  title: 'Outreach',
  url: '/dashboard/outreach',
  icon: 'mail',          // or 'send' — confirm available icon in tabler/lucide
  isActive: false,
  shortcut: ['o', 'r'],  // 'o','r' = outreach; check for conflict with 'o','o' (Contacts)
  items: []
}
```
Add after 'Job Leads' (line 44) and before 'Contacts' (line 51) — logical position in the flow.

---

## Shared Patterns

### Client-side in-memory filter (D-05/D-06)
**Source:** `src/features/contacts/components/triage/triage-workflow.tsx` lines 77–94
**Apply to:** `campaign-builder.tsx`, `contact-selection-list.tsx`
```typescript
// Load full set from RSC props; derive filter inputs from nuqs URL state; filter in useMemo
const filteredContacts = useMemo(
  () => filterByConnectionYearRange(contacts, clampedStart, clampedEnd),
  [contacts, clampedStart, clampedEnd]
);
```
For the builder, extend with additional filters:
```typescript
function applyBuilderFilters(contacts: Contact[], filters: BuilderFilters): Contact[] {
  let result = contacts;
  if (filters.connectionYearStart != null || filters.connectionYearEnd != null)
    result = filterByConnectionYearRange(result, filters.connectionYearStart, filters.connectionYearEnd);
  if (filters.closeness)
    result = result.filter((c) => c.closeness === filters.closeness);
  if (filters.howMet)
    result = result.filter((c) => c.howMet?.toLowerCase().includes(filters.howMet!.toLowerCase()));
  if (filters.outreachStatus)
    result = result.filter((c) => c.outreachStatus === filters.outreachStatus);
  return result;
}
// D-04: default ordering = closeness closest-first (tier 1–2 at top)
// Apply sort after filtering using contactClosenessValues index:
result.sort((a, b) => contactClosenessValues.indexOf(a.closeness ?? 'never_met') - contactClosenessValues.indexOf(b.closeness ?? 'never_met'));
```

### nuqs URL state for filter persistence
**Source:** `src/features/contacts/components/triage/connection-year-filter.tsx` lines 28–33; `triage-workflow.tsx` lines 78–81
**Apply to:** `builder-filter-bar.tsx`, `campaign-builder.tsx`
```typescript
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';

const [filters, setFilters] = useQueryStates({
  connectionYearStart: parseAsInteger,
  connectionYearEnd: parseAsInteger,
  closeness: parseAsString,
  howMet: parseAsString,
  outreachStatus: parseAsString.withDefault('not_reached_out')  // D-07 default
});
```

### Button-bar filter control style
**Source:** `src/features/contacts/components/triage/connection-year-filter.tsx` lines 114–168; `closeness-button-bar.tsx` lines 58–87
**Apply to:** all new filter controls in `builder-filter-bar.tsx`
```typescript
// Container: div with tabIndex={0}, onKeyDown for arrow nav, rounded-md focus ring
// Buttons: type='button', tabIndex={-1}, cn() toggle between bg-primary and bg-background hover:bg-accent
// Label: <label className='text-sm font-medium'>...</label> above the button group
```

### fetch + response envelope consumption
**Source:** `src/features/contacts/components/triage/triage-workflow.tsx` lines 147–177 (fetch pattern), `src/app/api/outreach-campaigns/route.ts` lines 78–104 (POST shape)
**Apply to:** `campaign-builder.tsx` save handler
```typescript
// POST /api/outreach-campaigns request body: { name: string, goalInstruction: string }
// POST /api/outreach-campaigns response: { success: true, data: { id, name, goalInstruction, status, createdAt, updatedAt } }
// POST /api/outreach-campaigns/[id]/emails request body: { contactIds: string[] }
// POST /api/outreach-campaigns/[id]/emails response: { success: true, data: { inserted: number, skipped: number } }
// Both use { 'Content-Type': 'application/json' } and check res.ok before proceeding
```

### forwardRef + useImperativeHandle handle pattern
**Source:** `src/features/contacts/components/triage/connection-year-filter.tsx` lines 21–37; `closeness-button-bar.tsx` lines 30–37
**Apply to:** `builder-filter-bar.tsx`, `campaign-name-panel.tsx`
```typescript
export interface [Component]Handle {
  focus: () => void;
}

export const [Component] = forwardRef<[Component]Handle, [Component]Props>(
  function [Component]({ ...props }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => ({
      focus: () => containerRef.current?.focus()
    }));
    ...
  }
);
```

### RSC page → PageContainer → client feature component
**Source:** `src/app/dashboard/job-leads/page.tsx` lines 1–27
**Apply to:** `src/app/dashboard/outreach/page.tsx`, `src/app/dashboard/outreach/[id]/page.tsx`
- Export `metadata` object with `title: 'Dashboard: ...'`
- Default export is an `async function` named after the route (PascalCase + `Route` suffix)
- `params` typed as `Promise<{ id: string }>` for dynamic routes; `await params` before use
- Call `notFound()` from `'next/navigation'` when DB returns empty result
- Pass DB result as a named prop (`initialLeads`, `initialCampaigns`, `campaign`, `emails`) to the client component

---

## API Response Shapes (for fetch calls in campaign-builder.tsx)

### GET /api/contacts (no params — load all non-archived)
```
Response: { success: true, data: Contact[], meta: { cursor, hasMore } }
// Note: at ~1500 contacts this may need limit=2000 or pagination loop — confirm with page size
// D-05 decision accepts this payload size; use limit=2000 as the practical ceiling
```

### POST /api/outreach-campaigns
```
Request:  { name: string, goalInstruction: string }
Response: { success: true, data: { id: string, name: string, goalInstruction: string, status: 'draft', createdAt, updatedAt } }
```

### POST /api/outreach-campaigns/[id]/emails
```
Request:  { contactIds: string[] }   // max 500 per Zod schema
Response: { success: true, data: { inserted: number, skipped: number } }
// onConflictDoNothing guarantees idempotency (CAMP-07 / criterion #5)
```

### GET /api/outreach-campaigns (for campaign-list page)
```
Response: { success: true, data: Campaign[], meta: { cursor, hasMore } }
// Each Campaign includes emailCounts: { pending, generated, edited, approved, drafted, failed }
// emailCounts is a JSON object from Postgres json_build_object — parse as Record<string,number>
```

---

## No Analog Found

All files have strong analogs. No gaps.

---

## Metadata

**Analog search scope:** `src/features/contacts/`, `src/app/dashboard/`, `src/app/api/outreach-campaigns/`, `src/config/`, `src/components/layout/`
**Files scanned:** 20+
**Pattern extraction date:** 2026-06-21
