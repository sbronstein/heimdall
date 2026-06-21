---
phase: 13-triage-connection-date-filter
plan: 01
subsystem: contacts/triage
tags: [filter, nuqs, triage, connection-year, tdd]
dependency_graph:
  requires: []
  provides:
    - connection-year helpers (deriveConnectionYears, filterByConnectionYearRange, clampConnectionYear)
    - ConnectionYearFilter button-bar component with nuqs URL state
    - triage-workflow wired for in-memory year/range narrowing
  affects:
    - src/features/contacts/components/triage/triage-workflow.tsx
tech_stack:
  added: []
  patterns:
    - nuqs useQueryStates with parseAsInteger for URL-persisted filter state
    - generic constraint <T extends { linkedinConnectionDate: Date | null }> for reusable pure helpers
    - forwardRef + useImperativeHandle focus handle pattern (sibling triage controls)
    - useMemo for derived filtered list off already-fetched contacts
key_files:
  created:
    - src/features/contacts/lib/connection-year.ts
    - src/features/contacts/lib/connection-year.test.ts
    - src/features/contacts/components/triage/connection-year-filter.tsx
  modified:
    - src/features/contacts/components/triage/triage-workflow.tsx
decisions:
  - D-04: Filtering is client-side over the already-fetched untriaged set; page.tsx DB query is unchanged
  - D-05: connectionYearStart/connectionYearEnd nuqs params persist selection across reloads
  - D-06: Clicking already-selected year deselects; "All years" clears both params
  - D-08: ConnectionYearFilter is standalone and owns the URL state, ready for Phase 14 (GET /api/contacts reuse)
  - T-13-01: clampConnectionYear bounds hostile URL values to [1990, currentYear+1] before use in filter
metrics:
  duration: ~8 minutes
  completed: 2026-06-21T13:22:41Z
  tasks_completed: 3
  files_changed: 4
---

# Phase 13 Plan 01: Triage Connection-Year Filter — Summary

**One-liner:** Client-side connection-year triage filter with click-to-range button bar, nuqs URL persistence, and 20 Vitest cases covering derivation, range-filtering, and param clamping.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Pure connection-year helpers + Vitest test | a2965ab | `connection-year.ts`, `connection-year.test.ts` |
| 2 | ConnectionYearFilter button-bar with nuqs URL state | 7fb6c90 | `connection-year-filter.tsx` |
| 3 | Wire filter into triage-workflow — derive years, narrow queue, live count + empty state | 450a2c6 | `triage-workflow.tsx` |

## What Was Built

### Task 1 — Pure helpers + 20-case Vitest suite

`src/features/contacts/lib/connection-year.ts` exports:
- `MIN_CONNECTION_YEAR = 1990` — lower bound constant
- `deriveConnectionYears<T>`: distinct calendar years from `linkedinConnectionDate`, nulls dropped, sorted descending
- `filterByConnectionYearRange<T>`: null/null passthrough (full queue); otherwise inclusive [lo, hi] window; null-date contacts excluded when any bound set
- `clampConnectionYear`: rejects NaN, non-finite, < 1990, > currentYear+1 — returns null for any hostile URL value (T-13-01 mitigated)

Generic constraint `<T extends { linkedinConnectionDate: Date | null }>` — no runtime import of `Contact`.

Vitest suite (`connection-year.test.ts`): 20 tests, all green. Covers fixture derivation (2019/2021/2021/2022/null), single-year filter, two-year range, null passthrough, reversed-range args, adjacent-year exclusion, null-date exclusion, and all clamp edge cases.

### Task 2 — ConnectionYearFilter component

`src/features/contacts/components/triage/connection-year-filter.tsx`:
- `'use client'`, named PascalCase export, no default export
- `ConnectionYearFilterHandle = { focus: () => void }` — forwardRef interface matching three sibling controls
- Props: `{ years: number[] }` — data-derived from parent; no hardcoded year literals
- Owns `connectionYearStart` / `connectionYearEnd` URL state via `useQueryStates` + `parseAsInteger` (cross-phase contract for D-08)
- Click-to-range state machine: (a) no start → set single; (b) start set, no end → deselect if same, else set inclusive range; (c) range set → begin fresh selection
- "All years" clear button: sets both params to null
- `isSelected(year)`: range-membership test for button highlight
- Keyboard nav: ArrowLeft/Right moves focus, Enter activates (D-02)
- TypeScript clean (`npx tsc --noEmit` passed)

### Task 3 — triage-workflow wiring

`src/features/contacts/components/triage/triage-workflow.tsx` changes:
- Added imports: `parseAsInteger`, `useQueryStates`, `useMemo`, `ConnectionYearFilter`, `deriveConnectionYears`, `filterByConnectionYearRange`, `clampConnectionYear`
- `connectionYears` useMemo: derived from `contacts` prop (D-03)
- `filteredContacts` useMemo: `filterByConnectionYearRange(contacts, clampConnectionYear(start), clampConnectionYear(end))` — T-13-01 hardening applied
- `total` and `current` now read from `filteredContacts` (not raw `contacts`)
- `useEffect` resets `currentIndex` to 0 when either URL param changes
- Empty-filter render branch (before completion): when `total === 0 && filter active`, shows "No connections from {range} — clear the filter" + `ConnectionYearFilter` for reachable Clear (D-07)
- `<ConnectionYearFilter ref={...} years={connectionYears} />` rendered above TriageCard with sibling `{filteredContacts.length} contacts` live count (D-07)
- `page.tsx` untouched (D-04)

## Deviations from Plan

### Pre-existing ESLint infrastructure failure

The plan's acceptance criteria for Tasks 2 and 3 specify `npx eslint <file>` should report no errors. ESLint 8.48.0 fails with a `TypeError: Converting circular structure to JSON` when resolving the `.eslintrc.json` config — this is a pre-existing project-wide failure (reproduced on unmodified `last-contact-year.tsx` in the main repo). `npx tsc --noEmit` was used as the authoritative type-correctness gate and passed cleanly. The ESLint failure is not caused by this plan's changes.

None other — plan executed as specified.

## Known Stubs

None. All filter logic is wired to live data. No placeholder text or empty-data stubs.

## Threat Flags

None beyond what the plan's threat model documents. The `clampConnectionYear` mitigation for T-13-01 is implemented: hostile URL values (`99999999`, `-1`, `abc` parsed by nuqs as null) yield null → full queue, never an exception or DB write.

## Self-Check: PASSED

All key files confirmed present. All task commits confirmed in git log.
