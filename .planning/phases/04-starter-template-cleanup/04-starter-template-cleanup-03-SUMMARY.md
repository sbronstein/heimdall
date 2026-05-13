---
phase: 04-starter-template-cleanup
plan: 03
subsystem: cleanup
tags:
  - cleanup
  - starter-template
  - deletion
  - kanban
  - decision-record
  - anti-pattern-removal
dependency_graph:
  requires:
    - DEBT-A3 (Phase 4 requirement)
    - .planning/PROJECT.md (existing "Out of Scope" kanban line)
    - .planning/views/PROJECT.html (existing HTML companion)
  provides:
    - "Decision-record satisfaction of ROADMAP SC #3 (PROJECT.md contains 'Removed in Phase 4' on kanban line)"
    - "Elimination of zustand persist + localStorage anti-pattern (ARCHITECTURE.md §Anti-Patterns)"
    - "Cleared /dashboard/kanban route directory (Next.js framework default 404 takes over)"
    - "Cleared src/features/kanban/ orphan feature folder (no autocomplete pollution)"
  affects:
    - "Phase 4 plan 04-05 (verification plan) — will assert fs.existsSync('src/app/dashboard/kanban') === false and fs.existsSync('src/features/kanban') === false; both now true"
    - ".planning/codebase/ARCHITECTURE.md §Anti-Patterns — Kanban store entry is now obsolete (deferred doc-update per Phase 4 CONTEXT)"
tech_stack:
  added: []
  patterns:
    - "Atomic commit per DEBT-Ax (D-19) — single commit captures all plan changes"
    - "Append-don't-rewrite editing for decision records (D-02 verbatim string match)"
    - "Mirror markdown edits in `.planning/views/*.html` HTML companion (user's global CLAUDE.md preference)"
key_files:
  created: []
  modified:
    - ".planning/PROJECT.md (appended `(Removed in Phase 4)` to kanban Out-of-Scope line; +1 char-set, original sentence preserved verbatim)"
    - ".planning/views/PROJECT.html (appended `<em>(Removed in Phase 4)</em>` to matching `<li>` — reused existing palette, no new CSS)"
  deleted:
    - "src/app/dashboard/kanban/page.tsx"
    - "src/features/kanban/components/board-column.tsx"
    - "src/features/kanban/components/column-action.tsx"
    - "src/features/kanban/components/kanban-board.tsx"
    - "src/features/kanban/components/kanban-view-page.tsx"
    - "src/features/kanban/components/new-section-dialog.tsx"
    - "src/features/kanban/components/new-task-dialog.tsx"
    - "src/features/kanban/components/task-card.tsx"
    - "src/features/kanban/utils/index.ts"
    - "src/features/kanban/utils/store.ts (zustand persist + localStorage anti-pattern — ARCHITECTURE.md flagged)"
decisions:
  - "Honored D-01: kanban removed (not wired to /api/tasks) — rationale captured in CONTEXT.md (localStorage anti-pattern; pipeline + tasks already cover the DB-backed kanban surface)"
  - "Honored D-02: appended verbatim `(Removed in Phase 4)` (capital R, leading space, parentheses) without rewriting the original sentence — `git diff .planning/PROJECT.md` shows a single-character-set append"
  - "Honored D-03: BOTH `src/app/dashboard/kanban/` AND `src/features/kanban/` deleted in one operation (no orphan feature folder)"
  - "Honored D-19: single atomic commit `8fa1aa9` for DEBT-A3 (subject contains `DEBT-A3`)"
  - "HTML companion mirrors the markdown append using `<em>` (no new CSS invented; reused existing earth-tone palette per global CLAUDE.md)"
metrics:
  duration: "~2 min (actual elapsed wall-clock)"
  completed: 2026-05-13
  tasks: 2
  files_changed: 12
  files_deleted: 10
  files_modified: 2
  files_created: 0
  commits: 1
  commit_hashes:
    - 8fa1aa9
---

# Phase 4 Plan 3: Kanban Removal + Decision Record (DEBT-A3) Summary

DEBT-A3 shipped as one atomic commit (`8fa1aa9`): deleted `/dashboard/kanban` route and the entire `src/features/kanban/` feature folder (10 files including the zustand persist + localStorage store flagged as an anti-pattern in `.planning/codebase/ARCHITECTURE.md`), and recorded the removal decision verbatim per CONTEXT.md D-02 by appending ` (Removed in Phase 4)` to the existing "Out of Scope" kanban line in `.planning/PROJECT.md` (with a mirrored append in `.planning/views/PROJECT.html`).

## What Shipped

### Deletions (10 files)

- `src/app/dashboard/kanban/page.tsx` — Next.js App Router entry point for the starter kanban route. Post-deletion, the route returns 404 via the Next.js framework default (no `not-found.tsx` added per CD-02).
- `src/features/kanban/components/` (7 files): `board-column.tsx`, `column-action.tsx`, `kanban-board.tsx`, `kanban-view-page.tsx`, `new-section-dialog.tsx`, `new-task-dialog.tsx`, `task-card.tsx`.
- `src/features/kanban/utils/index.ts` — feature-level barrel.
- `src/features/kanban/utils/store.ts` — **the `zustand persist` + `localStorage` store** explicitly called out as an anti-pattern in `.planning/codebase/ARCHITECTURE.md` §"Anti-Patterns → Kanban store uses client-side localStorage persistence". Its deletion eliminates the only place in Heimdall that persisted client state to browser `localStorage`, reducing the localStorage attack surface to zero (threat T-04-07 mitigated).

### Decision-record edits (2 files)

- `.planning/PROJECT.md` line 63 — **appended `(Removed in Phase 4)` verbatim** (capital R, leading space, exact parentheses) to the existing kanban "Out of Scope" bullet. Original sentence preserved character-for-character; only the parenthetical was added. Satisfies `grep -q "Removed in Phase 4" .planning/PROJECT.md` (case-sensitive) and ROADMAP SC #3.
- `.planning/views/PROJECT.html` line 203 — appended `<em>(Removed in Phase 4)</em>` to the matching `<li>` bullet in the Out of Scope card. Reused the existing earth-tone palette (no new CSS); preserves source-of-truth footer note. Per the user's global CLAUDE.md preference for `.planning/*.md` to have HTML companions.

## Verification Outcomes

- `test ! -d src/app/dashboard/kanban` → exit 0
- `test ! -d src/features/kanban` → exit 0
- `grep -rn "from '@/features/kanban\|from '@/app/dashboard/kanban" src/` → zero hits (no orphan imports)
- `grep -rn "kanbanStore\|KanbanBoard\|TaskCard" src/` (excluding `src/features/tasks/`) → zero hits (no leaked references)
- `grep -q "Removed in Phase 4" .planning/PROJECT.md` → exit 0 (verbatim string present, case-sensitive)
- `grep -q "Removed in Phase 4" .planning/views/PROJECT.html` → exit 0
- `git log -1 --oneline | grep -q "DEBT-A3"` → exit 0 (atomic commit per D-19)
- `git diff .planning/PROJECT.md` shows **one** changed line (the kanban out-of-scope bullet), confirming the edit was a true append and did not overshoot.
- `npm run build` — fails on the known pre-existing `src/features/job-leads/lib/prioritization.ts:70` MapIterator/es5 error (documented in `deferred-items.md`). **No new errors introduced by this plan.** Per CONTEXT.md `<scope_boundary>` and the SCOPE BOUNDARY rule in `execute-plan.md`, that pre-existing failure is out of scope for DEBT-A3 — Phase 4's verification plan (04-05) will inherit the same scope-out treatment until a follow-on tsconfig/refactor lands.

## Deviations from Plan

**None.** Plan executed exactly as written.

- D-01 / D-02 / D-03 / D-19 all honored verbatim.
- No deviation-rule fires triggered:
  - Rule 1 (auto-fix bug): nothing buggy in scope.
  - Rule 2 (auto-add critical functionality): nothing missing (Heimdall has zero kanban callers outside the deleted surfaces; the threat register entry T-04-07 was mitigated by the deletion itself, not by added code).
  - Rule 3 (auto-fix blocking issue): no blockers — pre-existing prioritization.ts:70 was already logged to `deferred-items.md` and was treated as a known pre-existing build blocker (DEBT-A3 verification falls back to filesystem-existence + grep gates per CONTEXT.md PD-05/D-16/D-17).
  - Rule 4 (architectural decision): the only architectural question (REMOVE vs WIRE) was pre-locked by CONTEXT.md D-01.

## Anti-Pattern Elimination

The most material side-effect of DEBT-A3 is that **the only place in Heimdall where client state was persisted to browser `localStorage` is now gone**. Per the threat model in 04-03-PLAN.md:

- **T-04-07 (Tampering — `zustand persist` + `localStorage` store):** Eliminated. The store at `src/features/kanban/utils/store.ts` was the sole holder. After this plan, all client state goes through Zustand-without-persistence (for `/dashboard/pipeline`) or directly to the REST API (for `/dashboard/tasks`).
- **T-04-08 (Information Disclosure — `/dashboard/kanban` route):** Reduced. The starter route no longer exists; Next.js's default 404 handler covers the path.

Both threats moved from "mitigate" to "resolved" without adding any new code — pure subtraction.

## Authentication Gates

None — pure cleanup plan, no auth surface touched.

## Files Touched (summary)

| Action | Path | Size |
|--------|------|------|
| Deleted | `src/app/dashboard/kanban/page.tsx` | Next.js route entry, single import + default export |
| Deleted | `src/features/kanban/components/board-column.tsx` | Drag-and-drop column |
| Deleted | `src/features/kanban/components/column-action.tsx` | Column action menu |
| Deleted | `src/features/kanban/components/kanban-board.tsx` | Board orchestrator |
| Deleted | `src/features/kanban/components/kanban-view-page.tsx` | Page wrapper consumed by the route |
| Deleted | `src/features/kanban/components/new-section-dialog.tsx` | Section creation modal |
| Deleted | `src/features/kanban/components/new-task-dialog.tsx` | Task creation modal |
| Deleted | `src/features/kanban/components/task-card.tsx` | Task card |
| Deleted | `src/features/kanban/utils/index.ts` | Barrel |
| Deleted | `src/features/kanban/utils/store.ts` | **Zustand persist + localStorage anti-pattern** |
| Modified | `.planning/PROJECT.md` | +`(Removed in Phase 4)` on line 63 |
| Modified | `.planning/views/PROJECT.html` | +`<em>(Removed in Phase 4)</em>` on line 203 |

Total: **10 deletions + 2 modifications = 944 deletions, 2 insertions** at the line level (per `git show 8fa1aa9 --stat`).

## Commits

- `8fa1aa9` — `feat(04): DEBT-A3 — delete kanban route + feature folder, record decision in PROJECT.md`

## Self-Check: PASSED

- `[ -f .planning/PROJECT.md ]` → exists ✓
- `[ -f .planning/views/PROJECT.html ]` → exists ✓
- `[ ! -d src/app/dashboard/kanban ]` → confirmed absent ✓
- `[ ! -d src/features/kanban ]` → confirmed absent ✓
- `grep -q "Removed in Phase 4" .planning/PROJECT.md` → exit 0 ✓
- `grep -q "Removed in Phase 4" .planning/views/PROJECT.html` → exit 0 ✓
- `git log --oneline --all | grep -q 8fa1aa9` → exit 0 ✓
- All claimed deletions in the commit (`git show 8fa1aa9 --stat`) match the plan's `files_modified` set exactly ✓
