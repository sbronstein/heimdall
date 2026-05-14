---
phase: 05-job-leads-completion
plan: 03
subsystem: planning-docs
tags: [requirements, supersession, html-companion, phase-5-reshape]
requires: []
provides: [JL-B1-defined, JL-B2-defined, JL-B3-defined, JL-B4-defined, JL-B5-defined]
affects: [.planning/REQUIREMENTS.md, .planning/views/REQUIREMENTS.html]
tech-stack:
  added: []
  patterns: [strikethrough-for-audit-trail, html-companion-mirror, nane-warm-earth-palette]
key-files:
  created: []
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/views/REQUIREMENTS.html
decisions:
  - "Used [~] strikethrough markdown (~~...~~) rather than removing JL-A1..A5 entries — preserves the audit trail per threat T-05-03-01"
  - "Kept the 'v1 Active requirements: 22 total' headline number; the count is unchanged (5 superseded, 5 added) but annotated parenthetically"
  - "HTML callout uses warm-earth #fbeee4 background with --warn (#b85a3a) left border — visually distinct from the .core-value (orange-bordered, gradient) and .badge-good (green)"
  - "Added a new .badge-superseded badge class (tan #ecdcd1 background, --warn text, italic) for the traceability table; not previously in the template"
metrics:
  duration: "~6 minutes"
  completed: 2026-05-13
  tasks: 2
  files_modified: 2
---

# Phase 5 Plan 03: REQUIREMENTS Supersession + JL-B Definitions + HTML Companion Summary

**One-liner:** Recorded the Phase 5 architectural pivot in REQUIREMENTS.md by superseding JL-A1..A5 (preserved with strikethrough for audit trail) and defining JL-B1..B5 mapped 1:1 to ROADMAP §Phase 5 (RESHAPED) Success Criteria; regenerated REQUIREMENTS.html companion using the nane warm earth-tone palette.

## What Shipped

### Task 1 — REQUIREMENTS.md updates (commit `5aedf0a`)
- Inserted a `> **SUPERSEDED 2026-05-13:** ...` blockquote immediately under the `### Job Leads Completion` heading explaining the in-app-scraper → Claude Code skill + agent-browser pivot.
- Wrapped JL-A1..A5 list items in Markdown strikethrough (`~~...~~`) so the historical requirement set stays visible but is visually muted.
- Appended JL-B1..JL-B5 as new `- [ ] **JL-Bx**: ...` checkbox items beneath the strikethrough block. Each is actionable and verifiable:
  - **JL-B1** — skill exists at `.claude/skills/scrape-linkedin-connections/` with arg-or-drain semantics
  - **JL-B2** — skill drives agent-browser through job → company → employees → 2nd-degree nav and extracts the existing `ScrapedProspect` shape
  - **JL-B3** — skill writes back via REST routes; in-app `scrape-connections.ts` + fire-and-forget IIFE + `search-progress.tsx` deleted
  - **JL-B4** — `queued` + `failed` enum values, `last_error` + `last_error_at` columns, state-machine enforced
  - **JL-B5** — UI: queued badge + Copy-skill-invocation button + categorized failure banner + retry → re-queue
- Traceability table: flipped JL-A1..A5 status from `Pending` to `SUPERSEDED`; appended five new JL-B1..B5 rows under `Phase 5 / Pending`.
- Updated Coverage block to annotate the count (`22 total (5 superseded; net 22 active, with JL-A1..A5 replaced by JL-B1..B5)`) without changing the headline number — the swap is 5-for-5.
- Footer last-updated line bumped to `2026-05-13 — JL-A1..A5 superseded by JL-B1..B5 for the Phase 5 reshape (Claude Code skill + agent-browser direction)`.

### Task 2 — REQUIREMENTS.html companion regenerated (commit `2cc4a33`)
- Added a `.callout` div (warm-earth `#fbeee4` background, `--warn` (`#b85a3a`) left border, italic body) above the Job Leads Completion list mirroring the markdown's SUPERSEDED blockquote text.
- Marked JL-A1..A5 `<li>` entries with a new `.superseded` class (`text-decoration: line-through; color: var(--muted)`; bullet replaced with `~` in `--warn` color) — visually mirrors the markdown strikethrough.
- Appended five JL-B1..B5 `<li>` entries with the existing `.active` styling (orange `☐` bullets) carrying the full markdown text verbatim.
- Traceability table: added a new `.badge-superseded` variant (tan `#ecdcd1` background, `--warn` text, italic) used on JL-A1..A5 rows; JL-B1..B5 rows use the existing `.badge-pending` style for consistency.
- Header tagline updated to `28 validated · 22 active (5 superseded, replaced) · 6 phases mapped`; Coverage meta line and footer note both reflect the 2026-05-13 reshape.
- Preserved the warm earth-tone palette intact (`--bg: #faf8f5`, `--accent: #6b8e6b`, `--accent-2: #c97a4a`, `--warn: #b85a3a`, `--line: #e4ddd2`, `--code-bg: #f4efe7`) per the user's global CLAUDE.md HTML-companion preference.
- Footer source-of-truth note preserved: markdown is canonical, HTML may lag behind.

## Verification

### Automated checks (all green)
```
grep -c "SUPERSEDED 2026-05-13" .planning/REQUIREMENTS.md            → 1
grep -cE "^\- \[ \] \*\*JL-B[1-5]\*\*" .planning/REQUIREMENTS.md     → 5
grep -cE "^\| JL-B[1-5] \| Phase 5 \| Pending \|$" REQUIREMENTS.md   → 5
grep -cE "^\| JL-A[1-5] \| Phase 5 \| SUPERSEDED \|$" REQUIREMENTS.md → 5
grep -c "JL-B" .planning/REQUIREMENTS.md                              → 13  (≥10 ✓)
grep -c "SUPERSEDED" .planning/REQUIREMENTS.md                        → 6   (≥6 ✓)
grep "\-\-bg: #faf8f5" .planning/views/REQUIREMENTS.html              → 1   (nane palette ✓)
JL-B1..B5 each appears in REQUIREMENTS.html                          → 5/5 found
SUPERSEDED 2026-05-13 callout in HTML                                → 1
JL-A1..A5 still present in HTML (with .superseded styling)           → 14 occurrences
```

### Confirmation against task acceptance criteria

**JL-A1..A5 visibly SUPERSEDED in list + traceability table.** Both surfaces:
- Markdown list: strikethrough on each item
- Markdown table: status column reads `SUPERSEDED` (not `Pending`)
- HTML list: `.superseded` class applied — line-through + muted color
- HTML table: `.badge-superseded` badge (tan with warn-color italic text)

**JL-B1..B5 present in list + traceability table.** Five new list items, five new table rows. Each verifiable by ID grep.

**REQUIREMENTS.html regenerated** — not "already up-to-date." The prior HTML had no callout, no `.superseded` styling, no `.badge-superseded` class, and listed JL-A1..A5 as active. All four are now present.

## Downstream Consumption

Downstream plan validators consume the new JL-B IDs via each plan's `requirements:` frontmatter array. Plans 05-01, 05-02, 05-04, 05-05, 05-06, and 05-07 reference one or more of `JL-B1..JL-B5`. The requirements gate in `gsd-sdk query requirements.*` greps for these IDs against `.planning/REQUIREMENTS.md` — that grep now succeeds. JL-A IDs in any downstream plan frontmatter would still resolve (the IDs remain visible in the markdown, just struck through and marked SUPERSEDED in the table), but no downstream plan in this phase references them.

## Deviations from Plan

None — plan executed exactly as written. No bugs found, no auth gates, no architectural decisions required.

## Self-Check: PASSED

- File `.planning/REQUIREMENTS.md`: FOUND (modified)
- File `.planning/views/REQUIREMENTS.html`: FOUND (modified)
- Commit `5aedf0a` (Task 1): FOUND in `git log --all`
- Commit `2cc4a33` (Task 2): FOUND in `git log --all`
- All acceptance criteria verified above with passing grep counts
- HTML companion preserves nane warm earth-tone palette CSS variables
- No modifications to STATE.md or ROADMAP.md (per parallel-executor contract)
