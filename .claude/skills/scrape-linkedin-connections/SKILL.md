---
name: scrape-linkedin-connections
description: 'Scrape 2nd-degree LinkedIn connections at a target company. Drives vercel-labs/agent-browser through job → company → employees → 2nd-degree filter, extracts prospects, writes them back to Heimdall.'
argument-hint: '[job-lead-id-or-url]'
allowed-tools:
  - Read
  - Bash
---

## Overview

You are scraping LinkedIn 2nd-degree connections for a Heimdall job lead, using
`vercel-labs/agent-browser` to drive a real Chrome window. Navigate the canonical
four-step LinkedIn path, extract prospects in the five-field `ScrapedProspect`
shape, and write them back to Heimdall via REST.

Read first:

- [`references/linkedin-navigation.md`](references/linkedin-navigation.md) — canonical job → company → employees → 2nd-degree filter path + selector hints.
- [`references/heimdall-api.md`](references/heimdall-api.md) — the four endpoints, bearer-token auth, response envelope.
- [`references/troubleshooting.md`](references/troubleshooting.md) — known anti-bot patterns mapped to the five error categories.

## Setup

User-side prerequisites (surface the gap and stop if any are missing — do NOT
attempt to fix automatically):

- `~/.heimdall/api-token` exists (chmod 600; created by `npm run token:generate`).
- `.env.local` has `API_TOKEN_HASH=<sha256 of the token>` and `SINGLE_USER_EMAIL=steve@bronstein.org`.
- Heimdall dev server running on `http://localhost:4000` (`npm run dev`).
- `vercel-labs/agent-browser` installed and runnable from Bash. Subcommand names (`snapshot`, `click @e<n>`, `ai chat`, etc.) shift between versions — consult the installed agent-browser README for current verbs; this skill does NOT pin a version.
- LinkedIn signed in inside the visible Chrome window backed by `~/.heimdall/linkedin-profile/`. If expired, the user re-logs in manually before continuing.

## Argument parsing

The user's argument is in `$ARGUMENTS`. Branch on its shape:

- **Empty / absent** → drain mode. Go to the "Drain mode" section.
- **UUID-shaped** (matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`) → claim this specific lead by ID. Go to the "Single-lead mode" section.
- **Starts with `https://`** → URL mode. First POST the URL to `/api/job-leads` to create a `pending` → `scraped` → `queued` lead (the existing cheerio job-page scraper runs in-app), capture the returned UUID, then proceed as if a UUID was given.
- **Anything else** → surface "Argument did not look like a UUID or a URL: `<value>`" and stop. Do NOT guess.

## Drain mode (no arg)

1. Fetch the queue:
   ```bash
   TOKEN=$(cat ~/.heimdall/api-token)
   curl -s -H "Authorization: Bearer $TOKEN" \
     'http://localhost:4000/api/job-leads?status=queued&limit=50'
   ```
2. Render `data` as a markdown table: `id`, `companyName`, `roleTitle`, "queued since" (from `updatedAt`).
3. Ask the user: "Process all N? Process the first then ask again? Skip and exit?"
4. For each approved lead, run the single-lead flow (next section), narrating each agent-browser action.
5. On failure: write the categorized error (see "Error handling") and CONTINUE to the next lead — do NOT abort the batch.
6. End with a summary: `N processed, M succeeded, K failed (categories: Timeout: x, LinkedIn navigation failed: y, ...)`.

## Single-lead mode (UUID or URL arg)

1. **Claim.** PATCH `/api/job-leads/<lead-id>/status` body `{ "status": "searching" }`.
   - `success: true` → you own the lead; proceed.
   - `400` "Invalid transition" → another instance claimed it; log "Lead `<id>` already claimed, skipping" and exit cleanly. Do NOT write `'failed'`.
   - `404` → lead does not exist; surface and exit.
2. **Launch agent-browser** against `~/.heimdall/linkedin-profile/`. Subcommands depend on the installed version (consult its README). If attach fails, instruct the user to confirm LinkedIn is signed in in the visible window and continue.
3. **Navigate** (read `references/linkedin-navigation.md`):
   - Open `linkedinJobUrl` (from the PATCH response's `data`).
   - Click the company name link (the `a[href*="/company/"]` near the top).
   - Click the "X employees" / "View all employees" link.
   - Apply the "2nd-degree connections" filter.
4. **Extract** five fields per `ScrapedProspect`:
   - `name` (required, 1–200 chars)
   - `title` (0–300 chars or null)
   - `linkedinUrl` (valid URL or drop the row)
   - `profileSnippet` (visible blurb, 0–500 chars or null)
   - `mutualConnectionNames` (0–50 strings each 1–200 chars, parsed from the "X mutual connections" subline)
5. **Paginate** up to page 10 (per JL2-04 carry-forward; do NOT exceed). Stop earlier if "Next" is disabled.
6. **Write back:**
   - **Success** (navigation completed, ≥1 prospect): POST `/api/job-leads/<lead-id>/prospects` body `{ "prospects": [...] }`. The API flips the lead to `'found'` and emits the timeline event automatically — no separate PATCH `/status` needed. Confirm via `{ success: true, data: { insertedCount, lead } }`.
   - **Zero prospects after pagination terminated:** failure path — PATCH `/status` to `'failed'` with `lastError: "No prospects found: pagination exhausted at page <n>"`. The UI surfaces this rather than leaving the lead silently in `'searching'`.

## Error handling

Every failure is written back to Heimdall via PATCH `/status` to `'failed'` with
`lastError: "<Category>: <detail>"` (first ~200 chars of detail). See
`references/troubleshooting.md` for the full mapping. Categories:

- **`Timeout`** — page load > 30s, stale click, network stall, snapshot hung.
- **`LinkedIn navigation failed`** — expected button/link missing, sign-in redirect, captcha, stealth company (no company link), tiny company (no employees link).
- **`No prospects found`** — zero rows after pagination terminated.
- **`Browser unavailable`** — agent-browser can't find Chrome, user-data-dir locked, binary not installed.
- **`Unknown error`** — anything else; include the first 200 chars verbatim. If the same Unknown error fires twice in a drain run, pause and ask the user.

Failure PATCH shape:

```bash
TOKEN=$(cat ~/.heimdall/api-token)
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"failed","lastError":"Timeout: navigation exceeded 30000ms on /jobs/123"}' \
  "http://localhost:4000/api/job-leads/$LEAD_ID/status"
```

## Constraints

- Do NOT mock or skip the API write — a "successful" run that never POSTed prospects is a bug.
- Do NOT proceed if any API call returns `401`. Re-check `.env.local` `API_TOKEN_HASH` ↔ `~/.heimdall/api-token` consistency and `SINGLE_USER_EMAIL`; surface and exit.
- Do NOT loop on a stuck navigation. Per-lead budget ~5 min; on overrun, emit `Timeout: <what stalled>` and move on.
- Do NOT batch-claim multiple leads before scraping. Per-lead claim → scrape → write (D-10 + D-11). If two instances race, the state-machine PATCH rejects the second claim and that instance skips the lead.
- Do NOT touch the DB directly — every write goes through REST. This is the architectural reason the skill exists.
- Do NOT log the bearer token. Use `$(cat ~/.heimdall/api-token)` inline in curl so the resolved value never appears in shell history. Redact if printed for debugging.
