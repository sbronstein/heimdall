# Phase 4: Starter-Template Cleanup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `04-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-13
**Phase:** 04-Starter-Template Cleanup
**Mode:** `--auto` (Claude auto-selected the recommended option for each gray area; no AskUserQuestion calls — per `workflows/discuss-phase/modes/auto.md`)
**Areas discussed:** Kanban route fate, Infobar deletion scope, Products deletion blast radius, Plan grouping, Verification approach, Atomic commit granularity, `__CLEANUP__/` deletion ordering, Adjacent starter orphans, Decision record location

---

## Kanban Route Fate (DEBT-A3 — SC #3 record requirement)

| Option | Description | Selected |
|--------|-------------|----------|
| Wire to `/api/tasks` | Replace zustand+localStorage store with REST calls to existing `/api/tasks`; rebuild board state to be DB-backed; rewrite `kanban-board.tsx` to consume tasks-API responses. | |
| Remove entirely | Delete `src/app/dashboard/kanban/` and `src/features/kanban/`; record decision in `.planning/PROJECT.md`. | ✓ |

**Auto-selected:** Remove (recommended).
**Rationale:** localStorage persistence is explicitly an anti-pattern per `.planning/codebase/ARCHITECTURE.md` §"Anti-Patterns". Heimdall already has `/dashboard/pipeline` (PIPE-V1, the load-bearing system of record per PROJECT.md core value) and `/dashboard/tasks` (TASK-V1, DB-backed). A third localStorage-backed board is redundant. Wiring kanban to `/api/tasks` would be feature work, not cleanup — out of phase scope.
**Captured as:** D-01, D-02, D-03, PD-03.

---

## Infobar Deletion Scope (DEBT-A2 transitive)

| Option | Description | Selected |
|--------|-------------|----------|
| Surgical (just `infobar.tsx`) | Delete only `src/components/ui/infobar.tsx`; leave dependents in place. | |
| Transitive (whole machinery) | Delete `infobar.tsx`, `info-button.tsx`, `info-sidebar.tsx`, `infoconfig.ts`; strip `InfobarProvider`+`<InfoSidebar />` from dashboard layout; drop `infoContent` prop from `PageContainer` and `Heading`. | ✓ |

**Auto-selected:** Transitive (recommended).
**Rationale:** Surgical deletion breaks the build immediately — five+ files import from `infobar.tsx` (`InfobarProvider`, `useInfobar`, `InfobarContent` type). The phase boundary commits to deleting `infobar.tsx`, so all dependents must come along.
**Captured as:** D-04, D-05, D-06, PD-02.

---

## Products Deletion Blast Radius (DEBT-A1 transitive)

| Option | Description | Selected |
|--------|-------------|----------|
| Named files only | Delete `src/features/products/` and `src/app/dashboard/product/`. | |
| Named + dead support | Also delete `src/constants/mock-api.ts`; strip `Product`/`SaleUser`/`recentSalesData` from `src/constants/data.ts`; remove `/dashboard/product` breadcrumb entry. | ✓ |

**Auto-selected:** Named + dead support (recommended).
**Rationale:** `mock-api.ts` and the three exports in `data.ts` are consumed *only* by `src/features/products/`. Leaving them is starter residue by another name and creates a follow-on cleanup chore. The breadcrumb entry would render against a non-existent route.
**Captured as:** D-07, D-08, D-09, D-10, PD-04.

---

## Plan Grouping

| Option | Description | Selected |
|--------|-------------|----------|
| One bulk plan | Single `04-01-PLAN.md` doing all five DEBT-Ax requirements sequentially. | |
| Four parallel + one verification | Wave 1: four disjoint parallel plans, one per DEBT-A1/A2/A3/A5. Wave 2: one verification plan for DEBT-A4 + filesystem-existence test. | ✓ |

**Auto-selected:** Four parallel + one verification (recommended).
**Rationale:** File sets are disjoint (with `infoContent` ownership locked to 04-02), mirroring Phase 3's two-disjoint-plans-in-parallel pattern. `__CLEANUP__/` removal must be last because the script in it can overwrite real source files. The planner has final authority over the breakdown.
**Captured as:** D-18, D-14.

---

## Verification Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Runtime HTTP 404 smoke | Boot dev server, `curl` `/dashboard/product` etc., assert 404 response. | |
| Filesystem-existence + clean build | Vitest test asserting deleted paths return `existsSync(...) === false`; `npm run build` passes (already gated by Phase 2 pre-push). | ✓ |

**Auto-selected:** Filesystem-existence + clean build (recommended).
**Rationale:** Next.js's route resolver IS the 404 contract — running an HTTP smoke means testing the framework itself. Filesystem assertion is deterministic, fast (<50ms), runs in the existing Phase 2 Vitest harness without PGlite, and is a stronger contract than HTTP responses (which can be affected by middleware or unrelated routing changes).
**Captured as:** D-16, D-17, PD-05.

---

## Atomic Commit Granularity

| Option | Description | Selected |
|--------|-------------|----------|
| One sweep commit | Single commit at end of phase with all deletions. | |
| Per DEBT-Ax | One commit per requirement (5 commits + verification commit). | ✓ |

**Auto-selected:** Per DEBT-Ax (recommended).
**Rationale:** Phase 3 set the pattern (`docs(03)`, `feat(03)` commit prefixes per requirement). `git log --diff-filter=D` becomes useful for retrospectives. Easy revert per requirement if anything regresses.
**Captured as:** D-19, CD-04.

---

## `__CLEANUP__/` Deletion Ordering

| Option | Description | Selected |
|--------|-------------|----------|
| First | Delete `__CLEANUP__/` at the start of the phase. | |
| Last (Wave 2) | Delete after all Wave 1 deletions complete. | ✓ |

**Auto-selected:** Last (recommended).
**Rationale:** `__CLEANUP__/scripts/cleanup.js` can overwrite real source with template versions (it's a feature-strip tool). Sequencing the directory's removal last makes "accidentally run the cleanup script against half-cleaned state" structurally impossible.
**Captured as:** D-14.

---

## Adjacent Starter Orphans (Out of Scope)

| Option | Description | Selected |
|--------|-------------|----------|
| Sweep along | Also delete `org-switcher.tsx`, `demo-form.tsx`, `user-auth-form.tsx`, profile route, Profile/Login nav items, auth-page visual chrome. | |
| Defer | Stay within named DEBT-A1..A5 requirements; defer untracked orphans to a follow-on. | ✓ |

**Auto-selected:** Defer (recommended).
**Rationale:** These items are mentioned in `.planning/codebase/CONCERNS.md` but not named in the v1 Active requirements. Each would need a separate scope decision (e.g., the `profile` route uses Clerk's `<UserProfile />` — keep or replace?). Adding them to Phase 4 expands scope and contradicts the GSD discipline of "phase boundaries come from ROADMAP.md".
**Captured as:** `<deferred>` block in CONTEXT.md.

---

## Decision Record Location for SC #3

| Option | Description | Selected |
|--------|-------------|----------|
| New ADR | Create `.planning/decisions/004-kanban-removed.md`. | |
| New section in PROJECT.md | Add a "Decisions" section with the kanban rationale. | |
| Amend existing PROJECT.md line | Append `(Removed in Phase 4)` to the existing kanban "Out of Scope" entry. | ✓ |

**Auto-selected:** Amend existing line (recommended).
**Rationale:** PROJECT.md already commits to removal in "Out of Scope" ("starter-template residue; will be removed under DEBT-A3"). Minimum complete edit is one line. New ADRs/sections would be inventing process where the existing process already covers it.
**Captured as:** D-02.

---

## Claude's Discretion

The following decisions were left to the planner/executor's judgment with recommendations in CONTEXT.md `<decisions>` §"Claude's Discretion":

- CD-01: Delete `src/constants/data.ts` if it becomes empty post-strip, vs leave it as an empty stub. **Recommended: delete.**
- CD-02: Add a Heimdall-branded custom 404 page vs rely on Next.js default. **Recommended: rely on default — not cleanup work.**
- CD-03: Filesystem-existence test as `describe` with multiple `it`s vs single `it` with `forEach`. **Recommended: `forEach`.**
- CD-04: Single sweep commit vs per-requirement commits in Wave 1. **Recommended: per requirement (matches D-19).**
- CD-05: How aggressively to grep for unexpected consumers of products/data symbols before deletion. **Recommended: grep before each `git rm` in 04-01.**
- CD-06: Whether Phase 3's `<Link>... Star on GitHub ...</Link>` removal is fully done (if not, fold here). **Recommended: skip — assume Phase 3 D-12 completed it; planner verifies.**

## Deferred Ideas

The full `<deferred>` block lives in `04-CONTEXT.md`. Summary of ideas that came up but belong in other phases:

- `src/components/org-switcher.tsx` — orphan after Phase 4 workspaces deletion; not named in DEBT.
- `src/components/forms/demo-form.tsx` — starter demo form, orphan.
- `src/features/auth/components/user-auth-form.tsx` — starter auth form, orphan.
- `src/app/dashboard/profile/[[...profile]]/page.tsx` + `Profile`/`Login` nav entries — needs UX decision.
- Auth-page visual chrome (Random Dude quote, placeholder Logo, `interactive-grid`, `Star on GitHub` link text) — Phase 3 explicitly deferred.
- `any` typings in `src/components/kbar/index.tsx` and `src/features/metrics/components/weekly-snapshot-form.tsx` — type-debt, not starter-residue.
- `playwright` package classification — JL2-02, v2-deferred.
- `.planning/codebase/ARCHITECTURE.md` map refresh — post-milestone doc-update.
- Phase 3 `.planning/codebase/ARCHITECTURE.md` correction (already deferred from Phase 3).
- No project-level todos cross-referenced (`gsd-sdk query todo.match-phase` returned none).
