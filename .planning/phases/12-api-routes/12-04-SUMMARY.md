---
phase: 12-api-routes
plan: "04"
subsystem: outreach-campaigns
tags: [api, outreach, generation, context, write-back, no-n+1]
dependency_graph:
  requires:
    - drizzle/schema/outreach-campaigns.ts
    - drizzle/schema/outreach-emails.ts
    - drizzle/schema/contacts.ts
    - drizzle/schema/interactions.ts
    - src/lib/api/types.ts
    - src/lib/api/errors.ts
    - src/lib/db/timeline.ts
  provides:
    - GET /api/outreach-campaigns/[id]/generation-context
    - PATCH /api/outreach-campaigns/[id]/emails/[emailId]/generation
  affects:
    - Phase 16 generate-outreach-emails skill (primary consumer)
tech_stack:
  added: []
  patterns:
    - inArray-batch-then-reduce for N+1 avoidance
    - campaign-scoped WHERE clause (CD-06) for IDOR mitigation
key_files:
  created:
    - src/app/api/outreach-campaigns/[id]/generation-context/route.ts
    - src/app/api/outreach-campaigns/[id]/emails/[emailId]/generation/route.ts
  modified: []
decisions:
  - "Used i.content (not i.notes) — interactions schema has content/subject, no notes column; confirmed by reading drizzle/schema/interactions.ts"
  - "Single inArray(interactions.contactId, contactIds) batch fetch + reduce group avoids N+1 regardless of campaign size (D-01)"
  - "lowContext flag computed as recentInteractions.length < 2 (D-02/GEN-02) to let skill flag sparse-context contacts without a second query"
  - "PATCH generation does not change email status — skill must call /status separately to transition to generated (GEN-05 design boundary)"
metrics:
  duration: "~10 minutes"
  completed: "2026-06-21T02:00:36Z"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
---

# Phase 12 Plan 04: Generation Context + Write-Back Routes Summary

**One-liner:** Bulk generation-context read (campaign goal + pending-email briefs + batched interactions + lowContext flag) and generation write-back (generatedSubject/Body/generatedAt) via two anti-N+1, no-logic route handlers.

## What Was Built

### Task 1: `GET /api/outreach-campaigns/[id]/generation-context` (commit 599f525)

Returns everything the Phase 16 `generate-outreach-emails` skill needs in one round-trip:

- Verifies campaign exists (404 on unknown id)
- Fetches all `status='pending'` emails with contact join — **one query** (no N+1)
- Batches interaction fetches: one `inArray(interactions.contactId, contactIds)` call + JS `reduce` group — **constant query count** regardless of campaign size (D-01)
- Returns per-email payload: `emailId, contactId, contact (brief fields), interactions (≤3 recent, summary=content), lowContext (true when <2 interactions)`
- Empty campaigns return `{ goalInstruction, emails: [] }` (200, no error)

Column name correction applied: `summary: i.content` (NOT `i.notes` — interactions table has `content`/`subject`, no `notes` column). Confirmed against `drizzle/schema/interactions.ts`.

### Task 2: `PATCH /api/outreach-campaigns/[id]/emails/[emailId]/generation` (commit 2de7970)

Generation write-back for the skill's output:

- Zod validates `{ generatedSubject: string.min(1).max(500), generatedBody: string.min(1) }` — empty strings return 400
- Campaign-scoped `WHERE` clause (CD-06): `and(eq(id, emailId), eq(campaignId, id))` — foreign email returns 404
- Writes `generatedSubject + generatedBody + generatedAt + updatedAt` — **no status change** (skill calls `/status` to transition separately)
- Logs `outreach_email_generated` timeline event (D-03/D-04)
- No generation logic in the route (GEN-05 boundary)

## Acceptance Criteria Verification

| Criterion | Result |
|-----------|--------|
| `npx tsc --noEmit` passes | PASS (clean) |
| `grep -c "i.notes\|\.notes" ...generation-context/route.ts` = 0 | PASS (0) |
| `grep -c "inArray" ...generation-context/route.ts` = 1 (query usage, plus import) | PASS |
| `grep -c "outreach_email_generated" ...generation/route.ts` = 1 | PASS |
| No generation logic in either route | PASS (verified by grep for openai/anthropic/llm) |

## Deviations from Plan

None — plan executed exactly as written.

The PATTERNS.md excerpt contained `summary: i.notes` but the correction note in the plan and the `<important_grounding>` pre-read correctly flagged this. Implementation uses `summary: i.content` per schema verification.

## Threat Mitigations Applied

| Threat | Mitigation |
|--------|-----------|
| T-12-15 (DoS — large campaign) | Constant query count: campaign verify + one join + one batched inArray |
| T-12-16 (Info disclosure — contact brief) | Payload limited to D-02 whitelist; campaign-scoped 404 on unknown id |
| T-12-17 (IDOR — generation write-back) | CD-06: `and(eq(id,emailId), eq(campaignId,id))` — foreign email returns 404 |
| T-12-18 (Tampering — generated content) | Zod min(1) on both fields; only generatedSubject/Body/generatedAt written — no mass-assignment |

## Known Stubs

None — both routes are fully functional implementations with no placeholders.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries beyond what the plan's threat model covers.

## Self-Check: PASSED

- `/Users/sbronstein/Github/heimdall/.claude/worktrees/agent-a7089a60b3f22c362/src/app/api/outreach-campaigns/[id]/generation-context/route.ts` — FOUND (commit 599f525)
- `/Users/sbronstein/Github/heimdall/.claude/worktrees/agent-a7089a60b3f22c362/src/app/api/outreach-campaigns/[id]/emails/[emailId]/generation/route.ts` — FOUND (commit 2de7970)
