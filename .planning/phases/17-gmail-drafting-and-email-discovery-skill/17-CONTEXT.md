# Phase 17: Gmail Drafting and Email Discovery Skill - Context

**Gathered:** 2026-06-22
**Status:** Ready for planning

<domain>
## Phase Boundary

A new `draft-outreach-emails` Claude Code skill at `.claude/skills/draft-outreach-emails/` — the sibling to Phase 16's `generate-outreach-emails`. Running it against a campaign:
1. **Discovers** missing recipient addresses for the campaign's *approved* emails whose contact has no stored email, using the **already-connected Gmail MCP** (`mcp__gmail__search_threads` / `get_thread`).
2. **Drafts** every approved email that has (or now has) a recipient into Gmail as a **draft — never sends** (`create_draft` only).
3. **Writes back** the Gmail draft id, status, recipient/channel, and contact `outreachStatus` through the **existing Phase 12 REST surface**; logs a timeline event per write.
4. **Flags** contacts with no discoverable email as `channel='linkedin_message'` so the existing review-UI badge appears — never silently dropped.

Delivers **DISC-01, DISC-02, DISC-03, DRFT-01, DRFT-02, DRFT-03, DRFT-04, DRFT-05**.

**In scope:**
- The skill package: `SKILL.md` + `references/heimdall-api.md` (skill's API contract, mirroring the Phase 16 skill's reference).
- The discover-then-draft batch workflow, idempotency logic, run-summary, send-safety allowlist + grep checklist.
- **One small API edit** (the only code change outside `.claude/skills/`): make `PATCH /api/outreach-campaigns/[id]/emails/[emailId]/draft` also transition `status='drafted'` (gated by `canEmailTransition`) and set the contact's `outreachStatus='reached_out'` in the same write — see D-01.

**Out of scope (do NOT build here):**
- Any new schema/migration — the data model is locked (Phase 11). Explicitly **no** `candidates` column, no `lowContext` column (D-04 keeps ambiguous candidates ephemeral).
- Any review/approval UI work — Phase 15 already shipped the card + the `needsLinkedinMessage` badge. This skill produces drafts; it renders nothing. **No candidate-picker UI** (D-04).
- Email *generation* (subject/body authoring) — Phase 16. This skill drafts already-approved content as-is; it does not author or re-author copy.
- `--discover-only` / `--draft-only` split modes from the stale research sketch (D-05 — batch-only).
- OAuth / Google People API setup — superseded; the Gmail MCP is already connected (see canonical refs correction).
- Actually *sending* any email — hard invariant (D-06). The skill only ever creates/updates drafts.
</domain>

<decisions>
## Implementation Decisions

### Draft Write-Back & Status Mechanic

- **D-01:** **Fix the `/draft` write-back route to do all four success-#1 effects atomically.** The shipped route (`src/app/api/outreach-campaigns/[id]/emails/[emailId]/draft/route.ts`) currently sets only `gmailDraftId` + `draftedAt` + a timeline event. It must additionally, in the **same** request: (a) transition `status → 'drafted'` gated through `canEmailTransition(email.status, 'drafted')` (return 400 on an illegal transition), and (b) set the linked contact's `outreachStatus = 'reached_out'` (DRFT-04, DRFT-05). The skill makes **one** call per email (`PATCH .../draft` with `{ gmailDraftId }`). This is the **single code change outside the skill directory** — the direct parallel to Phase 16's D-02 fix. Preserve `updatedAt: new Date()` and the existing `outreach_email_drafted` timeline event; the contact update is part of the same handler (one logical write).
  - **Note:** the only legal pre-state for drafting is `approved` (state machine: `approved → drafted`). Re-drafting an *edited* email is handled by D-02, not by allowing `drafted → drafted`.

### Idempotency & Re-Draft (DRFT-03, success #4)

- **D-02:** **Update-or-recreate, research-gated.** The skill is idempotent across re-runs:
  - **Never-drafted approved email** (`status='approved'`, `gmailDraftId IS NULL`) → create a Gmail draft, write back via D-01's route.
  - **Already-drafted, unchanged** (`status='drafted'`, `gmailDraftId` set) → **skip** (no duplicate draft).
  - **Edited after drafting** → the state machine routes `drafted → edited → approved`, so the email returns as `status='approved'` **with a stale `gmailDraftId` still set**. This is the re-draft signal (`status='approved' AND gmailDraftId IS NOT NULL`). Behavior depends on a Gmail MCP capability the **researcher must confirm**: if the MCP exposes a draft-update tool → **update the existing draft in place**, keeping `gmailDraftId`; if it does **not** → **create a fresh draft and repoint `gmailDraftId`** to the new one (the old draft is left harmless in Gmail's drafts folder, never sent). Either path satisfies success #4's intent with zero send risk.

### Email Discovery (DISC-01, DISC-02)

- **D-03 (accept rule — stricter than the roadmap's two-pair OR):** **Accept a discovered address ONLY when the contact was a confirmed *direct* to/from thread participant with Steve** (matched by name against thread participants). **Domain/name-only inference is NOT used** (no "name + company-domain" weak pair). This minimizes false positives on a draft recipient.
  - Exactly **one** distinct address found for the contact → accept: write it back via `PATCH .../recipient` `{ channel:'email', recipientEmail }`, then it becomes eligible for drafting in the same run.
  - **Multiple** distinct addresses for the same contact → **ambiguous** (see D-04).
  - **No** direct-thread participation found → **not found** (see DISC-03 / D-04 LinkedIn fallback).
  - The researcher validates participant-email extraction against the real `search_threads` / `get_thread` response shape (per the ROADMAP research flag) but the **accept rule above is locked** — research informs extraction mechanics, not the threshold.

- **D-04 (ambiguous candidates — ephemeral, no schema/UI):** When discovery is ambiguous (≥2 plausible distinct addresses, no single direct-thread winner), the skill **does not guess**. It leaves the email **unsent and undrafted** with `recipientEmail` unset (do **not** force `linkedin_message` — an email likely exists), and **lists the contact + the candidate addresses in the end-of-run summary** for the owner to resolve manually (e.g. by a manual `PATCH .../recipient` then a re-run). **No `candidates` column, no candidate-picker UI** — mirrors Phase 16's D-08 ephemeral-flag approach. (This is a conscious, lighter reading of DISC-02's "surface in the review UI" — see Deferred Ideas for the durable-UI option.)

### LinkedIn Fallback (DISC-03)

- **D-04b:** **No email by any method → flag for LinkedIn, never drop.** When discovery finds no direct-thread address and the contact has no stored email, the skill writes `PATCH .../recipient` `{ channel:'linkedin_message' }` (the route forces `recipientEmail=null`). The existing `needsLinkedinMessage()` helper + "needs LinkedIn message" badge in `email-review-card.tsx` already render this state — **no UI work needed**. The contact is reported in the run summary, never silently skipped.

### Invocation, Run Gates & Send Safety

- **D-05 (invocation — batch-only):** **`draft-outreach-emails <campaign-id>`**, single batch, **discover-then-draft** in one run: (1) discover recipients for approved emails missing one, (2) create/refresh drafts for all approved emails that have a recipient. **No** `--discover-only` / `--draft-only` flags (rejected: the research sketch's split modes add surface area; the sibling Phase 16 skill established batch-only). One **upfront confirm gate**: report `N approved / M missing recipient` and wait for the owner before acting (guards against accidentally drafting a whole campaign).
- **D-06 (send-safety invariant — DRFT-02, success #5):** **Documented Gmail-tool allowlist + pre-run grep gate.** `SKILL.md` declares an explicit allowlist of the only Gmail MCP tools it may call — `create_draft`, `list_drafts`, `search_threads`, `get_thread` (plus a confirmed draft-update tool if D-02 research finds one). It **never** invokes any send/trash/import tool. A mandatory checklist step states: *before any real campaign run, grep the skill file for "send" and confirm zero send-family calls.* The MCP itself exposes no send tool, so this is defense-in-depth. **No** content preview/dry-run gate beyond D-05's count confirm (rejected: the upfront count confirm is sufficient; drafts are reviewable in Gmail before any human sends them).

### Claude's Discretion
- **Per-email failure handling:** mark-failed-and-continue, consistent with Phase 16's D-12 — on a per-email failure call `PATCH .../emails/[emailId]/status` `{ status:'failed', lastError:'<first ~200 chars>' }` and proceed; report failures in the run summary. (Note the state machine allows `→ failed` from `pending`/`generated`/`edited` but **not** from `approved` — planner/researcher should confirm the failure-marking path for an approved email that fails to draft; if `approved → failed` is not legal, leave the email `approved` and report the failure in the summary without a status change.)
- **End-of-run summary format/content:** counts (drafted / skipped-already-drafted / discovered / ambiguous / linkedin-fallback / failed) + the ambiguous-candidate list (D-04). Exact strings are the skill's choice.
- **Archived-contact edge case:** an approved email whose contact was archived after approval — skip drafting it and report in the summary (consistent with the Phase 15 `REV-06` archived guard); do not draft to an archived contact.
- **Discovery batching / pacing:** chunk size and any Gmail MCP rate pacing — skill's choice; each write-back must be durable before the next email is processed so an interruption just leaves the rest for a re-run.
- **Exact `search_threads` query construction** (name terms, date scoping) — researcher proposes, skill implements.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v1.2 milestone trail
- `.planning/REQUIREMENTS.md` §"DISC-01".."DISC-03" and §"DRFT-01".."DRFT-05" — the 8 requirements this phase delivers.
- `.planning/ROADMAP.md` §"Phase 17: Gmail Drafting and Email Discovery Skill" — goal + the 5 success criteria + the **research flag** (inspect `mcp__gmail__search_threads` response shape for participant-email extraction; validate confidence heuristics against real contacts). **Note the dependency line:** "Gmail MCP already connected — no OAuth setup required."

### Sibling skill to mirror (read before writing the skill)
- `.claude/skills/generate-outreach-emails/SKILL.md` + `references/heimdall-api.md` — the **structural template** for this skill: read queue via authenticated REST → act → write back via REST; `Authorization: Bearer $(cat ~/.heimdall/api-token)`; `http://localhost:4000` dev base; `{ success, data, error, meta }` envelope; batch confirm gate; mark-failed-and-continue. The new skill's `references/heimdall-api.md` reuses these conventions.
- `.planning/phases/16-email-generation-skill/16-CONTEXT.md` — the directly-analogous prior phase. Key carry-forwards: the **D-02 route-gap pattern** (a write-back route that sets content but not `status`) is mirrored here by **D-01** (the `/draft` route sets the draft id but not `status`/`outreachStatus`); the ephemeral-flag approach (D-08 there ≈ D-04 here, no schema change for transient run state).

### Phase 12 API surface this skill consumes (read before planning)
- `.planning/phases/12-api-routes/12-CONTEXT.md` — the full outreach REST surface and its decisions.
- `src/app/api/outreach-campaigns/[id]/emails/[emailId]/draft/route.ts` — the draft write-back route. **MUST be edited per D-01** to also transition `status='drafted'` (via `canEmailTransition`) and set the contact's `outreachStatus='reached_out'`.
- `src/app/api/outreach-campaigns/[id]/emails/[emailId]/recipient/route.ts` — discovery write-back. Already sets `channel` + `recipientEmail`, and forces `recipientEmail=null` when `channel='linkedin_message'`. The skill calls this for discovered addresses (D-03) and the LinkedIn fallback (D-04b). No edit needed.
- `src/app/api/outreach-campaigns/[id]/emails/[emailId]/status/route.ts` — the `/status` route; the skill calls it to mark `failed` (discretion) and it is the **closest analog** for D-01's transition logic (validate via `canEmailTransition`, 400 on invalid, manual `updatedAt`, timeline event).
- `src/app/api/outreach-campaigns/[id]/emails/route.ts` — list emails (the skill reads the campaign's `approved` emails + their contacts to build its work queue). Planner: confirm whether this (or another existing endpoint) returns recipient/contact-email/contact-id fields the skill needs; **do not add a new endpoint** without flagging it as scope.
- `src/features/outreach/lib/email-status.ts` — `canEmailTransition()` / `validEmailTransitions`. Note `approved → drafted`, `drafted → edited`. The D-01 edit calls this; do NOT reimplement.

### Schema & review-UI anchors
- `drizzle/schema/outreach-emails.ts` — exact columns the skill reads/writes: `gmailDraftId`, `recipientEmail`, `channel`, `status`, `draftedAt`, `lastError`/`lastErrorAt`. Confirms **no** `candidates` column (D-04).
- `drizzle/schema/contacts.ts` — `email`, `outreachStatus` (default `not_reached_out`). D-01 sets `outreachStatus='reached_out'`.
- `drizzle/schema/enums.ts` — `outreachChannelEnum` (`email` | `linkedin_message`), `outreachEmailStatusEnum` (`pending`|`generated`|`edited`|`approved`|`drafted`|`failed`).
- `src/features/outreach/lib/review-helpers.ts` — `needsLinkedinMessage()` already drives the badge for the D-04b fallback. No change needed; the skill just sets the channel.
- `src/features/outreach/components/email-review-card.tsx` §"needs LinkedIn message" badge — confirms the LinkedIn-flag UI already exists.

### Stale doc — read WITH the corrections below
- `.planning/research/ARCHITECTURE.md` §"Skill 2: draft-outreach-emails" / §"Step 8" — the original skill sketch. **CORRECTIONS (the roadmap has since evolved):**
  1. Discovery uses the **already-connected Gmail MCP** (`search_threads`/`get_thread`), **NOT** the Google People API + raw Gmail REST + OAuth `gmail.readonly` setup the doc describes. No OAuth setup is in scope.
  2. Invocation is **batch-only** (D-05) — ignore the doc's `--discover-only`/`--draft-only` modes.
  3. The doc's `/draft` flow does not mention the status/contact write-back — that is the **D-01 gap** to fix.

### Project anchors
- `CLAUDE.md` / `.planning/PROJECT.md` — REST-only (no server actions), Zod on every route, `{ success, data, error, meta }` envelope, Drizzle query builder, `updatedAt: new Date()` set manually on UPDATE, every write logs a timeline event, soft-delete via `archivedAt`.
- `.planning/codebase/CONVENTIONS.md` — kebab-case files, async route handlers named after HTTP verb, enum value arrays shared between Zod and UI.
- `.planning/codebase/INTEGRATIONS.md` — note re: interactively-authenticated MCP servers (e.g. `claude_ai_Gmail`) may be absent in headless/cron runs; this skill is owner-run interactively, so the Gmail MCP is available.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`generate-outreach-emails` skill** — the structural template (SKILL.md shape, `references/heimdall-api.md`, bearer-token auth, queue→act→write-back loop, confirm gate, mark-failed-and-continue).
- **`/draft` + `/recipient` + `/status` routes** — already exist (Phase 12 12-03). Only `/draft` needs the D-01 edit; `/recipient` and `/status` are used as-is.
- **`needsLinkedinMessage()` + the badge** — the DISC-03 / D-04b LinkedIn-flag UI is already shipped; the skill only sets `channel='linkedin_message'`.
- **`canEmailTransition()`** — reused by the D-01 route edit; do not reimplement.
- **Gmail MCP** (`claude_ai_Gmail`) — exposes `create_draft`, `search_threads`, `get_thread`, `list_drafts` (+ label tools). **No send tool exists** (supports D-06). **No draft-update/delete tool is visible** in the connected set — the D-02 in-place-update path is research-gated.

### Established Patterns
- **A write-back route that sets one field but not the dependent status** is a known gap shape here — Phase 16 D-02 (`/generation` set content not status); Phase 17 D-01 (`/draft` sets draft id not status/outreachStatus). Fix in the route, one atomic write, one timeline event.
- **`updatedAt: new Date()` set manually on every UPDATE** — the D-01 edit must preserve this (already does for the email; add it for the contact update).
- **Bearer-token auth covers all `/api/*`** (`src/proxy.ts`) — no middleware change; the skill authenticates with `~/.heimdall/api-token`.
- **Ephemeral run-state over schema changes** — transient flags (low-context in P16, ambiguous-candidates here) live in the skill's run summary, not new columns.

### Integration Points
- **Reads:** the campaign's `approved` emails + their contacts (recipient/email/contact-id) — planner confirms the exact existing endpoint; the Gmail MCP for discovery.
- **Writes:** `PATCH .../emails/[emailId]/draft` (gmailDraftId → + D-01 status/outreachStatus); `PATCH .../emails/[emailId]/recipient` (discovered address or `linkedin_message`); `PATCH .../emails/[emailId]/status` (`failed` on per-email failure).
- **Gmail MCP:** `search_threads` + `get_thread` (discovery, read-only); `create_draft` (+ confirmed update tool) for drafting.
- **Upstream gate (Phase 15):** the skill only acts on `approved` emails — the human approve gate is the prerequisite; drafted/linkedin states render in the same review UI.

</code_context>

<specifics>
## Specific Ideas

- **The D-01 route gap:** `PATCH .../draft` currently sets `gmailDraftId`+`draftedAt` only — make it also transition `status='drafted'` (gated) and set the contact's `outreachStatus='reached_out'`, so success criterion #1 ("draft id stored, email drafted, contact reached_out, timeline logged") fully holds from one skill call.
- **Stricter discovery (D-03):** accept an address only if the contact was a *direct* to/from participant in a real thread with Steve — no domain-name guessing. Owner explicitly chose this over the roadmap's looser "name + company domain" pair.
- **Ambiguity = transparency, not a guess (D-04):** when two+ addresses are plausible, leave the recipient unset and list the candidates in the run summary for manual resolution — never auto-pick a draft recipient.
- **Send-safety (D-06):** allowlist the Gmail tools in SKILL.md + a "grep for send before any real run" checklist; the MCP has no send tool, so this is belt-and-suspenders. No content preview gate beyond the upfront count confirm.

</specifics>

<deferred>
## Deferred Ideas

- **Durable candidate-picker UI** — a `candidates` JSONB column on `outreach_emails` + a dropdown in `email-review-card.tsx` so the owner picks among ambiguous discovered addresses in the browser (the literal reading of DISC-02). Deferred (D-04): pulls a Phase 11 schema change + Phase 15 UI work into this phase; the ephemeral run-summary list is sufficient for v1.2. Revisit if manual resolution via the summary proves annoying.
- **`--discover-only` / `--draft-only` split modes** — the research sketch's separate-run flags. Dropped (D-05) for batch-only consistency with Phase 16. Revisit only if the owner wants to review discovery results before any drafting in a separate pass.
- **Content preview / sample gate before creating real drafts** — like Phase 16's D-04 sample-review. Considered and dropped (D-06): drafts are reviewable in Gmail before any human sends them, and the content was already human-approved in Phase 15. Revisit if drafting volume makes a pre-flight preview valuable.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 17-Gmail Drafting and Email Discovery Skill*
*Context gathered: 2026-06-22*
