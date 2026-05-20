---
phase: 10-connection-company-and-role-enrichment-for-triage
plan: "04"
subsystem: skill-docs
tags: [skill, linkedin, enrichment, batch-sweep, pacing, documentation]
dependency_graph:
  requires: [10-02-enrichment-rest-surface]
  provides: [scrape-linkedin-connections-enrichment-mode, paced-batch-sweep-mode, profile-page-nav-docs, pacing-docs]
  affects:
    - .claude/skills/scrape-linkedin-connections/SKILL.md
    - .claude/skills/scrape-linkedin-connections/references/heimdall-api.md
    - .claude/skills/scrape-linkedin-connections/references/linkedin-navigation.md
    - .claude/skills/scrape-linkedin-connections/references/troubleshooting.md
tech_stack:
  added: []
  patterns: [argument-parsing-first-match-wins, per-profile-error-isolation, bearer-auth-curl, pacing-randomized-delay]
key_files:
  created: []
  modified:
    - .claude/skills/scrape-linkedin-connections/SKILL.md
    - .claude/skills/scrape-linkedin-connections/references/heimdall-api.md
    - .claude/skills/scrape-linkedin-connections/references/linkedin-navigation.md
    - .claude/skills/scrape-linkedin-connections/references/troubleshooting.md
decisions:
  - "enrich keyword prefix routes to profile/sweep mode without colliding with existing bare-UUID job-lead branch"
  - "pacing section embedded directly in SKILL.md batch-sweep loop as inline comments, cross-referenced to troubleshooting.md"
  - "Profile-page path in linkedin-navigation.md is a sibling section (not inside Shared steps) because it is an independent flow that does not converge into the 2nd-degree filter path"
  - "Failure write-back for batch-sweep is logged inline (not PATCH job-lead status) because enrichment failures are contact-level, not lead-level"
metrics:
  duration: "~5 min"
  completed: "2026-05-20"
  tasks_completed: 2
  files_modified: 4
---

# Phase 10 Plan 04: Skill Enrichment Mode Extension Summary

Extended the existing `scrape-linkedin-connections` skill with a per-profile enrichment mode (navigate a connection's LinkedIn profile, extract company + role, write back via `PATCH /api/contacts/<id>/enrichment`) and a paced batch-sweep mode (fetch the enrichment queue, loop per-profile with randomized 20–90s delays and per-session cap, anti-bot back-off on checkpoint signals). Documented the pacing strategy in both SKILL.md and the troubleshooting reference.

## What Was Built

Two new modes added to the existing skill (not a new skill) and four reference docs updated:

1. **SKILL.md — Argument-parsing branches (enrich keyword):** Added branches 2–4 to the first-match-wins ladder. Bare `enrich` → batch-sweep mode. `enrich <uuid>` → per-profile mode by contact ID. `enrich <linkedin-profile-url>` (path starts with `/in/`) → per-profile mode by URL. Bare UUID (no prefix) still routes to the existing single-lead job-lead flow — no collision.

2. **SKILL.md — `## Profile-enrichment mode (single connection)`:** Mirrors the Single-lead mode shape: resolve contact → launch agent-browser → navigate to `/in/<slug>/` → extract `companyAtConnection` + `roleAtConnection` from the current/most-recent Experience block (best-effort, not historical) → write back via `PATCH /api/contacts/<id>/enrichment` using the bearer-auth curl pattern → confirm `{ success: true }`. Restates the no-direct-DB and no-token-logging constraints.

3. **SKILL.md — `## Batch-sweep mode (drain the enrichment backlog)`:** Modeled on Drain mode. Fetches `GET /api/contacts/enrichment-queue?limit=<cap>`, renders a markdown table, asks the user to confirm, loops per-profile running the profile-enrichment flow. Per-profile error isolation (failure → log inline, continue — do NOT abort sweep). PACING STRATEGY documented inline in the loop: 20–90s randomized delay (`RANDOM % 70 + 20`), per-session cap of 25–40 (the `limit` param), anti-bot back-off (first checkpoint → 120–300s delay; second consecutive checkpoint → end session early). Cross-references troubleshooting.md.

4. **`references/heimdall-api.md` — Endpoints 7 and 8:** `### 7. PATCH /api/contacts/[id]/enrichment` documents body (both fields max 300 chars, optional/nullable), side effects (`enrichmentStatus='enriched'`, `enrichedAt`, `updatedAt`, `contact_enriched` timeline event), response envelope, and bearer-auth curl block. `### 8. GET /api/contacts/enrichment-queue` documents the `limit` param (default 25, max 50), response shape (`{ queue: [{ id, linkedinUrl, firstName, lastName }], count }`), exclusion logic summary, and bearer-auth curl block.

5. **`references/linkedin-navigation.md` — `## Profile-page path`:** New sibling section covering slug derivation from `linkedinUrl`, navigation to `/in/<slug>/`, Experience section extraction with selector hints and fallback behaviors, best-effort caveat (not historical as-of-date reconstruction per CONTEXT.md §deferred), max 300 char truncation reminder, and pointer to heimdall-api.md §7 for write-back.

6. **`references/troubleshooting.md` — Pacing / anti-bot back-off subsection:** Added under `## LinkedIn navigation failed` (no sixth category). Documents the randomized inter-request delay range (20–90s, uniform random), per-session profile cap (25–40), first-checkpoint back-off (120–300s extended delay), two-consecutive-checkpoint early-exit protocol with user-facing message, sign-in drop handling, and session spacing recommendation (10–30 min after any checkpoint).

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Add per-profile enrichment mode + paced batch-sweep to SKILL.md | 182cf15 | .claude/skills/scrape-linkedin-connections/SKILL.md |
| 2 | Document enrichment endpoints, profile-page nav, pacing/back-off in references | 53af998 | references/heimdall-api.md, references/linkedin-navigation.md, references/troubleshooting.md |

## Verification

- `grep -c "enrichment-queue" SKILL.md` → 1 (confirmed)
- `grep -c "enrichment-queue" references/heimdall-api.md` → 2 (confirmed)
- `grep "## Profile-enrichment mode" SKILL.md` → found
- `grep "## Batch-sweep mode" SKILL.md` → found
- `grep -i pacing SKILL.md` → 3 matches including documented delay range
- Delay range `RANDOM % 70 + 20` (20–90s) present in SKILL.md batch-sweep loop
- `grep "## Profile-page path" references/linkedin-navigation.md` → found; contains `/in/` references
- `grep -i 'pacing|back-off|delay' references/troubleshooting.md` → 9 matches
- Exactly five `## \`` categories in troubleshooting.md (no sixth added)
- SKILL.md frontmatter description mentions profile-enrichment mode
- Write-back via REST PATCH only; SKILL.md restates no-direct-DB and no-token-logging constraints

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

This plan modifies documentation files only (`.md` skill files). No new network endpoints, auth paths, database schema changes, or file access patterns introduced beyond what the plan's `<threat_model>` documents. T-10-10 (pacing documentation), T-10-11 (token logging constraint restated), T-10-12 (no-direct-DB constraint restated), and T-10-13 (bearer-auth curl pattern used) are all addressed.

## Known Stubs

None. This plan is documentation-only; no code with placeholder values.

## Self-Check: PASSED

- SKILL.md exists and contains `## Profile-enrichment mode (single connection)` — FOUND
- SKILL.md exists and contains `## Batch-sweep mode (drain the enrichment backlog)` — FOUND
- SKILL.md contains `enrichment-queue` — FOUND (1 occurrence)
- SKILL.md contains pacing documentation with 20–90s delay range — FOUND
- references/heimdall-api.md contains `### 7. PATCH /api/contacts/[id]/enrichment` — FOUND
- references/heimdall-api.md contains `### 8. GET /api/contacts/enrichment-queue` — FOUND
- references/linkedin-navigation.md contains `## Profile-page path` referencing `/in/` — FOUND
- references/troubleshooting.md contains pacing/back-off/delay documentation — FOUND (9 matches)
- references/troubleshooting.md still has exactly 5 categories (no sixth added) — FOUND
- Commits 182cf15 and 53af998 exist — FOUND
