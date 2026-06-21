# Phase 12: API Routes - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

The full `/api/outreach-campaigns/` REST surface for v1.2 Networking Outreach Campaigns, landed **before any UI (Phases 14–15) or skill (Phases 16–17) consumes it**, plus the additive `GET /api/contacts` filter params the campaign builder will use. Every route returns the standard `{ success, data, error, meta }` envelope, validates with Zod, logs to `timeline_events`, and is already covered by the existing auth (no `proxy.ts` change).

**In scope:**
- **Campaign CRUD** — `GET` (list, cursor-paginated) / `POST` (create `{ name, goalInstruction }`) `/api/outreach-campaigns`; `GET` (single + per-status email counts) / `PATCH` (`{ name?, goalInstruction?, status? }`) / `DELETE` (soft delete via `archivedAt`) `/api/outreach-campaigns/[id]`
- **Email management** — `GET` (list emails w/ contact join, `?status=` filter) / `POST` (bulk add `{ contactIds: string[] }`, deduped via `onConflictDoNothing`) `/api/outreach-campaigns/[id]/emails`; `PATCH` (inline edit) / `DELETE` (hard delete) `/api/outreach-campaigns/[id]/emails/[emailId]`
- **Explicit status transition** — `PATCH /api/outreach-campaigns/[id]/emails/[emailId]/status`, validated by `canEmailTransition()` (400 with rejection reason on invalid move)
- **Skill write-back routes** — `PATCH .../generation` (gen skill → `generated`), `PATCH .../recipient` (discovery skill → `recipientEmail`/`channel`), `PATCH .../draft` (draft skill → `drafted` + `gmailDraftId`)
- **Generation-context bulk fetch** — `GET /api/outreach-campaigns/[id]/generation-context` (D-01): one round-trip returning `goalInstruction` + every pending email with its embedded contact brief + recent interactions + `lowContext` flag
- **`GET /api/contacts` filter additions** (D-10): `howMet` (ilike), `connectionYearStart` / `connectionYearEnd` (gte/lte on `linkedinConnectionDate`)

**Out of scope (later phases — do NOT build here):**
- Any generation/personalization logic — runs in the Phase 16 skill only (GEN-05). The API only enqueues `pending` rows and accepts write-back.
- Any Gmail/draft creation, email discovery, OAuth — Phase 17 skill.
- All UI: `src/features/outreach/components/*`, `src/app/dashboard/outreach/*`, sidebar nav — Phases 14–15.
- The triage connection-date filter (RSC `searchParams`, no API route) — Phase 13.
- Any schema migration — the full data model + state machine shipped in Phase 11 (migration 0011/0013). Phase 12 writes only.
- A campaign-status state machine — campaign `status` is set freely by `PATCH .../[id]` (Phase 11 D-10); only **email** status is guarded.

</domain>

<decisions>
## Implementation Decisions

### Generation-Context Endpoint (Area 1)

- **D-01:** **One bulk embedded endpoint** — `GET /api/outreach-campaigns/[id]/generation-context` returns the campaign `goalInstruction` plus an array of every `status='pending'` email, each with its contact brief and recent interactions **already joined in**. The Phase 16 skill makes one request and loops. This **overrides** the ARCHITECTURE.md skill design (lines 287–288), which did per-email `GET /api/contacts/[id]` + `GET /api/interactions` — that is an N+1 pattern the project explicitly flags as already-noticeable at 1500+ contacts.
- **D-02:** **Payload per pending email = full brief + recent interactions.** Contact fields: name, `howMet`, `companyAtConnection`, `roleAtConnection`, current company/title, closeness tier, `recipientEmail`; plus the **~3 most recent interactions** (type + summary); plus a precomputed **`lowContext` flag** (true when fewer than 2 logged interactions) so the skill can mark low-context contacts per GEN-02 without a second query. Reference only these facts (GEN-02 anti-hallucination contract) — no broader contact dump.

### Timeline-Event Granularity (Area 2)

- **D-03:** **Every outreach write logs a `timeline_events` row** — honoring CLAUDE.md verbatim (the timeline is the system of record). This includes campaign create/update/archive, bulk-add, inline edits, every `/status` transition, and the three write-backs. The owner's concern (200 events/campaign run flooding the dashboard) is a **render-layer** problem, not a logging one: events are recoverable only if logged, and feed readability is solved at display time.
- **D-04:** **Distinct `event_type` per kind** so the dashboard can filter/group later — e.g. `outreach_campaign_created`, `outreach_campaign_updated`, `outreach_emails_added`, `outreach_email_edited`, `outreach_email_status_changed`, `outreach_email_generated`, `outreach_email_recipient_set`, `outreach_email_drafted` (planner finalizes exact strings; `event_type` is free-text `text`, no enum/migration needed — Phase 11 confirmed). Bulk-add is **one** event carrying the inserted count (`outreach_emails_added`, "Added N contacts to <campaign>"), not one-per-contact; write-backs are naturally per-email.

### Regenerate Reset Semantics (Area 3)

- **D-05:** **`PATCH .../status` to `pending` clears `editedSubject`/`editedBody` + `lastError`/`lastErrorAt`, but KEEPS `generatedSubject`/`generatedBody` stale** until the Phase 16 skill overwrites them on its next `WHERE status='pending'` drain. Clearing `edited*` is mandatory — otherwise the `editedX ?? generatedX` coalesce would keep serving the old edit and mask the regenerated content. Keeping `generated*` lets the Phase 15 review UI show the **previous draft greyed-out / "regenerating"** while the new one is queued (the owner's chosen UX).
- **D-06 (consumer caveat — MUST propagate to Phases 15/16):** Because a `pending` row can now carry stale `generated*`, **`status='pending'` no longer implies "no content."** Any consumer deciding "has content" must check the content fields, not the status alone. The generation skill still drains purely on `status='pending'` (correct — it's meant to rewrite). Resetting also nulls `generatedAt` (the new gen sets it fresh).

### Contacts-Filter Scope (Area 4)

- **D-07:** **Land the `GET /api/contacts` filter additions in Phase 12**, not Phase 14. Phase 12 is the single "all API surface" phase, leaving Phase 14 as pure UI. Params: `howMet` → `ilike(contacts.howMet, '%value%')`; `connectionYearStart` → `gte(contacts.linkedinConnectionDate, new Date('YYYY-01-01'))`; `connectionYearEnd` → `lte(contacts.linkedinConnectionDate, new Date('YYYY-12-31T23:59:59'))`. Slots into the route's existing `conditions[]` + `sql.join` pattern alongside `closeness`/`outreachStatus`/`warmth`/`relationship`/`search`. Matches Phase 11's assignment (11-CONTEXT out-of-scope §).

### Claude's Discretion (planner decides; recommendation given)

- **CD-01:** **Campaign-list + single-campaign counts via a single GROUP BY query**, not N+1 per campaign. `GET /api/outreach-campaigns` needs per-campaign counts (selected/generated/approved/drafted — CAMP-08); `GET .../[id]` needs the same `emailCounts`. Use one grouped aggregate over `outreach_emails` (e.g. `count(*) FILTER (WHERE status=...)` or group-by-status then fold) joined to the campaigns page — honoring the project anti-N+1 constraint. Recommended.
- **CD-02:** **Inline-edit `PATCH .../emails/[emailId]` auto-transitions `generated → edited`** when an edit is saved (writes `editedSubject`/`editedBody`/`recipientEmail`). Per ARCHITECTURE.md line 188 + Phase 11 D-09. If status is already `edited` it stays `edited`; from other statuses, planner decides whether edit is even allowed (recommend: allow edit only from `generated`/`edited`/`approved`). Recommended.
- **CD-03:** **`/status` rejects `→ approved` when `editedSubject ?? generatedSubject` (or body) is null** — "can't approve an empty email" (Phase 11 deferred §). Returns `400 validationError`. This is an app-layer guard on top of `canEmailTransition()`, not a schema constraint. Recommended.
- **CD-04:** **Email `DELETE` is a hard delete** — `outreach_emails` has no `archivedAt` column (Phase 11 schema), and a removed contact is just an un-generated queue row. The `UNIQUE (campaign_id, contact_id)` constraint means a delete-then-re-add works cleanly. (Campaign `DELETE` stays a **soft** delete — `outreach_campaigns` has `archivedAt`.) Recommended.
- **CD-05:** **Bulk-add response = `{ inserted: N, skipped: M }`** (or `{ inserted, rows }` per ARCHITECTURE.md line 187) so the caller knows how many were deduped. `onConflictDoNothing()` on the unique constraint backs the dedup (CAMP-07). Planner picks the exact shape; expose the inserted count at minimum.
- **CD-06:** **Write-back routes verify the email belongs to the campaign** (`WHERE id = emailId AND campaign_id = id`) before writing, returning 404 otherwise — ARCHITECTURE.md line 207. The `/recipient` route sets `recipientEmail = null` when `channel='linkedin_message'` (Phase 11 D-08 discovery-state model). Recommended.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v1.2 milestone trail
- `.planning/REQUIREMENTS.md` §"CAMP-06" / "CAMP-07" / "CAMP-08" / "GEN-05" — the four requirements this phase delivers (create campaign w/ goal; bulk dedup insert; campaign list w/ progress counts; generation lives in the skill, API only enqueues + accepts write-back)
- `.planning/ROADMAP.md` §"Phase 12: API Routes" — goal + 5 success criteria (CLI create/add/list/transition; envelope + auth on all routes)
- `.planning/research/ARCHITECTURE.md` §"REST API Surface" (lines 166–224) — the full proposed route table for the outreach tree + the `GET /api/contacts` filter additions. **Note the corrections locked here:** the per-email N+1 generation flow (lines 287–288) is replaced by the bulk `generation-context` endpoint (D-01); the regenerate edge resets to `pending` keeping `generated*` (D-05), not the doc's `edited → generated`.
- `.planning/research/PITFALLS.md` — Pitfalls 1/2/3 are Phase 17 (drafting) concerns; Pitfall 4 (status lifecycle) was resolved in Phase 11. Skim for any route-layer gotchas only.

### Phase 11 locks this phase consumes (read before planning)
- `.planning/phases/11-schema-enums-and-state-machine/11-CONTEXT.md` — the locked data model + state machine. Key carry-forwards: D-03/D-04 transition map (`canEmailTransition`), D-07/D-08 channel + discovery-state model, **D-09 edited/generated coalesce + the regenerate-reset question this phase answers (D-05 above)**, D-10 campaign status has NO state machine.
- `src/features/outreach/lib/email-status.ts` — `canEmailTransition(from, to)` / `isEmailTerminalState()` / `validEmailTransitions` — the `/status` route imports and calls this; do NOT reimplement the graph.
- `drizzle/schema/outreach-emails.ts` / `drizzle/schema/outreach-campaigns.ts` — exact columns the routes read/write (note: emails have NO `archivedAt` → CD-04; campaigns DO).
- `src/lib/domain/types.ts` — `OutreachCampaign`/`OutreachEmail`/`New*` inferred types + `outreachEmailStatusValues`/`outreachChannelValues`/`outreachCampaignStatusValues` for Zod enums.

### Patterns to mirror (read before writing routes)
- `src/app/api/job-leads/[id]/status/route.ts` — the closest analog for `PATCH .../emails/[emailId]/status`: validate transition via the domain state machine, 400 on invalid, set `updatedAt`, log timeline. Mirror its shape.
- `src/app/api/job-leads/route.ts` — list + create envelope/pagination patterns; bulk insert + `onConflictDoNothing` precedent for CAMP-07.
- `src/app/api/contacts/route.ts` — the `conditions[]` + `sql.join` filter-accumulation pattern to extend for D-07 (`howMet`, `connectionYearStart/End`).
- `src/app/api/contacts/[id]/route.ts`, `src/app/api/contacts/[id]/interactions/route.ts` — shape of the contact + interactions data the `generation-context` endpoint must assemble (D-02).
- `src/lib/api/types.ts` (`success`/`created`/`paginated`), `src/lib/api/errors.ts` (`notFound`/`validationError`/`serverError`), `src/lib/api/filters.ts` (`parseCursor`/`parseLimit`) — envelope + error + pagination helpers every route uses.
- `src/lib/db/timeline.ts` — `logTimeline({ eventType, title, ...entityIds })` called after every write (D-03/D-04).
- `src/proxy.ts` — confirms the Bearer-token bypass (`API_TOKEN_HASH` + `SINGLE_USER_EMAIL`) already covers new `/api/*` routes for the skills; **no middleware change needed** in Phase 12.

### Skill auth contract (for the write-back routes)
- `.claude/skills/scrape-linkedin-connections/references/heimdall-api.md` — the `Authorization: Bearer $TOKEN` (`~/.heimdall/api-token`) convention the Phase 16/17 skills reuse against the write-back routes; routes need no special handling beyond what middleware already enforces.

### Project anchors
- `CLAUDE.md` / `.planning/PROJECT.md` — REST-only (no server actions), Zod on every route, `{ success, data, error, meta }` envelope, Drizzle query builder (no raw SQL except pgvector), `updatedAt: new Date()` set manually on UPDATE, soft delete via `archivedAt`, every write logs a timeline event.
- `.planning/codebase/CONVENTIONS.md` — kebab-case files, async route handlers named after HTTP verb, `import type`, enum value arrays shared between Zod and UI.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/features/outreach/lib/email-status.ts`** — import `canEmailTransition` directly in the `/status` route; never reimplement the transition graph.
- **`src/lib/api/{types,errors,filters}.ts`** — all envelope/error/pagination factories already exist; new routes compose them exactly like existing routes.
- **`src/app/api/job-leads/[id]/status/route.ts`** — copy its structure for the email `/status` route (state-machine-guarded PATCH).
- **`src/app/api/contacts/route.ts`** — the `conditions[]` accumulation + `sql.join` filter pattern to extend for D-07; already handles `closeness`/`outreachStatus`/`warmth`/`relationship`/`search`.
- **`src/lib/db/timeline.ts`** — `logTimeline()` for D-03/D-04.

### Established Patterns
- **State machine gates transitions only; INSERTs are unrestricted** — bulk-add inserts new `outreach_emails` rows directly at `status='pending'` (no transition check), exactly like job-lead inserts at `queued`. The `/status` route is the only transition-guarded write.
- **`updatedAt: new Date()` set manually on every UPDATE** — Drizzle does not auto-update; every PATCH route (status, edit, write-backs) must set it.
- **Cursor pagination on `updatedAt`** — `GET .../emails` and `GET /api/outreach-campaigns` use `parseCursor`/`parseLimit` like existing list routes.
- **Bearer-token auth already wired** — no `proxy.ts` change; the skill write-back routes are protected by the existing `/api/(.*)` matcher + token bypass.

### Integration Points
- **Phase 16 generation skill** consumes `GET .../generation-context` (D-01/D-02), writes back via `PATCH .../generation`, and marks failures via `PATCH .../status { status:'failed' }`.
- **Phase 17 drafting skill** consumes `GET .../emails?status=approved`, writes via `PATCH .../recipient` and `PATCH .../draft`.
- **Phase 14 builder UI** consumes `POST /api/outreach-campaigns`, `POST .../emails` (bulk add), and the extended `GET /api/contacts` filters (D-07).
- **Phase 15 review UI** consumes `GET .../emails`, `PATCH .../emails/[emailId]` (edit), `PATCH .../status` (approve/regenerate), and relies on D-05/D-06 (stale `generated*` on regenerate) for its "regenerating" UX.

</code_context>

<specifics>
## Specific Ideas

- **Generation-context payload (D-02)** — per pending email: `{ emailId, contactId, contact: { firstName, lastName, howMet, companyAtConnection, roleAtConnection, currentCompany, title, closeness, recipientEmail }, interactions: [{ type, summary, occurredAt } × ~3], lowContext: boolean }`, wrapped with the campaign `goalInstruction` at the top level. Planner finalizes exact field names against the live `contacts`/`interactions` schema.
- **Regenerate reset (D-05)** — `/status → pending`: `SET edited_subject=NULL, edited_body=NULL, last_error=NULL, last_error_at=NULL, generated_at=NULL` and **leave** `generated_subject`/`generated_body` untouched; set `updated_at=now()`.
- **`/recipient` route (CD-06)** — `{ recipientEmail?, channel }`; when `channel='linkedin_message'`, also `SET recipient_email=NULL`.
- **Timeline event types (D-04)** — distinct strings per mutation kind; bulk-add is one aggregate event with the inserted count.
- **Contacts filter predicates (D-07)** — `howMet` ilike; `connectionYearStart`/`End` → gte/lte on `linkedinConnectionDate` using `new Date('YYYY-01-01')` / `new Date('YYYY-12-31T23:59:59')`.

</specifics>

<deferred>
## Deferred Ideas

- **Render-layer feed filtering/grouping for outreach events** — D-03 logs everything; making the dashboard timeline filter/collapse the high-volume `outreach_email_status_changed` events is a UI concern for a later dashboard pass, not Phase 12.
- **`?ids=` batch param on `GET /api/contacts`** — considered as the "bulk ids + one batch contacts call" alternative to D-01; not adopted (the dedicated `generation-context` endpoint won). Revisit only if another consumer needs arbitrary multi-contact fetch.
- **`skipped` email status** (decline-a-contact-without-delete) — carried from Phase 11 deferred; Phase 12 uses hard `DELETE` (CD-04) instead. Revisit if the owner wants to exclude a contact while keeping the row.
- **DB-side non-null-before-approved constraint** — CD-03 enforces "can't approve empty" at the app layer; a CHECK constraint was considered and left out (app-layer is sufficient and more flexible).

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 12-API Routes*
*Context gathered: 2026-06-20*
