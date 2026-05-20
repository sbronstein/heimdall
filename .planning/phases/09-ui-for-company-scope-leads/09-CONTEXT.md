# Phase 9: UI for Company-Scope Leads - Context

**Gathered:** 2026-05-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the **job-lead detail page** and the **job-lead list/card view** render company-scope leads (`linkedinJobUrl === null`) cleanly. A company-scope lead is a synthetic job lead created by the Phase 7/8 company-URL or bare-name flow — it has no source job URL and no real role title (the `roleTitle` is the `'Company-wide scrape'` sentinel, or null).

This is the final UI phase of milestone v1.1 (LinkedIn Scraping by Company). It owns **JL-C8** (detail page renders gracefully for null `linkedinJobUrl`) and **JL-C9** (list view visually distinguishes company-scope leads).

**In scope:**
- **Detail page (JL-C8):** Promote the **company name to the prominent title slot** for company-scope leads and show a **"Company scrape" badge** next to it (replacing the `'Company-wide scrape'` sentinel / "Unknown Role" text that a job-URL lead would show as its role title). Keep the existing null-guard on the "View Job Posting" link (already implemented at `scrape-results.tsx:32` — verify, do not re-add).
- **List/card view (JL-C9):** For company-scope leads, **swap the leading icon** (distinct from `IconBuilding`, e.g. `IconBuildingCommunity` / `IconUsersGroup`) **and add a small "Company" pill** near the status badge, so a user scanning a mixed queue can tell at a glance which leads are company-scope vs job-URL.
- A rendered component test for the detail view with a `linkedinJobUrl: null` fixture (JL-C8 verification).
- A rendered list test with a mixed-lead fixture — one company-scope, one job-URL (JL-C9 verification).

**Out of scope:**
- **Employee-count display (criterion #3) is DEFERRED** — see `<deferred>`. No pipeline currently populates employee count for a scraped company-scope lead (`companies.employeeCount` exists in schema but is not joined into the detail RSC and the skill does not write it). Phase 9 ships the company-name density (name promoted to title) now; the numeric employee count is a future enhancement. The detail layout must not break or show "undefined / NaN employees" — simply omit the count line.
- Any schema or API changes — Phase 7 (nullable columns) and Phase 8 (`companyLinkedinUrl` in `GET /api/job-leads`) already shipped everything the UI needs.
- Changes to the scraping skill — Phase 8 owns the skill; Phase 9 is read-only consumer of the data shape.
- Recommendation/triage UI changes — those flows are status-driven and lead-shape agnostic; unchanged.
- New status enum values or state-machine changes (none — same `queued → searching → found / failed` flow for both lead types).

</domain>

<decisions>
## Implementation Decisions

### Detail Page Treatment (JL-C8)

- **D-01:** **Company name as title + "Company scrape" badge.** For a company-scope lead, the prominent `CardTitle` slot in `scrape-results.tsx` shows the **company name** (currently the subtitle), with a small **"Company scrape" badge** rendered next to it. The role-title line — which for a company-scope lead would otherwise render the `'Company-wide scrape'` sentinel or "Unknown Role" — is **replaced entirely** by this treatment. For a job-URL lead, the existing layout (role title as `CardTitle`, company name as subtitle) is unchanged. The branch keys off `lead.linkedinJobUrl === null` (locked discriminator, Phase 7 D-12 / Phase 8 D-12) — never off the `roleTitle` sentinel.

- **D-02:** **"View Job Posting" link stays null-guarded — verify, don't re-add.** `scrape-results.tsx:32` already wraps the "View Job Posting" `<a>` in `{lead.linkedinJobUrl && (...)}`, so it is already hidden for company-scope leads. Phase 9 keeps this and the rendered test pins it (asserts the link is absent for a null-URL fixture). No new conditional logic is needed for the link itself — JL-C8's "link hidden, not broken" clause is already satisfied by existing code.

### List / Card View Treatment (JL-C9)

- **D-03:** **Distinct icon + "Company" pill.** In `job-lead-card.tsx`, company-scope leads (`linkedinJobUrl === null`) render a **distinct leading icon** (instead of the shared `IconBuilding`) **and** a small **"Company" pill** near the existing status `Badge`. Job-URL leads keep `IconBuilding` and show no pill. This is the strongest at-a-glance signal for a mixed queue (JL-C9). The icon swap alone or a pill alone were the lighter-weight alternatives; the user chose both for maximum scannability.

### Claude's Discretion

- **CD-01:** **Exact icon choice for company-scope leads.** Recommended: a `@tabler/icons-react` icon that reads as "group of people / org-wide" rather than "single building" — e.g. `IconBuildingCommunity` or `IconUsersGroup`. Planner picks the one that visually contrasts best with `IconBuilding` at 16px (`h-4 w-4`). Confirm the chosen icon is exported by the installed `@tabler/icons-react` version before using it.

- **CD-02:** **Badge/pill variant, copy, and exact placement.** Recommended: reuse the shadcn `Badge` component already imported in both files. Detail-page badge copy = "Company scrape"; list pill copy = "Company" (shorter, to fit the row). Variant `secondary` or `outline` to sit calmly next to the colored status badge. Planner decides exact placement (e.g., badge after `CardTitle` text vs. on its own line) based on layout/wrapping at narrow widths.

- **CD-03:** **Test harness and fixture location.** The phase needs rendered component tests (detail + list). Planner picks the rendering approach consistent with the Phase 2 Vitest harness — check whether the existing suite already renders React components (jsdom) or only does SSR-structural / DOM-shape assertions (the BUG-01 regression tests in Phase 2 used both SSR structural + jsdom mount). Match the established pattern rather than introducing a new render library. Fixtures: one company-scope lead (`linkedinJobUrl: null`, `roleTitle: 'Company-wide scrape'` or null, a `companyName`) and one job-URL lead.

- **CD-04:** **How the detail title renders the company name when `companyName` is also null.** Edge case: a company-scope lead whose `companyName` somehow didn't resolve. Recommended fallback chain: `companyName` → "Company scrape" label alone (the badge carries the meaning). Never render "Unknown Role" for a company-scope lead. Planner picks the exact fallback string.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v1.1 milestone trail
- `.planning/REQUIREMENTS.md` — JL-C8 (line 133) and JL-C9 (line 134) are the two requirements this phase owns; full verifiable acceptance text lives there
- `.planning/ROADMAP.md` §"Phase 9: UI for Company-Scope Leads" — goal + 3 success criteria (note: criterion #3 employee-count is deferred — see `<deferred>`)
- `.planning/PROJECT.md` §"Current Milestone: v1.1 LinkedIn Scraping by Company" — locked target features

### Phase lineage (the data shape this UI consumes)
- `.planning/phases/08-skill-input-parsing-navigation-branching-drain/08-CONTEXT.md` §"D-12" — the `lead.linkedinJobUrl === null` discriminator is shared between the skill's drain branch and this phase's UI; `'Company-wide scrape'` sentinel is informational only
- `.planning/phases/07-schema-api-for-company-scope-leads/07-CONTEXT.md` §"D-10/D-11/D-12" — `COMPANY_SCOPE_ROLE_TITLE` sentinel definition, nullable `linkedinJobUrl`/`roleTitle`, the Phase 9 UI discriminator decision

### Source files (read before planning)
- `src/features/job-leads/components/scrape-results.tsx` — **the detail-page component that changes for JL-C8.** Currently renders `roleTitle` as `CardTitle`, `companyName` as subtitle, and a null-guarded "View Job Posting" link. D-01 changes the title slot + adds badge for null-URL leads.
- `src/features/job-leads/components/job-lead-card.tsx` — **the list-row component that changes for JL-C9.** Currently always renders `IconBuilding`. D-03 adds the icon swap + "Company" pill for null-URL leads.
- `src/features/job-leads/components/job-lead-detail.tsx` — parent of `ScrapeResults`; renders status-driven blocks (queued/searching/failed/found). No change expected, but read to understand the detail composition.
- `src/app/dashboard/job-leads/[id]/page.tsx` — detail RSC; selects the lead by id (no `companies` join today). If a future phase wants employee count, this is where the join would be added — out of scope here.
- `src/app/dashboard/job-leads/page.tsx` — list RSC; selects all non-archived leads. Passes `JobLead[]` to `JobLeadsPage` → `JobLeadCard`.
- `src/features/job-leads/components/job-leads-page.tsx` — list container that maps leads to `JobLeadCard`.

### Type / domain anchors
- `src/lib/domain/types.ts` — `JobLead = typeof jobLeads.$inferSelect`; `COMPANY_SCOPE_ROLE_TITLE` constant (~line 219). The UI keys off `linkedinJobUrl === null`, not this sentinel.
- `drizzle/schema/job-leads.ts` — `linkedinJobUrl` and `roleTitle` are nullable (Phase 7); `scrapedData` is `jsonb`; `prospectCount` is a non-null integer. No `employeeCount` on `job_leads`.
- `drizzle/schema/companies.ts` — `employeeCount` lives here (not joined into the detail page) — relevant only to the deferred employee-count idea.

### Test harness
- `src/test-utils/pglite.ts`, `src/test-utils/call-route.ts` — Phase 2 harness. For Phase 9's rendered component tests, planner verifies whether the existing suite renders React (jsdom) and follows that pattern (CD-03).

### Project anchors
- `CLAUDE.md` — TS strict, named exports, `'use client'` only when needed, kebab-case files
- `.planning/codebase/CONVENTIONS.md` — component naming, props interface convention (`[Component]Props`), Tailwind class sorting
- `.planning/codebase/ARCHITECTURE.md` §"Anti-Patterns" — patterns to avoid

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`scrape-results.tsx`** — already imports `Card`/`CardHeader`/`CardTitle`/`CardContent` and `@tabler/icons-react` icons; the "View Job Posting" link is already null-guarded. D-01 modifies the header rendering; the existing structure is the base.
- **`job-lead-card.tsx`** — already imports `Badge`, `IconBuilding`, `IconUsers` and uses a `statusColors` map. D-03 adds one icon swap + one conditional pill; the row layout (flex, status badge, date) stays.
- **shadcn `Badge`** — already used in both target files; the "Company scrape" badge (detail) and "Company" pill (list) reuse it. No new primitive.
- **`@tabler/icons-react`** — already a dependency; the distinct company-scope icon comes from here (CD-01).

### Established Patterns
- **Discriminator is `linkedinJobUrl === null`** (Phase 7 D-12 / Phase 8 D-12) — both UI branches key off this single nullness check, never off the `roleTitle` sentinel string.
- **`'use client'` components receiving server-fetched `JobLead` props** — both target components are already client components fed by RSC pages. No data-fetching changes.
- **Null-tolerant rendering** — existing components already guard `lead.roleTitle`, `lead.companyName`, `lead.linkedinJobUrl`, `lead.prospectCount` with `||`/`&&`. The new branches follow the same defensive style.
- **Phase 2 test harness** — Vitest; BUG-01 regression used both SSR-structural and jsdom mount. The new rendered tests follow whichever the suite already supports (CD-03).

### Integration Points
- **RSC → client component** — `[id]/page.tsx` → `JobLeadDetail` → `ScrapeResults`; `page.tsx` → `JobLeadsPage` → `JobLeadCard`. Phase 9 touches only the two leaf client components (`scrape-results.tsx`, `job-lead-card.tsx`) plus their tests. No RSC query changes (employee-count join is deferred).
- **Shared `JobLead` type** — both components consume `JobLead` from `src/lib/domain/types.ts`; no type change needed (`linkedinJobUrl` is already `string | null`).

### What the Planner Does NOT Need to Research
- Whether to add an `isCompanyScope` field/flag (no — derive from `linkedinJobUrl === null` inline)
- Whether to change the API or RSC queries (no — data shape is sufficient; employee count is deferred)
- Whether to add a status enum value for company-scope (no — same statuses)
- Whether the "View Job Posting" link needs new hiding logic (no — already null-guarded at `scrape-results.tsx:32`)

### What the Planner DOES Need to Verify / Decide
- **The exact `@tabler/icons-react` icon** for company-scope leads exists in the installed version and contrasts with `IconBuilding` (CD-01).
- **The rendered-test approach** the Phase 2 suite supports (jsdom React render vs SSR-structural) and where to place fixtures (CD-03).
- **Badge placement at narrow card/title widths** — ensure the detail badge and list pill don't break the existing `truncate` / flex layout (CD-02).

</code_context>

<specifics>
## Specific Ideas

- **Detail header for a company-scope lead (D-01):** company name in the big `CardTitle` slot, "Company scrape" badge immediately after it. No role-title line, no employee-count line (deferred). For a job-URL lead the header is unchanged (role title big, company name subtitle).
  ```
  ┌──────────────────────────────────┐
  │ OpenAI            [Company scrape] │   ← company-scope lead
  └──────────────────────────────────┘
  ┌──────────────────────────────────┐
  │ VP Data & AI                       │   ← job-URL lead (unchanged)
  │ Acme Corp                          │
  └──────────────────────────────────┘
  ```

- **List row for a company-scope lead (D-03):** distinct leading icon + "Company" pill next to the status badge.
  ```
  [icon: community] OpenAI          [Company] [queued]   2026-05-19
  [icon: building]  Acme — VP Data            [queued]   2026-05-18
  ```

- **Branch shape (both components):**
  ```tsx
  const isCompanyScope = lead.linkedinJobUrl === null;
  ```
  One inline derivation per component; drives both the icon choice and the badge/pill render.

- **Tests to ship (narrow surface):**
  - Detail: render `ScrapeResults` (or `JobLeadDetail`) with a `linkedinJobUrl: null` fixture → assert "View Job Posting" link is absent, "Company scrape" badge present, company name in the title slot.
  - List: render the card list with a mixed fixture (one null-URL lead, one job-URL lead) → assert the company-scope row carries the distinct icon + "Company" pill and the job-URL row does not.

</specifics>

<deferred>
## Deferred Ideas

- **Employee-count display on the detail page (ROADMAP criterion #3).** No pipeline populates a company-scope lead's employee count today — `companies.employeeCount` exists in schema but is not joined into the detail RSC, and the Phase 8 skill does not write employee count into `scrapedData`. Shipping a count line now would render empty/`undefined`. Deferred until either (a) the skill captures employee count during the `/people/` scrape and writes it to `companies.employeeCount` or `scrapedData`, and (b) the detail RSC joins `companies` (or reads `scrapedData.employeeCount`). When revisited, the layout slot already chosen (under/next to the company-name title) is where it lands. This is the one partial gap against ROADMAP Phase 9 success criterion #3 — name density ships, numeric count does not.

- **Icon-swap-only or pill-only treatments** for the list view — declined in D-03 in favor of icon + pill for stronger scannability. Revisit only if the row feels cluttered at narrow widths.

### Reviewed Todos (not folded)
None — no pending todos in `.planning/STATE.md` matched Phase 9's scope.

</deferred>

---

*Phase: 09-UI for Company-Scope Leads*
*Context gathered: 2026-05-19*
