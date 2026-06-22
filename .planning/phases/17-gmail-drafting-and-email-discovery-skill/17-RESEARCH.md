# Phase 17: Gmail Drafting and Email Discovery Skill - Research

**Researched:** 2026-06-22
**Domain:** Gmail MCP integration, Claude Code skill authoring, Heimdall REST write-back
**Confidence:** HIGH for codebase facts; MEDIUM for Gmail MCP tool parameter shapes (tool names are VERIFIED, parameter/response shapes are ASSUMED from Gmail API conventions)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Fix `/draft` write-back route to atomically set `gmailDraftId`, `draftedAt`, `updatedAt`, transition `status → 'drafted'` via `canEmailTransition()` (400 on illegal), and set the linked contact's `outreachStatus = 'reached_out'`. One call per email, one timeline event. Only legal pre-state is `approved`.
- **D-02:** Idempotency via recreate-and-repoint (research-gated — resolved below). Never-drafted approved email → create draft, write back. Already-drafted unchanged (`status='drafted'`) → skip. Edited-after-draft (`status='approved'`, `gmailDraftId IS NOT NULL`) → create fresh draft, repoint `gmailDraftId`; old draft left harmless in Gmail, never sent.
- **D-03:** Accept a discovered address ONLY when the contact was a confirmed direct to/from thread participant with Steve. No domain/name-only inference. Exactly one distinct address → accept. Two or more → ambiguous (D-04). None → LinkedIn fallback (D-04b). Researcher validates extraction mechanics; accept rule is locked.
- **D-04:** Ambiguous candidates are ephemeral — listed in run summary, no `candidates` column, no candidate-picker UI. Leave `recipientEmail` unset; do NOT force `linkedin_message` (email likely exists). No schema change.
- **D-04b:** No email found → write `PATCH .../recipient { channel: 'linkedin_message' }`. Existing `needsLinkedinMessage()` badge already renders this. Never silently drop a contact.
- **D-05:** Batch-only invocation: `draft-outreach-emails <campaign-id>`. No `--discover-only` / `--draft-only` flags. Discover-then-draft in one run. Upfront confirm gate: report `N approved / M missing recipient`, wait for owner confirmation.
- **D-06:** Documented Gmail-tool allowlist in SKILL.md. Grep checklist: grep skill file for "send" before any real campaign run. The connected MCP has no send-family tool at all (confirmed — defense-in-depth).

### Claude's Discretion

- Per-email failure handling: `approved → failed` is NOT a legal transition (confirmed below). Leave email `approved`, report failure in run summary. For non-approved emails that fail, call `PATCH .../status { status: 'failed', lastError }` and continue.
- End-of-run summary format/content: counts (drafted / skipped-already-drafted / discovered / ambiguous / linkedin-fallback / failed) + ambiguous-candidate list.
- Archived-contact edge case: skip drafting and report in summary; do not draft to an archived contact.
- Discovery batching / pacing: chunk size and Gmail MCP pacing — skill's choice; each write-back must be durable before next email.
- Exact `search_threads` query construction (name terms, date scoping) — researcher proposes, skill implements.

### Deferred Ideas (OUT OF SCOPE)

- Durable candidate-picker UI (`candidates` JSONB column + review-card dropdown) — deferred to post-v1.2.
- `--discover-only` / `--draft-only` split modes — dropped for batch-only.
- Content preview / sample gate before creating real drafts — drafts are reviewable in Gmail; not needed.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DISC-01 | For approved emails on contacts without a stored address, discover via Gmail thread search | D-03 extraction mechanics documented; `search_threads` + `get_thread` tool signatures inferred from Gmail API conventions |
| DISC-02 | Ambiguous multi-match candidates surface in review UI for manual selection | D-04: ephemeral run-summary approach; no new schema. `needsLinkedinMessage()` does NOT fire for ambiguous (channel stays `email`). |
| DISC-03 | No email found → flag for LinkedIn message, never silently dropped | D-04b: `PATCH .../recipient { channel: 'linkedin_message' }` — existing route + badge already handle render |
| DRFT-01 | Skill creates a Gmail draft per approved email that has a recipient | `create_draft` MCP tool confirmed present |
| DRFT-02 | Skill NEVER sends — only ever calls `create_draft` | Confirmed: no send-family tool on connected MCP. Grep checklist is defense-in-depth. |
| DRFT-03 | Drafting is idempotent — no duplicate drafts; edited-after-draft re-drafts correctly | Re-draft path: recreate-and-repoint (no `update_draft` tool). Skip path: `status='drafted'` not in approved queue. |
| DRFT-04 | Each created draft stores `gmailDraftId`, marks email `drafted`, logs timeline event | D-01 route edit covers all four effects atomically |
| DRFT-05 | Drafting updates contact's `outreachStatus` to `reached_out` | D-01 route edit: second Drizzle UPDATE on contacts table |
</phase_requirements>

---

## Summary

Phase 17 adds a `draft-outreach-emails` Claude Code skill that runs discover-then-draft in a single batch. The research resolves the two RESEARCH-GATED decisions locked in CONTEXT.md and confirms the existing API surface is sufficient with one targeted route edit.

**D-02 resolved (re-draft mechanic):** The connected Gmail MCP (`claude_ai_Gmail`) does NOT expose `update_draft` or `delete_draft` — the only draft-management tool present is `create_draft`. The re-draft path is therefore recreate-and-repoint: create a fresh draft and overwrite `gmailDraftId` via the D-01 route. The old draft is left harmless in Gmail's drafts folder. Since no send-family tool exists on the MCP at all (`send`, `send_message`, `trash`, `drafts.send`, `messages.send` are all absent), the D-06 grep gate is purely defense-in-depth.

**D-03 resolved (participant-email extraction):** The skill constructs a Gmail search query from the contact's full name, calls `search_threads` to get matching thread IDs, then calls `get_thread` on each to walk message headers (`From`, `To`, `Cc`). Participant addresses are collected after stripping Steve's own address. Name-matching applies the locked accept rule: one distinct address → accept; two or more → ambiguous; none → LinkedIn fallback. The exact MCP tool parameter/response shapes are inferred from Gmail API conventions — the executor must validate tool signatures at run time via `help` or a test call.

**Work-queue endpoint confirmed sufficient:** `GET /api/outreach-campaigns/[id]/emails?status=approved&limit=100` returns `{ email: OutreachEmail, contact: Contact | null }` pairs with all fields the skill needs. No new endpoint required. Pagination via cursor supported; skill must loop when `meta.hasMore = true`.

**State-machine gap confirmed:** `approved → failed` is NOT a legal transition in `email-status.ts`. The per-discretion path is correct: leave the email `approved`, report the failure in the run summary only.

**Primary recommendation:** Implement D-01 route edit first (it gates all skill write-back), then write the skill package mirroring `generate-outreach-emails` structure.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Gmail draft creation | Claude Code Skill | — | MCP only available in interactive CLI session; not callable from Next.js API routes (Vercel serverless) |
| Email address discovery | Claude Code Skill | — | Gmail MCP is interactively authenticated; belongs in the skill, not the server |
| Draft write-back (gmailDraftId + status + outreachStatus) | API / Backend (`/draft` route) | — | Atomic DB write must go through REST per architectural invariant (CLI parity) |
| Recipient write-back (channel + recipientEmail) | API / Backend (`/recipient` route) | — | Already exists Phase 12; skill calls it as-is |
| Failure marking | API / Backend (`/status` route) | — | State-machine guard lives server-side |
| Work-queue read | API / Backend (`/emails` route) | — | Existing paginated endpoint; skill reads via REST |
| LinkedIn fallback badge render | Frontend (`email-review-card.tsx`) | — | `needsLinkedinMessage()` already drives badge; no skill work needed |
| `approved → failed` guard | API / Backend (`email-status.ts`) | — | canEmailTransition confirms this transition is illegal |

---

## Standard Stack

### Core (existing — no new packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Gmail MCP (`claude_ai_Gmail`) | Connected | Gmail draft creation and thread search | Already connected; no OAuth setup needed |
| Drizzle ORM | 0.45.1 | DB queries for D-01 route edit | Project standard; all routes use Drizzle |
| Zod v4 | 4.x | Request validation on D-01 route edit | Project invariant; all routes use Zod |
| `canEmailTransition()` | Phase 11 | State-machine guard in D-01 edit | Do not reimplement; imported from `email-status.ts` |
| jq | system | JSON payload construction in skill bash calls | Phase 16 established pattern; required for multi-line bodies |

### Supporting (skill runtime)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `curl` | system | HTTP calls to Heimdall REST endpoints | Same pattern as Phase 16 skill |
| `~/.heimdall/api-token` | file | Bearer auth for all REST calls | Established skill auth convention |

### New Packages Required

None. This phase installs no new npm packages. The skill is a markdown + bash document. The D-01 route edit uses only already-installed dependencies.

---

## Package Legitimacy Audit

No external packages are installed in this phase. The skill consumes the already-connected Gmail MCP and calls existing Heimdall REST endpoints. The D-01 route edit uses only packages already in `package-lock.json`.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
draft-outreach-emails <campaign-id>
        |
        v
[1. Preflight checks] → abort if server not running, token missing
        |
        v
[2. Read work queue] ──────────────────────────────────────────────────
   GET /api/outreach-campaigns/<id>/emails?status=approved&limit=100  |
   → paginate until meta.hasMore=false                               |
   → separate into:                                                   |
        approved, no recipientEmail → DISCOVERY queue                 |
        approved, recipientEmail set → DRAFTING queue                 |
        (status='drafted' never appears — filtered by endpoint)       |
        |
        v
[3. Confirm gate] → "N approved / M missing recipient. Proceed?"
        |
        v
[4. Discovery loop] (for each email in DISCOVERY queue)
   mcp__gmail__search_threads query="FirstName LastName"
        |
        ├── threads found → mcp__gmail__get_thread(threadId) for each
        |       → walk messages[].payload.headers (From/To/Cc)
        |       → collect participant addresses != steve@bronstein.org
        |       → match by name against contact
        |
        ├── 1 distinct address → PATCH .../recipient {channel:'email', recipientEmail}
        |       → add email to DRAFTING queue for this run
        |
        ├── 2+ distinct addresses → ambiguous → add to run-summary list, skip drafting
        |
        └── 0 addresses → PATCH .../recipient {channel:'linkedin_message'}
                → add to linkedin-fallback list
        |
        v
[5. Drafting loop] (for each email in DRAFTING queue)
   detect: gmailDraftId IS NULL → new draft
           gmailDraftId IS NOT NULL → re-draft (create fresh, repoint)
        |
        ├── mcp__gmail__create_draft { to, subject, body }
        |
        └── PATCH .../draft { gmailDraftId: <new-id> }
                → D-01 route: validates canEmailTransition(approved→drafted)
                → sets status='drafted', draftedAt, updatedAt (email)
                → sets contact.outreachStatus='reached_out', updatedAt (contact)
                → logs outreach_email_drafted timeline event
        |
        v
[6. End-of-run summary]
   drafted / skipped / discovered / ambiguous / linkedin-fallback / failed counts
   ambiguous candidate list
   failed email list
```

### Recommended Skill Project Structure

```
.claude/skills/draft-outreach-emails/
├── SKILL.md                  # Main skill document (full workflow)
└── references/
    └── heimdall-api.md       # API contract for this skill's endpoints
```

### Pattern 1: Work-Queue Read with Cursor Pagination

The `GET /api/outreach-campaigns/[id]/emails` endpoint returns a maximum of 100 rows per page (max enforced by `parseLimit`). For campaigns with more than 100 approved emails, the skill must paginate.

```bash
# Source: src/app/api/outreach-campaigns/[id]/emails/route.ts + src/lib/api/filters.ts
TOKEN=$(cat ~/.heimdall/api-token)
CAMPAIGN_ID="$ARGUMENTS"
ALL_EMAILS="[]"
CURSOR=""

while true; do
  URL="http://localhost:4000/api/outreach-campaigns/$CAMPAIGN_ID/emails?status=approved&limit=100"
  if [ -n "$CURSOR" ]; then
    URL="${URL}&cursor=${CURSOR}"
  fi
  PAGE=$(curl -s -H "Authorization: Bearer $TOKEN" "$URL")
  # check success
  SUCCESS=$(echo "$PAGE" | jq -r '.success')
  if [ "$SUCCESS" != "true" ]; then
    echo "Error: $(echo "$PAGE" | jq -r '.error')"
    exit 1
  fi
  ALL_EMAILS=$(echo "$ALL_EMAILS $PAGE" | jq -s '.[0] + .[1].data')
  HAS_MORE=$(echo "$PAGE" | jq -r '.meta.hasMore')
  if [ "$HAS_MORE" != "true" ]; then break; fi
  CURSOR=$(echo "$PAGE" | jq -r '.meta.cursor')
done
```

Each item in `data` is: `{ email: { id, status, channel, recipientEmail, gmailDraftId, generatedSubject, generatedBody, editedSubject, editedBody, contactId, ... }, contact: { id, firstName, lastName, email, outreachStatus, archivedAt, ... } | null }` [VERIFIED: src/app/api/outreach-campaigns/[id]/emails/route.ts]

### Pattern 2: D-01 Route Edit Structure

The existing `/draft` route currently does a blind UPDATE (no pre-read). The D-01 edit restructures it to match the `/status` route pattern: pre-read the email, check transition, then write both email and contact.

```typescript
// Source: src/app/api/outreach-campaigns/[id]/emails/[emailId]/draft/route.ts (after D-01 edit)
// Structural pattern from: src/app/api/outreach-campaigns/[id]/emails/[emailId]/status/route.ts

// 1. Read current email to get contactId and current status
const [email] = await db
  .select()
  .from(outreachEmails)
  .where(and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id)))
  .limit(1);
if (!email) return notFound('Email');

// 2. State-machine guard (only approved → drafted is legal)
if (!canEmailTransition(email.status, 'drafted')) {
  return validationError(`Invalid transition: ${email.status} -> drafted`);
}

// 3. Update email: gmailDraftId + status + timestamps
const [updated] = await db
  .update(outreachEmails)
  .set({
    gmailDraftId: validated.gmailDraftId,
    status: 'drafted',
    draftedAt: new Date(),
    updatedAt: new Date()
  })
  .where(and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id)))
  .returning();

// 4. Update contact outreachStatus (sequential await — consistent with existing routes)
await db
  .update(contacts)
  .set({ outreachStatus: 'reached_out', updatedAt: new Date() })
  .where(eq(contacts.id, email.contactId));

// 5. Timeline event (preserve existing eventType; add contactId)
await logTimeline({
  eventType: 'outreach_email_drafted',
  title: 'Gmail draft created',
  contactId: email.contactId,   // add this for contact timeline visibility
  metadata: { campaignId: id, emailId, gmailDraftId: validated.gmailDraftId }
});

return success(updated);
```

Import additions needed:
```typescript
import { contacts } from '../../../../../../../../drizzle/schema';
import { canEmailTransition } from '@/features/outreach/lib/email-status';
```

### Pattern 3: Gmail MCP Discovery — search_threads + get_thread

Tool names are VERIFIED (observed connected MCP surface). Parameter shapes and response structures are ASSUMED from Gmail API v1 conventions — executor must validate exact parameter names at run time.

```
// [ASSUMED: tool parameter names and response shape inferred from Gmail API v1]
// Step 1: Find threads mentioning the contact
mcp__gmail__search_threads {
  query: "Alex Chen"               // contact full name; Gmail searches From/To/Cc/Subject/body
  // optional: "Alex Chen after:2023/01/01"  // date scope if recent contact
  // maxResults: 10 (if supported)
}
// Expected response (inferred):
// { threads: [{ id: "thread-id-1", snippet: "..." }, ...] }

// Step 2: For each thread, get full message headers
mcp__gmail__get_thread {
  threadId: "thread-id-1"
  // format: "metadata" or "full" (if supported — metadata is sufficient for headers)
}
// Expected response (inferred):
// {
//   id: "thread-id-1",
//   messages: [
//     {
//       id: "msg-id",
//       payload: {
//         headers: [
//           { name: "From", value: "Alex Chen <alex@example.com>" },
//           { name: "To", value: "Steve Bronstein <steve@bronstein.org>" },
//           { name: "Cc", value: "" }
//         ]
//       }
//     }
//   ]
// }
```

**Email address parsing from headers:**
RFC 2822 `Display Name <email@domain>` format. Extract the angle-bracketed portion. When no angle brackets, the full value is the address. Strip Steve's address (`steve@bronstein.org`) from results.

```bash
# Extract email from "Display Name <email@domain>" header value
parse_email_from_header() {
  local header_value="$1"
  if echo "$header_value" | grep -q '<'; then
    echo "$header_value" | sed 's/.*<\([^>]*\)>.*/\1/' | tr '[:upper:]' '[:lower:]' | xargs
  else
    echo "$header_value" | tr '[:upper:]' '[:lower:]' | xargs
  fi
}
```

**Name matching against contact:**
Compare extracted display name (before the `<`) against `contact.firstName + ' ' + contact.lastName` using case-insensitive substring match. A participant must match to count as a direct-thread participant.

### Pattern 4: Draft Create via Gmail MCP

```
// [VERIFIED: tool name; ASSUMED: parameter shape from Gmail drafts.create API]
mcp__gmail__create_draft {
  to: "alex@example.com",
  subject: "Quick question, Alex",       // editedSubject ?? generatedSubject
  body: "Hey Alex,\n\nHope things..."    // editedBody ?? generatedBody
}
// Expected response (inferred):
// { id: "r<draft-id>", message: { id: "msg-id", threadId: "..." } }
// The skill uses the top-level `id` as gmailDraftId
```

### Pattern 5: Idempotency Logic

```bash
# Determine re-draft vs new draft from the work-queue item
EMAIL_STATUS=$(echo "$EMAIL_ITEM" | jq -r '.email.status')          # always 'approved' (filtered)
GMAIL_DRAFT_ID=$(echo "$EMAIL_ITEM" | jq -r '.email.gmailDraftId')  # null or existing ID

if [ "$GMAIL_DRAFT_ID" = "null" ] || [ -z "$GMAIL_DRAFT_ID" ]; then
  # Never drafted — create new
  DRAFT_ACTION="new"
else
  # Was drafted, then edited → returned to approved with stale gmailDraftId
  # Re-draft: create fresh draft, repoint. Old draft left harmless in Gmail.
  DRAFT_ACTION="redraft"
fi
# In both cases: call create_draft, then PATCH .../draft with the new ID
```

### Anti-Patterns to Avoid

- **Calling PATCH .../status { status: 'failed' } on an approved email:** `approved → failed` is NOT a legal transition (`email-status.ts`). The route returns 400. Leave approved emails in their current state on failure; report in summary only.
- **Searching by email domain + name pair:** D-03 explicitly excludes domain/name-only inference. Only confirmed direct thread participants are accepted.
- **Fetching per-email contact data mid-loop:** All contact data is in the work-queue response (via the contacts LEFT JOIN). Do not make per-email `GET /api/contacts/[id]` calls.
- **Assuming `list_drafts` confirms skippability:** Skip logic is derived purely from `email.status` in the work queue. An email with `status='drafted'` never appears in the approved queue — it is already skipped before the loop starts.
- **Using `update_label` for draft management:** There is no draft-update tool. `update_label` is for Gmail label management, unrelated to draft content.
- **Making the contact UPDATE transactional:** No existing routes use Drizzle transactions with the Neon HTTP driver. Use sequential awaits consistent with established patterns. The email is updated first; if the contact update fails, the email is already drafted and the failure is caught by the outer try/catch.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| State-machine validation | Custom transition logic in route | `canEmailTransition()` from `email-status.ts` | Already tested; inconsistency causes silent bugs |
| Email address parsing from RFC 2822 | Custom regex | Simple sed/jq for angle-bracket extraction; Gmail headers are well-formed | Over-engineering for a small, consistent input |
| Email → name matching | Fuzzy scorer | Case-insensitive substring match on display name | The strict D-03 accept rule favors precision over recall; fuzzy scoring adds false positives |
| LinkedIn badge | New badge component | `needsLinkedinMessage()` + existing `email-review-card.tsx` | Already shipped Phase 15; setting `channel='linkedin_message'` triggers it automatically |
| Draft de-duplication check via `list_drafts` | MCP call to verify draft still exists | State-machine signal: `approved + stale gmailDraftId` → re-draft | The state machine already encodes the right signal; extra MCP call adds latency |

---

## Common Pitfalls

### Pitfall 1: approved → failed transition attempt

**What goes wrong:** The skill calls `PATCH .../status { status: 'failed' }` when a draft-create MCP call fails for an approved email. The server returns `400 { error: "Invalid transition: approved -> failed" }`. The skill may misinterpret this as a fatal error and abort the run.

**Why it happens:** `failed` is only reachable from `pending`, `generated`, `edited` — not from `approved` (reviewed `email-status.ts` line 5: `approved: ['drafted', 'edited']`).

**How to avoid:** The skill must NOT call the `/status` endpoint for per-email failures on `approved` emails. Instead: catch the draft failure, add the email to the failed list in memory, report in the run summary, and continue to the next email. No status change.

**Warning signs:** Any `400 Invalid transition: approved -> failed` in skill output.

---

### Pitfall 2: Work-queue includes emails with no final content

**What goes wrong:** An approved email may have been approved before the generation skill ran (edge case), leaving `generatedSubject`/`generatedBody` both null. Calling `create_draft` with an empty body creates an empty draft.

**Why it happens:** The schema allows null on content columns. The approve route in `/status` guards against this (line 48-53: checks `subject` and `emailBody` are non-null), so this should not occur in practice. But defensive coding is warranted.

**How to avoid:** Before calling `create_draft`, resolve final content: `editedSubject ?? generatedSubject` and `editedBody ?? generatedBody`. If both are null, skip this email and report in summary (same pattern as the archived-contact edge case).

**Warning signs:** `create_draft` call with empty subject or body.

---

### Pitfall 3: search_threads finds threads where the contact is NOT a participant

**What goes wrong:** A Gmail query for `"Alex Chen"` may match threads where the name appears in the body text (e.g., forwarded emails, newsletters mentioning the person), not actual communications WITH Alex Chen.

**Why it happens:** Gmail full-text search searches body content, not just headers.

**How to avoid:** After `get_thread`, filter to messages where the parsed `From` or `To` or `Cc` header contains a display name that case-insensitively matches the contact's first and last name. Do not accept addresses from threads where the contact name only appears in the body.

**Warning signs:** Accepting an address from a thread where the From/To headers do not contain the contact's name.

---

### Pitfall 4: Multiple threads with the same contact yielding the same address counted as distinct

**What goes wrong:** The skill collects one address from thread A and the same address from thread B and counts them as "2 distinct addresses" → triggers the ambiguous path.

**Why it happens:** Deduplication step omitted.

**How to avoid:** After collecting all participant addresses across all threads for a contact, deduplicate by normalized (lowercased) email address before applying the accept rule. One vs. many distinct addresses is evaluated on the deduplicated set.

---

### Pitfall 5: D-01 route edit missing the contacts import

**What goes wrong:** The D-01 edit adds a `db.update(contacts)` call but the existing `/draft/route.ts` does not import `contacts` from the schema barrel. TypeScript will error; Next.js will fail to compile.

**Why it happens:** The current route (`/draft/route.ts`) only imports `outreachEmails`. The D-01 edit requires both `outreachEmails` and `contacts`, plus `canEmailTransition`.

**How to avoid:** Add both imports at the top of the file:
```typescript
import { outreachEmails, contacts } from '../../../../../../../../drizzle/schema';
import { canEmailTransition } from '@/features/outreach/lib/email-status';
```

---

### Pitfall 6: Pagination silently truncating the work queue

**What goes wrong:** The skill calls `GET .../emails?status=approved` without `&limit=100` and without paginating. With the default limit of 20, a campaign with 25+ approved emails silently processes only the first 20.

**Why it happens:** `parseLimit` defaults to 20; `meta.hasMore` is true but the skill does not loop.

**How to avoid:** Always pass `?limit=100` and loop until `meta.hasMore = false`, threading the cursor between requests.

---

## Code Examples

### Final Content Resolution (from review-helpers.ts)

```typescript
// Source: src/features/outreach/lib/review-helpers.ts — finalSubject/finalBody
// editedX takes precedence over generatedX; this is the canonical content the human approved
const finalSubject = email.editedSubject ?? email.generatedSubject;
const finalBody    = email.editedBody   ?? email.generatedBody;
```

The skill must use this same precedence when building the draft subject and body.

### Full D-01 Route Edit — Complete File After Edit

```typescript
// Source: src/app/api/outreach-campaigns/[id]/emails/[emailId]/draft/route.ts (after D-01)
import { db } from '@/lib/db';
import { outreachEmails, contacts } from '../../../../../../../../drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { canEmailTransition } from '@/features/outreach/lib/email-status';
import { z } from 'zod';

const draftWriteBackSchema = z.object({
  gmailDraftId: z.string().min(1)
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  try {
    const { id, emailId } = await params;
    const body = await request.json();
    const validated = draftWriteBackSchema.parse(body);

    // D-01: Read first to get current status and contactId for transition check
    const [email] = await db
      .select()
      .from(outreachEmails)
      .where(and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id)))
      .limit(1);

    if (!email) return notFound('Email');

    // D-01: State-machine guard — only approved → drafted is legal
    if (!canEmailTransition(email.status, 'drafted')) {
      return validationError(`Invalid transition: ${email.status} -> drafted`);
    }

    // D-01: Update email — gmailDraftId + status transition + timestamps
    const [updated] = await db
      .update(outreachEmails)
      .set({
        gmailDraftId: validated.gmailDraftId,
        status: 'drafted',
        draftedAt: new Date(),
        updatedAt: new Date()
      })
      .where(and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id)))
      .returning();

    // D-01 / DRFT-05: Update contact outreachStatus → reached_out
    await db
      .update(contacts)
      .set({ outreachStatus: 'reached_out', updatedAt: new Date() })
      .where(eq(contacts.id, email.contactId));

    // Preserve existing timeline event type; add contactId for contact timeline
    await logTimeline({
      eventType: 'outreach_email_drafted',
      title: 'Gmail draft created',
      contactId: email.contactId,
      metadata: {
        campaignId: id,
        emailId,
        gmailDraftId: validated.gmailDraftId
      }
    });

    return success(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}
```

### Work-Queue Response Shape (confirmed from route source)

```json
{
  "success": true,
  "data": [
    {
      "email": {
        "id": "uuid",
        "campaignId": "uuid",
        "contactId": "uuid",
        "channel": "email",
        "recipientEmail": null,
        "generatedSubject": "Quick question, Alex",
        "generatedBody": "Hey Alex,\n\n...",
        "editedSubject": null,
        "editedBody": null,
        "status": "approved",
        "gmailDraftId": null,
        "lastError": null,
        "lastErrorAt": null,
        "generatedAt": "2026-06-22T...",
        "approvedAt": "2026-06-22T...",
        "draftedAt": null,
        "createdAt": "...",
        "updatedAt": "..."
      },
      "contact": {
        "id": "uuid",
        "firstName": "Alex",
        "lastName": "Chen",
        "email": null,
        "outreachStatus": "not_reached_out",
        "archivedAt": null,
        "linkedinUrl": "...",
        "title": "...",
        "currentCompany": "..."
      }
    }
  ],
  "meta": {
    "cursor": "2026-06-22T...",
    "hasMore": false
  }
}
```

Source: `src/app/api/outreach-campaigns/[id]/emails/route.ts` — the `db.select({ email: outreachEmails, contact: contacts })` with `leftJoin` returns all columns from both tables.

### State Machine (complete, from source)

```typescript
// Source: src/features/outreach/lib/email-status.ts
const validEmailTransitions: Record<string, string[]> = {
  pending:  ['generated', 'failed'],
  generated: ['edited', 'approved', 'failed', 'pending'],  // pending = regenerate
  edited:   ['approved', 'pending'],                        // pending = regenerate
  approved: ['drafted', 'edited'],                          // edited = un-approve
  drafted:  ['edited'],                                     // revise after draft
  failed:   ['pending']                                     // retry
};

// NOTE: approved → failed is NOT in the map.
// The skill must NOT attempt this transition for per-email draft failures.
```

---

## State of the Art

| Old Approach (ARCHITECTURE.md sketch) | Current Approach (locked decisions) | Notes |
|---|---|---|
| Google People API + raw Gmail REST + OAuth `gmail.readonly` setup | Gmail MCP (`claude_ai_Gmail`) already connected | ARCHITECTURE.md §"Skill 2: Step 8" describes OAuth flow — fully superseded |
| `--discover-only` / `--draft-only` split modes | Batch-only, discover-then-draft in one run | D-05 dropped split modes for simplicity |
| In-place draft update (update_draft if available) | Recreate-and-repoint (create_draft + repoint gmailDraftId) | D-02: no update_draft tool on connected MCP |
| `approved → failed` status transition for draft errors | Leave `approved`, report in summary | State machine does not allow this transition |

**Deprecated/outdated:**
- `ARCHITECTURE.md` §"Skill 2: draft-outreach-emails": the OAuth setup, split-mode flags, and `update_draft` assumption are all superseded by the decisions in CONTEXT.md. Read that section only for structural context (route list, data flow), not for the OAuth or mode details.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `mcp__gmail__search_threads` accepts a `query` parameter using Gmail search syntax (e.g., `"Alex Chen"`) | D-03 / Code Examples | If the parameter is named differently (e.g., `q`, `searchQuery`), the skill invocation fails silently or errors. Executor must call the tool with `help` or a test query first. |
| A2 | `mcp__gmail__search_threads` response contains a `threads` array with `{ id, snippet }` objects (Gmail API v1 shape) | D-03 / Code Examples | If the MCP wrapper returns a different shape (e.g., flat array of IDs, or `threadIds`), the thread-ID extraction step breaks. |
| A3 | `mcp__gmail__get_thread` accepts a `threadId` parameter and returns a `messages` array, each with `payload.headers` array of `{name, value}` pairs | D-03 / Code Examples | If headers are returned at a different path (e.g., `headers` at the message root, or `fields`), header extraction breaks. |
| A4 | `mcp__gmail__create_draft` accepts `to`, `subject`, `body` parameters and returns an object with `id` as the draft ID | Drafting pattern | If the parameter names differ (e.g., `recipient`, `text`) or the response key is `draftId` vs `id`, the skill call and write-back both fail. |
| A5 | `logTimeline` in `src/lib/db/timeline.ts` accepts an optional `contactId` field (used in the D-01 route edit) | Code Examples | If `contactId` is not an accepted field on the `logTimeline` function signature, TypeScript will error. Planner should check `src/lib/db/timeline.ts` signature before prescribing this. |

**If A5 is wrong:** Omit `contactId` from the `logTimeline` call in D-01 — the existing behavior (no contactId on the event) is acceptable. The timeline event still logs correctly.

---

## Open Questions (RESOLVED)

1. **`logTimeline` contactId field support** — **RESOLVED: supported.**
   - What we know: the existing `/draft` route calls `logTimeline` without `contactId`. The function signature in `src/lib/db/timeline.ts` was not read in the research session.
   - Resolution: confirmed `TRUE` during pattern mapping — `contactId` is an accepted optional field on `logTimeline` (PATTERNS.md §"Key Confirmed Facts"; carried into `17-01-PLAN.md` interfaces block). The D-01 route edit includes `contactId: email.contactId` in the `logTimeline` call.

2. **`mcp__gmail__search_threads` pagination** — **RESOLVED: run-time validation, cap at 20 threads.**
   - What we know: the Gmail Threads.list API supports `maxResults` and `nextPageToken`. The MCP wrapper may or may not expose pagination.
   - Resolution: ASSUMED-at-runtime — the skill caps at the first 20 threads (Gmail search returns most-recent first); for VP-level outreach 20 threads per contact is more than sufficient to find a direct address. The executor validates the wrapper's pagination behavior against a known contact at run time. Non-blocking: the accept rule (single direct participant) is unaffected by whether older threads are truncated.

3. **Draft ID format from `create_draft`** — **RESOLVED: run-time validation.**
   - What we know: Gmail draft IDs typically start with `r` followed by a numeric string (e.g., `r12345678`). The existing `gmailDraftId` column is `text`, unbounded.
   - Resolution: ASSUMED-at-runtime — the executor reads the actual `create_draft` response shape and extracts the draft id (top-level `id` or nested) at run time; the unbounded `text` column accepts any format. Non-blocking.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Gmail MCP (`claude_ai_Gmail`) | Discovery + drafting | Yes (interactively connected) | Current session | None — skill is owner-run interactively only |
| Heimdall dev server on port 4000 | All REST write-backs | Must be running | — | Check `npm run dev` before skill invocation |
| `~/.heimdall/api-token` (chmod 600) | Bearer auth for all REST calls | Assumed present (Phase 16 same requirement) | — | `npm run token:generate` |
| `jq` | JSON payload construction in curl calls | Assumed present (same as Phase 16) | — | `brew install jq` |
| `curl` | HTTP calls to REST endpoints | Yes (macOS system) | — | — |

**Missing dependencies with no fallback:**
- Gmail MCP: skill cannot run in headless/cron environments (per INTEGRATIONS.md note on interactively-authenticated MCP servers). This is acknowledged and acceptable — the skill is explicitly owner-run interactively.

**Missing dependencies with fallback:**
- None beyond the interactivity requirement.

---

## Validation Architecture

`nyquist_validation` is enabled in `.planning/config.json`. However, this project has no test framework installed (confirmed: "Not configured; no jest.config.*, vitest.config.*, or test files detected" in CLAUDE.md).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None installed |
| Config file | None |
| Quick run command | Manual smoke test (see below) |
| Full suite command | Manual smoke test |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DRFT-01 | Skill creates Gmail draft per approved email | Manual smoke | Run skill against test campaign with 1 approved email; verify draft appears in Gmail | ❌ manual only |
| DRFT-02 | Skill never sends | Manual code review | `grep -r "send" .claude/skills/draft-outreach-emails/` → assert zero results | ❌ manual only |
| DRFT-03 | Idempotent re-run | Manual smoke | Run skill twice; verify no duplicate draft in Gmail | ❌ manual only |
| DRFT-04 | gmailDraftId stored, email marked drafted, timeline logged | Manual API check | `GET /api/outreach-campaigns/[id]/emails?status=drafted` after run | ❌ manual only |
| DRFT-05 | Contact outreachStatus = reached_out | Manual API check | `GET /api/contacts/[id]` after run; check `outreachStatus` field | ❌ manual only |
| DISC-01 | Discovery finds direct-thread email | Manual smoke | Run against a contact with no stored email but known Gmail thread | ❌ manual only |
| DISC-02 | Ambiguous candidates in summary, not auto-selected | Manual smoke | Run against a contact with 2+ known addresses in Gmail | ❌ manual only |
| DISC-03 | LinkedIn fallback set, badge appears | Manual UI check | Run against contact with no Gmail threads; check review UI badge | ❌ manual only |
| D-01 route edit | canEmailTransition guard returns 400 on invalid pre-state | Unit-style curl test | `curl -X PATCH .../draft -d '{"gmailDraftId":"test"}' on a pending email → expect 400` | ❌ Wave 0 |

### Sampling Rate

- Per task commit: manual curl test for the D-01 route edit (PATCH against a pending email → confirm 400)
- Per wave merge: full manual smoke run against a real campaign in dev
- Phase gate: all 8 requirements verified manually before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] Manual curl test script for D-01 route edit — covers the state-machine guard without a full skill run
- [ ] Grep check: `grep -r "send" .claude/skills/draft-outreach-emails/` — covers DRFT-02

*(No test framework installation needed — manual smoke tests are appropriate for a skill document + a single route edit.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | Bearer token (`API_TOKEN_HASH` SHA-256 compare in `src/proxy.ts`) — already implemented |
| V3 Session Management | No | Skill is stateless CLI; no session |
| V4 Access Control | Yes | Single-user lock (`SINGLE_USER_EMAIL=steve@bronstein.org`) in middleware — already implemented |
| V5 Input Validation | Yes | Zod schema on D-01 route edit (`gmailDraftId: z.string().min(1)`) — existing + preserved |
| V6 Cryptography | No | No new crypto; bearer token pattern unchanged |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Skill accidentally calls a send-family Gmail tool | Tampering / Elevation | Allowlist in SKILL.md frontmatter; mandatory grep checklist before real run; no send tool on connected MCP |
| Discovery accepts a wrong email address (false positive) | Information Disclosure | Strict D-03 accept rule: only direct thread participants; single-address requirement |
| Draft created to wrong recipient (stale recipientEmail) | Tampering | Skill reads `recipientEmail` from the work queue at run time; contact validation (check `archivedAt`) before drafting |
| Bearer token leaked in skill output | Information Disclosure | `$(cat ~/.heimdall/api-token)` inline in every curl call — token never appears in output or history (Phase 16 established pattern) |

---

## Sources

### Primary (HIGH confidence)

- `src/features/outreach/lib/email-status.ts` — complete state machine; `approved → failed` confirmed illegal; `approved → drafted` confirmed legal
- `src/app/api/outreach-campaigns/[id]/emails/[emailId]/draft/route.ts` — current route (missing status + contact update); D-01 gap confirmed
- `src/app/api/outreach-campaigns/[id]/emails/route.ts` — work-queue endpoint; JOIN with contacts confirmed; cursor pagination confirmed; `?status=` filter confirmed; default limit 20, max 100
- `src/app/api/outreach-campaigns/[id]/emails/[emailId]/status/route.ts` — structural template for D-01 edit; pattern for pre-read + canEmailTransition + update
- `src/app/api/outreach-campaigns/[id]/emails/[emailId]/recipient/route.ts` — `linkedin_message` channel forces `recipientEmail=null`; used as-is (no edit needed)
- `drizzle/schema/outreach-emails.ts` — confirmed: no `candidates` column; `gmailDraftId text` nullable; `status` enum; `draftedAt` timestamp
- `drizzle/schema/contacts.ts` — confirmed: `outreachStatus` (`outreachStatusEnum`); `email` text nullable; `archivedAt` timestamp
- `drizzle/schema/enums.ts` — confirmed: `outreachStatusEnum` values include `reached_out`; `outreachEmailStatusEnum` values include `approved`, `drafted`, `failed`
- `src/features/outreach/lib/review-helpers.ts` — `needsLinkedinMessage()` confirmed; `finalSubject`/`finalBody` precedence confirmed
- `.planning/phases/17-gmail-drafting-and-email-discovery-skill/17-CONTEXT.md` — GROUND TRUTH Gmail MCP tool surface; all locked decisions
- `.claude/skills/generate-outreach-emails/SKILL.md` + `references/heimdall-api.md` — structural template for the new skill

### Secondary (MEDIUM confidence)

- Gmail API v1 documentation (training knowledge): thread response shape (`messages[].payload.headers`), address format (`Display Name <email@domain>`), search query syntax — used to infer MCP wrapper conventions
- `.planning/research/ARCHITECTURE.md` — the original skill sketch; consulted for stale context; corrections noted in CONTEXT.md

### Tertiary (LOW confidence / ASSUMED)

- `mcp__gmail__search_threads` parameter names and response shape — inferred from Gmail API v1 `threads.list`; not validated by direct tool invocation in this session. Tagged [ASSUMED] throughout.
- `mcp__gmail__get_thread` parameter names and response shape — inferred from Gmail API v1 `threads.get`; not validated. Tagged [ASSUMED].
- `mcp__gmail__create_draft` parameter names and response shape — inferred from Gmail API v1 `drafts.create`; not validated. Tagged [ASSUMED].

---

## Metadata

**Confidence breakdown:**

- D-01 route gap and fix: HIGH — read both the current route and the status route template directly
- State machine (`approved → failed` illegal): HIGH — read `email-status.ts` directly
- Work-queue endpoint fields: HIGH — read route source directly
- Gmail MCP tool surface (tool names): HIGH — CONTEXT.md ground truth
- Gmail MCP parameter/response shapes: LOW — inferred from Gmail API conventions; must be validated at execution time
- `canEmailTransition` guard behavior: HIGH — read state machine directly
- `needsLinkedinMessage` / review badge: HIGH — read review-helpers.ts and email-review-card.tsx

**Research date:** 2026-06-22
**Valid until:** 2026-07-22 (stable codebase; only risk is Gmail MCP version changes)
