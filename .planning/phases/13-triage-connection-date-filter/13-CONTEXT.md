# Phase 13: Triage Connection-Date Filter - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

An **additive year / date-range filter** on the existing triage workflow, so the
owner can narrow the untriaged queue to a cohort of connections by when they
connected on LinkedIn (e.g. ID.me colleagues from 2021–2022). The filter operates
on `contacts.linkedinConnectionDate`.

**In scope:**
- A year/range filter control in the triage UI (a row of single-year buttons with
  click-to-range selection).
- Narrowing the visible triage queue to contacts whose `linkedinConnectionDate`
  falls in the selected year or two-year range.
- URL-driven selection (nuqs) so the filter survives a page reload.
- A clear/reset path that restores the full untriaged queue.
- Extracting the control as a reusable component so Phase 14 (Campaign Builder)
  can consume it.

**Out of scope (belongs to other phases):**
- The campaign builder's own contact filters (howMet, closeness, outreach status)
  — Phase 14.
- Any change to triage's existing controls (HowMet, Closeness, LastContactYear)
  beyond adding the new connection-year filter alongside them.
- Arbitrary single-day date precision — the feature is framed around years/ranges.
- Server-side query changes to the triage RSC (this phase filters client-side; see
  D-04).
</domain>

<decisions>
## Implementation Decisions

### Filter control UI
- **D-01:** Use a **row of single-year buttons with click-to-range** selection,
  consistent with the existing triage button-bar controls (HowMet, Closeness,
  LastContactYear). Clicking one year filters to that year; clicking a second year
  sets the inclusive range between the two (e.g. 2021 then 2022 → 2021–2022).
- **D-02:** Make the control **keyboard-navigable** in the same spirit as the
  existing `last-contact-year.tsx` (arrow-key move, Enter to select) so it fits
  the triage tab-chain UX. (Planner: match the existing pattern; exact ref-forwarding
  is implementation detail.)

### Year set (which buttons appear)
- **D-03:** Derive the year buttons **dynamically from the data** — the distinct
  set / min→max of `linkedinConnectionDate`. Because triage already loads the full
  untriaged set and filtering is client-side (D-04), compute the year list
  **in-memory from the already-fetched contacts** — no extra DB query.

### Queue refresh / filtering mechanism
- **D-04:** Filter **client-side**, narrowing the already-fetched untriaged list in
  memory by the selected year/range. The triage RSC keeps fetching all untriaged
  contacts as today; no change to its DB query.
- **D-05:** The **selection still lives in the URL via nuqs** (e.g. `connectionYearStart`/
  `connectionYearEnd` or a single range param — planner's naming choice). On mount
  the client reads the param and applies the filter, so the filter survives reload
  (success criterion #3). Clearing the param restores the full queue (criterion #4).

### Reset / clear UX
- **D-06:** Clicking an already-selected single year **deselects it**; an explicit
  **"Clear" / "All years"** control restores the full queue. (After a range is set,
  the Clear control is the primary reset; planner may allow a fresh first-click to
  begin a new selection.)

### Feedback / empty state
- **D-07:** Show a **live match count** ("N contacts") for the active filter, and a
  clear **empty-state message** when nothing matches (e.g. "No connections from
  2021–2022 — clear the filter"). Cheap to compute given client-side filtering.

### Reusability
- **D-08:** Build the year/range control as a **reusable component** (e.g.
  `ConnectionYearFilter`) so Phase 14's campaign builder (CAMP-02) can consume it.
  Note the **filtering logic differs per consumer**: triage filters client-side
  in-memory (D-04), whereas the Phase 14 campaign builder will use the existing
  `GET /api/contacts` `connectionYearStart`/`connectionYearEnd` query params. The
  reusable piece is the **control + nuqs URL state**, not the data-fetch path.

### Architectural invariants (from CLAUDE.md — non-negotiable)
- No new mutations here (read/filter only). If any new read endpoint is added, it
  uses Zod + the `{ success, data, error, meta }` envelope. (Not expected — this
  phase is client-side UI over already-loaded data.)
- TypeScript strict, named exports, kebab-case files, `'use client'` only where
  interactivity requires it.

### Claude's Discretion
- Exact nuqs param names/shape (single range param vs start/end pair).
- Whether the reusable component lives under `src/features/contacts/components/` or
  a shared location — planner's call based on Phase 14 needs.
- Precise keyboard interaction details for click-to-range.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Triage UI + data flow (where the filter is added)
- `src/app/dashboard/contacts/triage/page.tsx` — triage RSC; fetches all untriaged
  contacts (`isNull(triagedAt)`, `isNull(archivedAt)`), sorts by
  `linkedinConnectionDate` ASC NULLS LAST. **No change to the DB query** (D-04); the
  selected year params are read client-side.
- `src/features/contacts/components/triage/triage-workflow.tsx` — client component
  holding the queue and per-contact local state; the new filter control mounts here
  and narrows the in-memory list.
- `src/features/contacts/components/triage/last-contact-year.tsx` — existing
  year button-bar with arrow-key/Enter navigation and forwardRef focus control.
  **Closest reusable pattern** for the new control (note: its buckets are
  life-event years, not connection years — adapt, don't reuse verbatim).

### Filtering / schema
- `drizzle/schema/contacts.ts` — `linkedinConnectionDate: timestamp('linkedin_connection_date')`,
  indexed (`contacts_linkedin_connection_date_idx`).
- `src/app/api/contacts/route.ts` (≈ lines 67–122) — existing
  `connectionYearStart` (gte) / `connectionYearEnd` (lte) query-param filters on
  `linkedinConnectionDate`, added in Phase 12-02. **Not used by triage** (client-side),
  but the Phase 14 reuse path (D-08) and naming convention live here.

### nuqs URL-state pattern
- `src/hooks/use-data-table.ts` — established `useQueryState` / `useQueryStates`
  usage (`parseAsInteger`, `parseAsString`, `.withDefault`).
- `src/features/contacts/components/contact-table/index.tsx` — minimal per-component
  `useQueryState` example.
- `src/lib/parsers.ts` — custom nuqs parsers if a structured param is wanted.

### Existing date/range UI (alternatives considered, not chosen)
- `src/components/ui/table/data-table-date-filter.tsx` — react-day-picker range
  popover (the calendar option we did **not** pick; here for reference only).

### Conventions
- `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/STRUCTURE.md`,
  `.planning/codebase/ARCHITECTURE.md` — naming, file layout, RSC→client data flow.

### Forward dependency
- `.planning/REQUIREMENTS.md` — TRGE-01 (this phase) and CAMP-02 (Phase 14, the
  reuse target for the year filter).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `last-contact-year.tsx`: button-bar UX (arrow-key nav, Enter select, forwardRef
  focus) is the template for the new `ConnectionYearFilter` control — adapt the
  interaction model, swap the year set to data-derived connection years.
- nuqs (`useQueryState`) is already a project pattern — use it for the URL-persisted
  selection (D-05).

### Established Patterns
- Triage controls are all **button bars**, not dropdowns/calendars — the chosen
  control (D-01) matches this convention.
- Triage RSC loads the full untriaged set and a client component walks it one card
  at a time — client-side narrowing (D-04) slots in without changing the data fetch.

### Integration Points
- New control renders inside `triage-workflow.tsx` alongside HowMet / LastContactYear /
  Closeness.
- The same control will be imported by the Phase 14 campaign builder (D-08), where it
  drives the `GET /api/contacts` year params instead of in-memory filtering.

</code_context>

<specifics>
## Specific Ideas

- Concrete use case driving the feature: surface "ID.me colleagues from 2021–2022"
  as a cohort to triage together.
- Single-year and two-year-range are the explicit target interactions (success
  criteria #1 and #2).

</specifics>

<deferred>
## Deferred Ideas

- **Campaign-builder multi-filter UI** (howMet + closeness + outreach status combined
  with the year filter) — Phase 14. This phase only adds the year filter to triage;
  it builds the year control to be reusable, but does not build the other filters.
- **Arbitrary single-day date precision** — out of scope; the feature is year/range
  framed. Could revisit if the owner ever needs day-level cohorts.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 13-triage-connection-date-filter*
*Context gathered: 2026-06-20*
