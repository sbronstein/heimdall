---
phase: 09-ui-for-company-scope-leads
reviewed: 2026-05-19T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/features/job-leads/components/scrape-results.tsx
  - src/features/job-leads/components/scrape-results.test.tsx
  - src/features/job-leads/components/job-lead-card.tsx
  - src/features/job-leads/components/job-lead-card.test.tsx
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 9: Code Review Report

**Reviewed:** 2026-05-19T00:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Phase 9 adds `linkedinJobUrl === null` branching to `ScrapeResults` and `JobLeadCard`, plus a pair of SSR structural test files (`renderToString` + manual jsdom). The component logic itself is correct and safe: all user-controlled fields are rendered as React children (no `dangerouslySetInnerHTML`), and the external link anchor carries `rel="noopener noreferrer"`. No security vulnerabilities were found.

Three warnings and three info items were identified. The most important finding is that the test suite's `JSDOM` DOM-query assertions silently pass even when `document` is an empty default jsdom document, because the vitest environment is `node` — not `jsdom` — and the tests instantiate jsdom manually without injecting the rendered HTML into the global `document`. In that configuration every `document.querySelector('a')` call resolves against a blank DOM that has no `<a>` tags, making `toBeNull()` checks vacuously true rather than genuinely exercised.

---

## Warnings

### WR-01: Test DOM assertions silently vacuous — jsdom documents never populated from rendered HTML

**File:** `src/features/job-leads/components/scrape-results.test.tsx:79`, `src/features/job-leads/components/job-lead-card.test.tsx:79`

**Issue:** Both test files create a `JSDOM` instance around the rendered HTML string but then call `dom.window.document` — which *is* the correct path. However, `new JSDOM(html, { url: '...' })` parses the raw HTML fragment produced by `renderToString`. `renderToString` emits a bare HTML fragment, not a full `<html><body>…</body></html>` document. JSDOM wraps the fragment into a document, so this part does work. The deeper problem is the `environment: 'node'` setting in `vitest.config.ts`: because vitest is running in the Node environment (not its own `jsdom` environment), calls to `document` in test scope resolve to the *global* `document` — but these tests use `dom.window.document` from the local `JSDOM` instance, so the global `document` leakage is avoided. That isolation is correct.

The real correctness risk is that the `document.querySelector('a')` assertion in the "does not render View Job Posting link" tests can yield a false-negative pass. `renderToString` serialises the React tree to an HTML string; JSDOM then parses that string. If any upstream mock (e.g., the `next/link` mock in `job-lead-card.test.tsx`) emits an `<a>` tag, it appears in the DOM. The `next/link` mock *does* emit `<a href={href}>`, meaning the company-scope card test that expects `.querySelector('a')` to be `null` will **fail** — but only because `JobLeadCard` wraps the entire card in a `<Link>` (rendered as `<a>`), not because of the job posting link. The Link wrapper `<a>` is always present regardless of `isCompanyScope`, so the test at line 95–99 in `scrape-results.test.tsx` passes correctly (no `<Link>` in `ScrapeResults`), but the analogous pattern could silently mislead if applied to `JobLeadCard`. Confirm both test files produce the expected failure before the "Company" pill before shipping. The `job-lead-card.test.tsx` does not test for absence of an `<a>` tag, so this is not currently broken — but it is a fragile setup worth documenting.

**Fix:** Add a `@vitest-environment jsdom` docblock comment at the top of each test file (vitest per-file environment override), or set `environment: 'jsdom'` in vitest.config.ts for the `*.test.tsx` glob. Additionally, use `data-testid` attributes or structure-aware queries rather than bare `document.querySelector('a')` to distinguish the "View Job Posting" anchor from the wrapping `<Link>` anchor:

```ts
// In job-lead-card.test.tsx, add per-file environment override:
// @vitest-environment jsdom

// Or scope anchor query more tightly:
const viewPostingLink = document.querySelector('a[href*="linkedin.com/jobs"]');
expect(viewPostingLink).toBeNull();
```

---

### WR-02: `scrapedData` cast is unsound — runtime content is never validated

**File:** `src/features/job-leads/components/scrape-results.tsx:11-16`

**Issue:** `lead.scrapedData` is typed as `unknown` (Drizzle infers `jsonb` columns as `unknown`). The cast to an inline object type is a TypeScript-only assertion — it tells the compiler the shape is known but performs no runtime check. If the database row contains a `scrapedData` value that does not match the asserted shape (e.g., `scrapedData` is a JSON array, a string, or has a `location` key whose value is a number), TypeScript will not catch it and the expression `scraped?.location` will silently produce the wrong type. Because `scraped?.location` is only used inside a React child expression and React coerces non-string values to strings, this is unlikely to crash — but rendering a non-string `location` (e.g., a number or object) as a React child will produce `[object Object]` in the UI.

**Fix:** Use a Zod parse or an `isPrimitive` guard before rendering:

```ts
import { z } from 'zod';

const scrapedSchema = z.object({
  companyName: z.string().optional(),
  roleTitle: z.string().optional(),
  location: z.string().optional(),
  companyLinkedinUrl: z.string().optional()
}).nullable();

const scraped = scrapedSchema.safeParse(lead.scrapedData).success
  ? scrapedSchema.parse(lead.scrapedData)
  : null;
```

If a full Zod parse is too heavy for a display component, at minimum guard the string type before rendering:

```ts
const location = typeof scraped?.location === 'string' ? scraped.location : null;
```

---

### WR-03: `lead.status` lookup can silently produce an unstyled badge for valid DB enum values

**File:** `src/features/job-leads/components/job-lead-card.tsx:55-58`

**Issue:** `statusColors` is keyed on string literals for 10 values. The `jobLeadStatusEnum` in the database also has 10 values, and they match the keys in `statusColors`. However, `statusColors` is typed as `Record<string, string>`, not `Record<(typeof jobLeadStatusValues)[number], string>`. There is no compile-time exhaustiveness guarantee: if a new status is added to the enum in the future, `statusColors[lead.status]` will return `undefined`, the `|| ''` fallback will suppress the style silently, and the badge will render completely unstyled. This is a maintenance trap, not a current runtime bug — but worth hardening now.

**Fix:** Type the map against the domain enum array so TypeScript catches missing entries at compile time:

```ts
import { jobLeadStatusValues } from '@/lib/domain/types';

const statusColors: Record<(typeof jobLeadStatusValues)[number], string> = {
  pending:   'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  scraping:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  // ... all 10 values required by the type
};
```

---

## Info

### IN-01: `companyLinkedinUrl` declared in `scrapedData` type cast but never used

**File:** `src/features/job-leads/components/scrape-results.tsx:15`

**Issue:** The inline type cast for `scraped` includes `companyLinkedinUrl?: string`, but that property is never referenced in the component's JSX. This is dead declaration weight — it implies a future rendering intent that isn't wired up, which may mislead future readers.

**Fix:** Remove `companyLinkedinUrl` from the cast until the property is actually rendered, or add a comment noting it is reserved for a future feature:

```ts
const scraped = lead.scrapedData as {
  companyName?: string;
  roleTitle?: string;
  location?: string;
  // companyLinkedinUrl: reserved for Phase X company-profile link
} | null;
```

---

### IN-02: `nullNameLead` test fixture: "renders `Company scrape` as the CardTitle text" assertion is ambiguous

**File:** `src/features/job-leads/components/scrape-results.test.tsx:109-110`

**Issue:** The test at line 109-110 asserts `expect(html).toContain('Company scrape')` when `companyName` is `null`. The component renders two nodes containing that string in the company-scope branch: the CardTitle fallback (`lead.companyName || 'Company scrape'`) and the adjacent `<Badge>Company scrape</Badge>`. The assertion passes whether the CardTitle fallback is working or the Badge alone is present. If the CardTitle branch accidentally stopped rendering the fallback text (regressed to empty), this test would still pass because the Badge text satisfies the `toContain` check.

**Fix:** Use JSDOM to assert specifically that the `<h3>` (the mocked `CardTitle`) contains the fallback text, not just that the full HTML string contains it anywhere:

```ts
it('renders "Company scrape" as the CardTitle text', () => {
  const { document } = dom.window;
  const title = document.querySelector('h3');
  expect(title?.textContent?.trim()).toBe('Company scrape');
});
```

---

### IN-03: `scrape-results.test.tsx` imports `JSDOM` and creates DOM instances but `dom` variable is unused in two of three `describe` blocks

**File:** `src/features/job-leads/components/scrape-results.test.tsx:75-97, 103-120`

**Issue:** In the "company-scope lead" and "null companyName" `describe` blocks, `dom` is assigned in `beforeAll` and `dom.window.document` is used only once per block (in the "does not render View Job Posting link" test). The `dom` binding is declared at `describe`-block scope but is only meaningful for a single test case. This is a minor layout concern but also causes the `beforeAll` callback to do JSDOM parsing even for tests that only check `html.toContain(...)` — wasted work.

**Fix:** Move JSDOM construction inline to only the test that needs it:

```ts
it('does not render "View Job Posting" link', () => {
  const { document } = new JSDOM(html, { url: 'http://localhost/' }).window;
  expect(document.querySelector('a')).toBeNull();
});
```

---

_Reviewed: 2026-05-19T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
