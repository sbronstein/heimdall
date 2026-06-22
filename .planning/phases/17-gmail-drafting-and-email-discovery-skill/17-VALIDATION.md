---
phase: 17
slug: gmail-drafting-and-email-discovery-skill
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-22
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: extracted from `17-RESEARCH.md` §"Validation Architecture". This project has **no test framework installed** (confirmed in CLAUDE.md: "Not configured; no jest.config.*, vitest.config.*, or test files detected"). Validation is a Wave-0 curl regression + a directory-wide grep gate + manual smoke runs — appropriate for a skill document plus a single backend route edit.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None installed |
| **Config file** | none — no framework added (out of scope; manual smoke is appropriate) |
| **Quick run command** | `bash scripts/verify-draft-route.sh` (Wave-0 curl regression for the D-01 guard) |
| **Full suite command** | Manual smoke run against a dev campaign + `grep -riE "mcp__gmail__(send|trash|delete|import|update_draft)" .claude/skills/draft-outreach-emails/` (must return zero) |
| **Estimated runtime** | ~5 seconds (curl) / ~2 min (manual smoke) |

---

## Sampling Rate

- **After every task commit:** Wave-0 curl test for the D-01 route edit (`PATCH .../draft` against a non-`approved` email → expect 400).
- **After every plan wave:** Full manual smoke run against a real campaign in dev (`npm run dev` on port 4000).
- **Before `/gsd:verify-work`:** all 8 requirements verified manually + the send-safety grep gate returns zero.
- **Max feedback latency:** ~5 seconds for the curl regression.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | DRFT-04, DRFT-05 | T-17-02 | `/draft` only mutates the email/contact bound to `(emailId, campaignId)`; `contactId` read from the row, not the request body | unit-style curl | `curl -X PATCH .../draft -d '{"gmailDraftId":"test"}'` on a `pending` email → expect 400 | ❌ W0 | ⬜ pending |
| 17-01-02 | 01 | 1 | DRFT-04 | — | guard rejects illegal pre-states | unit-style curl | `bash scripts/verify-draft-route.sh` exits 0 | ❌ W0 | ⬜ pending |
| 17-02-01 | 02 | 1 | DISC-01..03, DRFT-01/04/05 | — | API contract doc reflects post-17-01 `/draft` behavior | manual review | `test -f .claude/skills/draft-outreach-emails/references/heimdall-api.md` | ✅ | ⬜ pending |
| 17-03-01 | 03 | 2 | DRFT-02 | T-17-07 | allowed-tools lists only `create_draft`, `list_drafts`, `search_threads`, `get_thread`; zero send-family | grep gate | `! grep -riE "mcp__gmail__(send|trash|delete|import|update_draft)" .claude/skills/draft-outreach-emails/` | ❌ W0 | ⬜ pending |
| 17-03-02 | 03 | 2 | DISC-01/02/03, DRFT-01/03/04 | T-17-07 | strict single-direct-participant accept; ambiguous → summary (no guess); none → linkedin fallback; idempotent create-and-repoint | manual smoke | Run skill twice against a dev campaign → no duplicate drafts; ambiguous contact appears in summary; no-thread contact gets `linkedin_message` | ❌ manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated / Manual Command |
|--------|----------|-----------|----------------------------|
| DRFT-01 | Skill creates a Gmail draft per approved email with a recipient | Manual smoke | Run skill against a test campaign with 1 approved email; verify draft appears in Gmail |
| DRFT-02 | Skill never sends — zero send-family Gmail calls | Grep gate | `grep -riE "mcp__gmail__(send|trash|delete|import|update_draft)" .claude/skills/draft-outreach-emails/` → zero results |
| DRFT-03 | Idempotent re-run (no duplicate drafts; edited-after-draft re-drafts via create-and-repoint) | Manual smoke | Run skill twice; verify no duplicate draft in Gmail; edit an email then re-run → new draft id repointed |
| DRFT-04 | gmailDraftId stored, email marked `drafted`, timeline event logged | Manual API check | `GET /api/outreach-campaigns/[id]/emails?status=drafted` after run |
| DRFT-05 | Contact `outreachStatus = reached_out` | Manual API check | `GET /api/contacts/[id]` after run; check `outreachStatus` |
| DISC-01 | Discovery finds a direct-thread email and writes it back | Manual smoke | Run against a contact with no stored email but a known direct Gmail thread |
| DISC-02 | Ambiguous candidates surfaced in run summary, never auto-selected | Manual smoke | Run against a contact with 2+ known addresses in Gmail → recipient left unset, candidates listed |
| DISC-03 | LinkedIn fallback set, "needs LinkedIn message" badge appears | Manual UI check | Run against a contact with no Gmail threads → channel `linkedin_message`, badge renders |
| D-01 guard | `canEmailTransition` returns 400 on an illegal pre-state | Wave-0 curl | `curl -X PATCH .../draft` on a `pending` email → expect 400 |

---

## Wave 0 Requirements

- [ ] `scripts/verify-draft-route.sh` — curl regression for the D-01 route edit (PATCH against a `pending` email → confirm 400; PATCH against an `approved` email → confirm 200 + `drafted` + contact `reached_out`).
- [ ] Send-safety grep gate — `grep -riE "mcp__gmail__(send|trash|delete|import|update_draft)" .claude/skills/draft-outreach-emails/` returns zero (covers DRFT-02 / D-06).

*No test-framework installation needed — manual smoke tests plus the Wave-0 curl + grep gate are appropriate for a skill document and a single route edit.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Gmail draft actually appears / is correct | DRFT-01, DRFT-03 | Requires the live, interactively-connected Gmail MCP (absent in headless/cron); the skill is owner-run interactively | Run `draft-outreach-emails <campaign-id>` in dev; inspect the Gmail drafts folder |
| Discovery accept/ambiguous/fallback branching | DISC-01/02/03 | Depends on real Gmail thread history for the target contacts | Run against contacts with: (a) one direct thread, (b) 2+ addresses, (c) no thread; verify each branch |
| Review-UI badge renders the LinkedIn fallback | DISC-03 | Visual confirmation in the already-shipped Phase 15 review card | After a fallback run, open the review UI and confirm the "needs LinkedIn message" badge |

---

## Validation Sign-Off

- [x] All tasks have an `<automated>` verify (curl / grep) or a documented manual-only verification with justification
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (Wave-0 curl + grep gate bracket the route edit and the skill)
- [x] Wave 0 covers all MISSING references (curl regression script + grep gate)
- [x] No watch-mode flags
- [x] Feedback latency < 10s for the curl regression
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
