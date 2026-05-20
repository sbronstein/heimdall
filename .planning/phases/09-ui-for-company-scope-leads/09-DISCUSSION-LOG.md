# Phase 9: UI for Company-Scope Leads - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-19
**Phase:** 9-UI for Company-Scope Leads
**Areas discussed:** Detail title treatment, List/card discriminator, Employee-count handling

---

## Detail Title Treatment (JL-C8)

Question: For a company-scope lead's detail page, what should occupy the prominent title area where a job-URL lead shows its role title?

| Option | Description | Selected |
|--------|-------------|----------|
| Company name as title + badge | Promote company name to the big CardTitle slot, show a small "Company scrape" badge next to it; the role-title line (sentinel / "Unknown Role") is replaced entirely | ✓ |
| Keep role line, add badge | Leave company name as subtitle, render a "Company scrape" badge in the title slot instead of "Unknown Role" text | |
| Badge only, no role text | Hide the role-title line completely, show just a "Company scrape" badge above the company name | |

**User's choice:** Company name as title + badge
**Notes:** The previewed layout showed an employee-count subtitle, but employee count was separately deferred (see below) — so the layout ships with the company name promoted to the title slot and the employee-count line omitted for now.

---

## List / Card Discriminator (JL-C9)

Question: How should the list/card view flag a company-scope lead so a mixed queue is scannable at a glance?

| Option | Description | Selected |
|--------|-------------|----------|
| Distinct icon + badge | Swap IconBuilding for a distinct icon AND add a small "Company" pill next to the status badge — strongest at-a-glance signal | ✓ |
| Badge/pill only | Keep IconBuilding for all, add a "Company" pill for company-scope leads only — one change, low risk | |
| Icon swap only | Swap the leading icon for company-scope leads, no extra pill — subtle, uncluttered | |

**User's choice:** Distinct icon + badge
**Notes:** Maximum scannability for a mixed queue chosen over the lighter-weight single-signal options.

---

## Employee-Count Handling (ROADMAP criterion #3)

Question: Criterion #3 wants employee count shown "once scraped" — but it isn't captured today (not in scrapedData, not joined into the detail RSC). How should we handle it?

| Option | Description | Selected |
|--------|-------------|----------|
| Join companies, show if present | Join companies.employeeCount into the detail RSC, render when non-null, omit when null; no scraper changes | |
| Read from scrapedData if skill adds it | Render from lead.scrapedData.employeeCount when present; null-tolerant; leaves room for skill to populate later | |
| Defer employee count entirely | Ship the badge + name density now; mark employee-count display as deferred since no pipeline populates it | ✓ |

**User's choice:** Defer employee count entirely
**Notes:** No pipeline populates employee count for a company-scope lead today. Phase 9 ships company-name density now; numeric employee count is the one partial gap against criterion #3 and is recorded as a deferred idea. The detail layout must not render an empty/"undefined employees" line.

---

## Claude's Discretion

- Exact `@tabler/icons-react` icon for company-scope leads (must contrast with `IconBuilding`, verify it exists in the installed version) — CD-01
- Badge/pill variant, copy ("Company scrape" detail / "Company" list), and exact placement at narrow widths — CD-02
- Rendered-test approach (jsdom React render vs SSR-structural) matching the Phase 2 harness, and fixture location — CD-03
- Detail-title fallback when `companyName` is also null (never show "Unknown Role" for a company-scope lead) — CD-04

## Deferred Ideas

- Employee-count display on the detail page — deferred until the skill captures it and the RSC joins `companies` (or reads `scrapedData.employeeCount`). The one partial gap against ROADMAP Phase 9 success criterion #3.
- Icon-swap-only or pill-only list treatments — declined in favor of icon + pill; revisit only if rows feel cluttered.
