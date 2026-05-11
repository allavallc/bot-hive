#!/usr/bin/env bash
# scripts/in-review.sh - bot helper to ship a ticket from in-progress to in-review.
#
# Usage:
#   ./scripts/in-review.sh <HV-id>
#
# Moves the ticket file from hive/in-progress/ to hive/in-review/, updates
# frontmatter (Status, Completed, Last touched), appends an event-log entry,
# commits, and pushes to the current branch (the claim PR's branch).
#
# Bot identity is read from .bot-hive-identity in the worktree root (per
# ADR-003), with $BOT_HIVE_HANDLE env var as a transitional fallback.
#
# Why this exists: bots used to do the in-review move with a manual
# `git mv` + `git commit`. Buzz dropped the move during a cherry-pick
# conflict resolution on 2026-05-09 and reported success anyway. This
# helper makes the move atomic — same script every time, can't half-finish.

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "usage: $0 <HV-id>" >&2
  exit 2
fi

HV_ID="$1"

# Resolve bot identity (ADR-003).
if [ -f ".bot-hive-identity" ]; then
  BOT_HIVE_COLONY=$(grep '^colony=' .bot-hive-identity | head -1 | cut -d= -f2- | tr -d '\r')
  BOT_HIVE_HANDLE=$(grep '^handle=' .bot-hive-identity | head -1 | cut -d= -f2- | tr -d '\r')
fi

if [ -z "${BOT_HIVE_HANDLE:-}" ]; then
  echo "error: bot identity not found. The Add-a-Bot spawn flow writes .bot-hive-identity into the worktree; alternatively, set BOT_HIVE_HANDLE manually." >&2
  exit 2
fi

if ! [[ "$HV_ID" =~ ^HV-[0-9]+$ ]]; then
  echo "error: ticket id must look like HV-<number>; got '$HV_ID'" >&2
  exit 2
fi

HANDLE="$BOT_HIVE_HANDLE"
COLONY="${BOT_HIVE_COLONY:-$HANDLE}"
ACTOR="${COLONY}.${HANDLE}"

# Find the ticket in in-progress/.
TICKET_FILE=$(ls hive/in-progress/${HV_ID}-*.md 2>/dev/null || true)
if [ -z "$TICKET_FILE" ]; then
  echo "error: $HV_ID not found in hive/in-progress/. Has it been claimed yet?" >&2
  exit 1
fi

# Soft check: ticket should be assigned to us (warn, don't block — the
# canonical owner is the branch + PR; the field is informational).
ASSIGNED=$(grep "^- \*\*Assigned to\*\*:" "$TICKET_FILE" | sed 's/^- \*\*Assigned to\*\*: //' | tr -d '[:space:]')
if [ -n "$ASSIGNED" ] && [ "$ASSIGNED" != "$ACTOR" ] && [ "$ASSIGNED" != "$HANDLE" ]; then
  echo "warn: $HV_ID is assigned to '$ASSIGNED', not '$ACTOR'. Continuing." >&2
fi

# HV-112: User-facing must be set explicitly before in-review/. The flag
# routes who reviews: yes -> human via Accept; no -> tester bot.
USER_FACING=$(grep "^- \*\*User-facing\*\*:" "$TICKET_FILE" | head -1 | sed 's/^- \*\*User-facing\*\*://' | tr -d '[:space:]')
if [ -z "$USER_FACING" ]; then
  echo "error: $HV_ID has no User-facing value. Set 'User-facing: yes' or 'User-facing: no' in the ticket frontmatter before shipping - it routes the review (human vs tester bot)." >&2
  exit 1
fi
if [ "$USER_FACING" != "yes" ] && [ "$USER_FACING" != "no" ]; then
  echo "error: $HV_ID has User-facing='$USER_FACING'; must be 'yes' or 'no' (lowercase)." >&2
  exit 1
fi

NOW_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TODAY=$(date -u +%Y-%m-%d)
NEW_PATH="hive/in-review/$(basename "$TICKET_FILE")"

mkdir -p hive/in-review
git mv "$TICKET_FILE" "$NEW_PATH"

# Patch frontmatter atomically.
python3 - "$NEW_PATH" "$TODAY" "$NOW_ISO" <<'PYEOF'
import re, sys
path, today, now_iso = sys.argv[1:4]
with open(path, encoding="utf-8") as f:
    text = f.read()
def patch(text, key, value):
    pattern = re.compile(rf"^- \*\*{re.escape(key)}\*\*:.*$", re.MULTILINE)
    if pattern.search(text):
        return pattern.sub(f"- **{key}**: {value}", text, count=1)
    return text
text = patch(text, "Status", "in-review")
text = patch(text, "Completed", today)
text = patch(text, "Last touched", now_iso)
with open(path, "w", encoding="utf-8") as f:
    f.write(text)
PYEOF

mkdir -p hive/events
EVENTS_FILE="hive/events/${ACTOR}.log"
echo "${NOW_ISO} ${HV_ID} in-review ${ACTOR}" >> "$EVENTS_FILE"

git add hive/
git commit -m "${HV_ID}: in-review - ${ACTOR}"
git push

# Verify the file actually landed in in-review/ on the remote, not just locally.
# This is the anti-buzz check: if push silently failed or the file moved back
# during a hook, we want to fail loudly here, not pretend success.
sleep 1  # give GitHub a moment
BRANCH=$(git branch --show-current)
REMOTE_PATH=$(git ls-tree --name-only -r "origin/${BRANCH}" 2>/dev/null | grep -F "$(basename "$NEW_PATH")" || true)
if [ -z "$REMOTE_PATH" ]; then
  echo "warn: could not verify $NEW_PATH on origin/${BRANCH} after push (may be eventual consistency)." >&2
elif ! echo "$REMOTE_PATH" | grep -q "^hive/in-review/"; then
  echo "error: $(basename "$NEW_PATH") is at '$REMOTE_PATH' on origin, not hive/in-review/. The move did not stick." >&2
  exit 1
fi

echo "shipped: $HV_ID to in-review by $ACTOR (branch $BRANCH)"
