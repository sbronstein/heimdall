# Phase 7: Schema + API for Company-Scope Leads - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-19
**Phase:** 07-schema-api-for-company-scope-leads
**Areas discussed:** Route shape, Company linking strategy, roleTitle representation, Duplicate detection

---

## Route Shape

### Q1: Where does the company-scope create endpoint live?

| Option | Description | Selected |
|--------|-------------|----------|
| Discriminated POST /api/job-leads | Extend the existing endpoint. Zod schema becomes a discriminated union. Keeps clients/skill from caring about two shapes. | ✓ |
| Dedicated POST /api/job-leads/company | Add a sibling route specifically for company-scope creation. Two endpoints to maintain. | |
| Dedicated POST /api/job-leads/synthetic | Same as above but named to emphasize 'no source URL'. | |

**User's choice:** Discriminated POST /api/job-leads (Recommended)
**Notes:** Captured as D-01. Single endpoint, single CLI URL.

### Q2: Discriminator strategy in the Zod schema?

| Option | Description | Selected |
|--------|-------------|----------|
| Implicit by presence | `z.union(...)`. Body shape alone decides the branch. | ✓ |
| Explicit 'scope' tag | Body must include `scope: 'job' \| 'company'`. | |
| Explicit 'kind' from URL query | `POST /api/job-leads?kind=company`. | |

**User's choice:** Implicit by presence (Recommended)
**Notes:** Captured as D-02. The route's header comment will document first-match-wins behavior for the ambiguous case.

### Q3: What status does the company-scope branch return its created lead at?

| Option | Description | Selected |
|--------|-------------|----------|
| queued directly | INSERT with status='queued'. Skill picks it up immediately. | ✓ |
| scraped then auto-flip to queued | Mirror the job-URL flow. Adds an unnecessary internal write. | |
| Brand-new initial state | Adds a new enum value just for this. Pollutes the state machine. | |

**User's choice:** queued directly (Recommended)
**Notes:** Captured as D-03. Matches SC #1 verbatim.

### Q4: Timeline event on company-scope create?

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse 'job_lead_created' with metadata flag | Existing event type, set `metadata.scope: 'company'`. | ✓ |
| New event type 'job_lead_company_created' | Distinct event type. Cleaner classification but adds an event type the timeline UI may not render. | |
| Two events: created + queued | Emit both. Most faithful but two writes per creation. | |

**User's choice:** Reuse 'job_lead_created' with metadata flag (Recommended)
**Notes:** Captured as D-04. Timeline UI is metadata-agnostic; no UI cascade.

---

## Company Linking Strategy

### Q1: Company match strategy when companyName is provided?

| Option | Description | Selected |
|--------|-------------|----------|
| Case-insensitive name only | Use the existing pattern from `POST /api/job-leads` (lower-name equality). Hits `companies_name_idx`. | ✓ |
| Name OR linkedinCompanyUrl (broader match) | Try name first; on miss + URL given, look up by linkedinUrl. More DB round-trips on miss. | |
| Strict: require exact name + URL when URL is provided | Both must match. Fails when LinkedIn URL drifts. | |

**User's choice:** Case-insensitive name only (Recommended)
**Notes:** Captured as D-07. One code path; reuse existing pattern.

### Q2: On a miss, what do we auto-create the companies row with?

| Option | Description | Selected |
|--------|-------------|----------|
| Minimum stub | name + linkedinUrl + schema defaults for the rest. | |
| Stub + queue for enrichment | Same as above plus an 'auto-created-from-scrape' tag for filtering. | |
| Reject if not found | Force explicit company creation. | ✓ (first answer) |

**User's choice:** Initially "Reject if not found"; reconsidered after follow-up question.
**Notes:** First answer conflicted with JL-C3 SC #3 ("created on the fly if absent"); reconciled in Q3.

### Q3 (reconciliation): Reject conflicts with JL-C3 SC #3. How to reconcile?

| Option | Description | Selected |
|--------|-------------|----------|
| Update the SC — reject + return 404 | Change SC #3; tighter data hygiene; user creates company first. | |
| Re-enable auto-create with minimum stub | Revert to auto-create; matches the original spec. | ✓ |
| Hybrid: auto-create only if linkedinCompanyUrl is provided | Trust URL input, distrust bare names. | |

**User's choice:** Re-enable auto-create with minimum stub
**Notes:** Final position captured as D-08. Defaults supply most fields; user curates the stub later.

### Q4: If we match an existing company that has no linkedinUrl but the request provides one, do we update the company row?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — backfill linkedinUrl on existing row | Only if existing linkedinUrl IS NULL. Never overwrites a non-null value. | ✓ |
| No — leave existing companies untouched | Existing rows are user-managed; cleaner separation. | |
| Always overwrite with the latest provided URL | Risk of clobbering curated values. | |

**User's choice:** Yes — backfill linkedinUrl on existing row (Recommended)
**Notes:** Captured as D-09. Non-destructive enrichment.

---

## roleTitle Representation

### Q1: How does a company-scope lead represent roleTitle in the DB?

| Option | Description | Selected |
|--------|-------------|----------|
| null | Persist `roleTitle = null`. Column already nullable. Cleanest data semantics. | |
| 'Company-wide scrape' sentinel | Persist the sentinel string. Simpler UI rendering, no null guards. | ✓ |
| Empty string '' | Worst of both. | |

**User's choice:** 'Company-wide scrape' sentinel
**Notes:** Captured as D-10. Differs from the recommendation; user prioritized UI simplicity over null-purity.

### Q2: Where does the sentinel string live?

| Option | Description | Selected |
|--------|-------------|----------|
| Constant in src/lib/domain/types.ts | `export const COMPANY_SCOPE_ROLE_TITLE = '...' as const;`. Single source of truth. | ✓ |
| Inline string in the API route | Hard-code in route.ts; UI matches by literal equality. Drift risk. | |
| Drizzle column default | Implicit; risks every lead getting it. | |

**User's choice:** Constant in src/lib/domain/types.ts (Recommended)
**Notes:** Captured as D-11.

### Q3: Should the API also enforce 'no other route sets this sentinel'?

| Option | Description | Selected |
|--------|-------------|----------|
| Convention only — documented, not enforced | Reserve by convention with a docstring. | ✓ |
| Add a runtime guard in scrapeJobPage | Override if returned. Defensive. | |
| No reservation — sentinel can collide | Accept the near-zero risk. | |

**User's choice:** Convention only — documented, not enforced (Recommended)
**Notes:** Captured as D-11.

### Q4: Phase 9 UI detection logic for 'is this a company-scope lead'?

| Option | Description | Selected |
|--------|-------------|----------|
| `linkedinJobUrl === null` | Structural fact. UI keys off URL nullness. Resilient. | ✓ |
| `roleTitle === COMPANY_SCOPE_ROLE_TITLE` | Use the sentinel as the discriminator. | |
| Both must be true | Belt and suspenders. | |

**User's choice:** `linkedinJobUrl === null` (Recommended)
**Notes:** Captured as D-12. Decouples Phase 9 from the sentinel string.

---

## Duplicate Detection

### Q1: If the user creates a company-scope lead for a company that already has an in-flight lead, what does the API do?

| Option | Description | Selected |
|--------|-------------|----------|
| Return the existing in-flight lead | Idempotent UX; 200 OK. | ✓ |
| Always create a new lead | Allow parallel/sequential leads. | |
| Reject with 409 Conflict | Force archive-then-create. | |

**User's choice:** Return the existing in-flight lead (Recommended)
**Notes:** Captured as D-13. Idempotent semantics for skill re-runs.

### Q2: What counts as 'in-flight' for the dedup check — which statuses block a new creation?

| Option | Description | Selected |
|--------|-------------|----------|
| queued \| searching \| failed | Active + recoverable. | ✓ |
| Add `found` too | Block if any non-archived lead has prospects. | |
| Only queued \| searching (exclude failed) | Failed leads can be replaced. | |

**User's choice:** queued \| searching \| failed (Recommended)
**Notes:** Captured as D-14. `failed` is recoverable per Phase 5 D-08.

### Q3: How does the response signal 'we returned an existing lead' vs 'we created a new one'?

| Option | Description | Selected |
|--------|-------------|----------|
| HTTP status code: 200 vs 201 | success() vs created(). Standard envelope both ways. | ✓ |
| Add a meta.isExisting flag in envelope | Always 201, with meta flag. | |
| Two response shapes | Breaks the envelope. | |

**User's choice:** HTTP status code: 200 vs 201 (Recommended)
**Notes:** Captured as D-13.

### Q4: Same dedup logic for job-URL leads, or scoped strictly to company-scope?

| Option | Description | Selected |
|--------|-------------|----------|
| Company-scope only | Don't change existing job-URL behavior. | ✓ |
| Apply to job-URL leads too | Extend dedup to both branches. | |
| Let user decide later | Defer. | |

**User's choice:** Company-scope only (Recommended)
**Notes:** Captured as D-15. Phase 7 stays scoped tight.

---

## Claude's Discretion

Captured as **CD-01..CD-05** in CONTEXT.md:

- **CD-01:** Drizzle Kit migration filename and SQL verification
- **CD-02:** Where the in-flight dedup SELECT lives (inline vs library)
- **CD-03:** Whether to add a one-line header comment to the generated migration file
- **CD-04:** Test fixture location (inline vs `src/test-utils/pglite.ts` helper)
- **CD-05:** Whether to fold `companies` lookup-or-create into a `findOrCreateCompany` helper

## Deferred Ideas

Captured in CONTEXT.md `<deferred>` section:

- DB-side partial UNIQUE index for race-proof dedup (deferred to "if a concurrency bug surfaces")
- Extending idempotent dedup to job-URL leads (separate phase if ever warranted)
- Dedicated `job_lead_company_created` timeline event type (future timeline UI overhaul)
- Runtime enforcement of the `COMPANY_SCOPE_ROLE_TITLE` sentinel reservation
- Backfilling old leads (not needed — no historical NULL rows)
- `findOrCreateCompany` library helper (refactor when a second caller appears)
- Bulk-import skill / CLI for company-scope leads (not v1.1)
