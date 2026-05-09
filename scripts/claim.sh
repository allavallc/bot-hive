#!/usr/bin/env bash
# scripts/claim.sh — bot helper to claim a backlog ticket end-to-end.
#
# Usage:
#   ./scripts/claim.sh <HV-id> [<branch-suffix>]
#
# Bot identity is read from .bot-hive-identity in the worktree root (per
# ADR-003), with $BOT_HIVE_HANDLE env var as a transitional fallback.

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "usage: $0 <HV-id> [<branch-suffix>]" >&2
  exit 2
fi

HV_ID="$1"
SUFFIX="${2:-claim}"

# Resolve bot identity (ADR-003). Prefer .bot-hive-identity in the
# worktree; fall back to env var for backward compatibility.
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

# Fresh state — skipping this is the failure mode that hit sparrow.
git pull --rebase origin main >/dev/null

TICKET_FILE=$(ls hive/backlog/${HV_ID}-*.md 2>/dev/null || true)
if [ -z "$TICKET_FILE" ]; then
  echo "error: $HV_ID not found in hive/backlog/. May already be claimed, done, or routed to not-doing/." >&2
  exit 1
fi

# Owner check (ADR-003): FS Owner field holds a colony name (not a bot
# handle). Refuse if the FS is owned by a different colony than ours.
# Ticket without an FS = free-for-all (any colony can claim).
TICKET_FS=$(grep "^- \*\*Feature set\*\*:" "$TICKET_FILE" | sed 's/^- \*\*Feature set\*\*: //' | tr -d '[:space:]')
if [ -n "$TICKET_FS" ] && [ -f "hive/feature-sets/${TICKET_FS}.md" ]; then
  FS_OWNER=$(grep "^\*\*Owner\*\*:" "hive/feature-sets/${TICKET_FS}.md" | sed 's/^\*\*Owner\*\*://' | tr -d '[:space:]')
  MY_COLONY="${BOT_HIVE_COLONY:-$BOT_HIVE_HANDLE}"  # legacy: handle was once the colony id
  if [ -n "$FS_OWNER" ] && [ "$FS_OWNER" != "$MY_COLONY" ]; then
    echo "error: ${TICKET_FS} is owned by colony ${FS_OWNER}; your colony (${MY_COLONY}) cannot claim ${HV_ID}." >&2
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
# ADR-003: Assigned-to field uses the full colony.handle form when colony
# is set; falls back to handle alone for transitional compatibility.
if [ -n "${BOT_HIVE_COLONY:-}" ]; then
  ASSIGNED_TO="${BOT_HIVE_COLONY}.${HANDLE}"
else
  ASSIGNED_TO="${HANDLE}"
fi
BRANCH="hv-${HV_ID#HV-}-${SUFFIX}"
NEW_PATH="hive/in-progress/$(basename "$TICKET_FILE")"

git switch -c "$BRANCH"
git mv "$TICKET_FILE" "$NEW_PATH"

# Patch the frontmatter in-place. Each line is replaced if present, otherwise
# left alone — keeps the script idempotent across mid-session re-claims.
python3 - "$NEW_PATH" "$ASSIGNED_TO" "$TODAY" "$NOW_ISO" <<'PYEOF'
import re, sys
path, assigned_to, today, now_iso = sys.argv[1:5]
with open(path, encoding="utf-8") as f:
    text = f.read()
def patch(text, key, value):
    pattern = re.compile(rf"^- \*\*{re.escape(key)}\*\*:.*$", re.MULTILINE)
    if pattern.search(text):
        return pattern.sub(f"- **{key}**: {value}", text, count=1)
    return text
text = patch(text, "Status", "in-progress")
text = patch(text, "Assigned to", assigned_to)
text = patch(text, "Started", today)
text = patch(text, "Last touched", now_iso)
with open(path, "w", encoding="utf-8") as f:
    f.write(text)
PYEOF

mkdir -p hive/events
# ADR-003: events log filename is <colony>.<handle>.log when colony is
# known, falling back to <handle>.log for transitional bots without a
# colony set yet.
if [ -n "${BOT_HIVE_COLONY:-}" ]; then
  EVENTS_FILE="hive/events/${BOT_HIVE_COLONY}.${HANDLE}.log"
  EVENT_ACTOR="${BOT_HIVE_COLONY}.${HANDLE}"
else
  EVENTS_FILE="hive/events/${HANDLE}.log"
  EVENT_ACTOR="${HANDLE}"
fi
echo "${NOW_ISO} ${HV_ID} claim ${EVENT_ACTOR}" >> "$EVENTS_FILE"

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
