#!/usr/bin/env bash
# scripts/claim.sh — bot helper to claim a backlog ticket end-to-end.
#
# Usage:
#   ./scripts/claim.sh <HV-id> [<branch-suffix>]
#
# What it does (the canonical flow per AGENTS.md):
#   1. Reads your handle from $BOT_HIVE_HANDLE (required — set it once
#      per session).
#   2. git pull --rebase origin main (mandatory pre-claim freshness).
#   3. Checks the ticket exists in hive/backlog/.
#   4. Checks no open PR already references the ticket id.
#   5. Creates branch hv-<id>-<suffix>, moves the file to in-progress/,
#      updates Status / Assigned to / Started / Last touched.
#   6. Appends a `claim` event line to hive/events/<handle>.log.
#   7. Commits, pushes, opens a PR with auto-merge.
#
# The open PR is itself the claim signal: any other bot scanning
# `gh pr list` will see it before they DAG-walk into the same ticket.
#
# Requires: gh, git, awk, sed.

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "usage: $0 <HV-id> [<branch-suffix>]" >&2
  exit 2
fi

HV_ID="$1"
SUFFIX="${2:-claim}"

if [ -z "${BOT_HIVE_HANDLE:-}" ]; then
  echo "error: BOT_HIVE_HANDLE not set. Pick a handle from hive/handles.txt and export it before claiming." >&2
  exit 2
fi

if ! [[ "$HV_ID" =~ ^HV-[0-9]+$ ]]; then
  echo "error: ticket id must look like HV-<number>; got '$HV_ID'" >&2
  exit 2
fi

# Fresh state — skipping this is the failure mode that hit sparrow.
git pull --rebase origin main >/dev/null

TICKET_FILE=$(ls hive/backlog/${HV_ID}-*.md 2>/dev/null || true)
if [ -z "$TICKET_FILE" ]; then
  echo "error: $HV_ID not found in hive/backlog/. May already be claimed, done, or routed to not-doing/." >&2
  exit 1
fi

# Owner check: refuse if the ticket's FS is reserved for a different handle.
TICKET_FS=$(grep "^- \*\*Feature set\*\*:" "$TICKET_FILE" | sed 's/^- \*\*Feature set\*\*: //' | tr -d '[:space:]')
if [ -n "$TICKET_FS" ] && [ -f "hive/feature-sets/${TICKET_FS}.md" ]; then
  FS_OWNER=$(grep "^\*\*Owner\*\*:" "hive/feature-sets/${TICKET_FS}.md" | sed 's/^\*\*Owner\*\*://' | tr -d '[:space:]')
  if [ -n "$FS_OWNER" ] && [ "$FS_OWNER" != "$BOT_HIVE_HANDLE" ]; then
    echo "error: ${TICKET_FS} is owned by ${FS_OWNER}; ${BOT_HIVE_HANDLE} cannot claim ${HV_ID}." >&2
    exit 1
  fi
fi

# If anyone else already has an open PR for this ticket, bail out.
EXISTING_PR=$(gh pr list --state open --search "$HV_ID in:title" --json number,title,headRefName --jq '.[] | "\(.number)|\(.headRefName)|\(.title)"' | head -1)
if [ -n "$EXISTING_PR" ]; then
  echo "warn: open PR already references $HV_ID — skipping claim:" >&2
  echo "  $EXISTING_PR" >&2
  exit 1
fi

NOW_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TODAY=$(date -u +%Y-%m-%d)
HANDLE="$BOT_HIVE_HANDLE"
BRANCH="hv-${HV_ID#HV-}-${SUFFIX}"
NEW_PATH="hive/in-progress/$(basename "$TICKET_FILE")"

git switch -c "$BRANCH"
git mv "$TICKET_FILE" "$NEW_PATH"

# Patch the frontmatter in-place. Each line is replaced if present, otherwise
# left alone — keeps the script idempotent across mid-session re-claims.
python3 - "$NEW_PATH" "$HANDLE" "$TODAY" "$NOW_ISO" <<'PYEOF'
import re, sys
path, handle, today, now_iso = sys.argv[1:5]
with open(path, encoding="utf-8") as f:
    text = f.read()
def patch(text, key, value):
    pattern = re.compile(rf"^- \*\*{re.escape(key)}\*\*:.*$", re.MULTILINE)
    if pattern.search(text):
        return pattern.sub(f"- **{key}**: {value}", text, count=1)
    return text
text = patch(text, "Status", "in-progress")
text = patch(text, "Assigned to", handle)
text = patch(text, "Started", today)
text = patch(text, "Last touched", now_iso)
with open(path, "w", encoding="utf-8") as f:
    f.write(text)
PYEOF

mkdir -p hive/events
echo "${NOW_ISO} ${HV_ID} claim ${HANDLE}" >> "hive/events/${HANDLE}.log"

git add hive/
git commit -m "${HV_ID}: claim — ${HANDLE}"
git push -u origin "$BRANCH"

gh pr create \
  --base main \
  --head "$BRANCH" \
  --title "${HV_ID}: claim — ${HANDLE}" \
  --body "Claim signal — moves ${HV_ID} from backlog/ to in-progress/. Subsequent commits on this branch carry the work."

PR_NUMBER=$(gh pr view --json number --jq '.number')
gh pr merge "$PR_NUMBER" --auto --squash >/dev/null || true

echo "claimed: $HV_ID by $HANDLE on branch $BRANCH (PR #$PR_NUMBER)"
