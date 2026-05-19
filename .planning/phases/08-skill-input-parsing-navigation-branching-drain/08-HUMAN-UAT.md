---
status: partial
phase: 08-skill-input-parsing-navigation-branching-drain
source: [08-VERIFICATION.md]
started: 2026-05-19T00:00:00Z
updated: 2026-05-19T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Company URL argument → direct /people/ navigation
expected: Invoking the skill with `https://www.linkedin.com/company/<slug>` (or `https://linkedin.com/company/<slug>`) creates a synthetic job lead via `POST /api/job-leads`, then navigates agent-browser directly to `/company/<slug>/people/` — the job-posting step is skipped entirely. Company name is extracted from the People-page header (falls back to slug + warning on extraction failure).
result: [pending]

### 2. Bare company name → disambiguation → pick → Company-URL path
expected: Invoking with a bare company-name string (not UUID/URL/empty) runs a LinkedIn company search, presents the top 3–5 matches as a numbered list (`1. **Name** — N employees — Industry`), waits for the user's pick (always confirms, even on a single match), then proceeds via the Company-URL path. Zero matches fails loudly with `No companies found for "<name>"...` and creates no DB row.
result: [pending]

### 3. Drain mode — mixed queue, single loop, correct branch per lead type
expected: With a `queued` queue containing both a job-URL lead and a company-scope lead (with a known `companyLinkedinUrl`), a single `GET /api/job-leads?status=queued` + single loop processes both — job-URL leads run the job→company→employees flow, company-scope leads navigate directly to `companyLinkedinUrl/people/`. Each company-scope lead prints the D-15 confirmation line.
result: [pending]

### 4. Drain mode — D-14 fallback for null companyLinkedinUrl
expected: When draining a company-scope lead whose `companyLinkedinUrl` is null, the skill runs the bare-name search + disambiguation inline using `lead.companyName`, accepts the pick, then `PUT /api/companies/<lead.companyId>` with `{ linkedinUrl: <picked> }` to backfill so the next drain doesn't re-prompt.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
