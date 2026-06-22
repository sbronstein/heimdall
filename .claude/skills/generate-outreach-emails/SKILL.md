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
