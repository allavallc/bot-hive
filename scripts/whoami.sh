#!/usr/bin/env bash
# scripts/whoami.sh - bot identity + role resolver (FS-028 / HV-133).
#
# Reads .bot-hive-identity, derives the repo full name from
# `git remote get-url origin`, calls POST /api/bots/join on the
# platform server (idempotent: returns the existing seat for an
# already-active bot, allocates a new seat for a fresh one or
# reactivates an offline row), and prints the same four-line format
# as the old event-log-scan version so downstream consumers don't
# break.
#
# Server URL: $BOT_HIVE_API_URL or https://bot-hive-j0ax.onrender.com.

set -euo pipefail

LOG_FILE="$(pwd)/.bot-hive.log"
log() {
    printf '%s [whoami] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$LOG_FILE" 2>/dev/null || true
}
log "invoked (pid=$$, cwd=$(pwd))"

API_BASE="${BOT_HIVE_API_URL:-https://bot-hive-j0ax.onrender.com}"
log "api base: $API_BASE"

if [ -f .bot-hive-identity ]; then
  COLONY=$(grep '^colony=' .bot-hive-identity | head -1 | cut -d= -f2- | tr -d '\r')
  HANDLE=$(grep '^handle=' .bot-hive-identity | head -1 | cut -d= -f2- | tr -d '\r')
  EXPLICIT_ROLE=$(grep '^role=' .bot-hive-identity | head -1 | cut -d= -f2- | tr -d '[:space:]\r' || true)
fi
log "identity loaded: colony='${COLONY:-}' handle='${HANDLE:-}' explicit_role='${EXPLICIT_ROLE:-}'"
HANDLE="${HANDLE:-${BOT_HIVE_HANDLE:-}}"
EXPLICIT_ROLE="${EXPLICIT_ROLE:-}"

if [ -z "$HANDLE" ]; then
  echo "error: no bot identity found (.bot-hive-identity missing and BOT_HIVE_HANDLE unset)." >&2
  exit 2
fi
COLONY="${COLONY:-$HANDLE}"
ACTOR="${COLONY}.${HANDLE}"

# Derive the repo full name from origin. Handles HTTPS and SSH remotes.
ORIGIN_URL=$(git remote get-url origin 2>/dev/null || true)
if [ -z "$ORIGIN_URL" ]; then
  echo "error: no 'origin' git remote configured." >&2
  exit 3
fi
REPO_FULL_NAME=$(echo "$ORIGIN_URL" | sed -E 's#(\.git)?$##; s#^https?://[^/]+/##; s#^git@[^:]+:##')
if [ -z "$REPO_FULL_NAME" ] || ! echo "$REPO_FULL_NAME" | grep -q '/'; then
  echo "error: could not parse 'owner/repo' from origin URL: $ORIGIN_URL" >&2
  exit 3
fi

# Call the server. POST /join is idempotent — returns the same seat for
# an already-active bot, allocates one for a fresh bot or reactivates an
# offline row.
PAYLOAD=$(printf '{"repo_full_name":"%s","colony":"%s","handle":"%s"}' \
  "$REPO_FULL_NAME" "$COLONY" "$HANDLE")
log "POST ${API_BASE}/api/bots/join payload=$PAYLOAD"
RESPONSE=$(curl -sS -X POST \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  -w "\n%{http_code}" \
  "${API_BASE}/api/bots/join") || {
    log "join failed: curl error"
    echo "error: server unreachable; cannot resolve role (${API_BASE})." >&2
    exit 4
  }

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
log "join response: http_code=$HTTP_CODE body=$BODY"

if [ "$HTTP_CODE" != "200" ]; then
  log "join non-200; exit 5"
  echo "error: server returned ${HTTP_CODE}: ${BODY}" >&2
  exit 5
fi

# Parse JSON. Use a tiny grep/sed extractor — avoiding a jq dependency.
extract() {
  echo "$BODY" | grep -oE "\"$1\"[[:space:]]*:[[:space:]]*[^,}]+" | head -1 | sed -E "s/\"$1\"[[:space:]]*:[[:space:]]*//; s/^\"//; s/\"$//"
}

SEAT=$(extract seat)
TOTAL=$(extract total)
SERVER_ROLE=$(extract role)
SKILLS=$(echo "$BODY" | grep -oE '"skill_files"[[:space:]]*:[[:space:]]*\[[^]]*\]' | sed -E 's/.*\[//; s/\].*//; s/"//g; s/[[:space:]]+/ /g; s/,/, /g; s/ +,/,/g')

ROLES="$SERVER_ROLE"
ROLE_SOURCE="heuristic"

# HV-122 still honored client-side: explicit role= in .bot-hive-identity
# overrides the server's seat-derived role. Total stays at the real value.
if [ -n "$EXPLICIT_ROLE" ]; then
  case "$EXPLICIT_ROLE" in
    pm) ROLES="PM"; SKILLS="hive/skills/pm.md"; ROLE_SOURCE="explicit (.bot-hive-identity role=pm)" ;;
    coder) ROLES="coder"; SKILLS="hive/skills/coder.md"; ROLE_SOURCE="explicit (.bot-hive-identity role=coder)" ;;
    tester) ROLES="tester"; SKILLS="hive/skills/tester.md"; ROLE_SOURCE="explicit (.bot-hive-identity role=tester)" ;;
    *) echo "warn: unknown role '${EXPLICIT_ROLE}' in .bot-hive-identity; valid values are pm, coder, tester. Falling back to the server's role." >&2 ;;
  esac
fi

echo "actor: ${ACTOR}"
echo "colony bots active: ${TOTAL} (you are ${SEAT}/${TOTAL})"
echo "role: ${ROLES}"
echo "role source: ${ROLE_SOURCE}"
echo "read these skill files: ${SKILLS}"
