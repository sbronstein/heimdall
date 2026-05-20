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

## Profile-page path (per-connection enrichment)

Used by the profile-enrichment mode and batch-sweep mode when scraping a **single
connection's profile** for their company + role at connection time. This is a different
goal from the employee-list scrape — you are visiting a person's profile, not a company's
people-search results.

### Profile-page Step 1: Derive the profile URL

The contact's `linkedinUrl` is the canonical starting point (stored in the contacts table,
populated via CSV import or manual entry). It should already be an `/in/<slug>/` URL.

```
slug = new URL(contact.linkedinUrl).pathname.split('/').filter(Boolean)[1]
// e.g. 'alice-smith-12345' from 'https://www.linkedin.com/in/alice-smith-12345/'
profileUrl = `https://www.linkedin.com/in/${slug}/`
```

Normalize trailing slashes. Reject if `slug` is undefined or empty — surface
`"Contact has malformed LinkedIn URL: <url>"` and skip.

---

### Profile-page Step 2: Navigate to the profile

**Goal:** Render the connection's full profile page and confirm LinkedIn is signed in.

**Action:** Navigate agent-browser to `https://www.linkedin.com/in/<slug>/`. Wait for
the snapshot to settle.

**Expected outcome:**
- Page title visible (typically the person's name).
- Profile header rendered (name, current headline/role).
- An "Experience" section visible or reachable by scrolling.

**Failure modes:**
- LinkedIn redirects to `/login` or shows a sign-in modal → `LinkedIn navigation failed`.
- A captcha/checkpoint challenge appears → `LinkedIn navigation failed`; abort this profile.
  Apply the pacing back-off strategy (see `troubleshooting.md` § LinkedIn navigation failed).
- The page takes > 30s to render → `Timeout`.
- Profile is private or deleted → `LinkedIn navigation failed: profile not accessible`.

---

### Profile-page Step 3: Extract company and role from the Experience section

**Goal:** Capture the company name and job title the person held at (or most recently
before) the time of their LinkedIn connection. This is **best-effort current/most-recent
extraction** — true as-of-connection-date historical reconstruction is out of scope
(see CONTEXT.md §deferred).

**Action:** Locate the "Experience" section in the snapshot. In the a11y tree, look for:
1. A section or landmark element whose accessible name / heading contains "Experience".
2. Within it, the **first** experience item (most recent role).
3. From that item, extract:
   - **Company name** (`companyAtConnection`): the sub-heading or secondary text showing
     the employer (e.g., "OpenAI", "Google LLC"). Strip any suffixes like "Full-time",
     "Contract", "· 2 yrs 3 mos" — keep only the company name.
   - **Role / job title** (`roleAtConnection`): the primary bold/heading text of the item
     (e.g., "Member of Technical Staff", "VP of Engineering").

**Selector hints** (hints only — use a11y text/role matching first):

| Target | Hint |
|--------|------|
| Experience section | section or div whose heading text is "Experience" |
| First experience item | first `<li>` or group role element within the Experience section |
| Role title | heading-level element (h3 / bold) at the top of the item |
| Company name | secondary text element immediately beneath the role title |

**Fallback behavior:**
- If the Experience section is absent (profile has none): set both fields to `null`
  and log `"No Experience section found on profile"`.
- If the company name is extractable but the role is not (or vice versa): write
  whatever is available. The merge logic server-side is `null`-safe — a partial write
  is better than no write.
- If the entire Experience section is behind a "Show more" expand: attempt to click
  the expand button once; if it does not work, fall back to extracting from the
  profile header headline (`<h2>` or equivalent near the profile photo).

**Max field lengths:** 300 chars each (server-side Zod `.max(300)`). If an extracted
string exceeds 300 chars, truncate before writing.

---

### Profile-page Step 4: Write back via PATCH /enrichment

See `heimdall-api.md` § 7 for the full curl shape, body schema, and side effects.

This step is the same for both single-profile mode and each iteration of the batch-sweep loop.

---

→ Does NOT converge into Shared (the profile enrichment path is independent of the
company/employee-scrape path — there is no 2nd-degree filter or pagination step here).

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
