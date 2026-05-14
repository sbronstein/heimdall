# Phase 5: Job Leads Completion - Context

**Gathered:** 2026-05-13 (post-reshape)
**Status:** Ready for planning
**Reshape note:** The original Phase 5 context (363 lines for the in-app-scraper-fix direction) is preserved at `05-CONTEXT-superseded-in-app-scraper.md`. This file is the fresh context for the skill-based pivot.

<domain>
## Phase Boundary

LinkedIn connection scraping moves **out of the Heimdall app** entirely. The flow becomes:

1. A job-lead URL enters Heimdall via the web UI **or** Claude Code (DB insert; the existing `pending → scraped` job-page-scrape pipeline runs as today).
2. Once the job page is scraped, the lead transitions to a new `queued` status — explicit "this lead needs connections scraped."
3. The user runs a Claude Code skill at `.claude/skills/scrape-linkedin-connections/` either with `<job-lead-id>` arg or with no arg to drain the `queued` queue.
4. The skill drives `vercel-labs/agent-browser` in its `ai chat` mode — Claude Code (the active model in the session) reasons step-by-step over the accessibility-tree-with-refs to navigate job → company → employees → 2nd-degree filter and extract prospects.
5. The skill writes prospects back to the DB via the existing `/api/*` surface using a long-lived API token (`~/.heimdall/api-token`).
6. Lead status flips to `searching` (skill claimed it) → `found` (success) or `failed` (skill writes back categorized error). The web UI surfaces `queued` / `failed` with a copy-skill-invocation button and a categorized error banner.

**In scope:**
- New skill at `.planning/`-checked-in path: `.claude/skills/scrape-linkedin-connections/` (per-project, ships with the repo).
- Schema additions to `job_leads`: enum values `queued` and `failed`; new columns `last_error: text` (nullable) and `last_error_at: timestamp` (nullable).
- New API: bulk prospects write (POST `/api/job-leads/[id]/prospects`) and a thin `mark-queued` endpoint to flip status without triggering an in-app scrape.
- Middleware update: accept a long-lived bearer token from `~/.heimdall/api-token` as a service-token bypass for the single-user-locked `/api/*` surface. The token is per-machine, not committed.
- Delete: the fire-and-forget IIFE in `src/app/api/job-leads/[id]/search/route.ts`, the entire `src/features/job-leads/lib/scrape-connections.ts`, the `SearchProgress` polling component, the `Find Connections` button in `job-lead-detail.tsx`, and references to `scrapeConnections` from the job-leads feature.
- Keep: `linkedin-browser.ts` (the skill may reuse the `~/.heimdall/linkedin-profile/` setup helpers); `scrape-job-page.ts` (the cheerio-based job-page scrape on submit is a separate concern from connection scraping and remains in-app).
- Convert `/api/job-leads/[id]/search` from the fire-and-forget IIFE to a thin status-flip endpoint (or remove it entirely; planner picks based on caller analysis).
- UI updates: `queued` and `failed` status badges; copy-to-clipboard button on the lead detail page that yields the skill invocation; categorized error banner reused/adapted from the prior context's D-02 design.
- Tests: skill behavior is exercised in dev (the skill drives a real browser; we don't unit-test agent-browser itself). Server side: API tests for the new bulk-prospects route, the status-flip behavior, and the service-token middleware bypass.

**Out of scope:**
- All of JL-A1..A5 in `.planning/REQUIREMENTS.md` (mark superseded; the code they target is being deleted).
- Production-hosted scraping (`.planning/seeds/prod-hosted-scraping.md` captures the future trigger).
- Webhook back from skill → web UI (toast/notification on scrape completion). Polling the DB on lead refresh is sufficient for a single-user app.
- Stagehand / other LLM-driven browser libraries — agent-browser is locked.
- Captcha detection / rate-limit backoff (carry-forward from JL2-03 — v2-deferred).
- Pagination beyond page 10 in the people-search (carry-forward from JL2-04 — v2-deferred).
- N+1 elimination in prospect writes (PERF-A1 — Phase 6 owns; the new bulk endpoint may incidentally satisfy it, but optimization isn't the goal).
- Migrating away from the `~/.heimdall/linkedin-profile/` local profile pattern (still works; out-of-scope).

</domain>

<decisions>
## Implementation Decisions

### Skill Location and Shape

- **D-01:** **Skill lives at `.claude/skills/scrape-linkedin-connections/`** — per-project, checked into the repo. Anyone with the codebase + Claude Code can run it. Co-located with `.planning/` docs the skill needs to read (REQUIREMENTS, CONTEXT for the current phase, schema files for prospect shape). User-global location rejected — the skill is project-specific (knows Heimdall's API, knows the prospect schema) and should ship with the repo.

- **D-02:** **Skill name = `scrape-linkedin-connections`.** Invoked as `claude /scrape-linkedin-connections` (no arg → drain queue) or `claude /scrape-linkedin-connections <job-lead-id-or-url>` (process one). The skill internally accepts either a UUID job-lead ID (preferred — looks up the URL from DB) or a raw LinkedIn job URL (one-shot mode that creates a lead first, then scrapes).

- **D-03:** **Skill structure** follows the Claude Code skill convention:
  - `.claude/skills/scrape-linkedin-connections/SKILL.md` — frontmatter (name, description, args) + the prompt body that walks Claude through the steps
  - `.claude/skills/scrape-linkedin-connections/references/` — supporting docs the skill prompt links to: a `linkedin-navigation.md` cheat-sheet (the job → company → employees → 2nd-degree path), a `heimdall-api.md` summary (the endpoints + auth pattern), a `troubleshooting.md` for known LinkedIn anti-bot patterns
  - Optionally a `helpers/` dir with small shell/node scripts the skill invokes (e.g., a `fetch-queued-leads.sh` that hits the GET API; a `post-prospects.sh` that does the bulk write). Planner decides whether helpers reduce skill-prompt size enough to justify them.

### agent-browser Invocation Pattern

- **D-04:** **Interactive `agent-browser ai chat` mode.** The skill prompt asks Claude (in Claude Code) to drive agent-browser through the navigation step-by-step using the snapshot + ref model. Claude calls `agent-browser snapshot` (or equivalent) to get the a11y tree, picks the ref to click, calls `agent-browser click @e<n>`, repeats. Cost = the user's existing Claude Code session (no separate LLM bill). Rejected: scripted CLI calls + JSON parsing — defeats the "LLM reasons over a11y tree" point and reverts to brittle pre-determined paths.

- **D-05:** **agent-browser attaches to the existing `~/.heimdall/linkedin-profile/` Chrome** so the LinkedIn session persists across scrapes (and is shared with `linkedin-browser.ts`'s remaining job-page-scrape flow). The exact attach mechanism (launch Chrome with `--remote-debugging-port`, or have agent-browser launch its own Chromium pointed at the user-data-dir) is left to the planner based on agent-browser's current CLI flags. **Planner research item.** If no agent-browser support for re-using a user-data-dir exists, the skill prompt instructs the user to ensure LinkedIn is signed in in the visible Chrome window before continuing.

### Queue and Status Model

- **D-06:** **Add two enum values to `jobLeadStatusEnum`**: `queued` and `failed`. Migration uses Postgres `ALTER TYPE ... ADD VALUE ... AFTER ...`. New full enum (in order): `pending` → `scraping` → `scraped` → `queued` → `searching` → `found` → `ready` → `actioned` → `archived`, plus `failed` (terminal-recoverable; from `queued` or `searching`, recoverable back to `queued` on retry).

- **D-07:** **Add two columns to `job_leads`**: `last_error: text` (nullable, default NULL) and `last_error_at: timestamp with time zone` (nullable, default NULL). NULL = no error to surface; non-null = the most recent scrape attempt failed with this categorized error. Same shape decided in the superseded context's D-01; mechanism preserved, writer changes (skill, not in-app catch).

- **D-08:** **Status transitions** (state machine):
  - `pending → scraping → scraped` — existing job-page-scrape flow (unchanged)
  - `scraped → queued` — new: the existing `/api/job-leads/[id]/search` endpoint becomes a thin "mark queued for connection scrape" flip, returning immediately. No fire-and-forget IIFE.
  - `queued → searching` — skill writes this when it claims a lead (start of scrape)
  - `searching → found` — skill writes this on success along with prospect data and clears `last_error`/`last_error_at`
  - `searching → failed` — skill writes this on failure with `last_error` (category + tail) and `last_error_at`
  - `failed → queued` — retry path: clearing `last_error` flips back to `queued`. Triggered from the UI's retry button.
  - `found → ready/actioned/archived` — existing downstream transitions (unchanged).

- **D-09:** **Error category taxonomy** carries forward from the superseded context's D-03. Five categories: `Timeout` / `LinkedIn navigation failed` / `No prospects found` / `Browser unavailable` / `Unknown error`. Storage: single `last_error` column with format `<category>: <first 200 chars of detail>`. The skill writes these via the API; the API accepts the formatted string and persists.

### No-Arg Drain Mode Semantics

- **D-10:** **Skill in no-arg mode**:
  1. Fetches all leads with `status = 'queued'` (sorted by `updated_at` ASC, oldest first) via GET `/api/job-leads?status=queued`
  2. Prints the queue as a table to the user (id, company name, role title, queued-since-ago)
  3. Asks: "Process all N? Process the first one then ask again? Skip and exit?" (Claude Code surfaces this as a question to the user)
  4. For each lead processed: walks the same path as the URL-arg mode (claim → scrape → write back), narrating each step
  5. On any failure: status flips to `failed` with the error captured; skill continues to the next lead (does NOT abort the batch)
  6. At the end: prints a summary (N processed, M succeeded, K failed)

- **D-11:** **Concurrent-skill-run safety.** Skill claims a lead by flipping it `queued → searching` before scraping. The GET that filters by `status = 'queued'` naturally excludes leads already in-flight. If two skill instances run simultaneously (uncommon for single-user), the second one's claim PATCH may race — acceptable; the second instance sees the lead already in `searching` and skips it (existing concurrency-safe pattern from `/api` envelope's optimistic update). No locking needed.

### In-App Code Removal Scope

- **D-12:** **Delete entirely:**
  - `src/features/job-leads/lib/scrape-connections.ts` — the brittle Playwright path the skill replaces
  - `src/features/job-leads/components/search-progress.tsx` — polling UI for an in-app scrape that no longer exists
  - `src/features/job-leads/components/find-connections-button.tsx` (or the equivalent button in `job-lead-detail.tsx`) — replaced by the queue badge + copy-invocation button (D-16)
  - All imports of `scrapeConnections` from `src/app/api/job-leads/[id]/search/route.ts`
  - The fire-and-forget IIFE block in `src/app/api/job-leads/[id]/search/route.ts:39` and its catch block

- **D-13:** **Convert `/api/job-leads/[id]/search` to a thin status-flip endpoint** rather than deleting the route, since callers exist. Behavior post-change: validates Clerk auth, finds the lead, flips `scraped → queued` (or `failed → queued` on retry), clears `last_error`/`last_error_at`, writes a `job_lead_search_queued` timeline event, returns success envelope. Synchronous; no IIFE; sub-100ms. If the planner finds the route has no remaining callers after UI changes (D-16), delete it instead.

- **D-14:** **Keep:**
  - `src/features/job-leads/lib/linkedin-browser.ts` — its profile-setup helpers may be reused by an optional `claude /heimdall-linkedin-login` skill (deferred); even if not reused, it's small and the `~/.heimdall/linkedin-profile/` invariants are documented there
  - `src/features/job-leads/lib/scrape-job-page.ts` — cheerio-based; runs on initial lead-create to populate `roleTitle`/`companyName`. Unrelated to the connection-scrape problem.
  - The Playwright dependency in `package.json` — still needed by `scrape-job-page.ts`? **Planner verifies** by checking whether `scrape-job-page.ts` actually uses Playwright; if it's pure cheerio + fetch, Playwright drops to `devDependencies` (or out entirely).

- **D-15:** **Working-tree handling.** The current uncommitted diff in `scrape-connections.ts` (and adjacent files) is the *exact* code being deleted. Planner can either:
  - **A:** Commit the working tree first as a "feat(jl): switch scraper to job→company→employees flow (will be deleted in Phase 5)" then delete in a subsequent commit. Cleaner audit trail.
  - **B:** Delete from the working tree directly without committing the intermediate state. Shorter git log.
  - **Recommended: A** — preserves the intent that "this was the brittle path we replaced."

### UI Affordances

- **D-16:** **`queued` status badge + copy-skill-invocation button** on the lead detail page.
  - Badge: subtle background (`bg-secondary`), label `queued for connection scrape`
  - Button: `Copy skill invocation` — copies `claude /scrape-linkedin-connections <lead-id>` to clipboard. Helper text below: "Paste in Claude Code (this directory) to run."
  - On `failed` status: the existing-design categorized error banner from the superseded D-02 (`bg-destructive/10` border-destructive/30), labeled with the category in bold, the truncated tail, and a Retry button that calls the existing `/search` endpoint (which flips back to `queued` per D-13) — same button position as before, just a different downstream action.

- **D-17:** **No real-time notification when the skill completes.** Web UI picks up the state change on next view/refresh. Polling on the lead detail page (or a generic `last-updated` revalidation) is sufficient. Webhook/websocket/SSE is YAGNI for a single-user app.

- **D-18:** **List-view representation.** On the job-leads index page, the `queued` and `failed` statuses get their own column-filter values and status-pill colors. No special "queued" tab; the existing status filter UI absorbs them.

### API Write-Back Contract

- **D-19:** **Auth: long-lived bearer token from `~/.heimdall/api-token`.** Generated by a one-time dev script (`scripts/generate-api-token.ts` or a fresh `npm run` target). 32-byte random hex, persisted to `~/.heimdall/api-token` (machine-local, chmod 600). The middleware in `src/middleware.ts` (Phase 3) is extended to accept `Authorization: Bearer <token>` as an alternative to Clerk session cookies; tokens are validated against a hash stored in env (`API_TOKEN_HASH` in `.env.local`) — never against a DB row. Single-user app: one token, one hash.

- **D-20:** **Routes the skill calls** (all under existing Clerk-locked `/api/*`):
  - `GET /api/job-leads?status=queued&limit=50` — fetch the queue (uses existing list endpoint; planner verifies it accepts a status filter; if not, extends it)
  - `PATCH /api/job-leads/[id]/status` — flip `queued → searching` (claim) and `searching → found|failed` (terminal). **New endpoint or extension of existing `/status`** — planner decides.
  - `POST /api/job-leads/[id]/prospects` — **new bulk-insert endpoint.** Body: array of `ScrapedProspect`. Single DB insert (incidentally helps PERF-A1 in Phase 6, but optimization isn't this phase's goal). On success: writes `job_lead_search_complete` timeline event with `prospectCount`. On schema validation failure: 400 with the offending row index.
  - `POST /api/job-leads/[id]/error` (or a field on `PATCH /status`) — writes `last_error` + `last_error_at` + `job_lead_search_failed` timeline event. **Planner picks the cleanest shape** — probably folded into `PATCH /status` since they're co-emitted.

- **D-21:** **Single-user middleware bypass.** The bearer-token bypass is gated by an explicit check that `process.env.SINGLE_USER_EMAIL === 'steve@bronstein.org'` (matching the existing Clerk middleware lock). Multi-tenant deployments would refuse the bypass. Keeps the architectural assumption of single-user explicit at the auth layer.

- **D-22:** **Schema validation in the bulk-prospects route uses Zod.** Per project convention. Schema (kept in sync with `ScrapedProspect`):
  ```ts
  const prospectSchema = z.object({
    name: z.string().min(1).max(200),
    title: z.string().max(300).nullable(),
    linkedinUrl: z.string().url().nullable(),
    mutualConnectionNames: z.array(z.string().max(200)).max(50)
  });
  const bulkBody = z.object({ prospects: z.array(prospectSchema).max(200) });
  ```

### Schema Migration

- **D-23:** **Migration name suggestion:** `add_queued_failed_status_and_error_columns`. Drizzle Kit auto-generates the migration when the `enums.ts` and `job-leads.ts` schema changes are made; planner runs `npm run db:generate -- --name=add_queued_failed_status_and_error_columns`. **One Drizzle Kit gotcha:** Postgres `ALTER TYPE ADD VALUE` is non-transactional — Drizzle Kit may emit raw SQL. Planner verifies the generated migration is sane and applies cleanly to the existing prod data; if Drizzle Kit struggles, hand-edit the migration to use explicit `ALTER TYPE ... ADD VALUE IF NOT EXISTS 'queued' AFTER 'scraped'` and `... 'failed' AFTER 'archived'`.

- **D-24:** **No data migration needed.** Existing leads keep their current status; new statuses only apply to new lifecycle paths. Leads currently stuck in `searching` (from the buggy in-app scraper) should be manually flipped to `queued` post-deploy — a one-line `UPDATE` recorded in a runbook entry, not a code migration.

### Testing Strategy

- **D-25:** **Three layers:**
  1. **API tests** (PGlite + `callRoute`, Phase 2 pattern):
     - `GET /api/job-leads?status=queued` returns only `queued` leads
     - `POST /api/job-leads/[id]/prospects` validates the Zod schema, bulk-inserts prospects, writes a `job_lead_search_complete` timeline event, returns the inserted count
     - `PATCH /api/job-leads/[id]/status` enforces the state machine (e.g., can't go `pending → found`)
     - Middleware: bearer-token bypass works with valid token, 401s with invalid or absent token, falls back to Clerk for browser sessions
  2. **Schema migration test:** PGlite-backed test that the generated migration applies cleanly to an empty DB.
  3. **Skill smoke (manual):** invoke the skill on a real queued lead in dev, walk through agent-browser, verify prospects land in DB via the web UI. Not automatable in CI without mocking agent-browser, which defeats the purpose.

- **D-26:** **No tests for `scrape-connections.ts` deletion** — the file is being removed, not refactored. A grep-style filesystem-existence test (mirroring Phase 4's `__cleanup__.test.ts`) confirms `src/features/job-leads/lib/scrape-connections.ts` no longer exists post-Phase-5.

### Claude's Discretion

- **CD-01:** **Whether to commit the working-tree state before deletion** (D-15). Recommended A (commit the intermediate scraper rewrite first, then delete) — preserves the "we tried this path before pivoting" history. Planner picks B if the diff has nothing valuable to attribute (e.g., it's only the bugs Phase 5 was originally going to fix).

- **CD-02:** **Whether to fold the error-write into `PATCH /status` or a separate `POST /error` route** (D-20). Recommended: folded into `PATCH /status` — they're always co-emitted, and a single endpoint is simpler. Planner has discretion if there's a routing reason to split.

- **CD-03:** **Whether the skill emits its own per-step Heimdall API calls or batches them.** Per-step: status flip → scrape → bulk insert. Batched: scrape → single API call that handles status transition + prospect insert atomically. Recommended: per-step — debug-ability wins over slightly more chattiness for a single-user CLI tool.

- **CD-04:** **Whether to drop Playwright entirely from `package.json`** (D-14). Planner checks whether `scrape-job-page.ts` actually uses Playwright. If pure cheerio + fetch, Playwright can move to `devDependencies` or out entirely.

- **CD-05:** **Whether to clean up the `~/.heimdall/linkedin-profile/storage-state.json` artifact** that the superseded path produced. Planner decides during cleanup; probably leave (local file, no harm).

- **CD-06:** **Naming of the bulk-prospects route.** Recommended: `POST /api/job-leads/[id]/prospects`. Alternatives: `POST /api/job-leads/[id]/scrape-result` (more semantic). Planner picks based on naming consistency with the rest of `/api/`.

- **CD-07:** **Skill prompt body — depth of LinkedIn-navigation instructions.** The skill walks Claude through agent-browser; the cheat-sheet at `references/linkedin-navigation.md` describes the canonical path (job → company → employees → 2nd-degree filter). Should the cheat-sheet be detailed (one paragraph per nav step) or brief (one-line summary)? Recommended: detailed for the first version (Claude has less guesswork), trim later if it bloats the prompt.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 5 reshape trail
- `.planning/ROADMAP.md` §"Phase 5: Job Leads Completion — RESHAPED 2026-05-13" — locked goal + 5 success criteria
- `.planning/notes/linkedin-scraper-agent-browser-evaluation.md` — original library evaluation (Stagehand vs agent-browser); the trail leading to the skill pivot
- `.planning/spikes/MANIFEST.md` — superseded Stagehand-in-the-app spikes; explains why the agent-browser-CLI-in-skill direction is correct
- `.planning/seeds/prod-hosted-scraping.md` — prod-hosted scraping deferred; trigger conditions captured
- `.planning/phases/05-job-leads-completion/05-CONTEXT-superseded-in-app-scraper.md` — prior (in-app-scraper-fix) context; useful for the error-taxonomy and the failure-banner UI patterns that survive

### Project anchors
- `.planning/PROJECT.md` §"Key Decisions → Job Leads scraping" — flagged for revisit; this phase closes that revisit
- `.planning/REQUIREMENTS.md` §"Job Leads Completion" — JL-A1..A5 to be **marked superseded** by the planner during plan-phase (write a note above the section); the new requirement set will be JL-B* defined during planning
- `.planning/STATE.md` — phase progress

### Codebase maps (read before planning)
- `.planning/codebase/ARCHITECTURE.md` §"Anti-Patterns → Async fire-and-forget" — the architectural debt this phase pays off
- `.planning/codebase/CONCERNS.md` §"Fragile Areas → LinkedIn Scraper — Entire Feature Is Brittle" — concrete pointers to the code being deleted
- `.planning/codebase/CONVENTIONS.md` — kebab-case files, named exports, API envelope shape; the new skill helpers and API routes follow these
- `.planning/codebase/STACK.md` — Drizzle 0.45.1, Neon serverless, Zod 4, Next.js 16 App Router

### Prior phase context
- `.planning/phases/02-test-infrastructure/02-CONTEXT.md` §"D-09" — Vitest + PGlite + `callRoute` pattern; reused for the new API tests
- `.planning/phases/03-security-hardening/03-CONTEXT.md` §"03-01-PLAN" — middleware-locks-`/api/*` work; the bearer-token bypass extends this middleware
- `.planning/phases/04-starter-template-cleanup/04-CONTEXT.md` §"D-19" — filesystem-existence test pattern (`__cleanup__.test.ts`); D-26 mirrors this for the `scrape-connections.ts` removal

### Source files (under modification)
- `src/middleware.ts` — extend to accept `Authorization: Bearer <token>` as Clerk-bypass (D-19, D-21)
- `src/app/api/job-leads/[id]/search/route.ts` — convert to thin status-flip or delete (D-13)
- `src/app/api/job-leads/[id]/status/route.ts` — extend to enforce state-machine + accept `last_error` write (D-20)
- `src/app/api/job-leads/[id]/prospects/route.ts` — **new**; bulk write per D-20/D-22
- `src/app/api/job-leads/route.ts` — extend GET to accept `status` query filter (D-20; verify it doesn't already)
- `src/features/job-leads/lib/scrape-connections.ts` — **delete** (D-12)
- `src/features/job-leads/components/search-progress.tsx` — **delete** (D-12)
- `src/features/job-leads/components/job-lead-detail.tsx` — replace `Find Connections` with `Copy skill invocation` + queued-badge + error banner (D-16)
- `drizzle/schema/enums.ts` — add `queued` and `failed` to `jobLeadStatusEnum` (D-06)
- `drizzle/schema/job-leads.ts` — add `last_error: text` and `last_error_at: timestamp` columns (D-07)
- `drizzle/migrations/<auto>` — new migration (D-23)

### New artifacts (created by this phase)
- `.claude/skills/scrape-linkedin-connections/SKILL.md` — skill entry point
- `.claude/skills/scrape-linkedin-connections/references/linkedin-navigation.md` — nav cheat-sheet (D-03, CD-07)
- `.claude/skills/scrape-linkedin-connections/references/heimdall-api.md` — endpoint summary
- `.claude/skills/scrape-linkedin-connections/references/troubleshooting.md` — known issues
- `scripts/generate-api-token.ts` (or equivalent) — one-time token generation (D-19)
- Updated `env.example.txt` with `API_TOKEN_HASH` placeholder

### External references
- **`vercel-labs/agent-browser`** — https://github.com/vercel-labs/agent-browser. Planner researches: current binary install method, the `ai chat` subcommand flags, whether it supports attaching to a `userDataDir`-backed Chrome, how the snapshot-with-refs output is formatted.
- **Claude Code skill conventions** — Planner researches: SKILL.md frontmatter format, args parsing, how to invoke other tools (Bash, Read) from inside a skill.
- **Clerk middleware customization** — Planner verifies that `clerkMiddleware` from `@clerk/nextjs` allows a pre-check for bearer-token bypass without breaking the Clerk session path. Next.js 16 App Router compatible.
- **Postgres `ALTER TYPE ADD VALUE`** — D-23; non-transactional in some Postgres versions; planner confirms Neon serverless behavior.

### Coding conventions
- `CLAUDE.md` — TS strict, named exports, REST API (no server actions), Zod on routes, `{ success, data, error, meta }` envelope; skill helpers (if written in TS) follow these
- `.planning/codebase/CONVENTIONS.md` — kebab-case files, `import type` for type-only imports, the api-helper functions in `src/lib/api/`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`logTimeline()`** in `src/lib/db/timeline.ts` — reused for the new event types `job_lead_search_queued` (D-13), `job_lead_search_complete` (already exists, written from the bulk-prospects route on success), `job_lead_search_failed` (D-20).
- **Phase 2 test harness** (`src/test-utils/pglite.ts`, `src/test-utils/call-route.ts`) — used for the API tests in D-25 layer 1.
- **Phase 3 middleware** (`src/middleware.ts`) — extended to accept the bearer-token bypass (D-19). The existing pattern of explicit `auth()` checks per-route stays; the bypass is a middleware-layer alternative session source.
- **`~/.heimdall/linkedin-profile/`** — local Chrome user-data-dir. The skill reuses this so the LinkedIn login persists across both `scrape-job-page.ts` (in-app, on lead create) and the agent-browser-driven connection scrape (skill).
- **`/api/job-leads/[id]/status` PATCH route** — extended to enforce state-machine transitions + accept `last_error` writes (D-20).
- **`ScrapedProspect` type** — survives unchanged in the API contract even though `scrape-connections.ts` (its current home) is deleted; planner moves the type into `src/features/job-leads/lib/types.ts` or `src/lib/domain/types.ts` so the bulk-prospects route can import it without touching the dead file.

### Established Patterns
- **REST mutations only, no server actions** (CLAUDE.md) — the skill calling REST API routes IS the orthodoxy here; this phase doubles down on it
- **Soft delete via `archived_at`** — unchanged; not used for failed scrapes (they revert to `queued` via retry, never archive on failure)
- **Timeline event after every write** — every status flip + every error write emits one (D-08, D-20)
- **Atomic commits per requirement** (Phase 3 / Phase 4 D-19) — Phase 5 inherits. Expected commit sequence: working-tree commit (CD-01 option A) → schema migration → middleware bypass → API routes → skill files → UI updates → in-app deletions → tests
- **`{ success, data, error, meta }` envelope** — every new route follows; Zod validates inbound, satisfies-typed responses
- **Inline error banner pattern** — survives from the superseded D-02 with the same destructive-variant styling; just consumed via the new `last_error` column on the lead, written by the skill

### Integration Points
- **Skill ↔ Heimdall API**: bearer token from `~/.heimdall/api-token` → `Authorization: Bearer <token>` header → middleware bypass → REST routes. Token rotation is manual (regenerate the file, update `API_TOKEN_HASH` in `.env.local`).
- **Skill ↔ agent-browser**: skill prompt instructs Claude (the active model) to call `agent-browser` subcommands via Bash. Claude reasons about the a11y-tree output and picks refs to interact with.
- **Skill ↔ Chrome**: agent-browser attaches to (or launches against) the existing `~/.heimdall/linkedin-profile/` profile so the LinkedIn session is shared.
- **Web UI ↔ skill**: indirect, via DB. UI shows `queued` badge + copy-skill-invocation button; skill writes `searching`/`found`/`failed` which the UI surfaces on next render.

### What the Planner Does NOT Need to Research
- Whether to use Stagehand or another LLM-browser lib (D-04: locked to agent-browser)
- Whether to add `failed` as an enum value (D-06: yes)
- Where the error text lives (D-07: `last_error` column + timeline event)
- Auth path for the skill (D-19: bearer token from `~/.heimdall/api-token`)
- Skill location (D-01: `.claude/skills/scrape-linkedin-connections/`)
- Whether to delete `scrape-connections.ts` (D-12: yes)
- Whether to keep `scrape-job-page.ts` (D-14: yes)
- Whether to add a webhook/notification on completion (D-17: no)

### What the Planner DOES Need to Research / Decide
- **agent-browser current API**: latest binary install method (npm? brew? curl install script?), exact subcommand names (the README will say; the `ai chat` mode in particular), output format of `snapshot` (the a11y tree representation), whether `userDataDir` attach is supported. This dictates the skill's prompt body.
- **Claude Code skill conventions**: SKILL.md frontmatter shape (`description`, `args`, `requires-tools`?), how to declare which tools the skill needs (Bash + Read minimum, possibly Edit if the skill writes back to local files), how skill args (`<job-lead-id>` vs `--all`) get parsed.
- **`clerkMiddleware` bypass compatibility**: does Clerk's middleware allow a pre-check that short-circuits to a custom auth path without breaking Clerk's own flow? Or do we need to wrap `clerkMiddleware` in a custom middleware function that checks bearer first? Next.js 16 App Router compatibility check.
- **Drizzle Kit + `ALTER TYPE ADD VALUE`**: does `drizzle-kit generate` emit a sane migration for adding enum values? Or does it bork? Planner runs `npm run db:generate -- --name=add_queued_failed_status_and_error_columns` and inspects the output; hand-edits if necessary.
- **Existing `/api/job-leads` GET filter shape**: does it already accept a `status` query param? (Likely yes — check the route handler.) If not, extend it.
- **Polling/refresh on the lead detail page**: how does the existing page detect that a scrape completed? `revalidatePath` on a tag? SWR? Plain Server Component re-fetch on navigation? Planner reads the existing code to pick the right approach for D-17's "next view/refresh" behavior.
- **`scrape-job-page.ts` Playwright dependency**: planner confirms whether the file actually uses Playwright. If pure cheerio + fetch, Playwright can be dropped (CD-04).
- **Token-hash strategy**: SHA-256 of the token vs `bcrypt`? Recommended SHA-256 (32-byte token, plenty of entropy, no need for bcrypt's slowness against a known-length token). Planner confirms.

</code_context>

<specifics>
## Specific Ideas

- **The copy-skill-invocation button** uses the existing shadcn/ui `Button` with `variant="secondary"` and a `Copy` icon from `@tabler/icons-react`. Click handler uses `navigator.clipboard.writeText('claude /scrape-linkedin-connections ' + lead.id)`. Toast on copy via `sonner` (already in deps): `toast.success('Skill invocation copied — paste in Claude Code')`.

- **The queued badge** uses a `Badge` component variant. Style hint: `bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200` for `queued`; the existing `bg-destructive/10` for `failed`. Match the visual weight of the existing status pills in the data table.

- **Skill SKILL.md frontmatter draft:**
  ```yaml
  ---
  name: scrape-linkedin-connections
  description: Scrape 2nd-degree LinkedIn connections at a target company. Drives vercel-labs/agent-browser through job → company → employees → 2nd-degree filter, extracts prospects, writes them back to Heimdall. Accepts a job-lead ID/URL or runs with no arg to drain the queued queue.
  args: [job-lead-id-or-url?]
  requires-tools: [Bash, Read]
  ---
  ```

- **The bulk-prospects API route** at `src/app/api/job-leads/[id]/prospects/route.ts`:
  ```ts
  // POST
  // 1. Auth: Clerk session OR bearer token (middleware handles)
  // 2. Validate params.id is a UUID
  // 3. Validate body matches bulkBody Zod schema (D-22)
  // 4. Verify the lead exists and is in 'searching' status
  // 5. Single bulk insert via Drizzle: db.insert(prospects).values(rows)
  // 6. Update lead: status = 'found', prospectCount = rows.length, updatedAt = now
  // 7. Write timeline event: { eventType: 'job_lead_search_complete', metadata: { prospectCount }}
  // 8. Return 201 { success: true, data: { insertedCount: rows.length } }
  ```

- **Token generation script** (`scripts/generate-api-token.ts`):
  ```ts
  // 1. Generate 32-byte random hex via crypto.randomBytes
  // 2. SHA-256 hash
  // 3. Print: token to clipboard or stdout; hash to stdout with instructions to add to .env.local
  // 4. Also write the token to ~/.heimdall/api-token (chmod 600)
  // 5. Print: "Token written to ~/.heimdall/api-token. Add API_TOKEN_HASH=<hash> to .env.local."
  ```

- **Middleware bypass logic** (`src/middleware.ts`):
  ```ts
  // Inside clerkMiddleware: before the Clerk session check, look at Authorization header.
  // If "Bearer <token>" present and SHA256(token) === process.env.API_TOKEN_HASH and SINGLE_USER_EMAIL is set:
  //   short-circuit: allow the request, attach a fake auth context (or set NextResponse.next() directly).
  // Otherwise: fall through to Clerk's normal session flow.
  ```

- **Skill prompt body sketch:** lead the prompt with "You are scraping LinkedIn 2nd-degree connections for Heimdall. Read `references/linkedin-navigation.md` for the canonical nav steps and `references/heimdall-api.md` for the API contract." Then arg parsing, then the nav flow with explicit calls to `agent-browser` subcommands.

</specifics>

<deferred>
## Deferred Ideas

- **JL-A1..A5 superseded** — the entire prior requirement set targets code being deleted. Planner adds a `> **SUPERSEDED 2026-05-13:** ...` block above the JL-A section in REQUIREMENTS.md and defines JL-B* requirements that match the new SCs.
- **PERF-A1 / PERF-A2 (Phase 6)** — bulk-insert optimizations. The new `/prospects` route incidentally uses a single bulk insert (PERF-A1's goal), but Phase 6 owns the explicit optimization audit + index strategy.
- **Webhook / notification on skill completion** (rejected as D-17) — if usage data later shows the user is heavily relying on context-switch between Claude Code and the web, revisit.
- **Captcha detection / rate-limit backoff** (JL2-03) — still v2-deferred. The skill should gracefully fail with the `LinkedIn navigation failed` category if it hits a captcha; backoff/retry strategy is its own future feature.
- **`heimdall-linkedin-login` skill** — a sibling skill that explicitly walks the user through signing into LinkedIn in the visible Chrome window. Useful if `~/.heimdall/linkedin-profile/` cookies expire. Not required for Phase 5; spike it later if friction warrants.
- **Multi-tenant deployment** — the bearer-token bypass is single-user-locked (D-21). Multi-tenant Heimdall is its own project; defer indefinitely.
- **Skill output as a verifiable artifact** — could write a structured skill-run log to `.planning/scrape-runs/<date>.md` for audit. YAGNI for single-user; deferred.
- **Job-page scrape moves to the skill too** — `scrape-job-page.ts` stays in-app per D-14. If LinkedIn changes job-page DOM in a way that breaks cheerio, this becomes a candidate to fold into the skill. Out of scope for now.
- **Concurrent-skill safety beyond optimistic flips** — D-11 accepts the race; if it ever becomes a real problem (it won't for single-user), revisit with a proper lock column or Postgres advisory lock.

### Reviewed Todos (not folded)
None — `gsd-sdk query todo.match-phase 5` returned no matches.

</deferred>

---

*Phase: 05-Job Leads Completion (reshaped)*
*Context gathered: 2026-05-13 (post-reshape)*
