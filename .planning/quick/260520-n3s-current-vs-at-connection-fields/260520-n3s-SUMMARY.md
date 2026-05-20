---
phase: quick-260520-n3s
plan: 01
subsystem: contacts-import, job-leads-triage, backfill
tags: [data-model, enrichment, import, recommendation-card, backfill]
dependency_graph:
  requires: []
  provides: [correct-import-seeding, two-line-triage-card, enrichment-queue-restored]
  affects: [contacts-import, recommendation-card, recommendation-list, backfill-script]
tech_stack:
  added: []
  patterns: [dry-run-by-default backfill script, IS NOT DISTINCT FROM predicate]
key_files:
  created:
    - scripts/backfill-enrichment-reset.mjs
  modified:
    - src/app/api/contacts/import/route.ts
    - src/features/job-leads/components/recommendation-card.tsx
    - src/features/job-leads/components/recommendation-list.tsx
decisions:
  - CSV Company/Position columns are current role as of export — at-connection fields must come from enrichment, not CSV seed
  - Backfill resets rows where at-connection == current using IS NOT DISTINCT FROM (NULL-safe comparison)
  - Dry-run is the default mode; --apply requires explicit user invocation against live DB
metrics:
  duration: ~8 minutes
  completed: "2026-05-20"
  tasks_completed: 4
  files_modified: 4
---

# Quick Task 260520-n3s: Current vs At-Connection Fields — Summary

**One-liner:** Fixed CSV import to seed at-connection null + unenriched, added two-line Now/At-connection triage card, and wrote guarded dry-run backfill to reset ~1500 mislabeled rows.

## What Was Built

### Task 1 — Fix import route (d1ffce6)
`src/app/api/contacts/import/route.ts`

The import route previously seeded `companyAtConnection` and `roleAtConnection` from the CSV `Company`/`Position` columns — which are the contact's **current** role as of export, not their role at time of connection. It also marked rows `enrichmentStatus='enriched'` when those fields were populated, permanently emptying the enrichment queue.

Changes:
- `candidates.push(...)`: `companyAtConnection: null`, `roleAtConnection: null` (was: `company`, `position`)
- Bulk insert `.values(...)`: `companyAtConnection: null`, `roleAtConnection: null`, `enrichmentStatus: 'unenriched'` unconditionally (was: conditional enriched/unenriched based on whether fields were truthy)
- Removed stale comment claiming CSV provided the at-connection baseline
- All other logic unchanged: dedup, ON CONFLICT, timeline event, `linkedinConnectionDate` seeding

### Task 2 — Recommendation card two-line display (e0ad1ac)
`src/features/job-leads/components/recommendation-card.tsx`

Extended `RecommendationCardProps` with `currentRole?: string | null` and `currentCompany?: string | null`. Replaced the single combined at-connection `<p>` with two separately conditional `<p>` elements:
- **Now:** renders when `currentRole || currentCompany` is truthy — shows current role/company
- **At connection:** renders when `roleAtConnection || companyAtConnection` is truthy — shows at-connection role/company

Each line renders only when its data is present; both use `text-muted-foreground mt-0.5 text-xs` styling.

### Task 3 — Wire current fields through recommendation list (885ab01)
`src/features/job-leads/components/recommendation-list.tsx`

Added `currentRole={rec.contact.title}` and `currentCompany={rec.contact.currentCompany}` to the `<RecommendationCard>` JSX. The `Contact` type already carries both fields via Drizzle `$inferSelect` — no route or prioritization changes needed.

### Task 4 — Guarded idempotent backfill script (1ed7209)
`scripts/backfill-enrichment-reset.mjs`

One-time Node ESM script to reset legacy rows where at-connection data == current data (the wrong baseline seeded by the old import route).

**Predicate:**
```sql
archived_at IS NULL
AND company_at_connection IS NOT DISTINCT FROM current_company
AND role_at_connection IS NOT DISTINCT FROM title
```

**Behavior:**
- **Dry-run (default):** `SELECT count(*)` against predicate, prints affected count, exits 0. No writes.
- **Apply mode (`--apply`):** `UPDATE contacts SET company_at_connection = NULL, role_at_connection = NULL, enrichment_status = 'unenriched', updated_at = now()` against same predicate. Prints rows updated.
- **Idempotent:** After apply, reset rows have `company_at_connection = NULL` which no longer matches non-null `current_company`, so re-running matches zero rows.
- **Never hard-deletes.** Scoped to `archived_at IS NULL` only.

## Backfill Run Commands

**Step 1 — Review dry-run count (safe, no writes):**
```bash
node scripts/backfill-enrichment-reset.mjs
```

**Step 2 — Apply after reviewing count (USER runs this, NOT the executor):**
```bash
node scripts/backfill-enrichment-reset.mjs --apply
```

> IMPORTANT: The executor (Claude Code) must NOT run `--apply` against the live database. The user reviews the dry-run count first and then decides whether to proceed.

Both commands require `DATABASE_URL` to be set (either in environment or readable from `.env.local` in the repo root).

## Verification

- `npx tsc --noEmit` passes cleanly (TypeScript strict mode, 0 errors)
- `npm run build` compiled successfully ("Compiled successfully in 7.5s"); the subsequent data-collection failure is a pre-existing env issue in the worktree (no `DATABASE_URL` set) — not caused by these changes
- Per-task grep gates all passed (see task verification steps in PLAN.md)
- `node --check scripts/backfill-enrichment-reset.mjs` passed (syntax valid)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The two-line card renders from live `rec.contact.title`/`rec.contact.currentCompany` data already in the `Contact` type. At-connection lines will be empty until enrichment populates those fields (by design — that is the post-backfill state for new imports).

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The backfill script is a local-only CLI tool with no network exposure beyond the existing `DATABASE_URL` connection.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `src/app/api/contacts/import/route.ts` | FOUND |
| `src/features/job-leads/components/recommendation-card.tsx` | FOUND |
| `src/features/job-leads/components/recommendation-list.tsx` | FOUND |
| `scripts/backfill-enrichment-reset.mjs` | FOUND |
| `.planning/quick/260520-n3s-.../260520-n3s-SUMMARY.md` | FOUND |
| Commit d1ffce6 (import fix) | FOUND |
| Commit e0ad1ac (card two-line) | FOUND |
| Commit 885ab01 (list wiring) | FOUND |
| Commit 1ed7209 (backfill script) | FOUND |
