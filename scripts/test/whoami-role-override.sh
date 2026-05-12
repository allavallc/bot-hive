#!/usr/bin/env bash
# HV-122 regression test for scripts/whoami.sh
#
# Reproduces the scenario where a returning bot's old first-event
# timestamp would outrank a freshly-bootstrapped PM under the pure
# tenure heuristic, and asserts that the explicit role= override on
# .bot-hive-identity routes the role correctly.

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")/.." && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Mirror the repo layout the script expects: hive/events + hive/skills.
mkdir -p "$TMPDIR/hive/events"
mkdir -p "$TMPDIR/hive/skills"
# whoami.sh references hive/skills/<role>.md only for display; create empty
# stubs so paths resolve.
: > "$TMPDIR/hive/skills/pm.md"
: > "$TMPDIR/hive/skills/coder.md"
: > "$TMPDIR/hive/skills/tester.md"

# Two bots in colony "testco":
# - alpha: an older returning bot, first event 2 days ago, recent activity within 2h.
# - beta:  a freshly-bootstrapped PM, first event today.
NOW_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
RECENT_ISO=$(date -u -d "-30 minutes" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-30M +%Y-%m-%dT%H:%M:%SZ)
OLD_ISO=$(date -u -d "-2 days" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-2d +%Y-%m-%dT%H:%M:%SZ)

cat > "$TMPDIR/hive/events/testco.alpha.log" <<EOF
$OLD_ISO HV-001 claim testco.alpha
$RECENT_ISO HV-099 in-progress testco.alpha
EOF

cat > "$TMPDIR/hive/events/testco.beta.log" <<EOF
$NOW_ISO presence beta online
EOF

run_whoami() {
  # whoami.sh resolves identity from .bot-hive-identity in CWD, scans
  # hive/events/, and prints role to stdout. Run from $TMPDIR with the
  # identity file pointing at the bot under test.
  ( cd "$TMPDIR" && bash "$REPO_ROOT/scripts/whoami.sh" )
}

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

# Scenario 1: no role= override. Tenure heuristic should fire and put
# alpha (older first_ts) at position 1 = PM + tester, beta at position 2
# = coder. This is the BUG behavior — beta was bootstrapped as PM.
cat > "$TMPDIR/.bot-hive-identity" <<EOF
colony=testco
handle=beta
EOF
OUT=$(run_whoami)
echo "[scenario 1 - no role override, expect bug behavior]"
echo "$OUT"
echo "$OUT" | grep -qE '^role: coder$' || fail "scenario 1: expected role=coder under heuristic, got '$OUT'"
echo "$OUT" | grep -qE '^role source: heuristic$' || fail "scenario 1: expected role source=heuristic"
echo

# Scenario 2: role=pm override. Should yield PM regardless of tenure.
cat > "$TMPDIR/.bot-hive-identity" <<EOF
colony=testco
handle=beta
role=pm
EOF
OUT=$(run_whoami)
echo "[scenario 2 - role=pm override]"
echo "$OUT"
echo "$OUT" | grep -qE '^role: PM$' || fail "scenario 2: expected role=PM under explicit override, got '$OUT'"
echo "$OUT" | grep -qE '^role source: explicit ' || fail "scenario 2: expected role source=explicit"
echo

# Scenario 3: role=coder override on the older bot (alpha) - tenure says
# PM+tester, override says coder.
cat > "$TMPDIR/.bot-hive-identity" <<EOF
colony=testco
handle=alpha
role=coder
EOF
OUT=$(run_whoami)
echo "[scenario 3 - role=coder override on the older bot]"
echo "$OUT"
echo "$OUT" | grep -qE '^role: coder$' || fail "scenario 3: expected role=coder under explicit override, got '$OUT'"
echo

# Scenario 4: invalid role= value. Should warn and fall back to heuristic.
cat > "$TMPDIR/.bot-hive-identity" <<EOF
colony=testco
handle=beta
role=overlord
EOF
OUT=$(run_whoami 2>&1)
echo "[scenario 4 - invalid role= value, expect fallback + warning]"
echo "$OUT"
echo "$OUT" | grep -q "warn: unknown role 'overlord'" || fail "scenario 4: expected warning about unknown role"
echo "$OUT" | grep -qE '^role: coder$' || fail "scenario 4: expected fallback to heuristic (role=coder)"
echo "$OUT" | grep -qE '^role source: heuristic$' || fail "scenario 4: expected role source=heuristic after fallback"
echo

echo "PASS: HV-122 whoami role= override behaves correctly across all 4 scenarios."
