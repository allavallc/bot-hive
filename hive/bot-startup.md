# Bot startup

One procedure for all bots. Every session — PM, coder, tester — runs the same steps. The server assigns your handle and role; you do not need to know them in advance.

**Triggers** (either one fires this procedure):

1. The operator types `start the hive` in chat.
   - Local development variants: `start the hive local` or `start the hive -local`. These run the same procedure, but Step 1 must force `BOT_HIVE_API_URL=http://localhost:3000`.
2. A `.bot-hive-kickoff` marker file exists at the cwd (written by the Add-a-Bot spawn flow or the platform). One-shot — consumed at step 5.

If neither has fired, wait silently. Do not start work, claim tickets, or read skill files before completing startup.

Both triggers are agent-neutral — Claude Code, Codex, Aider, Gemini, Cursor, and any future agent use the same checklist.

---

## Preflight — cwd ownership

Use the checked-in Hive helper for startup. Do not paste or reconstruct the long PowerShell/Bash internals in chat. The helper creates a unique startup id, clears only a stale PID file, starts the SSE listener, waits for the request-scoped handoff, and prints the assigned notice.

```bash
# POSIX production
./scripts/hive.sh start

# POSIX local
./scripts/hive.sh start local

# Windows PowerShell production
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\hive.ps1 start

# Windows PowerShell local
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\hive.ps1 start local
```

The script connects to `/api/bots/stream?colony=<colony>` without a handle on the first connection. The `colony` value comes from `gh api user --jq .login`, with `.bot-hive-identity` as a local fallback only for the colony name. The server picks a handle from the colony's active-seat pool, assigns your seat and role, then sends a `your-role` event. The script writes `.bot-hive-stream.pid` on start. If the same stream later reconnects, it reconnects with the handle already assigned to that stream; a fresh startup never reuses cwd `.bot-hive-identity` as its handle.

The API base URL is resolved in this order:

1. `BOT_HIVE_API_URL` environment variable.
2. Local `.bot-hive-api-url` file at the repo root.
3. Production fallback: `https://bot-hive-j0ax.onrender.com`.

`.bot-hive-api-url` remains an optional local override, but `start the hive local` is the preferred path for local development because the intent is explicit in the operator prompt.

---

## Step 1. Parse the helper output

The helper prints `STARTUP_ID`, `HANDOFF_PATH`, `NOTICE_PATH`, `SESSION_ROOT`, then `---NOTICE---` followed by the assigned notice. If `ERROR=` is printed, surface it and stop; do not improvise a role.

If the handoff points at a worktree, treat that worktree as this bot's session root for all future file reads, shell commands, ticket claims, and shutdown. The chat terminal did not need to move; the agent must use the assigned worktree path as its working directory.

Parse the notice — `key=value` per line:

```
handle=scout
role=coder
seat=2
total=2
skillFiles=hive/skills/coder.md
session_id=a3f9c2d1
at=2026-05-14T20:00:00Z
```

If the file never appears: surface the error (server unreachable, network blocked). Do not improvise a role. Exit and let the operator retry.

After parsing the startup notice, delete that notice file and the startup handoff file if present. Future role changes will write a new notice in this bot's session root.

---

## Step 2. Confirm identity

The stream script writes `.bot-hive-identity` in this bot's session root with the server-assigned handle:

```
colony=<colony>
handle=<handle from notice>
session_id=<first 8 chars of connection id>
```

Confirm the file exists at the session root. Do not write a second root identity file for a bot whose handoff points at `worktrees/<handle>/`.

---

## Step 3. Read skill files and announce

Read **every** skill file listed in `skillFiles` (repo-relative paths, e.g. `hive/skills/pm.md`). The union defines what you do and don't do this session.

Announce in chat, one sentence:

```
I'm <colony>.<handle>, seat <n> of <total>, role: <role>, ready.
```

Use exact values from the notice.

---

## Step 3b. Open activity log

Read `.bot-hive-identity` in your session root. It contains `colony`, `handle`, and `session_id`. Compose your log prefix:

```
<handle>-<role>-<session_id>-<ISO timestamp>
```

Example: `wren-pm-a3f9c2d1-2026-05-15T14:23:02Z`

Create `logs/<colony>/` if it does not exist, then write the first entry to `logs/<colony>/activity.log`:

```
<prefix>: started; colony=<colony> handle=<handle> seat=<n>/<total> role=<role>
```

Use this same prefix format for every subsequent log entry in this session — only the timestamp changes. Log all significant activity: reading skill files, claiming a ticket, key decisions, findings, blockers, completing a ticket, role changes. Write one line per event. Do not delete the log; entries from previous bot sessions in the same colony remain and are valuable history.

---

## Step 4. Consume the kickoff marker and stop

If `.bot-hive-kickoff` exists, delete it — one-shot:

```bash
rm -f .bot-hive-kickoff                                                # POSIX
Remove-Item -Path .bot-hive-kickoff -ErrorAction SilentlyContinue      # PowerShell
```

Then stop. Do not claim a ticket, file work, or edit code until the operator gives a specific instruction.

---

## Mid-session role changes

When a peer joins or leaves your colony, the server pushes a new `your-role` event down your open SSE stream. `scripts/stream.{ps1,sh}` rewrites `.bot-hive-role-notice`. The `UserPromptSubmit` hook (`scripts/check-role.{ps1,sh}`) reads it on your next operator prompt and injects a `[BOT-HIVE] Role changed: …` notice. Announce the new role at the start of your reply and re-read any new skill files listed.

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
