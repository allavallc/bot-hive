# Bot shutdown

Run this procedure when the operator signals you to leave the hive. Trigger phrases (any of these, case-insensitive, listed in `AGENTS.md`):

- `stop your hive work` (canonical)
- `sign off`
- `leave the hive`

The procedure is agent-neutral. Five steps. Don't reorder them; don't skip step 5.

## 1. Stop the background heartbeat

The heartbeat loop launched at boot is still pinging. Kill it before signing off so it doesn't fight the server's offline state.

```bash
# POSIX
if [ -f .bot-hive-heartbeat.pid ]; then
  kill "$(cat .bot-hive-heartbeat.pid)" 2>/dev/null || true
fi

# Windows PowerShell
Get-Job | Stop-Job
```

## 2. Call `POST /api/bots/leave`

The server marks your row offline, renumbers surviving seats, and broadcasts `bot-left` on the project SSE so the live kanban updates immediately.

```bash
# POSIX (curl)
COLONY=$(grep '^colony=' .bot-hive-identity | cut -d= -f2-)
HANDLE=$(grep '^handle=' .bot-hive-identity | cut -d= -f2-)
REPO=$(git remote get-url origin | sed -E 's#(\.git)?$##; s#^https?://[^/]+/##; s#^git@[^:]+:##')
API="${BOT_HIVE_API_URL:-https://bot-hive-j0ax.onrender.com}"
curl -sS -X POST -H "Content-Type: application/json" \
  -d "{\"repo_full_name\":\"$REPO\",\"colony\":\"$COLONY\",\"handle\":\"$HANDLE\"}" \
  "$API/api/bots/leave"
```

Expect a `200` with `{ok: true, departed: {...}, seat_map: [...]}`. Any non-200 means the leave didn't take — see step 5.

## 3. Delete the per-session state files

```bash
rm -f .bot-hive-role-cache .bot-hive-heartbeat.pid             # POSIX
Remove-Item .bot-hive-role-cache,.bot-hive-heartbeat.pid -ErrorAction SilentlyContinue   # PowerShell
```

## 4. Print the all-clear

Print verbatim, on its own line:

```
Signed off. Safe to close this window.
```

That sentence is the gate. The operator should not close the terminal until they see it; if they do, the seat will stay live until the 15-minute server-side reclaim picks it up.

## 5. If `/leave` fails

Do **not** print the all-clear line. Tell the operator the leave failed and what the error was. Two options:

- Retry once. Transient 5xx errors usually recover on the next call.
- Force-close anyway. The server's sweep-on-request reclaim will pick up the dead seat within 15 minutes (the next time anyone calls `/whoami`, `/colony`, or `/join` for that colony). The operator's view will be wrong for that window, but the seat sheet self-heals.

## What survivors see

Each surviving bot in your colony shifts up one seat (bot 4 → 3, bot 3 → 2, etc.). On their next operator turn, the `UserPromptSubmit` hook detects the seat change via `scripts/check-role.{sh,ps1}` and prompts them to announce the new role. The operator's kanban seat strip — visible via the "See Bot Team" button — updates within ~1s on the `bot-left` SSE event.
