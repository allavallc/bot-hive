#!/usr/bin/env bash
# Sort hive/events.log by ISO timestamp (HV-083).
#
# Preserves leading `#` comment lines as-is. Sorts the remaining entries by
# the leading ISO timestamp (lexicographic = chronological for ISO 8601).
# If sort changes anything, writes back and prints "changed". Else "no changes".
#
# Used by .github/workflows/sort-events-log.yml (cron, every 30 min) to keep
# events.log readable after merge=union (HV-071) auto-resolves conflicts by
# concatenating without sorting.

set -euo pipefail

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "error: not in a git repository" >&2
  exit 2
}
cd "$repo_root"

if [[ ! -f hive/events.log ]]; then
  echo "no events.log; nothing to sort"
  exit 0
fi

tmp=$(mktemp)
header=$(grep -E '^#' hive/events.log || true)
entries=$(grep -vE '^#' hive/events.log || true)

if [[ -n "$header" ]]; then
  printf '%s\n' "$header" > "$tmp"
fi
if [[ -n "$entries" ]]; then
  # Stable sort by the leading ISO timestamp (col 1, default sort works).
  printf '%s\n' "$entries" | sort -s -k1,1 >> "$tmp"
fi

if cmp -s "$tmp" hive/events.log; then
  echo "no changes"
  rm -f "$tmp"
  exit 0
fi

mv "$tmp" hive/events.log
echo "changed"
