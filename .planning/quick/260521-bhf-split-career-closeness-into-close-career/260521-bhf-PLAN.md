---
phase: quick-260521-bhf
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
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
  - src/features/job-leads/lib/prioritization.test.ts
  - src/app/api/contacts/import/categorize/route.test.ts
  - drizzle/migrations/0011_split_career_closeness.sql
  - drizzle/migrations/meta/_journal.json
  - drizzle/migrations/meta/0011_snapshot.json
autonomous: true
requirements: [BHF-01]

must_haves:
  truths:
    - "The contact_closeness enum no longer contains career_contact; it contains close_career and career"
    - "Every existing contact row whose closeness was career_contact now reads career"
    - "Bridge-score weighting uses close_career=50 and career=40"
    - "Triage button bar, contact-table filter, networking selects/ranks, and color map all show the two new tiers in high→low order with no career_contact entry"
    - "npm run build (typecheck) and npm run test:run pass with no remaining career_contact reference outside the migration USING cast"
  artifacts:
    - path: "drizzle/migrations/0011_split_career_closeness.sql"
      provides: "Hand-authored enum swap + row remap migration"
      contains: "career_contact"
    - path: "drizzle/schema/enums.ts"
      provides: "contactClosenessEnum with new value set"
      contains: "close_career"
    - path: "src/lib/domain/types.ts"
      provides: "contactClosenessValues array with new value set"
      contains: "close_career"
  key_links:
    - from: "drizzle/schema/enums.ts"
      to: "src/lib/domain/types.ts"
      via: "enum value list must match contactClosenessValues array exactly"
      pattern: "close_career"
    - from: "drizzle/migrations/0011_split_career_closeness.sql"
      to: "drizzle/migrations/meta/_journal.json"
      via: "journal entry tag references the new migration file"
      pattern: "0011_split_career_closeness"
---

<objective>
Split the single `career_contact` contact-closeness tier into two distinct tiers — `close_career` (weight 50) and `career` (weight 40) — across the Postgres enum, the TypeScript enum value array, the bridge-score weight table, the triage UI, the contact-table filter options, the networking dashboard selects/ranks, the LinkedIn import review select, and the closeness color map. Migrate all existing `career_contact` rows to the lower `career` tier and remove the `career_contact` enum value entirely.

Purpose: The owner wants finer triage granularity between an ordinary career contact and a close career contact, so introduction-path prioritization and triage reflect that distinction.

Output: A hand-authored Drizzle enum-swap migration (journal + snapshot updated), updated schema/types/weights/UI, and updated tests — all green under `npm run build` and `npm run test:run`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/260521-bhf-split-career-closeness-into-close-career/260521-bhf-CONTEXT.md
@CLAUDE.md

<interfaces>
<!-- Canonical high→low closeness ordering. EVERY list/map/array below MUST follow this exact sequence. -->
close_friend, close_colleague, friend, colleague, close_career, career, acquaintance, linkedin_only, never_met

Current contactClosenessEnum (drizzle/schema/enums.ts:133-142) and contactClosenessValues
(src/lib/domain/types.ts:186-195) both list:
  close_friend, close_colleague, friend, colleague, career_contact, acquaintance, linkedin_only, never_met
Replace the single `career_contact` slot with `close_career`, `career` in BOTH.

Bridge-score weights (src/features/job-leads/lib/prioritization.ts:4-13):
  Replace `career_contact: 45,` with `close_career: 50,` then `career: 40,`.

Display labels: close_career → "Close Career", career → "Career".
Triage short labels: close_career → "Cls Career", career → "Career".

contacts.closeness column (drizzle/schema/contacts.ts:30): default 'acquaintance' — UNCHANGED.

PGlite test harness (src/test-utils/pglite.ts) applies EVERY .sql file in drizzle/migrations/
in filename order via pglite.exec(). The new 0011 migration MUST execute cleanly under PGlite,
which supports CREATE TYPE / ALTER ... TYPE ... USING / DROP TYPE. Postgres (and PGlite) reject
ALTER COLUMN TYPE while a column default references the old enum, so the default must be DROPPED
before the swap and re-added after.

Files with career_contact NOT listed in CONTEXT.md but found via grep (these MUST also be updated):
  src/app/api/contacts/connections/route.ts:12 (closenessOrder array — sort order)
  src/features/networking/components/connection-finder.tsx:18 (closenessRank map, numeric)
  src/features/networking/components/outreach-list.tsx:24 (closenessRank map) + :86 (SelectItem)
  src/features/networking/components/networking-dashboard.tsx:15 (closenessOrder array)
  src/features/contacts/components/linkedin-import/import-review-table.tsx:76 (SelectItem)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Author enum-swap migration + update schema, types, and bridge weights</name>
  <files>drizzle/schema/enums.ts, src/lib/domain/types.ts, src/features/job-leads/lib/prioritization.ts, drizzle/migrations/0011_split_career_closeness.sql, drizzle/migrations/meta/_journal.json, drizzle/migrations/meta/0011_snapshot.json</files>
  <action>
Update the schema sources so the new value set is the source of truth (per CONTEXT decisions):
- drizzle/schema/enums.ts — in contactClosenessEnum's list, replace the single 'career_contact' entry with 'close_career', 'career'. Full ordered list becomes: close_friend, close_colleague, friend, colleague, close_career, career, acquaintance, linkedin_only, never_met.
- src/lib/domain/types.ts — apply the identical change to the contactClosenessValues `as const` array (lines 186-195). This array auto-derives the Zod `z.enum(contactClosenessValues)` used by API routes, so it MUST match the enum exactly.
- src/features/job-leads/lib/prioritization.ts — in closenessWeights, replace `career_contact: 45,` with two lines `close_career: 50,` and `career: 40,` keeping the high→low ordering between colleague(60) and acquaintance(30).

Hand-author drizzle/migrations/0011_split_career_closeness.sql implementing the sanctioned raw-SQL enum swap (drizzle-kit cannot remove an enum value in place). Separate statements with `--> statement-breakpoint`, matching existing migration file style. Statements in order:
  1. ALTER TABLE "contacts" ALTER COLUMN "closeness" DROP DEFAULT  (default references old enum; must drop first)
  2. ALTER TYPE "public"."contact_closeness" RENAME TO "contact_closeness_old"
  3. CREATE TYPE "public"."contact_closeness" AS ENUM(...) with the final ordered value set (close_friend, close_colleague, friend, colleague, close_career, career, acquaintance, linkedin_only, never_met)
  4. ALTER TABLE "contacts" ALTER COLUMN "closeness" TYPE "public"."contact_closeness" USING a CASE expression on "closeness"::text that maps 'career_contact' → 'career' and passes every other value through unchanged, casting the CASE result back to the new enum type
  5. ALTER TABLE "contacts" ALTER COLUMN "closeness" SET DEFAULT 'acquaintance'  (restore unchanged default)
  6. DROP TYPE "public"."contact_closeness_old"
The USING expression is the ONLY place 'career_contact' may still appear after this plan.

Update the migration journal so `npm run db:migrate` and the PGlite harness pick up the file: append to drizzle/migrations/meta/_journal.json `entries` a new object with idx 11, version "7", a current epoch-ms `when`, tag "0011_split_career_closeness", breakpoints true.

Create drizzle/migrations/meta/0011_snapshot.json by copying 0010_snapshot.json verbatim, then: assign a fresh random UUID to `id`; set `prevId` to 0010's id (35d59b5b-13e3-4e80-a416-060ca29db68b); edit the `public.contact_closeness` enum `values` array (~line 2017) to the new ordered value set (replace "career_contact" with "close_career", "career"). Leave every other table/enum unchanged.
  </action>
  <verify>
    <automated>cd /Users/sbronstein/Github/heimdall && node -e "const fs=require('fs'); const j=require('./drizzle/migrations/meta/_journal.json'); if(j.entries.at(-1).tag!=='0011_split_career_closeness') throw new Error('journal tag wrong'); const snap=fs.readFileSync('./drizzle/migrations/meta/0011_snapshot.json','utf8'); if(snap.includes('\"career_contact\"')) throw new Error('snapshot still has career_contact'); if(!snap.includes('close_career')||!snap.includes('\"career\"')) throw new Error('snapshot missing new values'); console.log('journal+snapshot OK')" && [ "$(grep -c close_career drizzle/schema/enums.ts)" = "1" ] && [ "$(grep -c close_career src/lib/domain/types.ts)" = "1" ] && grep -q "close_career: 50" src/features/job-leads/lib/prioritization.ts && grep -q "career: 40" src/features/job-leads/lib/prioritization.ts && [ "$(grep -v '^--' drizzle/migrations/0011_split_career_closeness.sql | grep -c career_contact)" = "1" ] && echo ALL_OK</automated>
  </verify>
  <done>Enum, types array, and bridge weights carry close_career/career in high→low order; migration SQL performs drop-default → rename → create → USING-cast remap → set-default → drop-old; journal has the 0011 entry and 0011_snapshot.json reflects the new enum values with no career_contact except the single USING cast.</done>
</task>

<task type="auto">
  <name>Task 2: Update all UI/sort references and migrate tests</name>
  <files>src/features/contacts/lib/closeness-colors.ts, src/features/contacts/components/contact-table/options.tsx, src/features/contacts/components/triage/closeness-button-bar.tsx, src/app/api/contacts/connections/route.ts, src/features/networking/components/connection-finder.tsx, src/features/networking/components/outreach-list.tsx, src/features/networking/components/networking-dashboard.tsx, src/features/contacts/components/linkedin-import/import-review-table.tsx, src/features/job-leads/lib/prioritization.test.ts, src/app/api/contacts/import/categorize/route.test.ts</files>
  <action>
Replace the single career_contact entry with close_career then career (high→low order) in every list/map/select below:
- closeness-colors.ts: replace the `career_contact: 'bg-indigo-...'` line with two entries. Reuse the existing indigo classes for `close_career`, and pick a distinct on-theme color for `career` (e.g. violet: `bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200`). Keep entries in high→low order.
- contact-table/options.tsx CLOSENESS_OPTIONS: replace `{ value: 'career_contact', label: 'Career Contact' }` with `{ value: 'close_career', label: 'Close Career' }` and `{ value: 'career', label: 'Career' }`.
- triage/closeness-button-bar.tsx: in `shortLabels`, replace `career_contact: 'Career'` with `close_career: 'Cls Career'` and `career: 'Career'`. The bar now has 9 buttons (was 8): update the keyboard-shortcut guard `if (key >= '1' && key <= '8')` to `'9'` so positional shortcuts 1–9 cover all options in CLOSENESS_OPTIONS order.
- connections/route.ts: in the `closenessOrder` array, replace 'career_contact' with 'close_career', 'career'.
- connection-finder.tsx: in `closenessRank`, replace `career_contact: 4` and renumber so the map stays a contiguous 0..8 high→low rank: close_friend:0, close_colleague:1, friend:2, colleague:3, close_career:4, career:5, acquaintance:6, linkedin_only:7, never_met:8.
- outreach-list.tsx: same `closenessRank` renumber as connection-finder (0..8). Also in the closeness Select, replace the `career_contact` SelectItem with `<SelectItem value='close_career'>Close Career</SelectItem>` and `<SelectItem value='career'>Career</SelectItem>`.
- networking-dashboard.tsx: in `closenessOrder` array, replace 'career_contact' with 'close_career', 'career'.
- import-review-table.tsx: replace the `career_contact` SelectItem with `<SelectItem value='close_career'>Close Career</SelectItem>` and `<SelectItem value='career'>Career</SelectItem>`.

Update tests so they pass after removal (career_contact no longer a valid enum value):
- prioritization.test.ts: no literal 'career_contact' present (it fuzzes over contactClosenessValues, which now excludes it) — no change required, but re-run to confirm the bounds/monotonicity tests still hold with the new weights.
- categorize/route.test.ts: Test 1 seeds and asserts `closeness: 'career_contact'` (lines 47, 61). Replace BOTH occurrences with 'career' (the migrated tier) so the insert/assert use a valid enum value. The comment on line 58 ("Carol → career_contact") should read "Carol → career".

After edits, confirm no career_contact reference remains anywhere in src/.
  </action>
  <verify>
    <automated>cd /Users/sbronstein/Github/heimdall && [ "$(grep -rc career_contact src/ | grep -v ':0$' | wc -l | tr -d ' ')" = "0" ] && grep -q "close_career" src/features/contacts/lib/closeness-colors.ts && grep -q "key <= '9'" src/features/contacts/components/triage/closeness-button-bar.tsx && npm run build && npm run test:run</automated>
  </verify>
  <done>No `career_contact` token remains in src/; color map, CLOSENESS_OPTIONS, triage shortLabels (with 1–9 shortcuts), connections sort order, both networking closenessRank maps (contiguous 0..8) and selects, networking-dashboard order, and import-review select all carry close_career then career in high→low order; the categorize test seeds/asserts the migrated `career` tier; `npm run build` and `npm run test:run` pass.</done>
</task>

</tasks>

<verification>
- `npm run build` succeeds (TypeScript strict typecheck across the new enum value union).
- `npm run test:run` passes — notably the categorize route test (PGlite applies migration 0011, so the enum must accept `career` and reject `career_contact`) and the prioritization fuzz/monotonicity tests under the new 50/40 weights.
- `grep -rn career_contact src/` returns nothing.
- `grep -v '^--' drizzle/migrations/0011_split_career_closeness.sql | grep -c career_contact` returns exactly 1 (the USING cast).
- The five distinct closeness orderings (enum, types array, color map, CLOSENESS_OPTIONS, triage bar) plus the three networking rank/order structures all follow: close_friend, close_colleague, friend, colleague, close_career, career, acquaintance, linkedin_only, never_met.
</verification>

<success_criteria>
- `career_contact` is fully removed from the `contact_closeness` enum and from all application code (only surviving reference is the migration's USING cast that maps it to `career`).
- `close_career` (weight 50) and `career` (weight 40) exist as distinct tiers in the enum, types array, bridge-score weights, triage UI (with 9-button keyboard shortcuts), contact-table filter, networking selects/ranks, and color map.
- Existing `career_contact` rows migrate to `career` via the hand-authored enum-swap migration; column default stays `acquaintance`.
- Migration journal and 0011 snapshot are updated so `npm run db:migrate` applies the migration and the PGlite test harness runs it cleanly.
- `npm run build` and `npm run test:run` both pass.
</success_criteria>

<output>
Create `.planning/quick/260521-bhf-split-career-closeness-into-close-career/260521-bhf-SUMMARY.md` when done.

Note (per project CLAUDE.md): this is a `.planning/` markdown change — refresh the sibling HTML companion for the SUMMARY and PLAN, and regenerate `_index.html` via `node ~/.claude/scripts/build-index.mjs`, committing the HTML alongside the markdown.

Reminder for the executor: after migration is applied to production (`npm run db:migrate` against Neon), the user should review whether any `career` contacts should be hand-promoted to `close_career` — this is a deliberate post-migration triage action, not part of this plan.
</output>
