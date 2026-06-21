---
status: partial
phase: 14-campaign-builder-ui
source: [14-VERIFICATION.md]
started: 2026-06-21T11:55:00Z
updated: 2026-06-21T11:55:00Z
---

# Phase 14: Campaign Builder UI — Human UAT

All 16 code-level must-haves passed automated verification (`14-VERIFICATION.md`, score 16/16).
The 8 items below are interactive browser/DB checks that static analysis cannot confirm — they
are the expected UAT pass for a UI-heavy phase, **not** implementation gaps. Run `npm run dev`
(port 4000) and walk through each. Mark `[x]` as you confirm. Phase stays `pending` until all pass.

## UAT Scenarios

- [ ] **U1 — Sidebar nav + list landing.** Navigate to `/dashboard/outreach`.
  *Expected:* Sidebar shows **Outreach** between Job Leads and Contacts with the mail icon; clicking lands on the campaign list (or empty state).

- [ ] **U2 — Four filters compose live.** On `/dashboard/outreach/new`, apply each filter (howMet text, connection-year range, closeness tier, outreach status) individually and combined.
  *Expected:* Each narrows independently; all four active = intersection; changing filters does NOT clear already-checked contacts (D-03).

- [ ] **U3 — Selection persists across filters.** Check several contacts, change the filter so they leave the visible list.
  *Expected:* Tray still shows "N selected" and the now-hidden contacts remain in the tray (D-03/D-09).

- [ ] **U4 — Select-all unions.** Check 3 contacts, switch filter, click "Select all X matching".
  *Expected:* The filtered set is ADDED to the existing 3, not replacing them (D-08).

- [ ] **U5 — End-to-end save.** Fill campaign name, select ≥1 contact, click Save Campaign.
  *Expected:* Two sequential POSTs (create campaign, then bulk-add emails); redirect to `/dashboard/outreach/[id]` showing the name and added contacts with `pending` badges.

- [ ] **U6 — Save gated.** Try to save with blank name or zero contacts.
  *Expected:* Save Campaign button disabled until both conditions met (D-14/CD-01).

- [ ] **U7 — Double-submit protection.** Click Save Campaign twice rapidly while POSTs are in-flight.
  *Expected:* Only one campaign created; button disables during the request (CD-01).

- [ ] **U8 — 404 on missing campaign.** Visit `/dashboard/outreach/<nonexistent-uuid>`.
  *Expected:* Next.js `notFound()` renders the standard 404 page.

## Sign-off

When all 8 pass, re-run `/gsd:execute-phase 14` (or `/gsd:verify-work 14`) so verification flips to `passed` and the phase closes.
