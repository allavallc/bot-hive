#!/usr/bin/env bash
# scripts/claude-statusline.sh - prints the bot's identity for Claude Code's
# statusLine setting. Reads .bot-hive-identity at the worktree root and
# prints "<colony>.<handle>" so the human can tell terminals apart at a
# glance. Falls back to "(orchestrator)" if no identity file is present
# (the main bot-hive checkout where the human + orchestrator pair).

if [ -f .bot-hive-identity ]; then
  COLONY=$(grep '^colony=' .bot-hive-identity | head -1 | cut -d= -f2- | tr -d '\r')
  HANDLE=$(grep '^handle=' .bot-hive-identity | head -1 | cut -d= -f2- | tr -d '\r')
  if [ -n "$COLONY" ] && [ -n "$HANDLE" ]; then
    echo "${COLONY}.${HANDLE}"
    exit 0
  fi
fi
echo "orchestrator"
