---
phase: 17-gmail-drafting-and-email-discovery-skill
verified: 2026-06-22T22:43:32Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run draft-outreach-emails against a campaign with an approved email that has a stored recipientEmail — confirm a draft appears in Gmail, the email row shows status='drafted' and gmailDraftId set, the contact shows outreachStatus='reached_out', and a timeline event of type outreach_email_drafted appears"
    expected: "Gmail draft visible; email row: status=drafted, gmailDraftId=non-null; contact: outreachStatus=reached_out; timeline event logged"
    why_human: "Requires live Gmail MCP connection and a real approved email row — cannot verify Gmail draft creation or the four-effect atomicity end-to-end without a live session"
  - test: "Run draft-outreach-emails against a campaign where at least one approved email has no stored recipientEmail but the contact has a shared Gmail thread — confirm exactly one distinct address is discovered and written back, the email is drafted in the same run"
    expected: "recipientEmail written back via PATCH .../recipient; Gmail draft created in same run; email status=drafted"
    why_human: "Gmail thread search (mcp__gmail__search_threads + get_thread) cannot be invoked without a live Gmail MCP session"
  - test: "Run draft-outreach-emails against a campaign where an approved email's contact has no discoverable Gmail thread — confirm the email's channel is set to linkedin_message and the contact appears in the LinkedIn fallback section of the run summary (not silently dropped)"
    expected: "channel=linkedin_message on the email row; contact listed in LinkedIn fallback summary; no draft created"
    why_human: "Requires live Gmail MCP to confirm zero threads are returned for the contact"
  - test: "Re-run draft-outreach-emails against the same campaign used in the first human test — confirm zero duplicate drafts are created (already-drafted emails do not appear in the approved queue and are not re-processed)"
    expected: "Skill reports 0 drafted on re-run (or drafts only emails still in approved state); no new Gmail drafts for already-drafted emails"
    why_human: "Requires two sequential live runs to confirm idempotency end-to-end"
  - test: "Supply CAMPAIGN_ID and EMAIL_ID (non-approved email) to scripts/verify-draft-route.sh with the dev server running — confirm it prints PASS (HTTP 400 + Invalid transition)"
    expected: "Script exits 0; output shows PASS: HTTP 400 + 'Invalid transition' confirmed"
    why_human: "Script requires a live dev server on port 4000 and a real non-approved email row; cannot be run without those preconditions"
---

# Phase 17: Gmail Drafting and Email Discovery Skill — Verification Report

**Phase Goal:** Approved emails are pushed to Gmail as drafts (never sent), contacts without stored emails have addresses discovered from Gmail thread history, and LinkedIn-only contacts are clearly flagged.
**Verified:** 2026-06-22T22:43:32Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

All five must-have truths are VERIFIED at the code level. Live Gmail-MCP behavior cannot be verified without an interactive session (see Human Verification Required).

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | D-01: the /draft route does all four effects atomically — gmailDraftId stored, status=drafted (canEmailTransition-gated), contact outreachStatus=reached_out, timeline event with contactId | ✓ VERIFIED | Route at lines 27–72: pre-read SELECT scoped by (emailId, campaignId); canEmailTransition guard returns 400 on non-approved; email UPDATE sets gmailDraftId+status+draftedAt+updatedAt; contact UPDATE sets outreachStatus=reached_out+updatedAt; logTimeline with contactId: email.contactId |
| 2 | D-03: SKILL.md discovery accepts ONLY a single direct-thread participant matched by name; ≥2 distinct → ambiguous (no guess, no forced linkedin); 0 → linkedin fallback; CANDIDATE_ADDRESSES reset per contact | ✓ VERIFIED | SKILL.md lines 248–315: CANDIDATE_ADDRESSES=() reset at start of each contact's iteration (WR-01 fix); grep -qiF for fixed-string name matching (WR-03 fix); exactly-1-distinct → PATCH recipient + add to DRAFTING_QUEUE (IN-01 fix); ≥2 → AMBIGUOUS_LIST (recipientEmail left unset, DO NOT force linkedin); 0 → PATCH {channel:'linkedin_message'} + LINKEDIN_FALLBACK_LIST |
| 3 | DISC-03 / D-04b: no email by any method → PATCH .../recipient {channel:'linkedin_message'}; contact never silently dropped; all branches (skip/ambiguous/archived) reported in run summary | ✓ VERIFIED | SKILL.md Step 3c zero-address path (lines 326–339): curl PATCH {channel:'linkedin_message'}; Step 5 summary (lines 463–484): all counters present — DRAFTED_COUNT, SKIPPED_LIST, DISCOVERED_COUNT, AMBIGUOUS_LIST, LINKEDIN_FALLBACK_LIST, FAILED_LIST; initialization block at lines 130–136 (IN-02 fix) |
| 4 | D-02 / DRFT-03: idempotent — already-drafted never reappear in approved queue; edited-after-draft (approved + stale gmailDraftId) → create-and-repoint via fresh draft; discovered emails added to drafting queue in same run | ✓ VERIFIED | SKILL.md Step 4b (lines 385–395): gmailDraftId IS NULL → new draft; non-null → DRAFT_ACTION=redraft (fresh create + repoint via /draft); DRAFTING_QUEUE append after successful discovery write-back (lines 300–304, IN-01 fix); approved queue filters to status=approved so drafted emails never appear |
| 5 | DRFT-02 / D-06: allowed-tools lists ONLY the four safe Gmail tools; pre-run grep gate targets mcp__gmail__ send-family TOOL TOKENS; zero send-family tokens exist in skill dir | ✓ VERIFIED | SKILL.md frontmatter: exactly {Read, Bash, mcp__gmail__search_threads, mcp__gmail__get_thread, mcp__gmail__create_draft, mcp__gmail__list_drafts}; grep gate (lines 506–513) uses grep -rinE "mcp__gmail__(send|send_message|trash|delete|import|update_draft|modify|insert)" targeting MCP tokens not prose (CR-01 fix); live grep of skill dir returns ZERO matches |

**Score:** 5/5 truths verified

---

### Deferred Items

None. All five success criteria are addressed in this phase.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|---------|--------|---------|
| `src/app/api/outreach-campaigns/[id]/emails/[emailId]/draft/route.ts` | Atomic draft write-back: canEmailTransition guard + status=drafted + contact outreachStatus=reached_out + timeline event | ✓ VERIFIED | 82 lines; all four D-01 effects present; pre-read SELECT scoped by (emailId, campaignId); contactId from pre-read row, not body (T-17-02 mitigation); 2x updatedAt: new Date() (email + contact); TypeScript compiles clean (tsc --noEmit exits 0) |
| `.claude/skills/draft-outreach-emails/SKILL.md` | Discover-then-draft batch workflow, idempotency, send-safety allowlist + grep gate, run summary | ✓ VERIFIED | 532 lines (well above min_lines: 200); all code-level acceptance criteria confirmed by grep; all 8 REVIEW.md findings fixed (WR-01, WR-02, WR-03, IN-01, IN-02 confirmed in file content) |
| `.claude/skills/draft-outreach-emails/references/heimdall-api.md` | REST API contract for the draft-outreach-emails skill | ✓ VERIFIED | 378 lines (above min_lines: 120); documents all 4 endpoints; approved→failed ILLEGAL documented explicitly; pagination loop with limit=100 + hasMore; no literal bearer token; all acceptance criteria pass |
| `scripts/verify-draft-route.sh` | Re-runnable curl regression for state-machine guard (rejection path + happy path) | ✓ VERIFIED | Exists; bash -n exits 0; token read inline via cat; 400 assertion + "Invalid transition" check present; Test 2 (happy path, IN-04 fix) added with skip-if-env-absent behavior |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `draft/route.ts` | `email-status.ts` | `import { canEmailTransition }` | ✓ WIRED | Line 10: `import { canEmailTransition } from '@/features/outreach/lib/email-status'`; called at line 38: `canEmailTransition(email.status, 'drafted')` — count 2 confirmed |
| `draft/route.ts` | `drizzle/schema (contacts)` | `db.update(contacts).set({ outreachStatus: 'reached_out' })` | ✓ WIRED | Lines 4-5: contacts imported from schema barrel; lines 57-60: db.update(contacts).set({outreachStatus:'reached_out', updatedAt:new Date()}).where(eq(contacts.id, email.contactId)) |
| `SKILL.md` | `references/heimdall-api.md` | references the API contract | ✓ WIRED | Line 41: `[references/heimdall-api.md](references/heimdall-api.md)` — explicit reference in Overview section |
| `SKILL.md` | `PATCH .../draft` | one call per email after create_draft | ✓ WIRED | Step 4d (lines 425–448): curl PATCH .../draft {gmailDraftId} immediately after create_draft returns |

### Data-Flow Trace (Level 4)

Not applicable. The route is a write handler (PATCH), not a rendering component. The skill is a workflow document, not a rendering component. No dynamic data display to trace.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| D-06 send-safety gate | `grep -rinE "mcp__gmail__(send|send_message|trash|delete|import|update_draft|modify|insert)" .claude/skills/draft-outreach-emails/` | Zero matches | ✓ PASS |
| Script syntax valid | `bash -n scripts/verify-draft-route.sh` | exit 0 | ✓ PASS |
| canEmailTransition imported + called (count ≥ 2) | `grep -c "canEmailTransition" draft/route.ts` | 2 | ✓ PASS |
| No literal bearer token in skill docs | `! grep -qE "Bearer [A-Za-z0-9._-]{16,}" heimdall-api.md` | clean | ✓ PASS |
| TypeScript compilation | `npx tsc --noEmit` | exit 0 (no errors) | ✓ PASS |
| CANDIDATE_ADDRESSES reset per contact | `grep -n "CANDIDATE_ADDRESSES=()" SKILL.md` | line 251 found | ✓ PASS |
| grep -qiF fixed-string name matching | `grep -n "grep -qiF" SKILL.md` | line 258 found | ✓ PASS |

### Probe Execution

Step 7c: SKIPPED — no probe-*.sh scripts declared or present in the phase directory. The phase's validation surface is manual smoke + a bash curl regression (verify-draft-route.sh) that requires a live dev server, classified as human verification.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| DISC-01 | 17-02, 17-03 | Discovery via Gmail thread search (search_threads / get_thread) | ✓ SATISFIED | SKILL.md Step 3 encodes full discovery loop; search_threads + get_thread calls documented |
| DISC-02 | 17-02, 17-03 | Requires confirmed thread participant; ambiguous multi-match surfaced in summary | ✓ SATISFIED | D-03 accept rule: exactly-1 → accept; ≥2 → AMBIGUOUS_LIST (recipientEmail left unset, listed in summary); DRFT-05 plan's intent met in route |
| DISC-03 | 17-02, 17-03 | No email found → channel=linkedin_message, never silently dropped | ✓ SATISFIED | SKILL.md Step 3c zero-address path; LINKEDIN_FALLBACK_LIST in summary |
| DRFT-01 | 17-03 | Skill creates Gmail draft for each approved email with a recipient | ✓ SATISFIED | SKILL.md Step 4: mcp__gmail__create_draft per drafting-queue item |
| DRFT-02 | 17-03 | Skill NEVER sends; only create_draft | ✓ SATISFIED | allowed-tools frontmatter (4 tools only); grep gate returns zero send-family tokens; CR-01 fix applied |
| DRFT-03 | 17-03 | Idempotent — no duplicate drafts; re-draft via create-and-repoint | ✓ SATISFIED | Step 4b: gmailDraftId null→new / non-null→redraft; approved queue naturally excludes drafted emails |
| DRFT-04 | 17-01 | Draft id stored, email marked drafted, timeline event logged | ✓ SATISFIED | Route lines 44–72: gmailDraftId set, status='drafted', draftedAt, logTimeline outreach_email_drafted |
| DRFT-05 | 17-01 | Drafting updates contact outreachStatus to reached_out | ✓ SATISFIED (code) / STALE DOCS | Route lines 56–60 implement it; REQUIREMENTS.md checkbox and traceability table still show "Pending" — a documentation stale state only, not a code gap |

**DRFT-05 stale-docs note:** REQUIREMENTS.md has `- [ ] **DRFT-05**` (unchecked) and the traceability table says `| DRFT-05 | Phase 17 | Pending |`. The route comment at line 56 explicitly tags it `// D-01 / DRFT-05: Update contact outreachStatus → reached_out` and the db.update(contacts).set({outreachStatus:'reached_out'}) call is present and wired. This is a planning-doc housekeeping gap, not a code gap. REQUIREMENTS.md should be updated to `[x]` with status Complete.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.planning/REQUIREMENTS.md` | 56, 124 | DRFT-05 checkbox `[ ]` and traceability "Pending" — stale after route implementation | ℹ Info | No code impact; planning doc needs checkbox flip to `[x]` and status → Complete |

No debt-marker (TBD/FIXME/XXX) comments found in files modified by this phase. No stub patterns in the route (all four effects present and wired). No send-family Gmail tokens in skill directory.

**ROADMAP SC #2 vs D-03 deviation (documented, intentional):** ROADMAP success criterion 2 says "at least two signals match (name + company domain, or confirmed thread participant)." The implementation uses ONLY the direct thread participant path — no domain-name inference. This stricter approach was explicitly locked in 17-CONTEXT.md D-03: "Domain/name-only inference is NOT used — this minimizes false positives on a draft recipient." The skill is MORE conservative than the ROADMAP wording but meets the ROADMAP's intent. Not a gap.

**ROADMAP SC #4 vs D-02 deviation (documented, intentional):** ROADMAP SC #4 says "updates the existing Gmail draft in-place." The implementation uses create-and-repoint (a fresh draft is created and gmailDraftId overwritten) because no update_draft tool is available on the connected MCP. This was explicitly decided in 17-CONTEXT.md D-02. The re-draft scenario is idempotent and leaves the old draft harmless. Not a gap.

---

### Human Verification Required

The following items require a live Gmail-MCP interactive session to verify. All code-level checks have passed; these are runtime behavior validations only.

#### 1. End-to-End Draft Creation

**Test:** Run `draft-outreach-emails <campaign-id>` against a campaign with at least one approved email that has a stored `recipientEmail`. Confirm with "yes" at the gate.
**Expected:** Gmail draft appears in Gmail Drafts folder; email row shows `status='drafted'`, `gmailDraftId` non-null, `draftedAt` set; contact record shows `outreachStatus='reached_out'`; timeline event of type `outreach_email_drafted` is logged.
**Why human:** Requires live Gmail MCP connection + a real approved email row with a known recipient; the four-effect atomicity in the route is verified by code but the end-to-end flow (create_draft → write-back → Gmail visible) requires a real session.

#### 2. Email Discovery — Single Match

**Test:** Run `draft-outreach-emails <campaign-id>` against a campaign where at least one approved email's contact has no stored `recipientEmail` but has a shared Gmail thread with steve@bronstein.org. The contact's full name must appear as a thread participant.
**Expected:** Skill discovers exactly one distinct address, writes it back via `PATCH .../recipient {channel:'email', recipientEmail}`, and proceeds to draft the email in the same run. Run summary shows `Discovered: 1`.
**Why human:** Gmail thread search (mcp__gmail__search_threads + get_thread) cannot be invoked without a live Gmail MCP session.

#### 3. LinkedIn Fallback — No Discoverable Address

**Test:** Run against a contact where no Gmail thread with steve@bronstein.org includes that contact by name. Confirm the skill identifies zero candidate addresses.
**Expected:** Skill calls `PATCH .../recipient {channel:'linkedin_message'}`. Email row shows `channel='linkedin_message'`. Run summary lists the contact under "LinkedIn fallback contacts." No Gmail draft created. The "needs LinkedIn message" badge appears in the review UI.
**Why human:** Requires live Gmail MCP to confirm `search_threads` returns zero matching threads; badge rendering requires a browser session.

#### 4. Idempotency — No Duplicate Drafts on Re-Run

**Test:** After completing human test #1, re-run `draft-outreach-emails` against the same campaign.
**Expected:** Skill reports `Drafted: 0` for already-drafted emails (they are not in the approved queue). No new Gmail drafts are created for emails already in `status='drafted'`.
**Why human:** Requires two sequential live Gmail-MCP runs to confirm the idempotency guarantee end-to-end.

#### 5. State-Machine Regression Script

**Test:** With the dev server running on port 4000, run `CAMPAIGN_ID=<uuid> EMAIL_ID=<non-approved-email-uuid> bash scripts/verify-draft-route.sh`.
**Expected:** Script prints `PASS: All executed D-01 assertions passed.` and exits 0. HTTP 400 + "Invalid transition" confirmed for the rejection path.
**Why human:** Script requires a live dev server + a real non-approved seed email row that exists in the database.

---

### Gaps Summary

No code gaps found. All five must-have truths are VERIFIED against the actual codebase. The phase goal is achievable from the shipped artifacts.

The single housekeeping item is a **stale planning doc** (REQUIREMENTS.md DRFT-05 checkbox and traceability still show "Pending") — the implementation is in the route and correct. This is a documentation cleanup, not a code gap, and does not block phase completion.

The five human verification items above are runtime behaviors that cannot be confirmed without a live Gmail MCP session. They are standard post-merge smoke tests for a skill-based workflow, not evidence of incomplete implementation.

---

_Verified: 2026-06-22T22:43:32Z_
_Verifier: Claude (gsd-verifier)_
