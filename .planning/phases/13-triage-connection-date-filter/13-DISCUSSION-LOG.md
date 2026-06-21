# Phase 13: Triage Connection-Date Filter - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-20
**Phase:** 13-triage-connection-date-filter
**Areas discussed:** Filter control, Year set, Reuse, Queue refresh, Clear UX, Count + empty state

---

## Filter control

| Option | Description | Selected |
|--------|-------------|----------|
| Year button row, click-to-range | A row of individual year buttons; click one = that year, click a second = the range between them. Consistent with the existing button-bar triage UX; keyboard-navigable. | ✓ |
| Two dropdowns (start / end) | A 'From year' / 'To year' select pair. Compact for ranges but a new control pattern in triage. | |
| Calendar date-range popover | Reuse DataTableDateFilter (react-day-picker range). Full date precision but heavier than year-framed criteria. | |

**User's choice:** Year button row, click-to-range
**Notes:** Matches the existing HowMet / Closeness / LastContactYear button bars in triage.

---

## Year set

| Option | Description | Selected |
|--------|-------------|----------|
| Dynamic from data | Derive year buttons from actual min→max of linkedinConnectionDate. Always accurate, no dead buttons. | ✓ |
| Fixed recent range | Hardcode a span (current year back to ~2010). Simpler, no extra query, but can show empty/missing years. | |

**User's choice:** Dynamic from data
**Notes:** Because triage already loads the full untriaged set and filtering is client-side, the year list is computed in-memory from the loaded contacts — no extra DB query.

---

## Reuse

| Option | Description | Selected |
|--------|-------------|----------|
| Build reusable now | Extract a shared ConnectionYearFilter that both triage and the Phase 14 campaign builder consume. | ✓ |
| Triage-only, refactor later | Build inline now; generalize when Phase 14 needs it. | |

**User's choice:** Build reusable now
**Notes:** Phase 14 (CAMP-02) needs the same connection-year filter. Reusable piece is the control + nuqs URL state; the data-fetch path differs (triage client-side, campaign builder uses the contacts API year params).

---

## Queue refresh

| Option | Description | Selected |
|--------|-------------|----------|
| Server re-query via URL | Triage RSC reads year params and applies connectionYearStart/End to its DB query. Uses the index; survives reload naturally. | |
| Client-side filter of fetched list | Keep fetching all untriaged contacts, narrow the in-memory list by year. Instant, no refetch. | ✓ |
| You decide | Defer to research/planning. | |

**User's choice:** Client-side filter of fetched list
**Notes:** Selection still persisted in the URL via nuqs so it survives reload (criterion #3); the client reads the param on mount and narrows the list.

---

## Clear UX

| Option | Description | Selected |
|--------|-------------|----------|
| Click selected year again + Clear button | Clicking a selected single year deselects it; explicit Clear / All years restores the full queue. | ✓ |
| Only an explicit Clear button | Range set by two clicks; reset only via Clear/All. | |
| You decide | Defer to planning. | |

**User's choice:** Click selected year again + Clear button
**Notes:** —

---

## Count + empty state

| Option | Description | Selected |
|--------|-------------|----------|
| Show match count + empty message | Live 'N contacts' count for the active filter; clear empty-state message when nothing matches. | ✓ |
| No count, just filter the queue | Filter silently; empty falls back to the normal triage done/empty state. | |
| You decide | Defer to planning. | |

**User's choice:** Show match count + empty message
**Notes:** Cheap to compute given client-side filtering.

---

## Claude's Discretion

- Exact nuqs param names/shape (single range param vs start/end pair).
- Whether the reusable component lives under `src/features/contacts/components/` or a shared location.
- Precise keyboard interaction details for click-to-range.

## Deferred Ideas

- Campaign-builder multi-filter UI (howMet + closeness + outreach status) — Phase 14.
- Arbitrary single-day date precision — out of scope; feature is year/range framed.
