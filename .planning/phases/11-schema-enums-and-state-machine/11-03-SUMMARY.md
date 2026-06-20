---
phase: 11-schema-enums-and-state-machine
plan: "03"
subsystem: outreach/testing
tags: [vitest, pglite, state-machine, schema-regression, tdd]
dependency_graph:
  requires: ["11-01", "11-02"]
  provides: ["REV-05-pinned", "T-11-06-mitigated", "T-11-07-mitigated"]
  affects: []
tech_stack:
  added: []
  patterns: [pglite-schema-regression, vitest-globals]
key_files:
  created:
    - src/features/outreach/lib/email-status.test.ts
    - src/lib/db/__phase11_schema__.test.ts
  modified: []
decisions:
  - "isEmailTerminalState asserts false for every outreachEmailStatusValues value — D-06 (every state recoverable) verified by exhaustive iteration"
  - "Duplicate (campaign_id, contact_id) insert asserts .rejects.toThrow() — T-11-06 proven at DB level via PGlite constraint enforcement"
metrics:
  duration: ~12 min
  completed: "2026-06-20"
  tasks: 2
  files_created: 2
  files_modified: 0
---

# Phase 11 Plan 03: TDD — Pin Email Status + Schema Regression Summary

**One-liner:** Vitest tests lock the email-status state machine (canEmailTransition graph, isEmailTerminalState exhaustive false) and prove the outreach migration via PGlite (UNIQUE constraint, column defaults, nullable editedSubject).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | State-machine unit test (pure, no DB) | 95f59a4 | src/features/outreach/lib/email-status.test.ts |
| 2 | Schema-regression test (PGlite) | 082dd58 | src/lib/db/__phase11_schema__.test.ts |

## What Was Built

### Task 1: `src/features/outreach/lib/email-status.test.ts`

Pure Vitest unit test (no DB) pinning `canEmailTransition` and `isEmailTerminalState`:

- **Valid graph coverage:** loops `Object.entries(validEmailTransitions)` and asserts every edge returns true (mirrors pipeline.test.ts pattern).
- **Explicit chain:** pending→generated→edited→approved→drafted asserted step by step.
- **Regenerate edges:** edited→pending and generated→pending asserted true.
- **D-05:** drafted→edited asserted true (revise after draft).
- **Invalid skips:** pending→drafted, approved→pending, pending→approved all asserted false.
- **Unknown from:** canEmailTransition('nonexistent','pending') asserted false.
- **D-06 (terminal states empty):** isEmailTerminalState asserted false for every value in outreachEmailStatusValues via exhaustive iteration.

10/10 tests pass. Runs in <100ms (pure TS, no I/O).

### Task 2: `src/lib/db/__phase11_schema__.test.ts`

PGlite schema regression test replaying all `drizzle/migrations/*.sql` (including `0013_outreach_campaigns.sql`) into an in-memory database:

- Seeds FK targets: contacts row (firstName + lastName notNull) and outreachCampaigns row (name + goalInstruction notNull).
- Inserts outreachEmails with editedSubject: null — reads back and asserts status='pending', channel='email', editedSubject=null.
- Inserts duplicate (campaignId, contactId) and asserts `.rejects.toThrow()` — DB-level UNIQUE constraint enforcement (T-11-06).

2/2 tests pass in ~1.0s.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Mitigations Applied

| Threat ID | Status |
|-----------|--------|
| T-11-06 (Tampering: UNIQUE constraint) | Mitigated — schema-regression test proves duplicate (campaign_id, contact_id) row is rejected at DB level |
| T-11-07 (Repudiation: state-machine regression) | Mitigated — state-machine test pins the full transition graph; any future loosening (e.g. pending→drafted) will fail CI |

## Pre-existing Test Failures (Out of Scope)

The full suite (`npm run test:run`) shows 6 pre-existing timeouts in `src/app/api/job-leads/[id]/prospects/route.test.ts`. All 6 fail at 60000ms — these existed before Phase 11 and are unrelated to outreach. Scope boundary: not investigated or fixed here.

## Verification Results

| Command | Result |
|---------|--------|
| `npx vitest run src/features/outreach/lib/email-status.test.ts` | 10/10 passed |
| `npx vitest run src/lib/db/__phase11_schema__.test.ts` | 2/2 passed |
| `npm run test:run` | 192/198 passed (6 pre-existing timeouts in unrelated file) |

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED (test commit) | 95f59a4 | Present |
| GREEN (feat commit) | N/A (tests import Plan 11-02's feat commits 4cddef4, 12ab3cd) | Plan 03 is test-only |

This plan is test-only — GREEN implementation was committed in Plans 11-01 and 11-02. The test commits here are the RED gate for Phase 11 as a whole.

## Self-Check: PASSED

- `src/features/outreach/lib/email-status.test.ts` exists: FOUND
- `src/lib/db/__phase11_schema__.test.ts` exists: FOUND
- Commit 95f59a4 exists: FOUND
- Commit 082dd58 exists: FOUND
