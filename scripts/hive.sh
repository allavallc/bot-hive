#!/usr/bin/env bash
# scripts/hive.sh -- bot-hive CLI for spawning and stopping bots.
#
# Usage:
#   ./scripts/hive.sh add coder       Spawn a new bot intended as a coder
#   ./scripts/hive.sh add tester      Spawn a new bot intended as a tester
#   ./scripts/hive.sh stop            Stop this bot: kill SSE listener, clean state, print all-clear
#
# 'add' requires at least one active bot in the colony already (the PM).
# Run "start the hive" in a Claude session at the bot-hive root first to
# create the PM bot.
#
# Also see AGENTS.md "Spawn / shutdown chat phrases" -- 'hive add coder',
# 'hive add tester', and the sign-off phrases trigger an agent to invoke
# this script on the operator's behalf.

set -e

usage() {
  echo "Usage:"
  echo "  ./scripts/hive.sh add coder       Spawn a coder bot"
  echo "  ./scripts/hive.sh add tester      Spawn a tester bot"
  echo "  ./scripts/hive.sh stop            Stop this bot + clean local state"
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

  local log_file
  log_file="$(pwd)/.bot-hive.log"
  _hive_add_log() {
    printf '%s [hive-add] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$log_file" 2>/dev/null || true
  }

  _hive_add_log "invoked: intended_role=$intended_role cwd=$(pwd)"

  local active_count
  active_count=$(count_active_bots)
  _hive_add_log "active bot count across worktrees: $active_count"

  if [ "$active_count" -eq 0 ]; then
    _hive_add_log "refusing: no active bot in colony"
    echo "Error: no active bot in this colony."
    echo "Run 'start the hive' in a Claude session at the bot-hive root first to create the PM bot, then retry."
    exit 1
  fi

  # Role-flag validation. Per hive/roles.md:
  #   total=2 -> seats: "PM + tester", "coder"     (new bot at seat 2 -> coder)
  #   total=3 -> seats: "PM", "coder", "tester"    (new bot at seat 3 -> tester)
  # So -coder needs >=1 active bot (becomes bot 2). -tester needs >=2 (becomes bot 3).
  if [ "$intended_role" = "tester" ] && [ "$active_count" -lt 2 ]; then
    _hive_add_log "refusing: tester needs >=2 active bots (have $active_count)"
    echo "Error: cannot spawn a tester with only $active_count bot(s) active."
    echo "Spawn a coder first: './scripts/hive.sh add coder'"
    echo "(Per hive/roles.md the tester is seat 3 in the colony -- the PM and a coder must exist first.)"
    exit 1
  fi

  local colony
  colony=$(gh api user --jq .login 2>/dev/null)
  if [ -z "$colony" ]; then
    _hive_add_log "refusing: could not resolve colony via 'gh api user'"
    echo "Error: could not determine colony from 'gh api user'. Make sure 'gh' is authenticated."
    exit 1
  fi
  _hive_add_log "resolved colony=$colony"

  local handles_file="hive/handles.txt"
  if [ ! -f "$handles_file" ]; then
    _hive_add_log "refusing: $handles_file missing"
    echo "Error: $handles_file not found"
    exit 1
  fi

  # Pick the first handle in hive/handles.txt that is free OR orphaned.
  # "Free"     = no events log AND no worktree directory.
  # "Orphaned" = worktree exists with .bot-hive-kickoff but no active stream pid —
  #              a prior spawn ran but the bot session never connected. Reuse it.
  local handle=""
  local reuse_worktree=false
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    case "$line" in \#*) continue ;; esac
    local trimmed
    trimmed=$(echo "$line" | tr -d '[:space:]')
    [ -z "$trimmed" ] && continue
    if [ -f "hive/events/${colony}.${trimmed}.log" ]; then
      _hive_add_log "skipping '$trimmed': events log exists"
      continue
    fi
    if [ -d "worktrees/${trimmed}" ]; then
      if [ -f "worktrees/${trimmed}/.bot-hive-kickoff" ]; then
        local alive=false
        if [ -f "worktrees/${trimmed}/.bot-hive-stream.pid" ]; then
          local pid
          pid=$(cat "worktrees/${trimmed}/.bot-hive-stream.pid" 2>/dev/null)
          [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && alive=true
        fi
        if [ "$alive" = false ]; then
          _hive_add_log "reusing orphaned worktree '$trimmed' (kickoff present, no active stream)"
          handle="$trimmed"
          reuse_worktree=true
          break
        fi
      fi
      _hive_add_log "skipping '$trimmed': active worktree exists"
      continue
    fi
    handle="$trimmed"
    break
  done < "$handles_file"

  if [ -z "$handle" ]; then
    _hive_add_log "refusing: no free handles in pool"
    echo "Error: no free handles in $handles_file (every pool handle has an events log or an existing worktree)."
    exit 1
  fi
  _hive_add_log "picked handle='$handle'"

  local worktree_path="worktrees/${handle}"

  if [ "$reuse_worktree" = false ]; then
    if [ -d "$worktree_path" ]; then
      _hive_add_log "refusing: worktree at $worktree_path unexpectedly exists (race condition?)"
      echo "Error: worktree at $worktree_path already exists."
      exit 1
    fi

    # Create the worktree on its own branch off main.
    _hive_add_log "git worktree add $worktree_path -b ${handle}-work main"
    if ! git worktree add "$worktree_path" -b "${handle}-work" main; then
      _hive_add_log "git worktree add failed"
      echo "Error: git worktree add failed"
      exit 1
    fi
    _hive_add_log "worktree created"

    # Identity file (no BOM; printf is plain bytes).
    printf "colony=%s\nhandle=%s\n" "$colony" "$handle" > "$worktree_path/.bot-hive-identity"
    _hive_add_log "wrote $worktree_path/.bot-hive-identity (colony=$colony handle=$handle)"

    # One-shot kickoff marker -- bootstrap consumes (deletes) it.
    : > "$worktree_path/.bot-hive-kickoff"
    _hive_add_log "wrote $worktree_path/.bot-hive-kickoff (kickoff marker)"
  fi

  _hive_add_log "spawn complete: worktrees/$handle"

  echo ""
  echo "Spawned bot: worktrees/${handle}"
  echo "  colony=${colony}, handle=${handle}"
  echo "  intended role: ${intended_role} (server confirms based on consolidation rules)"
  echo ""
  echo "Next: open a new terminal at the repo root and type:"
  echo "  hive add ${intended_role}"
  echo "That session will connect as '${handle}' and receive its role from the server."
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
role="${2:-}"

case "$cmd" in
  add)
    case "$role" in
      coder)  spawn_bot "coder" ;;
      tester) spawn_bot "tester" ;;
      *)
        echo "Error: 'add' requires 'coder' or 'tester'"
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
