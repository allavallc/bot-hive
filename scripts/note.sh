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
# Use `@<colony>.<handle>` in the message to address a specific actor; bare
# prose is visible to anyone watching the panel.
#
# Reads identity from .bot-hive-identity (ADR-003) or BOT_HIVE_HANDLE.

set -euo pipefail

STATE_DIR="$(node ./scripts/bot-session.mjs state-dir 2>/dev/null || pwd)"
if [ -d "$STATE_DIR" ]; then
  cd "$STATE_DIR"
fi


if [ -z "${1:-}" ]; then
  echo "usage: $0 \"<message>\"" >&2
  exit 2
fi

# Resolve bot identity. Prefer .bot-hive-identity in the worktree.
BOT_HIVE_COLONY=""
BOT_HIVE_HANDLE_RESOLVED=""
if [ -f .bot-hive-identity ]; then
  while IFS='=' read -r key value; do
    case "$key" in
      colony) BOT_HIVE_COLONY="$value" ;;
      handle) BOT_HIVE_HANDLE_RESOLVED="$value" ;;
    esac
  done < .bot-hive-identity
fi
HANDLE="${BOT_HIVE_HANDLE_RESOLVED:-${BOT_HIVE_HANDLE:-}}"

if [ -z "$HANDLE" ]; then
  echo "error: bot identity not found (no .bot-hive-identity, no BOT_HIVE_HANDLE)." >&2
  exit 2
fi
COLONY="${BOT_HIVE_COLONY:-$HANDLE}"
ACTOR="${COLONY}.${HANDLE}"

MESSAGE="$1"

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
# Per-actor file substrate, keyed by colony.handle so two colonies with
# the same handle don't collide.
NOTE_FILE="hive/notes-to-humans/${ACTOR}.log"
mkdir -p "$(dirname "$NOTE_FILE")"
printf '%s\t%s\n' "$NOW_ISO" "$CLEAN_MSG" >> "$NOTE_FILE"

BRANCH="note-${ACTOR}-$(date -u +%s)"
git switch -c "$BRANCH"
git add "$NOTE_FILE"
git commit -m "note from ${ACTOR}: ${CLEAN_MSG:0:60}"
git push -u origin "$BRANCH"

PR_NUMBER=$(gh pr create \
  --base main \
  --head "$BRANCH" \
  --title "note from ${ACTOR}" \
  --body "${CLEAN_MSG}" \
  --json number --jq '.number' 2>/dev/null || gh pr view --json number --jq '.number')

gh pr merge "$PR_NUMBER" --auto --squash >/dev/null || true

echo "note from ${ACTOR}: ${CLEAN_MSG} (PR #${PR_NUMBER})"
