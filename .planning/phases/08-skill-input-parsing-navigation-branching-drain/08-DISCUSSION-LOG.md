# Phase 8: Skill Input Parsing, Navigation Branching + Drain - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-19
**Phase:** 8-Skill Input Parsing, Navigation Branching + Drain
**Areas discussed:** Argument parsing, Company-URL → display name, Disambiguation, Drain-mode URL data flow

---

## Argument Parsing

### Q1: How should the skill detect input shape?

| Option | Description | Selected |
|--------|-------------|----------|
| Strict LinkedIn URL regex | Branch order: empty → drain; UUID → single-lead; matches `/jobs/` → job-URL; matches `/company/<slug>` → company-URL; any other https:// → error; else → bare name. Tightest detection. | |
| Permissive URL routing | Branch order: empty → drain; UUID → single-lead; URL with `/company/` in path → company-URL; any other URL → job-URL (preserves existing behavior); else → bare name. Existing job-URL behavior unchanged. | ✓ |
| URL parser + path check | URL constructor try/catch; LinkedIn host gated; first path segment switch. Most defensive. | |

**User's choice:** Permissive URL routing
**Notes:** Preserves the current behavior of any URL falling into the job-URL branch — non-LinkedIn URLs hit the same downstream error pattern as today. Less aggressive than a strict LinkedIn-only allowlist.

### Q2: How should the company-URL regex handle slug variations?

| Option | Description | Selected |
|--------|-------------|----------|
| Match `/company/<slug>/*` with optional www and trailing path | Regex anchored, captures slug. Matches JL-C1 verbatim. | |
| Match strict canonical form only | https + lowercase slug + optional trailing slash. Rejects deeper paths. | |
| Strip trailing segments before regex match | Parse URL, split pathname, check `segments[1] === 'company' && segments[2]`. Tolerant of messy paste. | ✓ |

**User's choice:** Strip trailing segments before regex match
**Notes:** Most user-friendly approach — the user pastes from arbitrary LinkedIn pages (e.g., `/about/`, `/people/`, `?utm=...`) and the parser absorbs the noise. Re-derives the canonical company URL from the slug.

### Q3: What should happen when the input is empty whitespace or quotes?

| Option | Description | Selected |
|--------|-------------|----------|
| Treat as drain mode | Empty / quoted-empty / whitespace → drain. Matches current SKILL.md. | ✓ |
| Drain only on truly absent arg; reject empty quotes | Force the user to be explicit when they pass empty. | |
| Trim then check | Trim whitespace; length 0 → drain. Else proceed. | |

**User's choice:** Treat as drain mode
**Notes:** Matches current behavior. `.trim() === ''` covers all variants.

### Q4: How should bare-name vs UUID look-alike collisions be handled?

| Option | Description | Selected |
|--------|-------------|----------|
| UUID regex wins | If input matches the UUID regex exactly, treat as lead ID. Else fall through. Near-zero risk. | ✓ |
| Bare name length floor | ≥2 chars + at least one non-hex char rule. Defensive but burdens the user. | |
| Treat suspiciously-UUID-shaped names as bare | Verify via `GET /api/job-leads/<id>` round-trip first. Belt-and-suspenders. | |

**User's choice:** UUID regex wins
**Notes:** Hex-only-with-dashes company names are vanishingly rare. Strict regex match keeps the parser simple.

---

## Company-URL → Display Name

### Q1: When the user passes a LinkedIn company URL, where should the human-readable company name come from?

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-scrape company page | Skill extracts name from page header before POSTing. Phase 7's case-insensitive matcher catches dedup against existing companies. | ✓ |
| Use slug as `companyName` | POST with slug; user renames later. Fast; misses dedup. | |
| Prompt user inline | Skill asks for display name. Best dedup but worst UX in drain-style usage. | |

**User's choice:** Pre-scrape company page
**Notes:** Data quality wins over single-keystroke speed. Phase 7's `companies_name_idx` lookup hits the cleaned name properly.

### Q2: Where exactly does the skill extract the company name from the LinkedIn company page?

| Option | Description | Selected |
|--------|-------------|----------|
| H1 heading on `/company/<slug>/about/` | Most stable canonical header on the overview page. | ✓ |
| `<title>` tag of the page | Easy to extract, less DOM-dependent; needs suffix trimming. | |
| Snapshot tree, first matching aria-label | Most agent-browser-native; fuzzier than H1 lookup. | |

**User's choice:** H1 heading on `/company/<slug>/about/`
**Notes:** Most stable extraction target. (Note: combined with Q3's pick, the actual extraction happens on the `/people/` page header — same H1 element appears there.)

### Q3: What if the H1 extraction fails (page DOM shifted, sign-in wall, captcha)?

| Option | Description | Selected |
|--------|-------------|----------|
| Fall back to slug, warn user | Lead proceeds with slug as name; user renames later. Matches "never block happy path on cosmetic data". | ✓ |
| Fail loudly, abort | Cleaner but blocks otherwise-fine scrapes on a cosmetic issue. | |
| Prompt user inline | Best UX for one-off pastes; extra friction. | |

**User's choice:** Fall back to slug, warn user
**Notes:** Don't gate scrape progress on cosmetic data. User can curate company name later in the companies UI.

### Q4: Should the skill do a single navigation (about + people via tabs) or two separate navigations?

| Option | Description | Selected |
|--------|-------------|----------|
| Navigate to `/about/`, extract name, click 'People' tab | Mirrors real user browse; one session, two transitions. | |
| Navigate to `/company/<slug>/`, extract, then navigate to `/people/` | Two goto() calls. Simpler agent-browser flow. | |
| Navigate directly to `/people/`, extract name from page header there | Single navigation; relies on /people/ page header being reliable. | ✓ |

**User's choice:** Navigate directly to `/people/`, extract name from page header there
**Notes:** One page load. The People page also has a company-name header in the sticky bar; combine name extraction with the destination landing. Documents the H1 heuristic in `linkedin-navigation.md`.

---

## Disambiguation

### Q1: On single LinkedIn company-search match, what should the skill do?

| Option | Description | Selected |
|--------|-------------|----------|
| Always confirm, even for single match | Catches fuzzy-match weirdness. Slight friction. | ✓ |
| Auto-pick single match | Matches JL-C5's "more than one" wording. Faster. | |
| Auto-pick + show brief confirmation line | Middle ground; informational. | |

**User's choice:** Always confirm, even for single match
**Notes:** Maximum safety. Single match still requires `1` / Enter from the user before proceeding.

### Q2: On zero LinkedIn company-search matches, what should the skill do?

| Option | Description | Selected |
|--------|-------------|----------|
| Fail loudly | Surface error, exit cleanly. No DB pollution. | ✓ |
| Offer to create company-only stub anyway | Captures the name for future curation. | |
| Retry with broader query | Strip `Inc` / `LLC` suffixes and retry. | |

**User's choice:** Fail loudly
**Notes:** Auto-stripping suffixes is opaque; users prefer explicit "no match → try again with a URL". No DB pollution.

### Q3: What LinkedIn search URL/path should the skill use to find companies?

| Option | Description | Selected |
|--------|-------------|----------|
| Direct search URL pattern | `https://www.linkedin.com/search/results/companies/?keywords=<encoded>`. Deterministic. | ✓ |
| Global search bar + Enter | UI-driven; mirrors real user. More fragile. | |
| Try URL first, fall back to UI | Belt-and-suspenders. Adds prompt complexity. | |

**User's choice:** Direct search URL pattern
**Notes:** Matches the existing skill's preference for deterministic URL paths over UI clicks (Step 4 already prefers URL params over filter chips).

### Q4: How should the skill render the disambiguation list to the user?

| Option | Description | Selected |
|--------|-------------|----------|
| Markdown numbered list with three columns | `1. **Name** — N employees — Industry`. Compact, scannable. | ✓ |
| Markdown table | More visual structure; more vertical space. | |
| JSON block + numbered summary | LLM-friendly; uglier for user. | |

**User's choice:** Markdown numbered list with three columns
**Notes:** Terminal-friendly. User types a number; the skill picks the corresponding URL.

---

## Drain-Mode URL Data Flow

### Q1: In drain mode, how should the skill get the LinkedIn company URL for a company-scope lead?

| Option | Description | Selected |
|--------|-------------|----------|
| Extend `GET /api/job-leads` to join `companies.linkedinUrl` | One round-trip per drain; minimal API change. | ✓ |
| Separate `GET /api/companies/[id]` per lead | Two round-trips per lead. No API change. | |
| Re-run LinkedIn company search by name | Max friction; defeats persistent URLs. | |

**User's choice:** Extend `GET /api/job-leads` to join `companies.linkedinUrl`
**Notes:** Cleanest API. Confirmed `src/app/api/job-leads/route.ts` already loads the company FK — adding `companyLinkedinUrl` to the projection is a one-line change.

### Q2: Should the GET response shape include the full company object, or just `linkedinUrl`?

| Option | Description | Selected |
|--------|-------------|----------|
| Add `lead.companyLinkedinUrl` (single field) | Minimal; no nesting; easy to type-narrow. | ✓ |
| Add `lead.company` (full joined row) | Useful for future callers wanting `company.priority`, etc. | |
| Conditional include via `?with=company` query param | Backwards-compatible opt-in. | |

**User's choice:** Add `lead.companyLinkedinUrl` (single field)
**Notes:** Smallest API surface change. Other callers don't accidentally inherit company internals. A future `?with=company` opt-in can come later if needed.

### Q3: What if a company-scope lead has no `linkedinCompanyUrl` persisted (`companies.linkedinUrl` is null)?

| Option | Description | Selected |
|--------|-------------|----------|
| Fall back to LinkedIn company search by name + disambiguate | Mid-drain disambiguation prompt for that lead only. | ✓ |
| Skip the lead, write 'failed' | Cleaner skill code; worse UX. | |
| Abort the drain batch | Loud but disruptive. | |

**User's choice:** Fall back to LinkedIn company search by name + disambiguate
**Notes:** Consistent with the bare-name input path. User completes disambiguation once, the URL gets backfilled (Q4), and subsequent drains skip the prompt.

### Q4: When mid-drain disambiguation surfaces a URL for a null-URL company, should the skill backfill `companies.linkedinUrl`?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — PATCH companies after disambiguation pick | Next drain doesn't re-prompt. PATCH route already supports it. | ✓ |
| No — leave `companies.linkedinUrl` null | Each drain re-prompts. Useful for one-off scrapes only. | |
| Ask user inline per lead | User-driven; more prompts per drain. | |

**User's choice:** Yes — PATCH companies after disambiguation pick
**Notes:** Verified `src/app/api/companies/[id]/route.ts` PATCH route already accepts `linkedinUrl`. One-time pain for permanent gain across the company's future drain cycles.

### Q5: In drain mode, should the loop branch be a single conditional or two sub-routines?

| Option | Description | Selected |
|--------|-------------|----------|
| Single loop, branch on `lead.linkedinJobUrl` | Matches JL-C7 ("single loop"). Smallest skill-prompt diff. | ✓ |
| Two sub-routines invoked from one loop | Cleaner for future independent extensions. | |
| Refactor single-lead flow into helper, call from drain + single-lead | Larger refactor; behavior parity guarantee. | |

**User's choice:** Single loop, branch on `lead.linkedinJobUrl`
**Notes:** Smallest diff to the existing skill. Steps 4–5 of `linkedin-navigation.md` (2nd-degree filter + paginate/extract + write-back) stay shared at the bottom across all three input paths.

---

## Claude's Discretion

The planner has discretion on the following decisions (captured in CONTEXT.md as `CD-01` through `CD-05`):

- **CD-01:** Section ordering and heading style of the rewritten `linkedin-navigation.md` (recommended structure provided).
- **CD-02:** Exact a11y-tree heuristic for picking the H1 / heading element to extract company name from `/company/<slug>/people/` (e.g., filtering out nav-level H1s). Document the heuristic inline.
- **CD-03:** Whether to add a helper shell/node script for disambiguation rendering. Recommended: probably not at this scope.
- **CD-04:** Test fixture location and shape for the `GET /api/job-leads` `companyLinkedinUrl` regression test (one test in `route.test.ts`).
- **CD-05:** Whether to use a dedicated single-match disambiguation copy vs. reusing the multi-match numbered-list format. Recommended: same format for consistency.

## Deferred Ideas

- Auto-pick disambiguation for single matches — declined in D-08.
- Retry-with-broader-query on zero results — declined in D-09.
- Re-run LinkedIn search every drain regardless of persisted URL — declined in favor of caching.
- Full company object in `GET /api/job-leads` response — declined in favor of single field.
- Disambiguation helper script — CD-03 leaves it inline.
- Mid-drain disambiguation as a separate prompt format — declined; reuse bare-name format.
- Captcha / rate-limit backoff — already deferred as JL2-03 (v2).
- Pagination beyond page 10 — already deferred as JL2-04 (v2).
- Skill relocation to `~/.claude/skills/` — declined in Phase 5 D-01.
- Refactor single-lead + drain into shared dispatch helper — declined; overkill at v1.1 scope.
- Sentinel runtime enforcement for `COMPANY_SCOPE_ROLE_TITLE` — declined in Phase 7 D-11.
