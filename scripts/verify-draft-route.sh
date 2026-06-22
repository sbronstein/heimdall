#!/usr/bin/env bash
# D-01 state-machine regression: verify /draft route enforces state-machine guard
#
# Test 1 (rejection path): PATCH .../draft returns HTTP 400 + "Invalid transition"
#   when the target email is NOT in the approved state. Proves the canEmailTransition
#   guard introduced in D-01 is active and blocks writes.
#
# Test 2 (happy path): PATCH .../draft returns HTTP 200 and transitions the email
#   to status='drafted' when the target email IS in the approved state. Without this
#   assertion, an inverted guard (blocks approved instead of blocking non-approved)
#   would make the entire feature broken while Test 1 still passes.
#
# Requirements:
#   - Dev server running on http://localhost:4000
#   - ~/.heimdall/api-token contains a valid bearer token
#   - CAMPAIGN_ID and EMAIL_ID identify an email in a NON-approved state (pending/generated/etc.)
#   - CAMPAIGN_ID_APPROVED and EMAIL_ID_APPROVED identify an email in the approved state
#     (required for Test 2 only; if omitted, Test 2 is skipped and documented as a gap)
#
# NOTE on happy-path test (IN-04): The happy-path test requires a live DB row in
# approved state. This cannot be seeded deterministically by the script itself because
# the approved state comes from the operator's own campaign data. Supply
# CAMPAIGN_ID_APPROVED and EMAIL_ID_APPROVED to enable it. Omitting them skips Test 2
# and prints a coverage-gap warning instead of failing.
#
# IMPORTANT: Test 2 is destructive -- it transitions the target email from approved →
# drafted. Use a throwaway email row or re-approve manually afterward.
#
# Usage:
#   CAMPAIGN_ID=<uuid> EMAIL_ID=<uuid> bash scripts/verify-draft-route.sh
#   CAMPAIGN_ID=<uuid> EMAIL_ID=<uuid> \
#     CAMPAIGN_ID_APPROVED=<uuid> EMAIL_ID_APPROVED=<uuid> \
#     bash scripts/verify-draft-route.sh
#   or positional (rejection path only):
#   bash scripts/verify-draft-route.sh <campaign-id> <email-id>

set -euo pipefail

CAMPAIGN_ID="${1:-${CAMPAIGN_ID:-}}"
EMAIL_ID="${2:-${EMAIL_ID:-}}"
CAMPAIGN_ID_APPROVED="${CAMPAIGN_ID_APPROVED:-}"
EMAIL_ID_APPROVED="${EMAIL_ID_APPROVED:-}"

if [ -z "$CAMPAIGN_ID" ] || [ -z "$EMAIL_ID" ]; then
  echo "ERROR: CAMPAIGN_ID and EMAIL_ID are required."
  echo "Usage: CAMPAIGN_ID=<uuid> EMAIL_ID=<uuid> bash $0"
  exit 1
fi

TOKEN=$(cat ~/.heimdall/api-token)
BASE_URL="http://localhost:4000"
OUTPUT_FILE="/tmp/draft-verify.json"

PASS=true

# ── Test 1: Rejection path ───────────────────────────────────────────────────
# Supply a non-approved email; expect HTTP 400 + "Invalid transition".

HTTP_CODE=$(
  curl -s -X PATCH \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"gmailDraftId":"verify-test"}' \
    -o "$OUTPUT_FILE" \
    -w '%{http_code}' \
    "$BASE_URL/api/outreach-campaigns/$CAMPAIGN_ID/emails/$EMAIL_ID/draft"
)

RESPONSE_ERROR=$(jq -r '.error // ""' "$OUTPUT_FILE" 2>/dev/null || echo "")

echo ""
echo "--- D-01 State-Machine Guard Regression ---"
echo ""
echo "[Test 1] Rejection path (non-approved email → expect 400)"
echo "  Campaign : $CAMPAIGN_ID"
echo "  Email    : $EMAIL_ID"
echo "  HTTP Code: $HTTP_CODE"
echo "  Error    : $RESPONSE_ERROR"

if [ "$HTTP_CODE" != "400" ]; then
  echo "  FAIL: expected HTTP 400, got $HTTP_CODE"
  PASS=false
fi

case "$RESPONSE_ERROR" in
  *"Invalid transition"*)
    echo "  PASS: HTTP 400 + 'Invalid transition' confirmed."
    ;;
  *)
    echo "  FAIL: expected 'Invalid transition' in error, got: $RESPONSE_ERROR"
    PASS=false
    ;;
esac

# ── Test 2: Happy path ───────────────────────────────────────────────────────
# Supply an approved email; expect HTTP 200 + status='drafted' in the response.
# IMPORTANT: this is a destructive mutation — the email transitions to 'drafted'.
# Use a throwaway row or re-approve manually afterward.

echo ""
if [ -z "$CAMPAIGN_ID_APPROVED" ] || [ -z "$EMAIL_ID_APPROVED" ]; then
  echo "[Test 2] Happy path — SKIPPED (coverage gap)"
  echo "  CAMPAIGN_ID_APPROVED and EMAIL_ID_APPROVED were not provided."
  echo "  To enable: set both env vars to an approved email row and re-run."
  echo "  Without this test, an inverted guard (blocks approved, allows non-approved)"
  echo "  would pass Test 1 while breaking the entire feature."
else
  OUTPUT_FILE_HAPPY="/tmp/draft-verify-happy.json"
  HTTP_CODE_HAPPY=$(
    curl -s -X PATCH \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"gmailDraftId":"verify-test-happy"}' \
      -o "$OUTPUT_FILE_HAPPY" \
      -w '%{http_code}' \
      "$BASE_URL/api/outreach-campaigns/$CAMPAIGN_ID_APPROVED/emails/$EMAIL_ID_APPROVED/draft"
  )

  HAPPY_SUCCESS=$(jq -r '.success // "false"' "$OUTPUT_FILE_HAPPY" 2>/dev/null || echo "false")
  HAPPY_STATUS=$(jq -r '.data.status // ""' "$OUTPUT_FILE_HAPPY" 2>/dev/null || echo "")

  echo "[Test 2] Happy path (approved email → expect 200 + status='drafted')"
  echo "  Campaign : $CAMPAIGN_ID_APPROVED"
  echo "  Email    : $EMAIL_ID_APPROVED"
  echo "  HTTP Code: $HTTP_CODE_HAPPY"
  echo "  Status   : $HAPPY_STATUS"

  if [ "$HTTP_CODE_HAPPY" != "200" ]; then
    echo "  FAIL: expected HTTP 200, got $HTTP_CODE_HAPPY"
    PASS=false
  fi

  if [ "$HAPPY_SUCCESS" != "true" ] || [ "$HAPPY_STATUS" != "drafted" ]; then
    echo "  FAIL: expected success=true and status='drafted'"
    echo "        got: success=$HAPPY_SUCCESS, status=$HAPPY_STATUS"
    PASS=false
  else
    echo "  PASS: HTTP 200 + status='drafted' confirmed."
    echo "  NOTE: The email is now in 'drafted' state. Re-approve manually if needed."
  fi
fi

# ── Result ───────────────────────────────────────────────────────────────────

echo ""
if [ "$PASS" = "true" ]; then
  echo "PASS: All executed D-01 assertions passed."
  exit 0
else
  echo "FAIL: One or more D-01 assertions failed — review output above."
  exit 1
fi
