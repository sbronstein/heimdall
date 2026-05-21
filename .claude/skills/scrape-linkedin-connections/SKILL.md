---
name: scrape-linkedin-connections
description: 'Scrape 2nd-degree LinkedIn connections at a target company, or backfill company/role at-connection fields for individual connections. Drives vercel-labs/agent-browser through job → company → employees → 2nd-degree filter, extracts prospects, and writes them back to Heimdall. Also supports a per-profile enrichment mode (extract company + role from a connection''s profile page) and a paced batch-sweep mode to drain the 1000+ enrichment backlog.'
argument-hint: '[job-lead-id-or-url | enrich <contact-uuid-or-profile-url> | enrich]'
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

In addition, the skill supports **profile-enrichment mode** (new): scrape a single connection's
LinkedIn profile for the company and role they held at the time of connection, and write the
result back via `PATCH /api/contacts/<id>/enrichment`. A paced **batch-sweep mode** drains the
entire enrichment backlog one session at a time.

Read first:

- [`references/linkedin-navigation.md`](references/linkedin-navigation.md) — three entry-point paths (Job-URL / Company-URL / Bare-name) + Profile-page path + shared Steps 4–5 (2nd-degree filter + paginate/extract) + selector hints.
- [`references/heimdall-api.md`](references/heimdall-api.md) — all endpoints, bearer-token auth, response envelope.
- [`references/troubleshooting.md`](references/troubleshooting.md) — known anti-bot patterns mapped to the five error categories, including pacing / back-off strategy.

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

2. **`enrich` with no further argument** (i.e., `$ARGUMENTS` is exactly `enrich` after trim) → batch-sweep mode. Go to "Batch-sweep mode (drain the enrichment backlog)".

3. **`enrich <contact-uuid>`** (keyword `enrich` followed by a UUID-shaped string) → profile-enrichment mode for a specific contact by ID. Go to "Profile-enrichment mode (single connection)".

4. **`enrich <linkedin-profile-url>`** (keyword `enrich` followed by a URL whose path starts with `/in/`) → profile-enrichment mode for the connection at that profile URL. Resolve the contact from the DB by looking up the `linkedinUrl` field or prompt the user for the contact UUID if needed. Go to "Profile-enrichment mode (single connection)".

5. **UUID-shaped** (matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`, no `enrich` prefix) → single-lead UUID flow. Go to "Single-lead mode".

6. **Parses as a URL AND `pathname.split('/').filter(Boolean)[0] === 'company'`**:
   - Extract slug via `new URL(arg)` → `pathname.split('/').filter(Boolean)` → take `segments[0]` (must be `'company'`) and `segments[1]` (the slug). Reject if `segments[1]` is undefined.
   - Canonical URL: `https://www.linkedin.com/company/${slug}/`
   - Tolerates trailing segments (`/about/`, `/people/`, `/jobs/`, etc.) and query/fragment.
   - → **Company-URL flow**: navigate via `references/linkedin-navigation.md` § Company-URL path. Per Company-URL Step 4, POST `/api/job-leads` with `{ companyName: <extracted-or-slug>, linkedinCompanyUrl: <canonical-url> }`. Handle 200 and 201 identically — capture the returned `data.id` and claim via PATCH `/status`. Then proceed to Single-lead mode from Step 4 onward (extract / paginate / write-back).

7. **Parses as a URL** (any other shape — e.g., `/jobs/view/123`) → existing job-URL flow. POST `{ linkedinJobUrl: <arg> }` to `/api/job-leads` (the cheerio job-page scraper runs in-app, lead transitions `pending → scraping → scraped`; the existing UI flow handles the manual flip to `queued`). Go to "Single-lead mode" with the returned `data.id`.

8. **Anything else** → bare-name flow. Treat `arg` as a company name (already filtered: not UUID, not URL, non-empty). Follow `references/linkedin-navigation.md` § Bare-name path. After the user picks, POST `/api/job-leads { companyName: arg, linkedinCompanyUrl: <picked-url> }` and proceed to Single-lead mode.

No "stop and ask" branch — every non-empty input now routes somewhere.

For the Company-URL and Bare-name flow navigation details, see `references/linkedin-navigation.md` § Company-URL path and § Bare-name path respectively.

## Drain mode (no arg)

1. **Fetch the queue.**
   ```bash
   TOKEN=$(cat ~/.heimdall/api-token)
   curl -s -H "Authorization: Bearer $TOKEN" \
     'http://localhost:4000/api/job-leads?status=queued&limit=50'
   ```
   Each row in `data[]` now includes `companyLinkedinUrl` (D-13) — string when the linked company has a non-null `linkedinUrl`, null otherwise. Job-URL leads also carry `companyLinkedinUrl` (joined from the same `companies` row) but the drain loop ignores it for them — they navigate via `linkedinJobUrl` instead.

2. **Render `data` as a markdown table** with these columns: `id`, scope (`linkedinJobUrl ? 'job-URL' : 'company-scope'`), `companyName`, `roleTitle`, queued-since (from `updatedAt`). The scope column makes the queue mix visible to the user at a glance.

3. **Ask the user**: "Process all N? Process the first then ask again? Skip and exit?"

4. **For each approved lead, branch on `lead.linkedinJobUrl`** — this is the single-loop with inline branching per D-11 / D-12 / JL-C7:
   ```text
   print(`Lead ${lead.id}: ${lead.linkedinJobUrl ? 'job-URL' : 'company-scope'} (${lead.companyName})`)   // D-15

   if (lead.linkedinJobUrl == null) {
     // Company-scope branch (D-11, D-12, D-15)
     let url = lead.companyLinkedinUrl
     if (url == null) {
       // D-14 mid-drain fallback: bare-name search → disambiguate → backfill
       //   1. Follow references/linkedin-navigation.md § Bare-name path using lead.companyName as the keyword.
       //   2. User picks → derive url from the picked card.
       //   3. Backfill the persisted companies row so subsequent drains find a non-null companyLinkedinUrl.
       url = runBareNameFlow(lead.companyName)
       PUT /api/companies/<lead.companyId> body { linkedinUrl: url }     // Note: PUT (not PATCH). See heimdall-api.md.
     }
     print(`Lead ${lead.id}: company-scope (${lead.companyName}) — navigating to ${url}/people/...`)   // D-15
     navigate(url.endsWith('/') ? `${url}people/` : `${url}/people/`)
     // Per references/linkedin-navigation.md § Company-URL path: do NOT re-POST /api/job-leads — the lead already exists.
     // Best-effort name extraction is unnecessary here (the lead already has companyName).
   } else {
     // Job-URL branch (unchanged from Phase 5)
     // Follow references/linkedin-navigation.md § Job-URL path Steps 1–3:
     //   open lead.linkedinJobUrl → click company name link → click "X employees" link.
     navigateJobUrlBranch(lead.linkedinJobUrl)
   }

   // Both branches converge at references/linkedin-navigation.md § Shared:
   // Apply the 2nd-degree filter (Shared Step 4), paginate + extract (Shared Step 5), POST /api/job-leads/<id>/prospects.
   claimAndScrape(lead.id)
   ```

5. **On failure: write the categorized error and CONTINUE to the next lead — do NOT abort the batch.** (Same as today.) New: if the D-14 mid-drain disambiguation step is presented and the user cancels (no pick / Ctrl-C), write the failure as `LinkedIn navigation failed: user cancelled disambiguation for <companyName>` and continue to the next lead.

6. **End with a summary** (unchanged): `N processed, M succeeded, K failed (categories: Timeout: x, LinkedIn navigation failed: y, ...)`.

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

## Profile-enrichment mode (single connection)

Scrapes a single connection's LinkedIn profile page to extract the company and role
they held at the time of connection, then writes both fields back to the Heimdall
contact record via REST.

**Setup prerequisites:** same as above — `~/.heimdall/api-token`, `.env.local`, dev
server on port 4000, agent-browser runnable, LinkedIn signed in at
`~/.heimdall/linkedin-profile/`.

### Step 1: Resolve the contact

- **`enrich <contact-uuid>`** input: use the UUID directly as `$CONTACT_ID`.
- **`enrich <linkedin-profile-url>`** input (path starts with `/in/`): extract the slug
  from the URL. Look up the contact via:
  ```bash
  TOKEN=$(cat ~/.heimdall/api-token)
  curl -s -H "Authorization: Bearer $TOKEN" \
    'http://localhost:4000/api/contacts?linkedinUrl=<url>&limit=1'
  ```
  Capture `data[0].id` as `$CONTACT_ID`. If no match, surface
  `"No contact found with that LinkedIn URL"` and exit.

Also confirm the contact has a `linkedinUrl` so you know which profile to navigate to.
If it is null, surface `"Contact $CONTACT_ID has no LinkedIn URL — cannot scrape profile"` and exit.

### Step 2: Launch agent-browser

Launch `vercel-labs/agent-browser` against `~/.heimdall/linkedin-profile/`. If attach
fails, instruct the user to confirm LinkedIn is signed in in the visible Chrome window.

### Step 3: Navigate to the full experience history page

Follow `references/linkedin-navigation.md` § Profile-page path:

Navigate to `https://www.linkedin.com/in/<slug>/details/experience/` (derive `<slug>`
from the contact's `linkedinUrl`). This is the full experience history page — not just
the top experience card — because date-matching requires the complete list of roles.
Wait for the page to settle (snapshot).

**Failure modes:**
- Sign-in redirect → `LinkedIn navigation failed`.
- Captcha challenge → `LinkedIn navigation failed`.
- Page takes > 30s → `Timeout`.

### Step 3b: Read the contact's connection date

Fetch the contact record to obtain the target date for role matching:

```bash
TOKEN=$(cat ~/.heimdall/api-token)
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/contacts/$CONTACT_ID"
```

Read the `linkedinConnectionDate` field and hold it as `$CONNECTION_DATE` (ISO date
string, e.g. `"2022-03-15"`). If `linkedinConnectionDate` is null, fall back to the
most-recent role and note the limitation in the narration.

### Step 4: Extract company and role as of the connection date

From the full experience history page, reconstruct the company and role the person
held on `$CONNECTION_DATE`. This is **as-of-connection-date reconstruction** — select
the role whose date span CONTAINS the connection date, not the most-recent role.

**Date-matching algorithm:**

1. Parse every experience entry's date range (start–end; treat "Present" as ongoing /
   today). LinkedIn groups multiple roles under one company header — handle grouped
   sub-roles: each sub-role has its own title and date range nested under the parent
   company name.
2. Find the entry whose span CONTAINS `$CONNECTION_DATE` (i.e., start ≤ connection date ≤ end).
3. For a grouped company entry, use the matching sub-role's title + the parent company
   name as the company identifier.
4. Set `companyAtConnection` and `roleAtConnection` from the selected entry.

**Fallbacks (apply in order if no direct span match):**

- **Connection date predates earliest listed role:** Set both fields to `null` and log
  `"Profile history starts <year>, predates connection date <date>"`.
- **Connection date lands in an employment gap:** Use the closest prior role (the one
  whose end date is nearest to and before the connection date) and flag it:
  log `"Connection date <date> falls in employment gap; using closest prior role"`.
- **Multiple overlapping roles (concurrent employment):** Pick the primary or full-time
  role and note the concurrency: log `"Concurrent roles found; selected primary role"`.

**Selector hints** (hints only — LinkedIn DOM shifts; use a11y-tree text/role matching first):

| Target | Hint |
|--------|------|
| Experience list | section or landmark whose heading contains "Experience" on the `/details/experience/` page |
| Role entry | each `<li>` or group role element in the experience list |
| Role title | heading-level element (h3 / bold) at the top of each entry |
| Company name | secondary text element beneath the role title (or parent group heading for sub-roles) |
| Date range | text containing month/year patterns (e.g., "Jan 2021 – Mar 2023") or "Present" |

Accept `null` for either field if the experience section is absent or unreadable — write
back what you have and log the limitation.

Do NOT touch the DB directly — every write goes through REST (architectural invariant).

### Step 5: Write back via REST

```bash
TOKEN=$(cat ~/.heimdall/api-token)
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"companyAtConnection\":\"$COMPANY\",\"roleAtConnection\":\"$ROLE\"}" \
  "http://localhost:4000/api/contacts/$CONTACT_ID/enrichment"
```

Confirm `{ success: true }`. On `401`, surface the auth misconfiguration and exit. On
`400`, surface the Zod validation message and exit.

Do NOT touch the DB directly — every write goes through REST (architectural invariant).

### Step 6: Confirm and narrate

Print `Enriched <firstName> <lastName>: company="<value>" role="<value>"` (or
`company=null` / `role=null` where applicable). The API stamps `enrichmentStatus='enriched'`
and `enrichedAt` server-side and logs a `contact_enriched` timeline event — no additional
PATCH needed.

## Batch-sweep mode (drain the enrichment backlog)

Runs the profile-enrichment flow across many connections in one session, chipping away
at the 1000+ contact backlog. Designed to mimic human browsing patterns via pacing.

**Setup prerequisites:** same as above — `~/.heimdall/api-token`, `.env.local`, dev
server on port 4000, agent-browser runnable, LinkedIn signed in.

### Step 1: Fetch the enrichment queue

Choose a per-session cap (recommended: 25–40 profiles per session):

```bash
TOKEN=$(cat ~/.heimdall/api-token)
PER_SESSION_CAP=30   # adjust as desired; max 50
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/contacts/enrichment-queue?limit=$PER_SESSION_CAP"
```

Response shape (from `references/heimdall-api.md` § 8):
```json
{ "success": true, "data": { "queue": [{ "id": "uuid", "linkedinUrl": "...", "firstName": "...", "lastName": "..." }], "count": N } }
```

The queue is ordered oldest-connection-first. Contacts already `enrichmentStatus='enriched'`
or without a `linkedinUrl` are excluded server-side.

### Step 2: Render and confirm

Render `data.queue` as a markdown table with columns: `#`, `firstName lastName`, `linkedinUrl`.
Then ask the user:

> `Process all N profiles? Process the first then ask again? Skip and exit?`

### Step 3: Loop per-profile with pacing

For each approved profile, run the full Profile-enrichment mode flow (Steps 2–6 above)
for that contact — each profile is reconstructed as of its own `linkedinConnectionDate`:

```text
for contact in queue:
  print(`Profile ${n}/${total}: ${contact.firstName} ${contact.lastName} (${contact.linkedinUrl})`)

  try:
    runProfileEnrichment(contact.id, contact.linkedinUrl)
    SUCCEEDED++
  catch error:
    // Per-profile error isolation — categorize and CONTINUE, do NOT abort the sweep
    FAILED++
    print(`  Failed: <Category>: <detail (first 200 chars)>`)
    // Note: profile enrichment write-back failures are NOT written to a job-lead status PATCH;
    // they are logged inline. The contact stays unenriched and will reappear in the next queue fetch.

  // --- PACING STRATEGY (documented here per success criterion #4) ---
  // After each profile (success OR failure), wait a randomized delay before the next:
  DELAY=$(( RANDOM % 70 + 20 ))   // 20–90 seconds, uniformly random
  print(`  Waiting ${DELAY}s before next profile...`)
  sleep $DELAY

  // Anti-bot back-off: if the last profile failed with 'LinkedIn navigation failed'
  // AND the error message contains signals of a checkpoint or captcha (e.g., "captcha",
  // "checkpoint", "unusual activity", "verify you're a human"), apply extended back-off:
  //   1. Increase the delay for the NEXT profile to 120–300 seconds (random in that range).
  //   2. If two consecutive profiles hit captcha/checkpoint signals, end the session early
  //      (skip remaining profiles) and surface:
  //        "Anti-bot checkpoint detected twice in a row — ending session early. Wait 10–30 min
  //         and re-invoke. See references/troubleshooting.md for guidance."
  // This is the human-mimicking back-off strategy to avoid account action on a 1000+ sweep.
  // Full detail in references/troubleshooting.md § LinkedIn navigation failed (Pacing section).
```

**Per-session cap:** the `limit` passed to the queue endpoint (recommended 25–40) acts as
the hard per-session cap. Do not exceed it in a single run. Run multiple sessions across
days for the full backlog.

**Per-profile budget:** ~5 min per profile (carry-forward from existing per-lead budget).
On overrun, emit `Timeout: <what stalled>` and continue to the next profile.

Cross-reference `references/troubleshooting.md` for the full back-off strategy and anti-bot
signal recognition.

### Step 4: Summary

End with:
```
N processed, M succeeded, K failed (categories: Timeout: x, LinkedIn navigation failed: y, Unknown error: z)
Enrichment queue remaining: ~<total - M> profiles (run again to continue)
```

## Error handling

Every failure is written back to Heimdall via PATCH `/status` to `'failed'` with
`lastError: "<Category>: <detail>"` (first ~200 chars of detail). See
`references/troubleshooting.md` for the full mapping. Categories:

- **`Timeout`** — page load > 30s, stale click, network stall, snapshot hung.
- **`LinkedIn navigation failed`** — expected button/link missing, sign-in redirect, captcha, stealth company (no company link), tiny company (no employees link).
- **`No prospects found`** — zero rows after pagination terminated.
- **`Browser unavailable`** — agent-browser can't find Chrome, user-data-dir locked, binary not installed.
- **`Unknown error`** — anything else; include the first 200 chars verbatim. If the same Unknown error fires twice in a drain run, pause and ask the user.

Failure PATCH shape (for job-lead drain/single-lead mode):

```bash
TOKEN=$(cat ~/.heimdall/api-token)
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"failed","lastError":"Timeout: navigation exceeded 30000ms on /jobs/123"}' \
  "http://localhost:4000/api/job-leads/$LEAD_ID/status"
```

In **profile-enrichment and batch-sweep modes**, failures are logged inline (not written to
a job-lead status PATCH) and the contact stays `unenriched` to be picked up by the next
queue fetch.

## Constraints

- Do NOT mock or skip the API write — a "successful" run that never POSTed prospects (or never PATCHed the enrichment endpoint) is a bug.
- Do NOT proceed if any API call returns `401`. Re-check `.env.local` `API_TOKEN_HASH` ↔ `~/.heimdall/api-token` consistency and `SINGLE_USER_EMAIL`; surface and exit.
- Do NOT loop on a stuck navigation. Per-lead / per-profile budget ~5 min; on overrun, emit `Timeout: <what stalled>` and move on.
- Do NOT batch-claim multiple leads before scraping. Per-lead claim → scrape → write (D-10 + D-11). If two instances race, the state-machine PATCH rejects the second claim and that instance skips the lead.
- Do NOT touch the DB directly — every write goes through REST. This is the architectural reason the skill exists.
- Do NOT log the bearer token. Use `$(cat ~/.heimdall/api-token)` inline in curl so the resolved value never appears in shell history. Redact if printed for debugging.
