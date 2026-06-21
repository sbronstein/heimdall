# Phase 12: API Routes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-20
**Phase:** 12-API Routes
**Areas discussed:** Generation-context endpoint, Timeline-event granularity, Regenerate reset semantics, Contacts-filter scope

---

## Generation-Context Endpoint

### Endpoint shape

| Option | Description | Selected |
|--------|-------------|----------|
| One bulk embedded endpoint | `GET .../generation-context` returns goalInstruction + every pending email with full contact brief + interactions joined in; one round-trip. Overrides the research doc's per-email N+1 design. | ✓ |
| Lean queue + per-email fetch | Architecture's original: lean `?status=pending` ids, skill calls `GET /contacts/[id]` + `GET /interactions` per email. N+1. | |
| Bulk ids + one batch contacts call | Queue returns email+contactId pairs; skill makes one `GET /contacts?ids=...` batch. Two round-trips. | |

### Contact context bundled

| Option | Description | Selected |
|--------|-------------|----------|
| Full brief + recent interactions | Name, howMet, companyAtConnection, roleAtConnection, current company/title, closeness, recipientEmail + ~3 recent interactions + `lowContext` flag. | ✓ |
| Brief only, no interactions | Identity/closeness fields only; skill fetches interactions separately. | |
| Everything on the contact row | Full contact record + all interactions. Risks over-referencing stale facts. | |

**User's choice:** One bulk embedded endpoint; full brief + recent interactions.
**Notes:** This is the one place Phase 12 deliberately diverges from `ARCHITECTURE.md` — the ROADMAP goal explicitly adds a "generation-context bulk fetch," and the project's anti-N+1 constraint (1500+ contacts) makes the per-email design a non-starter.

---

## Timeline-Event Granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Milestones + content writes | Campaign created/archived + bulk-add (one event) + per-email generation/draft; skip edits/approve/regenerate/recipient. | |
| Campaign-level only | Only campaign created/archived + bulk-add count; no per-email rows. | |
| Every write (full audit) | Every campaign write, edit, and status flip logs a row; distinct event_type per kind. | ✓ |

**User's choice:** Every write (full audit). *(Initial framing questioned the premise via free-text — see Notes.)*
**Notes:** User pushed back: "What's the issue with dumping 200 events into the dashboard feed? Obv not a huge amount of data for Postgres." Correct — it's not a DB-volume concern. Clarified that the only real cost is feed *readability* (a campaign run can interleave 200 status-flip rows ahead of higher-signal events like a recruiter reply), and that this is solvable at the render/display layer while un-logged events are unrecoverable. Given that, user chose the complete audit trail — consistent with the project's "timeline is the system of record" core value. Distinct `event_type` per kind enables later render-time filtering/grouping.

---

## Regenerate Reset Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Clear to clean pending | Null generated*, edited*, lastError*, generatedAt — pristine pending, identical to a fresh contact. (Phase 11 D-09 recommendation.) | |
| Clear edited*, keep generated* stale | Null edited* + failure fields, leave old generated* until the skill overwrites. UI can show the previous draft greyed while regeneration is queued. | ✓ |

**User's choice:** Clear edited*, keep generated* stale.
**Notes:** `edited*` clearing is forced regardless (otherwise the `editedX ?? generatedX` coalesce masks the new generation). Keeping `generated*` enables a nicer Phase 15 "regenerating, previous draft greyed-out" UX. Tradeoff captured as a hard downstream caveat (CONTEXT D-06): `status='pending'` no longer implies "no content" — consumers must check content presence, not status alone.

---

## Contacts-Filter Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Land in Phase 12 | Add howMet + connectionYearStart/End filter params to `GET /api/contacts` now, alongside the outreach tree. Phase 14 stays pure UI. | ✓ |
| Defer to Phase 14 | Build the filters next to the builder UI that exercises them. | |

**User's choice:** Land in Phase 12.
**Notes:** Phase 11 had already assigned these to Phase 12; landing them here makes Phase 12 the single "all API surface" phase. Additive, low-risk — they slot into the existing `conditions[]` + `sql.join` filter pattern.

---

## Claude's Discretion

Captured in CONTEXT.md `<decisions>` with recommendations for the planner to confirm:
- **CD-01** — campaign counts (CAMP-08) via a single GROUP BY query, not N+1 per campaign.
- **CD-02** — inline-edit `PATCH .../emails/[emailId]` auto-transitions `generated → edited`.
- **CD-03** — `/status` rejects `→ approved` when `editedX ?? generatedX` is null (can't approve an empty email).
- **CD-04** — email `DELETE` is a hard delete (no `archivedAt` on `outreach_emails`); campaign `DELETE` stays soft.
- **CD-05** — bulk-add response exposes the inserted count (`{ inserted, skipped }`).
- **CD-06** — write-back routes verify email-belongs-to-campaign before writing; `/recipient` nulls `recipientEmail` when `channel='linkedin_message'`.

## Deferred Ideas

- Render-layer feed filtering/grouping for the high-volume outreach events (UI concern, later dashboard pass).
- `?ids=` batch param on `GET /api/contacts` — the rejected D-01 alternative; revisit only if another consumer needs arbitrary multi-contact fetch.
- `skipped` email status (decline-without-delete) — carried from Phase 11; Phase 12 uses hard DELETE instead.
- DB-side non-null-before-approved CHECK constraint — CD-03 enforces this at the app layer instead.
