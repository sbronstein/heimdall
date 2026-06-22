---
phase: 16-email-generation-skill
reviewed: 2026-06-22T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/app/api/outreach-campaigns/[id]/emails/[emailId]/generation/route.ts
  - src/app/api/outreach-campaigns/[id]/emails/[emailId]/generation/route.test.ts
  - .claude/skills/generate-outreach-emails/SKILL.md
  - .claude/skills/generate-outreach-emails/references/voice-guide.md
  - .claude/skills/generate-outreach-emails/references/heimdall-api.md
findings:
  critical: 3
  warning: 4
  info: 0
  total: 7
status: resolved
resolved: 2026-06-22
resolution_commits:
  - 7645586  # CR-01/02/03 skill fixes
  - 1ee8c36  # WR-01/02/03 route hardening + ownership test
  - a99128a  # WR-04 heimdall-api Run Protocol
---

> **Resolution (2026-06-22):** All 7 findings (3 critical + 4 warning) were fixed inline during
> execute-phase before verification. CR-01 (jq-escaped write-backs), CR-02 (Step 3 sample
> persistence), CR-03 (skill-local steve-fact-bank.md). WR-01 (400 on bad JSON), WR-02 (empty
> .returning() guard), WR-03 (CD-06 ownership test — suite now 4/4), WR-04 (sample gate in the
> heimdall-api Run Protocol). See resolution_commits above.

# Phase 16: Code Review Report

**Reviewed:** 2026-06-22T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Reviewed the generation route (`route.ts`), its test file, and the three skill markdown files
(`SKILL.md`, `voice-guide.md`, `heimdall-api.md`).

The `route.ts` is structurally sound: it correctly gates `status='generated'` through
`canEmailTransition`, combines content + status + timestamps in a single UPDATE, and logs
exactly one timeline event. Two application-code warnings exist (a `SyntaxError` path that
returns 500 instead of 400, and an unchecked `updated` result after the UPDATE). The test
suite covers the three required cases but is missing a cross-campaign ownership test for CD-06.

The skill markdown files contain three blockers: (1) the write-back curl command in SKILL.md
Step 4d/4e uses unquoted shell variable interpolation that produces malformed JSON for any
multi-line email body; (2) Step 3 never writes the 5 sample emails back to the API but Step 4
skips them as "already written back," creating an irreconcilable loop gap; (3) both SKILL.md
and voice-guide.md reference `steve-fact-bank.md` as a required anti-hallucination source but
the file does not exist anywhere in the skill directory.

---

## Critical Issues

### CR-01: Shell variable interpolation in curl body produces malformed JSON for any multi-line email body

**File:** `.claude/skills/generate-outreach-emails/SKILL.md:246` (Step 4d) and `:269` (Step 4e)
**Issue:** The success write-back curl command uses double-quoted string interpolation:
```bash
-d "{\"generatedSubject\":\"$SUBJECT\",\"generatedBody\":\"$BODY\"}"
```
A networking email body is always multi-line (greeting / hook / ask / sign-off). When `$BODY`
contains a literal newline the shell expands it verbatim into the argument string, producing
JSON with an unescaped line break inside a string value. The JSON spec forbids literal newlines
in string values; `request.json()` will throw `SyntaxError` and the route returns 500 for every
non-trivial email. Any `"` in subject or body similarly breaks the string boundary.

The same defect is present in the failure-path curl (Step 4e, line 269):
```bash
-d "{\"status\":\"failed\",\"lastError\":\"$LAST_ERROR\"}"
```

**Fix:** Use `jq` to construct the JSON so values are properly escaped:
```bash
# Step 4d success write-back
payload=$(jq -n \
  --arg subject "$SUBJECT" \
  --arg body "$BODY" \
  '{generatedSubject: $subject, generatedBody: $body}')
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$payload" \
  "http://localhost:4000/api/outreach-campaigns/$CAMPAIGN_ID/emails/$EMAIL_ID/generation"

# Step 4e failure write-back
payload=$(jq -n --arg err "$LAST_ERROR" '{status: "failed", lastError: $err}')
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$payload" \
  "http://localhost:4000/api/outreach-campaigns/$CAMPAIGN_ID/emails/$EMAIL_ID/status"
```

---

### CR-02: Step 3 shows 5 sample emails but never writes them back; Step 4 skips them as "already written back"

**File:** `.claude/skills/generate-outreach-emails/SKILL.md:155-159` (Step 3) and `:177` (Step 4a)
**Issue:** Step 3 generates 5 sample emails, displays them, and waits for owner approval. No
PATCH call to `/generation` appears anywhere in Step 3. Step 4 then says:

> "For each email entry from `data.emails` (skipping the 5 already written back in the sample)"

These two instructions are mutually exclusive:
- If an agent follows Step 3 literally (no write-back), the 5 samples are never persisted. Step 4
  skips them, so all 5 remain `pending` at run end and no content is ever written for them.
- If an agent infers it should write them back before showing them, the owner sees already-committed
  emails and cannot request tone tweaks before persistence -- the approval gate is defeated.
- If tone tweaks are requested, the samples must be regenerated but there is no instruction
  for when to write those back.

**Fix:** Add an explicit write-back block at the end of Step 3, after owner approval:
```
After the owner confirms thumbs-up (with or without tone-tweak requests):
1. If tone tweaks were requested, regenerate the 5 samples using the adjusted approach.
2. Run the blocking LLM-tell scan on each (re)generated sample.
3. Write each of the 5 samples back via PATCH /generation (see Step 4d curl).
4. Proceed to Step 4 to drain the remaining N-5 emails.
```
Update Step 4a to replace "skipping the 5 already written back in the sample" with "skipping
the 5 sample emails already written back after Step 3 approval."

---

### CR-03: `steve-fact-bank.md` referenced as an anti-hallucination source but the file does not exist

**File:** `.claude/skills/generate-outreach-emails/SKILL.md:199` and
`.claude/skills/generate-outreach-emails/references/voice-guide.md:9,126`
**Issue:** Both SKILL.md and voice-guide.md cite `steve-fact-bank.md` as the authoritative
durable-fact source:

- SKILL.md Step 4a: "reference ONLY facts present in the contact brief or `steve-fact-bank.md`"
- voice-guide.md §1: "Also read `steve-fact-bank.md` for durable career facts you may draw from"
- voice-guide.md §4: "reference only facts present in the provided contact context or in `steve-fact-bank.md`"

The file does not exist anywhere in `.claude/skills/generate-outreach-emails/` (only
`SKILL.md`, `references/voice-guide.md`, and `references/heimdall-api.md` are present). No
path is provided in either document. When an agent attempts to read `steve-fact-bank.md`, it
will either fail silently or invent a path. The anti-hallucination contract (D-11/GEN-04) is
broken without this file: without durable career facts (e.g., correct company names, revenue
figures, team sizes), the agent is more likely to fabricate details in emails to contacts who
know Steve's work.

**Fix:** Create `.claude/skills/generate-outreach-emails/references/steve-fact-bank.md` and
add a read directive at the top of SKILL.md Setup (Step 0) that points to the file explicitly:
```bash
# Read the durable fact bank before authoring any email
cat .claude/skills/generate-outreach-emails/references/steve-fact-bank.md
```

---

## Warnings

### WR-01: Malformed request body (SyntaxError from `request.json()`) returns 500 instead of 400

**File:** `src/app/api/outreach-campaigns/[id]/emails/[emailId]/generation/route.ts:22`
**Issue:** `request.json()` throws `SyntaxError` when the request body is absent or is not
valid JSON. The catch block at line 65 checks `instanceof z.ZodError` first; a `SyntaxError`
falls through to `serverError(err)` which returns 500 and logs an internal error. Per the API
contract, an invalid request body is a client error (400), not a server error (500). The same
pattern exists in several other routes (e.g., `[emailId]/route.ts:22`) so fixing here keeps
the convention consistent.

**Fix:**
```typescript
} catch (err) {
  if (err instanceof z.ZodError) {
    return validationError(err.issues[0].message);
  }
  if (err instanceof SyntaxError) {
    return validationError('Invalid JSON body');
  }
  return serverError(err);
}
```

---

### WR-02: `updated` can be `undefined` after the UPDATE, causing `success(undefined)` to be returned

**File:** `src/app/api/outreach-campaigns/[id]/emails/[emailId]/generation/route.ts:43-63`
**Issue:** There is a check-then-update pattern: SELECT at lines 25-32 confirms the row exists,
then UPDATE at lines 43-55 re-applies the same WHERE condition. If the row is deleted or its
`campaignId` changes between those two operations, `.returning()` yields an empty array and
`const [updated]` destructures to `undefined`. `success(undefined)` at line 63 returns
`{ "success": true, "data": null }` (JSON serializes `undefined` to `null`). The caller
(skill) treats this as a successful write-back and counts the email in the "Generated" tally,
but no content was actually persisted.

**Fix:**
```typescript
const [updated] = await db
  .update(outreachEmails)
  .set({ ... })
  .where(and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id)))
  .returning();

if (!updated) return serverError(new Error('Row disappeared between check and update'));
return success(updated);
```

---

### WR-03: No test for cross-campaign email ID access (CD-06 coverage gap)

**File:** `src/app/api/outreach-campaigns/[id]/emails/[emailId]/generation/route.test.ts:143-167`
**Issue:** The test suite covers: pending→generated (success), approved→generated (blocked), and
non-existent `emailId` (404). It does not test the scenario where `emailId` is a valid UUID
that belongs to a different campaign. The CD-06 comment in route.ts states this ownership
check is intentional security behavior -- a caller passing a foreign email ID with their own
campaign ID must get 404, not a successful write. Without a test for this case, a future
refactor that changes the WHERE clause could silently regress the ownership invariant.

**Fix:** Add a fourth test case:
```typescript
it('Test 4: valid emailId from a different campaign returns 404', async () => {
  // Seed a second campaign and an email belonging to it
  const [otherCampaign] = await dbRef.current!.insert(outreachCampaigns)
    .values({ name: 'Other', goalInstruction: 'Other goal' }).returning();
  const [otherEmail] = await dbRef.current!.insert(outreachEmails)
    .values({ campaignId: otherCampaign.id, contactId, status: 'pending' }).returning();

  const { PATCH } = await import(
    '@/app/api/outreach-campaigns/[id]/emails/[emailId]/generation/route'
  );
  const { status, body } = await callRoute(PATCH as unknown as Parameters<typeof callRoute>[0], {
    method: 'PATCH',
    body: { generatedSubject: 'Attempt', generatedBody: 'Body' },
    params: { id: campaignId, emailId: otherEmail.id } // wrong campaign
  });
  expect(status).toBe(404);
  expect(body).toMatchObject({ success: false, error: 'Email not found' });
});
```

---

### WR-04: heimdall-api.md Run Protocol summary omits the D-04 sample gate

**File:** `.claude/skills/generate-outreach-emails/references/heimdall-api.md:239-248`
**Issue:** The "Run Protocol (summary)" section describes a simple for-each loop over all
emails. It omits Step 3 (5-email sample gate, D-04) entirely. An agent following only the
heimdall-api.md summary would send PATCH calls for all N emails without pausing for owner
review, bypassing the sample approval gate. While SKILL.md is the definitive workflow
document, the contradiction means an agent that treats heimdall-api.md's Run Protocol as
authoritative (rather than supplementary) will skip D-04.

**Fix:** Update the Run Protocol summary to reference the sample gate:
```
1. Call `GET .../generation-context` once -- store `goalInstruction` and `emails` array.
2. Report count and wait for owner confirmation.
3. **Sample gate (D-04):** author 5 representative emails, show inline, wait for approval.
   Write back the 5 approved samples via `PATCH .../generation`.
4. For each remaining email in the array:
   a. Author subject + body using `voice-guide.md`.
   b. Run LLM-tell scrub (blocking set). Rewrite if needed.
   c. On success: `PATCH .../generation`.
   d. On failure: `PATCH .../status` with `{ status:'failed', lastError }`.
5. Report end-of-run summary: generated / failed / low-context counts.
```

---

_Reviewed: 2026-06-22T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
