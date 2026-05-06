#!/usr/bin/env bash
# Print the tickets owned by *this* agent — the agent-id assigned to the
# current clone (HV-074). Use at session start to find work the previous
# session of the same agent left mid-flight.
#
# Resolution order for agent-id (matches AGENTS.md "Identity" section):
#   1. `git config bot-hive.agent-id`
#   2. Default-derive: `${git config user.email}@${HOSTNAME}`
#
# Usage:
#   ./scripts/my-work.sh              # print my tickets
#   ./scripts/my-work.sh --agent <id> # print tickets for a different agent
#
# Output: one line per ticket: <state> <hv-id> <title>
# Exit 0 always.

set -euo pipefail

agent_id=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent) agent_id="$2"; shift 2 ;;
    --help|-h)
      echo "usage: $0 [--agent <id>]"
      echo "  Lists in-progress + in-review tickets owned by the given agent-id"
      echo "  (defaults to this clone's agent-id from git config or auto-derive)."
      exit 0
      ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "error: not in a git repository" >&2
  exit 2
}
cd "$repo_root"

if [[ -z "$agent_id" ]]; then
  # Resolve via git config first.
  agent_id=$(git config bot-hive.agent-id 2>/dev/null || true)
fi

if [[ -z "$agent_id" ]]; then
  # Default-derive: <email>@<hostname>
  email=$(git config user.email 2>/dev/null || true)
  if [[ -z "$email" ]]; then
    echo "error: no git config user.email and no bot-hive.agent-id set" >&2
    echo "  set one of:" >&2
    echo "    git config user.email <email>" >&2
    echo "    git config bot-hive.agent-id <id>" >&2
    exit 2
  fi
  hostname=$(hostname 2>/dev/null || echo unknown)
  agent_id="${email}@${hostname}"
fi

echo "Agent-id: $agent_id"
echo

found_any=false
for state_dir in in-progress in-review; do
  dir="hive/$state_dir"
  [[ -d "$dir" ]] || continue
  for f in "$dir"/*.md; do
    [[ -f "$f" ]] || continue
    # Match `Assigned to: <agent-id>` exactly (followed by space, paren, or end of line).
    if grep -qE "^- \*\*Assigned to\*\*:\s*${agent_id}([[:space:]]|\(|$)" "$f" 2>/dev/null; then
      ticket_id=$(head -1 "$f" | sed -E 's/^# \[(HV-[0-9]+)\].*/\1/')
      title=$(head -1 "$f" | sed -E 's/^# \[HV-[0-9]+\][[:space:]]+//')
      printf '  [%s] %s — %s\n' "$state_dir" "$ticket_id" "$title"
      found_any=true
    fi
  done
done

if ! $found_any; then
  echo "  (no tickets currently assigned to this agent)"
fi
