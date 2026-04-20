#!/bin/bash
# Spotify OAuth helper — gets a refresh token for the Grumpy dashboard.
# Usage: ./spotify-auth.sh <client_id> <client_secret>

set -e

CLIENT_ID="${1}"
CLIENT_SECRET="${2}"
REDIRECT_URI="http://127.0.0.1:8888/callback"
SCOPES="user-read-currently-playing user-modify-playback-state user-read-playback-state"

if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
  echo "Usage: $0 <client_id> <client_secret>"
  exit 1
fi

# URL-encode the scopes
ENCODED_SCOPES=$(echo "$SCOPES" | sed 's/ /%20/g')

AUTH_URL="https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${REDIRECT_URI}&scope=${ENCODED_SCOPES}"

echo ""
echo "=== Spotify Authorization ==="
echo ""
echo "1. Open this URL in your browser:"
echo ""
echo "   $AUTH_URL"
echo ""
echo "2. Authorize the app. You'll be redirected to a page that won't load."
echo "   That's fine — just copy the URL from your browser's address bar."
echo "   It will look like: http://127.0.0.1:8888/callback?code=AQD..."
echo ""
echo "3. Paste the FULL redirect URL here:"
echo ""
read -p "   URL: " CALLBACK_URL

# Extract the code from the URL
CODE=$(echo "$CALLBACK_URL" | grep -oP 'code=\K[^&]+')

if [ -z "$CODE" ]; then
  echo "Error: Could not extract code from URL"
  exit 1
fi

echo ""
echo "Exchanging code for tokens..."
echo ""

RESPONSE=$(curl -s -X POST https://accounts.spotify.com/api/token \
  -d "grant_type=authorization_code" \
  -d "code=${CODE}" \
  -d "redirect_uri=${REDIRECT_URI}" \
  -d "client_id=${CLIENT_ID}" \
  -d "client_secret=${CLIENT_SECRET}")

# Check for error
if echo "$RESPONSE" | grep -q '"error"'; then
  echo "Error from Spotify:"
  echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
  exit 1
fi

REFRESH_TOKEN=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['refresh_token'])" 2>/dev/null)

if [ -z "$REFRESH_TOKEN" ]; then
  echo "Error: No refresh token in response"
  echo "$RESPONSE"
  exit 1
fi

echo "=== Success! ==="
echo ""
echo "Your refresh token:"
echo ""
echo "   $REFRESH_TOKEN"
echo ""
echo "Paste this into the Grumpy dashboard settings panel under Music → Spotify → Refresh Token"
echo ""
