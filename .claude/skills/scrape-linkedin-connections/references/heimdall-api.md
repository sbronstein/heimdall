# Heimdall API Contract (for the skill)

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
  safety gate — keeps the architectural single-user assumption explicit at
  the auth layer).

If the bearer header is present but the hash does not match (or
`SINGLE_USER_EMAIL` is unset), middleware falls through to Clerk's session
check, which will return `401 { success: false, error: 'Unauthorized' }`.

Never log the resolved token. Use `$(cat ~/.heimdall/api-token)` inline so the
plaintext value stays out of shell history (depending on shell).

---

## Response envelope

Every Heimdall route returns:

```json
{ "success": true,  "data": { ... }, "meta": { ... } }
```

or

```json
{ "success": false, "error": "human-readable message" }
```

On `success: false`, surface the `error` string to the user. The skill must
never silently swallow a failure envelope — that is the difference between a
real bug and a misconfigured environment, and the user needs to see which.

Status codes:

- `200` success (GET, PATCH, successful POST that doesn't create a row)
- `201` created (POST `/prospects` returns 201 on bulk insert)
- `400` validation / state-machine rejection (Zod error or invalid transition)
- `401` auth missing / invalid (handled by middleware)
- `404` lead not found
- `500` server error

---

## Endpoints

### 1. `GET /api/job-leads`

**Used by:** drain mode (fetch the queued queue).

**Query params:**

- `status` — comma-separated list of `jobLeadStatus` values. The skill uses
  `?status=queued` to filter the queue; `?status=queued,failed` is also valid.
- `limit` — page size (default 50, max 100).
- `cursor` — pagination cursor (ISO timestamp of the last record's
  `updatedAt`).

**Response shape:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "linkedinJobUrl": "https://www.linkedin.com/jobs/view/...",
      "roleTitle": "VP Data",
      "companyName": "Example Co",
      "status": "queued",
      "lastError": null,
      "updatedAt": "2026-05-14T08:00:00.000Z"
    }
  ],
  "meta": { "cursor": "2026-05-14T08:00:00.000Z", "hasMore": false }
}
```

**Curl:**

```bash
TOKEN=$(cat ~/.heimdall/api-token)
curl -s -H "Authorization: Bearer $TOKEN" \
  'http://localhost:4000/api/job-leads?status=queued&limit=50'
```

---

### 2. `PATCH /api/job-leads/[id]/status`

**Used by:** claim (`queued → searching`) and failure (`searching → failed`).

**Body:**

```json
{ "status": "searching" | "failed" | "queued" | "found" | ..., "lastError": "<Category>: <detail>" }
```

`lastError` is optional and only meaningful on `status: 'failed'`. Max 220
chars; the API will reject longer values with a Zod 400.

**Valid transitions** (state machine in `src/lib/domain/job-lead-pipeline.ts`,
D-08):

| From        | To                            | Notes                        |
|-------------|-------------------------------|------------------------------|
| `pending`   | `scraping`                    | not skill-relevant           |
| `scraping`  | `scraped`, `pending`          | not skill-relevant           |
| `scraped`   | `queued`                      | not skill-relevant           |
| `queued`    | `searching`                   | **skill claims a lead**      |
| `searching` | `found`, `failed`             | **skill writes the outcome** |
| `found`     | `ready`, `actioned`, `archived` | downstream UI               |
| `failed`    | `queued`                      | retry path (typically UI)    |

Note: `'searching → found'` is handled automatically by the POST `/prospects`
route; you almost never PATCH `/status` to `'found'` directly from the skill.

**Response:** `{ success: true, data: <updated lead row> }` or
`{ success: false, error: "Invalid transition: <from> -> <to>" }` (400) on
state-machine rejection.

**Curl (claim):**

```bash
TOKEN=$(cat ~/.heimdall/api-token)
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"searching"}' \
  "http://localhost:4000/api/job-leads/$LEAD_ID/status"
```

**Curl (write failure):**

```bash
TOKEN=$(cat ~/.heimdall/api-token)
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"failed","lastError":"Timeout: navigation exceeded 30000ms on /jobs/123"}' \
  "http://localhost:4000/api/job-leads/$LEAD_ID/status"
```

---

### 3. `POST /api/job-leads/[id]/prospects`

**Used by:** success path — bulk-write the scraped prospects.

**Body:** `{ "prospects": ScrapedProspect[] }` (max 200 items).

`ScrapedProspect` shape (Zod schema in the route, D-22 + 5-field contract):

```typescript
{
  name: string;                       // required, 1–200 chars
  title: string | null;               // 0–300 chars
  linkedinUrl: string | null;         // valid URL or null
  profileSnippet: string | null;      // 0–500 chars — the visible blurb beneath the role
  mutualConnectionNames: string[];    // 0–50 entries, each 1–200 chars
}
```

**Side effects** (handled by the route, do NOT replicate):

1. Single-statement bulk insert into the `prospects` table.
2. Flips the lead `status` from `'searching'` → `'found'`.
3. Clears `lastError` and `lastErrorAt`.
4. Sets `prospectCount` to the inserted count.
5. Emits a `job_lead_search_complete` timeline event with
   `metadata.prospectCount`.

**Pre-condition:** The lead must be in `'searching'` status. If it is in
`'queued'` or any other state, the route returns
`400 { success: false, error: "Cannot write prospects to lead in status '<x>'" }`.
This is why the skill PATCHes `/status` to `'searching'` first.

**Response:**

```json
{ "success": true, "data": { "insertedCount": 12, "lead": { ...updated lead... } } }
```

**Curl:**

```bash
TOKEN=$(cat ~/.heimdall/api-token)
PROSPECTS_JSON='[{"name":"Alice","title":"VP Data","linkedinUrl":"https://www.linkedin.com/in/alice","profileSnippet":"Building data infra. ex-Stripe.","mutualConnectionNames":["John Smith"]}]'
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"prospects\":$PROSPECTS_JSON}" \
  "http://localhost:4000/api/job-leads/$LEAD_ID/prospects"
```

---

### 4. `POST /api/job-leads/[id]/search`

**Not called by the skill in the normal flow** — documented for context.

This is the retry-from-failed path. The web UI (Plan 05-05) calls it when the
user clicks the "Retry" button on a `'failed'` lead. It flips
`scraped → queued` (first-time queue) or `failed → queued` (retry), clears
`lastError` / `lastErrorAt`, and emits a `job_lead_search_queued` timeline
event. It does NOT trigger any in-app scraping — that work happens in this
skill.

The skill itself never POSTs to `/search`; it interacts with `/status` and
`/prospects` only. Knowing this endpoint exists matters for two reasons:

1. The UI's Retry button puts a lead back into the `'queued'` queue, where the
   next drain-mode run picks it up.
2. If you encounter a `'failed'` lead that needs reprocessing during a drain
   run, prefer telling the user to use the UI's Retry button rather than
   forcing the lead into `'queued'` from the skill — that keeps the audit
   trail clean (the UI retry emits its own timeline event).

---

### 7. `PATCH /api/contacts/[id]/enrichment`

**Used by:** profile-enrichment mode (single connection) and batch-sweep mode.

**Body:**

```json
{
  "companyAtConnection": "OpenAI",
  "roleAtConnection": "Member of Technical Staff"
}
```

Both fields are optional and nullable. Max 300 chars each (server-side Zod
`.max(300)`). Sending `null` for a field clears that field. Sending a missing key
leaves the existing value unchanged (null-safe `??` merge on the server).

**Side effects** (handled by the route — do NOT replicate in the skill):

1. Merges `companyAtConnection` and `roleAtConnection` with existing values
   via `??` (incoming field ?? existing value) so callers can update one field
   without clearing the other.
2. Sets `enrichmentStatus = 'enriched'` (terminal — contact exits the sweep queue).
3. Sets `enrichedAt` to the current timestamp.
4. Sets `updatedAt` to the current timestamp.
5. Emits a `contact_enriched` timeline event with `contactId` (and `companyId`
   if the contact has one linked).

**Response:** `{ success: true, data: <updated contact row> }`.

**Curl:**

```bash
TOKEN=$(cat ~/.heimdall/api-token)
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"companyAtConnection":"OpenAI","roleAtConnection":"Member of Technical Staff"}' \
  "http://localhost:4000/api/contacts/$CONTACT_ID/enrichment"
```

**Notes:**
- Abort on `401` — token / env misconfig; surface and exit.
- A `400` with a Zod message means a field exceeded 300 chars or had an invalid type;
  truncate the value and retry, or surface and exit.
- Do NOT write to the contacts table directly — CLI parity requires all writes go through REST.

---

### 8. `GET /api/contacts/enrichment-queue`

**Used by:** batch-sweep mode (fetches the ordered list of contacts still missing
at-connection fields).

**Query params:**

- `limit` — number of contacts to return (default 25, max 50). Pass this as your
  per-session cap. Example: `?limit=30`.

**Response shape:**

```json
{
  "success": true,
  "data": {
    "queue": [
      {
        "id": "uuid",
        "linkedinUrl": "https://www.linkedin.com/in/alice",
        "firstName": "Alice",
        "lastName": "Smith"
      }
    ],
    "count": 12
  }
}
```

`count` is the total queue depth (how many contacts still need enrichment across all
pages, not just this batch). Only `id`, `linkedinUrl`, `firstName`, `lastName` are
returned — PII minimization. The queue is ordered oldest-`linkedinConnectionDate`
first for steady, deterministic progress through the backlog.

**Exclusion logic** (server-side — the skill does not need to replicate):
- Active contacts only (`archived_at IS NULL`).
- Missing at least one at-connection field (`companyAtConnection IS NULL` OR
  `roleAtConnection IS NULL`).
- Not yet terminal (`enrichmentStatus != 'enriched'`).

**Curl:**

```bash
TOKEN=$(cat ~/.heimdall/api-token)
curl -s -H "Authorization: Bearer $TOKEN" \
  'http://localhost:4000/api/contacts/enrichment-queue?limit=30'
```

---

## Error envelopes the skill must handle

| Status | Envelope                                                                | Skill action                                  |
|--------|-------------------------------------------------------------------------|-----------------------------------------------|
| 400    | `{ success: false, error: "Invalid transition: <from> -> <to>" }`       | Already-claimed lead; log and skip            |
| 400    | `{ success: false, error: "<Zod field>: <reason>" }`                    | Bug in the skill's payload; surface and exit  |
| 400    | `{ success: false, error: "Cannot write prospects to lead in status..."}`| State-machine guard; the skill forgot to claim |
| 401    | `{ success: false, error: "Unauthorized" }`                             | Token / env misconfig; surface and exit       |
| 404    | `{ success: false, error: "Job lead not found" }`                       | Surface and exit                              |
| 500    | `{ success: false, error: "<message>" }`                                | Server-side bug; surface and exit             |
