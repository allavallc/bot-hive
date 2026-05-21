#!/usr/bin/env bash
# scripts/hive.sh -- bot-hive CLI helper.
#
# Usage:
#   ./scripts/hive.sh start            Start this bot session (primary or secondary)
#   ./scripts/hive.sh add              Human-facing alias for start
#   ./scripts/hive.sh stop             Stop this bot: kill SSE listener, clean state, print all-clear
#   ./scripts/hive.sh shutdown         Human-facing alias for stop

set -euo pipefail

usage() {
  echo "Usage:"
  echo "  ./scripts/hive.sh start            Start this bot session"
  echo "  ./scripts/hive.sh add              Alias: add a bot via the canonical startup path"
  echo "  ./scripts/hive.sh stop             Stop this bot + clean local state"
  echo "  ./scripts/hive.sh shutdown         Alias: sign off this bot via the canonical shutdown path"
  echo ""
  echo "Human-facing bot commands: 'hive add a bot' to start, 'hive shutdown' to sign off."
  echo "The server assigns each bot its handle and role automatically."
}

resolve_bot_state_dir() {
  node ./scripts/bot-session.mjs state-dir 2>/dev/null || pwd
}

start_bot() {
  node ./scripts/hive-start.mjs
}

stop_bot() {
  local state_dir log_file pid_path record_env record_stream_pid pid_file_stream_pid
  state_dir="$(resolve_bot_state_dir)"
  record_env="$(node ./scripts/bot-session.mjs current-record-env 2>/dev/null || true)"
  if [ -n "$record_env" ]; then
    while IFS='=' read -r key value; do
      case "$key" in
        state_dir) [ -n "$value" ] && state_dir="$value" ;;
        stream_pid) record_stream_pid="$value" ;;
      esac
    done <<< "$record_env"
  fi

  log_file="$state_dir/.bot-hive.log"
  _hive_stop_log() {
    printf '%s [hive-stop] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$log_file" 2>/dev/null || true
  }

  _hive_stop_log "invoked in $(pwd); stateDir=$state_dir"

  if [ -f "$state_dir/.bot-hive-session-active" ]; then
    rm -f "$state_dir/.bot-hive-session-active"
    _hive_stop_log "deleted .bot-hive-session-active to request stream self-exit"
  else
    _hive_stop_log "no .bot-hive-session-active found"
  fi

  pid_path="$state_dir/.bot-hive-stream.pid"
  if [ -f "$pid_path" ]; then
    pid_file_stream_pid="$(cat "$pid_path" 2>/dev/null || true)"
    _hive_stop_log "found .bot-hive-stream.pid -> PID ${pid_file_stream_pid:-<empty>}"
  else
    _hive_stop_log "no .bot-hive-stream.pid found"
  fi

  for stream_pid in "$record_stream_pid" "$pid_file_stream_pid"; do
    [ -n "${stream_pid:-}" ] || continue
    if kill -0 "$stream_pid" 2>/dev/null; then
      if kill "$stream_pid" 2>/dev/null; then
        _hive_stop_log "sent TERM to PID $stream_pid"
      else
        _hive_stop_log "TERM to PID $stream_pid failed"
      fi
    else
      _hive_stop_log "PID $stream_pid not killable from this runtime; relying on session-active self-exit"
    fi
  done

  if [ -f "$pid_path" ]; then
    local waited
    waited=0
    while [ -f "$pid_path" ] && [ "$waited" -lt 20 ]; do
      sleep 1
      waited=$((waited + 1))
    done
    if [ -f "$pid_path" ]; then
      _hive_stop_log "stream pid file still present after ${waited}s; deleting stale marker locally"
      rm -f "$pid_path"
    else
      _hive_stop_log "stream pid file cleared after ${waited}s"
    fi
  fi

  for f in .bot-hive-role-notice .bot-hive-role-bootannounced .bot-hive-role-cache .bot-hive-heartbeat.pid; do
    if [ -f "$state_dir/$f" ]; then
      rm -f "$state_dir/$f"
      _hive_stop_log "deleted $f"
    fi
  done

  node ./scripts/bot-session.mjs clear-current >/dev/null 2>&1 || true
  _hive_stop_log "cleared current session registry entry"
  _hive_stop_log "done; printing all-clear"
  echo "Signed off. Safe to close this window."
}

cmd="${1:-}"
case "$cmd" in
  add)
    start_bot
    ;;
  add-a-bot)
    start_bot
    ;;
  start)
    start_bot
    ;;
  shutdown)
    stop_bot
    ;;
  stop)
    stop_bot
    ;;
  ""|help|-h|--help)
    usage
    ;;
  *)
    echo "Error: unknown command '$cmd'"
    usage
    exit 1
    ;;
esac
