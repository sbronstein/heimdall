---
phase: 17-gmail-drafting-and-email-discovery-skill
reviewed: 2026-06-22T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/app/api/outreach-campaigns/[id]/emails/[emailId]/draft/route.ts
  - scripts/verify-draft-route.sh
  - .claude/skills/draft-outreach-emails/SKILL.md
  - .claude/skills/draft-outreach-emails/references/heimdall-api.md
findings:
  critical: 1
  warning: 3
  info: 4
  total: 8
status: resolved
---

# Phase 17: Code Review Report

**Reviewed:** 2026-06-22
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Four files were reviewed: the D-01 draft route edit, a bash regression script, the skill
workflow document, and the skill's API reference. The route implementation is structurally
sound — authorization scoping, state-machine guard, Zod validation, manual `updatedAt`, and
timeline logging all follow project conventions and match the analog `/status` route. No
injection vulnerabilities, no hardcoded secrets, and no send-family Gmail tools appear in
any file.

One critical issue is found: the pre-run send-safety grep gate in SKILL.md is self-defeating
— it will always produce matches because the skill file itself contains the word "send" in
its own constraint prose, making "confirm zero results" an impossible instruction. Three
warnings cover a discovery-loop bug where `CANDIDATE_ADDRESSES` is not reset between
contact iterations (causing address accumulation across contacts), an untracked `Skipped`
counter referenced in the run summary, and a BRE pattern-injection risk in the contact
name-matching filter. Four info items address minor documentation inaccuracies, missing
counter initializations, and an incomplete code example for updating the drafting queue
after discovery.

---

## Critical Issues

### CR-01: Send-Safety Grep Gate Always Fails — D-06 Invariant Self-Defeating

**File:** `.claude/skills/draft-outreach-emails/SKILL.md:469-473`

**Issue:** The mandatory D-06 pre-run safety check instructs the operator to run:

```bash
grep -ri "send" .claude/skills/draft-outreach-emails/
```

and "confirm zero send-family results." This can never pass. SKILL.md itself contains the
word "send" in its own constraint prose at least six times: "never sends email", "never send",
"click Send on each draft", "NEVER calls any send", etc. The grep will always return non-zero
results, making the gating instruction either permanently misleading (operator learns to
ignore it) or permanently blocking (operator can never confirm the gate is clean). A safety
gate that must always be overridden provides no defense-in-depth and may train the operator
to dismiss future real violations.

**Fix:** Narrow the grep to match only Gmail MCP tool call patterns, not prose references to
sending. Replace the current gate with a pattern that matches actual tool invocations:

```bash
# Gate: confirm no Gmail send/trash/import/delete tools are called as MCP tools
grep -riE 'mcp__gmail__(send|trash|import|delete|modify)' .claude/skills/draft-outreach-emails/
# Expected: no output (exit 0). Any match is a real violation.
```

Alternatively, grep for `create_message` or `send_message` as those are the Gmail API
method names that would actually send:

```bash
grep -riE '(send_message|create_message|gmail.*send)' .claude/skills/draft-outreach-emails/ \
  | grep -v '# ' | grep -v 'never send' | grep -v 'click Send'
```

The simplest correct fix is scoping to MCP tool names only.

---

## Warnings

### WR-01: `CANDIDATE_ADDRESSES` Never Reset Between Contacts — Discovery Loop Bug

**File:** `.claude/skills/draft-outreach-emails/SKILL.md:238-256`

**Issue:** The discovery loop in Step 3b accumulates candidate email addresses into
`CANDIDATE_ADDRESSES+=("$ADDR")` for each thread/header match. The array is read and
deduplicated at the end of each contact's thread processing. However, `CANDIDATE_ADDRESSES`
is never reset to `()` at the start of each contact's iteration. In a real bash implementation
following this guidance, addresses found for contact N will carry over into contact N+1's
candidate pool, corrupting the D-03 accept rule. A contact with genuinely zero direct-thread
participation could inherit another contact's address and be (incorrectly) written back via
`PATCH .../recipient` with a wrong address. The resulting draft would be sent to the wrong
person.

**Fix:** Insert `CANDIDATE_ADDRESSES=()` at the top of the per-contact loop body, before the
thread search calls:

```bash
# At the start of each contact's iteration:
CANDIDATE_ADDRESSES=()
# ... then the search_threads / get_thread loop
CANDIDATE_ADDRESSES+=("$ADDR")
# ...
DISTINCT_ADDRESSES=$(printf '%s\n' "${CANDIDATE_ADDRESSES[@]}" | sort -u)
```

### WR-02: `Skipped (archived contact)` Counter Never Tracked — Run Summary Shows Phantom Count

**File:** `.claude/skills/draft-outreach-emails/SKILL.md:334,425-450`

**Issue:** Step 4a says "if `contact.archivedAt != null`: add to skipped list, continue"
but no bash code is provided and no variable (`SKIPPED_COUNT`, `SKIPPED_LIST`) is initialized
or incremented anywhere in the skill. Step 5's end-of-run summary template displays
"Skipped (archived contact): S" as if S is computed. An operator implementing this skill
literally will either: (a) show "Skipped: 0" always (if the variable defaults to zero), or
(b) produce an unbound variable error under `set -u`. Because archived-contact emails are
silently not drafted and the count is not surfaced, the owner has no visibility into how many
eligible emails were skipped — a run could draft fewer emails than expected with no indication
why.

**Fix:** Add initialization of a SKIPPED_LIST array (or SKIPPED_COUNT counter) alongside the
other counter declarations implied throughout the skill, and add explicit increment code in
Step 4a:

```bash
SKIPPED_LIST=()  # Initialize with other counters before the drafting loop

# Step 4a — archived contact guard:
if [ "$(echo "$EMAIL_ITEM" | jq -r '.contact.archivedAt')" != "null" ]; then
  SKIPPED_LIST+=("$CONTACT_NAME ($EMAIL_ID)")
  continue
fi
```

Then in the run summary:

```bash
echo "Skipped (archived contact): ${#SKIPPED_LIST[@]}"
```

### WR-03: Contact Name Matched with `grep -qi` as BRE Pattern — False Positives on Special-Character Names

**File:** `.claude/skills/draft-outreach-emails/SKILL.md:241`

**Issue:** The D-03 name-matching filter uses:

```bash
if echo "$DISPLAY_NAME_LOWER" | grep -qi "$CONTACT_FULL_NAME_LOWER"; then
```

`grep -q` interprets its argument as a Basic Regular Expression (BRE). If a contact's full
name contains BRE metacharacters — most commonly `.` (matches any character, e.g., "Jr.",
"Dr.", "S.A.") or `*` or `[` — the pattern will match more broadly than intended. A contact
named "Alex Jr." would match any display name containing "alex " followed by any character
followed by "r", accepting addresses for unrelated people. In a drafting skill that writes
recipient addresses back to the database, a false positive here can result in a Gmail draft
being created to the wrong person.

**Fix:** Use `grep -qiF` (fixed-string matching) to treat the contact name as a literal:

```bash
if echo "$DISPLAY_NAME_LOWER" | grep -qiF "$CONTACT_FULL_NAME_LOWER"; then
```

The `-F` flag disables BRE interpretation and performs byte-literal matching, which is the
correct behavior for comparing human names.

---

## Info

### IN-01: `DRAFTING_QUEUE` Not Updated in Discovery Code Example

**File:** `.claude/skills/draft-outreach-emails/SKILL.md:278-283`

**Issue:** Step 3c's "exactly one address found" success path ends with a comment
`# Update the item's recipientEmail in memory and add to DRAFTING_QUEUE` but provides no
actual code to do this. The drafting loop in Step 4 iterates over `DRAFTING_QUEUE`, so
newly-discovered emails that were added to the discovery queue at Step 1 will never reach
the drafting loop unless they are explicitly added to `DRAFTING_QUEUE` within this run.
An operator implementing the skill from the guidance as written will draft zero newly-discovered
emails in the same run — requiring a second run to pick them up as already-set `recipientEmail`.

**Fix:** After a successful `/recipient` write-back, append the updated item to `DRAFTING_QUEUE`:

```bash
# After successful recipient write-back:
UPDATED_ITEM=$(echo "$EMAIL_ITEM" | jq --arg addr "$DISCOVERED_ADDR" \
  '.email.recipientEmail = $addr')
DRAFTING_QUEUE=$(echo "$DRAFTING_QUEUE" | jq --argjson item "$UPDATED_ITEM" '. += [$item]')
DISCOVERED_COUNT=$((DISCOVERED_COUNT + 1))
```

### IN-02: All Loop Counter/Array Variables Uninitialized in Skill Guidance

**File:** `.claude/skills/draft-outreach-emails/SKILL.md` (multiple steps)

**Issue:** The skill never shows initialization of `DISCOVERED_COUNT`, `DRAFTED_COUNT`,
`AMBIGUOUS_LIST`, `LINKEDIN_FALLBACK_LIST`, or `FAILED_LIST` before they are used. In bash,
uninitialized integers default to 0 in arithmetic contexts (`$((DRAFTED_COUNT + 1))` works),
but uninitialized arrays do not — `+=()` appends to an undefined array which works in bash 4+
but fails under `set -u` (unbound variable). Operators running with `set -u` (as in the
verify script which uses `set -euo pipefail`) will hit errors on the first `+= ()` append if
the array was not declared.

**Fix:** Add an initialization block before the discovery loop:

```bash
# Initialize all counters and accumulator arrays
DRAFTED_COUNT=0
DISCOVERED_COUNT=0
SKIPPED_LIST=()
AMBIGUOUS_LIST=()
LINKEDIN_FALLBACK_LIST=()
FAILED_LIST=()
```

### IN-03: heimdall-api.md Documents "Campaign not found" 404 for PATCH /draft — Inaccurate

**File:** `.claude/skills/draft-outreach-emails/references/heimdall-api.md:341`

**Issue:** The error-envelope table shows:

```
| 404 | { "error": "Campaign not found" } | Campaign ID invalid; surface and exit |
```

The `PATCH .../draft` route (and its analog `/status`) does **not** perform a separate
campaign existence check. The pre-read `SELECT` filters by both `emailId` AND `campaignId`.
If the campaign ID is wrong (but the email ID exists in a different campaign), the SELECT
returns no row and the route returns `{ "error": "Email not found" }` — not "Campaign not
found". "Campaign not found" is only returned by the `GET .../emails` list route (Step 1).
An operator acting on a 404 from the draft write-back endpoint who expects "Campaign not
found" will mis-diagnose the error as a campaign ID issue when it may be an email ID
ownership mismatch.

**Fix:** Correct the table row for PATCH /draft:

```
| 404 | { "error": "Email not found" } | Email ID not found or does not belong to this campaign |
```

### IN-04: Verify Script Tests Only the Rejection Path — No Happy-Path Regression

**File:** `scripts/verify-draft-route.sh`

**Issue:** The script proves the guard blocks non-approved states (HTTP 400 +
"Invalid transition"). It does not test the success path: that a genuinely `approved` email
returns HTTP 200 and writes back `status='drafted'`, `gmailDraftId`, and the contact's
`outreachStatus='reached_out'`. If a future code change accidentally inverts the guard logic
(blocks approved instead of rejecting non-approved), this script would pass while the
feature is entirely broken.

**Fix:** Add a second test assertion targeting an email in `approved` state:

```bash
# Second assertion block (happy path):
HTTP_CODE_HAPPY=$(curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"gmailDraftId":"verify-test-happy"}' \
  -o /tmp/draft-verify-happy.json \
  -w '%{http_code}' \
  "$BASE_URL/api/outreach-campaigns/$CAMPAIGN_ID_APPROVED/emails/$EMAIL_ID_APPROVED/draft")
if [ "$HTTP_CODE_HAPPY" != "200" ]; then
  echo "FAIL: happy path expected 200, got $HTTP_CODE_HAPPY"
  PASS=false
fi
```

Requires `CAMPAIGN_ID_APPROVED` and `EMAIL_ID_APPROVED` env vars pointing to an approved
email. Alternatively, document this as a known coverage gap in the script header.

---

_Reviewed: 2026-06-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
