---
phase: 05-job-leads-completion
plan: 01
subsystem: database

tags: [drizzle, postgres, neon, schema-migration, job-leads, enum]

# Dependency graph
requires:
  - phase: prior-job-leads-foundation
    provides: existing job_lead_status enum (8 values) and job_leads table
provides:
  - jobLeadStatusEnum extended with 'queued' (between 'scraped' and 'searching') and 'failed' (terminal)
  - job_leads.last_error (text, nullable) and last_error_at (timestamp with time zone, nullable) columns
  - jobLeadStatusValues in src/lib/domain/types.ts synchronized with the DB enum (10 values, same order)
  - ScrapedProspect type permanent home at src/features/job-leads/lib/types.ts
  - migration 0007_add_queued_failed_status_and_error_columns applied to the live Neon dev DB
affects: [05-02, 05-03, 05-04, 05-05, 05-06, 05-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-edit drizzle-kit generated SQL when meta-snapshot drift produces a non-incremental diff"
    - "Use ALTER TYPE ADD VALUE IF NOT EXISTS as idempotency guard for enum-additive migrations (D-23 fallback)"

key-files:
  created:
    - src/features/job-leads/lib/types.ts
    - drizzle/migrations/0007_add_queued_failed_status_and_error_columns.sql
    - drizzle/migrations/meta/0007_snapshot.json
  modified:
    - src/features/job-leads/lib/match-connections.ts
    - drizzle/schema/enums.ts
    - drizzle/schema/job-leads.ts
    - src/lib/domain/types.ts
    - drizzle/migrations/meta/_journal.json

key-decisions:
  - "Hand-edited the generated 0007 SQL to contain only the four ALTER statements (the actual delta), because the missing drizzle/migrations/meta/0006_snapshot.json caused drizzle-kit to diff against 0005 and re-emit 0006's CREATE TABLE statements"
  - "Added IF NOT EXISTS guards to both ADD VALUE statements per D-23 fallback rules (idempotency for safe re-runs)"
  - "Preserved the BEFORE 'searching' positional clause on the 'queued' ADD VALUE per the plan's explicit instruction (both AFTER/BEFORE are valid Postgres; the position determines enum-order semantics)"
  - "Used { withTimezone: true } on last_error_at per D-07 — intentionally divergent from the other timestamps in the table, which remain bare"
  - "Did NOT reconstruct the missing 0006_snapshot.json — out of scope for this plan; deferred to follow-up so future migration-generation works correctly"

patterns-established:
  - "jobLeadStatusValues array in src/lib/domain/types.ts is kept in lockstep with jobLeadStatusEnum order — drift here breaks Zod validation at the API boundary and UI option lists silently"
  - "ScrapedProspect type lives at src/features/job-leads/lib/types.ts (no dependency on scrape-connections.ts, which Plan 07 will delete)"

requirements-completed: [JL-B4]

# Metrics
duration: ~20min
completed: 2026-05-14
---

# Phase 05 Plan 01: Schema Foundation Summary

**Added queued/failed statuses and last_error/last_error_at columns to job_leads, relocated ScrapedProspect type to its permanent home, and applied migration 0007 to the live Neon dev DB.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3
- **Files modified:** 8 (4 source, 1 new type module, 1 new migration SQL, 1 new snapshot, 1 journal update)

## Accomplishments

- `jobLeadStatusEnum` now carries all 10 values in the order `pending → scraping → scraped → queued → searching → found → ready → actioned → archived → failed` — matching D-06 exactly.
- `job_leads` table has nullable `last_error` (text) and `last_error_at` (timestamp with time zone) columns for surfacing the latest skill-failure category in the UI per D-07.
- `jobLeadStatusValues` in `src/lib/domain/types.ts` mirrors the enum byte-for-byte, keeping Zod validation and UI option lists in sync.
- `ScrapedProspect` type relocated to `src/features/job-leads/lib/types.ts` so Plan 07 can delete `scrape-connections.ts` without cascading breakage.
- Migration `0007_add_queued_failed_status_and_error_columns.sql` applied cleanly to the live Neon dev DB; idempotent re-run verified (second `npm run db:migrate` was a no-op).

## Task Commits

Each task was committed atomically on branch `worktree-agent-adb9b2af0d87d1d97`:

1. **Task 1: Relocate ScrapedProspect type** — `29b1d1a` (refactor)
2. **Task 2: Add 'queued' and 'failed' enum values plus error columns** — `eec431b` (feat)
3. **Task 3: [BLOCKING] Generate and apply Drizzle migration** — `79f8b1c` (feat)

## Files Created/Modified

- `src/features/job-leads/lib/types.ts` — **new**; permanent home for `ScrapedProspect` (self-contained, no imports)
- `src/features/job-leads/lib/match-connections.ts` — import path updated to `./types`
- `drizzle/schema/enums.ts` — `jobLeadStatusEnum` extended with `'queued'` and `'failed'`
- `drizzle/schema/job-leads.ts` — added `lastError: text('last_error')` and `lastErrorAt: timestamp('last_error_at', { withTimezone: true })` between `prospectCount` and `createdAt`
- `src/lib/domain/types.ts` — `jobLeadStatusValues` mirrors the enum (10 elements)
- `drizzle/migrations/0007_add_queued_failed_status_and_error_columns.sql` — **new**; 4 hand-edited ALTER statements (see Deviations below)
- `drizzle/migrations/meta/0007_snapshot.json` — **new**; correct post-migration schema snapshot
- `drizzle/migrations/meta/_journal.json` — appended `0007_add_queued_failed_status_and_error_columns` entry

## Migration details (per plan output spec)

- **Final migration filename:** `0007_add_queued_failed_status_and_error_columns.sql`
- **Hand-editing required:** YES — but **NOT** for the D-23 reason the plan anticipated. The generated SQL did not contain `BEGIN;`/`COMMIT;` wrapping (D-23's stated concern was not the actual failure mode). Instead, the generated file contained a full re-emission of `0006`'s `CREATE TABLE` statements because `drizzle/migrations/meta/0006_snapshot.json` is missing from the repo (it was never committed when `0006_add_job_leads` shipped). drizzle-kit therefore diffed the current schema against `0005_snapshot.json` (the last snapshot it could find) and produced a non-incremental SQL that would have failed against the live DB (tables already exist).
- **Hand-edit applied:** Replaced the generated SQL with the actual delta — the four ALTER statements per the plan's Pattern Map. Added `IF NOT EXISTS` to both `ADD VALUE` statements per D-23 fallback rule 3 (idempotency guard).
- **AFTER/BEFORE clauses:** drizzle-kit emitted the post-state snapshot only (no AFTER/BEFORE clauses in the original SQL since it was a CREATE TYPE). The hand-edit uses `BEFORE 'searching'` on `queued` (matches plan instructions) and no positional clause on `failed` (appended).
- **`npm run db:migrate` result:** PASS — exit 0, applied successfully. Live DB verified post-migrate: 10 enum values, both columns present and nullable.
- **`lastErrorAt` `withTimezone` confirmation:** YES — declared with `{ withTimezone: true }`, only such use in `job-leads.ts` (other timestamps remain bare per D-07).
- **`ScrapedProspect` new location verification:** `src/features/job-leads/lib/types.ts` exists, exports the type, and `match-connections.ts` line 4 reads `import type { ScrapedProspect } from './types';`. Plan 07's deletion-test gate (filesystem-existence check) will pass once `scrape-connections.ts` is removed in Plan 07.

## Decisions Made

- **Hand-edit instead of regenerate.** Reconstructing the missing `0006_snapshot.json` to make drizzle-kit produce a clean diff would have been the "by-the-book" fix, but it requires synthesizing the post-0006 schema state and is out of scope for a Wave-1 schema foundation plan. The hand-edited SQL is the correct delta and matches the Pattern Map's expectation; this is the simpler, lower-risk path.
- **`IF NOT EXISTS` on ADD VALUE.** Plan's D-23 fallback rule 3 calls for this only when stripping `BEGIN;`/`COMMIT;`. The generated SQL had no transaction wrap, so the rule did not strictly trigger, but the guard is cheap and matches the recorded decision intent (safe re-runs). Kept in for idempotency.
- **Position of `failed` in the enum.** Plan says `failed` at the end. drizzle-kit's CREATE TYPE emitted the values in that order; the hand-edited ALTER TYPE appended `failed` with no AFTER/BEFORE clause. Postgres appends to the tail by default — produces the correct order.

## Deviations from Plan

### Rule 3 - Blocking issue auto-fixed

**1. [Rule 3 - Blocking] Hand-edited the generated migration SQL because drizzle-kit produced a non-incremental diff**

- **Found during:** Task 3 (Generate and apply Drizzle migration)
- **Issue:** `npm run db:generate` produced a migration that included a full re-creation of `job_leads`, `prospects`, `prospect_bridges`, and the `job_lead_status` / `seniority_level` ENUM types — not just the delta. Root cause: `drizzle/migrations/meta/0006_snapshot.json` is missing from the repo (never committed when `0006_add_job_leads` shipped). drizzle-kit diffed the current schema against `0005_snapshot.json` (the last snapshot it could find) and re-emitted everything between `0005` and the current state. The plan anticipated a D-23-style hand-edit for `BEGIN;`/`COMMIT;` wrapping; the actual hand-edit reason was meta-snapshot drift.
- **Fix:** Replaced the generated SQL with the four ALTER statements per the plan's Pattern Map expectation:
  ```sql
  ALTER TYPE "public"."job_lead_status" ADD VALUE IF NOT EXISTS 'queued' BEFORE 'searching';
  ALTER TYPE "public"."job_lead_status" ADD VALUE IF NOT EXISTS 'failed';
  ALTER TABLE "job_leads" ADD COLUMN "last_error" text;
  ALTER TABLE "job_leads" ADD COLUMN "last_error_at" timestamp with time zone;
  ```
  Kept the auto-generated `0007_snapshot.json` (correct post-state) and `_journal.json` update unchanged — the snapshot is correct as a forward-baseline; only the SQL was wrong.
- **Files modified:** `drizzle/migrations/0007_add_queued_failed_status_and_error_columns.sql` (rewritten before commit)
- **Verification:**
  1. Pre-migration DB inspection (via `@neondatabase/serverless` ad-hoc script): confirmed the tables already exist and the enum had 8 values without `queued`/`failed`.
  2. `npm run db:migrate` exit 0 with the hand-edited SQL.
  3. Post-migration DB inspection: enum has all 10 values in correct order; both new columns present.
  4. Re-running `npm run db:migrate` was a no-op (idempotency).
- **Committed in:** `79f8b1c` (Task 3 commit)

**2. [Rule 3 - Blocking] Set up `.env.local` and `node_modules` inside the worktree**

- **Found during:** Pre-Task-3 environment check
- **Issue:** The worktree was spawned without `.env.local` (gitignored) or `node_modules` (gitignored). Both are required for `npm run db:generate` and `npm run db:migrate` to function.
- **Fix:** Copied `.env.local` from the main repo (it stays gitignored — verified via `git check-ignore`) and symlinked `node_modules` from the main repo into the worktree (also gitignored). No tracked-file impact, no commit.
- **Files modified:** None tracked. (Both target paths covered by `.gitignore` patterns `/node_modules` and `.env*.local`.)
- **Verification:** `npm run db:generate` and `npm run db:migrate` both ran successfully; `git status --short` shows neither file as untracked.
- **Committed in:** N/A (environment-only fix)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking).
**Impact on plan:** No scope creep. The hand-edit was anticipated by the plan (D-23 fallback exists for this exact situation, just for a different proximate cause); the env+node_modules setup is a worktree-mode necessity. The plan's deliverables and BLOCKING gate (clean `db:migrate` exit) are fully satisfied.

## Deferred Issues

**Missing `drizzle/migrations/meta/0006_snapshot.json`.** This is a pre-existing repo-state bug from when `0006_add_job_leads` was committed — the snapshot file for that migration was never tracked. The `_journal.json` entry exists but the snapshot file is absent. drizzle-kit will continue to produce wrong diffs on future migrations (it'll compute the delta from `0005` or now `0007`, missing whatever shape `0006` introduced) until reconstructed. Reconstruction options for follow-up:
1. Run `drizzle-kit introspect` against the live DB to regenerate a snapshot from the actual schema, then manually re-derive the `0006_snapshot.json` as the post-0005-pre-0007 state.
2. Or, simpler: since `0007_snapshot.json` now correctly captures the full schema state and is committed, future migrations will diff from `0007` and won't trip on the missing `0006` snapshot. Effectively, the issue is self-mitigating going forward — but a backfilled `0006_snapshot.json` would still be ideal for historical correctness.

Recommendation: option 2 is sufficient for Phase 05's needs. Logged here for visibility.

## Issues Encountered

- **drizzle-kit non-incremental diff:** see Deviation #1 above. Resolved via hand-edit.
- **Worktree missing `.env.local` and `node_modules`:** see Deviation #2 above. Resolved via copy + symlink.
- **Pre-existing TypeScript errors:** `prioritization.ts` (4) and `scrape-connections.ts` (3) errors are pre-existing and out of scope per `.planning/phases/04-starter-template-cleanup/deferred-items.md`. Confirmed unchanged before and after this plan via diff of `tsc --noEmit` output.

## User Setup Required

None — no external service configuration required. The migration applied to the live dev DB; downstream plans can write `'queued'`, `'failed'`, and the error columns immediately.

## Next Phase Readiness

Plan 05-01 unblocks every downstream Plan in Phase 05:
- **Plan 05-02:** API routes that read/write the new statuses and `last_error*` columns.
- **Plan 05-03:** Middleware bearer-token bypass (no schema dependency, but its API tests rely on this schema).
- **Plan 05-04, 05-05:** Bulk-prospects API + skill — both write `'searching'`/`'found'`/`'failed'` and prospect data; schema is in place.
- **Plan 05-06:** UI updates — `queued` and `failed` badges + error banner consume the new columns.
- **Plan 05-07:** Deletion of `scrape-connections.ts` — `ScrapedProspect`'s new home is verified; `match-connections.ts` no longer references the soon-to-be-deleted file.

No blockers for Wave 2.

## Self-Check

Verified before commit:
- `src/features/job-leads/lib/types.ts` exists (FOUND)
- `drizzle/migrations/0007_add_queued_failed_status_and_error_columns.sql` exists (FOUND)
- `drizzle/migrations/meta/0007_snapshot.json` exists (FOUND)
- Commit `29b1d1a` (Task 1) — FOUND in `git log`
- Commit `eec431b` (Task 2) — FOUND in `git log`
- Commit `79f8b1c` (Task 3) — FOUND in `git log`
- `npm run db:migrate` exit 0 — VERIFIED twice (first apply + idempotent re-run)
- Live DB has 10 enum values + both new columns — VERIFIED via ad-hoc Neon query

## Self-Check: PASSED

---
*Phase: 05-job-leads-completion*
*Completed: 2026-05-14*
