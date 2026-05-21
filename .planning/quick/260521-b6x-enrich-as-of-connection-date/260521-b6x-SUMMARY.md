---
phase: quick-260521-b6x
plan: 01
subsystem: skill-docs
tags: [skill, linkedin, enrichment, documentation]
dependency_graph:
  requires: []
  provides: [scrape-linkedin-connections/SKILL.md, scrape-linkedin-connections/references/linkedin-navigation.md]
  affects: [batch-sweep-mode, profile-enrichment-mode]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - .claude/skills/scrape-linkedin-connections/SKILL.md
    - .claude/skills/scrape-linkedin-connections/references/linkedin-navigation.md
decisions:
  - "Navigate to /details/experience/ (full history page) for date-matching instead of bare profile header"
  - "Three fallbacks documented: predates earliest role → null; employment gap → closest prior + flag; concurrent → primary + note"
  - "linkedinConnectionDate null → fall back to most-recent role and note limitation"
metrics:
  duration: ~10 min
  completed: 2026-05-21
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 260521-b6x: Enrich As-Of Connection Date — Summary

**One-liner:** Updated skill docs so profile-enrichment reconstructs company/role AS OF `linkedinConnectionDate` via `/details/experience/`, with date-matching algorithm and three fallbacks.

## What Was Done

The `scrape-linkedin-connections` skill contained a contradiction: its Overview and the product intent said "the company and role they held at the time of connection," but the Step 4 implementation said "best-effort current/most-recent — NOT historical as-of-date reconstruction; see CONTEXT.md §deferred." The owner has validated the as-of-date method in practice; this quick task corrects the documentation to match the real extraction semantics.

### Task 1: SKILL.md Profile-enrichment Steps 3-4 (commit `907a60a`)

- Removed the "or most recently before" hedge from the section intro.
- Updated Step 3 navigation target from `https://www.linkedin.com/in/<slug>/` to `https://www.linkedin.com/in/<slug>/details/experience/` (full experience history, not just the top card).
- Added Step 3b to fetch `linkedinConnectionDate` via `GET /api/contacts/$CONTACT_ID`.
- Rewrote Step 4 entirely with the date-matching algorithm: parse all entries, match span containing connection date, handle grouped sub-roles (sub-role title + parent company name).
- Documented three fallbacks: (a) predates earliest role → null both + log; (b) employment gap → closest prior role + flag; (c) concurrent overlap → primary/full-time + note.
- Updated selector hints table to point at the experience list and date-range text rather than the first experience item.
- Added one-line note in batch-sweep Step 3 that each profile uses its own `linkedinConnectionDate`.

### Task 2: linkedin-navigation.md Profile-page path (commit `1b237c6`)

- Updated Profile-page Step 1 to construct `/details/experience/` URL instead of bare `/in/<slug>/`.
- Rewrote Step 2 goal/outcome to reflect landing on the full experience-history list with per-role date ranges.
- Added Step 2b to read `linkedinConnectionDate` via `GET /api/contacts/<id>` (cross-references `heimdall-api.md`).
- Rewrote Step 3 with the same date-matching algorithm and all three fallbacks.
- Reframed selector hints table for experience list entries (role title, company name, date range).
- Removed all "current/most-recent", "CONTEXT.md §deferred", and "out of scope" framing.
- Preserved: Profile-page Step 4 write-back, 300-char max-length note, null-safe partial write behavior, "Does NOT converge into Shared" note.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

Both automated verify commands printed `PASS`:

```
# Task 1
grep -ciE "current/most-recent|CONTEXT\.md.{0,5}deferred|most recently before" SKILL.md → 0
grep -qi "linkedinConnectionDate" SKILL.md → found
grep -qi "details/experience" SKILL.md → found

# Task 2
grep -ciE "current/most-recent|CONTEXT\.md.{0,5}deferred" linkedin-navigation.md → 0
grep -qi "details/experience" linkedin-navigation.md → found
grep -qi "linkedinConnectionDate" linkedin-navigation.md → found
grep -qiE "predates|employment gap|concurren" linkedin-navigation.md → found
```

## Known Stubs

None — documentation only.

## Threat Flags

None — no code or API changes.

## Self-Check: PASSED

- `.claude/skills/scrape-linkedin-connections/SKILL.md` — modified, committed at `907a60a`
- `.claude/skills/scrape-linkedin-connections/references/linkedin-navigation.md` — modified, committed at `1b237c6`
- Both commits exist on branch `worktree-agent-aa60a2251e1414168`
