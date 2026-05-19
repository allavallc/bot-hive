#!/usr/bin/env bash
# scripts/stream.sh -- FS-030 bot SSE listener (POSIX version).
#
# Mirror of scripts/stream.ps1. Connects with colony only; the server
# assigns a handle returned in the first your-role event. Writes
# .bot-hive-identity and .bot-hive-role-notice after receiving the
# assignment.
#
# Multi-bot isolation: if another bot's .bot-hive-stream.pid is already
# alive at cwd, this script creates worktrees/<handle>/ and writes all
# state files there, plus .bot-hive-role-ptr at cwd.
#
# Diagnostic log: .bot-hive.log in cwd.

set -euo pipefail

CWD="$(pwd)"
LOG_FILE="$CWD/.bot-hive.log"
OWNER_FILE="$CWD/.bot-hive-session-owner"

log() {
    printf '%s [stream] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$LOG_FILE" 2>/dev/null || true
}

cleanup_owner() {
    if [ -f "$OWNER_FILE" ]; then
        local owner_pid owner_session
        owner_pid=$(sed -n 's/^pid=//p' "$OWNER_FILE" 2>/dev/null | head -n1)
        owner_session=$(sed -n 's/^client_session_id=//p' "$OWNER_FILE" 2>/dev/null | head -n1)
        if [ "$owner_pid" = "$$" ] && [ "$owner_session" = "$CLIENT_SESSION_ID" ]; then
            rm -f "$OWNER_FILE"
            log "deleted .bot-hive-session-owner"
        fi
    fi
    log "script exiting via trap (signal or normal exit)"
}

session_key() {
    local tty_name
    tty_name=$(ps -o tty= -p $$ 2>/dev/null | tr -d ' ')
    if [ -n "$tty_name" ] && [ "$tty_name" != "?" ]; then
        printf 'tty:%s:%s' "$tty_name" "$CWD"
        return
    fi
    printf 'ppid:%s:%s' "$PPID" "$CWD"
}

CLIENT_SESSION_ID="$(session_key)"

trap cleanup_owner EXIT

log "starting (pid=$$, cwd=$CWD)"
log "client_session_id=$CLIENT_SESSION_ID"

if [ -f "$OWNER_FILE" ]; then
    owner_pid=$(sed -n 's/^pid=//p' "$OWNER_FILE" 2>/dev/null | head -n1)
    owner_session=$(sed -n 's/^client_session_id=//p' "$OWNER_FILE" 2>/dev/null | head -n1)
    if [ -n "$owner_pid" ] && kill -0 "$owner_pid" 2>/dev/null && [ "$owner_session" = "$CLIENT_SESSION_ID" ] && [ "$owner_pid" != "$$" ]; then
        log "duplicate startup refused for client_session_id=$CLIENT_SESSION_ID owner_pid=$owner_pid"
        echo "stream.sh: duplicate hive stream refused for this terminal session (owner pid $owner_pid)" >&2
        exit 4
    fi
fi

{
    echo "client_session_id=$CLIENT_SESSION_ID"
    echo "pid=$$"
    echo "cwd=$CWD"
    echo "at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$OWNER_FILE"
log "wrote .bot-hive-session-owner (client_session_id=$CLIENT_SESSION_ID pid=$$)"

API_BASE="${BOT_HIVE_API_URL:-https://bot-hive-j0ax.onrender.com}"
log "api base: $API_BASE"

# Colony from gh CLI.
COLONY=$(gh api user --jq .login 2>/dev/null || true)
if [ -z "$COLONY" ]; then
    log "FATAL: could not resolve colony via 'gh api user'"
    echo "stream.sh: could not resolve colony from 'gh api user'" >&2
    exit 2
fi
log "colony: $COLONY"

# Repo full name from origin.
ORIGIN_URL=$(git remote get-url origin 2>/dev/null || true)
if [ -z "$ORIGIN_URL" ]; then
    log "FATAL: no 'origin' git remote"
    echo "stream.sh: no 'origin' git remote" >&2
    exit 3
fi
REPO=$(echo "$ORIGIN_URL" | sed -E 's/\.git$//' | sed -E 's#^https?://[^/]+/##' | sed -E 's#^git@[^:]+:##')
log "repo: $REPO"

# Detect secondary bot (another stream already alive at cwd).
IS_SECONDARY=false
if [ -f "$CWD/.bot-hive-stream.pid" ]; then
    EXISTING_PID=$(cat "$CWD/.bot-hive-stream.pid" 2>/dev/null || true)
    if [ -n "$EXISTING_PID" ] && kill -0 "$EXISTING_PID" 2>/dev/null; then
        IS_SECONDARY=true
    fi
fi
log "secondary=$IS_SECONDARY"

# Primary: write PID now. Secondary: deferred until we know the handle.
if [ "$IS_SECONDARY" = false ]; then
    echo "$$" > "$CWD/.bot-hive-stream.pid"
    log "wrote .bot-hive-stream.pid (PID=$$)"
fi

# State directory — updated once we know the handle (secondary).
STATE_DIR="$CWD"
HANDLE=""

set_state_paths() {
    local handle="$1"
    if [ "$IS_SECONDARY" = true ]; then
        local wt="$CWD/worktrees/$handle"
        if [ ! -d "$wt" ]; then
            log "creating worktree at $wt"
            git worktree add "$wt" -b "${handle}-work" main 2>>"$LOG_FILE" || true
        else
            log "worktree $wt already exists"
        fi
        STATE_DIR="$wt"
        echo "$$" > "$wt/.bot-hive-stream.pid"
        log "wrote $wt/.bot-hive-stream.pid (PID=$$)"
        printf 'worktrees/%s' "$handle" > "$CWD/.bot-hive-role-ptr"
        log "wrote .bot-hive-role-ptr -> worktrees/$handle"
    fi
    printf 'colony=%s\nhandle=%s\n' "$COLONY" "$handle" > "$STATE_DIR/.bot-hive-identity"
    log "wrote $STATE_DIR/.bot-hive-identity (colony=$COLONY handle=$handle)"
}

write_role_notice() {
    local role="$1" seat="$2" total="$3" skill_files="$4"
    {
        echo "handle=$HANDLE"
        echo "role=$role"
        echo "seat=$seat"
        echo "total=$total"
        echo "skillFiles=$skill_files"
        echo "at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    } > "$STATE_DIR/.bot-hive-role-notice"
    log "wrote .bot-hive-role-notice (role='$role' seat=$seat total=$total)"
}

URL="${API_BASE}/api/bots/stream?repo_full_name=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$REPO" 2>/dev/null || echo "$REPO")&colony=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$COLONY" 2>/dev/null || echo "$COLONY")&client_session_id=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$CLIENT_SESSION_ID" 2>/dev/null || echo "$CLIENT_SESSION_ID")"

RETRY=2
MAX_RETRY=30

while true; do
    log "connecting to ${API_BASE}/api/bots/stream?..."
    if curl -sN --no-buffer "$URL" 2>>"$LOG_FILE" | while IFS= read -r line; do
        case "$line" in
            "data: "*)
                payload="${line#data: }"
                if echo "$payload" | grep -q '"type":"your-role"'; then
                    evt_handle=$(echo "$payload" | sed -E 's/.*"handle":"([^"]*)".*/\1/')
                    role=$(echo "$payload" | sed -E 's/.*"role":"([^"]*)".*/\1/')
                    seat=$(echo "$payload" | sed -E 's/.*"seat":([0-9]+).*/\1/')
                    total=$(echo "$payload" | sed -E 's/.*"total":([0-9]+).*/\1/')
                    skill_files=$(echo "$payload" | python3 -c "import json,sys; d=json.load(sys.stdin); print(','.join(d.get('skillFiles',[])))" 2>/dev/null || echo "")
                    log "event: your-role handle='$evt_handle' role='$role' seat=$seat total=$total"
                    if [ -z "$HANDLE" ]; then
                        HANDLE="$evt_handle"
                        set_state_paths "$evt_handle"
                    fi
                    write_role_notice "$role" "$seat" "$total" "$skill_files"
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
