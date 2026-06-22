# Phase 16: Email Generation Skill - Context

**Gathered:** 2026-06-22
**Status:** Ready for planning

<domain>
## Phase Boundary

A new `generate-outreach-emails` Claude Code skill at `.claude/skills/generate-outreach-emails/`. Running it against a campaign drains that campaign's `pending` outreach emails, authors a personalized subject + body for each in Steve's voice (conversational, calibrated lightly by closeness, anti-hallucination, LLM-tell-clean), and writes results back through the **existing** Phase 12 REST surface. The skill is the **only** place generation happens (GEN-05); the API only enqueues `pending` rows and accepts write-back.

Delivers **GEN-01, GEN-02, GEN-03, GEN-04** (GEN-05 already shipped in Phase 12).

**In scope:**
- The skill package: `SKILL.md`, `references/heimdall-api.md` (skill's API contract), and a new `references/voice-guide.md`.
- Skill workflow: read the campaign's pending queue + per-contact context via the bulk `generation-context` endpoint, author emails inline (chunked), self-check for LLM tells, write back via `PATCH .../generation`, mark per-email failures via `PATCH .../status`.
- **One small API edit** (the only code change outside `.claude/skills/`): make `PATCH /api/outreach-campaigns/[id]/emails/[emailId]/generation` also transition `status` to `generated` (gated by `canEmailTransition`) in the same UPDATE — see D-02.

**Out of scope (do NOT build here):**
- Any Gmail draft creation, email discovery, OAuth — Phase 17 (`draft-outreach-emails`).
- The review/approval UI — Phase 15 (already shipped). The skill produces `generated` content the UI reviews; it does not render anything.
- New schema/migrations — the data model is locked (Phase 11). Explicitly **no** `lowContext`/`needsReview` column is added (D-08).
- A per-email single-regenerate skill mode — batch-only (D-13). Regenerate is the review UI resetting a row to `pending` + a skill re-run.
- Any campaign builder, contact filters, status state machine, or other route work (Phases 11–14).
</domain>

<decisions>
## Implementation Decisions

### Generation Engine & Status Mechanic

- **D-01:** **Inline authoring, chunked.** The Claude agent running the skill writes every email directly in-context (same craft as `tailor-application-materials`), processing in bounded batches — fetch context, author N at a time, write each back, repeat — so a large campaign (50–200 contacts) drains across several focused passes without exhausting one context window. **Not** per-email Claude API sub-calls (rejected: loses the running agent's voice/judgment, needs an API key + model pin). Each write-back is durable the moment it lands, so an interruption just leaves the rest `pending` for a re-run.
- **D-02:** **Fix the `/generation` write-back route to set `status='generated'`.** The shipped route (`src/app/api/outreach-campaigns/[id]/emails/[emailId]/generation/route.ts`) writes `generatedSubject/generatedBody/generatedAt/updatedAt` but **does not change `status`** — so emails would stay `pending` after generation, contradicting success criterion #1. The route must additionally set `status='generated'`, gated through `canEmailTransition(email.status, 'generated')`, in the same UPDATE (one call, one timeline event). This is the single code change outside the skill directory. The skill makes **one** call per email (`PATCH .../generation`), not a content-then-status pair.
- **D-03:** **Confirm count before draining.** On invocation the skill reports `N pending emails found` and waits for the owner to proceed — guards against accidentally generating a whole campaign.
- **D-04:** **Sample-review gate (5 emails) before the full drain.** After the count confirm, the skill generates a **sample of 5** spanning the spread of relationship types (a friend, a former colleague, and distant contacts), shows them to the owner, and waits for a thumbs-up (or tone tweaks) before authoring the rest. This is how the owner "sees it in action" and calibrates tone without committing 150 emails to an unreviewed voice. Pairs with D-03 as one upfront gate.

### Voice & Email Anatomy

- **D-05:** **New `references/voice-guide.md`, specific to 1:1 networking emails.** Do not reuse `cover-letter-style.md` verbatim — it is cover-letter-shaped (`Hey <Company> folks!`, the 3-paragraph arc, sign as full "Steve Bronstein"). The new guide borrows the **honesty rules** and the **LLM-tell scrub** from `cover-letter-style.md` and the durable facts from `steve-fact-bank.md`, but defines the email format (first-name greeting, shared-history hook, the ask, casual sign-off).
- **D-06:** **Conversational by default — closeness is light modulation, not hard registers.** Per the owner: he is "always conversational"; the only real variation is a touch warmer/more personal for an actual *friend* and a touch more professional-but-still-casual for a *former colleague*. The ROADMAP success-criterion #3 tier bands (1–2 conversational / 3–5 professional-warm / 7–8 brief-direct) are a **starting point to calibrate against real sample output (D-04), NOT a literal spec to implement**. The author leans on `howMet` + interaction history more than the numeric closeness tier.
- **D-07:** **Tier-dependent length.** Body length scales with closeness — roughly 1–2 sentences for distant/brief contacts, up to ~2 short paragraphs for warmer ones. Subject line, greeting (`Hey <FirstName>,`), and sign-off (`Steve` / `Thanks, Steve`) are chosen **per email within voice-guide rules** (casual, first-name, short) rather than a fixed template — natural variation across a campaign, less templated feel. First name comes from the contact brief.
- **D-09 (the ask):** **Soft ask, always present.** Every email closes with a clear but low-pressure ask derived from the campaign `goalInstruction` (e.g. "would you be open to a quick call?" / "any VP Data folks come to mind?"), phrased warmly and adapted to the person. `goalInstruction` is the campaign-wide intent; each email adapts it to the contact.

### Low-Context Handling

- **D-08:** **Generate anyway, flag in the run summary — no schema change.** For contacts the `generation-context` endpoint marks `lowContext: true` (fewer than 2 logged interactions, GEN-04), the skill still generates (drawing only on `howMet`/company/role — never inventing shared history) and lists those contacts in the **end-of-run summary** and the **sample review**. The flag stays ephemeral (skill output); **no `lowContext`/`needsReview` column is added** to `outreach_emails` (rejected: pulls a Phase 11/12 schema+API change into this phase; the owner reviews these in the UI anyway).

### Guardrails & Run Behavior

- **D-10:** **LLM-tell scan = hard self-correct gate on the criteria minimums; broader list advisory.** After authoring each email the skill scans it (grep-style + judgment). **Blocking** hits (must rewrite in-place before write-back): em/en-dashes, "leverage", "robust", and generic openers like "I hope this message finds you well" — the success-criterion #4 minimums. The fuller `tailor-application-materials` banned-term list ("delve", "seamless", "it's not X it's Y", etc.) is **advisory** — surface but don't block. No email is written back until it passes the blocking scan.
- **D-11:** **Anti-hallucination contract (GEN-04).** Emails reference **only** facts present in the provided contact context (`howMet`, company/role at connection + current, closeness, the ~3 recent interactions). No invented shared history. The `generation-context` payload (Phase 12 D-02) is the complete, sole source of per-contact truth — the skill does not fetch more.
- **D-12 (failure handling):** **Mark `failed` and continue (success criterion #5).** On a per-email failure the skill calls `PATCH .../emails/[emailId]/status` with `{ status: 'failed', lastError: '<first ~200 chars>' }` and proceeds to the next without crashing; failures are reported in the end-of-run summary.
- **D-13 (invocation):** **Batch-only.** `generate-outreach-emails <campaign-id>` drains all `pending` (with the D-03 confirm + D-04 sample gate). **No** `--email <id>` single-regenerate mode — the review UI's regenerate button resets a row to `pending`, and a plain re-run of the batch re-drains pending rows (the skill drains purely on `status='pending'`, per Phase 12 D-05/D-06).

### Claude's Discretion
- Exact chunk size for D-01 (e.g. ~10–15 per pass) — planner/skill picks; the only hard constraint is each email is written back before the next is authored so progress is durable.
- Exact strings/format of the end-of-run summary (counts: generated / failed / low-context).
- Precise sample-selection logic for D-04 (how it picks "a friend / former colleague / distant" from the pending set) — pick a reasonable spread; fall back gracefully if the campaign lacks one of the categories.
- Exact grep patterns / wording of `voice-guide.md` — mirror the `cover-letter-style.md` scrub block.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v1.2 milestone trail
- `.planning/REQUIREMENTS.md` §"GEN-01".."GEN-05" — the requirements this phase delivers (run a skill that generates subject+body per pending email; personalize from CRM context + campaign goal; tone-by-closeness + owner voice + LLM-tell scan reusing the `tailor-application-materials` conventions; reference only provided history, flag low-context; generation lives only in the skill).
- `.planning/ROADMAP.md` §"Phase 16: Email Generation Skill" — goal + the 5 success criteria. **Note the calibration caveat (D-06):** criterion #3's tier bands are a starting point, not a literal spec.

### Phase 12 API surface this skill consumes (read before planning)
- `.planning/phases/12-api-routes/12-CONTEXT.md` — the full outreach REST surface. Key carry-forwards: **D-01/D-02** (the bulk `generation-context` endpoint — ONE call returning every pending email's contact brief + ~3 interactions + `lowContext`; this **overrides** the ARCHITECTURE.md per-email N+1 flow), **D-05/D-06** (regenerate resets to `pending` keeping stale `generated*`; the skill drains on `status='pending'`).
- `src/app/api/outreach-campaigns/[id]/generation-context/route.ts` — the endpoint the skill reads once per run (campaign `goalInstruction` + array of pending emails with embedded contact brief + recent interactions + `lowContext`).
- `src/app/api/outreach-campaigns/[id]/emails/[emailId]/generation/route.ts` — the write-back route. **Must be edited per D-02** to also set `status='generated'` via `canEmailTransition`.
- `src/app/api/outreach-campaigns/[id]/emails/[emailId]/status/route.ts` — the `/status` route the skill calls to mark `failed` (D-12). Closest analog for the D-02 transition logic (validate via `canEmailTransition`, 400 on invalid).
- `src/features/outreach/lib/email-status.ts` — `canEmailTransition()` / `validEmailTransitions`. The D-02 edit calls this; do NOT reimplement.
- `drizzle/schema/outreach-emails.ts` — exact columns the skill reads/writes. Confirms there is **no** `lowContext`/`needsReview` column (D-08) and the `editedX ?? generatedX` content model.

### Voice + skill-pattern sources (read before writing the skill)
- `.claude/skills/tailor-application-materials/references/cover-letter-style.md` — source for the **honesty rules** and the **LLM-tell scrub** block (the grep patterns in D-10) that `voice-guide.md` adapts. Do NOT copy its cover-letter arc/greeting/sign-off (D-05).
- `.claude/skills/tailor-application-materials/references/steve-fact-bank.md` — durable, reusable career facts; the email author draws from here + the contact context only (no invented facts).
- `.claude/skills/scrape-linkedin-connections/SKILL.md` + `references/heimdall-api.md` — the **skill model** to mirror: read queue via authenticated REST → act → write back via REST; never touch the DB. `heimdall-api.md` defines the `Authorization: Bearer $(cat ~/.heimdall/api-token)` convention, the `http://localhost:4000` dev base, and the `{ success, data, error, meta }` envelope the new skill's `references/heimdall-api.md` reuses.
- `.planning/research/ARCHITECTURE.md` §"Skill 1: generate-outreach-emails" — the original skill sketch. **Heed the corrections:** its per-email `GET /api/contacts` + `GET /api/interactions` loop is replaced by the single `generation-context` call (Phase 12 D-01); its claim that the API "transitions status → generated" is the gap D-02 fixes.

### Project anchors
- `CLAUDE.md` / `.planning/PROJECT.md` — REST-only (no server actions), Zod on every route, `{ success, data, error, meta }` envelope, Drizzle query builder, `updatedAt: new Date()` set manually on UPDATE, every write logs a timeline event.
- `.planning/codebase/CONVENTIONS.md` — kebab-case files, async route handlers named after HTTP verb, enum value arrays shared between Zod and UI.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`tailor-application-materials` skill** (`cover-letter-style.md`, `steve-fact-bank.md`, the grep-based LLM-tell scrub) — the voice + honesty + scrub source material `voice-guide.md` adapts (D-05/D-10).
- **`scrape-linkedin-connections` skill** — the structural template for a Heimdall write-back skill (SKILL.md shape, `references/heimdall-api.md`, bearer-token auth, queue→act→write-back loop, mark-failed-and-continue terminal pattern).
- **`generation-context` endpoint** — already returns everything the skill needs in one round-trip (D-01/D-02 from Phase 12); no N+1.
- **`canEmailTransition()`** (`src/features/outreach/lib/email-status.ts`) — reused by the D-02 route edit.

### Established Patterns
- **Generation runs only in the skill (GEN-05).** The API enqueues `pending` and accepts write-back; no generation logic in any route.
- **Skill drains on `status='pending'`** and a `pending` row may carry stale `generated*` (Phase 12 D-05/D-06) — the skill overwrites on its pass; "regenerate" = UI resets to `pending` + re-run (D-13).
- **`updatedAt: new Date()` set manually on every UPDATE** — the D-02 route edit must preserve this (already does).
- **Bearer-token auth already covers all `/api/*`** (`src/proxy.ts`) — no middleware change; the skill authenticates with `~/.heimdall/api-token`.

### Integration Points
- **Reads:** `GET /api/outreach-campaigns/[id]/generation-context`.
- **Writes:** `PATCH .../emails/[emailId]/generation` (content + the new `status='generated'`); `PATCH .../emails/[emailId]/status` (`{ status:'failed', lastError }` on failure).
- **Upstream gate (Phase 15):** the review UI consumes the `generated` content this skill produces and is the human approve gate; regenerate (UI → `pending`) feeds the skill's next run.

</code_context>

<specifics>
## Specific Ideas

- **Sample-review gate (D-04):** generate **5** emails spanning a friend, a former colleague, and distant contacts; show them; wait for thumbs-up/tone tweaks before draining the rest. (Owner: "I will really have to see this in action… for the most part I am always conversational. Maybe a bit different if it's a friend vs former colleague — but I'd need to review examples.")
- **Conversational-default voice (D-06):** baseline is always conversational; modulation is small (friend = warmer/personal; former colleague = professional-warm-but-casual; distant = shorter/lower-pressure). Numeric tier bands are calibration scaffolding, reviewed against real output.
- **LLM-tell blocking set (D-10):** em/en-dashes, "leverage", "robust", generic openers (e.g. "I hope this message finds you well"). Broader `cover-letter-style.md` list = advisory.
- **The D-02 route gap:** `PATCH .../generation` currently sets content but not `status` — make it transition to `generated` so success criterion #1 ("advances all pending to generated") actually holds.

</specifics>

<deferred>
## Deferred Ideas

- **Persisted low-context / needs-review flag** — a `lowContext`/`needsReview` column on `outreach_emails` (+ migration + write-back field) so the review UI can badge low-context emails durably. Deferred (D-08): out of phase scope; ephemeral run-summary flag is sufficient for v1.2. Revisit if the owner wants the badge to survive in the browser.
- **Per-email `--email <id>` single-regenerate skill mode** — considered (D-13) and dropped in favor of batch-only + UI-reset-to-pending + re-run. Revisit only if re-running the whole batch to redo one email becomes annoying in practice.
- **Per-email Claude API sub-calls / configurable generation model** — rejected for v1.2 (D-01) in favor of inline authoring. Would only matter if campaign sizes outgrow what chunked inline authoring can handle comfortably.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 16-Email Generation Skill*
*Context gathered: 2026-06-22*
