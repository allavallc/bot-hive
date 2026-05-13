#!/usr/bin/env bash
# scripts/check-role.sh — HV-136 notice surfacer (POSIX).
#
# One-shot read of .bot-hive-role-notice (written by stream.sh on each
# `your-role` SSE event). Runs from the UserPromptSubmit hook; prints
# a one-line `[BOT-HIVE] Role …` message on change and deletes the
# notice. No /whoami call.

set -eu

NOTICE_FILE=".bot-hive-role-notice"
BOOT_STAMP=".bot-hive-role-bootannounced"

[ -f "$NOTICE_FILE" ] || exit 0

# Strip UTF-8 BOM (Windows PowerShell's `Set-Content -Encoding utf8`
# writes one and grep won't match `^role=` against `\xef\xbb\xbfrole=`).
NOTICE_BODY=$(sed '1s/^\xef\xbb\xbf//' "$NOTICE_FILE")

ROLE=$(printf '%s\n' "$NOTICE_BODY" | grep -E '^role='  | head -1 | cut -d= -f2- | tr -d '\r' || true)
SEAT=$(printf '%s\n' "$NOTICE_BODY" | grep -E '^seat='  | head -1 | cut -d= -f2- | tr -d '\r' || true)
TOTAL=$(printf '%s\n' "$NOTICE_BODY" | grep -E '^total=' | head -1 | cut -d= -f2- | tr -d '\r' || true)

rm -f "$NOTICE_FILE"

[ -n "$ROLE" ] || exit 0

# Suppress on first event (matches the role announced at bootstrap).
if [ ! -f "$BOOT_STAMP" ]; then
    printf 'role=%s\n' "$ROLE" > "$BOOT_STAMP"
    exit 0
fi

LAST=$(grep -E '^role=' "$BOOT_STAMP" | head -1 | cut -d= -f2- | tr -d '\r' || true)
[ "$LAST" = "$ROLE" ] && exit 0
printf 'role=%s\n' "$ROLE" > "$BOOT_STAMP"

cat <<EOF
[BOT-HIVE] Role changed: you are now seat ${SEAT} of ${TOTAL}, role: ${ROLE}.
Announce this to the operator before continuing.
EOF
