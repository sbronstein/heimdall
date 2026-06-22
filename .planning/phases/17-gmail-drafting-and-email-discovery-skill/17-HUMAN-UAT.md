---
status: partial
phase: 17-gmail-drafting-and-email-discovery-skill
source: [17-VERIFICATION.md]
started: 2026-06-22
updated: 2026-06-22
---

## Current Test

[awaiting human testing — requires a live, interactively-connected Gmail MCP session + the dev server on port 4000]

## Tests

### 1. End-to-end draft creation (DRFT-01, DRFT-04, DRFT-05 / SC #1)
expected: Running `draft-outreach-emails <campaign-id>` against a campaign with ≥1 approved email that has a recipient creates a Gmail draft; the email row shows `gmailDraftId` set, `status='drafted'`, the linked contact's `outreachStatus='reached_out'`, and an `outreach_email_drafted` timeline event is logged. The draft is visible in Gmail and is NOT sent.
result: [pending]

### 2. Single-match address discovery (DISC-01, DISC-02 / SC #2)
expected: For an approved email whose contact has no stored email but who was a direct participant in exactly one Gmail thread with Steve, the skill writes back the discovered address via `PATCH .../recipient {channel:'email'}` and then drafts it in the SAME run. A contact with ≥2 distinct candidate addresses is left undrafted with the candidates listed in the run summary (no auto-pick, not forced to LinkedIn).
result: [pending]

### 3. LinkedIn fallback with zero threads (DISC-03 / SC #3)
expected: For a contact with no stored email and no direct Gmail thread, the skill sets `channel='linkedin_message'` via `PATCH .../recipient`; the "needs LinkedIn message" badge renders in the Phase 15 review UI; the contact appears in the run summary and is never silently dropped.
result: [pending]

### 4. Idempotency across two runs (DRFT-03 / SC #4)
expected: Re-running the skill creates no duplicate drafts (already-`drafted` emails are skipped). An email edited after drafting (returns to `status='approved'` with a stale `gmailDraftId`) is re-drafted by creating a fresh Gmail draft and repointing `gmailDraftId` (no send, old draft left harmless).
result: [pending]

### 5. Live `/draft` route regression + send-safety gate (DRFT-02 / SC #5)
expected: `bash scripts/verify-draft-route.sh` (with the dev server running + a non-approved seed email) asserts HTTP 400 + "Invalid transition" on the guard; with `CAMPAIGN_ID_APPROVED`/`EMAIL_ID_APPROVED` env vars set, the happy path returns 200 + `drafted`. The send-safety grep gate `grep -rinE "mcp__gmail__(send|send_message|trash|delete|import|update_draft|modify|insert)" .claude/skills/draft-outreach-emails/` returns zero (already confirmed in static verification).
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
