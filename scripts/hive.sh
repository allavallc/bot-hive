#!/usr/bin/env bash
# scripts/hive.sh -- bot-hive CLI helper.
#
# Usage:
#   ./scripts/hive.sh start            Start this bot session (primary or secondary)
#   ./scripts/hive.sh stop             Stop this bot: kill SSE listener, clean state, print all-clear

set -euo pipefail

usage() {
  echo "Usage:"
  echo "  ./scripts/hive.sh start            Start this bot session"
  echo "  ./scripts/hive.sh stop             Stop this bot + clean local state"
  echo ""
  echo "To add more bots: open a new terminal and type 'start the hive'."
  echo "The server assigns each bot its handle and role automatically."
}

resolve_bot_state_dir() {
  node ./scripts/bot-session.mjs state-dir 2>/dev/null || pwd
}

start_bot() {
  node ./scripts/hive-start.mjs
}

stop_bot() {
  local state_dir log_file pid_path
  state_dir="$(resolve_bot_state_dir)"
  log_file="$state_dir/.bot-hive.log"
  _hive_stop_log() {
    printf '%s [hive-stop] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$log_file" 2>/dev/null || true
  }

  _hive_stop_log "invoked in $(pwd); stateDir=$state_dir"

  pid_path="$state_dir/.bot-hive-stream.pid"
  if [ -f "$pid_path" ]; then
    local stream_pid
    stream_pid="$(cat "$pid_path" 2>/dev/null || true)"
    if [ -n "$stream_pid" ]; then
      if kill -0 "$stream_pid" 2>/dev/null; then
        _hive_stop_log "found .bot-hive-stream.pid -> PID $stream_pid (alive=true)"
        if kill "$stream_pid" 2>/dev/null; then
          _hive_stop_log "killed PID $stream_pid"
        else
          _hive_stop_log "kill of PID $stream_pid failed"
        fi
      else
        _hive_stop_log "found .bot-hive-stream.pid -> PID $stream_pid (alive=false); nothing to kill"
      fi
    else
      _hive_stop_log "found .bot-hive-stream.pid but it was empty"
    fi
    rm -f "$pid_path"
    _hive_stop_log "deleted .bot-hive-stream.pid"
  else
    _hive_stop_log "no .bot-hive-stream.pid found"
  fi

  for f in .bot-hive-role-notice .bot-hive-role-bootannounced .bot-hive-role-cache .bot-hive-heartbeat.pid .bot-hive-session-active; do
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
    echo "Role assignment is now server-side. Open a new terminal and type 'start the hive' -- the server will assign the correct role."
    exit 1
    ;;
  start)
    start_bot
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
