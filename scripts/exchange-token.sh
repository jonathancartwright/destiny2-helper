#!/bin/bash
# Exchange OAuth authorization code for access tokens
# Run this script locally on your machine

API_KEY="6a153957f81b44b5ae6bdd5be5a2b6c9"
CLIENT_ID="51424"
CLIENT_SECRET="bFcJmQEOG8kAmwSUjmD4Pjd-p0WQVVPeDzVnVT3KnNk"
AUTH_CODE="${1:-9ca86e5c14a6407410e2c007f080634a}"

echo "Exchanging authorization code for tokens..."
echo ""

RESPONSE=$(curl -s -X POST "https://www.bungie.net/platform/app/oauth/token/" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-API-Key: $API_KEY" \
  -d "grant_type=authorization_code" \
  -d "code=$AUTH_CODE" \
  -d "client_id=$CLIENT_ID" \
  -d "client_secret=$CLIENT_SECRET")

echo "Response from Bungie:"
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

echo ""
echo "---"
echo "If successful, copy the access_token and membership_id values to your .env file"
