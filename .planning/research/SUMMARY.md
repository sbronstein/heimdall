# Research Summary --- Heimdall v1.2 Networking Outreach Campaigns

**Project:** Heimdall --- Job Search Command Center
**Domain:** Personal networking outreach email campaigns (AI-generated, draft-only, single-user CRM add-on)
**Researched:** 2026-06-20
**Confidence:** HIGH

---

## Executive Summary

Heimdall v1.2 adds a campaign-based outreach system on top of the existing CRM: the owner names a campaign, filters contacts by relationship signals (howMet, closeness, connection date), selects recipients with checkboxes, runs a Claude Code skill to generate personalized emails from CRM context, reviews and approves each email in the UI, then runs a second skill to push approved drafts to Gmail. Nothing ever sends automatically. The workflow is entirely additive --- two new database tables, a new API route tree, a new feature domain, and two new skills. No existing tables change, no npm packages are added, and the core Next.js + Drizzle + Clerk stack is untouched.

The most important architectural decision is already made by prior phases: AI generation must live in a Claude Code skill (never in a Vercel API route), and the skill communicates with Heimdall exclusively via REST. This same boundary that moved LinkedIn scraping to a skill is the correct boundary for email generation and Gmail drafting. The email generation skill reads pending outreach_emails rows, calls Claude, and writes generated subject + body back via PATCH --- the app never touches the Claude API directly. The drafting skill reads approved rows, discovers email addresses via Gmail MCP tools (already connected to this Claude Code session), and calls mcp__gmail__create_draft --- the only permitted Gmail action.

**Critical correction on Gmail integration:** The claude.ai Gmail MCP is already connected to this session, exposing mcp__gmail__create_draft, mcp__gmail__search_threads, and mcp__gmail__get_thread --- no new OAuth setup is required for Gmail drafting or Gmail-based email discovery. Google Contacts (People API) is NOT exposed by the claude.ai MCP and would need a separate OAuth setup; treat it as optional. The reliable primary path for email discovery is mcp__gmail__search_threads (searches prior thread participants). When no email is found by any method, the contact is flagged for a manual LinkedIn message --- never silently dropped. The never-auto-send invariant is structurally enforced by the fact that create_draft creates a Gmail draft, not a sent message.

---

## Key Findings

### Recommended Stack

The core stack is frozen. Zero new npm packages are required. All new functionality is built with existing dependencies: Drizzle for the two new tables, Zod for new API route validation, shadcn/ui + react-hook-form for the campaign builder and review UI, and the existing logTimeline() / REST envelope patterns throughout.

The only genuinely new tooling is the Gmail MCP, which is already active in this Claude Code session. The draft-outreach-emails skill declares mcp__gmail__create_draft, mcp__gmail__search_threads, and mcp__gmail__get_thread in its allowed-tools --- no claude mcp add step is needed for Gmail. If Google Contacts lookup is wanted later (to supplement Gmail thread search), that would require a separate People API MCP setup; that is a secondary optimization, not a prerequisite for v1.2.

**Core technologies for v1.2:**
- **drizzle-orm v0.45.1 + drizzle-kit v0.31.9** --- new outreach_campaigns and outreach_emails tables, three new pgEnums
- **zod v4** --- validation on all new API routes (same pattern as every existing route)
- **shadcn/ui + @tanstack/react-table v8 + react-hook-form v7** --- campaign builder (filter + checkbox multi-select), review panel (inline textarea edit + approve gate)
- **Gmail MCP (already connected)** --- create_draft for drafting, search_threads / get_thread for email discovery; no OAuth setup required
- **Claude Code skill pattern** --- generate-outreach-emails (no MCP, uses Bash + Read to call Heimdall REST); draft-outreach-emails (uses Gmail MCP tools + Bash + Read)
- **nuqs v2** --- URL-driven connection-year filter in triage page (same pattern as existing triage filters)

### Expected Features

**Must have (table stakes) --- all required for v1.2 milestone:**
- Named campaign creation (name + goalInstruction) with contact filter UI (howMet, connection date range, closeness, outreach status)
- Checkbox multi-select with select-all within filter; save selection creates outreach_campaigns + outreach_emails rows in one bulk INSERT
- Triage connection-date year filter (additive to existing triage, filters linkedinConnectionDate)
- Per-contact AI email generation (subject + body) via generate-outreach-emails skill; uses CRM context (howMet, closeness, interactions, role)
- Per-email inline editing in review UI; single-email regenerate (resets status to pending)
- Explicit approve gate --- only approved emails advance to drafting
- Email discovery via mcp__gmail__search_threads (primary path, already available); flag no-email contacts with channel = linkedin_message
- Gmail draft creation via mcp__gmail__create_draft for approved emails; store gmailDraftId; log timeline event; mark drafted
- Needs LinkedIn message badge in review UI for contacts with no email found
- Status state machine (pending -> generated -> edited -> approved -> drafted / failed) validated at API boundary

**Should have (differentiators):**
- Per-contact personalization from full CRM context: closeness-tier tone calibration (tiers 1-2 casual, tiers 7-8 brief intro), prior interactions as personalization signal
- Voice-consistent generation: reuses LLM-tell conventions from tailor-application-materials/references/cover-letter-style.md (no em-dashes, no leverage, no generic openers)
- Campaign-level progress summary (X of N approved, Y drafted) in the review page header
- Email discovery confidence flag: high (2+ signals), medium (name-only), low (Gmail display name extracted) --- surface in review UI before drafting

**Defer to v1.x or v2+:**
- Campaign analytics (reply rate, meeting-booked rate) --- useful after several campaigns have run
- Follow-up task auto-create on draft creation --- add if manual follow-up tracking becomes tedious
- Google People API email discovery (supplement to Gmail thread search) --- requires separate MCP/OAuth setup; add only if Gmail-search discovery rate is insufficient
- LinkedIn message composition assistance --- ToS and automation risk; manual LinkedIn message from the review UI badge is the intended path
- pgvector semantic search over interactions (VEC-01/02 backlog)

**Anti-features (never build):**
- Auto-send or any code path that calls messages.send or drafts.send --- only ever create_draft
- Email open/click tracking pixels --- destroys personal tone for VP-level outreach
- CAN-SPAM unsubscribe blocks --- this is personal correspondence, not marketing
- Bulk generate-all then auto-approve --- defeats the approve gate
- Email template library with merge fields --- AI generation from CRM data is strictly better

### Architecture Approach

This is a purely additive milestone. Two new Drizzle tables (outreach_campaigns, outreach_emails) and three new pgEnums land in one migration. A new API route tree at /api/outreach-campaigns/ follows the identical Zod -> Drizzle -> logTimeline() -> response envelope pattern used everywhere. A new feature domain at src/features/outreach/ contains the campaign builder, review panel, and email status state machine. The email status state machine at src/features/outreach/lib/email-status.ts is a direct copy of src/lib/domain/pipeline.ts with campaign-appropriate states. Two Claude Code skills follow the scrape-linkedin-connections read-queue -> act -> write-back-via-REST pattern exactly. The only new external integration is the Gmail MCP, which is already active.

**Major components:**
1. **Schema + enums** --- outreach_campaigns, outreach_emails, three pgEnums in drizzle/schema/enums.ts; unique constraint (campaignId, contactId) prevents duplicate recipients
2. **Email status state machine** --- canEmailTransition() at src/features/outreach/lib/email-status.ts; mirrors pipeline.ts; enforced by the /emails/[id]/status API route
3. **REST API** --- /api/outreach-campaigns/ (CRUD), /emails/ (bulk-add, list with contact JOIN), /emails/[id]/status (transitions), plus three skill write-back routes (/generation, /recipient, /draft)
4. **Campaign builder UI** --- use client; contact filter -> checkbox multi-select -> POST to create campaign + bulk-add contacts
5. **Review panel UI** --- use client; scrollable email cards with inline Textarea edit, approve/regenerate buttons, LinkedIn badge for no-email contacts
6. **generate-outreach-emails skill** --- reads ?status=pending queue; assembles contact brief (CRM data + recent interactions); generates with voice guardrails; writes back via PATCH .../generation
7. **draft-outreach-emails skill** --- reads ?status=approved queue; discovers emails via mcp__gmail__search_threads -> extracts participant address from thread; calls mcp__gmail__create_draft; writes gmailDraftId back via PATCH .../draft; logs timeline event per successful draft

**Dependency-ordered build sequence (from ARCHITECTURE.md):**
Schema -> State machine -> API routes -> Triage filter (parallel) -> Campaign builder UI -> Review UI -> Generation skill -> Drafting skill

### Critical Pitfalls

1. **Accidental email send** --- The drafting skill must only ever call mcp__gmail__create_draft. Never call messages.send, drafts.send, or any send-family method. Add a bold SAFETY: THIS SKILL NEVER SENDS EMAIL section to the skill spec. The MCP tool create_draft structurally enforces this --- it creates a Gmail draft, nothing more. Grep the skill code for the string send before any real campaign.

2. **Duplicate Gmail drafts on skill retry** --- create_draft is not idempotent. If the skill crashes after creating a draft but before writing gmailDraftId back to the DB, a retry creates a second draft. Prevention: before calling create_draft, check outreach_emails.gmailDraftId IS NOT NULL --- if set, call drafts.update instead. When re-drafting after owner edits a drafted email, use drafts.update (not a second create_draft) to replace the draft in-place.

3. **AI generation in an API route** --- Generating 50 emails at 5-15 seconds each will hit Vercel's 60-second function timeout. Generation must live entirely in the generate-outreach-emails skill, not in any API route. The route only creates outreach_emails rows with status = pending; the skill drains the queue at its own pace.

4. **LLM tells undermining voice authenticity** --- Without explicit guardrails, generated emails will contain em-dashes, leverage, robust, I hope this message finds you well, and not just X but Y constructions. The generation skill must reuse LLM-tell conventions from tailor-application-materials/references/cover-letter-style.md and include a tell-scan step before writing any email back to the API.

5. **Hallucinated shared history** --- When contact context is sparse (no logged interactions, howMet is just LinkedIn connection 2021), the LLM invents plausible-sounding but false specific memories. Prevention: instruct the model to reference only history that appears in the provided contact_context data, and add a context_richness warning flag in the review UI for contacts with fewer than 2 logged interactions.

6. **Archived contact drafted** --- A contact archived after campaign creation still appears in outreach_emails via a soft-delete FK. The drafting skill must JOIN contacts and filter WHERE contacts.archived_at IS NULL. The review UI must show an Archived badge blocking the approve button.

7. **N+1 inserts at campaign creation** --- Looping individual INSERTs for 100+ contacts is already noticeable at Heimdall's 1500-contact scale. Use a single db.insert(outreachEmails).values([...bulk rows]).onConflictDoNothing(). Timeline logging fires once per campaign creation, not per email row.

8. **Wrong-person email match** --- A name-only lookup for David Smith via Gmail thread search may return the wrong person. Require at least two matching signals (name + company domain, or name + email confirmed in a thread). Surface multi-match candidates in the review UI for manual selection.

---

## Implications for Roadmap

Based on combined research, suggested phase structure:

### Phase 1: Schema, Enums, and State Machine

**Rationale:** Everything else depends on the database schema and the status state machine. Postgres enum alterations mid-project require migrations and cannot be rolled back cleanly --- define the full lifecycle upfront. The state machine is a pure TypeScript module with no UI or API dependencies; it unblocks all API routes.

**Delivers:** outreach_campaigns table, outreach_emails table with indexes and unique constraint, three pgEnums, migration 0011, inferred types in src/lib/domain/types.ts, and src/features/outreach/lib/email-status.ts with canEmailTransition() and isEmailTerminalState().

**Addresses:** Status lifecycle gaps (define full enum before anything depends on it); bulk INSERT pattern established from day one.

**Avoids:** Pitfalls 4 (status lifecycle gaps), 6 (N+1 inserts).

**Research flag:** None --- standard Drizzle patterns. Skip research-phase.

### Phase 2: API Routes

**Rationale:** Skills and UI both depend on the REST surface. API routes must exist before either can be developed. The skill write-back routes (/generation, /recipient, /draft) are the seams that make the skill-driven workflow possible.

**Delivers:** Full /api/outreach-campaigns/ route tree --- campaign CRUD, bulk email add, email list with contact JOIN, inline edit, status transitions (validated by canEmailTransition()), three skill write-back routes. Additive filter params on GET /api/contacts. The generation-context bulk endpoint to prevent N+1 skill calls.

**Addresses:** Approve gate, campaign persistence, skill write-back surface; N+1 generation context (dedicated bulk endpoint); archived contact gate (enforced in list routes via JOIN filter).

**Avoids:** Pitfalls 6 (bulk INSERT), 7 (generation-context endpoint), 8 (AI generation boundary).

**Research flag:** None --- identical patterns to existing routes. Skip research-phase.

### Phase 3: Triage Connection-Date Filter

**Rationale:** Independent of the outreach route tree. Builds on the GET /api/contacts filter additions from Phase 2. Can build in parallel with Phase 2 once the contacts filter API change is confirmed.

**Delivers:** Year-range toggle buttons in the triage UI; connectionYearStart/End query params on the triage page RSC; filtered Drizzle query with gte/lte on linkedinConnectionDate.

**Addresses:** FEATURES --- triage connection-date filter (table stakes).

**Research flag:** None --- established nuqs + RSC searchParams pattern. Skip research-phase.

### Phase 4: Campaign Builder UI

**Rationale:** The owner must be able to create campaigns and select contacts before any email generation can be tested. This phase builds the full creation flow: filter -> multi-select -> name/goal form -> POST to create campaign -> POST to bulk-add contacts.

**Delivers:** /dashboard/outreach/ listing page, /dashboard/outreach/new/ builder page, CampaignList component, CampaignBuilder component with contact filter + checkbox multi-select + campaign form, sidebar nav entry for Outreach.

**Addresses:** Campaign creation, contact filter UI, checkbox multi-select, save selection as campaign.

**Research flag:** None --- standard shadcn/ui + tanstack/react-table row-selection pattern. Skip research-phase.

### Phase 5: Review and Approval UI

**Rationale:** Completes the web UI flow. After this phase, the owner can create a campaign, navigate to the review page (initially showing all contacts in pending status), and approve emails once the generation skill has run.

**Delivers:** /dashboard/outreach/[id]/ review page (RSC with campaign + emails JOIN contacts in one query), ReviewPanel component (scrollable email cards), EmailCard component (Textarea subject/body, approve/regenerate buttons, LinkedIn badge, archived badge, context-richness warning).

**Addresses:** Inline editing, single-email regenerate, approve gate, LinkedIn fallback badge, campaign progress summary.

**Research flag:** None --- standard shadcn/ui patterns. Skip research-phase.

### Phase 6: Email Generation Skill

**Rationale:** Independent of Gmail and can be developed and tested before the drafting skill. Validates AI generation quality, voice guardrails, and closeness-tier tone calibration with real contacts before any Gmail integration is involved.

**Delivers:** .claude/skills/generate-outreach-emails/SKILL.md; skill reads ?status=pending queue, fetches generation context from the bulk endpoint, assembles contact brief with closeness-tier tone instructions, generates subject + body with LLM-tell scan, writes back via PATCH .../generation; handles failures with status = failed.

**Addresses:** Per-contact AI generation, voice consistency, closeness-tier tone, prior interactions as signal; LLM tells, hallucinated history, wrong tone, prompt injection.

**Avoids:** Pitfalls 8 (AI entirely in skill), 12 (LLM tells), 13 (hallucination), 14 (closeness-tier tone calibration).

**Research flag:** None --- mirrors tailor-application-materials skill pattern. Skip research-phase.

### Phase 7: Gmail Drafting and Email Discovery Skill

**Rationale:** Highest-risk phase --- new MCP tool usage, email discovery logic, idempotency requirements. Built last so the rest of the system is fully validated before the highest-uncertainty piece is introduced. The Gmail MCP is already connected (no setup required), which substantially reduces the risk versus what STACK.md originally assumed.

**Delivers:** .claude/skills/draft-outreach-emails/SKILL.md; discovery sub-flow using mcp__gmail__search_threads to find participant emails (with RFC 2822 address extraction), confidence scoring, multi-match surfacing via PATCH .../recipient; drafting sub-flow using mcp__gmail__create_draft with idempotency check; writes gmailDraftId back via PATCH .../draft; logs timeline event per successful draft; handles 429 rate limits with exponential back-off.

**Addresses:** Gmail draft creation, email discovery, LinkedIn fallback; duplicate drafts (idempotency), accidental send (only create_draft), stale email addresses (age flag), wrong person match (2-signal requirement), Gmail rate limits (back-off).

**Avoids:** Pitfalls 1 (duplicate drafts), 2 (accidental send), 10 (re-draft uses update not create), 11 (rate limit back-off), 16 (2-signal confidence requirement).

**Research flag:** Needs phase-level review during planning. Specific areas: (a) exact mcp__gmail__search_threads response shape for participant email extraction; (b) whether thread summaries include full email addresses or require mcp__gmail__get_thread follow-up; (c) confidence-scoring heuristics validated against real contacts before committing to thresholds.

### Phase Ordering Rationale

- Schema first: Postgres enum changes are painful mid-project; locking the full lifecycle upfront is the primary lesson from PITFALLS Pitfall 4.
- API before UI and skills: Both consumers depend on the same REST surface; building it once cleanly prevents interface drift.
- Triage filter parallel to API: Independent change, additive to a single RSC page.
- Generation skill before drafting skill: Validates AI quality with no external risk; makes the review UI meaningful to test against.
- Drafting skill last: Highest external-integration risk; everything else is validated when the Gmail integration is introduced.

### Research Flags

**Phases needing deeper review during planning:**
- **Phase 7 (Gmail Drafting Skill):** mcp__gmail__search_threads response shape for participant email extraction needs verification against actual MCP tool output before writing the discovery sub-flow. Confirm whether thread summaries include full email addresses or only display names (requiring a get_thread follow-up call). Validate confidence-scoring heuristics with a sample of 10 real contacts before committing to the threshold.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Schema):** Direct extension of existing Drizzle schema and enum patterns.
- **Phase 2 (API):** Identical to existing route patterns --- Zod, Drizzle, logTimeline, envelope.
- **Phase 3 (Triage Filter):** Two-line Drizzle predicate change + nuqs toggle UI.
- **Phase 4 (Campaign Builder):** Standard tanstack/react-table row selection, existing filter API.
- **Phase 5 (Review UI):** Standard shadcn/ui Textarea + status badge patterns.
- **Phase 6 (Generation Skill):** Mirrors tailor-application-materials skill structure.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new npm packages confirmed. Gmail MCP already connected (verified by task context). Existing stack covers all new functionality. |
| Features | HIGH | Domain is unambiguous for a single-user personal tool. Feature list derived from existing CRM data model. Anti-features well-reasoned. |
| Architecture | HIGH | All patterns derived directly from existing codebase (Drizzle schema, pipeline.ts, scrape-linkedin-connections skill). No external pattern guessing. |
| Pitfalls | HIGH (Gmail/perf) / MEDIUM (AI quality) | Gmail API pitfalls from official docs, N+1 patterns from prior v1.0 phases. AI generation quality pitfalls inferred from tailor-application-materials precedent --- MEDIUM because real-contact testing may reveal edge cases. |

**Overall confidence: HIGH**

### Gaps to Address

- **mcp__gmail__search_threads response shape:** The exact JSON structure of participant email addresses in thread summaries is unverified. During Phase 7 planning, run mcp__gmail__search_threads against a real query and inspect the output before writing the discovery logic. If thread summaries do not include full email addresses, mcp__gmail__get_thread will be required as a follow-up per thread to extract From/To headers.

- **Google Contacts (People API) availability:** The claude.ai MCP does NOT expose Google People API. Gmail thread search is the reliable primary discovery path. If discovery rate proves insufficient for contacts with no shared email history, the People API MCP would need separate setup. Flag as a v1.x enhancement if Gmail search alone is insufficient.

- **contacts.email population rate:** The generation-context endpoint will reveal what percentage of the 1500+ contacts already have email populated from prior enrichment. If most contacts have emails, the discovery sub-flow is rarely invoked. If most lack emails, Gmail thread search becomes the critical path and should be load-tested early in Phase 7.

- **Closeness-tier tone calibration in practice:** The tone-to-tier mapping is specified but has not been validated against real generated output. During Phase 6 skill development, generate one email per tier bracket (1-2, 3-4, 5-6, 7-8) using real contacts and verify tone before the skill is used on a full campaign.

---

## Sources

### Primary (HIGH confidence)
- drizzle/schema/contacts.ts, drizzle/schema/enums.ts, drizzle/schema/job-leads.ts --- existing schema patterns
- src/lib/domain/pipeline.ts --- state machine pattern to mirror
- src/lib/db/timeline.ts --- logTimeline() signature and metadata conventions
- .claude/skills/scrape-linkedin-connections/SKILL.md --- skill architecture template
- .claude/skills/tailor-application-materials/SKILL.md + references/cover-letter-style.md --- voice and LLM-tell conventions
- .planning/PROJECT.md --- constraints and Key Decisions
- .planning/codebase/ARCHITECTURE.md --- component responsibility map
- https://developers.google.com/workspace/gmail/api/reference/mcp/tools_list/create_draft --- create_draft input/output schema
- https://developers.google.com/workspace/gmail/api/guides/drafts --- drafts.create vs. send distinction
- https://developers.google.com/workspace/gmail/api/reference/quota --- 6,000 quota units/min, 10 units per drafts.create
- https://developers.google.com/workspace/guides/configure-mcp-servers --- Gmail MCP URL and tool list

### Secondary (MEDIUM confidence)
- https://developers.google.com/people/api/rest/v1/people/searchContacts --- People API search behavior (for reference if People API MCP is added later)
- https://developers.google.com/people/api/rest/v1/otherContacts/search --- Other Contacts endpoint and scope
- https://nango.dev/blog/google-oauth-invalid-grant-token-has-been-expired-or-revoked/ --- OAuth token expiry conditions
- GitHub issue anthropics/claude-code#45775 --- create_draft reply-threading regression (plain new-draft creation unaffected)

### Tertiary (LOW confidence --- needs validation)
- mcp__gmail__search_threads response shape for participant email extraction --- not directly verified; needs live tool inspection during Phase 7 planning
- AI generation quality for sparse-context contacts --- inferred from tailor-application-materials patterns; needs real-contact testing

---
*Research completed: 2026-06-20*
*Ready for roadmap: yes*
