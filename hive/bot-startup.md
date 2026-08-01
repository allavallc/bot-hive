# Bot startup

One procedure for all bots. Every session — PM, coder, tester — runs the same steps. The server assigns your handle and role; you do not need to know them in advance.

**Triggers** (either one fires this procedure):

1. The operator types `start the hive` in chat.
2. A `.bot-hive-kickoff` marker file exists at the cwd (written by the Add-a-Bot spawn flow or the platform). One-shot — consumed at step 5.

If neither has fired, wait silently. Do not start work, claim tickets, or read skill files before completing startup.

Both triggers are agent-neutral — Claude Code, Codex, Aider, Gemini, Cursor, and any future agent use the same checklist.

Important runtime rule: on Windows machines, Bot Hive bot sessions must be started from WSL so the stream owner, PID/liveness checks, and shutdown logic all live in the same Linux runtime. Native Windows PowerShell may be used only as a launcher into WSL, not as the authoritative owner of bot session state.

---

## Preflight — concurrent-owner check

Before running steps 1–5, check whether another agent already owns this session:

- POSIX: `[ -f .bot-hive-stream.pid ] && kill -0 "$(cat .bot-hive-stream.pid)" 2>/dev/null`
- Windows PowerShell: `if (Test-Path .bot-hive-stream.pid) { try { Get-Process -Id (Get-Content .bot-hive-stream.pid) -ErrorAction Stop | Out-Null; $true } catch { $false } }`

If a live owner is found, **stop**. Tell the operator: "Another session is already running as a bot here. To add a new bot, open a fresh terminal and type `start the hive` there."

Only continue if no live owner is found.

---

## Step 1. Start the SSE listener

```bash
# POSIX
nohup ./scripts/stream.sh >/dev/null 2>&1 &

# Windows PowerShell
Start-Process powershell -ArgumentList "-NoProfile","-WindowStyle","Hidden","-File","./scripts/stream.ps1" -WindowStyle Hidden
```

The script connects to `/api/bots/stream?colony=<colony>`. The `colony` value comes from `gh api user --jq .login`. The server picks your handle from the colony's pool, assigns your seat and role, and sends a `your-role` event. The script writes `.bot-hive-stream.pid` on start.

---

## Step 2. Wait for the role notice

Poll for `.bot-hive-role-notice` **or** `.bot-hive-role-ptr` at cwd (max 30s, 200ms interval).

- If `.bot-hive-role-notice` appears first: read it directly.
- If `.bot-hive-role-ptr` appears first: read the path from it (e.g. `worktrees/scout`), then poll for `.bot-hive-role-notice` at that path (another 30s max).

This two-file protocol handles the secondary-bot case: a bot that starts at the same repo root as an existing bot has its state files written to a worktree subdirectory; `.bot-hive-role-ptr` is the pointer the stream script leaves at cwd so startup can find it.

```bash
# POSIX — poll for notice or ptr
deadline=$(($(date +%s) + 30))
notice_path=".bot-hive-role-notice"
while [ "$(date +%s)" -lt "$deadline" ]; do
  if [ -f ".bot-hive-role-notice" ]; then notice_path=".bot-hive-role-notice"; break; fi
  if [ -f ".bot-hive-role-ptr" ]; then
    subdir=$(cat .bot-hive-role-ptr)
    inner_deadline=$(($(date +%s) + 30))
    while [ "$(date +%s)" -lt "$inner_deadline" ]; do
      [ -f "$subdir/.bot-hive-role-notice" ] && notice_path="$subdir/.bot-hive-role-notice" && break 2
      sleep 0.2
    done
    break
  fi
  sleep 0.2
done

# Windows PowerShell
$deadline = (Get-Date).AddSeconds(30)
$noticePath = ".bot-hive-role-notice"
while ((Get-Date) -lt $deadline) {
  if (Test-Path ".bot-hive-role-notice") { $noticePath = ".bot-hive-role-notice"; break }
  if (Test-Path ".bot-hive-role-ptr") {
    $subdir = (Get-Content ".bot-hive-role-ptr" -Raw).Trim()
    $inner = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $inner) {
      if (Test-Path "$subdir\.bot-hive-role-notice") { $noticePath = "$subdir\.bot-hive-role-notice"; break }
      Start-Sleep -Milliseconds 200
    }
    break
  }
  Start-Sleep -Milliseconds 200
}
```

Parse the notice — `key=value` per line:

```
handle=scout
role=coder
seat=2
total=2
skillFiles=hive/skills/coder.md
at=2026-05-14T20:00:00Z
```

If the file never appears: surface the error (server unreachable, network blocked). Do not improvise a role. Exit and let the operator retry.

---

## Step 3. Write identity

Write `.bot-hive-identity` with the server-assigned handle:

```
colony=<colony>
handle=<handle from notice>
```

UTF-8, no BOM. On PowerShell use `[System.IO.File]::WriteAllText(path, content, [System.Text.UTF8Encoding]::new($false))` — never `Set-Content -Encoding utf8` (adds a BOM).

---

## Step 4. Read skill files and announce

Read **every** skill file listed in `skillFiles` (repo-relative paths, e.g. `hive/skills/pm.md`). The union defines what you do and don't do this session.

Announce in chat, one sentence:

```
I'm <colony>.<handle>, seat <n> of <total>, role: <role>, ready.
```

Use exact values from the notice.

---

## Step 5. Consume the kickoff marker and stop

If `.bot-hive-kickoff` exists, delete it — one-shot:

```bash
rm -f .bot-hive-kickoff                                                # POSIX
Remove-Item -Path .bot-hive-kickoff -ErrorAction SilentlyContinue      # PowerShell
```

Then stop. Do not claim a ticket, file work, or edit code until the operator gives a specific instruction.

---

---

## Sign-off

When the operator says `stop your hive work`, `sign off`, or `leave the hive`, run the procedure in [`hive/bot-shutdown.md`](./bot-shutdown.md). Don't close the terminal until the procedure prints `Signed off. Safe to close this window.`

---

## Recovery — role drift mid-session

If asked to do work outside your assigned role:

1. Refuse politely, naming the mismatch.
2. Re-read your skill rubric.
3. Continue operating per the rubric.

Exception: when you are the only bot in the colony, the consolidation table assigns every role to you. There is no "wrong role" in a solo colony.

---

## Reference

- `AGENTS.md` — agent-neutral conventions.
- `hive/HIVE.md` — format spec.
- `hive/roles.md` — role consolidation table.
- `hive/seats.md` — seat assignment and liveness.
- `hive/bot-shutdown.md` — sign-off procedure.
- `tasks/lessons.md` — past mistakes.
