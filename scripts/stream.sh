#!/usr/bin/env bash
# scripts/stream.sh -- FS-030 bot SSE listener (POSIX version).
#
# Mirror of scripts/stream.ps1. Connects with colony only; the server
# assigns a handle returned in the first your-role event. Writes
# .bot-hive-identity and .bot-hive-role-notice after receiving the
# assignment.
#
# Multi-bot isolation: each startup gets a request-scoped handoff file.
# If another stream already owns cwd, this script creates worktrees/<handle>/
# for the new bot and writes the handoff to .bot-hive-startups/<startup-id>.json.
# No shared root role pointer is used.
#
# Diagnostic log: .bot-hive.log in cwd.

set -euo pipefail

STARTUP_ID=""
while [ $# -gt 0 ]; do
    case "$1" in
        --startup-id)
            STARTUP_ID="${2:-}"
            shift 2
            ;;
        *)
            echo "stream.sh: unknown argument '$1'" >&2
            exit 64
            ;;
    esac
done

CWD="$(pwd)"
LOG_FILE="$CWD/.bot-hive.log"

log() {
    printf '%s [stream] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$LOG_FILE" 2>/dev/null || true
}

trap 'log "script exiting via trap (signal or normal exit)"' EXIT

log "starting (pid=$$, cwd=$CWD)"

if [ -n "${BOT_HIVE_API_URL:-}" ]; then
    API_BASE="$BOT_HIVE_API_URL"
elif [ -f "$CWD/.bot-hive-api-url" ]; then
    API_BASE="$(tr -d '\r\n' < "$CWD/.bot-hive-api-url")"
else
    API_BASE="https://bot-hive-j0ax.onrender.com"
fi
log "api base: $API_BASE"

# Colony from gh CLI, with a local identity-file fallback for already-bootstrapped
# local checkouts where gh credentials are unavailable to the spawned process.
COLONY=$(gh api user --jq .login 2>/dev/null || true)
if [ -z "$COLONY" ]; then
    COLONY="$(sed -n 's/^colony=//p' "$CWD/.bot-hive-identity" 2>/dev/null | head -n 1 || true)"
    if [ -n "$COLONY" ]; then
        log "colony fallback: .bot-hive-identity"
    fi
fi
if [ -z "$COLONY" ]; then
    log "FATAL: could not resolve colony via 'gh api user' or .bot-hive-identity"
    echo "stream.sh: could not resolve colony from 'gh api user' or .bot-hive-identity" >&2
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

IS_SECONDARY=false
# If cwd already has a live stream, this startup becomes a secondary bot
# with state isolated under worktrees/<handle>/. STARTUP_ID disambiguates
# the foreground handoff so simultaneous Bot 2 / Bot 3 startups do not race.
if [ -f "$CWD/.bot-hive-stream.pid" ]; then
    EXISTING_PID=$(cat "$CWD/.bot-hive-stream.pid" 2>/dev/null || true)
    if [ -n "$EXISTING_PID" ] && kill -0 "$EXISTING_PID" 2>/dev/null; then
        if [ -z "$STARTUP_ID" ]; then
            log "FATAL: live stream already owns cwd (PID=$EXISTING_PID), but no startup id was provided"
            echo "stream.sh: live .bot-hive-stream.pid already exists; startup must pass --startup-id for same-root multi-bot startup." >&2
            exit 6
        fi
        IS_SECONDARY=true
        log "live root stream detected (PID=$EXISTING_PID); secondary startup id=$STARTUP_ID"
    elif [ -n "$EXISTING_PID" ]; then
        rm -f "$CWD/.bot-hive-stream.pid"
        log "removed stale .bot-hive-stream.pid (PID=$EXISTING_PID was not alive)"
    fi
fi

if [ "$IS_SECONDARY" = false ]; then
    for stale_file in "$CWD/.bot-hive-role-notice" "$CWD/.bot-hive-role-ptr" "$CWD/.bot-hive-role-bootannounced"; do
        if [ -e "$stale_file" ]; then
            rm -f "$stale_file"
            log "removed stale cwd artifact: $(basename "$stale_file")"
        fi
    done

    echo "$$" > "$CWD/.bot-hive-stream.pid"
    log "wrote .bot-hive-stream.pid (PID=$$)"
fi

STATE_DIR="$CWD"
HANDLE=""
SESSION_ID=""

# For a primary bot restarting after its stream died: reclaim the previously-
# assigned handle so the server rebinds the same seat. Secondary bots must
# not read the root identity file — they receive their handle from the server.
PREFERRED_RECONNECT_HANDLE=""
if [ "$IS_SECONDARY" = false ]; then
    PREV_HANDLE=$(sed -n 's/^handle=//p' "$CWD/.bot-hive-identity" 2>/dev/null | head -n 1 || true)
    if [ -n "$PREV_HANDLE" ]; then
        PREFERRED_RECONNECT_HANDLE="$PREV_HANDLE"
        log "primary restart: will request reclaim of handle '$PREV_HANDLE'"
    fi
fi

set_state_paths() {
    local handle="$1"
    if [ "$IS_SECONDARY" = true ]; then
        local wt="$CWD/worktrees/$handle"
        if [ ! -d "$wt" ]; then
            log "creating worktree at $wt"
            if ! git worktree add "$wt" -B "${handle}-work" main >>"$LOG_FILE" 2>&1; then
                log "git worktree add failed; falling back to local shared clone at $wt"
                git clone --shared --no-checkout "$CWD" "$wt" >>"$LOG_FILE" 2>&1
                git -C "$wt" checkout -B "${handle}-work" HEAD >>"$LOG_FILE" 2>&1
            fi
        else
            log "worktree $wt already exists"
        fi
        STATE_DIR="$wt"
        echo "$$" > "$wt/.bot-hive-stream.pid"
        log "wrote $wt/.bot-hive-stream.pid (PID=$$)"
    fi
    printf 'colony=%s\nhandle=%s\nsession_id=%s\n' "$COLONY" "$handle" "$SESSION_ID" > "$STATE_DIR/.bot-hive-identity"
    log "wrote $STATE_DIR/.bot-hive-identity (colony=$COLONY handle=$handle session_id=$SESSION_ID)"
}

write_startup_handoff() {
    local role="$1" seat="$2" total="$3" skill_files="$4"
    [ -n "$STARTUP_ID" ] || return 0
    mkdir -p "$CWD/.bot-hive-startups"
    local state_abs
    state_abs="$(cd "$STATE_DIR" && pwd)"
    python3 - "$STARTUP_ID" "$state_abs" "$COLONY" "$HANDLE" "$role" "$seat" "$total" "$skill_files" > "$CWD/.bot-hive-startups/${STARTUP_ID}.json" <<'PY'
import json, sys
startup_id, state_dir, colony, handle, role, seat, total, skill_files = sys.argv[1:]
print(json.dumps({
    "startupId": startup_id,
    "stateDir": state_dir,
    "noticePath": f"{state_dir}/.bot-hive-role-notice",
    "colony": colony,
    "handle": handle,
    "role": role,
    "seat": int(seat),
    "total": int(total),
    "skillFiles": [s for s in skill_files.split(",") if s],
}, separators=(",", ":")))
PY
    log "wrote startup handoff .bot-hive-startups/${STARTUP_ID}.json"
}

write_role_notice() {
    local role="$1" seat="$2" total="$3" skill_files="$4" departed="$5"
    {
        echo "handle=$HANDLE"
        echo "role=$role"
        echo "seat=$seat"
        echo "total=$total"
        echo "skillFiles=$skill_files"
        echo "session_id=$SESSION_ID"
        echo "at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
        [ -n "$departed" ] && echo "departed=$departed"
    } > "$STATE_DIR/.bot-hive-role-notice"
    log "wrote .bot-hive-role-notice (role='$role' seat=$seat total=$total departed='$departed' session_id=$SESSION_ID)"
}

RETRY=2
MAX_RETRY=30

while true; do
    QUERY="repo_full_name=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$REPO" 2>/dev/null || echo "$REPO")&colony=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$COLONY" 2>/dev/null || echo "$COLONY")"
    # Reconnect with the confirmed handle once one has been assigned.
    # On first connect, use the previously-assigned handle from .bot-hive-identity
    # (primary only) so the server rebinds the same seat. Secondary bots never
    # use the root identity file — they get their handle from the server.
    PREFERRED_HANDLE="$HANDLE"
    if [ -z "$PREFERRED_HANDLE" ] && [ -n "$PREFERRED_RECONNECT_HANDLE" ]; then
        PREFERRED_HANDLE="$PREFERRED_RECONNECT_HANDLE"
    fi
    if [ -n "$PREFERRED_HANDLE" ]; then
        QUERY="${QUERY}&handle=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$PREFERRED_HANDLE" 2>/dev/null || echo "$PREFERRED_HANDLE")"
    fi
    URL="${API_BASE}/api/bots/stream?${QUERY}"
    log "connecting to ${API_BASE}/api/bots/stream?..."
    if while IFS= read -r line; do
        case "$line" in
            "data: "*)
                payload="${line#data: }"
                if echo "$payload" | grep -q '"type":"your-role"'; then
                    evt_handle=$(echo "$payload" | sed -E 's/.*"handle":"([^"]*)".*/\1/')
                    role=$(echo "$payload" | sed -E 's/.*"role":"([^"]*)".*/\1/')
                    seat=$(echo "$payload" | sed -E 's/.*"seat":([0-9]+).*/\1/')
                    total=$(echo "$payload" | sed -E 's/.*"total":([0-9]+).*/\1/')
                    skill_files=$(echo "$payload" | python3 -c "import json,sys; d=json.load(sys.stdin); print(','.join(d.get('skillFiles',[])))" 2>/dev/null || echo "")
                    departed=$(echo "$payload" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('departed',''))" 2>/dev/null || echo "")
                    evt_session_id=$(echo "$payload" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('sessionId',''))" 2>/dev/null || echo "")
                    log "event: your-role handle='$evt_handle' role='$role' seat=$seat total=$total departed='$departed' sessionId='$evt_session_id'"
                    if [ -z "$HANDLE" ]; then
                        SESSION_ID="$evt_session_id"
                        HANDLE="$evt_handle"
                        set_state_paths "$evt_handle"
                    elif [ "$HANDLE" != "$evt_handle" ]; then
                        log "FATAL: server returned handle '$evt_handle' for existing stream handle '$HANDLE'"
                        echo "stream.sh: server returned a different handle for this stream; refusing to mix bot state." >&2
                        exit 7
                    fi
                    write_role_notice "$role" "$seat" "$total" "$skill_files" "$departed"
                    write_startup_handoff "$role" "$seat" "$total" "$skill_files"
                else
                    log "event: (non-role) $payload"
                fi
                ;;
            ":"*)
                log "keepalive: $line"
                # Exit if the agent hasn't fired a prompt in 15 minutes.
                if [ -n "$HANDLE" ]; then
                    ACT_FILE="$STATE_DIR/.bot-hive-session-active"
                    if [ -f "$ACT_FILE" ]; then
                        AGE=$(python3 -c "import os,time; print(int(time.time()-os.path.getmtime('$ACT_FILE')))" 2>/dev/null || echo 0)
                        if [ "$AGE" -gt 900 ]; then
                            log "session-active is ${AGE}s stale (>900s); agent is gone, exiting"
                            exit 0
                        fi
                    fi
                fi
                ;;
        esac
    done < <(curl -sN --no-buffer "$URL" 2>>"$LOG_FILE"); then
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
