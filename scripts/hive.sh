#!/usr/bin/env bash
# scripts/hive.sh -- bot-hive CLI for spawning and stopping bots.
#
# Usage:
#   ./scripts/hive.sh start -coder      Spawn a new bot intended as a coder
#   ./scripts/hive.sh start -tester     Spawn a new bot intended as a tester
#   ./scripts/hive.sh stop              Stop this bot: kill SSE listener, clean state, print all-clear
#
# 'start' requires at least one active bot in the colony already (the PM).
# Run "start the hive" in a Claude session at the bot-hive root first to
# create the PM bot.

set -e

usage() {
  echo "Usage:"
  echo "  ./scripts/hive.sh start -coder      Spawn a coder bot"
  echo "  ./scripts/hive.sh start -tester     Spawn a tester bot"
  echo "  ./scripts/hive.sh stop              Stop this bot + clean local state"
}

count_active_bots() {
  # Count active bots across all worktrees by checking .bot-hive-stream.pid files.
  # A bot is "active" if its pid file exists and the process is alive.
  local count=0
  while IFS= read -r wt_path; do
    [ -z "$wt_path" ] && continue
    local pid_file="$wt_path/.bot-hive-stream.pid"
    if [ -f "$pid_file" ]; then
      local pid
      pid=$(cat "$pid_file" 2>/dev/null)
      if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        count=$((count + 1))
      fi
    fi
  done < <(git worktree list --porcelain | sed -n 's/^worktree //p')
  echo "$count"
}

spawn_bot() {
  local intended_role="$1"

  local active_count
  active_count=$(count_active_bots)

  if [ "$active_count" -eq 0 ]; then
    echo "Error: no active bot in this colony."
    echo "Run 'start the hive' in a Claude session at the bot-hive root first to create the PM bot, then retry."
    exit 1
  fi

  # Role-flag validation. Per hive/roles.md:
  #   total=2 -> seats: "PM + tester", "coder"     (new bot at seat 2 -> coder)
  #   total=3 -> seats: "PM", "coder", "tester"    (new bot at seat 3 -> tester)
  # So -coder needs >=1 active bot (becomes bot 2). -tester needs >=2 (becomes bot 3).
  if [ "$intended_role" = "tester" ] && [ "$active_count" -lt 2 ]; then
    echo "Error: cannot spawn a tester with only $active_count bot(s) active."
    echo "Spawn a coder first: './scripts/hive.sh start -coder'"
    echo "(Per hive/roles.md the tester is seat 3 in the colony — the PM and a coder must exist first.)"
    exit 1
  fi

  local colony
  colony=$(gh api user --jq .login 2>/dev/null)
  if [ -z "$colony" ]; then
    echo "Error: could not determine colony from 'gh api user'. Make sure 'gh' is authenticated."
    exit 1
  fi

  local handles_file="hive/handles.txt"
  if [ ! -f "$handles_file" ]; then
    echo "Error: $handles_file not found"
    exit 1
  fi

  # Pick the first handle in hive/handles.txt with no events log yet.
  local handle=""
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    case "$line" in \#*) continue ;; esac
    local trimmed
    trimmed=$(echo "$line" | tr -d '[:space:]')
    [ -z "$trimmed" ] && continue
    if [ ! -f "hive/events/${colony}.${trimmed}.log" ]; then
      handle="$trimmed"
      break
    fi
  done < "$handles_file"

  if [ -z "$handle" ]; then
    echo "Error: no free handles in $handles_file (every pool handle has an events log)."
    exit 1
  fi

  local worktree_path="worktrees/${handle}"
  if [ -d "$worktree_path" ]; then
    echo "Error: worktree at $worktree_path already exists."
    exit 1
  fi

  # Create the worktree on its own branch off main.
  git worktree add "$worktree_path" -b "${handle}-work" main

  # Identity file (no BOM; printf is plain bytes).
  printf "colony=%s\nhandle=%s\n" "$colony" "$handle" > "$worktree_path/.bot-hive-identity"

  # One-shot kickoff marker -- bootstrap consumes (deletes) it.
  : > "$worktree_path/.bot-hive-kickoff"

  echo ""
  echo "Spawned bot: worktrees/${handle}"
  echo "  colony=${colony}, handle=${handle}"
  echo "  intended role: ${intended_role} (server confirms based on consolidation rules)"
  echo ""
  echo "Next: open a new terminal, cd ${worktree_path}, then start your agent (claude / codex / etc.)."
  echo "The kickoff marker triggers bootstrap automatically."
}

stop_bot() {
  # Mirrors the procedure in hive/bot-shutdown.md so the operator can
  # run it without an agent.
  if [ -f .bot-hive-stream.pid ]; then
    local stream_pid
    stream_pid=$(cat .bot-hive-stream.pid 2>/dev/null)
    if [ -n "$stream_pid" ]; then
      kill "$stream_pid" 2>/dev/null || true
    fi
    rm -f .bot-hive-stream.pid
  fi
  rm -f .bot-hive-role-notice .bot-hive-role-bootannounced .bot-hive-role-cache .bot-hive-heartbeat.pid
  echo "Signed off. Safe to close this window."
}

cmd="${1:-}"
flag="${2:-}"

case "$cmd" in
  start)
    case "$flag" in
      -coder)  spawn_bot "coder" ;;
      -tester) spawn_bot "tester" ;;
      *)
        echo "Error: 'start' requires -coder or -tester"
        usage
        exit 1
        ;;
    esac
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
