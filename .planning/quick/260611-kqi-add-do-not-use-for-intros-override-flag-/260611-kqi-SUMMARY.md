---
phase: quick-260611-kqi
plan: 01
subsystem: contacts, job-leads
tags: [contacts, job-leads, prioritization, schema, api, form, tdd]
dependency_graph:
  requires: []
  provides: [do_not_use_for_intros column, contacts API flag, contact form toggle, buildRecommendations exclusion]
  affects: [contacts table, POST /api/contacts, PUT /api/contacts/[id], contact-form.tsx, buildRecommendations]
tech_stack:
  added: []
  patterns: [drizzle boolean column, zod boolean optional, FormSwitch toggle, TDD red-green]
key_files:
  created:
    - drizzle/migrations/0012_whole_scream.sql
  modified:
    - drizzle/schema/contacts.ts
    - src/app/api/contacts/route.ts
    - src/app/api/contacts/[id]/route.ts
    - src/features/contacts/components/contact-form.tsx
    - src/features/job-leads/lib/prioritization.ts
    - src/features/job-leads/lib/prioritization.test.ts
decisions:
  - Exclusion guard placed at top of buildRecommendations loop (before Map entry creation) so flagged contact never enters results — not scored-to-zero
  - doNotUseForIntros column placed in the Triage section of contacts schema alongside triagedAt
  - FormSwitch renders below follow-up textareas at full width for easy discoverability
metrics:
  duration: "~12 minutes"
  completed: "2026-06-11"
  tasks_completed: 3
  files_changed: 7
---

# Quick 260611-kqi Plan 01: Add Do-Not-Use-For-Intros Override Flag — Summary

**One-liner:** Boolean `do_not_use_for_intros` column on contacts with full REST API + form UI exposure and hard exclusion guard in `buildRecommendations` before Map entry creation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add do_not_use_for_intros column + migration | df2ae87 | drizzle/schema/contacts.ts, drizzle/migrations/0012_whole_scream.sql |
| 2 | Expose flag through REST API and contact form UI | 22fb6db | src/app/api/contacts/route.ts, src/app/api/contacts/[id]/route.ts, src/features/contacts/components/contact-form.tsx |
| 3 RED | Add failing test for doNotUseForIntros exclusion | 0ab059b | src/features/job-leads/lib/prioritization.test.ts |
| 3 GREEN | Hard-exclude flagged contacts in buildRecommendations | df65ced | src/features/job-leads/lib/prioritization.ts |

## Verification Results

- `npm run db:generate` produced `drizzle/migrations/0012_whole_scream.sql` with `ALTER TABLE "contacts" ADD COLUMN "do_not_use_for_intros" boolean DEFAULT false NOT NULL;`
- `npm run db:migrate` applied successfully against Neon dev database
- `npx tsc --noEmit` exits 0 (clean)
- `npm run test:run -- src/features/job-leads/lib/prioritization.test.ts` — 7/7 pass including new exclusion test

## TDD Gate Compliance

- RED gate: commit `0ab059b` — `test(quick-260611-kqi-01): add failing test for doNotUseForIntros exclusion in buildRecommendations` (test failed before implementation)
- GREEN gate: commit `df65ced` — `feat(quick-260611-kqi-01): hard-exclude doNotUseForIntros contacts in buildRecommendations` (all tests pass)
- REFACTOR: not needed — implementation was minimal (3-line guard)

## Decisions Made

1. **Exclusion before Map entry** — Guard is at the top of the `for (const { bridge, prospect, contact } of bridges)` loop. The contact never enters the `byContact` Map, so it cannot appear in results under any code path. Alternative (scoring to zero) was rejected because it would still allow the contact to appear with score 0.

2. **Triage section placement** — `doNotUseForIntros` placed alongside `triagedAt` in the schema's Triage section; both are owner-judgment fields applied manually.

3. **z.boolean().optional()** — Used `.optional()` (not `.optional().nullable()`) in both Zod schemas because `undefined` means "not provided in this patch" (preserve DB value), not "set to null". The DB column is NOT NULL with default false.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test factory missing doNotUseForIntros field**
- **Found during:** Task 3 RED phase (TSC check after Task 1)
- **Issue:** Adding `doNotUseForIntros: boolean` (NOT NULL) to the Contact type caused `makeContact()` in `prioritization.test.ts` to fail type-checking since its return type had `doNotUseForIntros?: boolean | undefined` — not assignable to `boolean`
- **Fix:** Added `doNotUseForIntros: false` to the `makeContact` default object. Done as part of the RED phase test setup (Task 3), which is the natural owner of that file.
- **Files modified:** `src/features/job-leads/lib/prioritization.test.ts`
- **Commit:** 0ab059b

## Known Stubs

None — all data wiring is live. The `doNotUseForIntros` field flows from DB schema → Drizzle-inferred Contact type → API validation → form payload → prioritization guard.

## Self-Check: PASSED

- [x] `drizzle/migrations/0012_whole_scream.sql` exists and contains `do_not_use_for_intros`
- [x] `drizzle/schema/contacts.ts` contains `doNotUseForIntros`
- [x] `src/features/job-leads/lib/prioritization.ts` contains `doNotUseForIntros`
- [x] Commits df2ae87, 22fb6db, 0ab059b, df65ced all present in git log
- [x] `npx tsc --noEmit` exits 0
- [x] All 7 prioritization tests pass
