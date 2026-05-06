#!/usr/bin/env bash
# Publish a signal to the SSE channel — generic helper for any signal type.
#
# Resolves agent-id (HV-074), bot token (HV-064), project id, and handle
# from git config / env vars. Posts to /api/projects/<id>/signals.
#
# Usage:
#   ./scripts/signal.sh --type=claim --refs=HV-085
#   ./scripts/signal.sh --type=done --refs=HV-085 --message "tests green"
#   ./scripts/signal.sh --type=blocked --refs=HV-085 --message "waiting on render"
#   ./scripts/signal.sh --type=note --message "pulling latest before claim"
#
# Required: --type. Most signal types want --refs (the ticket id) and a
# meaningful --message. See AGENTS.md "Real-time channel — what to publish"
# for what each type means.

set -euo pipefail

type=""
refs=""
message=""
handle=""
project_id=""
base_url="${BOT_HIVE_BASE_URL:-https://bot-hive-j0ax.onrender.com}"
dry_run=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --type=*) type="${1#*=}"; shift ;;
    --type) type="$2"; shift 2 ;;
    --refs=*) refs="${1#*=}"; shift ;;
    --refs) refs="$2"; shift 2 ;;
    --message=*) message="${1#*=}"; shift ;;
    --message) message="$2"; shift 2 ;;
    --handle=*) handle="${1#*=}"; shift ;;
    --handle) handle="$2"; shift 2 ;;
    --project=*) project_id="${1#*=}"; shift ;;
    --project) project_id="$2"; shift 2 ;;
    --base-url=*) base_url="${1#*=}"; shift ;;
    --base-url) base_url="$2"; shift 2 ;;
    --dry-run) dry_run=true; shift ;;
    --help|-h)
      cat <<'EOF'
usage: signal.sh --type=<type> [--refs=<id>] [--message=<text>] [--handle=<name>] [--project=<id>] [--dry-run]

Signal types: claim, done, blocked, question, note, handoff, accepted, rejected, presence

Resolves token from BOT_HIVE_TOKEN env or `git config bot-hive.token`.
Resolves project from BOT_HIVE_PROJECT_ID env or `git config bot-hive.project-id`.
Resolves agent-id from `git config bot-hive.agent-id` or <user.email>@<hostname>.
EOF
      exit 0
      ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$type" ]]; then
  echo "error: --type is required (claim, done, blocked, question, note, handoff, accepted, rejected, presence)" >&2
  exit 2
fi

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "error: not in a git repository" >&2
  exit 2
}
cd "$repo_root"

# Agent-id (HV-074).
agent_id=$(git config bot-hive.agent-id 2>/dev/null || true)
if [[ -z "$agent_id" ]]; then
  email=$(git config user.email 2>/dev/null || true)
  if [[ -z "$email" ]]; then
    echo "error: no git config user.email and no bot-hive.agent-id" >&2
    exit 2
  fi
  hostname_str=$(hostname 2>/dev/null || echo unknown)
  agent_id="${email}@${hostname_str}"
fi

# Handle (random pick if not provided — same pool as AGENTS.md).
if [[ -z "$handle" ]]; then
  handles=(buzz scout forager drone comb pollen nectar waggle sparrow finch robin wren fox otter badger mole squirrel hare sentinel pilot ranger watcher kestrel falcon tern jay)
  handle="${handles[$RANDOM % ${#handles[@]}]}"
fi

# Project id.
if [[ -z "$project_id" ]]; then
  project_id="${BOT_HIVE_PROJECT_ID:-}"
fi
if [[ -z "$project_id" ]]; then
  project_id=$(git config bot-hive.project-id 2>/dev/null || true)
fi
if [[ -z "$project_id" ]]; then
  echo "error: pass --project <id> or set BOT_HIVE_PROJECT_ID / git config bot-hive.project-id" >&2
  exit 2
fi

# Token.
token="${BOT_HIVE_TOKEN:-}"
if [[ -z "$token" ]]; then
  token=$(git config bot-hive.token 2>/dev/null || true)
fi
if [[ -z "$token" ]]; then
  echo "error: no bot token. Create one via scripts/create-bot-token.sh, then set BOT_HIVE_TOKEN env or git config bot-hive.token" >&2
  exit 2
fi

# Default message: short, contextual.
if [[ -z "$message" ]]; then
  case "$type" in
    claim) message="${agent_id}/${handle} claiming ${refs:-?}" ;;
    done) message="${agent_id}/${handle} done with ${refs:-?}" ;;
    blocked) message="${agent_id}/${handle} blocked on ${refs:-?}" ;;
    presence) message="${agent_id}/${handle} online" ;;
    *) message="${agent_id}/${handle} ${type} ${refs:-}" ;;
  esac
fi

# Build JSON body. refs is optional; when present, send as a single-element array.
if [[ -n "$refs" ]]; then
  body=$(printf '{"type": "%s", "message": %s, "bot": "%s", "refs": ["%s"]}' \
    "$type" \
    "$(printf '%s' "$message" | jq -Rs .)" \
    "$handle" \
    "$refs")
else
  body=$(printf '{"type": "%s", "message": %s, "bot": "%s"}' \
    "$type" \
    "$(printf '%s' "$message" | jq -Rs .)" \
    "$handle")
fi

if $dry_run; then
  echo "Would POST to ${base_url}/api/projects/${project_id}/signals:"
  echo "$body" | jq .
  exit 0
fi

curl -sS -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $token" \
  -d "$body" \
  "${base_url}/api/projects/${project_id}/signals"
echo
