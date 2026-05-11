#!/usr/bin/env bash
# scripts/install-statusline.sh - one-shot setup for the orchestrator's
# main checkout. Writes .claude/settings.json so Claude Code shows
# "orchestrator" at the bottom of the chat (the human's signal that this
# session is the main checkout, not a bot worktree).
#
# Bot worktrees get this automatically from the Add-a-Bot spawn flow.
# This script is for the human's main bot-hive checkout (the one outside
# any worktree).

set -euo pipefail

if [ -f .bot-hive-identity ]; then
  echo "warn: .bot-hive-identity exists in this checkout — looks like a bot worktree, not the orchestrator's main checkout. Aborting."
  exit 1
fi

mkdir -p .claude
cat > .claude/settings.json <<'JSON'
{
  "statusLine": {
    "type": "command",
    "command": "bash ./scripts/claude-statusline.sh"
  }
}
JSON

echo "wrote .claude/settings.json — restart Claude Code to see 'orchestrator' in the statusline."
