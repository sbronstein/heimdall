---
phase: 16-email-generation-skill
plan: "02"
subsystem: skill-references
tags: [skill, outreach, voice-guide, api-contract, documentation]
dependency_graph:
  requires: []
  provides:
    - .claude/skills/generate-outreach-emails/references/voice-guide.md
    - .claude/skills/generate-outreach-emails/references/heimdall-api.md
  affects:
    - .claude/skills/generate-outreach-emails/SKILL.md (plan 16-03 reads these)
tech_stack:
  added: []
  patterns:
    - Email-anatomy spec (Hey <FirstName> greeting, shared-history hook, soft ask, first-name sign-off)
    - LLM-tell scrub: blocking set (em/en-dashes, leverage, robust, generic openers) + advisory list
    - Anti-hallucination contract: generation-context payload is sole per-contact data source
    - Bearer-auth skill contract mirroring scrape-linkedin-connections pattern
key_files:
  created:
    - .claude/skills/generate-outreach-emails/references/voice-guide.md
    - .claude/skills/generate-outreach-emails/references/heimdall-api.md
  modified: []
decisions:
  - "voice-guide.md adapts cover-letter-style.md LLM-tell scrub but defines a completely different email anatomy (no company-addressed opener, no 3-paragraph arc, first-name-only sign-off)"
  - "blocking LLM-tell set: em/en-dashes + leverage + robust + generic openers; fuller cover-letter list is advisory-only"
  - "heimdall-api.md documents exactly 3 endpoints -- no more, no less -- mirroring scrape-linkedin-connections structure"
  - "generation-context call is ONE per run (stated explicitly as anti-N+1 rule); /generation sets status='generated' in a single call (D-02)"
metrics:
  duration: "~15 min"
  completed: "2026-06-22"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
---

# Phase 16 Plan 02: Reference Documents for generate-outreach-emails Skill Summary

**One-liner:** Voice-guide and API-contract reference docs for the email-generation skill: 1:1 networking email anatomy, tone-by-closeness, blocking LLM-tell scrub, anti-hallucination contract, and the 3-endpoint REST surface with bearer auth.

## What Was Built

Two leaf documents the `generate-outreach-emails` skill (Plan 16-03) reads at the start of every run:

### `voice-guide.md`

Defines the networking-email format Steve's voice follows:

- **Voice baseline (D-06):** always conversational; light closeness modulation (warmer for a friend, professional-warm for former colleagues, shorter for distant contacts). Lean on `howMet` and logged interactions more than the numeric `closeness` tier.
- **Email anatomy (D-07):** subject line (casual, specific, first-name or concrete hook); greeting `Hey <FirstName>,`; shared-history hook drawn only from contact brief; soft ask adapted from `goalInstruction`; sign-off `Steve` / `Thanks, Steve` (first name only).
- **Length by closeness:** 2-4 sentences for distant contacts, up to 2 short paragraphs for close ones.
- **Anti-hallucination contract (D-11/GEN-04):** reference only facts in the contact context + `steve-fact-bank.md`; `lowContext: true` contacts get short emails drawing only on `howMet`/company/role.
- **LLM-tell scrub (D-10):** blocking set (em/en-dashes, `leverage`, `robust`, generic openers) must pass before write-back; broader cover-letter banned-term list is advisory.

Explicitly excludes all cover-letter conventions: company-addressed opener, 3-paragraph arc, full-name sign-off, `.docx` conversion step.

### `heimdall-api.md`

Documents the REST surface the skill uses:

- **Auth:** `Authorization: Bearer $(cat ~/.heimdall/api-token)`, base `http://localhost:4000`, SHA-256+SINGLE_USER_EMAIL gate in `src/proxy.ts`, never log the token.
- **Envelope:** `{ success, data, error, meta }` with status-code table (200/400/401/404/500).
- **3 endpoints exactly:**
  1. `GET /api/outreach-campaigns/[id]/generation-context` -- called ONCE per run (explicit anti-N+1 rule), returns `goalInstruction` + `emails[]` with embedded contact brief + recent interactions + `lowContext` flag.
  2. `PATCH /api/outreach-campaigns/[id]/emails/[emailId]/generation` -- content write-back; sets `status='generated'` server-side in the same call (D-02); one call per email, not a content-then-status pair.
  3. `PATCH /api/outreach-campaigns/[id]/emails/[emailId]/status` -- failure write-back: `{ status:'failed', lastError }` with 500-char max; continue after failure (D-12).
- Curl example per endpoint, error-envelope handling table.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Surface Scan

No new runtime surface introduced. Both files are pure documentation; they describe how the skill crosses the existing REST boundary but add no executable code. The bearer-token "never log" directive is documented in `heimdall-api.md` per threat T-16-04.

## Known Stubs

None. These are reference documents with no data sources to wire.

## Self-Check

- [x] `.claude/skills/generate-outreach-emails/references/voice-guide.md` -- 212 lines, CREATED
- [x] `.claude/skills/generate-outreach-emails/references/heimdall-api.md` -- 248 lines, CREATED
- [x] Task 1 commit: 02a68ef
- [x] Task 2 commit: 2d9337e
- [x] voice-guide.md: greeting token present, no em/en dashes, howMet referenced, no cover-letter opener
- [x] heimdall-api.md: generation-context documented, bearer auth, localhost:4000, status:'failed' write-back

## Self-Check: PASSED
