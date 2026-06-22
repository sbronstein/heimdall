# Heimdall API Contract (generate-outreach-emails skill)

The three REST endpoints this skill calls, the bearer-token auth pattern, and
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

This skill calls **exactly three endpoints** in each run. Do not add calls to
other routes -- CLI parity requires all writes go through REST and nothing else.

---

### 1. `GET /api/outreach-campaigns/[id]/generation-context`

**Used by:** every run -- called ONCE at the start, before any email is authored.

**IMPORTANT:** This is the **sole per-contact data source** for the entire run.
The skill reads this endpoint once and authors all emails from the returned
payload. Do NOT loop back to this endpoint per email. Do NOT call any
`GET /api/contacts` or `GET /api/interactions` per-email N+1 loop -- the
`generation-context` endpoint already returns everything (contact brief + recent
interactions + `lowContext` flag) for every pending email in a single response.

**Response shape:**

```json
{
  "success": true,
  "data": {
    "goalInstruction": "Get warm intros to VP Data/AI roles at growth-stage companies",
    "emails": [
      {
        "emailId": "uuid",
        "contactId": "uuid",
        "contact": {
          "firstName": "Alex",
          "lastName": "Chen",
          "howMet": "Met at PyData Boston 2023",
          "companyAtConnection": "Stripe",
          "roleAtConnection": "Staff Data Engineer",
          "currentCompany": "Anthropic",
          "title": "Director of Data",
          "closeness": 3,
          "recipientEmail": "alex@example.com"
        },
        "interactions": [
          {
            "type": "email",
            "summary": "Caught up on data infra approaches at Stripe",
            "occurredAt": "2024-11-15T14:00:00.000Z"
          }
        ],
        "lowContext": false
      }
    ]
  }
}
```

Fields:
- `goalInstruction` -- campaign-level ask; adapt per contact in the email body
- `emails` -- one entry per pending email; may be empty if no `pending` emails remain
- `lowContext: true` -- fewer than 2 logged interactions; draw only on `howMet`,
  `companyAtConnection`, `roleAtConnection` -- never invent shared history
- `interactions` -- up to 3 most recent; use `type`, `summary`, `occurredAt`

**Curl:**

```bash
TOKEN=$(cat ~/.heimdall/api-token)
CAMPAIGN_ID="your-campaign-uuid"
curl -s \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/outreach-campaigns/$CAMPAIGN_ID/generation-context"
```

---

### 2. `PATCH /api/outreach-campaigns/[id]/emails/[emailId]/generation`

**Used by:** writing each generated email back after authoring and passing the
LLM-tell scrub.

**ONE call per email.** This single PATCH both persists the content
(`generatedSubject`, `generatedBody`, `generatedAt`) AND advances the email's
`status` to `'generated'` in the same database UPDATE -- server-side, via
`canEmailTransition`. Do NOT make a separate `/status` call after this one to
mark the email generated. The transition happens inside the `/generation` route.

**Body:**

```json
{
  "generatedSubject": "Quick question, Alex",
  "generatedBody": "Hey Alex,\n\nHope things are going well at Anthropic..."
}
```

Field constraints (Zod schema in route):
- `generatedSubject` -- string, 1-500 chars, required
- `generatedBody` -- string, min 1 char, required (no upper bound enforced)

**Response:** `{ "success": true, "data": <updated email row> }` on success, or
`400` if the email is not in a state that permits the `-> generated` transition.

**Curl:**

```bash
TOKEN=$(cat ~/.heimdall/api-token)
CAMPAIGN_ID="your-campaign-uuid"
EMAIL_ID="your-email-uuid"
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "generatedSubject": "Quick question, Alex",
    "generatedBody": "Hey Alex,\n\nHope things are going well at Anthropic. Wanted to reach out..."
  }' \
  "http://localhost:4000/api/outreach-campaigns/$CAMPAIGN_ID/emails/$EMAIL_ID/generation"
```

---

### 3. `PATCH /api/outreach-campaigns/[id]/emails/[emailId]/status`

**Used by:** per-email failure path only (D-12). Called when the skill cannot
author or write back an email for any reason.

On failure, call this endpoint, then continue to the next email. Do not abort
the entire run on a single email failure.

**Body:**

```json
{
  "status": "failed",
  "lastError": "<first ~200 chars of the error message>"
}
```

Field constraints:
- `status` -- must be `'failed'` for the per-email failure path
- `lastError` -- string, max 500 chars (Zod enforced). Keep it to the first
  ~200 chars of the error message; truncate if longer.

**Response:** `{ "success": true, "data": <updated email row> }` on success, or
`400` if the transition from the current status to `'failed'` is not valid.

**Curl:**

```bash
TOKEN=$(cat ~/.heimdall/api-token)
CAMPAIGN_ID="your-campaign-uuid"
EMAIL_ID="your-email-uuid"
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"failed","lastError":"Generation blocked: em-dash found after 3 rewrite attempts"}' \
  "http://localhost:4000/api/outreach-campaigns/$CAMPAIGN_ID/emails/$EMAIL_ID/status"
```

---

## Error Envelopes the Skill Must Handle

| Status | Envelope | Skill action |
|--------|----------|--------------|
| 400 | `{ "success": false, "error": "Invalid transition: <from> -> <to>" }` | State-machine guard; log and continue to next email |
| 400 | `{ "success": false, "error": "<Zod field>: <reason>" }` | Bug in skill payload; surface and exit |
| 401 | `{ "success": false, "error": "Unauthorized" }` | Token / env misconfig; surface and exit |
| 404 | `{ "success": false, "error": "Campaign not found" }` | Campaign ID invalid; surface and exit |
| 404 | `{ "success": false, "error": "Email not found" }` | Email ID mismatch; log and continue |
| 500 | `{ "success": false, "error": "<message>" }` | Server-side bug; surface and exit |

---

## Run Protocol (summary)

1. Call `GET .../generation-context` **once** -- store `goalInstruction` and `emails` array.
2. Report count: "N pending emails found." Confirm before proceeding.
3. **Sample gate (D-04):** author 5 sample emails (spread across closeness tiers), run the
   blocking LLM-tell scrub on each, show them inline, and wait for owner approval (apply tone
   tweaks if requested). Then `PATCH .../generation` each approved sample so it is persisted
   and skipped in step 4.
4. For each remaining `pending` email in the array:
   a. Author subject + body using `voice-guide.md`.
   b. Run LLM-tell scrub (blocking set). Rewrite if needed.
   c. On success: `PATCH .../generation` with subject + body (sets `status='generated'`).
   d. On failure: `PATCH .../status` with `{ status:'failed', lastError }`.
5. Report end-of-run summary: generated / failed / low-context counts.

Build every JSON write-back body with `jq -n --arg` -- never interpolate email subject/body
or error strings directly into a `-d "{...}"` string (multi-line content breaks raw JSON).

The skill never reads the DB directly. All reads and writes go through REST.
