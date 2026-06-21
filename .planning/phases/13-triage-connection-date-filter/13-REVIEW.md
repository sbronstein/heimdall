---
phase: 13-triage-connection-date-filter
reviewed: 2026-06-21T14:30:00Z
depth: standard
status: resolved
findings: 4
critical: 0
warning: 1
info: 3
resolved: 4
resolution_note: "All 4 findings (WR-01, IN-01, IN-02, IN-03) fixed during execute-phase. WR-01 fixed via during-render currentIndex reset (the reviewer's Math.min clamp would have broken the verified Triage-Complete screen); IN-02 keyed empty-state on clamped bounds; IN-01 removed dead isNaN; IN-03 clamped focusedIndex. tsc clean, 20/20 unit tests green post-fix."
files_reviewed: 4
files_reviewed_list:
  - src/features/contacts/lib/connection-year.ts
  - src/features/contacts/lib/connection-year.test.ts
  - src/features/contacts/components/triage/connection-year-filter.tsx
  - src/features/contacts/components/triage/triage-workflow.tsx
---

# Phase 13: Code Review Report

**Reviewed:** 2026-06-21T14:30:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Phase 13 adds a client-side connection-year triage filter: a pure-logic helper module
(`connection-year.ts`), a reusable `ConnectionYearFilter` button-bar component owning the
nuqs URL state, and wiring in `triage-workflow.tsx`. The implementation is well-structured.
The pure helpers are correct, the click-to-range state machine is sound, the T-13-01 clamping
mitigates hostile URL values, and D-04 is confirmed (triage `page.tsx` is untouched). The
`document.activeElement` in className expressions is a pre-existing project-wide pattern
(identical at `last-contact-year.tsx:101-102`) and is not flagged as a phase-13 regression.

One Warning-class correctness bug is present: a single-render flash of "Triage Complete!"
when switching year filters, caused by the `useEffect` reset of `currentIndex` running after
the first render with the new (smaller) filter. Three Info items cover redundant logic,
a display gap in the empty-filter message, and a latent prop-stability assumption.

---

## Warnings

### WR-01: Stale `currentIndex` briefly renders "Triage Complete!" when year filter changes

**File:** `src/features/contacts/components/triage/triage-workflow.tsx:279`

**Issue:**
The `useEffect` at line 102-104 resets `currentIndex` to 0 when `connectionYearStart` or
`connectionYearEnd` changes, but effects run *after* the first render with the new values.
During that first render, `filteredContacts` reflects the new year filter (new `total`) while
`currentIndex` still holds the old queue position. If the old position exceeds the new total —
e.g., user was at position 7 in the 2022 filter and switches to the 2021 filter which has 3
contacts — the guard at line 279 (`currentIndex >= total` → `7 >= 3`) triggers and renders
the "Triage Complete!" screen for one React cycle before the effect fires and resets to 0.

This is an observable UX defect: the user sees the completion screen flash for a brief moment
after every year-filter change where their previous position exceeds the new queue size.

**Minimal fix — clamp effective index in the render, avoiding the stale-path:**
```tsx
// Replace lines 98-99
const total = filteredContacts.length;
// Clamp: prevents stale currentIndex from triggering completion or out-of-bounds current
const effectiveIndex = total > 0 ? Math.min(currentIndex, total - 1) : 0;
const current = filteredContacts[effectiveIndex] as Contact | undefined;

// Replace line 279 check (completion branch)
if (currentIndex >= total && total > 0) {
  // Only show completion when the user has actively progressed past the last item.
  // After a filter change, effectiveIndex is clamped, so this branch is not entered
  // on the first render with new filter values.
}
```

A cleaner alternative is to drive `current` from `effectiveIndex` and keep `currentIndex` as
the raw progression counter, then check `currentIndex >= total && total > 0`. The useEffect
reset can remain as-is to keep the counter synchronized for the next filter activation.

---

## Info

### IN-01: Redundant `isNaN` check after `!isFinite` in `clampConnectionYear`

**File:** `src/features/contacts/lib/connection-year.ts:35`

**Issue:**
`NaN` is not finite — `!isFinite(NaN)` is already `true` — so the `|| isNaN(value)` branch is
never reached. The double check is harmless but misleading: it implies `isFinite` does not
cover NaN, which is incorrect.

**Fix:**
```ts
// Before
if (!isFinite(value) || isNaN(value)) return null;
// After
if (!isFinite(value)) return null;  // covers NaN, Infinity, -Infinity
```

---

### IN-02: `rangeLabel` in the empty-filter branch uses raw (un-clamped) URL param values

**File:** `src/features/contacts/components/triage/triage-workflow.tsx:254-257`

**Issue:**
The empty-filter display message interpolates `connectionYearStart` / `connectionYearEnd`
directly from nuqs without applying `clampConnectionYear`. The filter itself correctly clamps
before passing values to `filterByConnectionYearRange` (lines 90-94), so the filter logic is
safe. However, if both conditions align — zero untriaged contacts *and* a hand-crafted URL
with a hostile value (e.g., `?connectionYearStart=99999999`) — the message reads:
"No connections from 99999999 — clear the filter to see all contacts." This is misleading
because `clampConnectionYear(99999999)` returns `null`, meaning no filter is actually active.

**Fix:** Display the clamped values (or derived `connectionYears` range) in the label:
```tsx
const clampedStart = clampConnectionYear(connectionYearStart);
const clampedEnd   = clampConnectionYear(connectionYearEnd);
const rangeLabel =
  clampedStart != null && clampedEnd != null
    ? `${clampedStart}–${clampedEnd}`
    : String(clampedStart ?? clampedEnd ?? connectionYearStart ?? connectionYearEnd);
```

This is low-impact (hostile values only reach this branch when `contacts` is empty AND the
URL is hand-crafted), but the fix costs one line and makes the message correct by construction.

---

### IN-03: `focusedIndex` not clamped/reset when `years` prop changes length

**File:** `src/features/contacts/components/triage/connection-year-filter.tsx:26`

**Issue:**
`focusedIndex` starts at 0 and is bounded by keyboard-nav handlers, but there is no
`useEffect` or derived clamp that resets it when the `years` prop shrinks. If `years` changes
from N items to M < N items during the component's lifetime, `focusedIndex` can exceed
`years.length` (the "All years" sentinel index). On the next Enter keypress before any arrow
key corrects the index, `allOptions[focusedIndex]` returns `undefined` — neither `null` (the
"All years" sentinel) nor a valid `number`, so the `if (focused === null)` guard is bypassed
and `onYearClick(undefined)` is called.

This diverges from the analog `last-contact-year.tsx`, which uses a hardcoded year array that
can never change. Here, `years` is a prop derived from the parent's `useMemo` over `contacts`;
in practice `contacts` is a stable RSC prop, so `years` does not change during a session. The
bug is latent but becomes reachable if this component is reused (D-08, Phase 14) in a context
where the year list updates.

**Fix:** Add a useEffect (or add an `options.length` check in handleKeyDown):
```tsx
// Reset focusedIndex if years shrinks and the current index is now out of range
useEffect(() => {
  setFocusedIndex((prev) => Math.min(prev, years.length)); // years.length = "All years" index
}, [years.length]);
```

Or guard in the Enter handler:
```tsx
const focused = focusedIndex < allOptions.length ? allOptions[focusedIndex] : null;
```

---

## Structural Notes

- **D-04 confirmed:** `git diff 9c32567..HEAD -- src/app/dashboard/contacts/triage/page.tsx`
  produces no output. The RSC page and its DB query are unchanged.
- **Pre-existing `document.activeElement` pattern:** The expression
  `containerRef.current === document.activeElement` inside a className `cn()` call
  (connection-year-filter.tsx:131, 153) is an exact copy of the analog at
  `last-contact-year.tsx:101-102`, which is already in production use. Not flagged as a
  phase-13 regression.
- **Pre-existing ESLint infrastructure failure:** `// eslint-disable-line react-hooks/exhaustive-deps`
  suppressions at lines 104 and 114 of triage-workflow.tsx are present because the project-wide
  ESLint config fails with a circular JSON resolution error (documented in 13-01-SUMMARY.md).
  Not a phase-13 finding.

---

_Reviewed: 2026-06-21T14:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
