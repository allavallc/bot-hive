#!/usr/bin/env bash
# scripts/check-role.sh - detect mid-session role shift (FS-028 / HV-133).
#
# Designed to run from the agent host's "before user prompt" hook on
# every operator turn. Compares the server's current seat+role to a
# small cache file; on change, prints a one-line notice the host hook
# can inject as a system note. Silent (no stdout) when nothing changed.
#
# Cache: .bot-hive-role-cache (single line: "seat=N;role=ROLE").
# Server URL: $BOT_HIVE_API_URL or https://bot-hive-j0ax.onrender.com.

set -euo pipefail

API_BASE="${BOT_HIVE_API_URL:-https://bot-hive-j0ax.onrender.com}"
CACHE_FILE=".bot-hive-role-cache"

# Silently exit 0 if there's no identity file — the operator's main
# checkout has no bot identity and we don't want to spam an agent host
# that runs this hook for non-bot sessions.
[ -f .bot-hive-identity ] || exit 0

COLONY=$(grep '^colony=' .bot-hive-identity | head -1 | cut -d= -f2- | tr -d '\r')
HANDLE=$(grep '^handle=' .bot-hive-identity | head -1 | cut -d= -f2- | tr -d '\r')
[ -n "$HANDLE" ] || exit 0
[ -n "$COLONY" ] || COLONY="$HANDLE"

ORIGIN_URL=$(git remote get-url origin 2>/dev/null || true)
[ -n "$ORIGIN_URL" ] || exit 0
REPO_FULL_NAME=$(echo "$ORIGIN_URL" | sed -E 's#(\.git)?$##; s#^https?://[^/]+/##; s#^git@[^:]+:##')
echo "$REPO_FULL_NAME" | grep -q '/' || exit 0

RESPONSE=$(curl -sS -G \
  --data-urlencode "repo_full_name=${REPO_FULL_NAME}" \
  --data-urlencode "colony=${COLONY}" \
  --data-urlencode "handle=${HANDLE}" \
  -w "\n%{http_code}" \
  --max-time 5 \
  "${API_BASE}/api/bots/whoami" 2>/dev/null) || exit 0

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# 404 = not yet joined. Silent; the boot flow handles joining.
[ "$HTTP_CODE" = "200" ] || exit 0

extract() {
  echo "$BODY" | grep -oE "\"$1\"[[:space:]]*:[[:space:]]*[^,}]+" | head -1 | sed -E "s/\"$1\"[[:space:]]*:[[:space:]]*//; s/^\"//; s/\"$//"
}

SEAT=$(extract seat)
TOTAL=$(extract total)
ROLE=$(extract role)

PREV_SEAT=""
PREV_ROLE=""
if [ -f "$CACHE_FILE" ]; then
  CACHE_LINE=$(head -1 "$CACHE_FILE")
  PREV_SEAT=$(echo "$CACHE_LINE" | sed -E 's/.*seat=([^;]+).*/\1/' | tr -d '[:space:]')
  PREV_ROLE=$(echo "$CACHE_LINE" | sed -E 's/.*role=(.*)/\1/')
fi

# Update cache regardless — first run primes it, subsequent runs keep it fresh.
printf 'seat=%s;role=%s\n' "$SEAT" "$ROLE" > "$CACHE_FILE"

if [ "$PREV_SEAT" = "$SEAT" ] && [ "$PREV_ROLE" = "$ROLE" ]; then
  exit 0
fi

# Suppress the notice on first run (no prior cache) so a clean boot
# doesn't fire a "role changed" message immediately after /join.
if [ -z "$PREV_SEAT" ]; then
  exit 0
fi

cat <<EOF
[BOT-HIVE] Role changed: you are now seat ${SEAT} of ${TOTAL}, role: ${ROLE}.
Announce this to the operator before continuing.
EOF
