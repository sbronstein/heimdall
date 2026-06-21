# Phase 14: Campaign Builder UI - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

The browser UI for the v1.2 outreach flow — **pure UI over the API surface already shipped in Phase 12**. Two things ship:

1. **Campaign list** at `/dashboard/outreach/` — cards showing each campaign with per-status progress.
2. **Campaign builder** — a single screen where the owner loads their contacts, filters them (howMet, connection year/range, closeness, outreach status), checkbox-multi-selects recipients into a persistent "selected" tray, names the campaign + writes a goal/instruction, and saves — which creates the campaign, bulk-adds the selected contacts as `outreach_email` rows, and navigates to a placeholder review page.

**In scope:**
- New `/dashboard/outreach/` route (campaign list) + new sidebar nav entry.
- A new **purpose-built selection list** component for the builder (not the contact data-table, not the triage card flow).
- A filter bar reusing the triage button-bar controls (`ConnectionYearFilter`, `ClosenessButtonBar`) plus howMet + outreach-status controls.
- An inline name + goal/instruction panel on the builder.
- The save sequence: `POST /api/outreach-campaigns` → `POST .../[id]/emails` (bulk add) → navigate.
- A **minimal placeholder** `/dashboard/outreach/[id]` review page (campaign header + added-contacts list at `pending`) so save has a real destination. Phase 15 enriches it.

**Out of scope (other phases — do NOT build here):**
- Any new API route, mutation, or schema change — the entire campaign/email REST surface and `GET /api/contacts` filters shipped in Phase 12. Phase 14 only **calls** them.
- Email review/edit/approve/regenerate UI, status badges per email, progress header with approve gate — **Phase 15** (this phase ships only the thin placeholder review page).
- Email generation / personalization — Phase 16 skill.
- Gmail draft creation / recipient discovery — Phase 17 skill.
- Triage's own connection-year filter — already shipped in Phase 13.

</domain>

<decisions>
## Implementation Decisions

### Contact selection surface (Area 1)
- **D-01:** **Purpose-built selection list** — a new component tuned for multi-select, NOT the existing contact data-table and NOT the triage one-at-a-time card flow. Dense, scannable rows with checkboxes.
- **D-02:** **Each row shows all four field groups:** (a) name + howMet + closeness tier badge, (b) current company / role (and/or company/role at-connection), (c) LinkedIn connection date, (d) outreach status + last-contacted date. Enough signal to decide inclusion at a glance and to avoid re-adding someone recently contacted.
- **D-03:** **Selections persist across filter changes.** Filtering to one cohort, checking some, then re-filtering to a different cohort *adds* to the set — a running "**N selected**" tray reflects the full selection regardless of the active filter. This enables building one campaign from multiple cohorts. (Explicitly NOT "reset on filter change" and NOT "drop selections filtered out of view.")
- **D-04:** **Default ordering = closeness, closest first** (tier 1–2 at top). Prioritizes the strongest relationships when scanning.

### Filter bar + data flow (Area 2)
- **D-05:** **Load all non-archived contacts up front, filter client-side in memory.** This **deliberately OVERRIDES the Phase 13 D-08 plan**, which assumed the builder would drive server-side `GET /api/contacts` query params. The owner chose load-all client-side filtering instead. Consequence: it makes D-03 (persist-across-filters) and the select-all semantics (D-08) trivial because every matching contact is already in memory.
- **D-06:** **Load set = all contacts where `archived_at IS NULL`** (~1500 today). Not scoped to triaged-only. The four filters then narrow this in-memory set.
- **D-07:** **Reuse the triage button-bar filter controls** — `ConnectionYearFilter` (built reusable in Phase 13) and `ClosenessButtonBar` — and add howMet + outreach-status controls in the same button-bar style. The **outreach-status filter defaults to showing only "not yet contacted"** so the owner doesn't re-target people mid-sequence; the DB dedup (CAMP-07, `onConflictDoNothing`) still backstops at save.

### Select-all semantics (Area 3)
- **D-08:** **"Select all" selects every row matching the current filter**, added on top of (not replacing) anything already in the tray. Per-cohort select-all is the intended way to build up a large recipient set. This satisfies CAMP-05 "select-all within the current filter." (NOT "select all 1500 ignoring the filter.")
- **D-09:** **The selected tray supports review + remove individuals + clear-all.** The owner can expand the tray to see everyone selected, remove people one at a time, and reset entirely — so a cross-cohort set can be pruned before committing.

### Campaign list + save flow (Area 4)
- **D-10:** **`/dashboard/outreach/` renders campaigns as cards** with name, goal snippet, status, and a segmented **progress bar / count badges** for selected · generated · approved · drafted (the per-status counts `GET /api/outreach-campaigns` already returns). Satisfies success criterion #1.
- **D-11:** **Name + goal/instruction are entered in an inline panel on the builder** (side or top), on the same screen as the selection list — one screen to filter, select, name, and save. NOT a save-time dialog and NOT a separate first step.
- **D-12:** **Save sequence:** `POST /api/outreach-campaigns { name, goalInstruction }` → take returned id → `POST /api/outreach-campaigns/[id]/emails { contactIds }` (bulk add, deduped server-side) → navigate to `/dashboard/outreach/[id]`.
- **D-13:** **Save navigates to a minimal placeholder review page** at `/dashboard/outreach/[id]`: campaign header (name, goal, per-status counts) + a list of the added contacts showing `pending` status. Phase 15 enriches this same route with edit/approve/regenerate. This gives criterion #4 ("navigates to its review page") a real destination without building Phase 15's scope.
- **D-14:** **Hard save gate = campaign name present AND ≥1 contact selected.** Goal/instruction is **optional** at creation time (the owner did not require it; it can be added/edited before Phase 16 generation runs).

### Claude's Discretion (planner decides; recommendation given)
- **CD-01:** **Disable the Save button while the two POSTs are in flight** so a double-click cannot create two campaigns. Standard correctness — recommended, not user-mandated.
- **CD-02:** **Handle the partial-failure path** where campaign-create succeeds but bulk-add fails — surface an error rather than silently landing on an empty campaign. Two sequential POSTs need a defined failure path. Recommended.
- **CD-03:** **Where the new selection-list + filter-bar components live** (e.g. `src/features/outreach/components/`) and how the reused triage controls are imported/shared — planner's call following the established feature-folder convention. The reusable piece from Phase 13 is the control + nuqs URL state, not a data-fetch path (the builder fetches differently per D-05).
- **CD-04:** **Closeness ordering (D-04) implemented client-side** over the loaded set (consistent with D-05 load-all), rather than relying on an API sort param. Recommended.
- **CD-05:** **Empty/loading states** — skeleton while the ~1500-contact load resolves; clear empty-state copy when a filter matches nothing (mirror Phase 13 D-07's live-count + empty-message pattern). Planner specifies copy.
- **CD-06:** **Goal/instruction field UX** (placeholder/help text hinting it drives Phase 16 generation) — planner's call.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v1.2 milestone trail
- `.planning/REQUIREMENTS.md` §"CAMP-01"–"CAMP-05" — the five requirements this phase delivers (filter by howMet / connection year / closeness / outreach status; checkbox multi-select incl. select-all-within-filter). Note CAMP-06/07/08 (create, dedup bulk insert, list counts) are already **Complete** in Phase 12 — this phase consumes them.
- `.planning/ROADMAP.md` §"Phase 14: Campaign Builder UI" — goal + 5 success criteria (the `/dashboard/outreach/` list, simultaneous filtering, checkbox + select-all, name+goal save→navigate, no-duplicate-on-double-save).

### Phase 12 — the API this UI consumes (read before planning)
- `.planning/phases/12-api-routes/12-CONTEXT.md` — the locked REST surface. Key endpoints this phase calls: `POST /api/outreach-campaigns` (create `{ name, goalInstruction }`), `POST .../[id]/emails` (bulk add `{ contactIds }`, deduped via `onConflictDoNothing` → CAMP-07/criterion #5), `GET /api/outreach-campaigns` (list + per-status `emailCounts` for the progress cards → D-10), and the extended `GET /api/contacts` filters.
- `src/app/api/outreach-campaigns/route.ts` and `src/app/api/outreach-campaigns/[id]/emails/route.ts` — exact request/response shapes the builder posts to and the bulk-add `{ inserted, skipped }`-style response (CD-05 in 12-CONTEXT).
- `src/app/api/contacts/route.ts` — the `GET /api/contacts` route; even though D-05 filters client-side, this is the source for the contact list payload and confirms the available fields (howMet, closeness, outreach status, `linkedinConnectionDate`, company/role).

### Phase 13 — reusable filter control (read before building the filter bar)
- `.planning/phases/13-triage-connection-date-filter/13-CONTEXT.md` — D-08 explicitly flags this phase as the reuse target and warns the **filtering path differs** (triage = in-memory; builder originally planned server-side — now ALSO in-memory per D-05). The reusable piece is the control + nuqs state.
- `src/features/contacts/components/triage/connection-year-filter.tsx` — the `ConnectionYearFilter` reusable button-bar control (data-derived year set, click-to-range, keyboard nav, forwardRef handle) to reuse in the builder's filter bar (D-07).
- `src/features/contacts/components/triage/closeness-button-bar.tsx` — the `ClosenessButtonBar` control (`onSelect`, forwardRef handle) to reuse for the closeness filter (D-07).
- `src/features/contacts/components/triage/how-met-input.tsx`, `last-contact-year.tsx` — patterns for the howMet and additional button-bar style controls.

### UI patterns to mirror (read before writing components)
- `src/app/dashboard/contacts/page.tsx` — the RSC page pattern: server-side DB read for initial data → `<PageContainer>` → client feature component. Template for the new `src/app/dashboard/outreach/page.tsx` (and `[id]/page.tsx`).
- `src/components/layout/page-container.tsx` (`PageContainer`) — page chrome wrapper used by every dashboard page.
- `src/features/contacts/components/triage/triage-workflow.tsx` — closest analog for a `'use client'` component that holds a loaded contact set + filter controls and narrows it in memory (the D-05/D-06 pattern).
- `src/config/nav-config.ts` — sidebar nav config; add the new Outreach entry here.
- `src/components/ui/*` — shadcn primitives (Card, Checkbox, Progress, Badge, Button, Input/Textarea) for the cards (D-10), selection rows (D-02), and inline name/goal panel (D-11).
- `src/hooks/use-data-table.ts` / `src/features/contacts/components/contact-table/index.tsx` — nuqs `useQueryState` URL-state pattern (for filter persistence) and an example of the data-table infra we are **not** using for selection (D-01) but whose nuqs pattern still applies.

### Project anchors
- `CLAUDE.md` / `.planning/PROJECT.md` — REST-only (no server actions — the builder mutates via `fetch` to the API routes), `{ success, data, error, meta }` envelope on reads, TypeScript strict, named exports, `'use client'` only where needed, soft delete via `archived_at`.
- `.planning/codebase/CONVENTIONS.md` / `.planning/codebase/STRUCTURE.md` — kebab-case files, `src/features/<domain>/components/` layout, PascalCase component named exports, `interface [Name]Props`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`ConnectionYearFilter`** (`triage/connection-year-filter.tsx`) — reuse directly in the builder filter bar (D-07); built reusable in Phase 13 for exactly this.
- **`ClosenessButtonBar`** (`triage/closeness-button-bar.tsx`) — reuse for the closeness filter (D-07).
- **shadcn primitives** (`src/components/ui/`) — Card / Progress / Badge for the campaign list cards (D-10); Checkbox for selection rows; Input/Textarea for the inline name+goal panel (D-11).
- **Phase 12 API routes** — all create/bulk-add/list endpoints already exist; the builder only issues `fetch` calls (D-12).
- **nuqs `useQueryState`** — established for URL-persisted filter state (use for the builder's filters so a reload restores them).

### Established Patterns
- **RSC page → client feature component** — `dashboard/**/page.tsx` does the initial DB read and passes typed props to a `'use client'` component. The outreach list page and the builder follow this (CD-03).
- **Triage loads the full set + a client component filters in memory** — the exact shape D-05/D-06 adopt (load all non-archived contacts, narrow client-side). `triage-workflow.tsx` is the closest template.
- **Filter controls are button-bars, not dropdowns** — the app convention; the new howMet + outreach-status controls follow it (D-07).
- **All mutations via `fetch` to `/api/*`** — no server actions (CLAUDE.md). Save = two sequential POSTs (D-12).

### Integration Points
- **Sidebar** — new Outreach entry in `src/config/nav-config.ts`.
- **`GET /api/outreach-campaigns`** — feeds the campaign list cards + per-status counts (D-10).
- **`POST /api/outreach-campaigns` + `POST .../[id]/emails`** — the save path (D-12); dedup is server-side (criterion #5 already guaranteed by Phase 12).
- **`/dashboard/outreach/[id]`** — the placeholder review page (D-13) is the seam Phase 15 builds onto.

</code_context>

<specifics>
## Specific Ideas

- **Concrete use case:** build a campaign from a cohort like "ID.me colleagues 2021–2022" (the same cohort framing Phase 13's year filter was built for), then add a second cohort to the same campaign before saving — which is why selections persist across filter changes (D-03).
- **Tray as the source of truth for "who's in":** the running "N selected" tray (D-03/D-09) is the owner's working set; the filtered list is just the discovery surface.
- **Progress cards** (D-10) reuse the four counts the API already groups (selected/generated/approved/drafted) — no new aggregation needed.

</specifics>

<deferred>
## Deferred Ideas

- **Rich review/edit/approve UI** — per-email edit, approve gate, regenerate, status badges, approve/total header — **Phase 15**. Phase 14 ships only the thin placeholder review page (D-13).
- **Free-text name search within the selection list** — the "hybrid server+client" filter option was not chosen; the four structured filters are the scope. Revisit if scanning by name becomes painful.
- **Server-side paginated contact loading for the builder** — explicitly rejected in favor of load-all client-side (D-05). Revisit only if the contact count grows enough that loading all non-archived rows becomes a real perf problem (note: project flags full-table contact scans as already noticeable at 1500+ — keep an eye on the payload size).
- **Re-adding already-contacted contacts as a first-class flow** — the outreach-status filter defaults to hiding them (D-07); a deliberate "re-target" mode is a later concern.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 14-Campaign Builder UI*
*Context gathered: 2026-06-21*
