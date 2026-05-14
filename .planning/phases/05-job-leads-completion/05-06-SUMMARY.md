---
phase: 05-job-leads-completion
plan: 06
subsystem: claude-code-skill

tags: [claude-code-skill, agent-browser, linkedin-scraping, rest-api, bearer-token, prompt-engineering]

# Dependency graph
requires:
  - phase: 05-job-leads-completion
    plan: 02
    provides: bearer-token middleware bypass + ~/.heimdall/api-token convention
  - phase: 05-job-leads-completion
    plan: 04
    provides: PATCH /status state machine, POST /prospects (5-field ScrapedProspect), POST /search thin status-flip, GET /job-leads?status= filter
provides:
  - .claude/skills/scrape-linkedin-connections/SKILL.md — Claude Code skill entry point (frontmatter + prompt body for drain mode AND single-lead mode)
  - .claude/skills/scrape-linkedin-connections/references/linkedin-navigation.md — canonical job → company → employees → 2nd-degree filter nav cheat-sheet (4 steps + pagination)
  - .claude/skills/scrape-linkedin-connections/references/heimdall-api.md — bearer-token auth + 4 endpoints + response envelope + state-machine table + curl examples
  - .claude/skills/scrape-linkedin-connections/references/troubleshooting.md — all 5 D-09 categories with triggers + manual recovery checklist
affects: [05-05, 05-07, phase-6]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "First in-repo .claude/skills/* asset — establishes the SKILL.md frontmatter+prompt-body convention (name, description, argument-hint, allowed-tools: Read+Bash) and the references/ doc-co-location pattern."
    - "Skill prompt deliberately does NOT pin agent-browser subcommand names — frontmatter and prompt body both point to the installed agent-browser README so the skill survives version bumps (D-04 + CONTEXT.md `<code_context>` 'needs research')."
    - "5-field ScrapedProspect contract (name, title, linkedinUrl, profileSnippet, mutualConnectionNames) propagated end-to-end into the prompt body — matches the Plan 05-04 Zod schema field-for-field."
    - "Bearer-token auth pattern is `$(cat ~/.heimdall/api-token)` inline in curl — resolved value never appears in shell history (depending on shell)."
    - "D-09 failure taxonomy (Timeout, LinkedIn navigation failed, No prospects found, Browser unavailable, Unknown error) carried verbatim into both SKILL.md and troubleshooting.md as `<Category>: <detail>` strings written to PATCH /status."

key-files:
  created:
    - .claude/skills/scrape-linkedin-connections/SKILL.md
    - .claude/skills/scrape-linkedin-connections/references/linkedin-navigation.md
    - .claude/skills/scrape-linkedin-connections/references/heimdall-api.md
    - .claude/skills/scrape-linkedin-connections/references/troubleshooting.md
    - .planning/phases/05-job-leads-completion/05-06-SUMMARY.md
  modified: []

key-decisions:
  - "agent-browser subcommands left unpinned. The SKILL.md `## Setup` and step 2 of `## Single-lead mode` both say 'consult the installed agent-browser README' — the skill does NOT hard-code `snapshot`/`click @e<n>`/`ai chat` because those names shift between versions (D-04 + CONTEXT.md flagged this as a planner-research item)."
  - "Body trimmed to 7.3 KB (under the plan's 8 KB acceptance bound and the action note's 6 KB target). Initial draft was 9.1 KB — verbose prose was tightened without dropping the seven mandatory sections (overview, setup, argument parsing, drain mode, single-lead mode, error handling, constraints)."
  - "Selector hints in linkedin-navigation.md are explicitly marked 'hints, not guarantees'. LinkedIn DOM shifts every few weeks; the prompt prefers a11y-tree text/role matching first, falls back to selectors second, and treats genuinely-absent elements as `LinkedIn navigation failed` (D-09)."
  - "heimdall-api.md documents POST /search even though the skill does not call it. The context matters: the UI's Retry button POSTs there, putting a `'failed'` lead back into `'queued'`, where the next drain-mode skill run picks it up. Documented so the skill author understands the round-trip."
  - "No HTML companion files. Per user-global CLAUDE.md, the `.planning/views/*.html` mirror rule applies to `.planning/`-only; `.claude/skills/` is out of that contract (and PATTERNS.md `<NEW references/>` explicitly notes 'these are referenced by Claude, not rendered as HTML companions')."
  - "Plaintext token is NEVER in any skill file — only the `$(cat ~/.heimdall/api-token)` template appears (verified via `grep -nE '[0-9a-f]{32,}'` returning zero matches across all four skill files)."

patterns-established:
  - "Skill prompt body structure: Overview → Setup → Argument parsing → Drain mode → Single-lead mode → Error handling → Constraints. Each mode section is a numbered procedure; the Constraints section is a 'do NOT' bullet list. Future Heimdall skills follow this shape."
  - "References/ docs as on-demand expansions: SKILL.md links to references/<name>.md via Markdown links; the LLM reads them only when it hits a navigation/API/failure question. Reduces prompt-body bloat (CD-07)."

requirements-completed: [JL-B1, JL-B2]

# Metrics
duration: ~10min
completed: 2026-05-14
---

# Phase 05 Plan 06: Claude Code Skill Assets — SKILL.md + references/ Summary

**Created the project-checked-in Claude Code skill at `.claude/skills/scrape-linkedin-connections/` — entry-point SKILL.md (frontmatter + prompt body covering drain mode and single-lead mode) plus three reference docs (canonical LinkedIn nav cheat-sheet, Heimdall API contract, error-category troubleshooting + manual recovery) — that drives `vercel-labs/agent-browser` through the four-step LinkedIn navigation and writes 5-field ScrapedProspect results back via the Plan 04 REST routes.**

## Performance

- **Duration:** ~10 min (worktree branch check → SKILL.md draft → tighten to fit size budget → three references docs → verification → SUMMARY)
- **Started:** 2026-05-14T08:24Z
- **Tasks:** 2 (no TDD — both are pure-content markdown authoring; no test infrastructure applies)
- **Files created:** 4 (1 SKILL.md, 3 references/*.md) + this SUMMARY
- **Files modified:** 0
- **Commits:** 2 atomic task commits

## Accomplishments

- **`SKILL.md`** (7.3 KB, 110 lines) at `.claude/skills/scrape-linkedin-connections/SKILL.md`:
  - Frontmatter: `name`, multi-line `description`, `argument-hint: '[job-lead-id-or-url]'`, `allowed-tools: [Read, Bash]`.
  - Body covers: Overview → Setup (user prerequisites: api-token, env vars, dev server, agent-browser, LinkedIn signed in) → Argument parsing (UUID vs URL vs no-arg routing) → Drain mode (queue fetch, table render, batch processing, summary) → Single-lead mode (claim via PATCH /status, navigate via agent-browser, extract 5 fields, paginate to page 10 cap, write via POST /prospects or PATCH /status failed) → Error handling (5 D-09 categories explicitly named with `<Category>: <detail>` format) → Constraints (no DB direct, no token logging, 5-min per-lead budget, no batch-claim).
  - Links to all three reference docs via Markdown links (`references/linkedin-navigation.md`, `references/heimdall-api.md`, `references/troubleshooting.md`).
- **`references/linkedin-navigation.md`** (8.0 KB): five-section cheat-sheet (Step 1 open job → Step 2 click company → Step 3 click employees → Step 4 apply 2nd-degree filter → Step 5 paginate + extract). Each step has goal / action / selector hints / expected outcome / failure modes. Closing table of historically-stable selectors (`a[href*="/in/"]`, `a[href*="/company/"]`, `button[aria-label="Next"]`, mutual-connections text) marked "hints, not guarantees."
- **`references/heimdall-api.md`** (9.1 KB): bearer-token auth section (SHA-256(token) === API_TOKEN_HASH invariant + SINGLE_USER_EMAIL gate); response envelope section ({success, data, error, meta} shape + status codes); four endpoint sections (GET /job-leads?status=, PATCH /status with full state-machine transition table, POST /prospects with 5-field ScrapedProspect Zod schema, POST /search as context-for-skill-author); curl examples for claim and failure-write; error-envelope cheat-sheet table mapping status codes to skill actions.
- **`references/troubleshooting.md`** (7.4 KB): five sections (one per D-09 category) each with common triggers + skill behavior; manual recovery section (sign-in check, manual nav check, dev server liveness, escalation to selector updates); v1-deferred list (rate-limit backoff, page-10+ pagination, captcha auto-solve, multi-instance coordination).

## Task Commits

1. **Task 1: SKILL.md entry point + prompt body** — `fb110c4` (feat)
2. **Task 2: Three references/ docs** — `51dd18b` (docs)

## Plan Output Spec — Per-Bullet Confirmation

1. **Final SKILL.md size (KB) and line count:** 7.3 KB / 110 lines. (Plan acceptance bound: 2–8 KB. Plan action target: <6 KB; tightened from 9.1 KB initial draft to 7.3 KB — readability over absolute minimum; all seven sections preserved.)
2. **D-09 category occurrence counts in troubleshooting.md:**
   - `Timeout`: 3
   - `LinkedIn navigation failed`: 2
   - `No prospects found`: 2
   - `Browser unavailable`: 2
   - `Unknown error`: 2
   - (verification grep ≥5 — all 5 categories present, passes.)
3. **agent-browser subcommand pinning:** NOT pinned. SKILL.md Setup section (line 31): "Subcommand names (`snapshot`, `click @e<n>`, `ai chat`, etc.) shift between versions — consult the installed agent-browser README for current verbs; this skill does NOT pin a version." Step 2 of single-lead mode (line 63): "Subcommands depend on the installed version (consult its README)." This matches the CONTEXT.md `<code_context>` "Planner DOES Need to Research" instruction to leave the exact subcommand names floating.
4. **No plaintext token in any skill file:** Verified — `grep -nE '[0-9a-f]{32,}'` across all four files returns zero matches. The template `$(cat ~/.heimdall/api-token)` appears in SKILL.md (3 times), heimdall-api.md (6 times), and troubleshooting.md (1 time — in the manual-recovery curl example).

## Plan Verification Block — Confirmation

- `test -d .claude/skills/scrape-linkedin-connections` — **PASS**
- `test -d .claude/skills/scrape-linkedin-connections/references` — **PASS**
- `ls .claude/skills/scrape-linkedin-connections/` returns `SKILL.md` and `references/` — **PASS**
- `ls .claude/skills/scrape-linkedin-connections/references/` returns three `.md` files (heimdall-api, linkedin-navigation, troubleshooting) — **PASS**
- `grep -lE "^name: scrape-linkedin-connections$" .claude/skills/scrape-linkedin-connections/SKILL.md` matches — **PASS**
- Manual smoke (acknowledged D-25 layer 3): not run here; the skill loads when the user invokes `claude /scrape-linkedin-connections` in their Claude Code session.

## Acceptance Criteria — Per-Task Confirmation

### Task 1 (SKILL.md)

| Criterion | Result |
|-----------|--------|
| File `.claude/skills/scrape-linkedin-connections/SKILL.md` exists | PASS |
| Starts with `---` YAML frontmatter fence | PASS (line 1) |
| Frontmatter `name: scrape-linkedin-connections` | PASS |
| Frontmatter non-empty `description:` | PASS |
| Frontmatter `argument-hint: '[job-lead-id-or-url]'` | PASS |
| Frontmatter `allowed-tools:` with Read + Bash | PASS |
| Body covers: overview, setup, arg parsing, drain mode, single-lead mode, error mapping, constraints | PASS (7 sections in order) |
| Body links to all three companion docs by relative path | PASS (5 link occurrences in SKILL.md) |
| All 5 D-09 categories mentioned | PASS (Timeout: 4, LinkedIn navigation failed: 2, No prospects found: 2, Browser unavailable: 1, Unknown error: 1) |
| Body documents PATCH `/status` body shape `{ status: failed, lastError }` | PASS (curl example in Error handling section) |
| File size 2–8 KB | PASS (7.3 KB) |

### Task 2 (references/*.md)

| Criterion | Result |
|-----------|--------|
| All three files exist under `references/` | PASS |
| nav.md documents four-step nav (job → company → employees → 2nd-degree filter) in order | PASS (`## Step 1` through `## Step 4` headings) |
| nav.md lists four selector hints with hint disclaimer | PASS (closing "Historically-stable selectors" table + disclaimer paragraph) |
| api.md documents all 4 endpoints | PASS (GET /job-leads, PATCH /status, POST /prospects, POST /search — each as its own `### N.` section) |
| api.md documents bearer-token + SHA-256 invariant | PASS (Auth section: "SHA-256(<bearer token>) === process.env.API_TOKEN_HASH") |
| api.md documents `{ success, data, error, meta }` envelope | PASS (dedicated Response envelope section) |
| ts.md covers all 5 D-09 categories | PASS (one section per category, plus manual recovery + deferred-items section) |
| ts.md has manual recovery section | PASS (`## Manual recovery (when the skill repeatedly fails)` with 4-step checklist) |
| No YAML frontmatter in reference files | PASS (line 1 of each is `# <title>`, not `---`) |
| Each file 1–12 KB | PASS (nav 8.0 KB, api 9.1 KB, ts 7.4 KB) |

## Files Created/Modified

### Created

- `.claude/skills/scrape-linkedin-connections/SKILL.md` — skill entry point (frontmatter + prompt body)
- `.claude/skills/scrape-linkedin-connections/references/linkedin-navigation.md` — nav cheat-sheet
- `.claude/skills/scrape-linkedin-connections/references/heimdall-api.md` — API contract
- `.claude/skills/scrape-linkedin-connections/references/troubleshooting.md` — failure taxonomy
- `.planning/phases/05-job-leads-completion/05-06-SUMMARY.md` — this file

### Modified

None.

## Decisions Made

1. **Tightened the prompt body to 7.3 KB.** First draft was 9.1 KB; the plan's acceptance criterion is 2–8 KB and the action target is <6 KB. Trimmed verbose prose (consolidated narration, dropped redundant context paragraphs) while preserving all seven mandatory sections and all D-09 category names. The references/ docs absorb the detail — that is exactly the SKILL.md ↔ references/ split CD-07 was designed for.
2. **agent-browser subcommands NOT pinned.** The skill points to "the installed agent-browser README" twice (Setup section and single-lead mode step 2). This is deliberate per D-04 and the CONTEXT.md "needs research" list: agent-browser's CLI shifts between versions, and pinning specific verbs in the skill would create a maintenance burden every time the user upgrades. The trade-off is the LLM has to read the README at invocation time; that's acceptable for a skill that already requires a real Chrome window and a signed-in LinkedIn session.
3. **POST /search documented even though the skill does not call it.** The plan acceptance criteria explicitly required this endpoint in heimdall-api.md. Surfaced it as a "Not called by the skill in the normal flow — documented for context" subsection, explaining that the UI's Retry button hits /search and re-queues failed leads for the next drain run. This closes the loop for a future maintainer reading the skill.
4. **Selector hints marked "hints, not guarantees."** Both the per-step selector blocks and the closing table say LinkedIn DOM shifts; the LLM should prefer a11y-tree text/role matching first. Pinning brittle selectors would have the same problem as pinning agent-browser subcommands — the skill would rot.
5. **No HTML companion mirror.** The user-global CLAUDE.md HTML-companion rule applies to `.planning/` only; `.claude/skills/` is out of contract (PATTERNS.md explicitly notes this). Plain markdown is the right output for files the LLM will read at runtime.

## Deviations from Plan

None — plan executed exactly as written.

The initial draft was longer than the plan's 6 KB target / 8 KB acceptance bound, but trimming verbose prose during verification was anticipated by the plan's action note ("trim later if it bloats the prompt") and is not a deviation. All seven mandatory sections, all 5 D-09 categories, all selector hints, all four endpoint sections, and the manual recovery checklist survived the trim.

## Issues Encountered

- **`.claude/settings.local.json` showed up untracked at commit time.** Not part of this plan's scope; ignored. It's a Claude Code local-config file the agent runtime writes — `.gitignore` likely catches it but the `?? .claude/settings.local.json` line appeared in `git status --short`. Did not stage it; only added the four skill files.
- **Husky pre-commit hook was not executable.** `hint: The '/Users/sbronstein/Github/heimdall/.husky/pre-commit' hook was ignored because it's not set as executable.` Pre-existing infrastructure observation, not a plan-caused issue. Both commits succeeded without the hook running. Not a blocker.

## Threat Model Verification

Per the plan's `<threat_model>`:

| Threat ID | Disposition | How it was mitigated in this plan |
|-----------|-------------|-----------------------------------|
| T-05-06-01 (info disclosure — bearer token in shell history) | mitigate | Every curl example in SKILL.md and heimdall-api.md uses `$(cat ~/.heimdall/api-token)` inline; the SKILL.md `## Constraints` section explicitly says "do NOT log the bearer token. Use `$(cat ~/.heimdall/api-token)` inline in curl so the resolved value never appears in shell history." Plaintext token is grep-zero across all four skill files (verified). |
| T-05-06-02 (tampering — reference doc drift from API contract) | mitigate | heimdall-api.md is the single source of truth for the skill's API calls and lives next to SKILL.md; if Plan 04 routes change in a future phase, this file is the one place the developer notices the contract drift. The 5-field ScrapedProspect, the state-machine transitions, the curl examples, and the error envelopes all match Plan 05-04 exactly. |
| T-05-06-03 (spoofing — skill against wrong Heimdall instance) | accept | heimdall-api.md pins the URL to `http://localhost:4000`; the user controls both `~/.heimdall/api-token` and the `API_TOKEN_HASH` in `.env.local`. Multi-instance scenarios are explicitly out of scope (per CONTEXT.md `<out_of_scope>`). |
| T-05-06-04 (repudiation — skill failures not surfaced) | mitigate | Every failure path in SKILL.md writes a categorized error via PATCH /status; the Plan 05-05 UI surfaces this to the user; the Plan 05-04 API emits a `job_lead_search_failed` timeline event for the audit trail. The plan's failure flow is enforced by the skill prompt body's `## Error handling` section. |

## Threat Flags

None — no new trust boundaries or attack surface introduced beyond what the plan's `<threat_model>` enumerated. The skill is a markdown-only artifact that the user invokes inside Claude Code; its only outbound communication is via the bearer-authenticated REST routes (already enumerated in Plan 05-02's threat model) and via agent-browser to LinkedIn (the same boundary the deleted Playwright path crossed).

## User Setup Required

Before invoking `claude /scrape-linkedin-connections`:

1. Run `npm run token:generate` once (from Plan 05-02) to write `~/.heimdall/api-token` and get the SHA-256 hash for `.env.local`.
2. Set `API_TOKEN_HASH=<hash>` and `SINGLE_USER_EMAIL=steve@bronstein.org` in `.env.local` (per Plan 05-02 setup).
3. Install `vercel-labs/agent-browser` per its README.
4. Open Chrome at `~/.heimdall/linkedin-profile/` and sign into LinkedIn (one-time, persists across runs).
5. Run `npm run dev` to start Heimdall on port 4000.
6. From the project root in Claude Code, invoke either:
   - `claude /scrape-linkedin-connections` (drain mode — process all `queued` leads)
   - `claude /scrape-linkedin-connections <job-lead-uuid>` (single-lead mode by ID)
   - `claude /scrape-linkedin-connections https://www.linkedin.com/jobs/view/<n>` (single-lead mode from URL — creates the lead first)

The skill loads SKILL.md as its prompt, parses `$ARGUMENTS`, and walks the LLM through the drain or single-lead flow, reading the references/ docs on demand.

## Next Phase Readiness

- **Plan 05-05 (UI):** Unaffected. The skill is invoked outside the web app; UI changes for `queued` / `failed` badges and the copy-skill-invocation button can land independently.
- **Plan 05-07 (deletion of `scrape-connections.ts` + `search-progress.tsx`):** Unblocked. The skill is the replacement for the deleted Playwright path; with the skill in place, the in-app scraper can be deleted.
- **Phase 6 (perf):** No interaction. The bulk-prospects route already does a single-statement insert (Plan 05-04 incidentally satisfies PERF-A1 for prospects); the skill is upstream of that route.

## Self-Check

Verified before this SUMMARY was committed:

- File `.claude/skills/scrape-linkedin-connections/SKILL.md` exists — **FOUND**.
- File `.claude/skills/scrape-linkedin-connections/references/linkedin-navigation.md` exists — **FOUND**.
- File `.claude/skills/scrape-linkedin-connections/references/heimdall-api.md` exists — **FOUND**.
- File `.claude/skills/scrape-linkedin-connections/references/troubleshooting.md` exists — **FOUND**.
- SKILL.md `^name: scrape-linkedin-connections$` — **FOUND** (line 2).
- SKILL.md `argument-hint:` — **FOUND** (line 4).
- SKILL.md 5 D-09 categories — **FOUND** (all five present in body).
- SKILL.md links to all 3 references — **FOUND** (5 link occurrences).
- nav.md 4-step nav headings — **FOUND** (`## Step 1` through `## Step 4`).
- nav.md `2nd-degree` mentions — **FOUND** (4 occurrences).
- api.md `POST /api/job-leads/[id]/prospects` — **FOUND**.
- api.md `API_TOKEN_HASH` + `SHA-256` — **FOUND** (auth section).
- api.md all 4 endpoints — **FOUND** (4 grep hits).
- ts.md all 5 categories — **FOUND** (counts ≥1 each).
- ts.md manual recovery section — **FOUND**.
- No YAML frontmatter in reference files — **CONFIRMED** (line 1 of each is `# <title>`).
- No plaintext 64-char hex token in any skill file — **CONFIRMED** (grep returns 0 matches).
- Commit `fb110c4` (Task 1 SKILL.md) — **FOUND** in `git log`.
- Commit `51dd18b` (Task 2 references) — **FOUND** in `git log`.

## Self-Check: PASSED

---
*Phase: 05-job-leads-completion*
*Plan: 06*
*Completed: 2026-05-14*
