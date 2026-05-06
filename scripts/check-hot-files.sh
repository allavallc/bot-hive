#!/usr/bin/env bash
# Hot-file conflict check (HV-063).
#
# Usage:
#   ./scripts/check-hot-files.sh AGENTS.md hive/HIVE.md
#   echo "AGENTS.md" | ./scripts/check-hot-files.sh -
#
# Prints any open PRs that already touch one of the given files.
# Exits 0 if no conflicts found, 1 if at least one conflict found.
#
# Why: two parallel PRs editing the same canonical doc both go DIRTY at
# merge time. Run this before opening your PR; if a conflict is reported,
# rebase onto the existing branch instead of opening a competing PR.

set -euo pipefail

if [[ $# -eq 0 ]] || { [[ $# -eq 1 ]] && [[ "$1" == "-" ]]; }; then
  if [[ ! -t 0 ]]; then
    files=()
    while IFS= read -r line; do
      [[ -n "$line" ]] && files+=("$line")
    done
  else
    echo "usage: $0 <file>... | $0 - <stdin>" >&2
    exit 2
  fi
else
  files=("$@")
fi

if [[ ${#files[@]} -eq 0 ]]; then
  exit 0
fi

prs_json=$(gh pr list --state open --json number,headRefName,files 2>/dev/null) || {
  echo "warn: gh pr list failed; skipping check" >&2
  exit 0
}

conflicts=0
for f in "${files[@]}"; do
  matches=$(echo "$prs_json" | jq -r --arg f "$f" \
    '.[] | select(.files[].path == $f) | "PR #\(.number) (\(.headRefName))"')
  if [[ -n "$matches" ]]; then
    while IFS= read -r m; do
      echo "$f → $m"
      conflicts=$((conflicts + 1))
    done <<< "$matches"
  fi
done

exit $((conflicts > 0 ? 1 : 0))
