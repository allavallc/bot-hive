#!/usr/bin/env bash
# scripts/heartbeat.sh - background liveness ping (FS-028 / HV-133).
#
# Launched at bot bootstrap (see hive/bot-startup.md). Pings
# POST /api/bots/heartbeat every 5 minutes. Writes its own PID to
# .bot-hive-heartbeat.pid so the shutdown procedure can stop it.
#
# Designed to be backgrounded: `nohup ./scripts/heartbeat.sh &`.
# Closing the terminal session naturally kills the background process,
# which is the intended liveness signal — the server's sweep-on-request
# reclaim picks up the dead seat ~15 min later.

set -euo pipefail

API_BASE="${BOT_HIVE_API_URL:-https://bot-hive-j0ax.onrender.com}"
INTERVAL_SECONDS="${BOT_HIVE_HEARTBEAT_SECONDS:-300}"
PID_FILE=".bot-hive-heartbeat.pid"

if [ ! -f .bot-hive-identity ]; then
  echo "heartbeat: no .bot-hive-identity; exiting." >&2
  exit 2
fi

COLONY=$(grep '^colony=' .bot-hive-identity | head -1 | cut -d= -f2- | tr -d '\r')
HANDLE=$(grep '^handle=' .bot-hive-identity | head -1 | cut -d= -f2- | tr -d '\r')
[ -n "$HANDLE" ] || { echo "heartbeat: no handle." >&2; exit 2; }
[ -n "$COLONY" ] || COLONY="$HANDLE"

ORIGIN_URL=$(git remote get-url origin 2>/dev/null || true)
[ -n "$ORIGIN_URL" ] || { echo "heartbeat: no origin remote." >&2; exit 2; }
REPO_FULL_NAME=$(echo "$ORIGIN_URL" | sed -E 's#(\.git)?$##; s#^https?://[^/]+/##; s#^git@[^:]+:##')

echo $$ > "$PID_FILE"

while true; do
  PAYLOAD=$(printf '{"repo_full_name":"%s","colony":"%s","handle":"%s"}' \
    "$REPO_FULL_NAME" "$COLONY" "$HANDLE")
  curl -sS -X POST \
    -H "Content-Type: application/json" \
    --max-time 10 \
    -d "$PAYLOAD" \
    "${API_BASE}/api/bots/heartbeat" \
    >/dev/null 2>&1 || true
  sleep "$INTERVAL_SECONDS"
done
