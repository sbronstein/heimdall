# Phase 5: Job Leads Completion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `05-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-13 (post-reshape)
**Phase:** 05-job-leads-completion
**Reshape note:** This phase was reshaped from "fix the in-app scraper" to "delete the in-app scraper and replace with a Claude Code skill on `vercel-labs/agent-browser`." The prior discussion log (covering the original 4 gray areas: error-surfacing model, timeout budget, browser lifecycle, debug-log cleanup) is preserved at `05-DISCUSSION-LOG-superseded-in-app-scraper.md`.
**Areas discussed (this session):** skill location, agent-browser invocation pattern, queue+status model, no-arg drain mode, in-app code removal scope, web UI affordance, API write-back contract

---

## Skill location

| Option | Description | Selected |
|--------|-------------|----------|
| Project-local `.claude/skills/scrape-linkedin-connections/` | Checked into the repo; ships with Heimdall; anyone with the codebase + Claude Code can run it. Co-located with `.planning/` docs the skill needs to read. | ✓ |
| User-global `~/.claude/skills/scrape-linkedin-connections/` | Personal Claude Code config; doesn't ship with the repo. | |

**User's choice:** Project-local (recommended)
**Notes:** Skill is Heimdall-specific (knows the API, knows the prospect schema). Shipping with the repo is the right call.

---

## agent-browser invocation pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Interactive `agent-browser ai chat` | Claude (in Claude Code) reasons step-by-step over agent-browser's snapshot+refs model. Best handles LinkedIn's unpredictable DOM. Cost = existing Claude Code session, no separate LLM bill. | ✓ |
| Scripted CLI calls + JSON parsing | Skill shells out to specific `agent-browser` subcommands and parses JSON. More deterministic but defeats the "LLM reasons over a11y tree" point. | |

**User's choice:** Interactive `ai chat` mode (recommended)
**Notes:** Locks the architectural reasoning behind the entire pivot — the value of agent-browser is the LLM reasoning, not its CDP plumbing.

---

## Queue + status model

| Option | Description | Selected |
|--------|-------------|----------|
| Add 2 enum values: `queued` and `failed` + reuse existing columns | Single source of truth via the status enum; explicit `queued` marker for the skill to pick up. Migration: 2 enum values + 2 columns (`last_error`, `last_error_at`). | ✓ |
| Keep enum as-is; track queue state via new boolean/timestamp columns | More columns, more flexibility, but queue state is implied by column combos. | |
| Use existing `searching`/`found` + add only `failed` + `last_error` | Minimal migration; skill picks up `scraped` leads. Fragile — relies on absence of state. | |

**User's choice:** Add `queued` + `failed` (recommended)
**Notes:** Status enum stays the source of truth for the lifecycle state. The skill claims leads by flipping `queued → searching`; race-safety via optimistic update (CONTEXT D-11).

---

## No-arg drain mode

| Option | Description | Selected |
|--------|-------------|----------|
| List queue, then process one-at-a-time with confirmation | Skill prints the queue, walks each lead with Claude narrating, allows user to interrupt/skip. Matches human-in-the-loop ethos; failures visible. | ✓ |
| Batch through all unprocessed leads autonomously | Faster for large queues; harder to recover from a bad run because errors cascade silently. | |
| Process the next single lead and exit | Each invocation handles one lead; simplest skill, most ceremonial. | |

**User's choice:** List queue, walk one-at-a-time with user prompts (recommended)
**Notes:** Failures don't abort the batch — skill captures `failed` and moves to the next lead (CONTEXT D-10).

---

## In-app code removal scope

| Option | Description | Selected |
|--------|-------------|----------|
| Delete the IIFE + `scrape-connections.ts`; keep `linkedin-browser.ts` + `scrape-job-page.ts` | Targeted deletion. The connection-scrape code goes; the job-page-scrape (cheerio, in-app on submit) stays; profile-setup helpers stay (skill may reuse). Convert `/search` route to a thin status-flip endpoint. | ✓ |
| Burn it all — delete every scraper file under `src/features/job-leads/lib/` | Skill handles job-page scrape too. Cleaner separation; doubles skill responsibility. | |
| Keep everything; just disable the IIFE | Lowest risk; leaves cruft. | |

**User's choice:** Targeted deletion (recommended)
**Notes:** `scrape-job-page.ts` is a different concern (cheerio + fetch, in-app on lead create) — keeping it is correct. `linkedin-browser.ts` may still own the `~/.heimdall/linkedin-profile/` invariants even if the skill ends up not importing it directly.

---

## Web UI affordance

| Option | Description | Selected |
|--------|-------------|----------|
| `queued` status badge + copy-skill-invocation button | Lead detail page shows queued badge + a button that copies `claude /scrape-linkedin-connections <id>` to clipboard. Failed leads show categorized error banner. | ✓ |
| Just the badge — no copy button | User memorizes/types the skill invocation. One less thing to build. | |
| Badge + webhook back so the web UI shows a real-time toast | Adds websocket/polling infra; YAGNI for single-user. | |

**User's choice:** Badge + copy button (recommended)
**Notes:** Web UI never triggers a live scrape — it captures URLs and shows results. Explicit boundary preserved.

---

## API write-back contract

| Option | Description | Selected |
|--------|-------------|----------|
| Clerk session via curl + `~/.heimdall/api-token` bearer token | Long-lived token at `~/.heimdall/api-token`; middleware accepts as service-token bypass for the single-user lock. Skill calls existing routes via REST. | ✓ |
| Reuse Clerk session cookie from the local Chrome | No new auth path; fragile if cookie rotates mid-run; ties skill to a specific browser profile. | |
| Skill talks to DB directly via `DATABASE_URL` | Fastest; skips API envelope + `logTimeline()` side effects. | |

**User's choice:** Bearer token via middleware bypass (recommended)
**Notes:** Preserves the REST + Zod + timeline-event invariants the project depends on. Token validation: SHA-256 hash in `.env.local`; single-user-locked at the middleware layer (CONTEXT D-19, D-21).

---

## Claude's Discretion

The following items were captured in CONTEXT.md `<decisions>` § "Claude's Discretion" rather than asked, because they're implementation details the planner should pick based on the codebase:

- **CD-01:** Whether to commit the working-tree state before deletion (recommended: yes; preserves "we tried this before pivoting" history)
- **CD-02:** Whether error-write folds into `PATCH /status` or a separate `POST /error` route (recommended: folded — always co-emitted)
- **CD-03:** Per-step skill API calls vs batched (recommended: per-step for debug-ability)
- **CD-04:** Whether to drop Playwright from `package.json` entirely (depends on whether `scrape-job-page.ts` uses it)
- **CD-05:** Cleanup of leftover `~/.heimdall/linkedin-profile/storage-state.json` (recommended: leave)
- **CD-06:** Bulk-prospects route naming (`POST /prospects` vs `POST /scrape-result`)
- **CD-07:** Skill prompt depth (recommended: detailed first version, trim later)

## Deferred Ideas

Captured to CONTEXT.md `<deferred>` section. Highlights:

- JL-A1..A5 entire requirement set — superseded by the architectural pivot
- Webhook/notification on skill completion — YAGNI for single-user
- `heimdall-linkedin-login` sibling skill — useful if Chrome profile expires; spike later if friction warrants
- Multi-tenant deployment — deferred indefinitely (project is single-user by design)
- Skill output as audit log — YAGNI for now
- Folding job-page scrape into the skill too — only revisit if cheerio path breaks

## Notes on the discussion

This was a streamlined discussion — all seven gray areas picked the recommended option in two batched `AskUserQuestion` rounds (4 + 3). The recommendations were strongly informed by the prior `/gsd-explore` conversation that led into this reshape, where the architectural rationale was already aligned with the user.
