---
phase: 12-api-routes
plan: 01
subsystem: api
tags: [outreach-campaigns, rest-api, cursor-pagination, soft-delete, timeline]
completed: "2026-06-21T01:59:17Z"
duration_mins: 15
task_count: 2
file_count: 2
requirements: [CAMP-06, CAMP-08]
depends_on: []
provides: [outreach-campaign-crud-api]
affects: [timeline-events, outreach-emails]
tech_stack:
  added: []
  patterns: [cursor-pagination, grouped-aggregate-leftjoin, soft-delete-via-archivedAt, conditions-array-sql-join]
key_files:
  created:
    - src/app/api/outreach-campaigns/route.ts
    - src/app/api/outreach-campaigns/[id]/route.ts
  modified: []
decisions:
  - "Used sql<string> + json_build_object with count(*) FILTER (WHERE) for per-campaign email counts in a single grouped query (CD-01 anti-N+1) rather than a subquery or separate count queries"
  - "Campaign DELETE is soft (archivedAt) not hard — outreach_campaigns has archivedAt column per schema; contrasts with outreach_emails which has no archivedAt (CD-04)"
  - "No campaign state machine guard on PATCH/status field — D-10 decision: campaign status transitions are unguarded (only email status has a state machine)"
  - "campaignId passed in logTimeline metadata (not a dedicated FK column on timeline_events) — per interface spec"
---

# Phase 12 Plan 01: Campaign Lifecycle REST API Summary

**One-liner:** Campaign CRUD REST surface with cursor-paginated list, per-status email counts via one grouped aggregate, and soft-delete — all with timeline logging.

## What Was Built

Two new route files delivering the campaign-lifecycle REST surface that the Phase 14 builder UI and the CLI use to create and track outreach campaigns.

### `src/app/api/outreach-campaigns/route.ts`

- **GET** returns a cursor-paginated list of non-archived campaigns. Each campaign row carries an `emailCounts` object (`{ pending, generated, edited, approved, drafted, failed }`) computed by a single `leftJoin(outreachEmails) + groupBy(outreachCampaigns.id)` with `count(*) FILTER (WHERE status = ...)` — no N+1 per campaign (CD-01).
- **POST** creates a campaign from `{ name, goalInstruction }`, logs `outreach_campaign_created` to the timeline, returns 201 with the full inserted row including `id`.
- Archived campaigns (`archivedAt IS NOT NULL`) are excluded from the list via `isNull(outreachCampaigns.archivedAt)` as the base condition.
- Zod schema enforces `name: min(1)/max(200)` and `goalInstruction: min(1)`; 400 on validation failure.

### `src/app/api/outreach-campaigns/[id]/route.ts`

- **GET** returns a single campaign with the same grouped `emailCounts` construct as the list route; 404 on unknown id.
- **PATCH** accepts a whitelisted `{ name?, goalInstruction?, status? }` body, stamps `updatedAt: new Date()`, logs `outreach_campaign_updated`, returns the updated row. Status field restricted to `outreachCampaignStatusValues` via `z.enum` (mass-assignment safe, T-12-01). No state machine guard — D-10.
- **DELETE** soft-deletes by setting `{ archivedAt: new Date(), updatedAt: new Date() }`, logs `outreach_campaign_archived`, returns 204. Deleted campaigns are absent from subsequent GET list calls.
- All handlers return 404 via `notFound('Campaign')` on unknown id (T-12-03 — no row contents leaked).

## Verification Results

- `npx tsc --noEmit` — clean (no TypeScript errors)
- `grep -c "FILTER (WHERE" route.ts` — returns 6 (list route has all 6 status counts in one query)
- `grep -c "updatedAt: new Date()" [id]/route.ts` — returns 2 (PATCH and DELETE both stamp)
- `grep -n "api" src/proxy.ts` — line 7 shows `/api/(.*)` matcher covers new routes; T-12-04 confirmed, no middleware edit needed
- No stubs, TODO, FIXME, or placeholder text found in created files

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 — Campaign list + create | `4e551a2` | feat(12-01): campaign list + create route |
| 2 — Campaign single + update + delete | `cdac4fc` | feat(12-01): campaign single read + update + soft-delete route |

## Deviations from Plan

### TDD Flow Skipped (No Test Infrastructure)

Both tasks are marked `tdd="true"` in the plan, which normally requires a RED/GREEN/REFACTOR commit sequence. The project has no configured test framework (no `jest.config.*`, `vitest.config.*`, or test files detected per CLAUDE.md). Installing a test framework would require a package install, which per deviation Rule 3 is excluded from auto-fixable actions.

**Resolution:** Proceeded directly to implementation (GREEN equivalent) with `npx tsc --noEmit` as the automated verification step — which is what the plan's `<verify>` block specifies. TypeScript strict-mode compilation against the real Drizzle schema serves as the compile-time correctness gate. Documented here for continuity.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes were introduced beyond what is described in the plan's threat model. All four handlers return the `{ success, data, error, meta }` envelope. Auth is enforced upstream by `src/proxy.ts` (Clerk + Bearer token on `/api/(.*)`). No new threat flags.

## Known Stubs

None — all fields are wired directly to the database; no hardcoded placeholders or empty return values.

## Self-Check: PASSED

- FOUND: `src/app/api/outreach-campaigns/route.ts`
- FOUND: `src/app/api/outreach-campaigns/[id]/route.ts`
- FOUND: commit `4e551a2` (feat(12-01): campaign list + create route)
- FOUND: commit `cdac4fc` (feat(12-01): campaign single read + update + soft-delete route)
