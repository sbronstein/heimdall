# Phase 11: Schema, Enums, and State Machine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-20
**Phase:** 11-schema-enums-and-state-machine
**Areas discussed:** Email status enum set, Transition graph rules, 'Needs LinkedIn' modeling, Edited content storage

---

## Email status enum set

| Option | Description | Selected |
|--------|-------------|----------|
| Lean 6 (REV-05 exact) | pending, generated, edited, approved, drafted, failed. 'Needs LinkedIn' via channel enum, not status. No transient generating/drafting (skills act per-email synchronously). | ✓ |
| Lean 6 + skipped | Adds `skipped` for decline-without-delete. | |
| Rich set (PITFALLS) | Adds generating, drafting, skipped, needs_linkedin_message. Risk of dead enum values. | |

**User's choice:** Lean 6 (REV-05 exact)
**Notes:** Matches the locked requirement REV-05 and the ROADMAP success criterion verbatim. `generating`/`drafting` are never persisted; `needs_linkedin_message` is absorbed by the channel column.

---

## Transition graph rules

### Sub-question A — Regenerate target

| Option | Description | Selected |
|--------|-------------|----------|
| → pending (re-queue) | generated→pending and edited→pending; skill drains WHERE status='pending'. Research's corrected model. | ✓ |
| → generated (in-place) | Keeps status at generated; needs a second queue signal beyond status. | |

**User's choice:** → pending (re-queue)

### Sub-question B — Is `drafted` terminal?

| Option | Description | Selected |
|--------|-------------|----------|
| Not terminal: drafted→edited | Supports DRFT-03 (edit-after-draft updates Gmail draft in place). Empty terminal set. Locks lifecycle so Phase 17 needn't touch the state machine. | ✓ |
| Terminal (research's default) | terminalEmailStates=['drafted']; contradicts DRFT-03's edit-after-draft requirement. | |

**User's choice:** Not terminal: drafted→edited
**Notes:** Resolved the research's self-contradiction (edited→generated vs edited→pending) in favor of →pending, and its conflict with DRFT-03 (terminal drafted) in favor of a recoverable drafted. Un-approve (approved→edited) and retry (failed→pending) folded into the recommended graph; terminal set is empty.

---

## 'Needs LinkedIn' modeling

| Option | Description | Selected |
|--------|-------------|----------|
| Now, in 0011 | Add outreachChannelEnum=['email','linkedin_message'] (default 'email', NOT NULL) + channel column in this migration. All three enums + full table shape ship in Phase 11. | ✓ |
| Defer to Phase 17 | Only 2 enums now; add channel when discovery is built. Forces a 2nd migration and leaves Phase 15 with no column for the REV-06 badge. | |

**User's choice:** Now, in 0011
**Notes:** "Needs LinkedIn" is a channel value, not a status (consistent with the lean-6 enum choice). Phase 15 ships before Phase 17 and needs the column for REV-06's badge.

---

## Edited content storage

| Option | Description | Selected |
|--------|-------------|----------|
| Separate edited* columns | generatedSubject/Body + editedSubject/Body (null until edited). Final = editedSubject ?? generatedSubject. Preserves AI original; enables revert/provenance. | ✓ |
| Single subject/body pair | Editing overwrites in place; status='edited' is the only signal. Simpler (2 cols), no provenance. | |

**User's choice:** Separate edited* columns
**Notes:** Matches the research the rest of the design assumes; gives Phase 15 a clean "revert to original" and Phase 17 a clear final-content resolution via coalesce.

---

## Claude's Discretion

- **CD-01:** Add both `lastError` and `lastErrorAt` to `outreach_emails` to match the `job_leads` failure pattern (recommended yes).
- **CD-02:** Include `generatedAt`/`approvedAt`/`draftedAt` lifecycle timestamps so Phase 12 routes have write targets.
- **CD-03:** Migration filename `0011_outreach_campaigns`; inspect emitted SQL (3 CREATE TYPE, 2 CREATE TABLE, unique + 3 indexes).
- **CD-04:** Test fixture helpers in `src/test-utils/pglite.ts` only above the DRY threshold; `canEmailTransition()` test is pure-function (no DB).
- **CD-05:** Schema-regression test `src/lib/db/__phase11_schema__.test.ts` mirroring `__phase7_schema__.test.ts` (assert unique constraint, nullable edited columns).
- **D-10 (not asked):** `outreach_campaign_status` = ['draft','active','completed'], default 'draft', NOT NULL; no campaign state machine — only email status is guarded.

## Deferred Ideas

- Richer email-status enum (generating/drafting/skipped/needs_linkedin_message) — rejected; `ALTER TYPE ... ADD VALUE` can extend later.
- `skipped` status (decline-without-delete) — tracked, not built.
- `canCampaignTransition()` — declined.
- DB-side non-null-content-before-approved constraint — left to Phase 12/15 enforcement.
- Google OAuth token DB table — v1.2 uses `~/.heimdall/google-token.json`; Phase 17.
