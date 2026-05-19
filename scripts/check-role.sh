#!/usr/bin/env bash
# scripts/check-role.sh -- HV-136 notice surfacer (POSIX) with diagnostic logging.
#
# One-shot read of .bot-hive-role-notice (written by stream.sh on each
# `your-role` SSE event). Runs from the UserPromptSubmit hook; prints
# a one-line `[BOT-HIVE] Role ...` message on change and deletes the
# notice. No /whoami call.
#
# Diagnostic log: .bot-hive.log in cwd. Tagged [check-role].

set -eu

STATE_DIR="$(node ./scripts/bot-session.mjs state-dir 2>/dev/null || pwd)"
if [ -d "$STATE_DIR" ]; then
  cd "$STATE_DIR"
fi


LOG_FILE="$(pwd)/.bot-hive.log"

log() {
    printf '%s [check-role] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$LOG_FILE" 2>/dev/null || true
}

NOTICE_FILE=".bot-hive-role-notice"
BOOT_STAMP=".bot-hive-role-bootannounced"

if [ ! -f "$NOTICE_FILE" ]; then
    log "invoked; no notice file; exit 0"
    exit 0
fi
log "invoked; notice file present, reading"

# Strip UTF-8 BOM (Windows PowerShell's `Set-Content -Encoding utf8`
# writes one and grep won't match `^role=` against `\xef\xbb\xbfrole=`).
NOTICE_BODY=$(sed '1s/^\xef\xbb\xbf//' "$NOTICE_FILE")

ROLE=$(printf '%s\n' "$NOTICE_BODY" | grep -E '^role='       | head -1 | cut -d= -f2- | tr -d '\r' || true)
SEAT=$(printf '%s\n' "$NOTICE_BODY" | grep -E '^seat='       | head -1 | cut -d= -f2- | tr -d '\r' || true)
TOTAL=$(printf '%s\n' "$NOTICE_BODY" | grep -E '^total='     | head -1 | cut -d= -f2- | tr -d '\r' || true)
SKILL_FILES=$(printf '%s\n' "$NOTICE_BODY" | grep -E '^skillFiles=' | head -1 | cut -d= -f2- | tr -d '\r' || true)
DEPARTED=$(printf '%s\n' "$NOTICE_BODY" | grep -E '^departed='  | head -1 | cut -d= -f2- | tr -d '\r' || true)
log "parsed notice: role='$ROLE' seat='$SEAT' total='$TOTAL' skillFiles='$SKILL_FILES' departed='$DEPARTED'"

rm -f "$NOTICE_FILE"
log "deleted $NOTICE_FILE (one-shot consume)"

if [ -z "$ROLE" ]; then
    log "no role parsed; exit 0"
    exit 0
fi

# Suppress on first event (matches the role announced at bootstrap).
if [ ! -f "$BOOT_STAMP" ]; then
    printf 'role=%s\n' "$ROLE" > "$BOOT_STAMP"
    log "first notice ever; stamped $BOOT_STAMP with role='$ROLE'; suppressing announce"
    exit 0
fi

LAST=$(grep -E '^role=' "$BOOT_STAMP" | head -1 | cut -d= -f2- | tr -d '\r' || true)
if [ "$LAST" = "$ROLE" ]; then
    log "role unchanged ('$ROLE'); suppressing announce"
    exit 0
fi
printf 'role=%s\n' "$ROLE" > "$BOOT_STAMP"
log "ROLE CHANGED: '$LAST' -> '$ROLE'; announcing to operator"

MSG="[BOT-HIVE] Role changed: you are now seat ${SEAT} of ${TOTAL}, role: ${ROLE}."
[ -n "$DEPARTED" ] && MSG="$MSG ($DEPARTED left the colony.)"
[ -n "$SKILL_FILES" ] && MSG="$MSG Load skill files: ${SKILL_FILES}."
printf '%s\n' "$MSG"
printf 'Announce this proactively to the operator before your next reply -- do not wait for them to ask.\n'
