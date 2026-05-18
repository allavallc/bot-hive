#!/usr/bin/env bash
# scripts/hive.sh -- bot-hive CLI helper.
#
# Usage:
#   ./scripts/hive.sh start [local]   Start this bot and print the assigned role handoff
#   ./scripts/hive.sh stop            Stop this bot: kill SSE listener, clean state, print all-clear
#
# To add more bots: open a new terminal and type "start the hive".
# The server assigns each bot's role automatically.

set -e

usage() {
  echo "Usage:"
  echo "  ./scripts/hive.sh start [local]   Start this bot + print assigned role"
  echo "  ./scripts/hive.sh stop            Stop this bot + clean local state"
  echo ""
  echo "To add more bots: open a new terminal and type 'start the hive'."
  echo "The server assigns each bot's role automatically."
}

start_bot() {
  local mode="${1:-}"
  local startup_id
  startup_id="startup-$(date -u +%Y%m%dT%H%M%SZ)-$$"

  if [ -f .bot-hive-stream.pid ]; then
    local stream_pid
    stream_pid=$(cat .bot-hive-stream.pid 2>/dev/null || true)
    if [ -n "$stream_pid" ] && ! kill -0 "$stream_pid" 2>/dev/null; then
      rm -f .bot-hive-stream.pid
    fi
  fi

  local started_at
  started_at=$(date +%s)
  if [ "$mode" = "local" ] || [ "$mode" = "-local" ] || [ "$mode" = "--local" ]; then
    BOT_HIVE_API_URL=http://localhost:3000 nohup ./scripts/stream.sh --startup-id "$startup_id" >/dev/null 2>&1 &
  else
    nohup ./scripts/stream.sh --startup-id "$startup_id" >/dev/null 2>&1 &
  fi

  local deadline handoff_path notice_path handoff_json state_dir
  deadline=$(( $(date +%s) + 30 ))
  handoff_path=".bot-hive-startups/$startup_id.json"
  notice_path=""
  handoff_json=""
  state_dir="$(pwd)"

  while [ "$(date +%s)" -lt "$deadline" ]; do
    if [ -f "$handoff_path" ]; then
      handoff_json="$handoff_path"
      state_dir=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["stateDir"])' "$handoff_path")
      notice_path="$state_dir/.bot-hive-role-notice"
      break
    fi
    sleep 0.2
  done

  if [ -z "$notice_path" ] || [ ! -f "$notice_path" ]; then
    echo "STARTUP_ID=$startup_id"
    echo "ERROR=no startup handoff appeared within 30s"
    [ -f .bot-hive.log ] && tail -80 .bot-hive.log
    exit 2
  fi

  echo "STARTUP_ID=$startup_id"
  echo "HANDOFF_PATH=$handoff_path"
  echo "NOTICE_PATH=$notice_path"
  echo "SESSION_ROOT=$state_dir"
  echo "---NOTICE---"
  cat "$notice_path"
}

stop_bot() {
  # Mirrors the procedure in hive/bot-shutdown.md so the operator can
  # run it without an agent. Logs every step to .bot-hive.log [hive-stop]
  # so the operator can audit what got killed/deleted and when.
  local log_file
  log_file="$(pwd)/.bot-hive.log"
  _hive_stop_log() {
    printf '%s [hive-stop] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$log_file" 2>/dev/null || true
  }

  _hive_stop_log "invoked in $(pwd)"

  if [ -f .bot-hive-stream.pid ]; then
    local stream_pid
    stream_pid=$(cat .bot-hive-stream.pid 2>/dev/null)
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
    rm -f .bot-hive-stream.pid
    _hive_stop_log "deleted .bot-hive-stream.pid"
  else
    _hive_stop_log "no .bot-hive-stream.pid found"
  fi

  for f in .bot-hive-role-notice .bot-hive-role-bootannounced .bot-hive-role-cache .bot-hive-heartbeat.pid; do
    if [ -f "$f" ]; then
      rm -f "$f"
      _hive_stop_log "deleted $f"
    fi
  done

  _hive_stop_log "done; printing all-clear"
  echo "Signed off. Safe to close this window."
}

cmd="${1:-}"
mode="${2:-}"

case "$cmd" in
  add)
    echo "Role assignment is now server-side. Open a new terminal and type 'start the hive' -- the server will assign the correct role."
    exit 1
    ;;
  start)
    start_bot "$mode"
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
