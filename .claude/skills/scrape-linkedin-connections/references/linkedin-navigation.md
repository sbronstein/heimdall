# LinkedIn Navigation Cheat-Sheet

The canonical four-step path from a job posting to a list of 2nd-degree
connections at the target company. Drive `vercel-labs/agent-browser` through
these steps in order. Each step describes the goal, the agent-browser snapshot
pattern, the element-targeting hint, and the expected outcome.

Treat the CSS selectors below as **hints**, not contracts. LinkedIn's DOM uses
obfuscated class names and shifts every few weeks; rely on text content and ARIA
labels first, fall back to selectors only when the LLM cannot find a target
otherwise. If a step's expected element is genuinely absent (not just renamed),
that is a `LinkedIn navigation failed` category in
[`troubleshooting.md`](troubleshooting.md).

---

## Step 1: Open the job posting

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

## Step 2: Click the company name link

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

## Step 3: Click the employees link

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

## Step 4: Apply the 2nd-degree connections filter

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

## Step 5: Paginate and extract

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
