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
# Requires: BOT_HIVE_HANDLE env var.

set -euo pipefail

if [ -z "${BOT_HIVE_HANDLE:-}" ]; then
  echo "error: BOT_HIVE_HANDLE not set." >&2
  exit 2
fi

HANDLE="$BOT_HIVE_HANDLE"

# Mandatory pre-action pull.
git pull --rebase origin main >/dev/null

echo "=== you are: $HANDLE ==="

echo
echo "=== your rejected work (claim before any new ticket) ==="
REJECTED_FOUND=0
for f in hive/in-progress/*.md; do
  [ -f "$f" ] || continue
  if grep -q "^- \*\*Assigned to\*\*: $HANDLE" "$f" && grep -q "^- \*\*Rejected by\*\*: \S" "$f"; then
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
  if grep -q "^- \*\*Assigned to\*\*: $HANDLE" "$f" && ! grep -q "^- \*\*Rejected by\*\*: \S" "$f"; then
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
    if echo "$MSG" | grep -qE "@${HANDLE}\b|@swarm\b"; then
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
    FS_OWNER=$(grep "^\*\*Owner\*\*:" "hive/feature-sets/${FS}.md" | sed 's/^\*\*Owner\*\*://' | tr -d '[:space:]')
    if [ -n "$FS_OWNER" ] && [ "$FS_OWNER" != "$HANDLE" ]; then
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
