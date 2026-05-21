---
phase: quick-260521-dwi
plan: 01
subsystem: job-leads/recommendations
tags: [linkedin, ui, job-leads, contacts]
dependency_graph:
  requires: []
  provides: [linkedin-badge-recommendation-card]
  affects: [src/features/job-leads/components/recommendation-card.tsx, src/features/job-leads/components/recommendation-list.tsx]
tech_stack:
  added: []
  patterns: [conditional-anchor-badge, @tabler/icons-react]
key_files:
  modified:
    - src/features/job-leads/components/recommendation-list.tsx
    - src/features/job-leads/components/recommendation-card.tsx
decisions:
  - "Badge placement for contact: after closeness badge, inside existing flex items-center gap-2 row"
  - "Badge placement for prospect: inside left flex div after title span, not next to seniority badge"
  - "Copied exact triage-card className pattern for style consistency"
metrics:
  duration: "4 min"
  completed_date: "2026-05-21T14:03:57Z"
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 260521-dwi: Add LinkedIn Link Rectangle Next to Name — Summary

**One-liner:** LinkedIn anchor badge (icon + label, opens in new tab) added next to contact and prospect names on job lead detail page using the existing triage-card badge pattern.

## What Was Built

No schema, API, or fetch changes were needed — `linkedinUrl` was already present on both `Contact` and `Prospect` objects returned by the recommendations endpoint. This was purely a UI threading + rendering task.

**Task 1 — Thread props (recommendation-list.tsx):**
- Added `contactLinkedinUrl={rec.contact.linkedinUrl}` prop to `<RecommendationCard>`
- Added `linkedinUrl: p.prospect.linkedinUrl` to each item in the `prospects` map

**Task 2 — Render badge (recommendation-card.tsx):**
- Imported `IconBrandLinkedin` from `@tabler/icons-react`
- Extended `RecommendationCardProps` with `contactLinkedinUrl?: string | null` and `linkedinUrl?: string | null` on the prospects array item type
- Contact row: conditional LinkedIn anchor after closeness badge, renders only when `contactLinkedinUrl` is truthy
- Prospect row: conditional LinkedIn anchor after title span inside the left flex div, renders only when `p.linkedinUrl` is truthy
- Badge style matches triage-card exactly: `inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | b82fd4e | feat(quick-260521-dwi-01): thread linkedinUrl props into RecommendationCard |
| Task 2 | 48acb3d | feat(quick-260521-dwi-01): render LinkedIn badge for contacts and prospects in RecommendationCard |

## Deviations from Plan

None — plan executed exactly as written. The existing badge className from triage-card was copied verbatim; Tailwind class order matches prettier-plugin-tailwindcss conventions.

## Verification

- `npx tsc --noEmit` — passed, no type errors
- Grep checks: `IconBrandLinkedin` present, `contactLinkedinUrl` present, two `rel='noopener noreferrer'` occurrences confirmed

## Self-Check: PASSED

- [x] `src/features/job-leads/components/recommendation-list.tsx` — modified and committed (b82fd4e)
- [x] `src/features/job-leads/components/recommendation-card.tsx` — modified and committed (48acb3d)
- [x] Both commits exist in git log
- [x] No DB schema, migration, or API changes
- [x] No badge rendered when URL is null (conditional rendering)
