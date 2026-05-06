#!/usr/bin/env bash
# Stale-PR watchdog — see AGENTS.md "Stale-PR watchdog" section.
#
# Lists every open non-draft PR; for any in BEHIND state, triggers
# `gh pr update-branch` so GitHub merges current main into the PR.
# DIRTY PRs are left alone (real conflicts).

set -u

stale=$(gh pr list --json number,mergeStateStatus,isDraft \
  | jq -r '.[] | select(.isDraft == false) | select(.mergeStateStatus == "BEHIND") | .number')

if [ -z "$stale" ]; then
  echo "No BEHIND PRs."
  exit 0
fi

for n in $stale; do
  echo "Updating PR #$n..."
  if ! gh pr update-branch "$n"; then
    echo "  (couldn't update PR #$n — may have just become DIRTY)"
  fi
done
