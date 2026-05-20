---
phase: 10-connection-company-and-role-enrichment-for-triage
plan: "03"
subsystem: triage-ui
tags: [react, components, api-route, enrichment, recommendation, jit]
dependency_graph:
  requires: [contacts-enrichment-columns, enrichment-patch-endpoint]
  provides: [recommendation-card-enrichment-render, jit-enrichment-detection]
  affects: [recommendation-card, recommendation-list, recommendations-route]
tech_stack:
  added: []
  patterns: [optional-props-render, meta-extension, contact-deduplication]
key_files:
  created: []
  modified:
    - src/features/job-leads/components/recommendation-card.tsx
    - src/features/job-leads/components/recommendation-list.tsx
    - src/app/api/job-leads/[id]/recommendations/route.ts
decisions:
  - "JIT trigger uses meta-only fallback (pendingEnrichment + pendingEnrichmentContactIds) because the PATCH /enrichment endpoint stamps enrichmentStatus='enriched' immediately — there is no intermediate pending-flip path without scraped data; the UI/skill consumes the ids for actual triggering"
  - "Contact deduplication before JIT detection: a contact can bridge multiple prospects in the same recommendations join, so filter by first occurrence of each id before applying the null-field predicate"
metrics:
  duration: "~3 min"
  completed: "2026-05-20"
  tasks_completed: 2
  files_modified: 3
---

# Phase 10 Plan 03: Triage UI Enrichment Render + JIT Detection Summary

Recommendation cards now show each connection's company and role-at-connection alongside the existing fields, and the recommendations route detects just-in-time which mutual connections are still missing those fields and surfaces them in `meta.pendingEnrichment` for downstream consumption.

## What Was Built

**Recommendation card render (Task 1):** `RecommendationCardProps` gained two optional `string | null` fields (`companyAtConnection`, `roleAtConnection`). Below the existing "Last contact" muted subline the card renders `role @ company` as a sibling `text-muted-foreground mt-0.5 text-xs` line when either field is present. `recommendation-list.tsx` passes the values directly from `rec.contact` (the full `Contact` Drizzle type already includes the new columns from Plan 01).

**JIT enrichment detection (Task 2):** After the `prospectBridges → prospects → contacts` join and before `buildRecommendations`, the route now deduplicates contacts across bridge rows and identifies those with both `companyAtConnection === null` AND `roleAtConnection === null` AND `enrichmentStatus !== 'enriched'`. These ids are surfaced in `meta.pendingEnrichment` (count) and `meta.pendingEnrichmentContactIds` (string[]). The existing `totalProspects`/`totalBridges`/`totalContacts` keys are unchanged. No `db.update(contacts)` or `db.insert(contacts)` in this route (T-10-07 invariant).

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Render at-connection company + role on recommendation card and list | 00087ca | src/features/job-leads/components/recommendation-card.tsx, src/features/job-leads/components/recommendation-list.tsx |
| 2 | Add JIT enrichment detection + meta extension to recommendations route | bfb011d | src/app/api/job-leads/[id]/recommendations/route.ts |

## Verification

- `npx tsc --noEmit` exits 0 across both tasks and at final check
- `recommendation-card.tsx` `RecommendationCardProps` contains `companyAtConnection` and `roleAtConnection` as `string | null | undefined`
- Card renders `role @ company` muted subline using same class as last-contact line
- `recommendation-list.tsx` passes `companyAtConnection={rec.contact.companyAtConnection}` and `roleAtConnection={rec.contact.roleAtConnection}`
- Route detects contacts with both at-connection fields null and `enrichmentStatus !== 'enriched'`
- Route `meta` gains `pendingEnrichment` and `pendingEnrichmentContactIds`; existing keys unchanged
- Grep confirms no `db.update(contacts)` or `db.insert(contacts)` in recommendations route
- Build fails with DATABASE_URL missing (same environment-level failure as Plans 01 and 02 — not caused by these changes)

## Deviations from Plan

### Auto-fixed Issues

None.

### Architectural Note: JIT trigger uses meta-only fallback

**Found during:** Task 2 implementation analysis
**Issue:** The plan described flipping contacts to `enrichmentStatus='pending'` via `PATCH /api/contacts/[id]/enrichment`, but the PATCH endpoint (Plan 02) only accepts company/role values and stamps `enrichmentStatus='enriched'` immediately. Calling it without real scraped data would incorrectly mark contacts as enriched with null/null data.
**Decision:** Applied the plan's stated fallback: "fall back to ONLY reporting `pendingEnrichment`/`pendingEnrichmentContactIds` in meta (no status flip) and document that the UI/skill consumes the ids — never add an inline `db.update(contacts)` to this route."
**Impact:** The `pendingEnrichmentContactIds` in `meta` is the signal for the scrape skill (Plan 04) to pick up and process. This is architecturally correct — the skill drives the status lifecycle, not the recommendations read path.
**Files modified:** No extra file needed — the meta-only approach is already the correct Plan 03 pattern.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond what is documented in the plan's `<threat_model>`. T-10-07 (no inline DB write in recommendations route) confirmed by grep. T-10-08 (bearer token not forwarded) is N/A — the meta-only fallback was used. T-10-09 (React escapes interpolated strings) inherently satisfied by JSX string interpolation.

## Known Stubs

None. The `pendingEnrichmentContactIds` field surfaces real data (the Drizzle query columns are present post-migration). The render is conditional on field presence — cards missing data display nothing for that line, which is correct behavior for the unenriched state.

## Self-Check: PASSED

- `src/features/job-leads/components/recommendation-card.tsx` contains `companyAtConnection` — FOUND
- `src/features/job-leads/components/recommendation-list.tsx` contains `companyAtConnection={rec.contact.companyAtConnection}` — FOUND
- `src/app/api/job-leads/[id]/recommendations/route.ts` contains `pendingEnrichment` — FOUND
- Commit 00087ca exists — FOUND
- Commit bfb011d exists — FOUND
- No `db.update(contacts)` or `db.insert(contacts)` in recommendations route — CONFIRMED
