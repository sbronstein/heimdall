# LinkedIn Navigation Cheat-Sheet

Three entry-point paths share Steps 4–5 below; LinkedIn DOM selectors are hints, not contracts.
Drive `vercel-labs/agent-browser` through the appropriate path. Each step describes the goal,
the agent-browser snapshot pattern, the element-targeting hint, and the expected outcome.

Treat the CSS selectors below as **hints**, not contracts. LinkedIn's DOM uses
obfuscated class names and shifts every few weeks; rely on text content and ARIA
labels first, fall back to selectors only when the LLM cannot find a target
otherwise. If a step's expected element is genuinely absent (not just renamed),
that is a `LinkedIn navigation failed` category in
[`troubleshooting.md`](troubleshooting.md).

---

## Choosing the entry point

| When | Path |
|------|------|
| Lead has `linkedinJobUrl !== null` (job-URL lead, queued from UI) | Job-URL path |
| Company-URL input, OR company-scope lead with `companyLinkedinUrl !== null` | Company-URL path |
| Bare-name input, OR company-scope lead with `companyLinkedinUrl === null` | Bare-name path |

---

## Job-URL path (Steps 1–3)

### Job-URL Step 1: Open the job posting

**Goal:** Render the job page fully and confirm LinkedIn is signed in.

**Action:** Use agent-browser to navigate to the lead's `linkedinJobUrl`
(returned from the PATCH `/status` claim response). Wait for the page to
settle — agent-browser's `snapshot` subcommand will return the a11y tree once
the DOM has stabilized.

**Expected outcome:**

- Page title visible (typically the role title + company).
- "About the job" panel rendered (a heading element with "About the job" text).
- A clickable company name link near the top of the page.

**Failure modes:**

- LinkedIn redirects to `/login` or shows a sign-in modal → session expired in
  `~/.heimdall/linkedin-profile/`. This is `LinkedIn navigation failed`.
- A captcha challenge appears → also `LinkedIn navigation failed`; abort the
  lead (do not try to solve it).
- The page takes > 30s to render → `Timeout`.

---

### Job-URL Step 2: Click the company name link

**Goal:** Land on `linkedin.com/company/<slug>/` for the hiring company.

**Action:** In the snapshot, find the first `<a>` whose `href` matches
`/company/` near the top of the job posting (beneath the role title). The
target text is usually the company name itself — match against the lead's
`companyName` if present in the snapshot.

**Selector hint:** `a[href*="/company/"]` — first match in the top region of
the page.

**Expected outcome:**

- URL is now `https://www.linkedin.com/company/<slug>/` (with or without a
  trailing `about/`).
- Company "About" / overview panel rendered with employee count visible.

**Failure modes:**

- No `a[href*="/company/"]` link visible on the job page → stealth company or
  LinkedIn DOM change. `LinkedIn navigation failed`.
- Click resolves to a different LinkedIn page (e.g., a school or organization
  type) → `LinkedIn navigation failed`.

---

### Job-URL Step 3: Click the employees link

**Goal:** Land on the people-search page filtered to the target company.

**Action:** On the company page, find the "X employees" or "View all employees"
link in the company-info card. LinkedIn typically renders this as a link with
text like "51-200 employees" or "12,034 employees" near the top. The
destination URL contains a `currentCompany=<id>` query parameter — this is the
search-filtered people endpoint.

**Selector hints (in order of preference):**

1. Text-based match: an `<a>` whose visible text contains "employees" (case-insensitive).
2. Href-based match: an `<a>` whose `href` contains `currentCompany=` — this
   is the actual filtered-people URL.
3. Fallback: any `<a>` whose `href` contains `/people` near the org-summary
   card.

**Expected outcome:**

- URL is now `linkedin.com/search/results/people/?currentCompany=%5B%22<id>%22%5D...`.
- People-search result cards visible (each with a name, title, profile link).

**Failure modes:**

- No employees link visible → small/private company without a public employee
  count. `LinkedIn navigation failed` (D-09 maps this to the navigation-failed
  category, not a separate "tiny company" category).
- The link clicks through but lands on a generic search (no `currentCompany`
  filter) → `LinkedIn navigation failed`.

---

→ Converges into Shared (Step 4 onward)

---

## Company-URL path (slug → /people/)

### Company-URL Step 1: Slug extraction (D-03)

**Goal:** Derive a canonical LinkedIn company slug from any `/company/`-shaped URL the user
provides.

**Action:** Parse with `new URL(arg)`, then:

```
segments = url.pathname.split('/').filter(Boolean)
// segments[0] must be 'company'
// segments[1] is the slug
slug = segments[1]
canonical = `https://www.linkedin.com/company/${slug}/`
```

Tolerate trailing segments (`/about/`, `/people/`, `/jobs/`, etc.), query strings, and
fragment identifiers — strip all of them; only `segments[1]` is kept as the canonical slug.

**Accepted URL shapes:**
- `https://linkedin.com/company/<slug>`
- `https://www.linkedin.com/company/<slug>`
- `https://www.linkedin.com/company/<slug>/`
- `https://www.linkedin.com/company/<slug>/about/`
- `https://www.linkedin.com/company/<slug>/people/`
- `https://www.linkedin.com/company/<slug>/jobs/?something=x`

**Reject if** `segments[1]` is undefined or empty — that is not a valid company URL.

**Expected outcome:** `slug` is a non-empty string; `canonical` is `https://www.linkedin.com/company/${slug}/`.

---

### Company-URL Step 2: Direct /people/ navigation (D-05)

**Goal:** Land on the company's people-search page without going through the job posting.

**Action:** Navigate agent-browser directly to `https://www.linkedin.com/company/${slug}/people/`.
Wait for snapshot to settle.

**Expected outcome:**

- URL is now `https://www.linkedin.com/company/<slug>/people/` (LinkedIn may append query params).
- People-search region is visible in the snapshot.

**Failure modes:**

- LinkedIn redirects to `/login` or shows a sign-in modal → `LinkedIn navigation failed`.
- A captcha challenge appears → `LinkedIn navigation failed`; abort.
- The page takes > 30s to render → `Timeout`.

---

### Company-URL Step 3: Extract company name from the page header (D-05, CD-02)

**Goal:** Obtain the human-readable company name (for POSTing to `/api/job-leads`), rather than
using the slug verbatim.

**Action:** Snapshot the page. Look for the first H1 / heading-role element above the
people-search-result region.

If multiple H1s exist (LinkedIn occasionally renders nav-level H1s), prefer the one whose text
does **NOT** match common LinkedIn nav keywords: `"LinkedIn"`, `"Notifications"`, `"Messaging"`,
`"Home"`, `"My Network"`.

**Fallback (D-06):** On extraction failure (null/empty result, sign-in wall, captcha during load),
fall back to using the slug verbatim AND log the warning:

> `Could not extract company name from <url>; using slug "<slug>" as fallback. Rename in the companies UI if needed.`

The lead proceeds; the user can curate the company name later.

**Expected outcome:** `companyName` is the human-readable name (e.g., `"OpenAI"`) or the slug
as fallback.

---

### Company-URL Step 4: POST /api/job-leads (D-04 + Phase 7 idempotent dedup)

**Goal:** Create (or retrieve) the Heimdall job lead for this company-scope scrape.

**Action:**

```bash
TOKEN=$(cat ~/.heimdall/api-token)
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"companyName\":\"<extracted-or-slug>\",\"linkedinCompanyUrl\":\"<canonical-url>\"}" \
  http://localhost:4000/api/job-leads
```

**Response:**
- **201** — newly created lead. Capture `data.id`.
- **200** — an in-flight company-scope lead for this company already exists (idempotent dedup).
  Capture `data.id` from the existing lead.

Handle both identically: capture `data.id`, then claim via PATCH `/api/job-leads/<id>/status`
with `{ "status": "searching" }` (the standard Single-lead mode claim step).

**Expected outcome:** `lead.id` available; lead is in `searching` state.

---

→ Converges into Shared (Step 4 onward)

---

## Bare-name path (search → disambiguate → /people/)

### Bare-name Step 1: Direct search URL (D-07)

**Goal:** Retrieve LinkedIn company search results deterministically, without autocomplete timing
dependency.

**Action:** Navigate agent-browser to:

```
https://www.linkedin.com/search/results/companies/?keywords=<urlencoded name>
```

Where `<urlencoded name>` is the user's bare-name argument passed through `encodeURIComponent()`.

This mirrors the "URL parameter preferred over UI chip" convention from Shared Step 4. Wait for
the snapshot to settle.

**Expected outcome:** A results page with 0–N company cards visible.

---

### Bare-name Step 2: Extract top 3–5 company cards

**Goal:** Gather the data needed to render the disambiguation list.

**Action:** For each result card (up to 5), capture from the agent-browser snapshot:

- **Name** — visible text of the company-link anchor.
- **Employee count** — text like `"5,200 employees"` or `"10K+ followers"`. Strip commas and
  units; keep the numeric portion.
- **Industry** — the subline beneath the name (e.g., `"Software Development"`).

**Fallback:** If the a11y snapshot does NOT expose employee count and/or industry (collapsible
card variant), fall back to just the Name and surface `"(employee count not available)"` in the
disambiguation list — do NOT block.

**Expected outcome:** An ordered list of up to 5 cards with name (required), employee count
(best-effort), and industry (best-effort).

---

### Bare-name Step 3: Render disambiguation list (D-10, CD-05)

**Goal:** Present the options to the user for confirmation.

**Action:** Render a markdown numbered list (max 5 items) in this format:

```
1. **Name** — N employees — Industry
2. **Name** — N employees — Industry
3. ...
```

Then prompt:

> `Pick a number (1–N), or type the company URL directly:`

**Single-match case (D-08, CD-05):** Even when there is exactly one result, render it as a
1-item numbered list and wait for confirmation. Format is identical to the multi-match case.
The user can reply with `1`, `y`, or Enter.

---

### Bare-name Step 4: Handle the pick (D-08, D-09, CD-05)

**Goal:** Route the user's response to the correct next action.

**Zero results (D-09):** Fail loudly:

> `No companies found for "<name>". Try a more specific name or pass a LinkedIn company URL.`

Exit cleanly. Do NOT create a stub Heimdall row. (This failure happens before any lead is
created — it is distinct from `No prospects found`, which is a post-navigation failure.)

**Single result (D-08, CD-05):** Rendered as a 1-item list (see Step 3). Confirm before
proceeding. User can reply `1`, `y`, or Enter.

**Multi result:** User types `1`–`N`. Resolve the pick to the company URL from the card's
profile-link anchor.

**User pastes a URL instead (escape hatch):** Treat it as Company-URL input: jump to
Company-URL Step 1 with the pasted URL.

**After the pick:** Derive the slug from the resolved company URL (same `new URL()` extraction
as Company-URL Step 1), then proceed to Company-URL Step 2 (direct `/people/` navigation)
onward — including Company-URL Step 4 (POST `/api/job-leads`).

---

### Bare-name Step 5: Drain-mode backfill (D-14, only when arriving from a `companyLinkedinUrl === null` company-scope lead)

**Goal:** Persist the resolved LinkedIn URL so subsequent drain runs skip disambiguation.

**Action:** After the user picks, call PUT /api/companies/<lead.companyId> with
`{ "linkedinUrl": "<picked-url>" }`:

```bash
TOKEN=$(cat ~/.heimdall/api-token)
curl -s -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"linkedinUrl\":\"<picked-url>\"}" \
  "http://localhost:4000/api/companies/$COMPANY_ID"
```

**Note: use PUT, not PATCH.** The actual route exports PUT — `src/app/api/companies/[id]/route.ts:55`. CONTEXT.md refers to it as PATCH but the route handler is PUT. The `updateCompanySchema` already accepts `linkedinUrl` (line 18).

**Response:** `{ success: true, data: <updated company row> }`.

**When this step applies:** Only when the bare-name flow is triggered mid-drain by a
company-scope lead whose `companyLinkedinUrl` was `null`. When arriving via fresh bare-name CLI
input (not drain mode), skip this step — the lead does not yet exist.

---

→ After pick (and optional backfill in drain case), behaves like Company-URL path from Step 2 onward. When arriving via fresh bare-name CLI input, also follow Company-URL Step 4 (POST /api/job-leads). When arriving via the drain-mode mid-loop fallback, the lead already exists — skip the POST.

---

## Shared: 2nd-degree filter + paginate + extract

### Shared Step 4: Apply the 2nd-degree connections filter

**Goal:** Narrow the people-search results to 2nd-degree connections only.

**Action:** Two approaches, in order of preference:

1. **URL parameter** (preferred — deterministic): append `&network=%5B%22S%22%5D`
   to the current URL. `S` is LinkedIn's code for 2nd-degree (vs `F` for 1st,
   `O` for 3rd+). Navigate directly to the constructed URL.
2. **UI filter chip** (fallback): open the "Connections" filter dropdown in the
   filter bar at the top of the results, check "2nd", click "Show results".

**Expected outcome:**

- URL contains both `currentCompany=...` and `network=%5B%22S%22%5D`.
- A "2nd" pill is visible in the active-filters strip.
- Result cards show "2nd" badges next to each name.

**Failure modes:**

- Filter chip not visible / dropdown doesn't open → `LinkedIn navigation
  failed`.
- URL approach succeeds but result count is 0 → continue to Step 5 and let
  pagination terminate; that's `No prospects found`, not navigation failed.

---

### Shared Step 5: Paginate and extract

**Goal:** Walk every result page (up to page 10), capturing prospects in the
five-field `ScrapedProspect` shape.

**Per page:**

- For each result card, capture from the agent-browser snapshot:
  - `name` — the visible text of the profile-link anchor (often inside a
    `<span aria-hidden="true">`). Drop entries showing "LinkedIn Member" — those
    are private profiles you cannot use.
  - `title` — the first non-name text block inside the card (typically the
    role/headline beneath the name). Skip blocks that contain "mutual",
    "Connect", "Message", or "Follow" — those are CTA/relationship strings.
  - `linkedinUrl` — the `href` of the profile-link anchor, with query params
    stripped (split on `?`). Must be a valid URL or the row is dropped.
  - `profileSnippet` — the visible blurb / description beneath the role, if
    LinkedIn rendered one (the search snippet, e.g., "Building data infra.
    ex-Stripe."). 0–500 chars or null.
  - `mutualConnectionNames` — parse from the "X mutual connections" subline
    (e.g., "John Smith, Jane Doe and 2 other mutual connections"). Strip
    counts and connector words; produce an array of clean names (0–50 items,
    each 1–200 chars).

**Pagination:**

- Look for the `Next` button. Selector hint: `button[aria-label="Next"]` or a
  button whose visible text is "Next".
- If enabled and you're on page < 10, click it and wait for the next snapshot
  to settle.
- **Hard cap: page 10.** Do NOT exceed (per JL2-04 carry-forward — captcha
  risk rises with depth and LinkedIn rate-limits hard around page 12+).
- Stop when `Next` is disabled, missing, or you reach page 10.

**Expected outcome:**

- A `ScrapedProspect[]` array of 0–N entries, ready to POST to the bulk
  `/prospects` endpoint (see [`heimdall-api.md`](heimdall-api.md)).

**Failure modes:**

- Profile-link selector returns nothing on page 1 → result set genuinely empty;
  treat as `No prospects found` after pagination.
- Page load > 30s on click → `Timeout`.
- Mid-pagination captcha → `LinkedIn navigation failed`.

---

## Historically-stable selectors (hints, not guarantees)

The deleted Playwright-based scraper (`src/features/job-leads/lib/scrape-connections.ts`,
removed in Plan 05-07) relied on these patterns. Cite them as hints if the LLM
cannot find a target through a11y-tree text/role matching:

| Target                  | Selector hint                       |
|-------------------------|-------------------------------------|
| Profile link            | `a[href*="/in/"]`                   |
| Company link            | `a[href*="/company/"]`              |
| People-search link      | `a[href*="currentCompany="]`        |
| Next-page button        | `button[aria-label="Next"]`         |
| Mutual-connections text | text containing "mutual connection" or "and X others" |

LinkedIn may have changed the DOM since 2026-05-13 — if a selector returns
nothing, fall back to text/ARIA matching from the snapshot rather than guessing
adjacent selectors.
