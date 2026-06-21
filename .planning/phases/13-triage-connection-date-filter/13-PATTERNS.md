# Phase 13: Triage Connection-Date Filter - Pattern Map

**Mapped:** 2026-06-20
**Files analyzed:** 3 (1 new, 2 modified)
**Analogs found:** 3 / 3

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/features/contacts/components/triage/connection-year-filter.tsx` (NEW) | component (button-bar control) | transform / in-memory filter + URL state | `src/features/contacts/components/triage/last-contact-year.tsx` | role-match (button-bar UX); differs in click-to-range + nuqs |
| `src/features/contacts/components/triage/triage-workflow.tsx` (MODIFY) | component (client queue host) | transform (narrow in-memory list) | self (existing patterns in same file) | exact (extend existing) |
| `src/app/dashboard/contacts/triage/page.tsx` (NO CHANGE expected) | route (RSC data fetch) | request-response (read) | self | n/a — D-04 keeps DB query unchanged |

**Note:** Per D-04 the triage RSC (`page.tsx`) does NOT change — it keeps fetching the full untriaged set. It is listed only to confirm "no change". If the planner decides a `<Suspense>` boundary or `NuqsAdapter` check is needed, none is required: `NuqsAdapter` is already mounted app-wide in `src/app/layout.tsx` (line 59), so `useQueryState` works in any client descendant.

---

## Pattern Assignments

### `connection-year-filter.tsx` (NEW — component, button-bar + URL state)

**Primary analog:** `src/features/contacts/components/triage/last-contact-year.tsx` (button-bar UX, arrow-key/Enter nav, `forwardRef` focus).
**Secondary analog:** `src/features/contacts/components/contact-table/index.tsx` (minimal `useQueryState` usage) and `src/hooks/use-data-table.ts` (multi-param `useQueryStates`, `parseAsInteger`, `.withDefault`, `.withOptions`).

**Imports pattern** — copy from `last-contact-year.tsx` lines 1-4, add nuqs:
```typescript
'use client';

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { parseAsInteger, useQueryStates } from 'nuqs';
import { cn } from '@/lib/utils';
```
nuqs import shape (named, from `'nuqs'`) per `contact-table/index.tsx` line 8 and `use-data-table.ts` lines 21-29.

**forwardRef + imperative focus handle** (copy structure from `last-contact-year.tsx` lines 12-34):
```typescript
export interface ConnectionYearFilterHandle {
  focus: () => void;
}

export const ConnectionYearFilter = forwardRef<ConnectionYearFilterHandle, ConnectionYearFilterProps>(
  function ConnectionYearFilter({ years, onRangeChange, ... }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [focusedIndex, setFocusedIndex] = useState(0);

    useImperativeHandle(ref, () => ({
      focus: () => containerRef.current?.focus()
    }));
```
(If this control is NOT wired into the triage tab-chain, the `forwardRef`/handle is optional per D-02 "exact ref-forwarding is implementation detail" — but matching it keeps the file consistent with its three sibling controls: `last-contact-year.tsx`, `closeness-button-bar.tsx`, `how-met-input.tsx`, all of which expose a `*Handle` focus interface.)

**Keyboard-nav pattern** — copy verbatim shape from `last-contact-year.tsx` lines 47-73 (ArrowRight/Down → next, ArrowLeft/Up → prev, Enter → select). Adapt the `Enter`/`Tab` branch for click-to-range (D-01): first Enter sets start, second Enter on a different year sets the inclusive range.

**Button row + selected styling** — copy from `last-contact-year.tsx` lines 80-116. Key reusable classes:
```typescript
// container
className='flex gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 p-1'
// per-button (selected vs not + focus ring)
className={cn(
  'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
  isSelected(option)
    ? 'bg-primary text-primary-foreground border-primary'
    : 'bg-background hover:bg-accent',
  focusedIndex === i && containerRef.current === document.activeElement &&
    'ring-2 ring-ring ring-offset-1'
)}
```
For click-to-range, `isSelected(year)` becomes a range membership test: `year >= start && year <= end`. Render a "Clear / All years" affordance per D-06 (an extra button at the row's end, analogous to the `EARLIER_SENTINEL` extra option at `last-contact-year.tsx` lines 20-21, 89-90).

**nuqs URL state (D-05)** — model on `use-data-table.ts` lines 112-121 (`useQueryState` + `parseAsInteger.withOptions(...).withDefault(...)`) but use the two-param `useQueryStates` shape (lines 193) since this is a start/end pair:
```typescript
const [{ start, end }, setRange] = useQueryStates({
  connectionYearStart: parseAsInteger,
  connectionYearEnd: parseAsInteger
});
// clear: setRange({ connectionYearStart: null, connectionYearEnd: null })
```
Param names `connectionYearStart` / `connectionYearEnd` are pre-established by the API route (`src/app/api/contacts/route.ts` lines 67-68) — reuse them so Phase 14 (D-08) drives `GET /api/contacts` with the identical params. `parseAsInteger` (year as int) is the right parser; a custom `src/lib/parsers.ts` parser is NOT needed for a simple int pair (D-89 discretion — keep it minimal). Setting a param to `null` clears it from the URL → restores full queue (criterion #4).

**Data-derived year set (D-03)** — the control receives the distinct/min→max year list as a prop computed by the parent from already-fetched contacts (see `triage-workflow.tsx` change below). Do NOT fetch or hardcode years (contrast `last-contact-year.tsx` line 19 which hardcodes life-event years — that is the deliberate divergence).

---

### `triage-workflow.tsx` (MODIFY — component, in-memory narrowing)

**Analog:** the same file's existing patterns (extend, don't rewrite).

**Where to mount the control** — alongside the existing button-bar controls in the render block, `triage-workflow.tsx` lines 239-258 (`HowMetInput`, `LastContactYear`, `ClosenessButtonBar` are rendered in sequence). The new `ConnectionYearFilter` belongs near the top of the card (it filters the queue, not a per-contact field) — likely above `TriageCard` (line 237) rather than inside the per-contact field stack.

**Derive year list in-memory (D-03)** — add a `useMemo` over the `contacts` prop (typed `Contact[]`, line 7 / line 24-28). `Contact.linkedinConnectionDate` is `Date | null` (`drizzle/schema/contacts.ts` line 36 → inferred via `src/lib/domain/types.ts` line 21). Extract distinct `getFullYear()` values, drop nulls, sort:
```typescript
const connectionYears = useMemo(
  () =>
    Array.from(
      new Set(
        contacts
          .map((c) => c.linkedinConnectionDate)
          .filter((d): d is Date => d != null)
          .map((d) => new Date(d).getFullYear())
      )
    ).sort((a, b) => b - a),
  [contacts]
);
```

**Narrow the queue in-memory (D-04)** — derive a filtered list from `contacts` + the nuqs range, then drive `current`/`total` off the filtered list instead of the raw `contacts` prop. Currently `total = contacts.length` and `current = contacts[currentIndex]` (lines 45-46). Replace `contacts` there with the memoized `filteredContacts`. Reset `currentIndex` to 0 when the filter changes (mirror the existing `useEffect(... [currentIndex])` reset pattern at lines 49-56, but key it on the filter range).

**Live match count + empty state (D-07)** — `filteredContacts.length` is the "N contacts" count. The existing completion/empty render branch is `if (currentIndex >= total) { ... }` (lines 191-223) — add a sibling branch for `filteredContacts.length === 0` showing "No connections from {start}-{end} — clear the filter", reusing the centered `Card`/`CardContent` layout from lines 197-219.

**Read the nuqs range here or pass setter down?** — Either: (a) `ConnectionYearFilter` owns `useQueryStates` and calls `onRangeChange(start, end)` up to the workflow (lifts the value), or (b) the workflow also reads the same `useQueryStates` keys (nuqs is a shared URL store, so two `useQueryState` hooks on the same key stay in sync). Pattern (a) keeps the control reusable for Phase 14 (D-08) where the campaign builder reads the same params to hit the API instead. Prefer the control exposing its selection via callback/return while owning the URL write.

---

## Shared Patterns

### nuqs URL state
**Source:** `src/hooks/use-data-table.ts` lines 112-121, 193; `src/features/contacts/components/contact-table/index.tsx` line 8, 17
**Adapter:** already globally mounted — `NuqsAdapter` in `src/app/layout.tsx` line 59 wraps the app; no per-page setup needed.
**Apply to:** the new control's selection persistence (D-05).
```typescript
import { parseAsInteger, useQueryState, useQueryStates } from 'nuqs';
const [page, setPage] = useQueryState('page', parseAsInteger.withDefault(1));
```

### Button-bar control contract
**Source:** `last-contact-year.tsx`, `closeness-button-bar.tsx`, `how-met-input.tsx`
**Apply to:** the new control, for triage-tab-chain consistency.
- `'use client'` at top (line 1 of each).
- `forwardRef<XHandle, XProps>(function X(props, ref) {...})` with `XHandle = { focus: () => void }` and `useImperativeHandle(ref, () => ({ focus: () => containerRef.current?.focus() }))` (`closeness-button-bar.tsx` lines 26-36).
- Container `tabIndex={0}` + `onKeyDown`; child buttons `tabIndex={-1}` (`last-contact-year.tsx` lines 84-95).
- Named PascalCase export, no default export (CLAUDE.md / CONVENTIONS.md).

### Connection-year param naming (cross-phase contract)
**Source:** `src/app/api/contacts/route.ts` lines 67-68, 107-122
**Apply to:** nuqs param keys, so Phase 14 (D-08) reuses the control to drive `GET /api/contacts`.
- `connectionYearStart` → `gte(linkedinConnectionDate, new Date('${start}-01-01'))`
- `connectionYearEnd` → `lte(linkedinConnectionDate, new Date('${end}-12-31T23:59:59'))`
Triage filters client-side and ignores the API path, but uses the **same param names** so the control is consumer-agnostic.

### File/style conventions
**Source:** CLAUDE.md, `.planning/codebase/CONVENTIONS.md`
- kebab-case filename: `connection-year-filter.tsx`.
- Single quotes, no semicolon omission, 2-space indent, no trailing commas.
- `import type` for type-only imports (e.g. `import type { Contact } from '@/lib/domain/types'`).
- `'use client'` only on the interactive control (and the already-client `triage-workflow.tsx`); leave `page.tsx` as an RSC.

## No Analog Found

None. Every new behavior maps to an existing in-repo pattern (button-bar control, nuqs URL state, in-memory list narrowing). Click-to-range selection is the only genuinely new interaction — it is a small extension of the single-select keyboard model in `last-contact-year.tsx` lines 36-78, not a missing pattern.

## Metadata

**Analog search scope:** `src/features/contacts/components/triage/`, `src/features/contacts/components/contact-table/`, `src/hooks/`, `src/lib/parsers.ts`, `src/app/api/contacts/route.ts`, `src/app/dashboard/contacts/triage/page.tsx`, `drizzle/schema/contacts.ts`, `src/lib/domain/types.ts`, `src/app/layout.tsx`
**Files scanned:** 9
**Pattern extraction date:** 2026-06-20
