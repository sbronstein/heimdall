---
phase: 15-review-and-approval-ui
verified: 2026-06-21T15:45:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Navigate to /dashboard/outreach/[id] for a campaign that has emails in mixed statuses"
    expected: "Each email renders as a card showing contact name, status badge, and (when generated) subject and body; pending emails show 'Awaiting generation'"
    why_human: "Visual rendering of the card list cannot be verified by grep or tsc"
  - test: "Click Edit on a generated email, change subject and body, click Save"
    expected: "Save issues a PATCH to /api/outreach-campaigns/[id]/emails/[emailId], card updates to show new content, status badge advances to 'edited', header progress re-renders"
    why_human: "Interactive state transitions and live fetch behavior require a running browser"
  - test: "Inspect a campaign with an archived contact; observe the Approve button on that contact's card"
    expected: "Button renders as disabled; clicking it has no effect; an 'archived' destructive badge appears on the card"
    why_human: "Disabled-button rendering and archived-badge appearance require visual inspection"
  - test: "Click Approve on a generated email with content and a non-archived contact"
    expected: "Status advances to 'approved', header counter increments (e.g. 1 / 5 approved), no page reload"
    why_human: "Optimistic state update and header counter change require live browser interaction"
  - test: "Click Regenerate on a generated or edited email and confirm the dialog"
    expected: "window.confirm appears warning that edits will be cleared; on confirm, status resets to 'pending', card shows 'Awaiting generation'"
    why_human: "window.confirm and subsequent card state reset require browser execution"
  - test: "Inspect a contact card whose contact has no stored email and channel is 'email'"
    expected: "Card shows a 'needs LinkedIn message' secondary badge"
    why_human: "Badge rendering for the no-email case requires visual inspection with real data"
---

# Phase 15: Review and Approval UI — Verification Report

**Phase Goal:** The owner can review generated email content for each contact in a campaign, edit it inline, and approve or regenerate individual emails from the browser
**Verified:** 2026-06-21T15:45:00Z
**Status:** human_needed (all automated checks pass; UI interactions require browser verification)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Campaign review page lists every email with status and (when generated) subject + body | VERIFIED | `campaign-review-page.tsx` maps `rows` to `<EmailReviewCard>` list; RSC page.tsx leftJoins emails+contacts in one query and passes to component |
| 2  | Owner can edit a generated email's subject and body inline; save advances status to `edited` | VERIFIED | `email-review-card.tsx` PATCH `/emails/${email.id}` with `editedSubject`/`editedBody`; server `route.ts` auto-transitions `generated|approved → edited` when edit fields written |
| 3  | Approve button is disabled for archived contacts; approval is also blocked server-side | VERIFIED | `disabled={isSaving \|\| !canApproveEmail(email, contact)}`; `canApproveEmail` checks `isArchived`; `status/route.ts` performs separate SELECT on `contacts.archivedAt` and returns `validationError('Cannot approve: contact is archived')` before `db.update` |
| 4  | Owner can regenerate a single email, resetting it to `pending` | VERIFIED | Regenerate button disabled when `!canRegenerate(email)`; on confirm: PATCH `/status` `{ status: 'pending' }`; server clears `editedSubject/editedBody/lastError/generatedAt` on `→ pending` transition |
| 5  | No-email contacts show "needs LinkedIn message" badge; header shows approved/total progress | VERIFIED | `needsLinkedinMessage` badge rendered for `linkedin_message` channel OR no `recipientEmail` AND no `contact.email`; `approvedCount` (tallies `approved + drafted`) drives `{approved} / {total} approved` in header |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/features/outreach/lib/review-helpers.ts` | Pure helpers: finalSubject, finalBody, hasContent, needsLinkedinMessage, isArchived, canApproveEmail, canRegenerate, approvedCount | VERIFIED | All 8 functions exported; imports `canEmailTransition` from `email-status.ts` — no duplicate transition table |
| `src/features/outreach/lib/review-helpers.test.ts` | Vitest coverage for pure helpers | VERIFIED | 27 tests, all passing; covers edited-over-generated precedence, needsLinkedinMessage all trigger cases, canApproveEmail archived/no-content/status gates, approvedCount approved+drafted tally |
| `src/features/outreach/components/email-review-card.tsx` | Interactive per-email card: `'use client'`, edit/approve/regenerate, badges | VERIFIED | Exports `EmailReviewCard`; `'use client'` at top; full edit mode with Input/Textarea; Approve disabled via `canApproveEmail`; both badge types rendered conditionally |
| `src/app/api/outreach-campaigns/[id]/emails/[emailId]/status/route.ts` | Server-side archived approve gate | VERIFIED | SELECT `{ archivedAt }` from contacts WHERE `contacts.id = email.contactId`; returns `validationError('Cannot approve: contact is archived')` when `archivedAt != null`; runs after content guard, before `db.update` |
| `src/app/api/outreach-campaigns/[id]/emails/[emailId]/route.ts` | editedBody max(50000) bound | VERIFIED | `inlineEditSchema`: `editedBody: z.string().max(50000).optional().nullable()`; editedSubject max(500) and recipientEmail email() unchanged |
| `src/features/outreach/components/campaign-review-page.tsx` | `'use client'` container: progress header + EmailReviewCard list + optimistic state | VERIFIED | `useState` seeded from `initialEmails` prop; `useCallback onEmailUpdated` replaces matching row on `updated.id`; `approvedCount` over live rows drives `{approved} / {total}` header |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `email-review-card.tsx` | `/api/outreach-campaigns/[id]/emails/[emailId]` | `fetch PATCH` (inline edit) | WIRED | Line 63: `fetch(\`/api/outreach-campaigns/${campaignId}/emails/${email.id}\`, { method: 'PATCH', ... })` |
| `email-review-card.tsx` | `/api/outreach-campaigns/[id]/emails/[emailId]/status` | `fetch PATCH` (approve + regenerate) | WIRED | Lines 94-101 (approve), 125-132 (regenerate): both PATCH to `.../status` |
| `email-review-card.tsx` | `review-helpers.ts` | import `canApproveEmail`, `canRegenerate`, `finalSubject`, `finalBody`, `isArchived`, `needsLinkedinMessage` | WIRED | Lines 12-18: explicit named imports; all 6 functions actively used in render |
| `campaign-review-page.tsx` | `email-review-card.tsx` | renders `<EmailReviewCard>` per row, passes `onEmailUpdated` | WIRED | Lines 87-93: `rows.map(row => <EmailReviewCard ... onEmailUpdated={onEmailUpdated} />)` |
| `campaign-review-page.tsx` | `review-helpers.ts` | `approvedCount` for progress header | WIRED | Line 49: `const approved = approvedCount(rows.map((r) => r.email))` |
| `status/route.ts` | `contacts.archivedAt` | join/lookup of email's contact in approve branch | WIRED | Lines 56-64: `db.select({ archivedAt: contacts.archivedAt }).from(contacts).where(eq(contacts.id, email.contactId)).limit(1)` |
| `src/app/dashboard/outreach/[id]/page.tsx` | `CampaignReviewPage` | RSC passes `campaign` + `emails` (leftJoin) | WIRED | Line 10: imports `CampaignReviewPage`; line 29-33: `leftJoin(contacts, ...)` fetches joined rows; line 37: passes `emails={emails}` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `campaign-review-page.tsx` | `rows` (email+contact state) | RSC `page.tsx` leftJoin `outreachEmails → contacts` | Yes — `db.select({ email: outreachEmails, contact: contacts }).from(outreachEmails).leftJoin(...)` | FLOWING |
| `email-review-card.tsx` | `subject`, `body` | `finalSubject(email)` / `finalBody(email)` from `OutreachEmail` prop | Yes — derives from `editedX ?? generatedX` on the actual DB row | FLOWING |
| `campaign-review-page.tsx` `approved` counter | `approvedCount(rows.map(r => r.email))` | Server-returned `OutreachEmail.status` after API mutations | Yes — `onEmailUpdated` stores only the server-returned row; state never fabricated client-side | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 27 pure helper tests pass | `npx vitest run src/features/outreach/lib/review-helpers.test.ts` | 27 passed, 0 failed, exit 0 | PASS |
| TypeScript clean across all phase 15 files | `npx tsc --noEmit` | No errors (npm config warning only) | PASS |
| Commit hashes from summaries exist in git | `git log --oneline d48b3c9 78c0cb0 1695a3f 4a633a8 0890f46 2aba3fd` | All 6 commits present and match summary descriptions | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| REV-01 | 15-01, 15-03 | User can review each generated email (subject + body) in the UI | MET | `campaign-review-page.tsx` renders one `EmailReviewCard` per email; card shows `finalSubject`/`finalBody` or "Awaiting generation" for pending |
| REV-02 | 15-01 | User can edit a generated email inline (subject and body) | MET | Edit button toggles edit mode with Input/Textarea; PATCH to inline-edit route; auto-transition to `edited` server-side |
| REV-03 | 15-01 | User can regenerate a single email (resets to `pending`) | MET | Regenerate button (disabled when `!canRegenerate`); confirm dialog; PATCH `/status { status: 'pending' }` |
| REV-04 | 15-01, 15-02 | User can approve an email; approve gate enforced | MET | UI: `disabled={!canApproveEmail(email, contact)}`; server: content guard + archived check before `db.update` |
| REV-06 | 15-01, 15-02 | No-email badge; archived badge blocks approval | MET | `needsLinkedinMessage` badge (secondary); `isArchived` badge (destructive); server rejects approve on archived contact |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | No TBD/FIXME/XXX markers; no return null/return []/return {} in any phase 15 file; no hardcoded empty state flows to rendering |

### Human Verification Required

The automated checks (TypeScript, Vitest, wiring grep) are fully passing. The following require a running browser because they involve visual rendering and live interaction:

#### 1. Email Card List Rendering

**Test:** Navigate to `/dashboard/outreach/[id]` for a campaign that has emails in multiple statuses (pending, generated, edited, approved)
**Expected:** Each email renders as a Card showing contact name + company, status badge, and — when generated — subject and body. Pending cards show "Awaiting generation" placeholder. No crashes.
**Why human:** Visual rendering of the card list and placeholder text cannot be verified by grep or tsc.

#### 2. Inline Edit Full Round-Trip

**Test:** Click Edit on a generated email, modify the subject and body, click Save
**Expected:** Inputs are pre-seeded with current content; Save issues a PATCH; card updates to show the new text; status badge changes from "generated" to "edited"; no page reload; header approved counter is unaffected
**Why human:** Interactive state transitions, fetch call in flight, and optimistic state update require a live browser

#### 3. Archived Contact Approve Gate (Visual)

**Test:** Find a campaign with a contact whose `archivedAt` is set; observe that contact's EmailReviewCard
**Expected:** Approve button renders visibly disabled; an "archived" destructive badge appears next to the status badge; clicking the button has no effect
**Why human:** Button visual disabled state and badge appearance require visual inspection

#### 4. Approve Action + Progress Counter Update

**Test:** Click Approve on a generated email with content and a non-archived contact
**Expected:** Status badge changes to "approved"; the header `X / Y approved` counter increments immediately (no reload); the Approve button becomes disabled
**Why human:** Optimistic local state update driving the progress counter cannot be verified without running the component

#### 5. Regenerate with Confirmation Dialog

**Test:** Click Regenerate on an edited email, observe the confirm dialog, accept it
**Expected:** `window.confirm` appears warning that edits will be cleared; on accept, status resets to "pending", subject/body disappear and "Awaiting generation" placeholder appears; header counter unchanged
**Why human:** `window.confirm` interaction and subsequent card state reset require browser execution

#### 6. Needs-LinkedIn-Message Badge

**Test:** View a card for a contact with no stored email address and `channel = 'email'`
**Expected:** A "needs LinkedIn message" secondary badge appears alongside the status badge
**Why human:** Badge conditional rendering requires real data with no email to verify visually

### Gaps Summary

None. All automated must-haves pass. No stubs, missing artifacts, or broken links detected. The phase is ready for browser UAT.

---

## Browser UAT — SIGNED OFF (2026-06-21)

All 6 human-verification items confirmed in the running dev server against a
throwaway fixture campaign (4 crafted emails: generated/edited/archived-contact/
linkedin-message; since removed, zero real data touched).

| # | Check | Req | Result |
|---|-------|-----|--------|
| 1 | Card list + progress header render | REV-01 | ✅ pass |
| 2 | Inline edit round-trip persists; `final = edited ?? generated` | REV-02 | ✅ pass |
| 3 | Needs-LinkedIn badge on linkedin_message / no-email card | REV-06 | ✅ pass |
| 4 | Archived badge + Approve disabled on archived contact | REV-04/REV-06 | ✅ pass |
| 5 | Approve action increments header counter reactively | REV-04 | ✅ pass |
| 6 | Regenerate confirm dialog → status returns to pending | REV-03 | ✅ pass |

**Verdict: PASS — Phase 15 fully signed off.**

---

_Verified: 2026-06-21T15:45:00Z_
_Verifier: Claude (gsd-verifier)_
_UAT signed off: 2026-06-21 by Steve (6/6 checks)_
