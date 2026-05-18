#!/usr/bin/env bash
# scripts/inject-bot-startup.sh -- SessionStart hook for Claude Code.
#
# Wired into .claude/settings.json under "SessionStart". On every new
# Claude Code session in this repo, Claude Code's hook system runs this
# script and injects its stdout into the agent's initial context as
# additionalContext. Forces every fresh agent to see hive/bot-startup.md
# (with its kickoff triggers and Procedure A/B) before processing the
# first user prompt -- closes the "agent treated 'hive add coder' as a
# shell command" failure mode that PR #267's ironclad prologue couldn't
# prevent by docs alone.

set -e
cat hive/bot-startup.md
