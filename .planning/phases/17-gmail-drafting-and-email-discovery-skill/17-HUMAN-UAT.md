---
status: partial
phase: 17-gmail-drafting-and-email-discovery-skill
source: [17-VERIFICATION.md]
started: 2026-06-22
updated: 2026-06-23
---

## Current Test

[All five tests executed. UAT 2 stands as an open issue (Gmail MCP response-shape mismatch);
the other four pass. No tests awaiting action.]

## Tests

### 1. End-to-end draft creation (DRFT-01, DRFT-04, DRFT-05 / SC #1)
expected: Running `draft-outreach-emails <campaign-id>` against a campaign with ≥1 approved email that has a recipient creates a Gmail draft; the email row shows `gmailDraftId` set, `status='drafted'`, the linked contact's `outreachStatus='reached_out'`, and an `outreach_email_drafted` timeline event is logged. The draft is visible in Gmail and is NOT sent.
result: [pass] 2026-06-23 — Live run on campaign 2329c548 (ID.me colleagues), contact Robyn Miller-Berger. `create_draft` returned draft id `r6433905474510638465`; `PATCH .../draft` returned 200 with `status='drafted'` and `gmailDraftId` set; contact `outreachStatus` advanced to `reached_out`. Draft confirmed present in Gmail (to robynberger4@gmail.com) and NOT sent (skill only ever calls create_draft).

### 2. Single-match address discovery (DISC-01, DISC-02 / SC #2)
expected: For an approved email whose contact has no stored email but who was a direct participant in exactly one Gmail thread with Steve, the skill writes back the discovered address via `PATCH .../recipient {channel:'email'}` and then drafts it in the SAME run. A contact with ≥2 distinct candidate addresses is left undrafted with the candidates listed in the run summary (no auto-pick, not forced to LinkedIn).
result: [issue] 2026-06-23 — BLOCKED by a response-shape mismatch with the connected Gmail MCP. The skill's D-03 name-match (the core of the LOCKED accept rule) assumes a Gmail API v1 shape where each message exposes `payload.headers` with `From: "Display Name <email>"`, and matches the display name against the contact's full name to keep only that contact's address. The connected `mcp__claude_ai_Gmail__*` server returns `sender`/`toRecipients`/`ccRecipients` as **bare email addresses with no display names** — confirmed even at `messageFormat=FULL_CONTENT` (display names appear only inside the HTML/plaintext body, not in any structured header field; there is no `payload.headers` array). Consequence: the display-name filter cannot run as written, so discovery must fall back to extracting bare participant addresses, which over-includes genuine co-participants on group/calendar threads. Evidence: searching "Marc Dupuis" (Heimdall contact, Fabi.ai, no stored email) returns a Google Calendar invite whose participants are `marc@fabi.ai` + `lei@fabi.ai`, so naive extraction yields 2 addresses and misclassifies a clear single-correspondent as AMBIGUOUS; searching "Tim Mitchell" (Heimdall contact, SemOps.ai, no stored email) returns his clean 1:1 thread `tim@timjmitchell.com` but also group threads pulling in `sasakimitchell@gmail.com` / `horsebrand@gmail.com`, which the absent name-match filter would have excluded. The single-match and ambiguous branches were therefore NOT exercised against the live MCP (per owner decision: log as issue, do not stage curated test data). Remediation: adapt the skill's discovery to this MCP's flat address fields — e.g. scope candidate threads via search-by-name and parse the display name out of the message body, or otherwise reconstruct the name→address association the bare fields drop — then re-test both branches. Candidates available when re-tested: Tim Mitchell (single-match), Carly Sandstrom (ambiguous — two real addresses carly@sandstromstrategies.com / carly.sandstrom@gmail.com).

### 3. LinkedIn fallback with zero threads (DISC-03 / SC #3)
expected: For a contact with no stored email and no direct Gmail thread, the skill sets `channel='linkedin_message'` via `PATCH .../recipient`; the "needs LinkedIn message" badge renders in the Phase 15 review UI; the contact appears in the run summary and is never silently dropped.
result: [pass] 2026-06-23 — Contacts Scott Foote and Alex von Reyn (no stored email; Gmail search returned only LinkedIn invite/notification threads, confirmed zero real participant addresses by opening the threads). Both written via `PATCH .../recipient {channel:'linkedin_message'}` (recipientEmail forced null), both surfaced in the run summary's LinkedIn-fallback list, neither dropped. "needs LinkedIn message" badge renders in the review UI.

### 4. Idempotency across two runs (DRFT-03 / SC #4)
expected: Re-running the skill creates no duplicate drafts (already-`drafted` emails are skipped). An email edited after drafting (returns to `status='approved'` with a stale `gmailDraftId`) is re-drafted by creating a fresh Gmail draft and repointing `gmailDraftId` (no send, old draft left harmless).
result: [pass] 2026-06-23 — Part (a) PASS: after Robyn was drafted, a fresh read of `?status=approved` excludes her (only Scott/Alex remain, both linkedin_message with null recipient → nothing to draft), so a re-run produces no new draft; Gmail `list_drafts to:robynberger4@gmail.com` shows exactly one draft (`r6433905474510638465`), no duplicate. Part (b) PASS: verified on a throwaway campaign + contact (drafting to steve+uat@bronstein.org, archived after). Drafted the email (id `r-141871414214235063`), moved it drafted→edited→approved (stale gmailDraftId retained), then re-ran the draft step: create_draft minted a fresh id (`r-5172824486057692411` ≠ original), `PATCH .../draft` repointed `gmailDraftId` to the new id, and Gmail `list_drafts` confirmed BOTH drafts still present (old one left harmless, never sent). Throwaway campaign + contact soft-deleted afterward (HTTP 204); two test drafts to steve+uat@bronstein.org remain in Gmail Drafts and can be deleted manually.

### 5. Live `/draft` route regression + send-safety gate (DRFT-02 / SC #5)
expected: `bash scripts/verify-draft-route.sh` (with the dev server running + a non-approved seed email) asserts HTTP 400 + "Invalid transition" on the guard; with `CAMPAIGN_ID_APPROVED`/`EMAIL_ID_APPROVED` env vars set, the happy path returns 200 + `drafted`. The send-safety grep gate `grep -rinE "mcp__gmail__(send|send_message|trash|delete|import|update_draft|modify|insert)" .claude/skills/draft-outreach-emails/` returns zero (already confirmed in static verification).
result: [pass] 2026-06-23 — Test 1 (rejection) via `verify-draft-route.sh` against drafted email 8d8547f1: HTTP 400 + "Invalid transition: drafted -> drafted". Test 2 (happy path, 200 + `drafted` on an approved row) satisfied by the live end-to-end run in Test 1 above — Robyn's real `PATCH .../draft` on an approved email returned 200 + `status='drafted'` with a real Gmail draft id (strictly stronger than the script's synthetic verify-test-happy id, which was therefore not injected). Both guard directions thus confirmed (non-approved→400, approved→200), ruling out an inverted guard. Send-safety grep gate returns zero matches.

## Summary

total: 5
passed: 4
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- UAT 2 (discovery) is unverified end-to-end because the connected Gmail MCP does not expose
  per-message display-name headers that the skill's name-match relies on. The skill needs a
  discovery adaptation before single-match / ambiguous branches can be validated. Tracked as an
  issue above, not a pass.
