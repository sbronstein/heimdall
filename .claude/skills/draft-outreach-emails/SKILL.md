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
  - mcp__claude_ai_Gmail__search_threads
  - mcp__claude_ai_Gmail__get_thread
  - mcp__claude_ai_Gmail__create_draft
  - mcp__claude_ai_Gmail__list_drafts
---

> **Gmail MCP tool names are connector-dependent.** The read/draft tools may be exposed as
> `mcp__gmail__*` or, depending on how the Gmail connector is registered, as
> `mcp__claude_ai_Gmail__*` (the form the Anthropic Gmail connector uses). Both name families
> are allowlisted above. Use whichever `search_threads` / `get_thread` / `create_draft` /
> `list_drafts` tools are actually in scope this session; everywhere below they are written as
> `<gmail>__search_threads` etc. — substitute the real prefix. These tools are deferred, so load
> their schemas with ToolSearch (`select:mcp__claude_ai_Gmail__search_threads,...`) before the
> first call.

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
- Gmail MCP tools in scope: `<gmail>__search_threads`, `<gmail>__get_thread`,
  `<gmail>__create_draft`, `<gmail>__list_drafts` must be available in the current Claude Code
  session (under either the `mcp__gmail__*` or `mcp__claude_ai_Gmail__*` prefix — see the note
  at the top of this file). This skill requires an **interactive** Claude Code session with the
  Gmail MCP connected. If any Gmail tool is missing from scope, stop and surface the gap -- do
  NOT proceed without them. **`create_draft` requires a compose/manage-drafts scope** — a
  read-only Gmail grant passes the read probes below but fails the first `create_draft` with
  "Request had insufficient authentication scopes". If that happens, re-authorize the Gmail
  connector with the compose permission and re-run; the skill is idempotent.

```bash
# Verify jq is installed (required for correct JSON escaping of multi-line bodies)
command -v jq >/dev/null && echo "jq found" || echo "MISSING: jq (brew install jq)"

# Verify token file exists
[ -f ~/.heimdall/api-token ] && echo "token found" || echo "MISSING: ~/.heimdall/api-token"

# Verify env vars
grep -q 'API_TOKEN_HASH' .env.local && echo "API_TOKEN_HASH set" || echo "MISSING: API_TOKEN_HASH in .env.local"
grep -q 'SINGLE_USER_EMAIL' .env.local && echo "SINGLE_USER_EMAIL set" || echo "MISSING: SINGLE_USER_EMAIL in .env.local"
```

Then confirm Gmail MCP availability: attempt `<gmail>__search_threads` with a minimal test
query (`query: "test"`, `pageSize: 1`) and `<gmail>__list_drafts` (`pageSize: 1`) to confirm
the read tools are in scope. If a tool call returns an error indicating the MCP is not
connected, stop and instruct the user to start an interactive Claude Code session with the
Gmail MCP active. (Compose scope is only exercised later at `create_draft` — see the scope note
above.)

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

# Initialize all run counters and accumulator arrays (IN-02).
# Integers default to 0 in bash arithmetic but arrays must be explicitly declared;
# without this block the first += append fails under set -u (unbound variable).
DRAFTED_COUNT=0
DISCOVERED_COUNT=0
SKIPPED_LIST=()
AMBIGUOUS_LIST=()
LINKEDIN_FALLBACK_LIST=()
FAILED_LIST=()
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

**Response shape (verified against the connected Anthropic Gmail MCP, 2026-06).** `search_threads`
and `get_thread` return each message's participants as **bare email-address strings** in
`sender` (one address) and `toRecipients` / `ccRecipients` (arrays) — there is **no**
`payload.headers` array and **no display names** anywhere in the structured response (display
names appear only inside `plaintextBody` / `htmlBody`, even at `messageFormat: "FULL_CONTENT"`).
The earlier design's display-name match (`From: "Name <email>"`) therefore cannot run. Discovery
below identifies the contact's address **without** display names, using a clean-1:1 heuristic.

**What this buys and what it costs (read before trusting a result):**
- *Precision (never wrong):* a co-participant on a group or calendar thread (e.g. a colleague
  cc'd alongside the contact) is **never** attributed to the contact — group threads are skipped
  entirely. Automated/bulk senders (LinkedIn, newsletters, calendar bots) are excluded.
- *Cost 1 (group-only contacts):* a contact who only ever appears in multi-party threads with
  Steve (never a clean 1:1) yields zero candidates → LinkedIn fallback. Safe, not wrong.
- *Cost 2 (shared surname):* because there are no display names, a different person who shares
  the contact's search terms **and** also corresponds 1:1 with Steve (e.g. "Tim Mitchell" vs a
  "…mitchell@…" address) surfaces as a second distinct candidate → the contact is flagged
  **ambiguous** for manual resolution rather than auto-drafted. Safe, not wrong.

The accept rule (exactly-one → draft; two-or-more → ambiguous/manual; zero → LinkedIn) is
unchanged — only the candidate-gathering method changed.

### 3a. Search for threads

Call `search_threads` with the contact's full name. Use `THREAD_VIEW_METADATA_ONLY` — that view
already returns each message's `sender` / `toRecipients` / `ccRecipients`, so a separate
`get_thread` per thread is not required for participant extraction.

```
<gmail>__search_threads {
  query: "<firstName> <lastName>",        // e.g. "Marc Dupuis" — full-text match on name
  pageSize: 25,                           // max 50; 25 covers the recent history that matters
  view: "THREAD_VIEW_METADATA_ONLY"
}
// Verified response shape:
// { threads: [ { id, messages: [ {
//       sender: "marc@fabi.ai",                       // ONE bare address, no display name
//       toRecipients: ["steve@bronstein.org"],        // array of bare addresses
//       ccRecipients: ["lei@fabi.ai"]                 // array (often absent/empty)
//   }, ... ] }, ... ] }
```

If `search_threads` returns no threads, skip to step 3d (LinkedIn fallback). Save the raw JSON
response to a temp file (e.g. `/tmp/disc_<emailId>.json`) for the extractor in 3b — do NOT pipe
it through `echo`, which mangles the JSON.

`get_thread` (same connector prefix, `{ threadId, messageFormat: "MINIMAL" }`) is available for
spot-checking a single thread, but is not part of the normal path.

### 3b. Extract the contact's distinct addresses (clean-1:1 heuristic)

Reset per contact (WR-01: addresses must not bleed across contacts), then run the extractor over
the saved `search_threads` JSON. The extractor keeps an address **only** when it is the sole
external, non-bulk participant of a thread (a clean 1:1 between Steve and one other person) —
this is what replaces the missing display-name match.

```bash
# OWN_ADDRESS_RE: every address on Steve's own domain is "self" (covers steve@, Steve@,
#   steve-gilder@, steve+uat@, etc.). Add work aliases here if needed (e.g. stephen.bronstein@id.me).
# BULK_RE: automated / non-personal senders that can never be the contact. Extend as new
#   notification domains appear; matching here only ever EXCLUDES, so it is safe to be generous.
python3 - "$DISCOVERY_JSON_FILE" <<'PY'
import json, re, sys
data = json.load(open(sys.argv[1]))
OWN_ADDRESS_RE = re.compile(r'@bronstein\.org$', re.I)
BULK_RE = re.compile(
    r'(no-?reply|do-?not-?reply|notification|invitation|mailer-daemon|postmaster|bounce|'
    r'@linkedin\.|@substack\.|calendar-notification|@docusign|@zoom\.us|via google|automated|notify)',
    re.I)

def external_personal(a):
    a = (a or '').strip().lower()
    if not a or OWN_ADDRESS_RE.search(a) or BULK_RE.search(a):
        return None
    return a

candidates = set()
for th in data.get('threads', []):
    ext = set()
    for m in th.get('messages', []):
        for a in [m.get('sender'), *(m.get('toRecipients') or []), *(m.get('ccRecipients') or [])]:
            e = external_personal(a)
            if e:
                ext.add(e)
    # Clean 1:1 only: Steve + exactly ONE external person. Group/calendar/cc threads
    # (len(ext) >= 2) are skipped — they cannot be attributed without display names.
    if len(ext) == 1:
        candidates |= ext

for a in sorted(candidates):
    print(a)
PY
```

Capture the output into `DISTINCT_ADDRESSES` (already deduped and lowercased — Pitfall 4 handled
by the `set`) and count it:

```bash
DISTINCT_ADDRESSES=$(python3 - "$DISCOVERY_JSON_FILE" <<'PY'
... (the extractor above) ...
PY
)
DISTINCT_COUNT=$(printf '%s' "$DISTINCT_ADDRESSES" | grep -c '.' || echo "0")
```

(Run the extractor once and reuse its output; it is shown twice above only for readability.)

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
  FAILED_LIST+=("$CONTACT_NAME ($EMAIL_ID): recipient write-back failed")
  # continue to next discovery item; do NOT add to DRAFTING_QUEUE
else
  # IN-01: append the updated item (with recipientEmail set) to DRAFTING_QUEUE so
  # it is drafted in THIS run. Without this, newly-discovered emails only reach the
  # drafting loop on the NEXT run (when they appear with recipientEmail already set).
  UPDATED_ITEM=$(echo "$EMAIL_ITEM" | jq --arg addr "$DISCOVERED_ADDR" \
    '.email.recipientEmail = $addr')
  DRAFTING_QUEUE=$(echo "$DRAFTING_QUEUE" | jq --argjson item "$UPDATED_ITEM" '. += [$item]')
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

```bash
# contact hard-deleted guard:
if [ "$(echo "$EMAIL_ITEM" | jq -r '.contact')" = "null" ]; then
  FAILED_LIST+=("$CONTACT_NAME ($EMAIL_ID): contact hard-deleted")
  continue
fi

# archived contact guard (WR-02): track in SKIPPED_LIST so the run summary
# "Skipped (archived contact): S" reflects a real count, not a phantom value.
if [ "$(echo "$EMAIL_ITEM" | jq -r '.contact.archivedAt')" != "null" ]; then
  SKIPPED_LIST+=("$CONTACT_NAME ($EMAIL_ID)")
  continue
fi
```

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
<gmail>__create_draft {
  to: ["<recipientEmail>"],     // ARRAY of plain addresses (no "Name <addr>" form)
  subject: "<FINAL_SUBJECT>",
  body: "<FINAL_BODY>"          // plain text; the connector handles newlines
}
// Verified response shape:
// { id: "r6433905474510638465" }
// Use the top-level `id` as gmailDraftId. (Some Gmail connectors instead return
// { id, message: { id, threadId } }; if so, still use the top-level `id`.)
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

```bash
echo "--- Run complete ---"
echo "Campaign: $CAMPAIGN_ID"
echo ""
echo "Drafted:                    $DRAFTED_COUNT"
echo "Skipped (archived contact): ${#SKIPPED_LIST[@]}"
echo "Discovered:                 $DISCOVERED_COUNT"
echo "Ambiguous:                  ${#AMBIGUOUS_LIST[@]}  (listed below -- resolve manually then re-run)"
echo "LinkedIn fallback:          ${#LINKEDIN_FALLBACK_LIST[@]}"
echo "Failed:                     ${#FAILED_LIST[@]}  (left as 'approved' -- listed below)"
echo ""
echo "Ambiguous contacts (2+ candidate addresses -- recipientEmail left unset):"
for item in "${AMBIGUOUS_LIST[@]}"; do echo "  - $item"; done
echo ""
echo "LinkedIn fallback contacts (no email found -- channel set to linkedin_message):"
for item in "${LINKEDIN_FALLBACK_LIST[@]}"; do echo "  - $item"; done
echo ""
echo "Failed emails (left as 'approved' -- draft or write-back error):"
for item in "${FAILED_LIST[@]}"; do echo "  - $item"; done
```

If all succeeded with no failures, ambiguous, or LinkedIn fallbacks, the lists above will be
empty. The script echoes an empty block for each -- that is expected and correct.

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
- **Gmail tool allowlist (D-06).** This skill may ONLY call these Gmail MCP read/draft tools
  (under either the `mcp__gmail__*` or `mcp__claude_ai_Gmail__*` prefix): `search_threads`,
  `get_thread`, `create_draft`, `list_drafts`. It NEVER calls any send, trash, import, delete,
  or modify tool.
- **Pre-run grep gate (D-06).** Before any real campaign run, run (the `[a-z0-9_]*` segment
  matches any connector prefix, e.g. `gmail` or `claude_ai_Gmail`, so a send-family tool is
  caught regardless of how the Gmail MCP is registered):
  ```bash
  grep -rinE "mcp__[a-z0-9_]*gmail[a-z0-9_]*__(send|send_message|trash|delete|import|update_draft|modify|insert)" \
    .claude/skills/draft-outreach-emails/
  ```
  Confirm zero results (no output). Any match means a send-family Gmail MCP tool token is
  present in the skill files -- that is a safety violation; investigate before proceeding.
  The grep targets only MCP tool call tokens, not prose references to sending, so a clean
  skill produces no output at all. The connected MCP exposes no send tool; this gate is
  defense-in-depth.
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
