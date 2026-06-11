---
phase: quick-260611-kqi
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - drizzle/schema/contacts.ts
  - drizzle/migrations/
  - src/app/api/contacts/route.ts
  - src/app/api/contacts/[id]/route.ts
  - src/features/contacts/components/contact-form.tsx
  - src/features/job-leads/lib/prioritization.ts
  - src/features/job-leads/lib/prioritization.test.ts
autonomous: true
requirements: [QUICK-260611-kqi]
must_haves:
  truths:
    - "A contact can be flagged 'do not use for intros' and the flag persists in the database"
    - "The flag is set/cleared through the contacts REST API (POST create + PUT update) with Zod validation"
    - "The flag is editable in the contact form UI as a toggle"
    - "A flagged contact never appears in job-leads intro recommendations, regardless of seniority/closeness/recency"
  artifacts:
    - path: "drizzle/schema/contacts.ts"
      provides: "do_not_use_for_intros boolean column, default false, NOT NULL"
      contains: "doNotUseForIntros"
    - path: "src/features/job-leads/lib/prioritization.ts"
      provides: "hard exclusion of flagged contacts in buildRecommendations"
      contains: "doNotUseForIntros"
    - path: "src/features/job-leads/lib/prioritization.test.ts"
      provides: "regression test proving flagged contacts are excluded"
      contains: "doNotUseForIntros"
  key_links:
    - from: "src/features/contacts/components/contact-form.tsx"
      to: "/api/contacts/[id]"
      via: "PUT payload field doNotUseForIntros"
      pattern: "doNotUseForIntros"
    - from: "src/app/api/contacts/[id]/route.ts"
      to: "contacts.doNotUseForIntros"
      via: "Zod-validated update value"
      pattern: "doNotUseForIntros"
    - from: "src/features/job-leads/lib/prioritization.ts"
      to: "buildRecommendations exclusion"
      via: "skip contacts where doNotUseForIntros is true"
      pattern: "doNotUseForIntros"
---

<objective>
Add a "do not use for intros" override flag to contacts. This is a hard, owner-controlled exclusion: a flagged contact is never recommended as an introduction path even if their bridge score is high.

Purpose: The owner sometimes knows a contact should not be approached for intros (sensitive relationship, already over-asked, etc.). Scores cannot capture this — it needs an explicit manual override that the recommendation engine respects absolutely.

Output: New `do_not_use_for_intros` boolean column on contacts, exposed through the contacts REST API and contact form UI, and enforced as a hard exclusion in `buildRecommendations`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

<interfaces>
<!-- Contacts schema (drizzle/schema/contacts.ts) uses pgTable with kebab DB column names.
     Existing imports: pgTable, uuid, text, timestamp, index, uniqueIndex from 'drizzle-orm/pg-core'.
     `boolean` is NOT yet imported — add it. -->

<!-- Domain type (src/lib/domain/types.ts) is inferred:
     export type Contact = typeof contacts.$inferSelect;
     Adding the column automatically extends Contact / NewContact — no manual type edit needed. -->

<!-- Contacts API update schema (src/app/api/contacts/[id]/route.ts):
     const updateContactSchema = z.object({ firstName: ..., ... triagedAt: ... });
     PUT spreads validated into `values` then sets updatedAt + date coercions, then db.update().
     Create schema lives in src/app/api/contacts/route.ts as createContactSchema (same shape, fewer optionals). -->

<!-- prioritization.ts — buildRecommendations(bridges) loops over {bridge, prospect, contact},
     builds a Map keyed by contact.id, then computes rec.score = max of bridgeScores.
     Hard exclusion = skip the contact entirely before it ever enters the Map. -->

<!-- contact-form.tsx — react-hook-form + zodResolver. formSchema (local z.object), defaultValues,
     and an onSubmit payload object. FormSwitch is available at '@/components/forms/form-switch'
     (props: control, name, label, description?). Boolean field, no string coercion needed. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add do_not_use_for_intros column + migration</name>
  <files>drizzle/schema/contacts.ts, drizzle/migrations/</files>
  <action>
    Add `boolean` to the import from 'drizzle-orm/pg-core' in drizzle/schema/contacts.ts. Add a new column in the "Triage" section (near triagedAt): `doNotUseForIntros: boolean('do_not_use_for_intros').notNull().default(false)`. The Drizzle-inferred Contact / NewContact types in src/lib/domain/types.ts update automatically — do NOT hand-edit types.

    Generate and apply the migration: run `npm run db:generate` to produce a migration file under drizzle/migrations/, then `npm run db:migrate` to apply it. If db:migrate fails due to local DB connectivity, fall back to `npm run db:push` (dev-only) and note it in the summary.
  </action>
  <verify>
    <automated>npm run db:generate &amp;&amp; grep -rl "do_not_use_for_intros" drizzle/migrations/ | head -1</automated>
  </verify>
  <done>contacts schema has doNotUseForIntros (NOT NULL, default false); a migration file containing "do_not_use_for_intros" exists in drizzle/migrations/ and has been applied (or pushed in dev).</done>
</task>

<task type="auto">
  <name>Task 2: Expose flag through REST API and contact form UI</name>
  <files>src/app/api/contacts/route.ts, src/app/api/contacts/[id]/route.ts, src/features/contacts/components/contact-form.tsx</files>
  <action>
    API (both routes): add `doNotUseForIntros: z.boolean().optional()` to createContactSchema in src/app/api/contacts/route.ts and to updateContactSchema in src/app/api/contacts/[id]/route.ts. No date coercion needed — the boolean flows through the existing `...validated` spread into the insert/update values, so no further handler changes are required. The existing logTimeline call already fires on update; leave it as-is.

    UI (contact-form.tsx): import FormSwitch from '@/components/forms/form-switch'. Add `doNotUseForIntros: z.boolean().optional()` to the local formSchema. Add `doNotUseForIntros: initialData?.doNotUseForIntros ?? false` to defaultValues. Add the field to the onSubmit payload object (`doNotUseForIntros: values.doNotUseForIntros ?? false`). Render a `<FormSwitch control={form.control} name='doNotUseForIntros' label='Do not use for intros' description='Exclude this contact from all job-lead intro recommendations.' />` below the grid (full width, near the notes/follow-up section).
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json 2>&amp;1 | grep -i "contact" | head -5; echo "tsc-done"</automated>
  </verify>
  <done>POST and PUT contacts schemas accept doNotUseForIntros (boolean); the value persists via the existing spread; contact form renders a toggle bound to the field and sends it in the PUT/POST payload; project type-checks.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Hard-exclude flagged contacts in buildRecommendations</name>
  <files>src/features/job-leads/lib/prioritization.ts, src/features/job-leads/lib/prioritization.test.ts</files>
  <behavior>
    - A contact with doNotUseForIntros=true is absent from buildRecommendations output even when its bridge score is the highest in the set.
    - A contact with doNotUseForIntros=false (or absent/false default) is included as before — existing tests still pass.
    - Exclusion happens before the contact enters the recommendations Map, so it never appears in results, not merely scored to zero.
  </behavior>
  <action>
    In buildRecommendations (src/features/job-leads/lib/prioritization.ts), inside the `for (const { bridge, prospect, contact } of bridges)` loop, add a guard at the top: if `contact.doNotUseForIntros` is true, `continue` (skip entirely so no Map entry is created). Do NOT touch computeBridgeScore — it stays a pure scoring function; the exclusion is a recommendation-builder concern.

    Add a test case to prioritization.test.ts in the existing `describe('buildRecommendations', ...)` block: build two bridges, one whose contact is flagged with the higher raw score and one unflagged, assert the flagged contact id does not appear in the returned recommendations and the unflagged one does.
  </action>
  <verify>
    <automated>npm run test:run -- src/features/job-leads/lib/prioritization.test.ts</automated>
  </verify>
  <done>buildRecommendations skips flagged contacts entirely; new test proves a high-scoring flagged contact is excluded; all existing prioritization tests still pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client/CLI → contacts API | Untrusted JSON body crosses into the PUT/POST handlers |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-kqi-01 | Tampering | doNotUseForIntros field in contacts API | mitigate | `z.boolean().optional()` rejects non-boolean values at route entry; column is NOT NULL default false so a missing/invalid value never produces null state |
| T-kqi-02 | Elevation of Privilege | recommendation bypass | accept | Single-user app (Clerk lock on steve@bronstein.org); only the owner can set or read the flag — no cross-tenant exposure |
</threat_model>

<verification>
- Migration containing `do_not_use_for_intros` exists and is applied.
- `npx tsc --noEmit` passes (no new type errors).
- `npm run test:run -- src/features/job-leads/lib/prioritization.test.ts` passes including the new exclusion test.
- Manual smoke (optional): toggle the switch on a contact in the UI, save, confirm the contact disappears from a job lead's recommendations that previously listed them.
</verification>

<success_criteria>
- contacts table has a `do_not_use_for_intros` boolean column (NOT NULL, default false).
- The flag round-trips through POST and PUT contacts API routes with Zod validation.
- The contact form exposes the flag as a toggle and persists it.
- `buildRecommendations` never returns a flagged contact, regardless of score, proven by an automated test.
</success_criteria>

<output>
Create `.planning/quick/260611-kqi-add-do-not-use-for-intros-override-flag-/260611-kqi-SUMMARY.md` when done.
</output>
