#!/usr/bin/env bash
# Pre-push report for Bot Hive. Reporting aid only — not a gate, not a substitute
# for the swarm protocol (events logs, soft-fence, hot-file checks). Run before any
# push to origin. Compares against origin/main.
set -euo pipefail

REMOTE_REF="${1:-origin/main}"

section() { printf '\n== %s ==\n' "$1"; }

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

section "Branch"
branch="$(git branch --show-current)"
printf 'Branch: %s\n' "${branch:-detached}"
printf 'HEAD:   %s\n' "$(git rev-parse --short HEAD)"
if [ "$branch" = "main" ]; then
  printf 'WARNING: you are on main. Branch protection rejects direct pushes — cut a feature branch.\n'
fi

section "Working Tree"
status="$(git status --short)"
[ -n "$status" ] && printf '%s\n' "$status" || printf 'clean\n'

# Heuristic: warn if uncommitted changes look like more than one ticket's worth of work.
ticket_dirs="$(git status --short | awk '{print $2}' | { grep -oE 'hive/(backlog|in-progress|in-review)/HV-[0-9]+' || true; } | sort -u | wc -l | tr -d ' ')"
if [ "${ticket_dirs:-0}" -gt 1 ]; then
  printf 'WARNING: working tree touches %s tickets. One branch = one ticket. Untangle before committing.\n' "$ticket_dirs"
fi

section "Divergence vs $REMOTE_REF"
if git rev-parse --verify --quiet "$REMOTE_REF" >/dev/null; then
  read -r remote_ahead local_ahead < <(git rev-list --left-right --count "$REMOTE_REF...HEAD")
  printf '%s is ahead by: %s commit(s)\n' "$REMOTE_REF" "$remote_ahead"
  printf 'HEAD is ahead by: %s commit(s)\n' "$local_ahead"
  if [ "$remote_ahead" != "0" ]; then
    printf 'WARNING: main moved. git pull --rebase before pushing.\n'
  fi
  git log --oneline --left-right --cherry-pick "$REMOTE_REF...HEAD" | sed 's/^/  /'
else
  printf 'WARNING: %s unavailable locally. Run git fetch origin main first.\n' "$REMOTE_REF"
fi

section "Files Changed vs $REMOTE_REF"
if git rev-parse --verify --quiet "$REMOTE_REF" >/dev/null; then
  changed="$(git diff --name-only "$REMOTE_REF...HEAD")"
  [ -n "$changed" ] && printf '%s\n' "$changed" || printf 'none\n'

  # Bot Hive hot-file check folded in: reuse the existing helper if present.
  if [ -x scripts/check-hot-files.sh ] && [ -n "$changed" ]; then
    section "Hot-File Conflicts"
    hot="$(printf '%s\n' "$changed" | grep -E 'AGENTS\.md|hive/HIVE\.md|focus\.md|tasks/lessons\.md|render\.yaml|package\.json|drizzle/migrations/' || true)"
    if [ -n "$hot" ]; then
      # shellcheck disable=SC2086
      ./scripts/check-hot-files.sh $hot || printf 'WARNING: an open PR already touches a hot file above — rebase or wait.\n'
    else
      printf 'no hot files touched\n'
    fi
  fi
else
  printf 'unknown; remote ref unavailable\n'
fi

section "Worktrees"
git worktree list

section "Swarm Coordination Checklist"
cat <<'EOF'
Before pushing:
- git pull --rebase origin main (pre-action pull — never push on stale main).
- This branch carries exactly ONE ticket's work.
- Hot files: an open PR touching the same canonical doc means rebase onto it first.
- Stale PRs: ./scripts/update-stale-prs.sh to tend BEHIND PRs (swarm steward duty).
- The events log / soft-fence handle peer coordination — no need to ask "is another bot working?"
EOF
