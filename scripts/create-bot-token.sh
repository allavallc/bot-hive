#!/usr/bin/env bash
# Create a project-scoped bot token (HV-064).
#
# Usage:
#   ./scripts/create-bot-token.sh \
#     --project <project-id> \
#     --name "<display-name>" \
#     [--cookie "<session-cookie-value>"] \
#     [--base-url <url>]
#
# Or with env vars:
#   BOT_HIVE_BASE_URL=https://bot-hive-j0ax.onrender.com \
#   BOT_HIVE_SESSION_COOKIE="better-auth.session_token=..." \
#     ./scripts/create-bot-token.sh --project <id> --name "kestrel-laptop"
#
# Prints the raw token (shown ONCE — store it securely) and a sample
# curl command for using it.

set -euo pipefail

base_url="${BOT_HIVE_BASE_URL:-http://localhost:3000}"
cookie="${BOT_HIVE_SESSION_COOKIE:-}"
project=""
name=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) project="$2"; shift 2 ;;
    --name) name="$2"; shift 2 ;;
    --cookie) cookie="$2"; shift 2 ;;
    --base-url) base_url="$2"; shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$project" || -z "$name" ]]; then
  echo "usage: $0 --project <id> --name <display-name> [--cookie <session-cookie>] [--base-url <url>]" >&2
  exit 2
fi

if [[ -z "$cookie" ]]; then
  echo "error: session cookie required (set --cookie or BOT_HIVE_SESSION_COOKIE)" >&2
  echo "       to grab it: open the Bot Hive app in a browser, sign in, then" >&2
  echo "       devtools → Application → Cookies → copy 'better-auth.session_token'" >&2
  exit 2
fi

response=$(curl -sS -X POST \
  -H "Content-Type: application/json" \
  -H "Cookie: $cookie" \
  -d "{\"displayName\": \"$name\"}" \
  "${base_url}/api/projects/${project}/bot-tokens")

if [[ -z "$response" ]]; then
  echo "error: empty response from server" >&2
  exit 1
fi

raw=$(echo "$response" | jq -r '.raw // empty')
if [[ -z "$raw" ]]; then
  echo "error: server response did not include a raw token" >&2
  echo "$response" >&2
  exit 1
fi

cat <<EOF
Bot token created.

  Project:     $project
  Name:        $name
  Token:       $raw

This token is shown ONCE. Store it securely.

Sample usage (publish a 'note' signal as this bot):

  curl -X POST \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer $raw" \\
    -d '{"type": "note", "message": "hello swarm"}' \\
    ${base_url}/api/projects/${project}/signals

To revoke later, find the token id (GET /api/projects/<id>/bot-tokens) then:
  curl -X DELETE -H "Cookie: \$BOT_HIVE_SESSION_COOKIE" \\
    ${base_url}/api/projects/${project}/bot-tokens/<token-id>

EOF
