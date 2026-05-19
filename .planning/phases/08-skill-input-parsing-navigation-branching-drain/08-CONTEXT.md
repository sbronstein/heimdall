# Phase 8: Skill Input Parsing, Navigation Branching + Drain - Context

**Gathered:** 2026-05-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the existing `.claude/skills/scrape-linkedin-connections/` skill (shipped in Phase 5) to:

1. **Accept LinkedIn company URLs** (`https://(www.)?linkedin.com/company/<slug>(/.*)?`) as a positional argument — creates a synthetic job lead via Phase 7's `POST /api/job-leads { companyName, linkedinCompanyUrl }` and navigates directly to the company's `/people/` page (skipping the job-posting → company-page step).
2. **Accept bare company-name strings** (anything that isn't a UUID, an https URL, or empty) — runs a LinkedIn company search via direct URL, presents top 3–5 matches inline (name + employee count + industry) as a markdown numbered list, waits for the user's pick, and uses the picked company's URL.
3. **Branch navigation on `linkedinJobUrl IS NULL`** — when the lead has no source URL, navigation starts directly at `/company/<slug>/people/`; when non-null, the existing four-step job → company → employees → 2nd-degree flow runs unchanged.
4. **Drain company-scope leads from the same queue** — `GET /api/job-leads?status=queued` returns both lead types; a single `for each lead` loop branches on `lead.linkedinJobUrl`.
5. **Update `references/linkedin-navigation.md`** to document both navigation paths alongside the existing job-URL path.

**In scope:**
- Argument parser extension in `SKILL.md`: empty/whitespace → drain; UUID → single-lead; URL with `/company/` in path → company-URL flow; any other URL → existing job-URL flow; else → bare-name flow. Existing four-branch parser is replaced.
- Slug extraction from company URLs: `new URL(arg)`, split pathname, validate `segments[1] === 'company' && segments[2]`, capture `segments[2]` as slug, ignore trailing segments (e.g., `/about/`, `/people/`, `?utm=...`).
- Pre-scrape the LinkedIn company People page (`/company/<slug>/people/`) to extract the human-readable company name from the page header (H1 / aria-label). Fall back to the slug if extraction fails — log a warning so the user knows to rename in the companies UI.
- For URL input: POST to `POST /api/job-leads` with `{ companyName: <extracted-or-slug>, linkedinCompanyUrl: <input-url> }`. Phase 7's idempotent dedup returns 200 if an in-flight company-scope lead already exists for that company; the skill handles both 200 and 201 the same way (use the returned lead).
- For bare-name input: navigate to `https://www.linkedin.com/search/results/companies/?keywords=<urlencoded>`; extract the top 3–5 results (name + employee count + industry) from agent-browser snapshot; render as markdown numbered list (`1. **Name** — N employees — Industry`); always confirm the pick even when there's exactly one match (user types the number, or `1` / `y` / Enter for the single-match case if the model interprets that intent); zero matches → fail loudly with `No companies found for "<name>". Try a more specific name or pass a LinkedIn company URL.`
- Once a company URL is resolved (URL input directly, or disambiguation pick from bare-name input): POST `/api/job-leads`, then navigate directly to `/company/<slug>/people/` (skipping Steps 1-2 of the existing navigation doc), then proceed with Steps 4-5 (2nd-degree filter, extract, paginate, write back) unchanged.
- Drain mode `for each lead in queued`: branch on `lead.linkedinJobUrl`. Null → company-scope branch (navigate to `/company/<slug>/people/` using `lead.companyLinkedinUrl` from the joined response); non-null → existing job-URL branch. Both converge at Step 4 (2nd-degree filter) and below.
- Extend `GET /api/job-leads` response shape to include `companyLinkedinUrl` (single top-level field per lead row, joined from `companies.linkedinUrl`).
- Mid-drain fallback: if `lead.companyLinkedinUrl` is null on a company-scope lead, the skill runs the same bare-name search/disambiguation flow using `lead.companyName`, gets a URL, then PATCHes `/api/companies/<lead.companyId>` with `{ linkedinUrl: <picked> }` so the next drain doesn't re-prompt for that company. PATCH route already supports `linkedinUrl` updates (verified in `src/app/api/companies/[id]/route.ts`).
- Rewrite `references/linkedin-navigation.md`: split the existing job-URL flow into a "Job-URL path" section (current content) and add a "Company-URL path" section (slug extraction, direct `/people/` navigation, name extraction, fallback rules) and a "Bare-name path" section (search URL, disambiguation render format, single/zero-match policy, backfill rule). Steps 4-5 (2nd-degree filter + paginate/extract) stay shared at the bottom.

**Out of scope:**
- Schema changes to `job_leads` or `companies` — Phase 7 already shipped nullable `linkedinJobUrl`/`roleTitle` and `companies.linkedinUrl` was already nullable.
- New API routes — only `GET /api/job-leads` response shape is extended (single field added); `POST /api/job-leads`, `PATCH /status`, `POST /prospects`, `PATCH /api/companies/[id]` are all reused as-is.
- UI changes — Phase 9 (JL-C8, JL-C9) handles the detail-page badge, hidden "View job posting" link, and list-view discriminator.
- Captcha / rate-limit detection or backoff — carried forward as JL2-03 in v2 deferred.
- Pagination beyond page 10 — JL2-04 cap stays in place.
- Multi-lead claim parallelism — single-user / single-skill-run-at-a-time pattern stands (D-11 from Phase 5).
- Auto-pick or threshold-based disambiguation — every match (even single match) requires confirmation.
- Retry-with-broader-query for zero search results — fail loudly is the v1 policy.
- Backfilling historical leads — no migration of existing rows; Phase 7's constraint relaxation handled forward compatibility only.

</domain>

<decisions>
## Implementation Decisions

### Argument Parsing

- **D-01:** **Permissive URL routing.** Branch order in the skill's argument parser: (1) empty / whitespace-only → drain mode; (2) matches UUID regex (`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`) → single-lead UUID flow; (3) parses as a URL AND pathname contains `/company/` segment → company-URL flow; (4) parses as a URL (any other shape) → existing job-URL flow (creates a `pending` lead via the existing cheerio job-page scrape, then proceeds); (5) anything else → bare-name flow. The existing job-URL behavior is preserved exactly; non-LinkedIn URLs fall through to the same downstream error as today. UUID regex wins over bare-name interpretation; the company-name "abc-def-..." collision risk is effectively zero in practice.

- **D-02:** **Empty/whitespace input → drain mode.** Matches the current SKILL.md contract verbatim. Whitespace-only inputs (` `, `""`, `''`) are normalized via `trim()` and treated as drain. Quoted-empty shell quirks roll into the same bucket.

- **D-03:** **Company-URL slug extraction via URL constructor + path-segment check.** Parse with `new URL(arg)`, take `url.pathname.split('/').filter(Boolean)`, validate `segments[0] === 'company' && typeof segments[1] === 'string'`, capture `segments[1]` as the canonical slug. This tolerates trailing segments (`/about/`, `/people/`, `/jobs/`), trailing slashes, query strings, and fragment identifiers — strips all of them and re-derives the canonical company URL as `https://www.linkedin.com/company/<slug>/`. Rejected: brittle anchored regex; the user pastes from arbitrary LinkedIn pages and the parser must absorb that.

### Company URL → Display Name

- **D-04:** **Pre-scrape the LinkedIn company page to extract the human-readable name.** Before POSTing to `/api/job-leads`, the skill navigates agent-browser to the canonical company URL and extracts the company name from the page header. This gives Phase 7's case-insensitive company-name matcher (D-07 in Phase 7's CONTEXT) the best shot at deduping against existing `companies` rows that have a properly-cased name. Rejected: posting the slug verbatim — would proliferate stub companies named "openai", "stripe-inc", etc., that the user has to rename later.

- **D-05:** **Navigate directly to `/company/<slug>/people/` and extract the name from the page header there.** Single navigation; the People page also shows the company name in the sticky header / breadcrumb. Saves a page load vs. visiting `/about/` first. The People page is the destination anyway — combine the "extract name" pass with the "land on People" pass. The page-header element to extract is documented in `references/linkedin-navigation.md` (rewritten in this phase) as an H1 / heading-role node near the top of the snapshot.

- **D-06:** **Fall back to slug + warn user on extraction failure.** If the page-header extraction returns null/empty (DOM shift, sign-in wall, captcha, or the page just didn't render the header), the skill logs `Could not extract company name from <url>; using slug "<slug>" as fallback. Rename in the companies UI if needed.` and POSTs with `companyName: <slug>`. The lead proceeds; the user can curate the company-name later. Matches the project's "never block the happy path on cosmetic data" philosophy. Rejected: failing loudly — extraction is best-effort and shouldn't gate scrape progress.

### Bare Name Disambiguation

- **D-07:** **Direct search URL pattern.** Navigate to `https://www.linkedin.com/search/results/companies/?keywords=<urlencoded name>`. Deterministic, no autocomplete timing dependencies. Mirrors the existing "URL parameter preferred over UI filter" pattern from Step 4 of the current `linkedin-navigation.md`. Rejected: global search bar + Enter (autocomplete dropdown is fragile and depends on focus/timing behavior).

- **D-08:** **Always confirm, even for single match.** When LinkedIn returns exactly one result, the skill still presents the result and asks the user to confirm before proceeding. Catches LinkedIn's fuzzy-match weirdness (e.g., "OpenAI" partial-matching the wrong "OpenAI Inc"). Adds a small confirmation step in the common case; the user can reply with `1` or just hit Enter. The cost is one extra round-trip; the benefit is never silently scraping the wrong company.

- **D-09:** **Fail loudly on zero matches.** Skill surfaces `No companies found for "<name>". Try a more specific name or pass a LinkedIn company URL.` and exits cleanly. No DB row is created. User retries with a better name or pastes the URL directly. Rejected: auto-create a Heimdall stub anyway (pollutes the DB) and retry-with-broader-query (auto-stripping suffixes is opaque and unpredictable).

- **D-10:** **Markdown numbered list with three columns.** Render disambiguation as:
  ```
  1. **OpenAI** — 5,200 employees — Software / AI Research
  2. **OpenAI Foundation** — 12 employees — Non-profit
  3. ...
  ```
  Compact, terminal-friendly, easy for the user to skim. The skill then asks "Pick a number (1–N), or type the company URL directly:" and waits for input. Rejected: markdown table (wider, less scannable) and JSON block (LLM-friendly but ugly for the user).

### Navigation Branching

- **D-11:** **Drain loop is a single `for each lead` with an inline branch on `lead.linkedinJobUrl`.** When `linkedinJobUrl !== null` → existing job-URL flow (Steps 1–4 of `linkedin-navigation.md` job-URL path); when `linkedinJobUrl === null` → company-scope flow (navigate directly to `lead.companyLinkedinUrl`'s `/people/` path, skipping Steps 1–2). Steps 4–5 (2nd-degree filter, extract, paginate, write back) are shared at the bottom of the navigation doc. Matches JL-C7 verbatim ("single loop"). Rejected: two sub-routines (more skill-prompt text without behavior parity benefits at v1.1 scope) and full helper-extraction refactor (overkill for two branches that share a common tail).

- **D-12:** **The structural discriminator everywhere is `lead.linkedinJobUrl === null`.** Both the skill's drain-loop branch and (per Phase 7 D-12) the Phase 9 UI's "is this company-scope?" check key off the same nullness predicate. The `roleTitle === 'Company-wide scrape'` sentinel is informational only — never used as a control-flow discriminator.

### Drain-Mode URL Data Flow

- **D-13:** **Extend `GET /api/job-leads` to include `companyLinkedinUrl` as a single top-level field per lead row.** The route already loads `companies` via the existing companyId FK; add `companies.linkedinUrl AS companyLinkedinUrl` to the projection. One round-trip per drain; minimal API change; no nesting (so type-narrowing in the skill / future TS consumers stays trivial). Add the field to the standard `data: [...]` response under each lead alongside `linkedinJobUrl`, `companyName`, etc. Rejected: separate `GET /api/companies/[id]` per lead (extra round-trips per drain) and re-running LinkedIn search by name in drain mode (maximum friction, defeats the point of persisting URLs).

- **D-14:** **Drain-mode fallback when `lead.companyLinkedinUrl IS NULL`: run the bare-name search + disambiguation flow inline, then backfill.** For a company-scope lead where the company has no persisted URL (e.g., user originally POSTed without `linkedinCompanyUrl`), the skill runs the same search/disambiguate flow as the bare-name input path using `lead.companyName`, presents the disambiguation list, accepts the user's pick, then PATCHes `/api/companies/<lead.companyId>` with `{ linkedinUrl: <picked-url> }` so subsequent drains find a non-null `companyLinkedinUrl`. Verified that `src/app/api/companies/[id]/route.ts` PATCH already supports `linkedinUrl`. Rejected: skip the lead with `failed` status (worse UX; user has to manually re-queue) and abort the drain batch (too disruptive).

- **D-15:** **Drain mode confirms the company-scope branch inline.** When the loop encounters a `linkedinJobUrl: null` lead, the skill prints `Lead <id>: company-scope (<companyName>) — navigating to <companyLinkedinUrl>/people/...` so the user can see the branch fired correctly without being interrupted. No interactive prompt unless `companyLinkedinUrl` is null (D-14 fallback). Mid-drain disambiguation prompts apply only to the null-URL fallback case.

### Claude's Discretion

- **CD-01:** **Where in `linkedin-navigation.md` the three paths live.** Recommended structure: top-level sections `## Job-URL path (Steps 1–4)`, `## Company-URL path (slug → /people/)`, `## Bare-name path (search → disambiguate → /people/)`, then `## Shared: 2nd-degree filter + extract + paginate` (Steps 4–5 of the existing doc). Planner picks the exact heading order based on readability. The "Historically-stable selectors" appendix stays at the bottom.

- **CD-02:** **Where to perform name-extraction within the People-page navigation.** Recommended: snapshot the page after first `agent-browser snapshot` returns, grep the snapshot for the first H1 / heading element above the people-search-result region. If multiple H1s exist (LinkedIn occasionally renders nav-level H1s), prefer the one whose text doesn't match common nav keywords ("LinkedIn", "Notifications", "Messaging"). Planner adds a one-paragraph note in `linkedin-navigation.md` documenting the heuristic.

- **CD-03:** **Whether to add a tiny helper script for the new paths.** Recommended: probably not. The current skill uses inline `curl` and `agent-browser` calls; a `disambiguate-companies.sh` helper adds indirection without much benefit. Planner decides if the disambiguation rendering grows large enough to justify a helper.

- **CD-04:** **API route test coverage for the GET /api/job-leads change.** Recommended: add one test case to `src/app/api/job-leads/route.test.ts` that inserts a company-scope lead (using the Phase 7 fixture pattern) and a job-URL lead, hits `GET /api/job-leads?status=queued`, and asserts both rows in the response include a `companyLinkedinUrl` field (null or string). Pins D-13 against regression. Planner picks fixture location based on whether `src/test-utils/pglite.ts` already has a helper for company creation.

- **CD-05:** **How to surface single-match confirmation cleanly.** Recommended: same render as multi-match (numbered list of 1 item) so the user types `1` or `y` consistently. Keeps the prompt format uniform. Planner can A/B against a dedicated single-match copy if user testing reveals friction.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v1.1 milestone trail
- `.planning/PROJECT.md` §"Current Milestone: v1.1 LinkedIn Scraping by Company" — locked target features
- `.planning/REQUIREMENTS.md` §"v1.1 Active — LinkedIn Scraping by Company" — JL-C1..JL-C9; Phase 8 owns JL-C1, JL-C2, JL-C5, JL-C6, JL-C7
- `.planning/ROADMAP.md` §"Phase 8: Skill Input Parsing, Navigation Branching + Drain" — goal + 4 success criteria
- `.planning/STATE.md` §"Accumulated Context → Decisions" — locked v1.1 milestone decisions (single queue, single loop, no role filter, etc.)

### Phase 7 lineage (the API this skill consumes)
- `.planning/phases/07-schema-api-for-company-scope-leads/07-CONTEXT.md` §"D-01..D-15" — discriminated `POST /api/job-leads` schema, idempotent dedup (200 vs 201), `COMPANY_SCOPE_ROLE_TITLE` sentinel, company auto-create / linkedinUrl backfill, state-machine input-shape agnosticism
- `.planning/phases/07-schema-api-for-company-scope-leads/07-01-PLAN.md` — schema migration plan (linkedin_job_url nullable)
- `.planning/phases/07-schema-api-for-company-scope-leads/07-02-PLAN.md` — POST /api/job-leads discriminated branch (the route the skill calls for URL input + bare-name flows)
- `.planning/phases/07-schema-api-for-company-scope-leads/07-03-PLAN.md` — D-17 regression coverage (PATCH /status + POST /prospects accept null-URL leads — the routes Phase 8 calls in the company-scope branch)
- `src/app/api/job-leads/route.ts` — the POST endpoint extended in Phase 7 (Phase 8 reads to understand the response envelope for both branches)

### Phase 5 lineage (the skill being extended)
- `.claude/skills/scrape-linkedin-connections/SKILL.md` — current skill prompt; argument parser, drain mode, single-lead mode, error handling. **This file is rewritten** in Phase 8 to add the new branches.
- `.claude/skills/scrape-linkedin-connections/references/linkedin-navigation.md` — current navigation cheat-sheet (Steps 1–5 for the job-URL path). **This file is rewritten** in Phase 8 to add the company-URL and bare-name paths.
- `.claude/skills/scrape-linkedin-connections/references/heimdall-api.md` — current API contract reference; will be lightly updated to mention the new `companyLinkedinUrl` field in `GET /api/job-leads` (per D-13) and the bare-name POST shape from Phase 7.
- `.claude/skills/scrape-linkedin-connections/references/troubleshooting.md` — error-category mapping (Timeout / LinkedIn navigation failed / No prospects found / Browser unavailable / Unknown error); add notes for the new failure modes specific to company-scope branches (name-extraction fallback, zero-match fail-loudly, mid-drain disambiguation).
- `.planning/phases/05-job-leads-completion/05-CONTEXT.md` §"D-06..D-09" — state machine, error categories, status enum values (unchanged for Phase 8)
- `.planning/phases/05-job-leads-completion/05-06-PLAN.md` — original skill-creation plan; Phase 8 is the natural successor

### Project anchors
- `CLAUDE.md` — TS strict, named exports, REST API (no server actions), Zod on routes
- `.planning/codebase/ARCHITECTURE.md` §"Anti-Patterns" — patterns to avoid
- `.planning/codebase/STACK.md` — Drizzle 0.45.1, Neon serverless HTTP driver, Zod 4, Next.js 16 App Router

### Source files (read before planning)
- `src/app/api/job-leads/route.ts` — extend GET projection to include `companyLinkedinUrl` from the join (D-13). POST route from Phase 7 already supports the company-scope branch the skill calls.
- `src/app/api/job-leads/[id]/status/route.ts` — PATCH /status; unchanged for Phase 8 (Phase 7 D-17 already pinned the null-URL invariant). Skill writes `searching` / `failed` here for company-scope leads exactly as for job-URL leads.
- `src/app/api/job-leads/[id]/prospects/route.ts` — POST /prospects; unchanged for Phase 8. Bulk write + auto-flip to `found` works identically for null-URL leads.
- `src/app/api/companies/[id]/route.ts` — PATCH route used for D-14 backfill of `companies.linkedinUrl`. Already supports `linkedinUrl` updates (verified).
- `drizzle/schema/job-leads.ts` — `linkedinJobUrl` is nullable as of Phase 7 (migration 0009); the GET join in D-13 pulls from `companies.linkedinUrl`.
- `drizzle/schema/companies.ts` — `linkedinUrl` already nullable; D-14 backfill writes here.

### Reusable helpers
- `src/lib/api/types.ts` — `success()` (200) and `created()` (201) envelopes; skill handles both responses from Phase 7's POST /api/job-leads
- `src/lib/api/errors.ts` — standard error envelopes
- `src/test-utils/pglite.ts`, `src/test-utils/call-route.ts` — Phase 2 harness; reused for CD-04 GET /api/job-leads response-shape regression test
- `src/lib/domain/types.ts` — `COMPANY_SCOPE_ROLE_TITLE` constant (Phase 7 D-11); the skill does not import this directly (it's a TS constant; the skill is a markdown prompt) but the planner should reference it in the `heimdall-api.md` doc when documenting the synthetic-lead POST response shape

### External references (no new docs needed)
- No new external specs or ADRs. The skill is markdown-driven; agent-browser version specifics are deferred to the installed README (as today).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Existing `.claude/skills/scrape-linkedin-connections/SKILL.md`** — the argument parser, claim/scrape/write-back loop, error handling, and drain-mode harness are kept verbatim; Phase 8 adds two new branches to the parser and a single nullness check inside the drain loop. The "User-side prerequisites" section at the top stays unchanged.
- **`POST /api/job-leads` (Phase 7)** — `src/app/api/job-leads/route.ts` accepts `{ companyName, linkedinCompanyUrl? }` and returns either 201 (new) or 200 (in-flight dedup) with the full lead row. Skill handles both identically (use the returned lead).
- **`PATCH /api/companies/[id]`** — verified to accept `linkedinUrl` updates; used by D-14 for mid-drain backfill.
- **`linkedin-navigation.md` Steps 4–5** — the 2nd-degree filter + paginate/extract path is shared across all three input shapes; only Steps 1–2 (or their replacement) differ. Phase 8 rewrites Steps 1–3 only.
- **agent-browser snapshot + ref-based click** — same primitives the existing skill uses; the new paths (search URL, /people/ direct nav, name extraction from H1) all stay inside that model.
- **`prospects` table + `ScrapedProspect` Zod shape** — unchanged. The company-scope branch produces the same five-field shape from the same /search/results/people/ pages.

### Established Patterns
- **REST API for all writes, even from the skill** (CLAUDE.md + bearer-token middleware shipped in Phase 5) — the new POST for synthetic-lead creation goes through `/api/job-leads`; the new PATCH for company linkedinUrl backfill goes through `/api/companies/[id]`. No direct DB access from the skill.
- **Deterministic URL paths preferred over UI clicks** (existing `linkedin-navigation.md` Step 4 — "URL parameter preferred over UI filter chip") — the company-search direct URL (D-07) and the `/people/` direct navigation (D-05) follow this convention.
- **Best-effort cosmetic data with graceful fallback** (project-wide) — name extraction falls back to slug on failure (D-06) rather than blocking the scrape.
- **State-machine PATCH for claim → scrape → write-back** (Phase 5 D-08, D-11) — unchanged for the company-scope branch. Same `queued → searching → found` / `failed` transitions.
- **Single-loop drain with inline branching** (existing skill's drain mode) — extended in Phase 8 with one nullness check on `lead.linkedinJobUrl`.

### Integration Points
- **Skill → Phase 7 POST API**: URL input flow and disambiguation pick both POST `{ companyName, linkedinCompanyUrl }` to `/api/job-leads`. Phase 7's idempotent dedup handles double-invocations gracefully.
- **Skill → Phase 9 UI**: Phase 9 will display these company-scope leads in the detail page and list view. The discriminator across both phases is `lead.linkedinJobUrl === null` (Phase 7 D-12, Phase 8 D-12). The `roleTitle === 'Company-wide scrape'` sentinel is informational only.
- **Skill → companies API**: PATCH `/api/companies/[id]` is called in mid-drain backfill (D-14). No new route; no new fields.
- **GET /api/job-leads response shape** (D-13): adding `companyLinkedinUrl` is the only API change in Phase 8. All other routes and shapes are unchanged. Existing UI consumers should treat the new field as optional/null-tolerant (they don't render it today; no breakage).

### What the Planner Does NOT Need to Research
- Whether to add a new entity for company-scope leads (locked: no — synthetic `job_leads` row per Phase 7)
- Whether to add a separate queue / status (locked: no — same `queued` status, same `?status=queued` endpoint, single loop per JL-C7)
- Whether to support role-filtered scraping at the company (locked: no — all 2nd-degree connections, per milestone)
- Whether to add new state-machine transitions (no — same `queued → searching → found / failed` flow)
- Whether to use Stagehand or another browser library (locked: agent-browser, per Phase 5 D-04)
- Whether to auto-pick disambiguation single matches (D-08: no, always confirm)
- Whether to retry-with-broader-query on zero results (D-09: no, fail loudly)

### What the Planner DOES Need to Verify / Decide
- **Exact Drizzle projection syntax for adding `companyLinkedinUrl` to the GET response** (D-13). Check whether the existing route uses a single `leftJoin(companies)` and how it currently shapes the row — extend the projection accordingly. Likely a single-line addition.
- **Page-header element to extract company name from `/company/<slug>/people/`** (D-05, CD-02). Open LinkedIn in dev tools, inspect; document the H1 / aria-label heuristic in `linkedin-navigation.md`. If the People page doesn't reliably show the company name in the header (LinkedIn variations), fall back to a brief `/company/<slug>/` visit before `/people/`.
- **Whether agent-browser version's search-results page exposes employee-count / industry in the snapshot a11y tree** (D-10). If LinkedIn renders these in collapsible cards that require expansion, the disambiguation list may need a different rendering. Planner verifies in a single manual test.
- **Test fixture for the new GET projection** (CD-04). Decide whether to extend `src/test-utils/pglite.ts` with a `createCompanyWithLinkedinUrl()` helper or inline in the single test case.

</code_context>

<specifics>
## Specific Ideas

- **Argument-parser sketch** (concrete shape for the planner — pseudocode in the skill prompt):
  ```
  arg = $ARGUMENTS.trim()
  if arg == "":
    → drain mode
  elif arg matches UUID regex:
    → single-lead UUID flow
  elif arg parses as URL:
    parsed = new URL(arg)
    segments = parsed.pathname.split('/').filter(Boolean)
    if segments[0] == 'company' && segments[1]:
      slug = segments[1]
      canonical = `https://www.linkedin.com/company/${slug}/`
      → company-URL flow with (canonical, slug)
    else:
      → existing job-URL flow (unchanged)
  else:
    → bare-name flow with arg
  ```

- **Company-URL → /people/ navigation flow** (the new branch the planner adds to `linkedin-navigation.md`):
  1. Navigate to `https://www.linkedin.com/company/<slug>/people/`
  2. Wait for snapshot to settle
  3. Extract company name from the topmost H1 / heading-role element. Fall back to slug on failure (log warning).
  4. POST `/api/job-leads { companyName: extracted-or-slug, linkedinCompanyUrl: canonical-url }`. Capture the returned lead (200 or 201). Use lead's id for PATCH `/status` claim.
  5. PATCH `/api/job-leads/<id>/status { status: "searching" }` (D-11 flow — claim the lead).
  6. Apply the 2nd-degree filter (existing Step 4) and proceed to extract + paginate.

- **Bare-name → disambiguate → /people/ navigation flow**:
  1. Navigate to `https://www.linkedin.com/search/results/companies/?keywords=<urlencoded name>`
  2. Wait for snapshot; extract top 3–5 company cards (name, employee count, industry).
  3. If 0 results → fail loudly with `No companies found for "<name>". Try a more specific name or pass a LinkedIn company URL.`
  4. Render markdown numbered list (`1. **Name** — N employees — Industry`) and ask: "Pick a number (1–N), or type the company URL directly:"
  5. User picks → resolve to the picked card's company URL → derive slug → continue as company-URL flow from step 4 (POST `/api/job-leads`).
  6. (Drain-mode fallback variant): after the user picks, also PATCH `/api/companies/<lead.companyId>` with `{ linkedinUrl: <picked> }` to backfill (D-14).

- **GET /api/job-leads response extension** (concrete shape for the planner — added field is the last one in the projection):
  ```ts
  // Current row shape (rough sketch from heimdall-api.md):
  { id, linkedinJobUrl, roleTitle, companyName, status, lastError, updatedAt }
  // Phase 8 extension (one new field):
  { id, linkedinJobUrl, roleTitle, companyName, companyLinkedinUrl, status, lastError, updatedAt }
  ```
  Drizzle projection sketch (planner verifies against actual route):
  ```ts
  .select({
    id: jobLeads.id,
    linkedinJobUrl: jobLeads.linkedinJobUrl,
    roleTitle: jobLeads.roleTitle,
    companyName: jobLeads.companyName,
    companyLinkedinUrl: companies.linkedinUrl, // NEW
    status: jobLeads.status,
    lastError: jobLeads.lastError,
    updatedAt: jobLeads.updatedAt,
  })
  .from(jobLeads)
  .leftJoin(companies, eq(jobLeads.companyId, companies.id)) // verify join already exists
  ```

- **Drain-mode loop sketch** (replaces the existing single loop in SKILL.md "Drain mode" section):
  ```
  for each lead in queued:
    print(`Lead ${lead.id}: ${lead.linkedinJobUrl ? 'job-URL' : 'company-scope'} (${lead.companyName})`)
    if lead.linkedinJobUrl == null:
      url = lead.companyLinkedinUrl
      if url == null:
        # D-14 fallback: run bare-name search + disambiguate + backfill
        url = await runBareNameFlow(lead.companyName)
        await PATCH(`/api/companies/${lead.companyId}`, { linkedinUrl: url })
      navigate(`${url.endsWith('/') ? url : url + '/'}people/`)
    else:
      # existing job-URL branch: navigate to lead.linkedinJobUrl, click company, click employees
      navigateJobUrlBranch(lead.linkedinJobUrl)
    # Shared from here: apply 2nd-degree filter, extract, paginate, POST /prospects
    applyFilterAndExtract(lead.id)
  ```

- **Tests to ship in this phase** (concrete file targets — narrow surface):
  - `src/app/api/job-leads/route.test.ts` — extend with: GET response includes `companyLinkedinUrl` (CD-04). Use a mixed fixture (one company-scope lead, one job-URL lead, the company-scope lead's `companies` row has a non-null `linkedinUrl`).
  - No other server-side tests required: PATCH /status, POST /prospects, PATCH /api/companies were already covered by Phase 7 D-17 and earlier phases against the null-URL invariant.
  - Skill changes are exercised in dev (the skill drives a real browser; agent-browser-driven flows are not unit-testable — follows Phase 5 D-21 precedent).

- **`linkedin-navigation.md` rewrite structure** (the planner produces this):
  ```
  # LinkedIn Navigation Cheat-Sheet
  ## Choosing the entry point
  - Job-URL lead (linkedinJobUrl !== null) → Job-URL path
  - Company-URL input (or company-scope lead with companyLinkedinUrl) → Company-URL path
  - Bare-name input (or null companyLinkedinUrl fallback) → Bare-name path
  ## Job-URL path
  - Step 1 (open job posting) / Step 2 (click company) / Step 3 (click employees)
    → converges into the shared 2nd-degree filter section
  ## Company-URL path
  - Slug extraction (D-03), direct /people/ nav (D-05), name extraction (D-05 + CD-02), fallback to slug (D-06)
    → converges into the shared 2nd-degree filter section
  ## Bare-name path
  - Search URL (D-07), zero-match policy (D-09), disambiguation render (D-10), always-confirm rule (D-08), single-match policy (CD-05), drain-mode backfill (D-14)
    → after pick, behaves like the Company-URL path
  ## Shared: 2nd-degree filter + paginate + extract
  - (current Steps 4 + 5, unchanged)
  ## Historically-stable selectors (appendix)
  - (unchanged from current doc)
  ```

</specifics>

<deferred>
## Deferred Ideas

- **Auto-pick disambiguation for single matches** — declined in D-08 in favor of always-confirm. Revisit only if friction in the single-match case becomes a recurring complaint.

- **Retry-with-broader-query on zero search results** — declined in D-09. The user-friendly version (auto-strip "Inc"/"LLC") is opaque and unpredictable; fail-loudly is the v1 policy. Revisit only if zero-match rate is high in practice.

- **Re-run LinkedIn search every drain regardless of persisted URL** — declined in D-13 in favor of caching `companies.linkedinUrl` via the GET join. Revisit only if LinkedIn company URLs go stale frequently (low probability).

- **Full company object in GET /api/job-leads response** — declined in favor of the single `companyLinkedinUrl` field. If a future UI surface wants `company.priority` / `company.stage` in the lead list, that's a separate API decision and can opt into `?with=company` then.

- **Helper script for disambiguation rendering** — CD-03 leaves it as inline. Extract only if rendering grows non-trivially.

- **Mid-drain disambiguation as a separate, friendlier prompt format** — declined; reuses the bare-name disambiguation format for consistency. Revisit if drain runs become awkward.

- **Captcha / rate-limit detection with backoff** — already deferred as JL2-03 (v2). Phase 8 inherits the same boundary.

- **Pagination beyond page 10** — already deferred as JL2-04 (v2). Phase 8 inherits the same boundary.

- **Moving the skill to a per-user (`~/.claude/skills/`) location** — declined in Phase 5 D-01 (per-project). Unchanged in Phase 8.

- **Refactor single-lead and drain modes into a shared dispatch helper** — declined in D-11 (overkill at v1.1 scope). Revisit if the two modes diverge significantly in future phases.

- **Sentinel runtime enforcement for `COMPANY_SCOPE_ROLE_TITLE`** — already declined in Phase 7 D-11. Phase 8 inherits.

### Reviewed Todos (not folded)
None — no pending todos in `.planning/STATE.md` matched Phase 8's scope.

</deferred>

---

*Phase: 08-Skill Input Parsing, Navigation Branching + Drain*
*Context gathered: 2026-05-19*
