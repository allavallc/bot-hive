#!/usr/bin/env bash
# scripts/note.sh — bot helper to write a note to humans.
#
# Usage:
#   ./scripts/note.sh "@allavallc clarification needed: rail width 40 or 60?"
#
# Appends a TSV line `<ISO ts>\t<message>` to hive/notes-to-humans/<handle>.log,
# commits, and opens a tiny auto-merging PR. Humans see it in the swarm panel
# within ~10s of merge.
#
# Use `@<human-handle>` in the message to address a specific human; bare prose
# is visible to anyone watching the panel.
#
# Requires: BOT_HIVE_HANDLE env var, gh, git.

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "usage: $0 \"<message>\"" >&2
  exit 2
fi

if [ -z "${BOT_HIVE_HANDLE:-}" ]; then
  echo "error: BOT_HIVE_HANDLE not set." >&2
  exit 2
fi

MESSAGE="$1"
HANDLE="$BOT_HIVE_HANDLE"

# Strip tabs/newlines so the TSV format isn't corrupted.
CLEAN_MSG=$(echo -n "$MESSAGE" | tr '\t\r\n' '   ')
if [ -z "$CLEAN_MSG" ]; then
  echo "error: message is empty after sanitization." >&2
  exit 2
fi
if [ ${#CLEAN_MSG} -gt 280 ]; then
  echo "error: message exceeds 280 chars (got ${#CLEAN_MSG})." >&2
  exit 2
fi

git pull --rebase origin main >/dev/null

NOW_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
NOTE_FILE="hive/notes-to-humans/${HANDLE}.log"
mkdir -p "$(dirname "$NOTE_FILE")"
printf '%s\t%s\n' "$NOW_ISO" "$CLEAN_MSG" >> "$NOTE_FILE"

BRANCH="note-${HANDLE}-$(date -u +%s)"
git switch -c "$BRANCH"
git add "$NOTE_FILE"
git commit -m "note from ${HANDLE}: ${CLEAN_MSG:0:60}"
git push -u origin "$BRANCH"

PR_NUMBER=$(gh pr create \
  --base main \
  --head "$BRANCH" \
  --title "note from ${HANDLE}" \
  --body "${CLEAN_MSG}" \
  --json number --jq '.number' 2>/dev/null || gh pr view --json number --jq '.number')

gh pr merge "$PR_NUMBER" --auto --squash >/dev/null || true

echo "note from ${HANDLE}: ${CLEAN_MSG} (PR #${PR_NUMBER})"
