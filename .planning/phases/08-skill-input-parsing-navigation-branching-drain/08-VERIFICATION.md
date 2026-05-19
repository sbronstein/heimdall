---
phase: 08-skill-input-parsing-navigation-branching-drain
verified: 2026-05-19T18:05:00Z
status: human_needed
score: 9/9 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Invoke the skill with a LinkedIn company URL, e.g. `/scrape-linkedin-connections https://www.linkedin.com/company/openai/`"
    expected: "Skill parses the URL to slug 'openai', navigates directly to /company/openai/people/, extracts a company name from the page H1, POSTs to /api/job-leads with { companyName, linkedinCompanyUrl }, claims the lead via PATCH /status, and proceeds to the 2nd-degree filter — without visiting a job posting"
    why_human: "Agent-browser-driven navigation flow; per Phase 5 D-21, this skill category is verified by source-assertion grep (done above) plus a human smoke test, not by unit tests"
  - test: "Invoke the skill with a bare company name, e.g. `/scrape-linkedin-connections OpenAI`"
    expected: "Skill navigates to linkedin.com/search/results/companies/?keywords=OpenAI, extracts top 3-5 cards, renders a markdown numbered list with Name / employee count / industry, prompts 'Pick a number (1–N), or type the company URL directly:', waits for user pick, then proceeds through Company-URL path from Step 2"
    why_human: "Interactive disambiguation and agent-browser navigation; not unit-testable"
  - test: "Run drain mode (/scrape-linkedin-connections with no arg) against a queue containing both a job-URL lead and a company-scope lead (linkedinJobUrl IS NULL, companyLinkedinUrl IS NOT NULL)"
    expected: "Skill fetches GET /api/job-leads?status=queued, renders a table with a 'scope' column showing 'job-URL' vs 'company-scope', processes both leads in the same loop — job-URL lead uses Job-URL path Steps 1-3, company-scope lead navigates directly to companyLinkedinUrl/people/ — both converge at Shared Step 4"
    why_human: "End-to-end drain-mode execution with both lead types requires a live Heimdall instance, LinkedIn session, and agent-browser"
  - test: "Run drain mode against a company-scope lead with companyLinkedinUrl === null (bare-name fallback path)"
    expected: "Skill pauses and runs the bare-name disambiguation flow inline using lead.companyName, waits for user pick, then calls PUT /api/companies/<lead.companyId> with { linkedinUrl: <picked-url> } (not PATCH), then navigates to company employees page and resumes"
    why_human: "D-14 mid-drain fallback requires interactive user input and a live drain run to verify"
---

# Phase 8: Skill Input Parsing, Navigation Branching + Drain — Verification Report

**Phase Goal:** The `scrape-linkedin-connections` skill accepts a LinkedIn company URL or bare company name, navigates directly to the company employees page when no job URL exists, disambiguates multi-match company searches inline, and drain mode processes company-scope leads through the same single queue.
**Verified:** 2026-05-19T18:05:00Z
**Status:** human_needed — all automated checks PASS; 4 agent-browser behavioral flows require human smoke testing
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | GET /api/job-leads response rows include a top-level `companyLinkedinUrl` field (null or string) | ✓ VERIFIED | `route.ts:67` — `companyLinkedinUrl: companies.linkedinUrl` in explicit projection |
| 2 | The new field is sourced via a leftJoin from `companies.linkedinUrl` on `jobLeads.companyId` | ✓ VERIFIED | `route.ts:70` — `.leftJoin(companies, eq(jobLeads.companyId, companies.id))` |
| 3 | Skill argument parser branches in 5 ordered cases (first-match-wins): empty→drain, UUID, /company/ URL, other URL, bare-name | ✓ VERIFIED | `SKILL.md:47-63` — numbered 1-5 list with "first match wins" intro line |
| 4 | Skill accepts LinkedIn company URL (path containing /company/<slug>) and navigates directly to /company/<slug>/people/ | ✓ VERIFIED | `SKILL.md:53-57`, `linkedin-navigation.md §Company-URL path` — Branch 3 + Company-URL Step 2 documented |
| 5 | Skill accepts bare company name, presents top 3-5 matches inline as markdown numbered list, waits for user pick | ✓ VERIFIED | `SKILL.md:61`, `linkedin-navigation.md §Bare-name path Steps 1-4` — D-10 format, D-08 always-confirm, D-09 fail-loudly documented |
| 6 | Drain mode loop branches on `lead.linkedinJobUrl === null` (not roleTitle sentinel); company-scope branch navigates via `companyLinkedinUrl`; null `companyLinkedinUrl` triggers D-14 bare-name fallback | ✓ VERIFIED | `SKILL.md:81-110` — single loop with `if (lead.linkedinJobUrl == null)` discriminator; `roleTitle` not used as control-flow predicate (grep confirmed) |
| 7 | D-14 mid-drain PUT backfill uses PUT (not PATCH) for `/api/companies/[id]` everywhere in all skill docs | ✓ VERIFIED | All four skill files pass `grep -v '^#' | grep -c "PATCH /api/companies"` → 0; `PUT /api/companies` present in SKILL.md, heimdall-api.md §6, linkedin-navigation.md §Bare-name Step 5, troubleshooting.md mid-drain bullet |
| 8 | `references/linkedin-navigation.md` has three top-level entry-point paths plus shared section, in specified order | ✓ VERIFIED | Sections: Choosing the entry point / Job-URL path / Company-URL path / Bare-name path / Shared / Historically-stable selectors — in that order |
| 9 | Drain mode uses single `GET /api/job-leads?status=queued` endpoint for both lead types (no separate queue) | ✓ VERIFIED | `SKILL.md:72-74` — single curl to `?status=queued&limit=50`; both branches converge after the D-11 inline branch |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/app/api/job-leads/route.ts` | GET handler with leftJoin(companies) + explicit projection including companyLinkedinUrl | ✓ VERIFIED | Lines 51-73: explicit `.select({...}).from(jobLeads).leftJoin(companies, ...)` with all 15 fields (14 from jobLeads + 1 from companies) |
| `src/app/api/job-leads/route.test.ts` | New describe block covering D-13/CD-04 — mixed fixture asserting companyLinkedinUrl on both row types | ✓ VERIFIED | Lines 110-166: `describe('GET /api/job-leads (companyLinkedinUrl projection — D-13 / CD-04)')` with Test 15; all 11 tests pass |
| `.claude/skills/scrape-linkedin-connections/SKILL.md` | 5-branch argument parser + drain loop branches on `lead.linkedinJobUrl` + D-14 mid-drain PUT backfill + D-15 confirmation line | ✓ VERIFIED | Argument parsing §:47-63, Drain mode §:67-114 — all required content present |
| `.claude/skills/scrape-linkedin-connections/references/linkedin-navigation.md` | Three top-level paths (Job-URL / Company-URL / Bare-name) + shared Steps 4-5 + Choosing the entry point table | ✓ VERIFIED | All 6 required sections present in correct order; required content (slug extraction, search URL, zero-match message, PUT verb, extraction warning) all grep-confirmed |
| `.claude/skills/scrape-linkedin-connections/references/heimdall-api.md` | Documents `companyLinkedinUrl` on GET response, discriminated POST /api/job-leads body (§5), PUT /api/companies/[id] (§6) | ✓ VERIFIED | §1 GET extended with companyLinkedinUrl + D-13/D-12 notes; §5 POST /api/job-leads (new); §6 PUT /api/companies/[id] (new); -X PUT curl example present |
| `.claude/skills/scrape-linkedin-connections/references/troubleshooting.md` | Three new failure-mode bullets folded into existing `## LinkedIn navigation failed` category (5 bullets added total in the file) | ✓ VERIFIED | Name-extraction fallback, zero-match, mid-drain disambiguation bullets under LinkedIn navigation failed; Auto-pick and Retry-with-broader-query decline bullets under What the skill does NOT handle; exactly 7 top-level `## ` headings |
| `src/app/api/companies/[id]/route.ts` | Exports PUT (not PATCH) at line 55; updateCompanySchema accepts linkedinUrl at line 18 | ✓ VERIFIED | `export async function PUT` at line 55; `linkedinUrl: z.string().url().optional().nullable()` at line 18 — matches all doc claims |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `route.ts` GET handler | `drizzle/schema/companies.ts` linkedinUrl column | `leftJoin(companies, eq(jobLeads.companyId, companies.id))` | ✓ WIRED | `companies` import at line 10; `eq` imported at line 3; leftJoin at line 70 |
| `SKILL.md` Drain mode | GET /api/job-leads `companyLinkedinUrl` field | `lead.companyLinkedinUrl` in D-11 branch | ✓ WIRED | SKILL.md:87 reads `let url = lead.companyLinkedinUrl` — consuming the field Plan 08-01 added |
| `SKILL.md` D-14 fallback | PUT /api/companies/[id] | `PUT /api/companies/<lead.companyId> body { linkedinUrl: url }` | ✓ WIRED | SKILL.md:94 documents the PUT call; heimdall-api.md §6 is the contract reference |
| `SKILL.md` Branch 3 | `linkedin-navigation.md §Company-URL path` | `references/linkedin-navigation.md` relative link | ✓ WIRED | SKILL.md:57 references `references/linkedin-navigation.md § Company-URL path` |
| `SKILL.md` Branch 5 | `linkedin-navigation.md §Bare-name path` | `references/linkedin-navigation.md` relative link | ✓ WIRED | SKILL.md:61 references `references/linkedin-navigation.md § Bare-name path` |

### Data-Flow Trace (Level 4)

Not applicable to skill-prompt markdown artifacts. The one executable component (GET /api/job-leads route) passes Level 4: the leftJoin is a real DB join against the `companies` table — not a hardcoded empty value — and Test 15 confirms the join produces a non-null `companyLinkedinUrl` when the companies row has a non-null `linkedinUrl`.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| GET /api/job-leads route compiles and tests pass | `npx vitest run src/app/api/job-leads/route.test.ts` | 11 tests passed | ✓ PASS |
| Production build succeeds | `npm run build` | `✓ Compiled successfully in 9.2s` | ✓ PASS |
| No PATCH /api/companies anywhere in skill docs | `grep -v '^#' <file> | grep -c "PATCH /api/companies"` = 0 on all 4 skill files | 0 matches in each file | ✓ PASS |
| roleTitle NOT used as drain discriminator | `grep -E "roleTitle.*===|=== .*'Company-wide scrape'" SKILL.md` | No matches | ✓ PASS |
| Old 4-branch "stop and ask" branch removed | `grep "Argument did not look like a UUID or a URL" SKILL.md` | No matches | ✓ PASS |
| 5 sub-flow bullets in Single-lead mode Step 3 | `grep -c "^   - \*\*From" SKILL.md` | 5 | ✓ PASS |
| troubleshooting.md still has exactly 7 top-level sections | `grep -c "^## " troubleshooting.md` | 7 | ✓ PASS |
| Agent-browser navigation flows (company URL, bare name, drain) | Requires live Heimdall + LinkedIn + agent-browser | Not runnable without dev server + browser | ? SKIP — human verification required |

### Probe Execution

No probe scripts declared or conventional for this phase (skill-prompt + documentation phase; per Phase 5 D-21, agent-browser-driven flows are verified by source-assertion grep + human smoke test, not automated probes).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| JL-C1 | 08-02 | Skill accepts LinkedIn company URL, uses it as navigation entry point | ✓ SATISFIED | SKILL.md §Argument parsing Branch 3 + linkedin-navigation.md §Company-URL path |
| JL-C2 | 08-02 | Skill accepts bare company-name, performs company search + disambiguate | ✓ SATISFIED | SKILL.md §Argument parsing Branch 5 + linkedin-navigation.md §Bare-name path (Steps 1-4 with D-10 format, D-08 always-confirm, D-09 fail-loudly) |
| JL-C5 | 08-02 | Multi-match disambiguation: top 3-5 results as numbered list, wait for pick | ✓ SATISFIED | linkedin-navigation.md §Bare-name Step 3 (D-10 format) + Step 4 (D-08 single-match confirm, D-09 zero-match fail-loud) |
| JL-C6 | 08-02 + 08-03 | Navigation branches on `linkedinJobUrl` null: null → direct /people/, non-null → job flow | ✓ SATISFIED | SKILL.md drain mode loop (D-11/D-12), Single-lead mode Step 3 sub-bullets, linkedin-navigation.md §Choosing the entry point table |
| JL-C7 | 08-01 + 08-03 | Drain mode uses single `GET ?status=queued` endpoint, single loop for both lead types | ✓ SATISFIED | SKILL.md §Drain mode — one curl to `?status=queued`; D-11 inline branch; no separate queue/status/route |

All 5 phase requirements (JL-C1, JL-C2, JL-C5, JL-C6, JL-C7) are satisfied. No orphaned requirements — all 5 are claimed by the phase plans and verified.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `SKILL.md` | 57 | `PATCH /status` reference in Branch 3 description | ℹ️ Info | "claim via PATCH `/status`" — this is the correct PATCH for `/api/job-leads/[id]/status` (a different route from `/api/companies/[id]`). Not a bug. The hard invariant is about PATCH /api/companies only, which is correctly absent. |
| `references/heimdall-api.md` | 83-100 | GET response example documents 7 of 16 fields returned by handler; `companyId` absent from example (though mentioned in D-13 note at line 103 and in POST response at line 295) | ⚠️ Warning | WR-03 from code review: D-14 backfill relies on `companyId` from the GET row; skill author must infer it from the D-13 note or source — not from the response example. Advisory only per verification notes. |
| `src/app/api/job-leads/route.test.ts` | 110-165 | Test 15 covers only happy path (company with non-null linkedinUrl); null paths (companyId=null, or company with null linkedinUrl) untested | ⚠️ Warning | WR-02 from code review: D-14 mid-drain branch triggers on `companyLinkedinUrl == null`; regression not covered. Advisory only per verification notes. |

No `TBD`, `FIXME`, or `XXX` markers found in phase-modified files.

### Human Verification Required

The following 4 tests require a running Heimdall dev server + LinkedIn session + installed agent-browser. These are intentionally deferred per Phase 5 D-21 (agent-browser-driven flows are not unit-testable).

#### 1. Company URL argument — direct navigation

**Test:** Invoke `/scrape-linkedin-connections https://www.linkedin.com/company/openai/`
**Expected:** Skill parses slug "openai", navigates directly to `/company/openai/people/` (no job posting step), extracts company name from H1, POSTs `{ companyName: "OpenAI", linkedinCompanyUrl: "https://www.linkedin.com/company/openai/" }` to /api/job-leads (201 newly created OR 200 dedup), claims via PATCH /status, applies 2nd-degree filter, extracts prospects, writes back via POST /prospects
**Why human:** Full agent-browser navigation flow; cannot execute without a running LinkedIn session

#### 2. Bare company name argument — disambiguation

**Test:** Invoke `/scrape-linkedin-connections OpenAI`
**Expected:** Skill navigates to `https://www.linkedin.com/search/results/companies/?keywords=OpenAI`, extracts top 3-5 company cards, renders markdown numbered list `1. **Name** — N employees — Industry`, prompts `Pick a number (1–N), or type the company URL directly:`, waits for user input, then proceeds as Company-URL path from Step 2 onward (direct /people/ navigation)
**Why human:** Interactive disambiguation UX requires a live agent-browser session and human input

#### 3. Drain mode — mixed queue (job-URL + company-scope with known URL)

**Test:** Seed queue with one job-URL lead and one company-scope lead (linkedinJobUrl=null, companyLinkedinUrl='https://www.linkedin.com/company/acme/'), then invoke `/scrape-linkedin-connections` (no arg)
**Expected:** Skill renders queue table with scope column, offers process-all prompt. For job-URL lead: follows Job-URL path (open job posting → company link → employees link). For company-scope lead: prints D-15 confirmation "Lead <id>: company-scope (AcmeCo) — navigating to .../people/..." and navigates directly to /people/. Both converge at Shared Step 4.
**Why human:** Requires live drain run with mixed queue against LinkedIn

#### 4. Drain mode — D-14 fallback (company-scope lead with null companyLinkedinUrl)

**Test:** Seed queue with a company-scope lead where companyLinkedinUrl=null, then invoke `/scrape-linkedin-connections` (no arg)
**Expected:** Skill pauses mid-drain, runs bare-name search for lead.companyName inline, presents disambiguation list, waits for user pick, then calls `PUT /api/companies/<lead.companyId> { linkedinUrl: <picked> }` (PUT, not PATCH), then navigates to /people/ and resumes
**Why human:** D-14 interactive fallback requires live drain run + user input + verification that PUT (not PATCH) is the actual verb used

### Gaps Summary

No gaps. All 9 must-haves are verified. The 4 human verification items are deferred-by-design per Phase 5 D-21 (agent-browser-driven flows are not unit-testable; this category of skill verification has been human-only since Phase 5).

The code review warnings (WR-01, WR-02, WR-03) are advisory and were explicitly noted as non-blocking per the verification notes. WR-01 (scraped job-URL leads do not backfill companies.linkedinUrl) and WR-02 (Test 15 lacks null-path coverage) are the most materially load-bearing of the three. WR-03 (GET response example omits companyId) is mitigated by the D-13 note at heimdall-api.md:103 which references companyId contextually, and by the POST response example at line 295.

---

_Verified: 2026-05-19T18:05:00Z_
_Verifier: Claude (gsd-verifier)_
