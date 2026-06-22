---
name: draft-outreach-emails
description: >
  Discover missing recipient addresses for a campaign's approved emails via Gmail thread
  search, then create a Gmail draft per approved email that has a recipient address, and
  write each result back via REST. Discover-then-draft in one batch run. The skill never
  sends email -- it only ever creates drafts.
argument-hint: '<campaign-id>'
allowed-tools:
  - Read
  - Bash
  - mcp__gmail__search_threads
  - mcp__gmail__get_thread
  - mcp__gmail__create_draft
  - mcp__gmail__list_drafts
---

## Overview

`draft-outreach-emails <campaign-id>` runs a single batch that (1) discovers missing recipient
addresses for the campaign's approved emails using Gmail thread search, then (2) creates a
Gmail draft for each approved email that has a recipient address, and (3) writes each result
back through the Heimdall REST API.

**This skill never sends email.** It calls only `create_draft` -- never `send`, `trash`,
`delete`, or any modify tool. The Gmail tool allowlist is enforced in the frontmatter above
and verified by a mandatory pre-run grep gate (see Constraints).

**REST-only.** All reads and writes go through the Heimdall API at `http://localhost:4000`.
The skill never touches the database directly.

**Idempotent.** Already-drafted emails (`status='drafted'`) never appear in the approved
work queue -- they are automatically skipped. An email that was drafted, then edited and
re-approved (returning to `status='approved'` with a stale `gmailDraftId`) is re-drafted
via create-and-repoint: a fresh draft is created and `gmailDraftId` is overwritten. The old
draft is left harmless in Gmail's drafts folder -- no update or delete tool is needed.

**Read these references before running:**

- [`references/heimdall-api.md`](references/heimdall-api.md) -- the four endpoints this skill
  calls (work-queue read, recipient write-back, draft write-back, failure path), bearer-token
  auth pattern, and response envelope.

---

## Setup

Verify all prerequisites before proceeding. Surface the gap and stop if any are missing -- do
NOT attempt to fix automatically.

- `~/.heimdall/api-token` exists (chmod 600; created by `npm run token:generate`).
- `.env.local` has `API_TOKEN_HASH=<sha256 of the token>` and
  `SINGLE_USER_EMAIL=steve@bronstein.org`.
- Heimdall dev server running on `http://localhost:4000` (`npm run dev`).
- `jq` available on `PATH` (used to safely build JSON write-back payloads).
- Gmail MCP tools in scope: `mcp__gmail__search_threads`, `mcp__gmail__get_thread`,
  `mcp__gmail__create_draft` must be available in the current Claude Code session. This skill
  requires an **interactive** Claude Code session with the Gmail MCP connected. If any Gmail
  tool is missing from scope, stop and surface the gap -- do NOT proceed without them.

```bash
# Verify jq is installed (required for correct JSON escaping of multi-line bodies)
command -v jq >/dev/null && echo "jq found" || echo "MISSING: jq (brew install jq)"

# Verify token file exists
[ -f ~/.heimdall/api-token ] && echo "token found" || echo "MISSING: ~/.heimdall/api-token"

# Verify env vars
grep -q 'API_TOKEN_HASH' .env.local && echo "API_TOKEN_HASH set" || echo "MISSING: API_TOKEN_HASH in .env.local"
grep -q 'SINGLE_USER_EMAIL' .env.local && echo "SINGLE_USER_EMAIL set" || echo "MISSING: SINGLE_USER_EMAIL in .env.local"
```

Then confirm Gmail MCP availability: attempt `mcp__gmail__search_threads` with a minimal test
query (e.g., `query: "test"`, `maxResults: 1`) and `mcp__gmail__list_drafts` to confirm both
read and draft-create tools are in scope. If the tool call returns an error indicating the
MCP is not connected, stop and instruct the user to start an interactive Claude Code session
with the Gmail MCP active.

---

## Step 1: Read the approved queue

Call `GET /api/outreach-campaigns/<id>/emails?status=approved&limit=100` with cursor
pagination until `meta.hasMore = false`. The default limit is 20; campaigns with more than
20 approved emails are silently truncated if `&limit=100` is omitted or the pagination loop
is skipped (Pitfall 6).

```bash
TOKEN=$(cat ~/.heimdall/api-token)
CAMPAIGN_ID="$ARGUMENTS"
ALL_EMAILS="[]"
CURSOR=""

while true; do
  URL="http://localhost:4000/api/outreach-campaigns/$CAMPAIGN_ID/emails?status=approved&limit=100"
  if [ -n "$CURSOR" ]; then URL="${URL}&cursor=${CURSOR}"; fi
  PAGE=$(curl -s -H "Authorization: Bearer $TOKEN" "$URL")
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

Check the response envelope: if `success: false`, surface the `error` string and exit.

- `401` -- token / env misconfiguration; surface and exit.
- `404` -- campaign not found; surface and exit.
- `500` -- server error; surface and exit.

**Partition into two sub-queues:**

```bash
# Discovery queue: recipientEmail is null -- must discover or fall back to LinkedIn
DISCOVERY_QUEUE=$(echo "$ALL_EMAILS" | jq '[.[] | select(.email.recipientEmail == null)]')

# Drafting queue: recipientEmail is set -- proceed to create draft
DRAFTING_QUEUE=$(echo "$ALL_EMAILS" | jq '[.[] | select(.email.recipientEmail != null)]')

TOTAL=$(echo "$ALL_EMAILS" | jq 'length')
MISSING_RECIPIENT=$(echo "$DISCOVERY_QUEUE" | jq 'length')
```

Each item in `ALL_EMAILS` has shape:
`{ email: { id, status, channel, recipientEmail, gmailDraftId, generatedSubject, generatedBody, editedSubject, editedBody, contactId, ... }, contact: { id, firstName, lastName, email, outreachStatus, archivedAt, ... } | null }`

Key fields to note:
- `email.recipientEmail` -- `null` means address not yet discovered (discovery queue)
- `email.gmailDraftId` -- `null` for a never-drafted email; non-null means re-draft path (D-02)
- `email.editedSubject` / `email.editedBody` -- take precedence over generated variants
- `contact.archivedAt` -- skip drafting if non-null
- `contact` may be `null` if contact was hard-deleted (skip this email)

---

## Step 2: Confirm gate (D-05)

Report the counts and wait for explicit confirmation before acting:

```
N approved emails found for campaign <id>.
M are missing a recipient address (will attempt discovery).
Proceed with discover-then-draft? (yes / no)
```

Wait for explicit confirmation. If the owner replies "no" or anything other than "yes",
exit cleanly without making any changes.

If `N = 0`, report "No approved emails -- run complete." and exit cleanly.

---

## Step 3: Discovery loop (DISC-01 / D-03 / D-04 / D-04b)

For each item in `DISCOVERY_QUEUE`, search Gmail for threads that include the contact as a
direct participant, extract their email address, and apply the LOCKED accept rule.

**IMPORTANT: Gmail MCP tool signatures are [ASSUMED] from Gmail API v1 conventions.** Validate
exact parameter names (`query` vs `q`, `maxResults` vs `max`) at run time on the first call.
If a parameter name is wrong, the tool will error -- adjust and retry.

### 3a. Search for threads

```
mcp__gmail__search_threads {
  query: "<firstName> <lastName>",   // e.g., "Alex Chen"
  maxResults: 20                      // cap at 20 most-recent threads [ASSUMED param name]
}
// Expected response [ASSUMED from Gmail API v1]:
// { threads: [{ id: "thread-id", snippet: "..." }, ...] }
// If threadIds are returned directly (different wrapper shape), adjust extraction.
```

If `search_threads` returns no threads, skip to step 3d (LinkedIn fallback).

### 3b. Extract participant addresses from each thread

For each thread ID returned, call `get_thread` to retrieve the message headers:

```
mcp__gmail__get_thread {
  threadId: "<thread-id>"    // [ASSUMED param name -- may be "id" or "thread_id"]
}
// Expected response [ASSUMED]:
// {
//   id: "thread-id",
//   messages: [
//     {
//       id: "msg-id",
//       payload: {
//         headers: [
//           { name: "From", value: "Alex Chen <alex@example.com>" },
//           { name: "To",   value: "Steve Bronstein <steve@bronstein.org>" },
//           { name: "Cc",   value: "" }
//         ]
//       }
//     }
//   ]
// }
```

Walk `messages[].payload.headers`, collecting values for `From`, `To`, and `Cc` headers.
Parse the `Display Name <email@domain>` RFC 2822 format to extract the email address:

```bash
parse_email_from_header() {
  local header_value="$1"
  if echo "$header_value" | grep -q '<'; then
    echo "$header_value" | sed 's/.*<\([^>]*\)>.*/\1/' | tr '[:upper:]' '[:lower:]' | xargs
  else
    echo "$header_value" | tr '[:upper:]' '[:lower:]' | xargs
  fi
}

parse_display_name() {
  local header_value="$1"
  if echo "$header_value" | grep -q '<'; then
    echo "$header_value" | sed 's/<[^>]*>//' | xargs
  else
    echo ""
  fi
}
```

**Apply the D-03 name-matching filter (Pitfall 3):**

After extracting each address, check whether the display name in the header case-insensitively
matches `contact.firstName + ' ' + contact.lastName`. **Only keep addresses where the display
name matches the contact's full name.** This guards against threads where the contact's name
appears in the body text (forwarded emails, newsletters) but they are not an actual participant.

```bash
CONTACT_FULL_NAME_LOWER=$(echo "$FIRST_NAME $LAST_NAME" | tr '[:upper:]' '[:lower:]')
# For each header value, extract display name and compare:
DISPLAY_NAME_LOWER=$(parse_display_name "$HEADER_VALUE" | tr '[:upper:]' '[:lower:]')
if echo "$DISPLAY_NAME_LOWER" | grep -qi "$CONTACT_FULL_NAME_LOWER"; then
  ADDR=$(parse_email_from_header "$HEADER_VALUE")
  # Skip Steve's own address
  if [ "$ADDR" != "steve@bronstein.org" ]; then
    CANDIDATE_ADDRESSES+=("$ADDR")
  fi
fi
```

Collect candidate addresses across ALL threads for this contact. After processing all threads,
**deduplicate by normalized (lowercased) email address** (Pitfall 4 -- the same address
appearing in multiple threads must count as ONE distinct address):

```bash
DISTINCT_ADDRESSES=$(printf '%s\n' "${CANDIDATE_ADDRESSES[@]}" | sort -u)
DISTINCT_COUNT=$(echo "$DISTINCT_ADDRESSES" | grep -c '.' || echo "0")
```

### 3c. Apply the LOCKED accept rule (D-03)

**Exactly one distinct address found:**

Write back via `PATCH .../recipient { channel: 'email', recipientEmail: <addr> }`, then add
this item to the drafting queue for this run:

```bash
TOKEN=$(cat ~/.heimdall/api-token)
PAYLOAD=$(jq -n --arg addr "$DISCOVERED_ADDR" \
  '{channel: "email", recipientEmail: $addr}')
RESULT=$(curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" \
  "http://localhost:4000/api/outreach-campaigns/$CAMPAIGN_ID/emails/$EMAIL_ID/recipient")
SUCCESS=$(echo "$RESULT" | jq -r '.success')
if [ "$SUCCESS" != "true" ]; then
  echo "Recipient write-back failed for $EMAIL_ID: $(echo "$RESULT" | jq -r '.error')"
  # Add to failed list and continue
else
  # Update the item's recipientEmail in memory and add to DRAFTING_QUEUE
  DISCOVERED_COUNT=$((DISCOVERED_COUNT + 1))
fi
```

**Two or more distinct addresses found -- AMBIGUOUS (D-04):**

Leave `recipientEmail` UNSET. Do NOT call the `/recipient` endpoint. Do NOT force
`channel='linkedin_message'` (an email likely exists -- the owner must resolve manually).
Add to the ambiguous list for the run summary:

```bash
AMBIGUOUS_LIST+=("$CONTACT_NAME ($EMAIL_ID): $DISTINCT_ADDRESSES")
```

The email is NOT drafted this run. The owner resolves manually (e.g., via a direct
`PATCH .../recipient` call with the correct address) and re-runs.

**Zero distinct addresses found (D-04b / DISC-03):**

Write back via `PATCH .../recipient { channel: 'linkedin_message' }`. The route forces
`recipientEmail = null` server-side. The existing `needsLinkedinMessage()` badge in the review
UI will render this state automatically:

```bash
TOKEN=$(cat ~/.heimdall/api-token)
RESULT=$(curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"channel":"linkedin_message"}' \
  "http://localhost:4000/api/outreach-campaigns/$CAMPAIGN_ID/emails/$EMAIL_ID/recipient")
SUCCESS=$(echo "$RESULT" | jq -r '.success')
if [ "$SUCCESS" != "true" ]; then
  echo "LinkedIn fallback write-back failed for $EMAIL_ID: $(echo "$RESULT" | jq -r '.error')"
fi
LINKEDIN_FALLBACK_LIST+=("$CONTACT_NAME ($EMAIL_ID)")
```

### 3d. Proceed to drafting

After completing the discovery loop, the `DRAFTING_QUEUE` now includes:
1. Items that originally had a `recipientEmail` set (from Step 1 partition), AND
2. Items newly added from the discovery loop (exactly-one-address path)

---

## Step 4: Drafting loop (DRFT-01 / D-02 idempotency)

For each item in the drafting queue, create a Gmail draft and write back the draft ID.

### 4a. Pre-draft checks

Skip the email and report if:
- `contact` is `null` (contact hard-deleted): add to failed list, continue
- `contact.archivedAt != null` (contact archived): add to skipped list, continue

Resolve final content using the canonical precedence (Pitfall 2):

```bash
FINAL_SUBJECT=$(echo "$EMAIL_ITEM" | jq -r '.email.editedSubject // .email.generatedSubject')
FINAL_BODY=$(echo "$EMAIL_ITEM" | jq -r '.email.editedBody // .email.generatedBody')
```

If both `FINAL_SUBJECT` and `FINAL_BODY` are null or empty after this, skip the email and
add to the failed list (edge case: approved before generation ran).

### 4b. Determine new-draft vs. re-draft (D-02)

```bash
GMAIL_DRAFT_ID=$(echo "$EMAIL_ITEM" | jq -r '.email.gmailDraftId')

if [ "$GMAIL_DRAFT_ID" = "null" ] || [ -z "$GMAIL_DRAFT_ID" ]; then
  DRAFT_ACTION="new"
else
  # Email was drafted, then edited → returned to approved with stale gmailDraftId
  # Re-draft: create a fresh draft and repoint. Old draft left harmless in Gmail.
  DRAFT_ACTION="redraft"
fi
# In both cases: call create_draft, then PATCH .../draft with the new ID
```

### 4c. Create the Gmail draft

```
mcp__gmail__create_draft {
  to: "<recipientEmail>",
  subject: "<FINAL_SUBJECT>",
  body: "<FINAL_BODY>"
}
// Expected response [ASSUMED from Gmail API v1 drafts.create]:
// { id: "r<draft-id>", message: { id: "msg-id", threadId: "..." } }
// The skill uses the top-level `id` as gmailDraftId.
// Validate: if the response has a different shape (e.g., `draftId` or nested `draft.id`),
// read the actual key from the returned object and adjust accordingly.
```

**RECIPIENT_EMAIL** comes from the work-queue item's `email.recipientEmail` field (confirmed
to be non-null because this item is in the drafting queue).

If `create_draft` fails for an **approved** email:
- **DO NOT call `PATCH .../status { status: 'failed' }`** -- `approved → failed` is an ILLEGAL
  state-machine transition that returns 400 (Pitfall 1).
- Add the email to the failed list in memory: `FAILED_LIST+=("$CONTACT_NAME ($EMAIL_ID): $ERROR")`
- Leave the email in `approved` state (it will appear in the next run's queue).
- Continue to the next email.

### 4d. Write back the draft ID

Once `create_draft` returns a draft ID, immediately call `PATCH .../draft` with the new ID.
Each write-back must complete before moving to the next email, so an interrupted run re-queues
the remaining items cleanly on the next invocation.

```bash
TOKEN=$(cat ~/.heimdall/api-token)
NEW_GMAIL_DRAFT_ID="<id from create_draft response>"
PAYLOAD=$(jq -n --arg gmailDraftId "$NEW_GMAIL_DRAFT_ID" \
  '{gmailDraftId: $gmailDraftId}')
RESULT=$(curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" \
  "http://localhost:4000/api/outreach-campaigns/$CAMPAIGN_ID/emails/$EMAIL_ID/draft")
SUCCESS=$(echo "$RESULT" | jq -r '.success')
if [ "$SUCCESS" != "true" ]; then
  ERROR=$(echo "$RESULT" | jq -r '.error')
  echo "Draft write-back failed for $EMAIL_ID: $ERROR"
  FAILED_LIST+=("$CONTACT_NAME ($EMAIL_ID): $ERROR")
  # Do NOT call /status for an approved email -- leave as approved, continue
else
  DRAFTED_COUNT=$((DRAFTED_COUNT + 1))
fi
```

The `PATCH .../draft` route (D-01) atomically:
1. Validates `canEmailTransition(email.status, 'drafted')` -- returns 400 if not approved
2. Sets `gmailDraftId`, `status = 'drafted'`, `draftedAt`, `updatedAt` on the email
3. Sets `contact.outreachStatus = 'reached_out'`, `updatedAt` on the contact
4. Logs an `outreach_email_drafted` timeline event

One call does all four effects. Do NOT make a separate `/status` PATCH call after this.

---

## Step 5: End-of-run summary

After all discovery and drafting is complete, print the full run summary:

```
--- Run complete ---
Campaign: <campaign-id>

Drafted:                    N
Skipped (archived contact): S
Discovered:                 K
Ambiguous:                  J  (listed below -- resolve manually then re-run)
LinkedIn fallback:          L
Failed:                     F  (left as 'approved' -- listed below)

Ambiguous contacts (2+ candidate addresses -- recipientEmail left unset):
  - <firstName> <lastName> (<emailId>): <addr1>, <addr2>, ...

LinkedIn fallback contacts (no email found -- channel set to linkedin_message):
  - <firstName> <lastName> (<emailId>)
  ...

Failed emails (left as 'approved' -- draft or write-back error):
  - <firstName> <lastName> (<emailId>): <error first 100 chars>
  ...
```

If all succeeded with no failures, ambiguous, or LinkedIn fallbacks: "Drafted: N / Discovered: K / Failed: 0"

The owner reviews drafted emails directly in Gmail. Ambiguous contacts must be resolved
manually via a direct `PATCH .../recipient` API call with the correct address, then re-run
this skill. LinkedIn-flagged contacts show the "needs LinkedIn message" badge in the Heimdall
review UI automatically.

---

## Constraints

- **REST-only.** Never touch the database directly. Every read and every write goes through
  the REST API at `http://localhost:4000`. This is the architectural invariant that ensures
  CLI parity.
- **Never log the bearer token.** Use `$(cat ~/.heimdall/api-token)` inline in every curl
  call so the resolved token value never appears in shell history or run output.
- **Gmail tool allowlist (D-06).** This skill may ONLY call these Gmail MCP tools:
  `mcp__gmail__search_threads`, `mcp__gmail__get_thread`, `mcp__gmail__create_draft`,
  `mcp__gmail__list_drafts`. It NEVER calls any send, trash, import, delete, or modify tool.
- **Pre-run grep gate (D-06).** Before any real campaign run, run:
  ```bash
  grep -ri "send" .claude/skills/draft-outreach-emails/
  ```
  Confirm zero send-family results. Any match is a safety violation -- investigate before
  proceeding. The connected MCP exposes no send tool at all; this gate is defense-in-depth.
- **Never sends. Only creates drafts.** Hard invariant. A human must open Gmail and manually
  click Send on each draft. The skill has no path to trigger sending.
- **Batch-only (D-05).** The only argument is `<campaign-id>`. No `--discover-only` or
  `--draft-only` flags. Both phases run in a single invocation.
- **No database columns for transient state (D-04).** Ambiguous candidates live in the run
  summary only -- no `candidates` column exists or will be added. If you need durable tracking
  of ambiguous candidates, resolve them manually and re-run.
- **approved → failed is ILLEGAL.** The state machine does not permit this transition
  (`email-status.ts`: `approved: ['drafted', 'edited']`). Never call `PATCH .../status
  { status: 'failed' }` for an approved email that fails to draft. Leave it `approved` and
  report in the summary.
- **No per-email contact re-fetch.** All contact data is in the work-queue response. Do NOT
  make separate `GET /api/contacts/<id>` calls per email -- the contacts LEFT JOIN is already
  returned by the list endpoint.
- **jq for all JSON payloads.** Use `jq -n --arg` for every PATCH body. Never interpolate
  email subjects, bodies, or error strings directly into a raw `-d "{...}"` string -- multi-line
  content breaks raw JSON and produces 500 errors server-side.
