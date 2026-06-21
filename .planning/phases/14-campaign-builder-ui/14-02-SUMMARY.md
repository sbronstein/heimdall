---
phase: 14-campaign-builder-ui
plan: "02"
subsystem: outreach/campaign-builder
tags: [campaign-builder, filter, multi-select, ui-components, nuqs]
dependency_graph:
  requires: [13-triage-connection-date-filter]
  provides: [applyBuilderFilters, BuilderFilterBar, ContactSelectionList, CampaignNamePanel]
  affects: [14-03-campaign-builder-shell]
tech_stack:
  added: []
  patterns: [nuqs-url-state, forwardRef-handle, in-memory-filter, closeness-ordering]
key_files:
  created:
    - src/features/outreach/lib/builder-filters.ts
    - src/features/outreach/components/builder-filter-bar.tsx
    - src/features/outreach/components/contact-selection-list.tsx
    - src/features/outreach/components/campaign-name-panel.tsx
  modified: []
decisions:
  - "howMet filter uses free-text Input (not a button-bar) because howMet values are unstructured strings — a substring search over ~1500 contacts is the right UX"
  - "outreachStatus button bar defaults to not_reached_out via parseAsString.withDefault so the default is baked into the nuqs schema rather than a useEffect"
  - "ContactSelectionList has an empty-state div rendered separately (below the empty ul) — the select-all header still renders to preserve the UI frame"
metrics:
  duration: "18 minutes"
  completed: "2026-06-21"
  tasks_completed: 3
  tasks_total: 3
  files_created: 4
  files_modified: 0
---

# Phase 14 Plan 02: Campaign Builder Leaf Primitives Summary

**One-liner:** Pure in-memory filter+sort helper and three 'use client' leaf components — filter bar reusing Phase 13 triage controls, dense checkbox selection list (four D-02 field groups + select-all), and inline name/goal panel — wired to nuqs URL state.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Pure builder-filters helper | 1bd4930 | src/features/outreach/lib/builder-filters.ts |
| 2 | BuilderFilterBar | 45d5e73 | src/features/outreach/components/builder-filter-bar.tsx |
| 3 | ContactSelectionList + CampaignNamePanel | ab9fccd | src/features/outreach/components/contact-selection-list.tsx, src/features/outreach/components/campaign-name-panel.tsx |

## What Was Built

### Task 1 — `applyBuilderFilters` (builder-filters.ts)

Pure function, no React, no side effects. Accepts `Contact[]` + `BuilderFilters` and returns a **new** array (input untouched) narrowed by:

1. `connectionYearStart`/`connectionYearEnd` — delegates to the existing `filterByConnectionYearRange` from Phase 13 (reuse per plan key_links)
2. `closeness` — exact equality; null closeness excluded when filter active
3. `howMet` — case-insensitive substring; contacts with `null` howMet excluded when filter active (CAMP-01)
4. `outreachStatus` — exact equality; default applied by caller (CAMP-04)

Sorted by `contactClosenessValues.indexOf(closeness ?? 'never_met')` ascending — close_friend first, null treated as never_met (D-04/CD-04).

Exports: `BuilderFilters` interface + `applyBuilderFilters` named function.

### Task 2 — `BuilderFilterBar` (builder-filter-bar.tsx)

Composed filter bar with all four filters on one panel:

- `ConnectionYearFilter` (Phase 13 component reused directly — owns its own `connectionYearStart`/`connectionYearEnd` nuqs state, D-07)
- `ClosenessButtonBar` (Phase 13 component reused — calls `onSelect`, does NOT own URL state; parent toggles `closeness` in nuqs, CAMP-03/D-07)
- `howMet` free-text `Input` writing to nuqs (CAMP-01)
- Outreach-status button bar over `outreachStatusValues` with an "All" clear button; defaults to `not_reached_out` via `parseAsString.withDefault('not_reached_out')` (CAMP-04, D-07)

Closeness shows an inline clear link when a tier is active. Uses `forwardRef + BuilderFilterBarHandle { focus() }` pattern.

### Task 3a — `ContactSelectionList` (contact-selection-list.tsx)

Purely presentational — receives the already-filtered, already-sorted slice from the parent shell (Plan 03). Renders:

- **Select-all header** row: Checkbox bound to `onSelectAll`; label shows contact count (D-08/CAMP-05)
- **Per-contact rows** with all four D-02 field groups:
  1. Name + howMet (via label) + closeness Badge (closenessColors)
  2. Current title/company and/or role/company at connection
  3. LinkedIn connection date (date-fns `MMM yyyy` format)
  4. Outreach status Badge (outreachStatusColors)
- Row click and Checkbox both call `onToggle` (stopPropagation on the checkbox prevents double-fire)
- Selected rows highlighted with `bg-primary/5`
- Empty-state copy when no contacts match

### Task 3b — `CampaignNamePanel` (campaign-name-panel.tsx)

Controlled pair of inputs: required `Input` (Campaign Name, maxLength=200) and optional `Textarea` (Goal / Instruction with Phase-16 AI generation hint — CD-06/D-14). `forwardRef + CampaignNamePanelHandle { focus() }` focuses the name input. Props: `{ name, onNameChange, goalInstruction, onGoalChange }`.

## Deviations from Plan

None — plan executed exactly as written.

## Requirements Coverage

| Requirement | Delivered by |
|---|---|
| CAMP-01 howMet filter | BuilderFilterBar howMet Input + applyBuilderFilters howMet substring |
| CAMP-02 connection year filter | ConnectionYearFilter reuse in BuilderFilterBar |
| CAMP-03 closeness filter | ClosenessButtonBar reuse in BuilderFilterBar (toggle = same tier clears) |
| CAMP-04 outreach status filter | outreachStatus button bar in BuilderFilterBar; applyBuilderFilters outreachStatus equality |
| CAMP-05 checkbox multi-select + select-all | ContactSelectionList Checkbox rows + select-all header |
| D-07 reuse Phase 13 controls | ConnectionYearFilter + ClosenessButtonBar imported directly |
| D-07 outreach-status default not_reached_out | parseAsString.withDefault('not_reached_out') in BuilderFilterBar |
| D-08 select-all = add matching to set | onSelectAll prop wired to header Checkbox |
| D-02 four field groups per row | ContactSelectionList groups 1–4 |
| D-04 closeness-closest-first ordering | applyBuilderFilters sort by contactClosenessValues index |
| D-11/D-14 inline name+goal panel | CampaignNamePanel |
| CD-06 Phase-16 goal hint | Textarea label text in CampaignNamePanel |

## Known Stubs

None — all components are fully wired to their props. Filtering and selection are prop-driven; data flows in from the builder shell (Plan 03).

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. All components are purely client-side presentational over already-loaded, Clerk-locked data. No new threat surface.

## Self-Check: PASSED

Files exist:
- src/features/outreach/lib/builder-filters.ts: FOUND
- src/features/outreach/components/builder-filter-bar.tsx: FOUND
- src/features/outreach/components/contact-selection-list.tsx: FOUND
- src/features/outreach/components/campaign-name-panel.tsx: FOUND

Commits exist:
- 1bd4930: feat(14-02): add applyBuilderFilters pure helper
- 45d5e73: feat(14-02): add BuilderFilterBar
- ab9fccd: feat(14-02): add ContactSelectionList + CampaignNamePanel

TypeScript: npx tsc --noEmit clean for all four files.
