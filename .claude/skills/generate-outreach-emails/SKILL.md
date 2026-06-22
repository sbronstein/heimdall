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

## Overview

This skill runs `generate-outreach-emails <campaign-id>` and drains every `pending` email in
that campaign -- authoring a personalized subject + body for each contact, self-checking for
LLM tells, and writing results back through the Heimdall REST API.

**Read these two reference docs before authoring any email:**

- [`references/voice-guide.md`](references/voice-guide.md) -- Steve's networking-email voice,
  email anatomy, length by closeness, the anti-hallucination contract, and the blocking LLM-tell
  scrub list.
- [`references/heimdall-api.md`](references/heimdall-api.md) -- the three endpoints this skill
  calls (generation-context, /generation write-back, /status failure path), bearer-token auth
  pattern, and response envelope.

**Batch-only contract (D-13).** The only argument is a `<campaign-id>` (UUID). There is NO
`--email <id>` single-regenerate mode. If you need to regenerate one email, use the review UI
to reset that row to `pending` and re-run the batch -- the skill drains purely on
`status='pending'` and will pick it up automatically.

---

## Setup

Verify all prerequisites before proceeding. Surface the gap and stop if any are missing -- do
NOT attempt to fix automatically.

- `~/.heimdall/api-token` exists (chmod 600; created by `npm run token:generate`).
- `.env.local` has `API_TOKEN_HASH=<sha256 of the token>` and
  `SINGLE_USER_EMAIL=steve@bronstein.org`.
- Heimdall dev server running on `http://localhost:4000` (`npm run dev`).

```bash
# Verify token file exists
[ -f ~/.heimdall/api-token ] && echo "token found" || echo "MISSING: ~/.heimdall/api-token"

# Verify env vars
grep -q 'API_TOKEN_HASH' .env.local && echo "API_TOKEN_HASH set" || echo "MISSING: API_TOKEN_HASH in .env.local"
grep -q 'SINGLE_USER_EMAIL' .env.local && echo "SINGLE_USER_EMAIL set" || echo "MISSING: SINGLE_USER_EMAIL in .env.local"
```

---

## Step 1: Read the queue once

Call `GET /api/outreach-campaigns/<id>/generation-context` **exactly once per run** with the
bearer token. This is the **sole per-contact data source** for the entire run. It returns the
campaign `goalInstruction` plus one entry per pending email, each embedding the full contact
brief and up to 3 recent interactions.

**Do NOT make per-email contact or interaction fetches.** Do NOT loop back to this endpoint
per email. Do NOT call any separate contacts or interactions endpoint in a per-email loop --
the `generation-context` endpoint already returns everything (contact brief + recent
interactions + `lowContext` flag) for every pending email in one response.

```bash
TOKEN=$(cat ~/.heimdall/api-token)
CAMPAIGN_ID="$ARGUMENTS"

CONTEXT=$(curl -s \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/outreach-campaigns/$CAMPAIGN_ID/generation-context")

echo "$CONTEXT" | head -c 500
```

Check the response envelope: if `success: false`, surface the `error` string and exit.

- `401` -- token / env misconfiguration; surface and exit.
- `404` -- campaign not found; surface and exit.
- `500` -- server error; surface and exit.

Store `data.goalInstruction` and `data.emails` for use throughout the run. The `emails` array
contains all `status='pending'` emails for this campaign -- a `pending` row may carry stale
`generatedSubject`/`generatedBody` from a prior pass; the skill will overwrite them.

---

## Step 2: Confirm count (D-03)

Count the emails in `data.emails`. Report to the owner:

```
N pending emails found for campaign <id>.
Proceed? (yes / no)
```

Wait for explicit confirmation before proceeding. If `N = 0`, report "No pending emails -- run
complete." and exit cleanly.

---

## Step 3: Sample gate -- 5 emails before the full drain (D-04)

Before draining all N emails, generate a **sample of 5** and wait for owner approval. This lets
the owner see the voice in action and request tone tweaks before committing to the full campaign.

### Selecting the 5 sample contacts

Spread across relationship types using `closeness` and `howMet`:

1. **A real friend** (closeness 1-2, or `howMet` that clearly names a personal connection) --
   pick the one with the richest interaction history.
2. **A former colleague / professional acquaintance** (closeness 3-5, or `howMet` referencing a
   shared employer or team) -- pick the one with the most meaningful interactions.
3. **A distant contact** (closeness 6-8, or thin `howMet` like "LinkedIn") -- pick any.
4-5. Fill the remaining two slots with whatever spread is available; if the campaign has fewer
   than 5 emails total, use all of them.

If any category is absent from the pending set, fall back gracefully -- fill the slot with
the next-best relationship type rather than waiting for an ideal sample.

Flag any sample contact with `lowContext: true` inline so the owner sees how those will look.

### Author the 5 sample emails

Apply `references/voice-guide.md` fully:
- Greeting: `Hey <firstName>,`
- Hook: draw only on `howMet`, `companyAtConnection`, `roleAtConnection`, `currentCompany`,
  `title`, and the `interactions` array from the contact brief -- never invent shared history.
- Adapt `goalInstruction` into a soft ask calibrated to this person's closeness tier.
- Sign-off: `Steve` or `Thanks, Steve`.
- Run the **blocking LLM-tell scan** (see Step 4c) before showing each sample; rewrite until
  it passes.

### Show samples inline and wait

Display each of the 5 emails clearly labeled:

```
--- Sample 1/5: <firstName> <lastName> (<closeness>, <howMet snippet>) ---
Subject: <subject>

<body>
---
```

For any `lowContext: true` contact, add: `[LOW CONTEXT: email draws only on howMet/role]`

Then ask:

```
Sample ready. Thumbs up to drain the remaining N-5, or share tone tweaks first.
```

Wait for the owner's response before proceeding. Apply any requested tone adjustments to the
authoring approach (not just to the 5 samples) before the full drain.

---

## Step 4: Chunked drain -- remaining emails (D-01)

After the sample is approved, process the remaining pending emails (those not in the 5-email
sample) in bounded passes of ~10-15 emails per pass.

**The hard durability rule (D-01):** write each email back to the API before authoring the
next one. Progress is durable -- if the run is interrupted, the remaining emails stay `pending`
and the skill picks them up cleanly on re-run.

All per-contact facts come from the already-fetched `data.emails` payload. Do NOT re-fetch
`generation-context` or call any other read endpoint mid-run.

### 4a. Per-email authoring (GEN-02)

For each email entry from `data.emails` (skipping the 5 already written back in the sample):

1. Read the contact brief: `firstName`, `howMet`, `companyAtConnection`, `roleAtConnection`,
   `currentCompany`, `title`, `closeness`.
2. Read the interactions array (up to 3 entries: `type`, `summary`, `occurredAt`).
3. Note `lowContext: true/false` and the campaign `goalInstruction`.

Author the email following `references/voice-guide.md`:

- **Subject:** casual, specific, short (see voice-guide.md §2 for examples). Vary naturally
  across the campaign -- no uniform template.
- **Greeting:** always `Hey <firstName>,`
- **Hook:** draw only on `howMet`, `companyAtConnection`, `roleAtConnection`, `currentCompany`,
  `title`, and the `interactions` array. If `lowContext: true`, draw only on `howMet`,
  `companyAtConnection`, `roleAtConnection` -- keep the email short and the hook brief; do
  not add context you do not have.
- **Ask:** a soft, low-pressure close adapted from `goalInstruction` to this person's
  closeness tier (see voice-guide.md §1 and §2 for the ask variants).
- **Sign-off:** `Steve` or `Thanks, Steve` (first name only, no surname).
- **Anti-hallucination (D-11/GEN-04):** reference ONLY facts present in the contact brief or
  `steve-fact-bank.md`. Never invent shared history, past conversations, or projects not in
  the `interactions` array. When `howMet` is blank, say so lightly ("We connected a while
  back...") rather than fabricating an origin.

### 4b. Vary length by closeness

| Closeness | Target length |
|-----------|---------------|
| Distant (6-8) | 2-4 sentences: greeting, brief hook, soft ask, sign-off |
| Colleague (3-5) | 3-5 sentences or a short paragraph + ask |
| Friend (1-2) | Up to 2 short paragraphs -- warmer hook, more context |

Use judgment. Rich interaction history warrants a warmer tone even for a nominally distant
closeness score.

### 4c. Blocking LLM-tell gate (D-10)

Before writing back any email, scan it for the blocking set. No email is written back until it
passes every check:

```bash
# Check for em-dashes (U+2014) and en-dashes (U+2013) -- use plain hyphens only
grep -nP '\x{2014}|\x{2013}' email.txt || echo "no em/en dashes"

# Check for blocking words and generic opener
grep -niE "leverage|robust|I hope this (message|email) finds you" email.txt || echo "no blocking terms"
```

If any blocking hit is found, rewrite the offending phrase in-place and re-scan. Repeat until
the email passes. Use plain hyphens, replace "leverage" with "use"/"apply", replace "robust"
with "solid"/"strong", replace the generic opener by starting directly with the person.

After a blocking pass, also run the advisory scan (do not block on these, but surface them
if they appear so you can rewrite where natural):

```bash
grep -niE "delve|tapestry|navigate the|in today's|boast|underscore|testament|realm|not just|isn't just|it's not|not only|seamless|cutting-edge|game-chang|elevate|unlock|pivotal|moreover|furthermore" email.txt || echo "no advisory tells"
```

### 4d. Success write-back -- one call per email

Once the email passes the blocking scan, write it back with a **single** PATCH call:

```bash
TOKEN=$(cat ~/.heimdall/api-token)
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"generatedSubject\":\"$SUBJECT\",\"generatedBody\":\"$BODY\"}" \
  "http://localhost:4000/api/outreach-campaigns/$CAMPAIGN_ID/emails/$EMAIL_ID/generation"
```

This single PATCH persists `generatedSubject`, `generatedBody`, and `generatedAt`, AND
advances the email's `status` to `'generated'` server-side (via `canEmailTransition`). Do NOT
make a separate `/status` PATCH call to mark success -- the `/generation` route handles the
transition internally.

Check the response: if `success: false`, fall through to the failure path (Step 4e) rather
than continuing silently.

### 4e. Failure handling -- mark failed and continue (D-12)

On any per-email failure (authoring error, API error, unresolvable blocking scan after
multiple rewrite attempts), call the status endpoint with `{ status:'failed', lastError }` and
continue to the next email without crashing:

```bash
TOKEN=$(cat ~/.heimdall/api-token)
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"status\":\"failed\",\"lastError\":\"$LAST_ERROR\"}" \
  "http://localhost:4000/api/outreach-campaigns/$CAMPAIGN_ID/emails/$EMAIL_ID/status"
```

Keep `lastError` to the first ~200 chars of the error message (500-char Zod limit on the
route). Then **continue to the next email** -- do not abort the full run on a single failure.

Track the `emailId`, `firstName`, and error reason for the end-of-run summary.

API error handling by status code:

| Code | Meaning | Skill action |
|------|---------|--------------|
| 400 (Invalid transition) | State-machine guard | Log and continue to next email |
| 400 (Zod field error) | Bug in skill payload | Surface error string and exit |
| 401 | Token / env misconfiguration | Surface and exit |
| 404 (Campaign not found) | Campaign ID invalid | Surface and exit |
| 404 (Email not found) | Email ID mismatch | Log and continue |
| 500 | Server error | Surface and exit |

### 4f. Low-context tracking (D-08)

When `lowContext: true`, generate the email as above (drawing only on `howMet`/company/role),
write it back normally (the email is not blocked by `lowContext`), and collect the contact for
the run summary. **No `lowContext` or `needsReview` column is added to the database** -- the
flag is ephemeral in the run output only (D-08).

---

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

If all generated and no failures: "Generated: N / Failed: 0 / Low-context: K"

The owner reviews generated emails in the Heimdall UI. Low-context emails appear in the
review queue alongside all others -- no special badge (ephemeral flag only, D-08).

---

## Constraints

- **REST-only.** Never touch the database directly. Every read and every write goes through
  the REST API at `http://localhost:4000`. This is the architectural invariant that ensures
  CLI parity.
- **Never log the bearer token.** Use `$(cat ~/.heimdall/api-token)` inline in every curl
  call so the resolved token value never appears in shell history or run output.
- **No email is written back until it passes the blocking LLM-tell scan.** Rewrite first,
  then call `/generation`.
- **No `--email <id>` single-regenerate mode (D-13).** Batch-only. Use the review UI to
  reset a row to `pending` and re-run if you need to redo one email.
- **No new database columns (D-08).** The `lowContext` flag is ephemeral in the run summary;
  no `needsReview` or `lowContext` column is added to `outreach_emails`.
- **No invented shared history (D-11/GEN-04).** Reference only facts from the
  `generation-context` payload and `steve-fact-bank.md`.
- **One `generation-context` read per run (D-01).** Fetch once at the start, author all
  emails from that payload. Do not re-fetch mid-run.

