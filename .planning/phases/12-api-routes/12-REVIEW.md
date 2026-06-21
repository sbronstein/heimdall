---
phase: 12-api-routes
reviewed: 2026-06-20T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/app/api/contacts/route.ts
  - src/app/api/outreach-campaigns/route.ts
  - src/app/api/outreach-campaigns/[id]/route.ts
  - src/app/api/outreach-campaigns/[id]/emails/route.ts
  - src/app/api/outreach-campaigns/[id]/emails/[emailId]/route.ts
  - src/app/api/outreach-campaigns/[id]/emails/[emailId]/status/route.ts
  - src/app/api/outreach-campaigns/[id]/emails/[emailId]/recipient/route.ts
  - src/app/api/outreach-campaigns/[id]/emails/[emailId]/draft/route.ts
  - src/app/api/outreach-campaigns/[id]/emails/[emailId]/generation/route.ts
  - src/app/api/outreach-campaigns/[id]/generation-context/route.ts
findings:
  critical: 2
  warning: 10
  info: 2
  total: 14
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-06-20
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Ten route files were reviewed: the existing contacts list/create route, four new outreach-campaigns routes (list, detail, email list/bulk-add, email detail), and five narrow-purpose sub-routes (status, recipient, draft, generation write-back, generation-context). The bulk of the logic is sound — IDOR guards via compound `AND campaignId = :id` WHERE clauses are consistently applied, `updatedAt` is always stamped manually, `logTimeline` is called after every write, and the email state machine in `email-status.ts` is correctly consulted before status transitions.

Two blockers were found. The more serious one is that the generation write-back route applies to emails in any status, which means AI-generated content can overwrite the stored `generatedSubject`/`generatedBody` on an already-approved or already-drafted email — silently invalidating a user approval. The second blocker is that the inline-edit PATCH (`[emailId]/route.ts`) accepts a `recipientEmail` field and writes it straight to the database without enforcing the channel constraint that the dedicated `/recipient` sub-route enforces: a `linkedin_message`-channel email must never carry a recipient email address.

Ten warnings cover: a null-vs-undefined logic error that triggers spurious "edited" state transitions when clearing a field, JSON parse errors returning 500 across all POST/PATCH routes, archived-campaign mutability gaps, invalid UUID route params causing Postgres cast errors, a TypeScript type annotation mismatch on the aggregated `emailCounts` field, FK-violation-on-bulk-insert, a missing content guard for the `pending → generated` transition, and two routes (draft, recipient) that accept writes regardless of the current email status.

---

## Critical Issues

### CR-01: `recipientEmail` business-rule bypass via inline-edit PATCH

**File:** `src/app/api/outreach-campaigns/[id]/emails/[emailId]/route.ts:9-13, 46`

**Issue:** `inlineEditSchema` includes `recipientEmail: z.string().email().optional().nullable()`. This field is spread directly into the Drizzle `.set()` call with no channel check. The dedicated `/recipient` sub-route enforces the invariant that `linkedin_message`-channel emails must have `recipientEmail = null`; the inline-edit PATCH bypasses that enforcement entirely. A caller can issue:

```http
PATCH /api/outreach-campaigns/:id/emails/:emailId
{ "recipientEmail": "someone@domain.com" }
```

against a LinkedIn-message-channel email and the database will store a non-null recipient, corrupting the channel semantics that downstream draft-creation code depends on.

**Fix:** Remove `recipientEmail` from `inlineEditSchema`. Recipient management belongs exclusively to the `/recipient` sub-route, which already has the channel-aware gate. If a one-shot update of both content and recipient is ever needed, that logic should live in `/recipient` with the channel guard, not in the generic edit endpoint.

```typescript
// inlineEditSchema — remove recipientEmail
const inlineEditSchema = z.object({
  editedSubject: z.string().max(500).optional().nullable(),
  editedBody: z.string().optional().nullable()
  // recipientEmail removed — use /recipient sub-route
});
```

---

### CR-02: Generation write-back unguarded by email status — approved/drafted content silently overwritten

**File:** `src/app/api/outreach-campaigns/[id]/emails/[emailId]/generation/route.ts:14-52`

**Issue:** The PATCH handler writes `generatedSubject`, `generatedBody`, and `generatedAt` with no precondition on the current email status. In the normal happy path this is fine (generation runs while status is `pending`). But the final effective content the system uses is `editedSubject ?? generatedSubject` (used in the approval guard in `status/route.ts:46-50`). If an email was approved with `editedSubject = null` (user accepted the generated content without editing), overwriting `generatedSubject` silently changes what was approved. The same applies to a `drafted` email that has already had a Gmail draft created. There is no guard to prevent a re-run of the generation pipeline from clobbering an approved record.

**Fix:** Add a status pre-check. Only allow generation write-back when the email is in `pending` or `failed` state (both of which indicate the email has not yet been reviewed).

```typescript
// After the IDOR existence check (existing row already fetched for the IDOR guard)
// — but generation/route.ts currently does NOT fetch first. Pattern: fetch, then
// conditional update, similar to status/route.ts.

const [existing] = await db
  .select({ status: outreachEmails.status })
  .from(outreachEmails)
  .where(and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id)))
  .limit(1);

if (!existing) return notFound('Email');

if (existing.status !== 'pending' && existing.status !== 'failed') {
  return validationError(
    `Cannot write generated content: email is already ${existing.status}`
  );
}
```

---

## Warnings

### WR-01: `isEdit` triggers on `null` — spurious "edited" state transition when clearing a field

**File:** `src/app/api/outreach-campaigns/[id]/emails/[emailId]/route.ts:36-41`

**Issue:** The edit-detection guard is:

```typescript
const isEdit =
  validated.editedSubject !== undefined ||
  validated.editedBody !== undefined;
```

`inlineEditSchema` marks these fields `.optional().nullable()`. When the caller sends `{ "editedSubject": null }`, Zod parses it as `null`, not `undefined`. Because `null !== undefined` is `true`, `isEdit` becomes `true` and the route transitions a `generated` or `approved` email to `edited` — even though the caller was clearing (not setting) the edit field. An email can therefore end up in `edited` state with `editedSubject = null`, which is semantically incorrect and will mislead UI components that use the `edited` status to indicate user-authored content is present.

**Fix:** Use a non-nullish check:

```typescript
const isEdit =
  (validated.editedSubject != null) ||
  (validated.editedBody != null);
```

`!= null` in JavaScript is true for any value that is neither `null` nor `undefined`, correctly distinguishing "caller explicitly set a string" from "caller cleared the field".

---

### WR-02: JSON parse errors return HTTP 500 instead of 400 across all POST/PATCH routes

**File:** Affects all POST and PATCH handlers across all 10 reviewed files (e.g., `src/app/api/outreach-campaigns/route.ts:79`, `[id]/route.ts:68`, `[emailId]/route.ts:20`, etc.)

**Issue:** Every handler calls `await request.json()` inside a `try/catch` that routes to `serverError()`. A `SyntaxError` from malformed JSON is not a `z.ZodError`, so the Zod-branch catch is skipped and `serverError()` fires — returning HTTP 500 ("Internal server error"). Callers (including the Claude Code CLI) receive a 500 with no diagnostic when they send a bad payload, making debugging needlessly difficult.

**Fix:** Wrap `request.json()` separately and return a 400:

```typescript
let body: unknown;
try {
  body = await request.json();
} catch {
  return validationError('Request body must be valid JSON');
}
const validated = createCampaignSchema.parse(body);
```

Or use a shared helper and apply the pattern once across all routes.

---

### WR-03: Archived campaign mutable via PATCH — no `isNull(archivedAt)` guard

**File:** `src/app/api/outreach-campaigns/[id]/route.ts:71-77`

**Issue:** The PATCH handler updates with `.where(eq(outreachCampaigns.id, id))` — no `isNull(outreachCampaigns.archivedAt)` filter. An archived campaign can be renamed, have its goal instruction changed, or have its status flipped back to `active` via PATCH. This contradicts the soft-delete semantics: the GET list route explicitly filters `isNull(archivedAt)`, yet the PATCH ignores the same field.

**Fix:**

```typescript
.where(
  and(
    eq(outreachCampaigns.id, id),
    isNull(outreachCampaigns.archivedAt)
  )
)
```

Return 404 if no row is returned (which covers both non-existent and archived IDs).

---

### WR-04: Archived campaign can receive new emails

**File:** `src/app/api/outreach-campaigns/[id]/emails/route.ts:86-92`

**Issue:** The POST handler verifies the campaign exists with `.where(eq(outreachCampaigns.id, id))` but does not check `archivedAt`. Contacts can therefore be bulk-added to an archived campaign. Given that the campaign list never shows archived campaigns, the emails inserted would be orphaned from the user's perspective.

**Fix:** Add `isNull(outreachCampaigns.archivedAt)` to the existence check query:

```typescript
const [campaign] = await db
  .select()
  .from(outreachCampaigns)
  .where(
    and(
      eq(outreachCampaigns.id, id),
      isNull(outreachCampaigns.archivedAt)
    )
  )
  .limit(1);
```

---

### WR-05: Non-UUID route params cause Postgres cast error → HTTP 500

**File:** All `[id]` and `[emailId]` route handlers (e.g., `src/app/api/outreach-campaigns/[id]/route.ts:23-24`, `[emailId]/route.ts:17-18`)

**Issue:** `id` and `emailId` are extracted from params as plain strings and passed directly to Drizzle `.where(eq(...id, id))`. The schema column is a `uuid`, so if a caller sends a non-UUID string (e.g., `/api/outreach-campaigns/not-a-uuid`), Postgres throws `invalid input syntax for type uuid`, which is caught by the outer try/catch and returned as a 500. The correct response is 400 or 404.

**Fix:** Validate before querying. Either add a lightweight UUID regex check or use `z.string().uuid()`:

```typescript
const { id } = await params;
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
  return notFound('Campaign');
}
```

Returning 404 (rather than 400) is conventional for route params; either is defensible.

---

### WR-06: `emailCounts` annotated as `sql<string>` but Neon driver returns a JSON object at runtime

**File:** `src/app/api/outreach-campaigns/route.ts:45`, `src/app/api/outreach-campaigns/[id]/route.ts:36`

**Issue:** The aggregated email counts are expressed as:

```typescript
emailCounts: sql<string>`json_build_object(...)`
```

PostgreSQL's `json_build_object` function returns the `json` data type. The `@neondatabase/serverless` HTTP driver deserializes `json`/`jsonb` columns into JavaScript objects before returning them. At runtime, `emailCounts` will be an object like `{ pending: "3", generated: "0", ... }` (with string-typed count values from Postgres `BIGINT`), not a `string`. TypeScript consumers that rely on `sql<string>` for typing will get the wrong type.

**Fix:** Use a more accurate type annotation:

```typescript
emailCounts: sql<{
  pending: string;
  generated: string;
  edited: string;
  approved: string;
  drafted: string;
  failed: string;
}>`json_build_object(...)`
```

Note: Postgres `count(*)` returns `bigint` which arrives as a string in most drivers — hence `string` values within the object.

---

### WR-07: Invalid `contactId` in bulk-add causes FK violation → HTTP 500 instead of 400

**File:** `src/app/api/outreach-campaigns/[id]/emails/route.ts:100-104`

**Issue:** The bulk insert uses `onConflictDoNothing()` to handle the `(campaign_id, contact_id)` uniqueness constraint. However, if any element of `contactIds` does not correspond to a real contact row, Postgres throws a foreign-key constraint violation (`contacts(id)` FK). This exception is not a `z.ZodError`, so it falls through to `serverError()` and returns HTTP 500. The entire batch fails with no indication of which contact ID was invalid.

**Fix:** Either pre-validate the contact IDs with an `inArray` existence check before the insert, or catch the FK violation specifically and return a 400:

```typescript
// Option A: pre-validate
const existing = await db
  .select({ id: contacts.id })
  .from(contacts)
  .where(inArray(contacts.id, validated.contactIds));

const existingIds = new Set(existing.map((r) => r.id));
const invalid = validated.contactIds.filter((cid) => !existingIds.has(cid));
if (invalid.length > 0) {
  return validationError(`Unknown contact IDs: ${invalid.join(', ')}`);
}
```

---

### WR-08: No content guard for `pending → generated` status transition

**File:** `src/app/api/outreach-campaigns/[id]/emails/[emailId]/status/route.ts:38-42`

**Issue:** The `approved` status correctly checks that `generatedSubject ?? editedSubject` and `generatedBody ?? editedBody` are non-null before allowing the transition (lines 44-51). No equivalent guard exists for `pending → generated`. A client can manually set an email to `generated` via PATCH `/status` even when `generatedSubject` and `generatedBody` are both null, leaving the record in a state that implies it has AI-generated content when it does not. Downstream UI components that skip generation for `generated`-status emails would display empty content.

**Fix:** Add a content check parallel to the `approved` guard:

```typescript
if (newStatus === 'generated') {
  if (!email.generatedSubject || !email.generatedBody) {
    return validationError('Cannot transition to generated: no generated content present');
  }
}
```

---

### WR-09: Draft write-back (`/draft` PATCH) accepted on any email status

**File:** `src/app/api/outreach-campaigns/[id]/emails/[emailId]/draft/route.ts:22-33`

**Issue:** The `/draft` PATCH stores `gmailDraftId` and stamps `draftedAt` without checking the current email status. Calling it on a `pending` or `failed` email sets a `draftedAt` timestamp before the email has been approved, creating a misleading lifecycle timestamp. More concretely, calling it on an already-`drafted` email with a different `gmailDraftId` silently replaces the stored draft reference, with no record of the previous draft ID.

**Fix:** Pre-fetch the email and restrict writes to emails in `approved` status (the only state from which a Gmail draft should legitimately be created):

```typescript
if (existing.status !== 'approved') {
  return validationError(
    `Cannot record a draft: email status is ${existing.status}, expected approved`
  );
}
```

---

### WR-10: Recipient write-back (`/recipient` PATCH) accepted on any email status

**File:** `src/app/api/outreach-campaigns/[id]/emails/[emailId]/recipient/route.ts:31-39`

**Issue:** The `/recipient` PATCH updates `channel` and `recipientEmail` without checking the current email status. Changing the recipient on a `drafted` email (one for which a Gmail draft has already been created with the previous recipient) leaves the stored Gmail draft stale — the draft in Gmail will still address the old recipient while the database stores the new one. There is no mechanism to propagate the change to the existing Gmail draft.

**Fix:** For `drafted` emails, either reject the change with an error ("Draft already created — delete it first before changing the recipient") or automatically clear `gmailDraftId` and `draftedAt` and revert status to `approved` to signal that re-drafting is required. At minimum, document the behavior explicitly.

---

## Info

### IN-01: Non-null assertion on nullable `contactId` in generation-context

**File:** `src/app/api/outreach-campaigns/[id]/generation-context/route.ts:56`

**Issue:**

```typescript
if (!acc[i.contactId!]) acc[i.contactId!] = [];
```

`interactions.contactId` is declared nullable in the schema (it's a polymorphic link — interactions can belong to companies or applications too). The `!` non-null assertion suppresses the TypeScript error. At runtime, if an interaction has `contactId = null`, `acc["null"]` is used as the grouping key (JavaScript object key coercion). The null-keyed entry is never retrieved by `interactionsByContact[contact.id]`, so the practical impact is that null-linked interactions are silently dropped. No crash, but the assertion is wrong and masks the real behavior.

**Fix:** Add an explicit null guard and use the non-null assertion only inside the guarded branch:

```typescript
if (!i.contactId) return acc;
if (!acc[i.contactId]) acc[i.contactId] = [];
acc[i.contactId].push(i);
return acc;
```

---

### IN-02: All interactions for a batch fetched without any server-side limit

**File:** `src/app/api/outreach-campaigns/[id]/generation-context/route.ts:47-50`

**Issue:**

```typescript
const allInteractions = await db
  .select()
  .from(interactions)
  .where(inArray(interactions.contactId, contactIds))
  .orderBy(desc(interactions.occurredAt));
```

With up to 500 contact IDs (the bulk-add cap) and an unbounded number of interactions per contact, this query can return a very large result set entirely into memory before `.slice(0, 3)` discards most of it at line 65. Only 3 interactions per contact are used in the response. Adding `.limit(contactIds.length * 3)` as a rough safety cap, or using a `RANK() OVER (PARTITION BY contact_id)` subquery approach, would bound the fetch size. (Performance is out of scope for v1 per project conventions — flagged for awareness only.)

---

_Reviewed: 2026-06-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
