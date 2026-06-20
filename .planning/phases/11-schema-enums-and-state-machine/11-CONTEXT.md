# Phase 11: Schema, Enums, and State Machine - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

The Postgres data model for v1.2 Networking Outreach Campaigns, plus the email-status state machine — landed **before any consumer is built** so API routes (Phase 12), UI (Phases 14–15), and skills (Phases 16–17) all build against a stable, locked surface.

**In scope:**
- Three new `pgEnum`s in `drizzle/schema/enums.ts`: `outreach_campaign_status`, `outreach_channel`, `outreach_email_status`
- New table `outreach_campaigns` (`drizzle/schema/outreach-campaigns.ts`)
- New table `outreach_emails` (`drizzle/schema/outreach-emails.ts`) with three indexes and the `UNIQUE (campaign_id, contact_id)` constraint
- Barrel exports in `drizzle/schema/index.ts`
- Inferred types (`OutreachCampaign`, `NewOutreachCampaign`, `OutreachEmail`, `NewOutreachEmail`) and enum value arrays (`outreachCampaignStatusValues`, `outreachChannelValues`, `outreachEmailStatusValues`) in `src/lib/domain/types.ts`
- Migration `0011_*` generated via `npm run db:generate` and run against the live Neon DB via `npm run db:migrate`
- `canEmailTransition()` + `isEmailTerminalState()` + exported transition map at `src/features/outreach/lib/email-status.ts`, mirroring `src/lib/domain/pipeline.ts`
- Vitest test pinning the state machine (valid + invalid moves) and a schema-shape regression test mirroring `__phase7_schema__.test.ts`

**Out of scope (later phases — do NOT build here):**
- Any API route under `/api/outreach-campaigns/` — Phase 12
- The `howMet` / `connectionYearStart` / `connectionYearEnd` filter params on `GET /api/contacts` — Phase 12
- Triage connection-date filter — Phase 13
- All UI (`src/features/outreach/components/*`, dashboard pages, sidebar nav) — Phases 14–15
- Generation and drafting skills, Google OAuth, Gmail MIME — Phases 16–17
- New timeline event types — **resolved during scout: none needed.** `timeline_events.event_type` is free-text (`text`, not an enum), so outreach event types require no enum/migration; they are written by Phase 12+ routes.
- A campaign-status state machine — only **email** status is guarded (see D-09)

</domain>

<decisions>
## Implementation Decisions

### Email Status Enum (Area 1)

- **D-01:** **Lean 6-value `outreach_email_status` enum**, exactly as REV-05 / ROADMAP lock it: `['pending', 'generated', 'edited', 'approved', 'drafted', 'failed']`. Rejected the richer PITFALLS.md Pitfall-4 set (`generating`, `drafting`, `skipped`, `needs_linkedin_message`): `generating`/`drafting` are never persisted because skills act per-email **synchronously** (no transient state is ever observed by a reader), and `needs_linkedin_message` is modeled by the `channel` column (D-07), not a status. No dead enum values.
- **D-02:** **`pending` is the queue signal.** The Phase 16 generation skill drains `WHERE status = 'pending'`. Every "(re)generate" path resolves to `pending` (D-04) so the skill stays dumb — one queue semantic, no secondary flag.

### Transition Graph (Area 2) — `canEmailTransition()`

- **D-03:** **Full transition map** (mirrors `validTransitions` in `pipeline.ts`):
  ```ts
  const validEmailTransitions: Record<string, string[]> = {
    pending:   ['generated', 'failed'],
    generated: ['edited', 'approved', 'failed', 'pending'], // pending = regenerate
    edited:    ['approved', 'pending'],                      // pending = regenerate
    approved:  ['drafted', 'edited'],                        // edited = un-approve
    drafted:   ['edited'],                                   // edited = revise after draft (DRFT-03)
    failed:    ['pending']                                   // retry
  };
  const terminalEmailStates: string[] = []; // empty — every state is recoverable
  ```
- **D-04:** **Regenerate → `pending`** (not `→ generated`). `generated → pending` and `edited → pending` are the regenerate edges. Resetting to `pending` is what makes the generation skill re-pick the row via its `WHERE status='pending'` queue. This is the research's own corrected model; the contradictory `edited → generated` variant in ARCHITECTURE.md §"Email Status State Machine" is **rejected**.
- **D-05:** **`drafted` is NOT terminal — `drafted → edited` is allowed.** Required by DRFT-03 (Phase 17): editing an already-drafted email must update the existing Gmail draft in place. Flow: `drafted → edited → approved → drafted` (the re-draft is idempotent via the `gmailDraftId` check in the skill). This **overrides** ARCHITECTURE.md's `terminalEmailStates = ['drafted']`. Locking it here means Phase 17 never has to touch the state machine.
- **D-06:** **`approved → edited` (un-approve) is allowed** so the approve gate is reversible — the owner can pull an email back out of "approved" to re-edit before it's drafted. Terminal set is therefore empty; `isEmailTerminalState()` returns `false` for all states but is still exported to mirror `pipeline.ts` (UI may use it).

### Channel / "Needs LinkedIn" Modeling (Area 3)

- **D-07:** **`outreach_channel` enum `['email', 'linkedin_message']`, default `'email'`, NOT NULL**, on `outreach_emails`. "Needs LinkedIn message" is a **channel value, not a status** (consistent with D-01). The Phase 15 REV-06 badge and Phase 17 DISC-03 both key off `channel = 'linkedin_message'`.
- **D-08:** **Land the channel enum + column in migration 0011 now** — not deferred to Phase 17. Phase 11's whole job is to lock the full model so no later phase needs a schema migration; Phase 15 (which ships before Phase 17) needs the column to render REV-06's badge. Discovery state reads cleanly from existing columns: `channel='email' & recipientEmail IS NULL` = discovery not yet run; `channel='email' & recipientEmail` set = ready to draft; `channel='linkedin_message'` = manual LinkedIn.

### Edited Content Storage (Area 4)

- **D-09:** **Separate `editedSubject` / `editedBody` columns** alongside `generatedSubject` / `generatedBody`. The skill writes `generated*`; the owner's inline edits write `edited*` (null until edited). **Final content used for drafting = `editedSubject ?? generatedSubject`** (likewise body) — this coalesce is the canonical resolution Phases 15/17 use. Preserves the AI original after edits (provenance / "revert to original" in Phase 15). Regenerate (D-04) resets the row to `pending`; the planner decides whether the `/status` route clears `edited*`/`generated*` on that reset (recommended: clear both so the skill rewrites cleanly).

### Campaign Status (no question asked — captured for the planner)

- **D-10:** **`outreach_campaign_status` enum `['draft', 'active', 'completed']`, default `'draft'`, NOT NULL.** **No state machine** guards campaign status — only email status is guarded. The Phase 12 `PATCH /api/outreach-campaigns/[id]` route sets it freely. Do not build a `canCampaignTransition()`.

### Claude's Discretion (planner decides; recommendation given)

- **CD-01:** **Match the `job_leads` failure pattern: both `lastError` (text) AND `lastErrorAt` (timestamp, withTimezone)** on `outreach_emails`. ARCHITECTURE.md lists only `lastError`; adding `lastErrorAt` keeps the failure-tracking shape identical to `job-leads.ts:36-37`. Recommended yes.
- **CD-02:** **Lifecycle timestamp columns** `generatedAt`, `approvedAt`, `draftedAt` (nullable, set by Phase 12 routes on the corresponding transition) per ARCHITECTURE.md. Include them in 0011 so the routes have somewhere to write. Recommended yes.
- **CD-03:** **Migration filename** — run `npm run db:generate -- --name=outreach_campaigns`; expect `0011_outreach_campaigns.sql`. Inspect the emitted SQL: it should `CREATE TYPE` for the three enums, `CREATE TABLE` ×2, the unique constraint, and three indexes. Hand-edit only if Drizzle Kit emits anything unexpected.
- **CD-04:** **Test fixtures** — a `createOutreachCampaign()` / `createOutreachEmail()` helper in `src/test-utils/pglite.ts` only if reused across both the state-machine test and the schema-regression test (DRY threshold). The `canEmailTransition()` unit test needs no DB at all (pure function, like `pipeline.test.ts`).
- **CD-05:** **Schema-regression test** mirroring `src/lib/db/__phase7_schema__.test.ts`: insert an `outreach_campaigns` row + two `outreach_emails` rows for the same `(campaignId, contactId)`, assert the second is rejected by the unique constraint; insert with `editedSubject: null` and read back. Recommended as `src/lib/db/__phase11_schema__.test.ts`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v1.2 milestone trail
- `.planning/REQUIREMENTS.md` §"REV-05" — the email-status state-machine requirement this phase delivers; §"CAMP-07" / "REV-06" / "DISC-03" / "DRFT-03" inform the table shape and transition edges
- `.planning/ROADMAP.md` §"Phase 11: Schema, Enums, and State Machine" — goal + 3 success criteria (tables + migration 0011 clean; `canEmailTransition()` pinned by Vitest; inferred types exported)
- `.planning/research/ARCHITECTURE.md` §"New Data Model", §"Email Status State Machine", §"Dependency-Ordered Build Sequence" Steps 1–2 — the proposed schema/state-machine design. **Note the two corrections locked here:** regenerate → `pending` (D-04) and `drafted` NOT terminal (D-05) override the contradictory/terminal variants in that doc.
- `.planning/research/PITFALLS.md` §"Pitfall 4" (status lifecycle gaps) — **considered and the rich enum was rejected** (D-01); §"Pitfall 1/2/3" are Phase 17 concerns, not Phase 11

### Patterns to mirror (read before writing)
- `src/lib/domain/pipeline.ts` — the exact module shape to mirror for `email-status.ts` (`canTransition`/`isTerminalState`/exported maps → `canEmailTransition`/`isEmailTerminalState`/`validEmailTransitions`+`terminalEmailStates`)
- `src/lib/domain/pipeline.test.ts` — the Vitest shape for the state-machine test (SC #2)
- `drizzle/schema/job-leads.ts` — column conventions: UUID PK `defaultRandom()`, `status` enum with `.default().notNull()`, `lastError`/`lastErrorAt` failure columns, `createdAt`/`updatedAt`/`archivedAt`, `unique(...)` + index helpers (`prospectBridges` shows the `pgTable(name, cols, (t) => [...])` index/unique style)
- `drizzle/schema/enums.ts` — `pgEnum` shape; new enums append here following `jobLeadStatusEnum`'s form
- `drizzle/schema/timeline-events.ts` — confirms `event_type` is `text` (free-text), so no new timeline enum is needed
- `src/lib/domain/types.ts` — where inferred types + `*Values as const` arrays live (mirror the `JobLead`/`NewJobLead`/`jobLeadStatusValues` block)
- `src/lib/db/__phase7_schema__.test.ts` — template for the schema-regression test (CD-05)
- `src/test-utils/pglite.ts`, `src/test-utils/call-route.ts` — Phase 2 harness for the schema/regression test

### Prior-phase lineage
- `.planning/phases/07-schema-api-for-company-scope-leads/07-CONTEXT.md` — the most recent schema-migration phase; D-05/D-06 there show the `db:generate --name=...` + PGlite schema-regression-test approach reused here
- `.planning/phases/06-performance/06-CONTEXT.md` §"D-02..D-03" — `db.batch()` atomicity note (neon-http has no interactive transactions) — relevant if any future multi-statement write appears (not needed in Phase 11 itself)

### Project anchors
- `CLAUDE.md` / `.planning/PROJECT.md` — TS strict, named exports, soft-delete via `archived_at`, REST-only (no server actions), Drizzle query builder, `updatedAt: new Date()` set manually on UPDATE
- `.planning/codebase/CONVENTIONS.md` — kebab-case files, `import type`, enum value arrays shared between Zod and UI

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/lib/domain/pipeline.ts`** — copy its structure verbatim for `src/features/outreach/lib/email-status.ts`. Same guard order: `if (terminalEmailStates.includes(from)) return false;` then map lookup with `?? false`.
- **`drizzle/schema/job-leads.ts`** — the closest table analog (status enum + failure columns + soft delete). `prospectBridges` in the same file demonstrates the `pgTable(name, cols, (t) => [unique(...).on(...), index(...).on(...)])` third-arg style for the unique constraint + indexes.
- **`src/lib/domain/types.ts`** — append the four inferred types + three `*Values` arrays in the existing pattern; add the two new tables to the top-level `import type { ... } from '../../../drizzle/schema'` block.
- **Phase 2 PGlite + `callRoute` harness** — no new test infra; the schema-regression test runs on it. The `canEmailTransition()` unit test is a pure function and needs no DB.

### Established Patterns
- **Enum-as-`pgEnum` + `*Values as const` mirror** — every enum is declared once in `enums.ts` and re-listed as a value array in `types.ts` for Zod/UI. Keep both in sync for all three new enums.
- **`updatedAt` set manually on UPDATE** — relevant to Phase 12 routes, not Phase 11 inserts, but the columns must default `defaultNow().notNull()`.
- **State machine gates PATCH transitions only; INSERTs are unrestricted** — new `outreach_emails` rows insert at `status='pending'` directly (no transition check), exactly like job-lead inserts at `queued` (Phase 7 D-03).

### Integration Points
- **Phase 12 API routes** consume `canEmailTransition()` (the `/status` route) and the enum value arrays (Zod schemas). The `/generation`, `/draft`, `/recipient` write-back routes write `generated*`, `gmailDraftId`+`draftedAt`, and `recipientEmail`+`channel` respectively.
- **Phase 15 review UI** keys the "needs LinkedIn" badge off `channel='linkedin_message'` and renders `editedSubject ?? generatedSubject`.
- **Phase 16/17 skills** drain `WHERE status='pending'` (generation) and `WHERE status='approved'` (drafting); the unique `(campaign_id, contact_id)` constraint backs Phase 12's `onConflictDoNothing()` bulk add.

</code_context>

<specifics>
## Specific Ideas

- **`outreach_email_status` enum** (D-01): `['pending', 'generated', 'edited', 'approved', 'drafted', 'failed']`
- **`outreach_channel` enum** (D-07): `['email', 'linkedin_message']` — default `'email'`
- **`outreach_campaign_status` enum** (D-10): `['draft', 'active', 'completed']` — default `'draft'`
- **`email-status.ts` transition map** (D-03/D-04/D-05/D-06):
  ```ts
  const validEmailTransitions: Record<string, string[]> = {
    pending:   ['generated', 'failed'],
    generated: ['edited', 'approved', 'failed', 'pending'],
    edited:    ['approved', 'pending'],
    approved:  ['drafted', 'edited'],
    drafted:   ['edited'],
    failed:    ['pending']
  };
  const terminalEmailStates: string[] = [];
  export function canEmailTransition(from: string, to: string): boolean {
    if (terminalEmailStates.includes(from)) return false;
    return validEmailTransitions[from]?.includes(to) ?? false;
  }
  export function isEmailTerminalState(status: string): boolean {
    return terminalEmailStates.includes(status);
  }
  export { validEmailTransitions, terminalEmailStates };
  ```
- **`outreach_emails` columns** (D-07/D-09 + CD-01/CD-02): `id`, `campaignId` (FK → outreach_campaigns), `contactId` (FK → contacts), `channel` (enum, default `'email'`, NOT NULL), `recipientEmail` (text, nullable), `generatedSubject`, `generatedBody`, `editedSubject`, `editedBody` (text, nullable), `status` (enum, default `'pending'`, NOT NULL), `gmailDraftId` (text, nullable), `lastError` (text), `lastErrorAt` (timestamp tz), `generatedAt`/`approvedAt`/`draftedAt` (timestamp, nullable), `createdAt`/`updatedAt` (NOT NULL), plus `UNIQUE (campaign_id, contact_id)` and indexes on `campaign_id`, `status`, `contact_id`.
- **`outreach_campaigns` columns**: `id`, `name` (text NOT NULL), `goalInstruction` (text NOT NULL), `status` (enum, default `'draft'`, NOT NULL), `createdAt`, `updatedAt`, `archivedAt` (nullable — soft delete).
- **State-machine test cases** (SC #2): assert valid moves accepted (`pending→generated→edited→approved→drafted`); assert rejected (`pending→drafted`, `approved→pending`, `pending→approved`); assert regenerate (`edited→pending`, `generated→pending`); assert `drafted→edited` accepted; assert unknown `from` returns `false`.

</specifics>

<deferred>
## Deferred Ideas

- **Richer email-status enum** (`generating`, `drafting`, `skipped`, `needs_linkedin_message`) from PITFALLS.md Pitfall 4 — rejected (D-01). Revisit only if a real workflow surfaces a need; `ALTER TYPE ... ADD VALUE` can extend the enum later if so.
- **`skipped` status** (decline-a-contact-without-delete) — considered during Area 1, not adopted. If the owner later wants to exclude a contact from a campaign without a `DELETE`, this is the cleanest add. Tracked, not built.
- **`canCampaignTransition()` campaign state machine** — explicitly declined (D-10). Campaign status is owner-set free-text-ish via the Phase 12 PATCH route.
- **DB-side enforcement that `editedSubject ?? generatedSubject` is non-null before `approved`** — not a schema constraint in Phase 11; the Phase 12 `/status` route (or Phase 15 UI) enforces "can't approve an empty email." Noted so the planner of Phase 12 considers it.
- **Google OAuth token table** (`google_oauth_tokens`) — ARCHITECTURE.md notes a possible future DB-backed token store; v1.2 uses the `~/.heimdall/google-token.json` file convention instead (Phase 17). Not a Phase 11 table.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 11-Schema, Enums, and State Machine*
*Context gathered: 2026-06-20*
