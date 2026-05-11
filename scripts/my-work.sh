#!/usr/bin/env bash
# scripts/my-work.sh — bot session-start helper.
#
# Surfaces what you should be working on, in this order:
#   1. Your own rejected work in hive/in-progress/ (HV-052 pre-claim ritual)
#   2. Your in-progress tickets (anything Assigned to you)
#   3. Notes addressed to you in hive/notes-to-bots/*.log (HV-088)
#   4. Recent swarm activity from hive/events/*.log
#   5. Open backlog tickets you could DAG-walk to (filtered by FS Status)
#
# Reads identity from .bot-hive-identity (ADR-003), or falls back to
# BOT_HIVE_HANDLE for transitional compatibility.

set -euo pipefail

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
# Colony defaults to handle for legacy single-colony state.
COLONY="${BOT_HIVE_COLONY:-$HANDLE}"
ACTOR="${COLONY}.${HANDLE}"

# Mandatory pre-action pull.
git pull --rebase origin main >/dev/null

# Identity + role re-resolved on every cycle. whoami.sh scans
# hive/events/<colony>.*.log so role splits when bots join/leave the
# colony — no manual re-check needed.
./scripts/whoami.sh

# Surface the colony's standing order (ADR-003: focus is per-colony).
FOCUS_FILE="hive/colonies/${COLONY}/focus.md"
echo
if [ -f "$FOCUS_FILE" ]; then
  FOCUS_CONTENT=$(grep -v '^[[:space:]]*$' "$FOCUS_FILE" | head -1)
  echo "=== colony focus (${FOCUS_FILE}) ==="
  echo "  ${FOCUS_CONTENT:-(empty)}"
else
  echo "=== colony focus ==="
  echo "  (no focus file at ${FOCUS_FILE} — anything in backlog is fair game)"
fi

# Assigned-to matcher: the field can carry either the legacy bare handle
# or the new <colony>.<handle> form (ADR-003). Match both for now.
assigned_to_me() {
  grep -qE "^- \*\*Assigned to\*\*: (${HANDLE}|${COLONY}\.${HANDLE})\$" "$1"
}

echo
echo "=== your rejected work (claim before any new ticket) ==="
REJECTED_FOUND=0
for f in hive/in-progress/*.md; do
  [ -f "$f" ] || continue
  if assigned_to_me "$f" && grep -q "^- \*\*Rejected by\*\*: \S" "$f"; then
    HV=$(basename "$f" | sed 's/-[0-9]*\.md$//')
    REASON=$(grep "^- \*\*Rejection reason\*\*:" "$f" | sed 's/^- \*\*Rejection reason\*\*: //')
    echo "  $HV — rejected: $REASON"
    REJECTED_FOUND=1
  fi
done
[ $REJECTED_FOUND -eq 0 ] && echo "  (none)"

echo
echo "=== your in-progress (not rejected) ==="
INPROG_FOUND=0
for f in hive/in-progress/*.md; do
  [ -f "$f" ] || continue
  if assigned_to_me "$f" && ! grep -q "^- \*\*Rejected by\*\*: \S" "$f"; then
    HV=$(basename "$f" | sed 's/-[0-9]*\.md$//')
    TITLE=$(head -1 "$f" | sed 's/^# \[.*\] //')
    echo "  $HV — $TITLE"
    INPROG_FOUND=1
  fi
done
[ $INPROG_FOUND -eq 0 ] && echo "  (none)"

echo
echo "=== notes addressed to you (last 24h) ==="
CUTOFF=$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-24H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "0000")
NOTES_FOUND=0
if [ -d hive/notes-to-bots ]; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    TS=$(echo "$line" | cut -f1)
    MSG=$(echo "$line" | cut -f2-)
    [ "$TS" \< "$CUTOFF" ] && continue
    if echo "$MSG" | grep -qE "@${HANDLE}\b|@${COLONY}\.${HANDLE}\b|@swarm\b"; then
      AUTHOR=$(echo "$line" | sed -n 's|.*FROM://\(.*\)|\1|p')
      echo "  [$TS] $MSG"
      NOTES_FOUND=1
    fi
  done < <(for f in hive/notes-to-bots/*.log; do
    [ -f "$f" ] || continue
    AUTHOR=$(basename "$f" .log)
    sed "s|^|FROM://${AUTHOR}|" "$f" 2>/dev/null
  done)
fi
[ $NOTES_FOUND -eq 0 ] && echo "  (none)"

echo
echo "=== recent swarm activity (last 50 events) ==="
if ls hive/events/*.log >/dev/null 2>&1; then
  cat hive/events/*.log 2>/dev/null | grep -v '^#' | sort | tail -50
else
  echo "  (no events yet)"
fi

echo
echo "=== available backlog (DAG-walk leaves, FS-active only) ==="
LEAVES_FOUND=0
for f in hive/backlog/*.md; do
  [ -f "$f" ] || continue
  HV=$(basename "$f" | sed 's/-[0-9]*\.md$//')
  TITLE=$(head -1 "$f" | sed 's/^# \[.*\] //')
  FS=$(grep "^- \*\*Feature set\*\*:" "$f" | sed 's/^- \*\*Feature set\*\*: //' | tr -d '[:space:]')
  # Filter by FS status + Owner if FS file exists.
  if [ -n "$FS" ] && [ -f "hive/feature-sets/${FS}.md" ]; then
    FS_STATUS=$(grep "^\*\*Status\*\*:" "hive/feature-sets/${FS}.md" | sed 's/^\*\*Status\*\*: //' | awk '{print $1}')
    [ "$FS_STATUS" = "active" ] || continue
    # ADR-003: FS Owner is now a colony name, not a bot handle. A bot's
    # colony can pick from any FS owned by that colony, or unowned FSs.
    FS_OWNER=$(grep "^\*\*Owner\*\*:" "hive/feature-sets/${FS}.md" | sed 's/^\*\*Owner\*\*://' | tr -d '[:space:]')
    if [ -n "$FS_OWNER" ] && [ "$FS_OWNER" != "$COLONY" ]; then
      continue
    fi
  fi
  # Skip if any unfinished Blocked-by.
  BLOCKED=$(grep "^- \*\*Blocked by\*\*:" "$f" | sed 's/^- \*\*Blocked by\*\*: //' | tr -d '[:space:]')
  if [ -n "$BLOCKED" ]; then
    UNFINISHED=0
    for B in $(echo "$BLOCKED" | tr ',' ' '); do
      [ -z "$B" ] && continue
      ls hive/done/${B}-*.md >/dev/null 2>&1 || UNFINISHED=1
    done
    [ $UNFINISHED -eq 1 ] && continue
  fi
  echo "  $HV — $TITLE"
  LEAVES_FOUND=1
done
[ $LEAVES_FOUND -eq 0 ] && echo "  (none — all blocked, claimed, or in non-active FSs)"
