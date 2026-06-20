---
phase: 11-schema-enums-and-state-machine
plan: "02"
subsystem: domain-types
tags: [state-machine, types, outreach, email-status]
dependency_graph:
  requires: ["11-01"]
  provides: ["11-03"]
  affects: ["src/lib/domain/types.ts", "src/features/outreach/lib/email-status.ts"]
tech_stack:
  added: []
  patterns: ["Drizzle $inferSelect/$inferInsert inferred types", "pipeline.ts mirror for email-status state machine"]
key_files:
  created:
    - src/features/outreach/lib/email-status.ts
  modified:
    - src/lib/domain/types.ts
decisions:
  - "terminalEmailStates is empty — every email state is recoverable (D-06)"
  - "Guard order mirrors pipeline.ts: terminal check first, then map lookup ?? false"
  - "outreachEmailStatusValues array in types.ts must stay value-identical to outreach_email_status pgEnum in enums.ts"
metrics:
  duration: "~8 min"
  completed: "2026-06-20"
  tasks: 2
  files: 2
---

# Phase 11 Plan 02: Inferred Types and Email-Status State Machine Summary

**One-liner:** Drizzle-inferred OutreachCampaign/OutreachEmail types + three enum value arrays exported from types.ts, plus canEmailTransition() state machine at src/features/outreach/lib/email-status.ts mirroring pipeline.ts.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create email-status state machine | 4cddef4 | src/features/outreach/lib/email-status.ts (created) |
| 2 | Export outreach inferred types and enum value arrays | 12ab3cd | src/lib/domain/types.ts (modified) |

## What Was Built

### Task 1 — email-status.ts

Created `src/features/outreach/lib/email-status.ts` (directory `src/features/outreach/lib/` also created). Mirrors `src/lib/domain/pipeline.ts` exactly in module shape:

- `validEmailTransitions` map encodes the D-03 graph: 6 states, all edges including regenerate (generated→pending, edited→pending per D-04), un-approve (approved→edited per D-06), revise-after-draft (drafted→edited per D-05/DRFT-03).
- `terminalEmailStates = []` — empty, so `isEmailTerminalState()` returns `false` for every status value (D-06).
- `canEmailTransition(from, to)`: terminal check first → `validEmailTransitions[from]?.includes(to) ?? false`.
- `isEmailTerminalState(status)`: `terminalEmailStates.includes(status)`.
- All four symbols exported: `canEmailTransition`, `isEmailTerminalState`, `validEmailTransitions`, `terminalEmailStates`.

### Task 2 — types.ts

Three edits to `src/lib/domain/types.ts`:
1. Added `outreachCampaigns` and `outreachEmails` to the `import type { ... } from '../../../drizzle/schema'` block.
2. Added four inferred types: `OutreachCampaign`, `OutreachEmail`, `NewOutreachCampaign`, `NewOutreachEmail`.
3. Added three `as const` value arrays mirroring the pgEnums from enums.ts:
   - `outreachCampaignStatusValues = ['draft', 'active', 'completed']`
   - `outreachChannelValues = ['email', 'linkedin_message']`
   - `outreachEmailStatusValues = ['pending', 'generated', 'edited', 'approved', 'drafted', 'failed']`

## Verification

- `npx tsc --noEmit` exits 0 — no TypeScript errors in the project
- `grep -c "email-status"` in tsc output: 0 (no errors referencing email-status.ts)
- All 4 symbols present in email-status.ts: `canEmailTransition`, `isEmailTerminalState`, `validEmailTransitions`, `terminalEmailStates`
- All required exports present in types.ts: `OutreachCampaign`, `OutreachEmail`, `NewOutreachCampaign`, `NewOutreachEmail`, plus the 3 `*Values` arrays

## Deviations from Plan

None — plan executed exactly as written.

The `tdd="true"` flag on Task 1 is noted: the plan's `<done>` tag explicitly states "(Behavior pinned by the Vitest test in Plan 11-03.)" and `<files>` listed only the implementation file. The comprehensive behavioral test suite is Plan 11-03's deliverable; no test file was created here.

## Known Stubs

None. This plan produces pure TypeScript types and a pure function — no UI, no data binding, no placeholders.

## Threat Flags

No new security surface introduced. This plan is pure TypeScript types and a pure transition function with no HTTP endpoints, no auth paths, and no external I/O. T-11-04 (integrity of the transition map) is mitigated: the locked D-03 graph is encoded in `validEmailTransitions`; Phase 12's `/status` route will enforce it at the HTTP boundary.

## Self-Check

- [x] `src/features/outreach/lib/email-status.ts` exists
- [x] `src/lib/domain/types.ts` modified with outreach types + value arrays
- [x] Commit 4cddef4 (email-status.ts) exists
- [x] Commit 12ab3cd (types.ts) exists
- [x] `npx tsc --noEmit` passed (exit 0)
