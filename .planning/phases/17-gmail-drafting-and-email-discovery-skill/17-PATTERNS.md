# Phase 17: Gmail Drafting and Email Discovery Skill - Pattern Map

**Mapped:** 2026-06-22
**Files analyzed:** 3 (2 new, 1 modified)
**Analogs found:** 3 / 3

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `.claude/skills/draft-outreach-emails/SKILL.md` | skill/workflow-doc | batch (queue→act→write-back) | `.claude/skills/generate-outreach-emails/SKILL.md` | exact |
| `.claude/skills/draft-outreach-emails/references/heimdall-api.md` | reference/doc | request-response (REST contract) | `.claude/skills/generate-outreach-emails/references/heimdall-api.md` | exact |
| `src/app/api/outreach-campaigns/[id]/emails/[emailId]/draft/route.ts` | API route | request-response (PATCH, two-table write) | `src/app/api/outreach-campaigns/[id]/emails/[emailId]/status/route.ts` | exact (same pre-read + canEmailTransition + update shape) |

---

## Pattern Assignments

### `.claude/skills/draft-outreach-emails/SKILL.md` (skill/workflow-doc, batch)

**Analog:** `.claude/skills/generate-outreach-emails/SKILL.md`

**Frontmatter pattern** (lines 1-11):
```yaml
---
name: generate-outreach-emails
description: >
  Drain a campaign's pending outreach emails, author a personalized subject+body per contact in
  Steve's voice (conversational, closeness-calibrated, LLM-tell-clean, anti-hallucination), and
  write each result back via REST. Batch-only: the only argument is a campaign id.
argument-hint: '<campaign-id>'
allowed-tools:
  - Read
  - Bash
---
```
Copy this shape for `draft-outreach-emails`. Key differences:
- `name: draft-outreach-emails`
- `description`: discover missing recipient addresses via Gmail MCP, create Gmail drafts for approved emails, write back via REST. Discover-then-draft in one batch run.
- `allowed-tools`: add Gmail MCP tools — `mcp__gmail__search_threads`, `mcp__gmail__get_thread`, `mcp__gmail__create_draft`, `mcp__gmail__list_drafts`. Keep `Read` and `Bash`.

**Setup section pattern** (lines 38-56 of sibling SKILL.md):
```markdown
## Setup

Verify all prerequisites before proceeding. Surface the gap and stop if any are missing -- do
NOT attempt to fix automatically.

- `~/.heimdall/api-token` exists (chmod 600; created by `npm run token:generate`).
- `.env.local` has `API_TOKEN_HASH=<sha256 of the token>` and
  `SINGLE_USER_EMAIL=steve@bronstein.org`.
- Heimdall dev server running on `http://localhost:4000` (`npm run dev`).
- `jq` available on `PATH` (used to safely build JSON write-back payloads).

```bash
# Verify jq is installed (required for correct JSON escaping of multi-line bodies)
command -v jq >/dev/null && echo "jq found" || echo "MISSING: jq (brew install jq)"

# Verify token file exists
[ -f ~/.heimdall/api-token ] && echo "token found" || echo "MISSING: ~/.heimdall/api-token"

# Verify env vars
grep -q 'API_TOKEN_HASH' .env.local && echo "API_TOKEN_HASH set" || echo "MISSING: API_TOKEN_HASH in .env.local"
grep -q 'SINGLE_USER_EMAIL' .env.local && echo "SINGLE_USER_EMAIL set" || echo "MISSING: SINGLE_USER_EMAIL in .env.local"
```
```
Copy verbatim into the draft-outreach-emails setup section, then add a Gmail-MCP check:
```bash
# Verify Gmail MCP tools are available (requires interactive Claude Code session)
# If search_threads / create_draft are not in scope, the skill cannot run.
# Run a test call or confirm via /mcp list before proceeding.
```

**Confirm gate pattern** (lines 97-107 of sibling SKILL.md):
```markdown
## Step 2: Confirm count (D-03)

Count the emails in `data.emails`. Report to the owner:

```
N pending emails found for campaign <id>.
Proceed? (yes / no)
```

Wait for explicit confirmation before proceeding. If `N = 0`, report "No pending emails -- run
complete." and exit cleanly.
```
Mirror this as D-05's confirm gate — but report `N approved / M missing recipient` as two numbers, per the decision:
```
N approved emails found for campaign <id>.
M are missing a recipient address (will attempt discovery).
Proceed with discover-then-draft? (yes / no)
```

**Failure handling pattern — mark-failed-and-continue** (lines 280-299 of sibling SKILL.md):
```bash
# Escape lastError via jq for the same reason -- error strings routinely
# contain quotes, newlines, and shell metacharacters that break raw -d JSON.
PAYLOAD=$(jq -n --arg err "$LAST_ERROR" \
  '{status: "failed", lastError: $err}')
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" \
  "http://localhost:4000/api/outreach-campaigns/$CAMPAIGN_ID/emails/$EMAIL_ID/status"
```
**CRITICAL DIFFERENCE for Phase 17:** `approved → failed` is NOT a legal transition (confirmed in `email-status.ts` line 5: `approved: ['drafted', 'edited']`). The sibling skill's Step 4e calls `/status { status: 'failed' }` for non-approved emails only. For Phase 17, approved emails that fail to draft must NOT call `/status` — leave them `approved`, add to the failed list, and report in the end-of-run summary. Only call `/status { status: 'failed' }` for emails not in `approved` state (edge case, if any).

**End-of-run summary pattern** (lines 325-345 of sibling SKILL.md):
```markdown
## Step 5: End-of-run summary

After all emails are processed (sample + drain), print:

```
--- Run complete ---
Campaign: <campaign-id>

Generated:   N
Failed:      M
Low-context: K (generated, but flagged for review)

Low-context contacts:
  - <firstName> <lastName> (<emailId>)
  ...

Failed emails:
  - <firstName> <lastName> (<emailId>): <lastError first 100 chars>
  ...
```
```
Mirror this as the Phase 17 summary with different counters:
```
--- Run complete ---
Campaign: <campaign-id>

Drafted:          N
Skipped (already drafted): M
Discovered:       K
Ambiguous:        J  (listed below — resolve manually then re-run)
LinkedIn fallback: L
Failed:           F

Ambiguous contacts (2+ candidate addresses — recipientEmail left unset):
  - <firstName> <lastName> (<emailId>): <addr1>, <addr2>, ...

Failed emails (left as 'approved'):
  - <firstName> <lastName> (<emailId>): <error first 100 chars>
```

**Constraints section pattern** (lines 350-368 of sibling SKILL.md):
```markdown
## Constraints

- **REST-only.** Never touch the database directly. Every read and every write goes through
  the REST API at `http://localhost:4000`. This is the architectural invariant that ensures
  CLI parity.
- **Never log the bearer token.** Use `$(cat ~/.heimdall/api-token)` inline in every curl
  call so the resolved token value never appears in shell history or run output.
```
Copy and extend with the Phase 17 send-safety allowlist (D-06):
```markdown
- **Gmail tool allowlist (D-06).** This skill may ONLY call these Gmail MCP tools:
  `mcp__gmail__search_threads`, `mcp__gmail__get_thread`, `mcp__gmail__create_draft`,
  `mcp__gmail__list_drafts`. It NEVER calls any send, trash, import, or modify tool.
- **Pre-run grep gate (D-06).** Before any real campaign run, run:
  `grep -r "send" .claude/skills/draft-outreach-emails/` and confirm zero send-family results.
- **Never sends. Only creates drafts.** Hard invariant.
- **Batch-only (D-05).** The only argument is `<campaign-id>`. No `--discover-only` / `--draft-only` flags.
- **No database columns for transient state (D-04).** Ambiguous candidates live in the run summary only; no `candidates` column.
```

**Section structure to mirror** (from sibling SKILL.md):
```
## Overview
## Setup
## Step 1: Read the queue (with pagination loop)
## Step 2: Confirm count (D-05 gate)
## Step 3: Discovery loop (DISC-01 / D-03 / D-04 / D-04b)
## Step 4: Drafting loop (DRFT-01 / D-02 idempotency)
## Step 5: End-of-run summary
## Constraints
```

---

### `.claude/skills/draft-outreach-emails/references/heimdall-api.md` (reference/doc, request-response)

**Analog:** `.claude/skills/generate-outreach-emails/references/heimdall-api.md`

**Auth section pattern** (lines 1-34 of sibling reference):
```markdown
## Auth

Every request needs the `Authorization: Bearer <token>` header. The token is
the plaintext content of `~/.heimdall/api-token` (chmod 600, written by
`npm run token:generate`).

```bash
TOKEN=$(cat ~/.heimdall/api-token)
curl -H "Authorization: Bearer $TOKEN" ...
```

The Heimdall middleware (`src/proxy.ts`) accepts the bearer header **only when
both** of these hold:

- `SHA-256(<bearer token>) === process.env.API_TOKEN_HASH`, AND
- `process.env.SINGLE_USER_EMAIL === 'steve@bronstein.org'` (multi-tenant
  safety gate -- keeps the single-user assumption explicit at the auth layer).

Never log the resolved token. Use `$(cat ~/.heimdall/api-token)` inline so the
plaintext value stays out of shell history.
```
Copy verbatim — auth mechanics are identical.

**Response envelope pattern** (lines 36-66 of sibling reference):
```markdown
## Response Envelope

Every Heimdall route returns:

```json
{ "success": true, "data": { ... }, "meta": { ... } }
```

or

```json
{ "success": false, "error": "human-readable message" }
```

Status codes:

| Code | Meaning |
|------|---------|
| 200  | OK (GET, PATCH, successful write) |
| 400  | Validation failure / state-machine rejection (Zod error or invalid transition) |
| 401  | Auth missing or invalid (handled by middleware) |
| 404  | Entity not found |
| 500  | Server error |
```
Copy verbatim.

**Endpoint documentation pattern** (lines 73-220 of sibling reference):
```markdown
### 1. `GET /api/outreach-campaigns/[id]/generation-context`

**Used by:** every run -- called ONCE at the start, before any email is authored.
...

**Curl:**

```bash
TOKEN=$(cat ~/.heimdall/api-token)
CAMPAIGN_ID="your-campaign-uuid"
curl -s \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/outreach-campaigns/$CAMPAIGN_ID/generation-context"
```
```
Mirror this structure for Phase 17's four endpoints:
1. `GET /api/outreach-campaigns/[id]/emails?status=approved&limit=100` (work-queue read with cursor pagination)
2. `PATCH /api/outreach-campaigns/[id]/emails/[emailId]/recipient` (discovery write-back — channel + recipientEmail)
3. `PATCH /api/outreach-campaigns/[id]/emails/[emailId]/draft` (draft write-back — gmailDraftId, triggers D-01 status + contact update)
4. `PATCH /api/outreach-campaigns/[id]/emails/[emailId]/status` (failure path only — NOT for approved emails per state machine)

**Error handling table pattern** (lines 224-234 of sibling reference):
```markdown
## Error Envelopes the Skill Must Handle

| Status | Envelope | Skill action |
|--------|----------|--------------|
| 400 | `{ "success": false, "error": "Invalid transition: <from> -> <to>" }` | State-machine guard; log and continue to next email |
| 400 | `{ "success": false, "error": "<Zod field>: <reason>" }` | Bug in skill payload; surface and exit |
| 401 | `{ "success": false, "error": "Unauthorized" }` | Token / env misconfig; surface and exit |
| 404 | `{ "success": false, "error": "Campaign not found" }` | Campaign ID invalid; surface and exit |
| 404 | `{ "success": false, "error": "Email not found" }` | Email ID mismatch; log and continue |
| 500 | `{ "success": false, "error": "<message>" }` | Server-side bug; surface and exit |
```
Copy this table; adjust the state-machine row to note that `approved → drafted` is legal and `approved → failed` is NOT.

**Section structure to mirror**:
```
## Auth
## Response Envelope
## Endpoints
  ### 1. GET .../emails?status=approved (work queue)
  ### 2. PATCH .../recipient (discovery write-back)
  ### 3. PATCH .../draft (draft write-back — D-01)
  ### 4. PATCH .../status (failure path — non-approved emails only)
## Error Envelopes the Skill Must Handle
## Run Protocol (summary)
```

---

### `src/app/api/outreach-campaigns/[id]/emails/[emailId]/draft/route.ts` (API route, request-response)

**Analog:** `src/app/api/outreach-campaigns/[id]/emails/[emailId]/status/route.ts`

**Current state of the file being modified** (`/draft/route.ts`, lines 1-53):
```typescript
import { db } from '@/lib/db';
import { outreachEmails } from '../../../../../../../../drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
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

    const [email] = await db
      .update(outreachEmails)
      .set({
        gmailDraftId: validated.gmailDraftId,
        draftedAt: new Date(),
        updatedAt: new Date()
      })
      .where(
        and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id))
      )
      .returning();

    if (!email) return notFound('Email');

    await logTimeline({
      eventType: 'outreach_email_drafted',
      title: 'Gmail draft created',
      metadata: {
        campaignId: id,
        emailId,
        gmailDraftId: validated.gmailDraftId
      }
    });

    return success(email);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}
```
**Gap identified:** blind UPDATE (no pre-read), no `canEmailTransition` guard, `status` not set to `'drafted'`, no contact `outreachStatus` update, `notFound` check comes after `.returning()` (post-update, not pre-read). All four items must be added per D-01.

**Import pattern for D-01 edit** — copy from analog (`/status/route.ts`, lines 1-12):
```typescript
import { db } from '@/lib/db';
import {
  outreachEmails,
  contacts
} from '../../../../../../../../drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { canEmailTransition } from '@/features/outreach/lib/email-status';
import { z } from 'zod';
```
Add `contacts` to the schema import and add `canEmailTransition` import. The existing `/draft/route.ts` imports neither — both are required by D-01. (`outreachEmailStatusValues` from domain/types is NOT needed since the Zod schema for `/draft` does not accept a status field — status is hardcoded to `'drafted'` in the route.)

**Pre-read + canEmailTransition guard pattern** — copy from analog (`/status/route.ts`, lines 30-45):
```typescript
// CD-06: verify email belongs to campaign
const [email] = await db
  .select()
  .from(outreachEmails)
  .where(
    and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id))
  )
  .limit(1);

if (!email) return notFound('Email');

// State machine guard — canEmailTransition from email-status.ts
if (!canEmailTransition(email.status, newStatus)) {
  return validationError(
    `Invalid transition: ${email.status} -> ${newStatus}`
  );
}
```
In `/draft/route.ts` after D-01, `newStatus` is hardcoded `'drafted'` — substitute directly:
```typescript
if (!canEmailTransition(email.status, 'drafted')) {
  return validationError(`Invalid transition: ${email.status} -> drafted`);
}
```

**Two-table update pattern** — the `/status/route.ts` analog updates only `outreachEmails`. The contacts update is new for D-01. Pattern for sequential awaits (established by existing routes per RESEARCH.md anti-patterns note):
```typescript
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
```
Note: `email.contactId` comes from the pre-read, not from the request body. `updatedAt: new Date()` must be set on BOTH update calls — Drizzle does not auto-update timestamps.

**logTimeline call pattern** — confirmed from `src/lib/db/timeline.ts` (lines 1-22), `contactId` IS a supported optional field:
```typescript
type TimelineInput = {
  eventType: string;
  title: string;
  description?: string;
  companyId?: string;
  contactId?: string;   // ← confirmed optional field — A5 assumption resolved TRUE
  applicationId?: string;
  interactionId?: string;
  taskId?: string;
  noteId?: string;
  metadata?: Record<string, unknown>;
};
```
The D-01 `logTimeline` call preserves the existing `eventType: 'outreach_email_drafted'` and adds `contactId`:
```typescript
await logTimeline({
  eventType: 'outreach_email_drafted',
  title: 'Gmail draft created',
  contactId: email.contactId,   // add for contact timeline visibility
  metadata: {
    campaignId: id,
    emailId,
    gmailDraftId: validated.gmailDraftId
  }
});
```

**Error handling / try-catch pattern** — copy verbatim from current `/draft/route.ts` (lines 47-53), unchanged by D-01:
```typescript
} catch (err) {
  if (err instanceof z.ZodError) {
    return validationError(err.issues[0].message);
  }
  return serverError(err);
}
```

**Complete structure of `/draft/route.ts` after D-01 edit:**

The RESEARCH.md Code Examples section (lines 476-551) contains the full file that results from the D-01 edit. Planner should prescribe that as the target state verbatim — no structural invention needed.

---

## Shared Patterns

### Bearer-token authentication
**Source:** `.claude/skills/generate-outreach-emails/references/heimdall-api.md` (lines 13-19)
**Apply to:** SKILL.md setup section, references/heimdall-api.md auth section, every curl call in the skill
```bash
TOKEN=$(cat ~/.heimdall/api-token)
curl -H "Authorization: Bearer $TOKEN" ...
```
Never resolve the token to a variable that might be logged. `$(cat ~/.heimdall/api-token)` inline per call.

### jq JSON body construction
**Source:** `.claude/skills/generate-outreach-emails/SKILL.md` (lines 261-268) and references/heimdall-api.md (lines 251-255)
**Apply to:** every PATCH curl call in the skill that sends a JSON body
```bash
PAYLOAD=$(jq -n --arg gmailDraftId "$GMAIL_DRAFT_ID" \
  '{gmailDraftId: $gmailDraftId}')
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" \
  "http://localhost:4000/api/outreach-campaigns/$CAMPAIGN_ID/emails/$EMAIL_ID/draft"
```
Raw `-d "{...$VAR...}"` breaks for any value containing newlines, quotes, or special chars. Always use `jq -n --arg`.

### State-machine guard + pre-read pattern
**Source:** `src/app/api/outreach-campaigns/[id]/emails/[emailId]/status/route.ts` (lines 30-45)
**Apply to:** `draft/route.ts` D-01 edit
```typescript
const [email] = await db
  .select()
  .from(outreachEmails)
  .where(and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id)))
  .limit(1);
if (!email) return notFound('Email');
if (!canEmailTransition(email.status, 'drafted')) {
  return validationError(`Invalid transition: ${email.status} -> drafted`);
}
```
`canEmailTransition` is imported from `@/features/outreach/lib/email-status`. Do NOT reimplement the logic inline.

### Zod validation + response envelope
**Source:** `src/app/api/outreach-campaigns/[id]/emails/[emailId]/draft/route.ts` (lines 9-11, 47-53)
**Apply to:** `draft/route.ts` D-01 edit (preserve existing schema and catch block)
```typescript
const draftWriteBackSchema = z.object({
  gmailDraftId: z.string().min(1)
});
// ...
} catch (err) {
  if (err instanceof z.ZodError) {
    return validationError(err.issues[0].message);
  }
  return serverError(err);
}
```
Zod schema is unchanged by D-01 — only the handler body changes.

### Manual updatedAt on every UPDATE
**Source:** `src/app/api/outreach-campaigns/[id]/emails/[emailId]/status/route.ts` (line 70) and `recipient/route.ts` (line 36)
**Apply to:** both UPDATE calls in the D-01 route edit
```typescript
updatedAt: new Date()
```
Must appear in BOTH `.set()` calls — the email update and the contacts update. Drizzle does not auto-update timestamps.

### Cursor pagination for work-queue reads
**Source:** RESEARCH.md Pattern 1 (lines 191-216)
**Apply to:** SKILL.md Step 1 (read the queue)
```bash
ALL_EMAILS="[]"
CURSOR=""
while true; do
  URL="http://localhost:4000/api/outreach-campaigns/$CAMPAIGN_ID/emails?status=approved&limit=100"
  if [ -n "$CURSOR" ]; then URL="${URL}&cursor=${CURSOR}"; fi
  PAGE=$(curl -s -H "Authorization: Bearer $TOKEN" "$URL")
  SUCCESS=$(echo "$PAGE" | jq -r '.success')
  if [ "$SUCCESS" != "true" ]; then
    echo "Error: $(echo "$PAGE" | jq -r '.error')"; exit 1
  fi
  ALL_EMAILS=$(echo "$ALL_EMAILS $PAGE" | jq -s '.[0] + .[1].data')
  HAS_MORE=$(echo "$PAGE" | jq -r '.meta.hasMore')
  if [ "$HAS_MORE" != "true" ]; then break; fi
  CURSOR=$(echo "$PAGE" | jq -r '.meta.cursor')
done
```
Always pass `?limit=100` and loop until `meta.hasMore = false`. Default limit is 20 (parseLimit default); campaigns with 25+ approved emails truncate silently without pagination.

### Soft-delete / archived-contact guard
**Source:** `src/app/api/outreach-campaigns/[id]/emails/[emailId]/status/route.ts` (lines 56-64) — approve guard reads `contacts.archivedAt`
**Apply to:** SKILL.md drafting loop (skip archived contacts)
```typescript
// REV-06: defense-in-depth — reject approve if contact is archived
const [contact] = await db
  .select({ archivedAt: contacts.archivedAt })
  .from(contacts)
  .where(eq(contacts.id, email.contactId))
  .limit(1);
if (contact?.archivedAt != null) {
  return validationError('Cannot approve: contact is archived');
}
```
In the skill (not the route), the contact data is already in the work-queue response — check `contact.archivedAt != null` from the queue item without a separate API call.

---

## No Analog Found

All three files have close analogs. No files in this phase lack a codebase match.

---

## Key Confirmed Facts (resolving RESEARCH.md assumptions)

| Assumption | Status | Evidence |
|---|---|---|
| A5: `logTimeline` accepts `contactId` field | **CONFIRMED TRUE** | `src/lib/db/timeline.ts` line 9: `contactId?: string` in `TimelineInput` |
| `approved → failed` is illegal | **CONFIRMED** | `email-status.ts` line 5: `approved: ['drafted', 'edited']` — `failed` absent |
| `approved → drafted` is legal | **CONFIRMED** | `email-status.ts` line 5 |
| `/draft/route.ts` current state: blind UPDATE, no pre-read, no canEmailTransition | **CONFIRMED** | Read the file directly — lines 22-32 show blind `.update()` with no preceding `.select()` |
| `/status/route.ts` is the correct structural template for D-01 | **CONFIRMED** | Same pre-read → guard → update → logTimeline shape needed |

---

## Metadata

**Analog search scope:** `.claude/skills/`, `src/app/api/outreach-campaigns/`, `src/lib/db/`, `src/features/outreach/lib/`
**Files scanned:** 7 (SKILL.md, references/heimdall-api.md, /draft/route.ts, /status/route.ts, /recipient/route.ts, timeline.ts, email-status.ts)
**Pattern extraction date:** 2026-06-22
