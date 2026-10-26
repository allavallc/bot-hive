#!/usr/bin/env bash
# Stale-claim reclaim (HV-066).
#
# Scans hive/in-progress/*.md for tickets whose `Last touched:` ISO timestamp
# is older than 2 hours. Without --reclaim, just prints them and exits 1
# (dry-run / report mode). With --reclaim, returns each stale ticket to
# backlog/ in a single auto-merging PR.
#
# Pairs with HV-051's stale-PR watchdog: PRs go BEHIND → auto-update;
# claims go stale → auto-reclaim. The swarm self-heals when no agents are
# around to do it manually.

set -euo pipefail

reclaim=false
threshold_hours=2

while [[ $# -gt 0 ]]; do
  case "$1" in
    --reclaim) reclaim=true; shift ;;
    --threshold-hours) threshold_hours="$2"; shift 2 ;;
    --help|-h)
      echo "usage: $0 [--reclaim] [--threshold-hours <N>]"
      echo "  Without --reclaim: lists stale tickets, exits 1 if any found."
      echo "  With --reclaim: opens a PR moving stale tickets back to backlog/."
      exit 0
      ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "error: not in a git repository" >&2
  exit 2
}
cd "$repo_root"

if [[ ! -d hive/in-progress ]]; then
  echo "no hive/in-progress/ directory; nothing to scan" >&2
  exit 0
fi

threshold_seconds=$((threshold_hours * 3600))
now=$(date -u +%s)
stale_files=()
stale_summary=()

for f in hive/in-progress/*.md; do
  [[ -f "$f" ]] || continue
  ticket_id=$(grep -m1 -E '^# \[(HV-[0-9]+)\]' "$f" | sed -E 's/^# \[(HV-[0-9]+)\].*/\1/' || true)
  last_touched=$(grep -m1 -E '^- \*\*Last touched\*\*:' "$f" | sed -E 's/.*\*\*Last touched\*\*:\s*//' | tr -d ' ' || true)
  assigned=$(grep -m1 -E '^- \*\*Assigned to\*\*:' "$f" | sed -E 's/.*\*\*Assigned to\*\*:\s*//' || true)

  [[ -z "$ticket_id" ]] && continue
  if [[ -z "$last_touched" ]]; then
    # No timestamp — treat as fresh, unparseable. Skip.
    continue
  fi

  if last_seconds=$(date -u -d "$last_touched" +%s 2>/dev/null); then
    age=$((now - last_seconds))
    if (( age > threshold_seconds )); then
      stale_files+=("$f")
      stale_summary+=("$ticket_id (last touched $last_touched, assigned ${assigned:-unknown}, age $((age / 60))m)")
    fi
  fi
done

if [[ ${#stale_files[@]} -eq 0 ]]; then
  echo "no stale claims found (threshold ${threshold_hours}h)"
  exit 0
fi

echo "Stale claims found (threshold ${threshold_hours}h):"
for s in "${stale_summary[@]}"; do
  echo "  STALE: $s"
done

if ! $reclaim; then
  echo
  echo "Re-run with --reclaim to return them to backlog/"
  exit 1
fi

# --reclaim: do the moves.
branch="reclaim-stale-claims-$(date -u +%s)"
git checkout -b "$branch"

for f in "${stale_files[@]}"; do
  ticket_id=$(grep -m1 -E '^# \[(HV-[0-9]+)\]' "$f" | sed -E 's/^# \[(HV-[0-9]+)\].*/\1/')
  last_touched=$(grep -m1 -E '^- \*\*Last touched\*\*:' "$f" | sed -E 's/.*\*\*Last touched\*\*:\s*//' | tr -d ' ')
  assigned=$(grep -m1 -E '^- \*\*Assigned to\*\*:' "$f" | sed -E 's/.*\*\*Assigned to\*\*:\s*//')
  reclaim_iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  # Edit frontmatter: clear Assigned to, Started; set Status: open; add Reclaim reason.
  tmpfile=$(mktemp)
  awk -v rt="$last_touched" -v ah="$assigned" -v rclaim="$reclaim_iso" '
    /^- \*\*Status\*\*:/ && !done_status { sub(/:.*/, ": open"); done_status=1; print; next }
    /^- \*\*Assigned to\*\*:/ && !done_assigned { print "- **Assigned to**:"; done_assigned=1; next }
    /^- \*\*Started\*\*:/ && !done_started { print "- **Started**:"; done_started=1; next }
    /^- \*\*Last touched\*\*:/ && !done_lt {
      print
      print "- **Reclaim reason**: stale claim (last touched " rt "; was assigned " ah "; reclaimed " rclaim ")"
      done_lt=1; next
    }
    { print }
  ' "$f" > "$tmpfile"
  mv "$tmpfile" "$f"

  basename=$(basename "$f")
  git mv "$f" "hive/backlog/$basename"
  mkdir -p hive/events
  echo "${reclaim_iso} ${ticket_id} reclaimed-stale cron" >> hive/events/cron.log
done

git add -A
git commit -m "hive: reclaim stale claims (HV-066 cron)" -m "$(printf '%s\n' "${stale_summary[@]}")"
git push -u origin "$branch"

# Open PR + auto-merge. Failure here isn't fatal — the branch is on the remote.
gh pr create \
  --title "hive: reclaim ${#stale_files[@]} stale claim(s) — HV-066 cron" \
  --body "$(printf '## Summary\n\nReclaim cron found stale in-progress tickets and returned them to backlog/:\n\n%s\n\nPer the 2h Last-touched rule (HIVE.md). See HV-066 for the convention.' "$(printf -- '- %s\n' "${stale_summary[@]}")")" \
  || { echo "warn: gh pr create failed; branch pushed but PR not opened" >&2; exit 0; }

gh pr merge --auto --squash --delete-branch || true
