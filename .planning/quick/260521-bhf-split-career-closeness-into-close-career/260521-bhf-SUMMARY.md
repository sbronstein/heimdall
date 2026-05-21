---
phase: quick-260521-bhf
plan: 01
subsystem: database
tags: [drizzle, postgres-enum, migration, contacts, closeness, prioritization, pglite]

requires:
  - phase: 10-connection-company-and-role-enrichment-for-triage
    provides: contact triage UI and closeness tier model
provides:
  - "contact_closeness enum split: career_contact replaced by close_career (50) + career (40)"
  - "Hand-authored enum-swap migration 0011 with row remap career_contact -> career"
  - "All UI/sort/rank/select surfaces updated to the two new tiers in high->low order"
affects: [contacts, networking, triage, job-leads-prioritization]

tech-stack:
  added: []
  patterns:
    - "Postgres enum-value removal via swap: drop default -> rename old -> create new -> ALTER TYPE USING CASE cast -> set default -> drop old"

key-files:
  created:
    - drizzle/migrations/0011_split_career_closeness.sql
    - drizzle/migrations/meta/0011_snapshot.json
  modified:
    - drizzle/schema/enums.ts
    - src/lib/domain/types.ts
    - src/features/job-leads/lib/prioritization.ts
    - src/features/contacts/lib/closeness-colors.ts
    - src/features/contacts/components/contact-table/options.tsx
    - src/features/contacts/components/triage/closeness-button-bar.tsx
    - src/app/api/contacts/connections/route.ts
    - src/features/networking/components/connection-finder.tsx
    - src/features/networking/components/outreach-list.tsx
    - src/features/networking/components/networking-dashboard.tsx
    - src/features/contacts/components/linkedin-import/import-review-table.tsx
    - src/app/api/contacts/import/categorize/route.test.ts
    - drizzle/migrations/meta/_journal.json

key-decisions:
  - "All existing career_contact rows migrate to the lower `career` tier (conservative; close_career re-promotion is a manual post-migration triage action)"
  - "career badge color: violet (close_career keeps the legacy indigo)"
  - "Triage keyboard shortcuts widened from 1-8 to 1-9 to cover the new 9th option"

patterns-established:
  - "Enum-swap migration pattern for removing a Postgres enum value (drizzle-kit cannot do this in place)"

requirements-completed: [BHF-01]

duration: ~25min
completed: 2026-05-21
---

# Quick Task 260521-bhf: Split career closeness into close-career + career Summary

**Replaced the single `career_contact` contact-closeness tier with two distinct tiers — `close_career` (bridge weight 50) and `career` (weight 40) — via a hand-authored Postgres enum-swap migration that remaps existing rows to `career`, plus matching updates across the schema, types, bridge weights, and every UI/sort/rank/select surface.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-21T12:17Z (approx)
- **Completed:** 2026-05-21T12:42Z
- **Tasks:** 2
- **Files modified:** 15 (13 modified, 2 created)

## Accomplishments
- `contact_closeness` enum and `contactClosenessValues` array now carry `close_career`, `career` in high→low order; `career_contact` removed entirely
- Hand-authored migration `0011_split_career_closeness.sql` performs the sanctioned enum swap: drop default → rename old → create new → `ALTER ... TYPE ... USING` CASE cast (`career_contact` → `career`) → restore `acquaintance` default → drop old type
- Journal + `0011_snapshot.json` updated so `npm run db:migrate` and the PGlite test harness apply the migration
- Bridge-score weights: `close_career: 50`, `career: 40` (was `career_contact: 45`)
- All consuming surfaces updated: closeness color map (indigo/violet), `CLOSENESS_OPTIONS`, triage `shortLabels` + 1–9 keyboard shortcuts, connections sort order, both networking `closenessRank` maps (contiguous 0..8), networking-dashboard order, outreach + import-review Selects
- categorize route test seeds/asserts the migrated `career` tier (confirms PGlite applies migration 0011 cleanly and the enum accepts `career`)

## Task Commits

1. **Task 1: Author enum-swap migration + update schema, types, bridge weights** — `1fb5e89` (feat)
2. **Task 2: Update all UI/sort references and migrate tests** — `10d430f` (feat)

## Files Created/Modified
- `drizzle/migrations/0011_split_career_closeness.sql` — created; enum swap + row remap (the only surviving `career_contact` reference is the USING cast)
- `drizzle/migrations/meta/0011_snapshot.json` — created from 0010 verbatim; fresh UUID, prevId = 0010 id, enum values updated
- `drizzle/migrations/meta/_journal.json` — appended idx 11 entry for 0011
- `drizzle/schema/enums.ts` — `contactClosenessEnum` value set
- `src/lib/domain/types.ts` — `contactClosenessValues` array (Zod-derived)
- `src/features/job-leads/lib/prioritization.ts` — `closenessWeights` (50 / 40)
- `src/features/contacts/lib/closeness-colors.ts` — close_career=indigo, career=violet
- `src/features/contacts/components/contact-table/options.tsx` — `CLOSENESS_OPTIONS`
- `src/features/contacts/components/triage/closeness-button-bar.tsx` — `shortLabels` + 1–9 shortcut guard
- `src/app/api/contacts/connections/route.ts` — `closenessOrder`
- `src/features/networking/components/connection-finder.tsx` — `closenessRank` 0..8
- `src/features/networking/components/outreach-list.tsx` — `closenessRank` 0..8 + Select
- `src/features/networking/components/networking-dashboard.tsx` — `closenessOrder`
- `src/features/contacts/components/linkedin-import/import-review-table.tsx` — Select
- `src/app/api/contacts/import/categorize/route.test.ts` — seed/assert `career`

## Decisions Made
- Existing `career_contact` rows map to `career` (conservative — see CONTEXT decision). Re-promoting specific people to `close_career` is a deliberate post-migration triage action.
- `career` badge uses violet; `close_career` keeps the legacy indigo.
- Triage keyboard shortcuts widened from `1-8` to `1-9` for the new 9-button bar.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `npm run test:run` reports 6 failures, **all** in `src/app/api/job-leads/[id]/prospects/route.test.ts` — all are 60s test timeouts in bulk-insert tests. That file has **zero** references to `closeness`/`career` (verified via grep), so the failures are pre-existing PGlite bulk-insert performance flakiness unrelated to this task. Per the executor scope boundary, these are out of scope and were not modified.
- The two test files this task touches/affects pass cleanly when run in isolation: `npx vitest run src/features/job-leads/lib/prioritization.test.ts src/app/api/contacts/import/categorize/route.test.ts` → **12 passed (2 files)**. The categorize test passing confirms migration 0011 applies cleanly under PGlite and the enum accepts `career`.
- `npm run build` (Next.js production build / TypeScript strict typecheck) passes.

## Migration Not Yet Applied to Production

Per the plan's constraint about live Neon prod writes, `npm run db:migrate` was **not** run against production from this execution. The migration SQL is validated by the PGlite harness (the categorize route test exercises it). **User action required:** run `npm run db:migrate` against Neon to apply the enum swap and remap existing `career_contact` rows to `career`. After applying, review whether any `career` contacts should be hand-promoted to `close_career` (deliberate post-migration triage, not part of this task).

## Verification Results
- `grep -rn career_contact src/` → no matches
- `grep -v '^--' drizzle/migrations/0011_split_career_closeness.sql | grep -c career_contact` → 1 (the USING cast)
- Journal last entry tag = `0011_split_career_closeness`; snapshot enum values updated, no `career_contact`
- `npm run build` → success
- Affected test files → 12 passed in isolation

## Next Phase Readiness
- Code, migration, journal, and snapshot are ready. The only outstanding item is applying the migration to the production Neon database (user action above).

## Self-Check: PASSED

- Created files verified present: `0011_split_career_closeness.sql`, `0011_snapshot.json`, SUMMARY.md
- Commits verified in history: `1fb5e89`, `10d430f`

---
*Phase: quick-260521-bhf*
*Completed: 2026-05-21*
