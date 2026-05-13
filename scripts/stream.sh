#!/usr/bin/env bash
# scripts/stream.sh -- HV-136 bot SSE listener (POSIX version) with diagnostic logging.
#
# Mirror of scripts/stream.ps1. Opens a long-lived SSE connection to
# /api/bots/stream and writes .bot-hive-role-notice on each `your-role`
# event. When this process dies, the TCP socket closes and the server
# reaps the seat after a 15s grace.
#
# Diagnostic log: .bot-hive.log in cwd (same dir as the pid file).
# Tagged lines from this script use [stream]. Format:
#   <ISO8601-UTC> [stream] <message>

set -euo pipefail

LOG_FILE="$(pwd)/.bot-hive.log"

log() {
    # Logging must never break the script. Swallow any failure.
    printf '%s [stream] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$LOG_FILE" 2>/dev/null || true
}

trap 'log "script exiting via trap (signal or normal exit)"' EXIT

log "starting (pid=$$, cwd=$(pwd))"

API_BASE="${BOT_HIVE_API_URL:-https://bot-hive-j0ax.onrender.com}"
log "api base: $API_BASE"

if [ ! -f ".bot-hive-identity" ]; then
    log "FATAL: .bot-hive-identity not found in $(pwd)"
    echo "stream.sh: .bot-hive-identity not found" >&2
    exit 2
fi
COLONY=$(awk -F= '/^colony=/ {print $2}' .bot-hive-identity | tr -d '\r')
HANDLE=$(awk -F= '/^handle=/ {print $2}' .bot-hive-identity | tr -d '\r')
if [ -z "$COLONY" ] || [ -z "$HANDLE" ]; then
    log "FATAL: .bot-hive-identity must set colony= and handle= (got colony='$COLONY' handle='$HANDLE')"
    echo "stream.sh: .bot-hive-identity must set colony= and handle=" >&2
    exit 2
fi
log "identity: colony=$COLONY handle=$HANDLE"

ORIGIN_URL=$(git remote get-url origin 2>/dev/null || true)
if [ -z "$ORIGIN_URL" ]; then
    log "FATAL: no 'origin' git remote"
    echo "stream.sh: no 'origin' git remote" >&2
    exit 3
fi
REPO=$(echo "$ORIGIN_URL" | sed -E 's/\.git$//' | sed -E 's#^https?://[^/]+/##' | sed -E 's#^git@[^:]+:##')
log "repo: $REPO"

echo "$$" > .bot-hive-stream.pid
log "wrote .bot-hive-stream.pid (PID=$$)"

NOTICE_FILE=".bot-hive-role-notice"

URL="${API_BASE}/api/bots/stream?repo_full_name=${REPO}&colony=${COLONY}&handle=${HANDLE}"

RETRY=2
MAX_RETRY=30

while true; do
    log "connecting to $URL"
    # Stream from curl line by line and log events.
    # The `if ... then` pattern captures the pipeline's exit code without
    # tripping `set -e` -- a clean exit (rc=0) means the server closed,
    # any other rc means a network/curl error.
    if curl -sN --no-buffer "$URL" 2>>"$LOG_FILE" | while IFS= read -r line; do
        case "$line" in
            "data: "*)
                payload="${line#data: }"
                if echo "$payload" | grep -q '"type":"your-role"'; then
                    role=$(echo "$payload" | sed -E 's/.*"role":"([^"]*)".*/\1/')
                    seat=$(echo "$payload" | sed -E 's/.*"seat":([0-9]+).*/\1/')
                    total=$(echo "$payload" | sed -E 's/.*"total":([0-9]+).*/\1/')
                    log "event: your-role role='$role' seat=$seat total=$total"
                    {
                        echo "role=$role"
                        echo "seat=$seat"
                        echo "total=$total"
                        echo "at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
                    } > "$NOTICE_FILE"
                    log "wrote $NOTICE_FILE"
                else
                    log "event: (non-role) $payload"
                fi
                ;;
            ":"*)
                log "keepalive: $line"
                ;;
        esac
    done; then
        log "stream closed cleanly (rc=0)"
        RETRY=2
    else
        log "stream closed with non-zero rc"
    fi
    log "sleeping ${RETRY}s before reconnect"
    sleep "$RETRY"
    RETRY=$((RETRY * 2))
    if [ "$RETRY" -gt "$MAX_RETRY" ]; then RETRY=$MAX_RETRY; fi
done
