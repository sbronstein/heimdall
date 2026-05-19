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
`vercel-labs/agent-browser` to drive a real Chrome window. Navigate the appropriate
LinkedIn path, extract prospects in the five-field `ScrapedProspect` shape, and write
them back to Heimdall via REST.

The skill now accepts three input shapes in addition to UUID:

- A **LinkedIn company URL** (path containing `/company/<slug>`) — creates a synthetic lead via
  `POST /api/job-leads { companyName, linkedinCompanyUrl }` and navigates directly to the
  company's `/people/` page (job-posting step skipped).
- A **bare company name** (anything that is not a UUID, a URL, or empty) — runs a LinkedIn
  company search and presents top 3–5 matches inline as a markdown numbered list, then waits for
  the user's pick before scraping.
- Drain mode (`linkedinJobUrl === null` leads) now branches directly to `/company/<slug>/people/`
  navigation when the company URL is known, skipping the job → company → employees chain.

Read first:

- [`references/linkedin-navigation.md`](references/linkedin-navigation.md) — three entry-point paths (Job-URL / Company-URL / Bare-name) + shared Steps 4–5 (2nd-degree filter + paginate/extract) + selector hints.
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

The user's argument is in `$ARGUMENTS`. After `trim()`, branch in this order (first match wins):

1. **Empty / whitespace-only** → drain mode. Go to "Drain mode". (D-02: whitespace-only normalized via `trim()`; quoted-empty shell quirks like `""` and `''` roll into this bucket.)

2. **UUID-shaped** (matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`) → single-lead UUID flow. Go to "Single-lead mode".

3. **Parses as a URL AND `pathname.split('/').filter(Boolean)[0] === 'company'`**:
   - Extract slug via `new URL(arg)` → `pathname.split('/').filter(Boolean)` → take `segments[0]` (must be `'company'`) and `segments[1]` (the slug). Reject if `segments[1]` is undefined.
   - Canonical URL: `https://www.linkedin.com/company/${slug}/`
   - Tolerates trailing segments (`/about/`, `/people/`, `/jobs/`, etc.) and query/fragment.
   - → **Company-URL flow**: navigate via `references/linkedin-navigation.md` § Company-URL path. Per Company-URL Step 4, POST `/api/job-leads` with `{ companyName: <extracted-or-slug>, linkedinCompanyUrl: <canonical-url> }`. Handle 200 and 201 identically — capture the returned `data.id` and claim via PATCH `/status`. Then proceed to Single-lead mode from Step 4 onward (extract / paginate / write-back).

4. **Parses as a URL** (any other shape — e.g., `/jobs/view/123`) → existing job-URL flow. POST `{ linkedinJobUrl: <arg> }` to `/api/job-leads` (the cheerio job-page scraper runs in-app, lead transitions `pending → scraping → scraped`; the existing UI flow handles the manual flip to `queued`). Go to "Single-lead mode" with the returned `data.id`.

5. **Anything else** → bare-name flow. Treat `arg` as a company name (already filtered: not UUID, not URL, non-empty). Follow `references/linkedin-navigation.md` § Bare-name path. After the user picks, POST `/api/job-leads { companyName: arg, linkedinCompanyUrl: <picked-url> }` and proceed to Single-lead mode.

No "stop and ask" branch — every non-empty input now routes somewhere.

For the Company-URL and Bare-name flow navigation details, see `references/linkedin-navigation.md` § Company-URL path and § Bare-name path respectively.

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
3. **Navigate** — choose the entry-point path based on the lead's shape and how it arrived. See `references/linkedin-navigation.md` for the full step lists of each path:
   - **From URL/UUID job-URL lead** (lead has `linkedinJobUrl !== null`) → follow `references/linkedin-navigation.md` § Job-URL path (Steps 1–3).
   - **From company-URL input** → follow § Company-URL path. (The POST `/api/job-leads { companyName, linkedinCompanyUrl }` happens at Company-URL Step 4 — the response is 201 newly created OR 200 idempotent dedup; treat both identically and use the returned lead id.)
   - **From bare-name input** → follow § Bare-name path (search → disambiguate → user picks → derive URL); after the pick, proceed as in the Company-URL path's Step 4 (POST /api/job-leads) and onward.
   - **From company-scope queued lead** (`lead.linkedinJobUrl === null && lead.companyLinkedinUrl !== null`) → follow § Company-URL path starting at Company-URL Step 2 (direct /people/ navigation). Do NOT POST `/api/job-leads` again — the lead already exists.
   - **From company-scope queued lead with `companyLinkedinUrl === null`** → run § Bare-name path inline (D-14 mid-drain fallback). After the pick, PUT /api/companies/<lead.companyId> `{ linkedinUrl: <picked> }` to backfill — **note: PUT, not PATCH** (the route is `src/app/api/companies/[id]/route.ts:55`'s PUT handler). Then proceed to Company-URL Step 2.

   All paths converge at `## Shared` Step 4 (apply 2nd-degree filter) in the navigation doc.
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
