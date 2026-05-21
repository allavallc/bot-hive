#!/usr/bin/env bash
# scripts/stream.sh -- FS-030 bot SSE listener (POSIX version).
#
# Connects to /api/bots/stream with colony only. The server assigns a
# handle in the first your-role event. Writes .bot-hive-identity and
# .bot-hive-role-notice after receiving the assignment.
#
# Multi-bot isolation: each startup gets a request-scoped handoff file.
# If another stream already owns cwd, this script creates worktrees/<handle>/
# for the new bot and writes the handoff to .bot-hive-startups/<startup-id>.json.
# No shared root role pointer is used.
#
# Diagnostic log: .bot-hive.log in cwd.

set -euo pipefail

STARTUP_ID=""
if [[ "${1:-}" == "--startup-id" ]]; then
  STARTUP_ID="${2:-}"
  shift 2
fi

CWD="$(pwd)"
LOG_FILE="$CWD/.bot-hive.log"
PID_FILE_PATH=""

log() {
  printf '%s [stream] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$LOG_FILE" 2>/dev/null || true
}

cleanup_pid_file() {
  local pid_path="$1"
  [ -n "$pid_path" ] || return 0
  [ -f "$pid_path" ] || return 0
  local recorded_pid
  recorded_pid="$(cat "$pid_path" 2>/dev/null || true)"
  if [ "$recorded_pid" = "$$" ]; then
    rm -f "$pid_path"
    log "removed stream pid file $pid_path"
  fi
}

trap 'cleanup_pid_file "$PID_FILE_PATH"; log "script exiting via trap (signal or normal exit)"' EXIT
log "starting (pid=$$, cwd=$CWD, startup_id=$STARTUP_ID)"

read_local_value() {
  local path="$1" key="$2"
  [ -f "$path" ] || return 0
  grep "^${key}=" "$path" | head -1 | cut -d= -f2- | tr -d '\r' || true
}

LOCAL_API_BASE_PATH="$CWD/.bot-hive-api-url"
LOCAL_DEV_LOG_PATH="$CWD/.bot-hive-dev.log"
read_dev_log_urls() {
  local log_path="$1"
  [ -f "$log_path" ] || return 0
  python3 - "$log_path" <<'PY'
import re, sys
path = sys.argv[1]
try:
    text = open(path, 'r', encoding='utf-8', errors='ignore').read()
except OSError:
    raise SystemExit(0)
locals_ = re.findall(r'Local:\s+(http://localhost:\d+)', text)
networks = re.findall(r'Network:\s+(http://[^\s]+)', text)
if locals_:
    print(f"LOCAL={locals_[-1]}")
if networks:
    print(f"NETWORK={networks[-1]}")
PY
}
probe_api_base() {
  local base="$1"
  [ -n "$base" ] || return 1
  curl -fsS --max-time 2 "$base/" >/dev/null 2>&1
}
DEV_LOG_LOCAL_API_BASE=""
DEV_LOG_NETWORK_API_BASE=""
while IFS='=' read -r key value; do
  case "$key" in
    LOCAL) DEV_LOG_LOCAL_API_BASE="$value" ;;
    NETWORK) DEV_LOG_NETWORK_API_BASE="$value" ;;
  esac
done < <(read_dev_log_urls "$LOCAL_DEV_LOG_PATH")
if [ -n "${BOT_HIVE_API_URL:-}" ]; then
  API_BASE="$BOT_HIVE_API_URL"
elif [ -f "$LOCAL_API_BASE_PATH" ]; then
  API_BASE="$(tr -d '\r\n' < "$LOCAL_API_BASE_PATH")"
else
  API_BASE="${DEV_LOG_LOCAL_API_BASE:-}"
  if [ -z "$API_BASE" ] && [ -n "$DEV_LOG_NETWORK_API_BASE" ]; then
    API_BASE="$DEV_LOG_NETWORK_API_BASE"
  fi
fi
if [ -n "$DEV_LOG_LOCAL_API_BASE" ] && [ -n "$API_BASE" ] && [ "$DEV_LOG_LOCAL_API_BASE" != "$API_BASE" ] && [[ "$API_BASE" == http://localhost:* ]]; then
  log "api base override: .bot-hive-api-url said '$API_BASE' but .bot-hive-dev.log shows '$DEV_LOG_LOCAL_API_BASE'; preferring dev log local URL"
  API_BASE="$DEV_LOG_LOCAL_API_BASE"
fi
if [[ "$API_BASE" == http://localhost:* ]] && ! probe_api_base "$API_BASE" && [ -n "$DEV_LOG_NETWORK_API_BASE" ]; then
  log "api base localhost probe failed for '$API_BASE'; falling back to dev-log network URL '$DEV_LOG_NETWORK_API_BASE'"
  API_BASE="$DEV_LOG_NETWORK_API_BASE"
fi
if [ -n "$API_BASE" ] && [ -z "${BOT_HIVE_API_URL:-}" ]; then
  printf '%s\n' "$API_BASE" > "$LOCAL_API_BASE_PATH"
  log "api base persisted to .bot-hive-api-url: $API_BASE"
fi
if [ -z "$API_BASE" ]; then
  API_BASE="https://bot-hive-j0ax.onrender.com"
fi
log "api base: $API_BASE"

COLONY="$(gh api user --jq .login 2>/dev/null || true)"
if [ -z "$COLONY" ]; then
  COLONY="$(read_local_value "$CWD/.bot-hive-identity" colony)"
  [ -n "$COLONY" ] && log "colony fallback: .bot-hive-identity"
fi
if [ -z "$COLONY" ]; then
  log "FATAL: could not resolve colony via 'gh api user' or .bot-hive-identity'"
  echo "stream.sh: could not resolve colony from 'gh api user' or .bot-hive-identity" >&2
  exit 2
fi
log "colony: $COLONY"

ORIGIN_URL="$(git remote get-url origin 2>/dev/null || true)"
if [ -z "$ORIGIN_URL" ]; then
  log "FATAL: no 'origin' git remote"
  echo "stream.sh: no 'origin' git remote" >&2
  exit 3
fi
REPO="$(echo "$ORIGIN_URL" | sed -E 's/\.git$//' | sed -E 's#^https?://[^/]+/##' | sed -E 's#^git@[^:]+:##')"
log "repo: $REPO"

IS_SECONDARY=false
if [ -f "$CWD/.bot-hive-stream.pid" ]; then
  EXISTING_PID="$(cat "$CWD/.bot-hive-stream.pid" 2>/dev/null || true)"
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
  for stale in "$CWD/.bot-hive-role-notice" "$CWD/.bot-hive-role-bootannounced"; do
    if [ -f "$stale" ]; then
      rm -f "$stale"
      log "removed stale cwd artifact: $(basename "$stale")"
    fi
  done
  echo "$$" > "$CWD/.bot-hive-stream.pid"
  PID_FILE_PATH="$CWD/.bot-hive-stream.pid"
  log "wrote .bot-hive-stream.pid (PID=$$)"
fi

PREFERRED_RECONNECT_HANDLE=""
if [ "$IS_SECONDARY" = false ]; then
  PREFERRED_RECONNECT_HANDLE="$(read_local_value "$CWD/.bot-hive-identity" handle)"
  if [ -n "$PREFERRED_RECONNECT_HANDLE" ]; then
    log "primary restart: will request reclaim of handle '$PREFERRED_RECONNECT_HANDLE'"
  fi
fi

STATE_DIR="$CWD"
HANDLE=""
SESSION_ID=""
SESSION_ACTIVE_EVER_SEEN=false

set_state_paths() {
  local handle="$1"
  if [ "$IS_SECONDARY" = true ]; then
    local wt="$CWD/worktrees/$handle"
    if [ ! -d "$wt" ]; then
      log "creating worktree at $wt"
      git worktree add "$wt" -B "${handle}-work" main >>"$LOG_FILE" 2>&1 || {
        log "FATAL: git worktree add failed for $wt"
        exit 8
      }
    else
      log "worktree $wt already exists"
    fi
    STATE_DIR="$wt"
    echo "$$" > "$wt/.bot-hive-stream.pid"
    PID_FILE_PATH="$wt/.bot-hive-stream.pid"
    log "wrote $wt/.bot-hive-stream.pid (PID=$$)"
  fi
  printf 'colony=%s\nhandle=%s\nsession_id=%s\n' "$COLONY" "$handle" "$SESSION_ID" > "$STATE_DIR/.bot-hive-identity"
  log "wrote $STATE_DIR/.bot-hive-identity (colony=$COLONY handle=$handle session_id=$SESSION_ID)"
}

write_startup_handoff() {
  local role="$1" seat="$2" total="$3" skill_files="$4" departed="$5"
  [ -n "$STARTUP_ID" ] || return 0
  local handoff_dir="$CWD/.bot-hive-startups"
  mkdir -p "$handoff_dir"
  python3 - "$handoff_dir" "$STARTUP_ID" "$STATE_DIR" "$COLONY" "$HANDLE" "$role" "$seat" "$total" "$skill_files" "$departed" "$SESSION_ID" <<'PY'
import json, os, sys, datetime
handoff_dir, startup_id, state_dir, colony, handle, role, seat, total, skill_files, departed, session_id = sys.argv[1:]
payload = {
    "startupId": startup_id,
    "state": "live",
    "stateDir": os.path.abspath(state_dir),
    "noticePath": os.path.join(os.path.abspath(state_dir), ".bot-hive-role-notice"),
    "colony": colony,
    "handle": handle,
    "role": role,
    "seat": int(seat),
    "total": int(total),
    "skillFiles": [s for s in skill_files.split(",") if s],
    "departed": departed,
    "sessionId": session_id,
    "streamPid": os.getpid(),
    "reason": "",
    "at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
}
with open(os.path.join(handoff_dir, f"{startup_id}.json"), "w", encoding="utf-8") as f:
    json.dump(payload, f, separators=(",", ":"))
PY
  log "wrote startup handoff .bot-hive-startups/$STARTUP_ID.json"
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
  log "wrote .bot-hive-role-notice (role='$role' seat=$seat total=$total departed='$departed')"
}

python_quote='import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))'
URL="$API_BASE/api/bots/stream?repo_full_name=$(python3 -c "$python_quote" "$REPO")&colony=$(python3 -c "$python_quote" "$COLONY")"
RETRY=2
MAX_RETRY=30

while true; do
  PREFERRED="$HANDLE"
  if [ -z "$PREFERRED" ]; then PREFERRED="$PREFERRED_RECONNECT_HANDLE"; fi
  FINAL_URL="$URL"
  if [ -n "$PREFERRED" ]; then
    FINAL_URL="$FINAL_URL&handle=$(python3 -c "$python_quote" "$PREFERRED")"
  fi
  log "connecting to $FINAL_URL"
  if curl -sN --no-buffer "$FINAL_URL" 2>>"$LOG_FILE" | while IFS= read -r line; do
    case "$line" in
      "data: "*)
        payload="${line#data: }"
        if echo "$payload" | grep -q '"type":"your-role"'; then
          evt_handle=$(echo "$payload" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("handle",""))')
          role=$(echo "$payload" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("role",""))')
          seat=$(echo "$payload" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("seat",0))')
          total=$(echo "$payload" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("total",0))')
          skill_files=$(echo "$payload" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(",".join(d.get("skillFiles",[])))')
          departed=$(echo "$payload" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("departed", ""))')
          session_id=$(echo "$payload" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("sessionId", ""))')
          log "event: your-role handle='$evt_handle' role='$role' seat=$seat total=$total sessionId='$session_id'"
          if [ -z "$HANDLE" ]; then
            HANDLE="$evt_handle"
            SESSION_ID="$session_id"
            set_state_paths "$evt_handle"
            echo "role=$role" > "$STATE_DIR/.bot-hive-role-bootannounced"
            log "wrote boot bootannounced stamp (role='$role')"
          elif [ "$HANDLE" != "$evt_handle" ]; then
            log "FATAL: server returned handle '$evt_handle' for existing stream handle '$HANDLE'"
            exit 7
          fi
          write_role_notice "$role" "$seat" "$total" "$skill_files" "$departed"
          write_startup_handoff "$role" "$seat" "$total" "$skill_files" "$departed"
        else
          log "event: (non-role) $payload"
        fi
        ;;
      :*)
        log "keepalive: $line"
        if [ -n "$HANDLE" ]; then
          act_file="$STATE_DIR/.bot-hive-session-active"
          if [ -f "$act_file" ]; then
            SESSION_ACTIVE_EVER_SEEN=true
            age_min=$(python3 - "$act_file" <<'PY'
import os, sys, time
print((time.time() - os.path.getmtime(sys.argv[1])) / 60.0)
PY
)
            if python3 - "$age_min" <<'PY'
import sys
sys.exit(0 if float(sys.argv[1]) > 15 else 1)
PY
            then
              log "session-active is stale (>15m); agent is gone, exiting"
              exit 0
            fi
          elif [ "$SESSION_ACTIVE_EVER_SEEN" = true ]; then
            log "session-active gone after being seen; agent exited without killing stream; exiting"
            exit 0
          fi
        fi
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
  RETRY=$(( RETRY * 2 ))
  if [ "$RETRY" -gt "$MAX_RETRY" ]; then RETRY=$MAX_RETRY; fi
done
