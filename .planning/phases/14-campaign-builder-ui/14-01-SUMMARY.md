---
phase: 14-campaign-builder-ui
plan: 01
subsystem: outreach-ui
tags: [outreach, campaign-list, nav, rsc, tdd]
dependency_graph:
  requires: [phase-12-api-outreach-campaigns]
  provides: [/dashboard/outreach route, CampaignList component, Outreach sidebar nav]
  affects: [src/config/nav-config.ts, src/components/icons.tsx, src/app/dashboard/outreach/, src/features/outreach/components/]
tech_stack:
  added: []
  patterns: [RSC-to-client, json_build_object aggregate in RSC, TDD with vitest node environment]
key_files:
  created:
    - src/app/dashboard/outreach/page.tsx
    - src/features/outreach/components/campaign-list.tsx
    - src/features/outreach/components/campaign-list.test.ts
  modified:
    - src/config/nav-config.ts
    - src/components/icons.tsx
decisions:
  - "Used IconMail (from @tabler/icons-react) for Outreach nav icon; added mail key to Icons map and imported IconMail"
  - "TDD helpers (displayCountsFromEmailCounts, hasNoCampaigns) exported from component module and unit-tested in node environment without @testing-library/react"
  - "emailCounts json_build_object SELECT copied verbatim from API route into RSC page (no fetch() from RSC)"
  - "goalInstruction is NOT NULL in schema — empty string used as default in tests, not null"
metrics:
  duration: "~4 minutes"
  completed: "2026-06-21T15:21:25Z"
  tasks_completed: 3
  files_changed: 5
  files_created: 3
---

# Phase 14 Plan 01: Campaign List Surface Summary

Campaign list UI for `/dashboard/outreach/` — sidebar nav entry, RSC data page, and CampaignList card component with per-status progress badges wired to Phase 12 campaign-counts shape (CAMP-08).

## What Was Built

### Task 1: Outreach sidebar nav entry (b894b39)
- Added `IconMail` import to `src/components/icons.tsx` and registered as `mail` key in `Icons`
- Added Outreach `NavItem` to `src/config/nav-config.ts` between Job Leads and Contacts
  - `url: '/dashboard/outreach'`, `icon: 'mail'`, `shortcut: ['o','u']`
  - Shortcut `['o','u']` confirmed non-conflicting (Contacts is `['o','o']`)

### Task 2: Campaign list RSC page (7d7d27b)
- Created `src/app/dashboard/outreach/page.tsx` as async RSC
- Direct DB read of non-archived campaigns with `emailCounts` via `json_build_object` (mirrors `GET /api/outreach-campaigns` exactly — no `fetch()` from RSC)
- `leftJoin(outreachEmails)` + `groupBy(outreachCampaigns.id)` for per-status aggregates
- `PageContainer` with `pageHeaderAction` linking to `/dashboard/outreach/new`
- Passes `initialCampaigns` with coerced `emailCounts as Record<string, number>` to `CampaignList`

### Task 3: CampaignList card component (7a1c83f RED + 94c3ab2 GREEN)
- TDD cycle: failing tests committed first (RED), full implementation passes all 9 (GREEN)
- Exported `displayCountsFromEmailCounts`: maps `pending → selected`, `generated`, `approved`, `drafted` (D-10 wording)
- Exported `hasNoCampaigns`: CD-05 empty-state gate
- `CampaignList` renders cards in a responsive grid; each card links to `/dashboard/outreach/[id]`
- Campaign card: name + status badge header, `line-clamp-2` goal snippet when present, per-status `BadgeCount` row
- Empty state: "No campaigns yet — create your first from a contact cohort."

## Verification

- `npx tsc --noEmit` — clean (no errors in any modified/created file)
- `npx vitest run` — 9/9 tests pass (TDD RED confirmed, GREEN confirmed)
- `grep -c "/dashboard/outreach'" src/config/nav-config.ts` → 1

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test fixture had `goalInstruction: null` but schema is NOT NULL**
- **Found during:** Task 3 TypeScript check after implementing CampaignList
- **Issue:** Test used `goalInstruction: null` but `outreachCampaigns.goalInstruction` is `text NOT NULL` — TypeScript error TS2322
- **Fix:** Changed test fixture to `goalInstruction: ''` (empty string) to match actual schema
- **Files modified:** `src/features/outreach/components/campaign-list.test.ts`
- **Commit:** 94c3ab2

## Known Stubs

None. The RSC page reads real DB data; `CampaignList` renders whatever `initialCampaigns` provides; the `/dashboard/outreach/new` link destination is created in Plan 02 (builder).

## Threat Flags

No new threat surface. This plan adds read-only RSC rendering inside the existing Clerk-locked `/dashboard` tree. The `emailCounts` aggregate is purely server-side. No new API endpoints introduced (T-14-01 accept disposition unchanged).

## TDD Gate Compliance

- RED gate: `test(14-01)` commit `7a1c83f` — 9 failing tests confirmed
- GREEN gate: `feat(14-01)` commit `94c3ab2` — all 9 tests pass
- REFACTOR: not required (implementation was clean after GREEN)

## Self-Check: PASSED

| Item | Result |
|------|--------|
| src/app/dashboard/outreach/page.tsx | FOUND |
| src/features/outreach/components/campaign-list.tsx | FOUND |
| src/features/outreach/components/campaign-list.test.ts | FOUND |
| .planning/phases/14-campaign-builder-ui/14-01-SUMMARY.md | FOUND |
| Commit b894b39 (Task 1 - nav) | FOUND |
| Commit 7d7d27b (Task 2 - RSC page) | FOUND |
| Commit 7a1c83f (Task 3 - RED) | FOUND |
| Commit 94c3ab2 (Task 3 - GREEN) | FOUND |
