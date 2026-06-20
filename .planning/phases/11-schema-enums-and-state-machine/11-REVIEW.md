---
phase: 11-schema-enums-and-state-machine
reviewed: 2026-06-20T22:28:09Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - drizzle/schema/enums.ts
  - drizzle/schema/index.ts
  - drizzle/schema/outreach-campaigns.ts
  - drizzle/schema/outreach-emails.ts
  - drizzle/migrations/0013_outreach_campaigns.sql
  - src/features/outreach/lib/email-status.ts
  - src/features/outreach/lib/email-status.test.ts
  - src/lib/db/__phase11_schema__.test.ts
  - src/lib/domain/types.ts
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-06-20T22:28:09Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 11 adds three pgEnums (`outreach_campaign_status`, `outreach_channel`, `outreach_email_status`), two tables (`outreach_campaigns`, `outreach_emails`), matching domain enum-value arrays, a Vitest-backed email-status state machine that mirrors `src/lib/domain/pipeline.ts`, and a PGlite schema regression test. The migration `0013_outreach_campaigns.sql` is correctly registered in `meta/_journal.json`, matches the schema definitions field-for-field, and the test files match the `vitest.config.ts` include glob (`src/**/*.test.{ts,tsx}`). The state-machine transition graph is internally complete (all six enum states are keys) and the tests exercise both valid and invalid moves.

No correctness-breaking or security defects were found — the work is fundamentally sound. The findings below are convention/consistency gaps and one state-machine modeling gap that will bite Phase 12/17 routes if not resolved now, while the schema is still empty and cheap to change.

## Warnings

### WR-01: `outreach_emails` has no `archivedAt`, and the UNIQUE is unscoped — soft-delete convention violation + re-add lockout

**File:** `drizzle/schema/outreach-emails.ts:52-59`
**Issue:** Every other primary entity table in this codebase carries an `archivedAt` soft-delete column (`companies`, `contacts`, `applications`, `job_leads` — see `drizzle/schema/contacts.ts:64`, `job-leads.ts:43`), and CLAUDE.md mandates "Soft deletes via `archived_at` timestamp (never hard delete during active search)." `outreach_emails` omits it. Combined with the **full** `UNIQUE(campaign_id, contact_id)` constraint, this reproduces exactly the bug the `contacts` table already learned from: `contacts` deliberately uses a *partial* unique index scoped to active rows (`drizzle/schema/contacts.ts:71-73`, "D-13 #2 … so re-importing a previously-archived linkedin_url creates a fresh active row"). Here, once an outreach email exists for a (campaign, contact) pair, the only way to remove it is a hard delete (banned by convention), and even after one you could re-insert — but you can never soft-archive-and-re-add. A contact dropped from a campaign and later re-added cannot get a fresh row.
**Fix:** Add the column and scope the unique constraint to active rows, mirroring the contacts pattern:
```ts
archivedAt: timestamp('archived_at') // soft delete — never hard delete
// ...
(table) => [
  uniqueIndex('outreach_emails_campaign_contact_unique')
    .on(table.campaignId, table.contactId)
    .where(sql`${table.archivedAt} IS NULL`),
  // ...
]
```
(Requires regenerating `0013_outreach_campaigns.sql`.) If single-emails are intentionally never archived, document that decision explicitly in the schema and CONTEXT so the divergence from convention is deliberate, not accidental.

### WR-02: Email state machine has no path to `failed` from `approved`/`drafted`, but the schema provisions failure tracking there

**File:** `src/features/outreach/lib/email-status.ts:1-8`
**Issue:** `failed` is reachable only from `pending` and `generated`. The `approved → drafted` transition is the Gmail draft-creation step (`gmailDraftId`, "Phase 17", `outreach-emails.ts:39-40`) — exactly the kind of external API call that fails. The schema deliberately adds `lastError`/`lastErrorAt` ("CD-01 — mirror job-leads.ts:36-38", `outreach-emails.ts:42-44`) to record such failures. But the guard `canEmailTransition` will reject `approved → failed` and `drafted → failed`, so a draft-creation failure can populate `lastError` while `status` is stuck at `approved`/`drafted`. The UI/CLI then cannot distinguish a healthy approved row from one whose drafting blew up. In `job-leads.ts` (the cited precedent) `failed` is reachable from the long-running step that actually fails; this machine drops that affordance for the drafting step.
**Fix:** Either add `failed` as a destination from the states whose outbound step can fail, or commit to a retry-in-place model and document it:
```ts
approved: ['drafted', 'edited', 'failed'], // Gmail draft creation can fail
drafted: ['edited', 'failed'],             // re-draft can fail
```
If draft failures are meant to stay in `approved` with `lastError` set (retry the same transition), state that in a comment so the `lastError`-without-`failed` combination is understood as intentional.

### WR-03: Missing exported domain types for the three new outreach enums — breaks the established pattern and forces loose `string` typing

**File:** `src/lib/domain/types.ts:246-261`
**Issue:** `outreachCampaignStatusValues`, `outreachChannelValues`, and `outreachEmailStatusValues` are added as `as const` arrays but, unlike the immediately-preceding additions, ship **no** corresponding exported type. `seniorityLevelValues` exports `SeniorityLevel` (line 234) and `contactEnrichmentStatusValues` exports `ContactEnrichmentStatus` (line 243). Because no `OutreachEmailStatus` type exists, the state machine in `email-status.ts` is forced to type its graph and function signatures as bare `string` (`Record<string, string[]>`, `canEmailTransition(from: string, to: string)`), so a typo like `canEmailTransition('aproved', 'drafted')` compiles cleanly and silently returns `false`. (Note: `pipeline.ts` also uses `string`, so the state machine matches that older precedent — but the missing type exports are the root cause and a clear regression from the newer convention.)
**Fix:** Add the three types and tighten the state-machine signatures:
```ts
// types.ts
export type OutreachCampaignStatus = (typeof outreachCampaignStatusValues)[number];
export type OutreachChannel = (typeof outreachChannelValues)[number];
export type OutreachEmailStatus = (typeof outreachEmailStatusValues)[number];
```
```ts
// email-status.ts
const validEmailTransitions: Record<OutreachEmailStatus, OutreachEmailStatus[]> = { /* ... */ };
export function canEmailTransition(from: OutreachEmailStatus, to: OutreachEmailStatus): boolean { /* ... */ }
```

### WR-04: `UNIQUE(campaign_id, contact_id)` omits `channel` — a contact cannot be reached on both email and LinkedIn in one campaign

**File:** `drizzle/schema/outreach-emails.ts:55-59`
**Issue:** `channel` is a first-class column with two values (`email`, `linkedin_message`), but the uniqueness key is `(campaign_id, contact_id)`. That permanently caps each contact at one outreach row per campaign across both channels, so you can never queue both an email and a LinkedIn message to the same person in the same campaign. The D-07 comment ("needs LinkedIn is a channel, not a status") suggests one-message-per-contact is intended, in which case this is correct — but the presence of a `channel` column alongside a key that ignores it is the kind of latent contradiction that surfaces as a confusing 23505 error in Phase 12.
**Fix:** Confirm the intent. If multi-channel-per-contact is ever desired, include `channel` in the key: `unique('...').on(table.campaignId, table.contactId, table.channel)`. If single-channel is intentional, add a one-line comment on the constraint stating that `channel` is intentionally excluded.

## Info

### IN-01: Redundant standalone index on `campaign_id`

**File:** `drizzle/schema/outreach-emails.ts:56-60`
**Issue:** The `UNIQUE(campaign_id, contact_id)` constraint creates a btree whose leading column is `campaign_id`, which already serves queries that filter or join on `campaign_id` alone. The separate `outreach_emails_campaign_id_idx` (line 60) is therefore largely redundant and just adds write overhead. (Performance is out of v1 scope; flagged only as a cleanliness/duplication note.)
**Fix:** Consider dropping `outreach_emails_campaign_id_idx` and relying on the unique constraint's index; keep the `status` and `contact_id` indexes.

### IN-02: Mixed timezone-awareness across timestamp columns in the same table

**File:** `drizzle/schema/outreach-emails.ts:44-53`
**Issue:** `lastErrorAt`, `generatedAt`, `approvedAt`, `draftedAt` are `timestamp with time zone`, while `createdAt`/`updatedAt` are plain `timestamp` (no tz). This matches the `job_leads` precedent (`job-leads.ts:38` vs `:41-43`), so it is consistent with the codebase — but mixing `timestamptz` and `timestamp` within one table is a known foot-gun for cross-column comparisons.
**Fix:** No action required for parity; if standardizing later, prefer `withTimezone: true` for all timestamp columns project-wide.

### IN-03: Empty `terminalEmailStates` makes the terminal guard and `isEmailTerminalState` permanently constant

**File:** `src/features/outreach/lib/email-status.ts:10-19`
**Issue:** `terminalEmailStates` is `[]` by design (D-06: every state recoverable), so `if (terminalEmailStates.includes(from)) return false;` (line 13) is dead and `isEmailTerminalState` always returns `false`. This mirrors `pipeline.ts` structure and is defensible future-proofing, and the test pins the invariant — noting only so the dead guard isn't mistaken for a live check.
**Fix:** Keep as-is for symmetry with `pipeline.ts`; optionally add a one-line comment that the guard is retained for structural parity.

---

_Reviewed: 2026-06-20T22:28:09Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
