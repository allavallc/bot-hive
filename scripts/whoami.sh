#!/usr/bin/env bash
# scripts/whoami.sh - bot identity + role resolver per FS-023.
#
# Reads .bot-hive-identity, scans hive/events/<colony>.*.log to determine
# how many bots are active in the colony (active = events within the last
# 2 hours per ADR-003), applies the consolidation table from
# hive/roles.md, and prints the bot's role(s) + which skill files to read.
#
# A bot's "tenure" = its first event timestamp. Earlier first-event = higher
# tier in the consolidation table.

set -euo pipefail

if [ -f .bot-hive-identity ]; then
  COLONY=$(grep '^colony=' .bot-hive-identity | head -1 | cut -d= -f2- | tr -d '\r')
  HANDLE=$(grep '^handle=' .bot-hive-identity | head -1 | cut -d= -f2- | tr -d '\r')
fi
HANDLE="${HANDLE:-${BOT_HIVE_HANDLE:-}}"

if [ -z "$HANDLE" ]; then
  echo "error: no bot identity found (.bot-hive-identity missing and BOT_HIVE_HANDLE unset)." >&2
  exit 2
fi
COLONY="${COLONY:-$HANDLE}"
ACTOR="${COLONY}.${HANDLE}"

# Active threshold: 2 hours. Bots with no events in the last 2h are
# considered stale and excluded from role assignment.
NOW_EPOCH=$(date -u +%s)
ACTIVE_THRESHOLD=$((2 * 60 * 60))

# Find all logs for this colony. Build a list of "first_seen|handle"
# entries for bots that are active right now.
declare -a ACTIVE_BOTS=()
for log in hive/events/${COLONY}.*.log; do
  [ -f "$log" ] || continue
  basename=$(basename "$log" .log)
  bot_handle=${basename#${COLONY}.}
  first_ts=""
  last_ts=""
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    case "$line" in '#'*) continue;; esac
    ts=${line%% *}
    [ -z "$first_ts" ] && first_ts="$ts"
    last_ts="$ts"
  done < "$log"
  [ -z "$last_ts" ] && continue
  last_epoch=$(date -d "$last_ts" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$last_ts" +%s 2>/dev/null || echo 0)
  age=$((NOW_EPOCH - last_epoch))
  if [ "$age" -le "$ACTIVE_THRESHOLD" ]; then
    first_epoch=$(date -d "$first_ts" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$first_ts" +%s 2>/dev/null || echo 0)
    ACTIVE_BOTS+=("${first_epoch}|${bot_handle}")
  fi
done

# Sort by first-seen ascending. Older bots have higher tier.
IFS=$'\n' SORTED=($(printf '%s\n' "${ACTIVE_BOTS[@]}" | sort -n))
unset IFS

# Find our position. If we're not in the active list, treat self as last
# (we just spawned, no events yet).
SELF_INDEX=-1
for i in "${!SORTED[@]}"; do
  entry=${SORTED[$i]}
  bot_handle=${entry##*|}
  if [ "$bot_handle" = "$HANDLE" ]; then
    SELF_INDEX=$i
    break
  fi
done

# If self not in active list, append self at the end.
if [ "$SELF_INDEX" -lt 0 ]; then
  SORTED+=("${NOW_EPOCH}|${HANDLE}")
  SELF_INDEX=$((${#SORTED[@]} - 1))
fi

TOTAL=${#SORTED[@]}
POSITION=$((SELF_INDEX + 1))

# Apply consolidation table from hive/roles.md.
ROLES=""
SKILLS=""
case "$TOTAL" in
  1)
    ROLES="PM + coder + tester"
    SKILLS="hive/skills/pm.md, hive/skills/coder.md, hive/skills/tester.md"
    ;;
  2)
    if [ "$POSITION" = "1" ]; then
      ROLES="PM + tester"
      SKILLS="hive/skills/pm.md, hive/skills/tester.md"
    else
      ROLES="coder"
      SKILLS="hive/skills/coder.md"
    fi
    ;;
  *)
    if [ "$POSITION" = "1" ]; then
      ROLES="PM"
      SKILLS="hive/skills/pm.md"
    elif [ "$POSITION" = "2" ]; then
      ROLES="coder"
      SKILLS="hive/skills/coder.md"
    elif [ "$POSITION" = "3" ]; then
      ROLES="tester"
      SKILLS="hive/skills/tester.md"
    else
      ROLES="coder (additional)"
      SKILLS="hive/skills/coder.md"
    fi
    ;;
esac

echo "actor: ${ACTOR}"
echo "colony bots active: ${TOTAL} (you are ${POSITION}/${TOTAL})"
echo "role: ${ROLES}"
echo "read these skill files: ${SKILLS}"
