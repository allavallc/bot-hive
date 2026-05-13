# Bot shutdown

Run this procedure when the operator signals you to leave the hive. Trigger phrases (any of these, case-insensitive, listed in `AGENTS.md`):

- `stop your hive work` (canonical)
- `sign off`
- `leave the hive`
- `stop hive`

Operators can also run `./scripts/hive.sh stop` (POSIX) or `.\scripts\hive.ps1 stop` (PowerShell) directly from a terminal to perform this procedure without an agent.

HV-136: there's no `/leave` API call anymore. Killing the SSE listener closes the TCP socket, which the server detects within ~1s and reaps the seat after a 15s grace window. Three steps.

## 1. Stop the SSE listener

```bash
# POSIX
if [ -f .bot-hive-stream.pid ]; then
  kill "$(cat .bot-hive-stream.pid)" 2>/dev/null || true
  rm -f .bot-hive-stream.pid
fi

# Windows PowerShell
if (Test-Path .bot-hive-stream.pid) {
  $streamPid = Get-Content .bot-hive-stream.pid -ErrorAction SilentlyContinue
  if ($streamPid) { Stop-Process -Id $streamPid -Force -ErrorAction SilentlyContinue }
  Remove-Item .bot-hive-stream.pid -ErrorAction SilentlyContinue
}
```

## 2. Delete the per-session state files

```bash
rm -f .bot-hive-role-notice .bot-hive-role-bootannounced .bot-hive-role-cache .bot-hive-heartbeat.pid   # POSIX
Remove-Item .bot-hive-role-notice,.bot-hive-role-bootannounced,.bot-hive-role-cache,.bot-hive-heartbeat.pid -ErrorAction SilentlyContinue   # PowerShell
```

(The `.bot-hive-role-cache` and `.bot-hive-heartbeat.pid` lines exist for cleanup of legacy state on old worktrees.)

## 3. Print the all-clear

Print verbatim, on its own line:

```
Signed off. Safe to close this window.
```

That sentence is the gate. The operator should not close the terminal until they see it.

## What survivors see

When this terminal closes — or the SSE script is killed — the socket dies. After a 15s grace window the server marks this row offline, renumbers survivors so seats stay contiguous, and pushes a new `your-role` down each surviving bot's open stream. On the survivor's next operator prompt, the `UserPromptSubmit` hook surfaces `[BOT-HIVE] Role changed: …` and the bot announces the new role.

The kanban "See Bot Team" modal updates within ~1s on the `bot-left` SSE broadcast.

## If the listener can't be stopped

If `kill` / `Stop-Process` fails (the script is already dead, the PID file is stale, etc.), just close the terminal. The TCP socket dies when the parent shell exits regardless. The server's 15s grace + reclaim takes care of the rest.
