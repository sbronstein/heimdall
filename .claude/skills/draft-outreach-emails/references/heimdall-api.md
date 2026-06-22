# Heimdall API Contract (draft-outreach-emails skill)

The four REST endpoints this skill calls, the bearer-token auth pattern, and
the standard response envelope. All routes are served by the Next.js app
running at `http://localhost:4000` in dev (the dev server is on port 4000 per
`package.json` `dev` script).

---

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

If the bearer header is present but the hash does not match (or
`SINGLE_USER_EMAIL` is unset), middleware falls through to Clerk's session
check, which will return `401 { "success": false, "error": "Unauthorized" }`.

Never log the resolved token. Use `$(cat ~/.heimdall/api-token)` inline so the
plaintext value stays out of shell history.

---

## Response Envelope

Every Heimdall route returns:

```json
{ "success": true, "data": { ... }, "meta": { ... } }
```

or

```json
{ "success": false, "error": "human-readable message" }
```

On `success: false`, surface the `error` string. Never silently swallow a
failure envelope.

Status codes:

| Code | Meaning |
|------|---------|
| 200  | OK (GET, PATCH, successful write) |
| 400  | Validation failure / state-machine rejection (Zod error or invalid transition) |
| 401  | Auth missing or invalid (handled by middleware) |
| 404  | Entity not found |
| 500  | Server error |

---

## Endpoints

This skill calls **exactly four endpoints** in each run. Do not add calls to
other routes -- CLI parity requires all writes go through REST and nothing else.

---

### 1. `GET /api/outreach-campaigns/[id]/emails?status=approved&limit=100`

**Used by:** every run -- called at the start to read the full work queue.

**IMPORTANT:** Always pass `?limit=100` and paginate until `meta.hasMore =
false`. The default limit is 20; campaigns with more than 20 approved emails
will be **silently truncated** if you omit `&limit=100` or skip the pagination
loop (Pitfall 6 from 17-RESEARCH.md).

**Pagination loop:**

```bash
TOKEN=$(cat ~/.heimdall/api-token)
CAMPAIGN_ID="your-campaign-uuid"
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

**Response shape:**

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
        "generatedAt": "2026-06-22T12:00:00.000Z",
        "approvedAt": "2026-06-22T13:00:00.000Z",
        "draftedAt": null,
        "createdAt": "2026-06-22T10:00:00.000Z",
        "updatedAt": "2026-06-22T13:00:00.000Z"
      },
      "contact": {
        "id": "uuid",
        "firstName": "Alex",
        "lastName": "Chen",
        "email": null,
        "outreachStatus": "not_reached_out",
        "archivedAt": null,
        "linkedinUrl": "https://linkedin.com/in/alexchen",
        "title": "Director of Data",
        "currentCompany": "Anthropic"
      }
    }
  ],
  "meta": {
    "cursor": "2026-06-22T13:00:00.000Z",
    "hasMore": false
  }
}
```

**Key fields:**
- `email.recipientEmail` -- `null` means address not yet discovered; this email goes to the **discovery queue**
- `email.gmailDraftId` -- `null` for a never-drafted email; non-null means a prior draft exists (re-draft path -- D-02)
- `email.editedSubject` / `email.editedBody` -- take precedence over `generatedSubject` / `generatedBody` (use `editedX ?? generatedX` for final content)
- `contact.archivedAt` -- skip drafting if non-null; do not send to archived contacts
- `contact` may be `null` if the contact was hard-deleted (edge case; skip this email)

After reading the full queue, split into two sub-queues:
- **Discovery queue:** `email.recipientEmail === null` (no stored address -- must discover or fall back to LinkedIn)
- **Drafting queue:** `email.recipientEmail !== null` (address known -- proceed to draft)

---

### 2. `PATCH /api/outreach-campaigns/[id]/emails/[emailId]/recipient`

**Used by:** the discovery loop (Step 3). Called once per email after address discovery resolves.

**Purpose:** Store the discovered recipient address (DISC-01/DISC-02) or route the contact to
LinkedIn message (DISC-03 / D-04b).

**Two bodies -- use the right one:**

```json
{ "channel": "email", "recipientEmail": "alex@example.com" }
```
Use when discovery found exactly one distinct direct-thread address. Stores the address and
sets `channel = 'email'`. After this call, add the email to the drafting queue for this run.

```json
{ "channel": "linkedin_message" }
```
Use when discovery found zero addresses (D-04b -- LinkedIn fallback). The route **forces
`recipientEmail = null`** server-side regardless of what is sent; do not pass a `recipientEmail`
field. The existing `needsLinkedinMessage()` badge in the review UI already renders this state.
Do **NOT** call this endpoint for ambiguous contacts (2+ candidate addresses) -- leave
`recipientEmail` unset and report in the run summary instead (D-04).

**Curl -- discovered address:**

```bash
TOKEN=$(cat ~/.heimdall/api-token)
CAMPAIGN_ID="your-campaign-uuid"
EMAIL_ID="your-email-uuid"
PAYLOAD=$(jq -n --arg addr "alex@example.com" \
  '{channel: "email", recipientEmail: $addr}')
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" \
  "http://localhost:4000/api/outreach-campaigns/$CAMPAIGN_ID/emails/$EMAIL_ID/recipient"
```

**Curl -- LinkedIn fallback:**

```bash
TOKEN=$(cat ~/.heimdall/api-token)
CAMPAIGN_ID="your-campaign-uuid"
EMAIL_ID="your-email-uuid"
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"channel":"linkedin_message"}' \
  "http://localhost:4000/api/outreach-campaigns/$CAMPAIGN_ID/emails/$EMAIL_ID/recipient"
```

**Response:** `{ "success": true, "data": <updated email row> }` on success, or `400` on
Zod validation failure (e.g., invalid channel value or malformed email).

---

### 3. `PATCH /api/outreach-campaigns/[id]/emails/[emailId]/draft`

**Used by:** the drafting loop (Step 4). Called once per email after `mcp__gmail__create_draft`
returns a `gmailDraftId`.

**Purpose:** Atomically record the Gmail draft -- sets `gmailDraftId`, transitions `status →
'drafted'`, sets `draftedAt`, updates the linked contact's `outreachStatus → 'reached_out'`,
and logs an `outreach_email_drafted` timeline event. One call per email; all four effects
happen in the same server-side request.

**Legal pre-state:** `approved` **ONLY**. The route enforces `canEmailTransition(email.status,
'drafted')` and returns `400` for any other pre-state.

**Idempotency (D-02):** An email already in `status='drafted'` never appears in the
`?status=approved` work queue, so the skill naturally skips already-drafted emails. If an email
was drafted then un-approved (edited back to `approved` with a stale `gmailDraftId`), call this
endpoint again with the new draft ID -- the route accepts `approved → drafted` and overwrites
`gmailDraftId`. The old Gmail draft is left harmless in Gmail's drafts folder (no
`update_draft` tool exists on the connected MCP).

**Body:**

```json
{ "gmailDraftId": "r1234567890" }
```

Field constraints (Zod schema):
- `gmailDraftId` -- string, min 1 char, required

**Curl:**

```bash
TOKEN=$(cat ~/.heimdall/api-token)
CAMPAIGN_ID="your-campaign-uuid"
EMAIL_ID="your-email-uuid"
GMAIL_DRAFT_ID="r1234567890"
PAYLOAD=$(jq -n --arg gmailDraftId "$GMAIL_DRAFT_ID" \
  '{gmailDraftId: $gmailDraftId}')
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" \
  "http://localhost:4000/api/outreach-campaigns/$CAMPAIGN_ID/emails/$EMAIL_ID/draft"
```

**Response:** `{ "success": true, "data": <updated email row> }` on success, or `400
{ "error": "Invalid transition: <from> -> drafted" }` if the email is not in `approved` state.

---

### 4. `PATCH /api/outreach-campaigns/[id]/emails/[emailId]/status`

**Used by:** the failure path ONLY (Step 4, per-email error handling). Called when drafting
fails for a non-approved email. **See the critical restriction below before calling this.**

**CRITICAL: `approved → failed` is an ILLEGAL TRANSITION.**

The state machine in `src/features/outreach/lib/email-status.ts` defines:

```
approved: ['drafted', 'edited']   // 'failed' is NOT in this list
```

Calling this endpoint with `{ status: 'failed' }` on an **`approved` email returns
`400 { "error": "Invalid transition: approved -> failed" }`.** Do NOT call this endpoint
for an approved email that fails to draft.

**Correct behavior on draft failure for an approved email:**
1. Do NOT call `/status`
2. Add the email to an in-memory failed list
3. Leave the email in `approved` state
4. Report in the end-of-run summary

**When to call this endpoint:** Only for emails in a non-approved state (e.g., `pending`,
`generated`, `edited`) that fail during processing. This is an edge case in the draft skill;
the primary use case is the `generate-outreach-emails` sibling skill's generation failures.

**Body:**

```json
{
  "status": "failed",
  "lastError": "<first ~200 chars of the error message>"
}
```

Field constraints:
- `status` -- must be `'failed'`
- `lastError` -- string, max 500 chars (Zod enforced). Truncate to ~200 chars.

**Curl:**

```bash
TOKEN=$(cat ~/.heimdall/api-token)
CAMPAIGN_ID="your-campaign-uuid"
EMAIL_ID="your-email-uuid"
LAST_ERROR="Draft creation failed: MCP tool returned unexpected response shape"
PAYLOAD=$(jq -n --arg err "$LAST_ERROR" \
  '{status: "failed", lastError: $err}')
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" \
  "http://localhost:4000/api/outreach-campaigns/$CAMPAIGN_ID/emails/$EMAIL_ID/status"
```

**Response:** `{ "success": true, "data": <updated email row> }` on success, or `400` if
the transition from the current status to `'failed'` is not valid (e.g., current status is
`approved` -- see restriction above).

---

## Error Envelopes the Skill Must Handle

| Status | Envelope | Skill action |
|--------|----------|--------------|
| 400 | `{ "success": false, "error": "Invalid transition: <from> -> <to>" }` | State-machine guard fired. For `approved -> drafted`: bug in skill (only approved emails should reach the draft endpoint). For `approved -> failed`: **do NOT retry** -- leave email as approved, report in summary. For other transitions: log and continue to next email. |
| 400 | `{ "success": false, "error": "<Zod field>: <reason>" }` | Bug in skill payload; surface and exit |
| 401 | `{ "success": false, "error": "Unauthorized" }` | Token / env misconfig; surface and exit |
| 404 | `{ "success": false, "error": "Campaign not found" }` | Campaign ID invalid; surface and exit |
| 404 | `{ "success": false, "error": "Email not found" }` | Email ID mismatch; log and continue |
| 500 | `{ "success": false, "error": "<message>" }` | Server-side bug; surface and exit |

**State-machine summary for this skill:**

| Transition | Legal? | Notes |
|------------|--------|-------|
| `approved → drafted` | YES | The primary write-back path via endpoint 3 |
| `approved → edited` | YES | Un-approve path (happens in UI, not in this skill) |
| `approved → failed` | **NO** | Illegal -- returns 400. Leave email as `approved` on draft failure. |

---

## Run Protocol (summary)

1. **Read queue:** Paginate `GET .../emails?status=approved&limit=100` (loop until
   `meta.hasMore=false`) -- store `{ email, contact }` pairs.
2. **Split:** emails with `recipientEmail=null` → discovery queue; others → drafting queue.
3. **Confirm gate (D-05):** Report "N approved emails found. M are missing a recipient address.
   Proceed with discover-then-draft? (yes / no)" -- wait for confirmation.
4. **Discovery loop:** For each email in the discovery queue, search Gmail threads by contact
   name. Exactly one distinct direct-participant address → `PATCH .../recipient
   {channel:'email', recipientEmail}` then add to drafting queue. Two or more → ambiguous (add
   to run-summary list, do not draft). Zero → `PATCH .../recipient {channel:'linkedin_message'}`.
5. **Drafting loop:** For each email in the drafting queue (skip if `contact.archivedAt !=
   null`), resolve final content (`editedSubject ?? generatedSubject`, `editedBody ??
   generatedBody`), call `mcp__gmail__create_draft`, then `PATCH .../draft {gmailDraftId}`. On
   `create_draft` failure for an approved email: do NOT call `/status` -- add to failed list
   and continue.
6. **End-of-run summary:** Print drafted / skipped / discovered / ambiguous / LinkedIn-fallback
   / failed counts; list ambiguous candidates (name, emailId, candidate addresses); list failed
   emails (name, emailId, error).

Build every JSON write-back body with `jq -n --arg` -- never interpolate email subjects, bodies,
or error strings directly into a `-d "{...}"` string (multi-line content breaks raw JSON).

The skill never reads the database directly. All reads and writes go through REST.
