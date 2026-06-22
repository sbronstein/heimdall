---
phase: 17-gmail-drafting-and-email-discovery-skill
fixed_at: 2026-06-22T00:00:00Z
review_path: .planning/phases/17-gmail-drafting-and-email-discovery-skill/17-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 17: Code Review Fix Report

**Fixed at:** 2026-06-22
**Source review:** `.planning/phases/17-gmail-drafting-and-email-discovery-skill/17-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (CR-01, WR-01, WR-02, WR-03, IN-01, IN-02, IN-03, IN-04)
- Fixed: 8
- Skipped: 0

---

## Fixed Issues

### CR-01: Send-Safety Grep Gate — D-06 Invariant Self-Defeating

**Files modified:** `.claude/skills/draft-outreach-emails/SKILL.md`
**Commit:** cfa8f40
**Applied fix:** Replaced `grep -ri "send"` with `grep -rinE "mcp__gmail__(send|send_message|trash|delete|import|update_draft|modify|insert)"`. The old pattern always matched the skill's own constraint prose ("never sends", "click Send", etc.), making "confirm zero results" permanently impossible. The new pattern targets only MCP tool call tokens; a clean skill produces zero output. Post-fix verification confirmed: running the corrected gate against the skill directory returns zero results.

---

### WR-01: `CANDIDATE_ADDRESSES` Never Reset Between Contacts

**Files modified:** `.claude/skills/draft-outreach-emails/SKILL.md`
**Commit:** c29511c
**Applied fix:** Added `CANDIDATE_ADDRESSES=()` at the top of the per-contact discovery loop body (before the thread search calls), with an explanatory comment. Addresses from contact N can no longer bleed into contact N+1's candidate pool.

---

### WR-02: `Skipped (archived contact)` Counter Never Tracked

**Files modified:** `.claude/skills/draft-outreach-emails/SKILL.md`
**Commit:** fcef8a2
**Applied fix:** Added `SKIPPED_LIST=()` to the initialization block and explicit `SKIPPED_LIST+=("$CONTACT_NAME ($EMAIL_ID)")` append in Step 4a's archived-contact guard. Updated the run-summary to use `${#SKIPPED_LIST[@]}` so the "Skipped" count is always real and accurate. Also converted the summary template from prose to executable bash.

---

### WR-03: Contact Name Matched with `grep -qi` as BRE Pattern

**Files modified:** `.claude/skills/draft-outreach-emails/SKILL.md`
**Commit:** c29511c
**Applied fix:** Changed `grep -qi "$CONTACT_FULL_NAME_LOWER"` to `grep -qiF "$CONTACT_FULL_NAME_LOWER"` with a comment explaining that `-F` disables BRE interpretation so names containing `.` (Dr., Jr., S.A.) are matched literally rather than as wildcards that could produce false-positive address acceptance. Committed atomically with WR-01.

---

### IN-01: `DRAFTING_QUEUE` Not Updated in Discovery Code Example

**Files modified:** `.claude/skills/draft-outreach-emails/SKILL.md`
**Commit:** 7da24b5
**Applied fix:** After a successful `/recipient` write-back, added the jq mutation to update the in-memory item's `recipientEmail` field and append it to `DRAFTING_QUEUE`. Without this, newly-discovered emails only reached the drafting loop on the next run. The skill is documented as discover-then-draft in one batch (D-05); the guidance now actually implements that invariant.

---

### IN-02: All Loop Counter/Array Variables Uninitialized

**Files modified:** `.claude/skills/draft-outreach-emails/SKILL.md`
**Commit:** fcef8a2
**Applied fix:** Added an initialization block (after the queue partition in Step 1) for all run counters and accumulator arrays: `DRAFTED_COUNT=0`, `DISCOVERED_COUNT=0`, `SKIPPED_LIST=()`, `AMBIGUOUS_LIST=()`, `LINKEDIN_FALLBACK_LIST=()`, `FAILED_LIST=()`. Committed atomically with WR-02.

---

### IN-03: heimdall-api.md Documents "Campaign not found" 404 for PATCH /draft

**Files modified:** `.claude/skills/draft-outreach-emails/references/heimdall-api.md`
**Commit:** afcbeb2
**Applied fix:** Clarified both 404 rows in the Error Envelopes table: "Campaign not found" is explicitly annotated as only returned by the `GET .../emails` list route; "Email not found" is annotated as returned by all three PATCH write-back endpoints. The route.ts SELECT scopes by both emailId and campaignId and calls `notFound('Email')` on no-row — never "Campaign not found". An operator mis-diagnosing a campaign ID issue when the real problem is email ownership mismatch is now prevented.

---

### IN-04: Verify Script Tests Only the Rejection Path

**Files modified:** `scripts/verify-draft-route.sh`
**Commit:** b8abcfa
**Applied fix:** Added Test 2 (happy path): when `CAMPAIGN_ID_APPROVED` and `EMAIL_ID_APPROVED` env vars are provided, the script asserts PATCH .../draft on an approved email returns HTTP 200 with `status='drafted'`. When the vars are omitted, Test 2 is skipped with an explicit coverage-gap warning (not a silent skip). The script header documents why a live approved row is needed (cannot be auto-seeded) and marks the test as destructive. `bash -n` syntax check passes.

---

## Skipped Issues

None — all 8 findings were fixed.

---

## Post-Fix Verification

**Send-safety gate result:**
```
$ grep -rinE "mcp__gmail__(send|send_message|trash|delete|import|update_draft|modify|insert)" \
    .claude/skills/draft-outreach-emails/
[zero output — gate is clean]
```

**Script syntax check:**
```
$ bash -n scripts/verify-draft-route.sh
[exit 0 — parses cleanly]
```

**HTML companions:** SKILL.html and heimdall-api.html regenerated via `md-to-html.mjs`; `_index.html` rebuilt.

---

_Fixed: 2026-06-22_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
