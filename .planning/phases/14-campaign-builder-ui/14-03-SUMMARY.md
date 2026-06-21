---
phase: 14-campaign-builder-ui
plan: "03"
subsystem: outreach/campaign-builder
tags: [campaign-builder, rsc-page, in-memory-filter, persistent-selection, two-post-save, review-page]
dependency_graph:
  requires: [14-02-builder-leaf-primitives]
  provides: [NewCampaignPage, CampaignBuilder, OutreachCampaignPage, CampaignReviewPage]
  affects: [15-email-review-ui]
tech_stack:
  added: []
  patterns: [rsc-db-read, in-memory-filter-shell, nuqs-url-state, two-post-save, batch-chunking, partial-failure-toast]
key_files:
  created:
    - src/app/dashboard/outreach/new/page.tsx
    - src/features/outreach/components/campaign-builder.tsx
    - src/app/dashboard/outreach/[id]/page.tsx
    - src/features/outreach/components/campaign-review-page.tsx
  modified: []
decisions:
  - "goalInstruction API min(1) satisfied by falling back to trimmed campaignName when goal textarea is blank — no API change required (D-14 optional goal + API constraint resolved in client)"
  - "Batch chunking for contactIds > 500: sequential POSTs of <=500 each to same endpoint; bulk failure surfaces toast then still navigates to the (partially-populated) campaign (CD-02)"
  - "Tray resolves selected ids against the full contacts prop (not filtered slice) so out-of-filter selections are always visible (D-09)"
  - "CampaignReviewPage is a pure server component — no interactivity needed for the D-13 placeholder scope"
metrics:
  duration: "25 minutes"
  completed: "2026-06-21"
  tasks_completed: 3
  tasks_total: 3
  files_created: 4
  files_modified: 0
---

# Phase 14 Plan 03: Campaign Builder Shell Summary

**One-liner:** RSC route loading all ~1500 non-archived contacts server-side + CampaignBuilder shell composing Plan-02 leaf primitives with cross-filter-persistent selection, reviewable tray, and double-submit-safe two-POST save to a real placeholder review destination.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Builder RSC route | 8231422 | src/app/dashboard/outreach/new/page.tsx |
| 2 | CampaignBuilder shell | f404f53 | src/features/outreach/components/campaign-builder.tsx |
| 3 | Placeholder review route + CampaignReviewPage | a8fb6d3 | src/app/dashboard/outreach/[id]/page.tsx, src/features/outreach/components/campaign-review-page.tsx |

## What Was Built

### Task 1 — `NewCampaignPage` (outreach/new/page.tsx)

Default async RSC at `/dashboard/outreach/new`. Reads ALL non-archived contacts directly via `db.select().from(contacts).where(isNull(contacts.archivedAt))` — bypassing `GET /api/contacts` which caps at 100 rows. Passes the full array to `<CampaignBuilder contacts={allContacts} />` inside `<PageContainer scrollable={false}>`. Exports `metadata = { title: 'Dashboard: New Campaign' }`.

### Task 2 — `CampaignBuilder` (campaign-builder.tsx)

`'use client'` shell composing the four Plan-02 leaves. Core behaviors:

- **In-memory filter (D-05):** reads same nuqs params as `BuilderFilterBar`; derives `filteredContacts` via `applyBuilderFilters` in `useMemo` — selection state is never touched by the filter memo.
- **Persistent selection (D-03):** `useState<Set<string>>` keyed by contact id. `toggleContact` add/remove; `selectAllFiltered` unions all currently-filtered ids ON TOP of the existing set (D-08) — no replace.
- **Reviewable tray (D-09):** collapsible panel showing the count + all selected contacts resolved against the FULL contacts array (not the filtered slice), with per-contact remove and clear-all.
- **Save gate (D-14):** `canSave = campaignName.trim().length > 0 && selectedIds.size > 0`.
- **Double-submit protection (CD-01):** `isSaving` guard in `handleSave` + `disabled={!canSave || isSaving}` on the button.
- **Two-POST save (D-12):** `POST /api/outreach-campaigns { name, goalInstruction }` → take `data.id` → `POST /api/outreach-campaigns/${id}/emails { contactIds }` in <=500-id batches → `router.push`.
- **API goalInstruction constraint:** when the goal textarea is blank, sends `campaignName.trim()` as `goalInstruction` to satisfy the API's `z.string().min(1)` while honoring D-14's optional goal.
- **CD-02 partial failure:** bulk-add failure surfaces a `toast.error` and still navigates to the campaign so the owner can recover.
- **Empty-filter state (CD-05):** when `filteredContacts.length === 0`, shows "No contacts match the current filters" copy instead of the list.

### Task 3a — `OutreachCampaignPage` (outreach/[id]/page.tsx)

Default async RSC for `/dashboard/outreach/[id]`. Types `params` as `Promise<{ id: string }>`, awaits it. Selects campaign by id with `.limit(1)`; calls `notFound()` from `'next/navigation'` when empty. Joins emails to contacts via `leftJoin` (same shape as the emails GET route). Renders `<CampaignReviewPage campaign={...} emails={...} />` inside `<PageContainer scrollable>`.

### Task 3b — `CampaignReviewPage` (campaign-review-page.tsx)

Pure server component (no `'use client'` — no interactivity needed). Minimal placeholder per D-13:

- **Header Card:** campaign name, goal, total contacts added, per-status count badges derived by reducing the emails array.
- **Contact list:** all added contacts showing name, current company, and status Badge; gracefully renders "Contact removed" for null joins.
- **Phase 15 seam note:** "Email review & approval arrives in the next update (Phase 15)" — no edit/approve/regenerate UI present.

## Deviations from Plan

None — plan executed exactly as written. The `goalInstruction` fallback (send campaignName when blank) was called out in the plan's interfaces block as the required resolution; implemented as specified.

## Requirements Coverage

| Requirement | Delivered by |
|---|---|
| CAMP-01 howMet filter | BuilderFilterBar (Plan 02) + applyBuilderFilters wired in CampaignBuilder |
| CAMP-02 connection year filter | ConnectionYearFilter in BuilderFilterBar; nuqs params read in CampaignBuilder |
| CAMP-03 closeness filter | ClosenessButtonBar in BuilderFilterBar; closeness param read in CampaignBuilder |
| CAMP-04 outreach status filter | outreachStatus button bar in BuilderFilterBar; param read in CampaignBuilder |
| CAMP-05 checkbox multi-select + select-all | ContactSelectionList (Plan 02) composed with selectAllFiltered (adds, not replaces) |
| D-03 persistent selection | selectedIds Set never reset by filter memo |
| D-08 select-all semantics | selectAllFiltered: prev ∪ filteredContacts ids |
| D-09 tray | Collapsible tray resolves full contacts array; per-contact remove + clear-all |
| D-12 two-POST save sequence | handleSave: create → bulk-add → navigate |
| D-13 placeholder review page | OutreachCampaignPage + CampaignReviewPage |
| D-14 save gate | canSave = name.trim() && size > 0 |
| CD-01 double-submit protection | isSaving guard + disabled={!canSave \|\| isSaving} |
| CD-02 partial-failure surfacing | toast.error on bulk-add failure + still navigates |
| CD-05 empty-filter state | "No contacts match" message when filteredContacts.length === 0 |

## Known Stubs

None — all routes and components are fully wired end-to-end. The `CampaignReviewPage` intentionally shows a "Phase 15" placeholder note rather than review UI, but the contact list is real data, not a stub.

## Threat Surface Scan

Two surfaces introduced; both covered by the threat model:

| Flag | File | Description |
|------|------|-------------|
| T-14-05 (mitigated) | campaign-builder.tsx | Partial failure (create success + bulk-add fail) — CD-02 toast + navigate implemented |
| T-14-06 (mitigated) | campaign-builder.tsx | Double-submit — `if (!canSave \|\| isSaving) return` + `disabled` button |
| T-14-07 (accepted) | [id]/emails API | client-supplied contactIds — server validates UUID + dedup via onConflictDoNothing (Phase 12) |
| T-14-08 (accepted) | outreach/[id]/page.tsx | Reads campaign by id — single-user, Clerk-locked dashboard |

No new threat surface beyond what the plan's threat model covers.

## Self-Check: PASSED

Files exist:
- src/app/dashboard/outreach/new/page.tsx: FOUND
- src/features/outreach/components/campaign-builder.tsx: FOUND
- src/app/dashboard/outreach/[id]/page.tsx: FOUND
- src/features/outreach/components/campaign-review-page.tsx: FOUND

Commits exist:
- 8231422: feat(14-03): add builder RSC route — load all non-archived contacts (D-05/D-06)
- f404f53: feat(14-03): add CampaignBuilder shell — filter, persistent selection, tray, two-POST save
- a8fb6d3: feat(14-03): add placeholder review route + CampaignReviewPage (D-13)

TypeScript: `npx tsc --noEmit` clean for all four files.
