#!/usr/bin/env bash
# Publish a `presence` signal to the SSE channel for this clone's agent (HV-081).
#
# Resolves the agent-id (HV-074) from `git config bot-hive.agent-id` or
# default-derives from `<email>@<hostname>`. Resolves the bot token (HV-064)
# from `git config bot-hive.token` or env `BOT_HIVE_TOKEN`.
#
# Usage:
#   ./scripts/announce-presence.sh                    # uses focus.md as focus
#   ./scripts/announce-presence.sh --focus FS-007     # explicit focus
#   ./scripts/announce-presence.sh --handle wren      # session handle (else picks a random one)
#
# Prints the signal's response (or the curl command if --dry-run).

set -euo pipefail

focus=""
handle=""
dry_run=false
project_id=""
base_url="${BOT_HIVE_BASE_URL:-https://bot-hive-j0ax.onrender.com}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --focus) focus="$2"; shift 2 ;;
    --handle) handle="$2"; shift 2 ;;
    --project) project_id="$2"; shift 2 ;;
    --base-url) base_url="$2"; shift 2 ;;
    --dry-run) dry_run=true; shift ;;
    --help|-h)
      cat <<'EOF'
usage: announce-presence.sh [--focus <id>] [--handle <name>] [--project <id>] [--base-url <url>] [--dry-run]

Publishes a `presence` signal on the SSE channel announcing this agent
is online. Agent-id resolves from git config or email@hostname; token
from git config or BOT_HIVE_TOKEN env var.
EOF
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

# Resolve agent-id (HV-074 convention).
agent_id=$(git config bot-hive.agent-id 2>/dev/null || true)
if [[ -z "$agent_id" ]]; then
  email=$(git config user.email 2>/dev/null || true)
  if [[ -z "$email" ]]; then
    echo "error: no git config user.email and no bot-hive.agent-id set" >&2
    exit 2
  fi
  hostname_str=$(hostname 2>/dev/null || echo unknown)
  agent_id="${email}@${hostname_str}"
fi

# Resolve focus.
if [[ -z "$focus" ]]; then
  if [[ -f hive/focus.md ]]; then
    focus=$(grep -E '^current\s*=' hive/focus.md | head -1 | sed -E 's/^current\s*=\s*//' || true)
  fi
fi

# Resolve handle (random pick if not provided).
if [[ -z "$handle" ]]; then
  handles=(buzz scout forager drone comb pollen nectar waggle sparrow finch robin wren fox otter badger mole squirrel hare sentinel pilot ranger watcher kestrel falcon tern jay)
  handle="${handles[$RANDOM % ${#handles[@]}]}"
fi

# Resolve project id from git remote (assume one project per repo).
if [[ -z "$project_id" ]]; then
  project_id=$(git config bot-hive.project-id 2>/dev/null || true)
  if [[ -z "$project_id" ]]; then
    echo "error: pass --project <id> or set git config bot-hive.project-id" >&2
    echo "  find the project id at https://bot-hive-j0ax.onrender.com/dashboard" >&2
    exit 2
  fi
fi

# Resolve token (HV-064).
token="${BOT_HIVE_TOKEN:-}"
if [[ -z "$token" ]]; then
  token=$(git config bot-hive.token 2>/dev/null || true)
fi
if [[ -z "$token" ]]; then
  echo "error: no bot token. Create one via scripts/create-bot-token.sh" >&2
  echo "       then set BOT_HIVE_TOKEN env or git config bot-hive.token" >&2
  exit 2
fi

# Build the message.
message="${agent_id}/${handle} online"
if [[ -n "$focus" ]]; then
  message="${message} (focus: ${focus})"
fi

# Build the JSON body.
body=$(cat <<EOF
{
  "type": "presence",
  "message": "$message",
  "bot": "$handle"
}
EOF
)

if $dry_run; then
  echo "Would POST to ${base_url}/api/projects/${project_id}/signals:"
  echo "$body"
  exit 0
fi

curl -sS -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $token" \
  -d "$body" \
  "${base_url}/api/projects/${project_id}/signals"
echo
