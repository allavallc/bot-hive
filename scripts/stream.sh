#!/usr/bin/env bash
# scripts/stream.sh — HV-136 bot SSE listener (POSIX version).
#
# Mirror of scripts/stream.ps1. Opens a long-lived SSE connection to
# /api/bots/stream and writes .bot-hive-role-notice on each `your-role`
# event. When this process dies, the TCP socket closes and the server
# reaps the seat after a 15s grace.

set -euo pipefail

API_BASE="${BOT_HIVE_API_URL:-https://bot-hive-j0ax.onrender.com}"

if [ ! -f ".bot-hive-identity" ]; then
    echo "stream.sh: .bot-hive-identity not found" >&2
    exit 2
fi
COLONY=$(awk -F= '/^colony=/ {print $2}' .bot-hive-identity | tr -d '\r')
HANDLE=$(awk -F= '/^handle=/ {print $2}' .bot-hive-identity | tr -d '\r')
if [ -z "$COLONY" ] || [ -z "$HANDLE" ]; then
    echo "stream.sh: .bot-hive-identity must set colony= and handle=" >&2
    exit 2
fi

ORIGIN_URL=$(git remote get-url origin 2>/dev/null || true)
if [ -z "$ORIGIN_URL" ]; then
    echo "stream.sh: no 'origin' git remote" >&2
    exit 3
fi
REPO=$(echo "$ORIGIN_URL" | sed -E 's/\.git$//' | sed -E 's#^https?://[^/]+/##' | sed -E 's#^git@[^:]+:##')

echo "$$" > .bot-hive-stream.pid

NOTICE_FILE=".bot-hive-role-notice"

# URL-encode using printf+jq is overkill; the values are safe ASCII.
URL="${API_BASE}/api/bots/stream?repo_full_name=${REPO}&colony=${COLONY}&handle=${HANDLE}"

RETRY=2
MAX_RETRY=30

while true; do
    # -N disables curl's output buffering; -s suppresses progress.
    # Exit code 0 only if the server closed cleanly. Anything else: retry.
    if curl -sN --no-buffer "$URL" 2>/dev/null | while IFS= read -r line; do
        case "$line" in
            "data: "*)
                payload="${line#data: }"
                # Naive JSON field extraction (jq dependency would be heavier).
                if echo "$payload" | grep -q '"type":"your-role"'; then
                    role=$(echo "$payload" | sed -E 's/.*"role":"([^"]*)".*/\1/')
                    seat=$(echo "$payload" | sed -E 's/.*"seat":([0-9]+).*/\1/')
                    total=$(echo "$payload" | sed -E 's/.*"total":([0-9]+).*/\1/')
                    {
                        echo "role=$role"
                        echo "seat=$seat"
                        echo "total=$total"
                        echo "at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
                    } > "$NOTICE_FILE"
                fi
                ;;
        esac
    done; then
        RETRY=2  # clean close — reset backoff
    fi
    sleep "$RETRY"
    RETRY=$((RETRY * 2))
    if [ "$RETRY" -gt "$MAX_RETRY" ]; then RETRY=$MAX_RETRY; fi
done
