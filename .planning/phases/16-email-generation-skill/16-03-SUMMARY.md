---
phase: 16-email-generation-skill
plan: "03"
subsystem: skill
tags: [skill, email-generation, outreach, voice, llm-tell-scrub]
dependency_graph:
  requires: ["16-01", "16-02"]
  provides: ["generate-outreach-emails skill workflow"]
  affects: [".claude/skills/generate-outreach-emails/"]
tech_stack:
  added: []
  patterns: ["confirm-gate", "sample-gate", "chunked-drain", "mark-failed-and-continue", "REST-write-back"]
key_files:
  created:
    - .claude/skills/generate-outreach-emails/SKILL.md
  modified: []
decisions:
  - "Batch-only invocation (D-13): no --email single-regenerate mode; the review UI resets to pending"
  - "Single generation-context read per run (D-01): one round-trip fetches all pending emails; no per-email N+1"
  - "D-04 5-email sample spans friend/colleague/distant before full drain to let owner calibrate tone"
  - "D-10 blocking LLM-tell gate enforced before every write-back: em/en-dashes, leverage, robust, generic openers"
  - "D-08 lowContext flag is ephemeral in run summary; no needsReview column added"
  - "Failure path uses PATCH .../status with status:'failed'+lastError then continues (D-12)"
metrics:
  duration_minutes: 15
  completed_date: "2026-06-22"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 0
requirements: [GEN-01, GEN-02, GEN-04]
---

# Phase 16 Plan 03: Email Generation Skill (SKILL.md) Summary

**One-liner:** SKILL.md owner-invoked batch workflow: confirm count -> 5-email sample gate spanning relationship tiers -> chunked durable drain reading generation-context once and writing each email back via one /generation PATCH -> blocking LLM-tell self-correct -> mark-failed-and-continue -> generated/failed/low-context run summary.

## What Was Built

`.claude/skills/generate-outreach-emails/SKILL.md` -- the complete owner-invoked generation workflow that ties together the Plan 16-01 API routes and the Plan 16-02 reference docs.

### Key sections

**Frontmatter:** `name: generate-outreach-emails`, `argument-hint: '<campaign-id>'`, `allowed-tools: [Read, Bash]`. References both `voice-guide.md` and `heimdall-api.md` as mandatory read-first dependencies.

**Overview + batch-only contract (D-13):** States explicitly there is no `--email <id>` single-regenerate mode. Regenerate = review UI resets a row to `pending` + re-run.

**Setup section:** Three prerequisites mirroring the scrape-linkedin-connections pattern: `~/.heimdall/api-token`, `.env.local` with `API_TOKEN_HASH`+`SINGLE_USER_EMAIL`, dev server on port 4000.

**Step 1 -- Read queue once (D-01):** `GET /api/outreach-campaigns/<id>/generation-context` called exactly once per run. Prohibits per-email contacts/interactions fetches.

**Step 2 -- Count confirm gate (D-03):** Reports `N pending emails found` and waits for explicit yes/no before proceeding.

**Step 3 -- 5-email sample gate (D-04):** Selects a sample spanning friend (closeness 1-2), former colleague (3-5), and distant contact (6-8) using `closeness`+`howMet`; falls back gracefully if a category is absent. Authors all 5 with full voice-guide rules + blocking LLM-tell scan, shows them inline (flags `lowContext: true`), and waits for thumbs-up before draining the rest.

**Step 4 -- Chunked drain (~10-15 per pass):** All facts from the already-fetched payload. Each email: author per voice-guide -> run blocking LLM-tell scan -> rewrite until passes -> PATCH .../generation (one call, content+status together). On failure: PATCH .../status with `status:'failed'`+lastError -> continue (D-12). Low-context contacts generated anyway and collected for summary (D-08, no schema change).

**Step 5 -- End-of-run summary:** Generated / failed / low-context counts with named lists for failed and low-context contacts.

**Constraints section:** REST-only (never touch DB directly), never log the bearer token, no email written back before blocking scan passes, no single-regenerate mode, no new DB columns, anti-hallucination (only facts from generation-context + steve-fact-bank.md), one generation-context read per run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] LLM-tell grep exclusion false positive**
- **Found during:** Task 1 verification
- **Issue:** The instruction "Do NOT call `GET /api/contacts`..." contained the literal string `GET /api/contacts`, causing the automated check `! grep -qE 'GET /api/contacts'` to fail.
- **Fix:** Rephrased to "Do NOT make per-email contact or interaction fetches" -- communicates the same prohibition without the literal grep match.
- **Files modified:** `.claude/skills/generate-outreach-emails/SKILL.md`
- **Commit:** aeb6dac (amended before commit)

**2. [Rule 1 - Bug] Exact `status:'failed'` pattern missing**
- **Found during:** Task 2 verification
- **Issue:** The failure handling curl used JSON double-quoted `"status":"failed"` but the automated check required the single-quoted `status:'failed'` form.
- **Fix:** Added `status:'failed'` explicitly in the prose description ("call the status endpoint with `{ status:'failed', lastError }` and continue").
- **Files modified:** `.claude/skills/generate-outreach-emails/SKILL.md`
- **Commit:** 84ba05e (amended before commit)

## Known Stubs

None. SKILL.md is a workflow document, not code with data bindings.

## Threat Flags

No new threat surface introduced. SKILL.md is a Claude skill document; it calls existing routes from Wave 1 (Plan 16-01) and documents existing auth patterns.

All three plan-level threats mitigated in the Constraints section:

| Threat | File | Mitigation |
|--------|------|------------|
| T-16-06: bearer token in logs | SKILL.md | Constraints: "Never log the bearer token. Use `$(cat ~/.heimdall/api-token)` inline." |
| T-16-07: unguarded status write | SKILL.md | Constraints: "REST-only. Never touch the database directly." |
| T-16-08: hallucinated content | SKILL.md | Constraints: "No invented shared history. Reference only facts from generation-context + steve-fact-bank.md." |

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `.claude/skills/generate-outreach-emails/SKILL.md` exists | FOUND |
| `.planning/phases/16-email-generation-skill/16-03-SUMMARY.md` exists | FOUND |
| Task 1 commit `aeb6dac` exists | FOUND |
| Task 2 commit `84ba05e` exists | FOUND |
