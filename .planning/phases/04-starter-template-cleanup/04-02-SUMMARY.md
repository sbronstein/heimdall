---
phase: 04-starter-template-cleanup
plan: 02
subsystem: ui
tags: [cleanup, starter-template, deletion, infobar, nextjs-app-router]

requires:
  - phase: 04-starter-template-cleanup-01
    provides: DEBT-A1 products + product-route cleanup that established the atomic-commit-per-DEBT pattern and the pre-existing prioritization.ts:70 deferred-items entry
provides:
  - DEBT-A2 satisfied — three starter dashboard routes deleted (exclusive, workspaces, billing)
  - Infobar UI machinery (4 files, ~960 LOC) removed transitively (infobar.tsx 805 lines + info-button.tsx + info-sidebar.tsx + infoconfig.ts)
  - Dashboard layout simplified to plain KBar/SidebarProvider/AppSidebar/SidebarInset/SearchCommand chrome (no right-side info panel)
  - PageContainer and Heading no longer carry the infoContent?: InfobarContent prop
affects: [04-starter-template-cleanup-03, 04-starter-template-cleanup-04, 04-starter-template-cleanup-05]

tech-stack:
  added: []
  patterns:
    - "Load-bearing edit ordering for transitive deletion: drop props first (turns call sites into TS errors), delete consumers next, strip wrappers, delete the providing module LAST so build never goes red without its consumers' breakage being deterministic"

key-files:
  created: []
  modified:
    - src/app/dashboard/layout.tsx
    - src/components/layout/page-container.tsx
    - src/components/ui/heading.tsx
  deleted:
    - src/app/dashboard/exclusive/page.tsx
    - src/app/dashboard/workspaces/page.tsx
    - src/app/dashboard/workspaces/team/[[...rest]]/page.tsx
    - src/app/dashboard/billing/page.tsx
    - src/components/ui/infobar.tsx
    - src/components/ui/info-button.tsx
    - src/components/layout/info-sidebar.tsx
    - src/config/infoconfig.ts

key-decisions:
  - "D-04 (transitive removal): infobar.tsx deleted alongside its 3 satellite files + wrapper strip + prop removal, not in isolation"
  - "D-06 (no replacement panel): dashboard layout simplified with no replacement slot for InfoSidebar"
  - "D-11 (route directories): three starter route dirs deleted outright; Next.js framework default 404 takes over per PD-05"
  - "D-19 (atomic-per-DEBT commit): one commit ca82a84 covers all 11 file changes for DEBT-A2"
  - "Edit ordering per specifics: prop-drop first, delete starter pages, delete machinery satellites, strip layout wrapper, delete infobar.tsx LAST"

patterns-established:
  - "Transitive-deletion ordering: surface every consumer as a TS error before deleting them, so the deletion driver list is deterministic rather than guessed"
  - "Scout-confirmed call-site exclusivity: confirm via grep that infoContent's only callers are the routes being deleted before dropping the prop, so no Heimdall feature page is silently affected"

requirements-completed:
  - DEBT-A2

duration: 7min
completed: 2026-05-13
---

# Phase 4 Plan 02: DEBT-A2 — Starter Routes + Infobar Machinery Teardown Summary

**Three starter dashboard routes deleted (exclusive, workspaces, billing) plus complete transitive teardown of the 805-line Infobar UI machinery (infobar.tsx, info-button.tsx, info-sidebar.tsx, infoconfig.ts) — single atomic commit, ~1,440 LOC removed.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-13T02:30:00Z (approximate)
- **Completed:** 2026-05-13T02:36:35Z
- **Tasks:** 3 (executed atomically; single commit at end per D-19)
- **Files changed:** 11 (8 deletions, 3 modifications)
- **LOC delta:** +8 / -1,439 (per `git show --stat`)

## Accomplishments

- Deleted 4 starter dashboard route files across 3 route directories (`/dashboard/exclusive`, `/dashboard/workspaces`, `/dashboard/workspaces/team/[[...rest]]`, `/dashboard/billing`)
- Deleted 4 Infobar machinery files: `src/components/ui/infobar.tsx` (805 lines), `src/components/ui/info-button.tsx`, `src/components/layout/info-sidebar.tsx`, `src/config/infoconfig.ts`
- Stripped `InfobarProvider` + `<InfoSidebar side='right' />` wrapper from `src/app/dashboard/layout.tsx` — dashboard layout now matches the D-06 "AFTER" diagram exactly
- Dropped `infoContent?: InfobarContent` prop (and the `InfoButton` invocation) from `src/components/layout/page-container.tsx` and `src/components/ui/heading.tsx`
- Verified zero Heimdall feature pages were affected — every `infoContent={...}` call site (4 total) was owned by the 4 deleted starter routes (pre-existing scout claim confirmed)
- Grep cleanliness: `grep -rn 'Infobar|InfoSidebar|InfoButton|infoContent' src/` returns zero hits post-commit

## Task Commits

Per D-19, this plan ships as a **single atomic commit** covering all 3 tasks:

1. **Task 1: Drop `infoContent` prop from PageContainer and Heading** — included in `ca82a84`
2. **Task 2: Delete four starter route directories (exclusive, workspaces, billing)** — included in `ca82a84`
3. **Task 3: Delete Infobar machinery files + strip wrapper from dashboard layout + atomic commit** — `ca82a84`

The plan's `<done>` block on Task 1 and Task 2 explicitly says **do not commit between tasks** because the build is intentionally red mid-plan until Task 3 deletes the consumers. The atomic commit lands all 11 files at once.

**Atomic commit:** `ca82a84` — `feat(04): DEBT-A2 — delete starter routes + Infobar machinery`

## Files Created / Modified / Deleted

### Modified (3)
- `src/app/dashboard/layout.tsx` — Removed `InfoSidebar` and `InfobarProvider` imports; stripped the `<InfobarProvider defaultOpen={false}>...<InfoSidebar side='right' /></InfobarProvider>` wrapper. New layout: `<KBar><SidebarProvider><AppSidebar /><SidebarInset>{Header + children}</SidebarInset></SidebarProvider><SearchCommand /></KBar>`.
- `src/components/layout/page-container.tsx` — Removed `import type { InfobarContent }`; dropped the `infoContent?: InfobarContent` prop from both the destructured params and the type annotation; removed `infoContent={infoContent}` from both `<Heading>` call sites (scrollable + non-scrollable branches).
- `src/components/ui/heading.tsx` — Rewritten without `InfoButton` import, `InfobarContent` import, the `infoContent?: InfobarContent` field, or the `{infoContent && <InfoButton .../>}` JSX block. Heading now renders only the `<h2>` title and `<p>` description.

### Deleted (8)
- `src/app/dashboard/exclusive/page.tsx` — Starter Clerk org Pro-plan gating demo
- `src/app/dashboard/workspaces/page.tsx` — Starter Clerk workspaces page
- `src/app/dashboard/workspaces/team/[[...rest]]/page.tsx` — Starter Clerk team workspaces page
- `src/app/dashboard/billing/page.tsx` — Starter billing demo page
- `src/components/ui/infobar.tsx` (805 lines) — The headline DEBT-A2 deletion target; was the sole `InfobarContent`/`InfobarProvider`/`useInfobar` provider
- `src/components/ui/info-button.tsx` — InfoButton component (consumed only by Heading)
- `src/components/layout/info-sidebar.tsx` — Right-side info panel (consumed only by dashboard/layout.tsx)
- `src/config/infoconfig.ts` — Static `InfobarContent` config for the 4 starter routes (workspacesInfoContent, teamInfoContent, billingInfoContent, productInfoContent — the productInfoContent was already orphaned in 04-01)

## Decisions Made

- **Atomic commit per D-19:** Confirmed by Phase 3 + Phase 4 plan 01 precedent — one commit per DEBT-Ax requirement. All 11 file changes shipped as `ca82a84`.
- **Edit ordering per `<specifics>`:** Dropped `infoContent` prop FIRST (Task 1) so every remaining call site surfaced as a TS error, which deterministically drove Task 2's route deletions. Then deleted machinery satellites, stripped layout wrapper, and deleted `infobar.tsx` LAST so the providing module disappeared only after every consumer was gone.
- **Build verified per spec:** `npm run build` introduces NO new errors beyond the pre-existing `src/features/job-leads/lib/prioritization.ts:70` failure (logged in `deferred-items.md` by 04-01). DEBT-A2 verification is grep-cleanliness + no-new-errors, not a clean build (which would require resolving the deferred prioritization.ts:70 blocker first).
- **org-switcher.tsx left alone:** The orphan component `src/components/org-switcher.tsx` retains two `router.push('/dashboard/workspaces')` references. Per CONTEXT.md `<deferred>`, this component is not named in DEBT-A2 and is explicitly deferred. Acceptable.

## Deviations from Plan

None — plan executed exactly as written. Edit ordering followed `<specifics>` verbatim; no auto-fixes were needed; no architectural changes (Rule 4) were encountered.

## Issues Encountered

- **`npm run build` does not exit 0** — but this is the pre-existing `prioritization.ts:70` failure documented in `.planning/phases/04-starter-template-cleanup/deferred-items.md` by Plan 04-01. Per the executor objective, DEBT-A2 verification is "grep cleanliness (zero `infoContent` hits, zero `InfobarProvider` hits) + `npm run build` NOT introducing any NEW errors beyond the documented prioritization.ts:70 one." Build output confirms only the pre-existing error remains; no new errors introduced.

## CLAUDE.md Compliance

Project CLAUDE.md directives reviewed pre-commit:
- **No new server actions** — All deletions; no new code paths. ✓
- **TypeScript strict mode** — All edits are clean: removed unused imports (`InfobarContent`, `InfoButton`); no new `any` types; no unused-variable warnings. ✓
- **Named exports** — `Heading` remains a named export; `PageContainer` remains a default export per Next.js page/layout convention but the prop signature is unchanged otherwise. ✓
- **No raw SQL / no API route changes** — N/A (pure UI cleanup). ✓

## Self-Check: PASSED

Files claimed deleted:
- `src/components/ui/infobar.tsx` — MISSING (correct: deleted) ✓
- `src/components/ui/info-button.tsx` — MISSING (correct: deleted) ✓
- `src/components/layout/info-sidebar.tsx` — MISSING (correct: deleted) ✓
- `src/config/infoconfig.ts` — MISSING (correct: deleted) ✓
- `src/app/dashboard/exclusive/` — MISSING (correct: directory deleted) ✓
- `src/app/dashboard/workspaces/` — MISSING (correct: directory deleted) ✓
- `src/app/dashboard/billing/` — MISSING (correct: directory deleted) ✓

Files claimed modified:
- `src/app/dashboard/layout.tsx` — FOUND, no Infobar references ✓
- `src/components/layout/page-container.tsx` — FOUND, no infoContent references ✓
- `src/components/ui/heading.tsx` — FOUND, no InfoButton/InfobarContent/infoContent references ✓

Commits:
- `ca82a84` — FOUND, subject `feat(04): DEBT-A2 — delete starter routes + Infobar machinery` ✓

Grep cleanliness:
- `grep -rn 'Infobar|InfoSidebar|InfoButton|infoContent' src/` → zero hits ✓

## Next Plan Readiness

- **04-03 (DEBT-A3 kanban removal):** No file-set overlap with this plan — disjoint per CONTEXT.md `<plan_grouping>`. Ready.
- **04-04 (DEBT-A5 unused import):** Touches `src/app/api/job-leads/[id]/search/route.ts` only — disjoint. Ready.
- **04-05 (DEBT-A4 + verification, Wave 2):** Blocked on Wave 1 completion (this plan is Wave 1, plan 2 of 4). Once 04-03 and 04-04 land, Wave 2 can proceed.
- **Pre-existing `prioritization.ts:70` build error:** Still blocking `npm run build` clean exit for all Phase 4 plans. Recommended follow-up tracked in `deferred-items.md`.

---
*Phase: 04-starter-template-cleanup*
*Plan: 02*
*Completed: 2026-05-13*
