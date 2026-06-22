#!/usr/bin/env bash
# D-01 state-machine regression: verify /draft route rejects illegal pre-states
#
# This script asserts that PATCH .../draft returns HTTP 400 with "Invalid transition"
# when the target email is NOT in the approved state. It proves the canEmailTransition
# guard introduced in D-01 is active and blocks writes before any mutation occurs.
#
# Requirements:
#   - Dev server running on http://localhost:4000
#   - ~/.heimdall/api-token contains a valid bearer token
#   - CAMPAIGN_ID and EMAIL_ID identify an email in a NON-approved state (pending/generated/etc.)
#
# Usage:
#   CAMPAIGN_ID=<uuid> EMAIL_ID=<uuid> bash scripts/verify-draft-route.sh
#   or:
#   bash scripts/verify-draft-route.sh <campaign-id> <email-id>

set -euo pipefail

CAMPAIGN_ID="${1:-${CAMPAIGN_ID:-}}"
EMAIL_ID="${2:-${EMAIL_ID:-}}"

if [ -z "$CAMPAIGN_ID" ] || [ -z "$EMAIL_ID" ]; then
  echo "ERROR: CAMPAIGN_ID and EMAIL_ID are required."
  echo "Usage: CAMPAIGN_ID=<uuid> EMAIL_ID=<uuid> bash $0"
  exit 1
fi

TOKEN=$(cat ~/.heimdall/api-token)
BASE_URL="http://localhost:4000"
OUTPUT_FILE="/tmp/draft-verify.json"

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
echo "Campaign : $CAMPAIGN_ID"
echo "Email    : $EMAIL_ID"
echo "HTTP Code: $HTTP_CODE"
echo "Error    : $RESPONSE_ERROR"
echo ""

PASS=true

if [ "$HTTP_CODE" != "400" ]; then
  echo "FAIL: expected HTTP 400, got $HTTP_CODE"
  PASS=false
fi

case "$RESPONSE_ERROR" in
  *"Invalid transition"*)
    : # matches
    ;;
  *)
    echo "FAIL: expected error to contain 'Invalid transition', got: $RESPONSE_ERROR"
    PASS=false
    ;;
esac

if [ "$PASS" = "true" ]; then
  echo "PASS: HTTP 400 + 'Invalid transition' confirmed — D-01 state-machine guard is active."
  exit 0
else
  echo "FAIL: D-01 regression failed — review output above."
  exit 1
fi
