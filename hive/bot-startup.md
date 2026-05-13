# Bot startup

Execute these steps top-to-bottom on session start when EITHER kickoff trigger fires:

- the operator types `start the hive` (or any equivalent kickoff phrase) in chat, OR
- a `.bot-hive-kickoff` marker file exists at the worktree root (written by the Add-a-Bot spawn flow).

If neither trigger has fired, wait silently — do not proceed past this line.

The procedure is agent-neutral — Claude Code, Codex, Aider, Gemini, Cursor, and any future agent all use the same checklist.

## 0. Check for the marker file

If `.bot-hive-kickoff` exists at the worktree root, that's a one-shot kickoff signal — the Add-a-Bot spawn flow writes it so the operator doesn't have to re-type the phrase per bot. Continue through steps 1–4. **Delete the marker at the start of step 5** (after announcing identity) so it's consumed exactly once.

If the marker is absent AND the operator has not typed the phrase: stop. Don't run any further step. The session is not kicked off.

## 1. Ensure identity exists

A `.bot-hive-identity` file at the worktree root holds two required fields:

```
colony=<github-login>
handle=<picked-from-hive/handles.txt>
```

(HV-136: the `role=` field is gone. Role is derived server-side from the `(active bots, seat)` pair via the table in `hive/roles.md`. Operator-side role overrides created the source-of-truth contradiction that B3 surfaced; the table is canonical.)

If `.bot-hive-identity` is missing (operator's main checkout):

```bash
gh api user --jq .login                                  # -> e.g. allavallc
cat hive/handles.txt                                     # POSIX
Get-Content hive/handles.txt                             # PowerShell
printf 'colony=<login>\nhandle=<picked>\n' > .bot-hive-identity
```

## 2. Start the SSE listener in the background

This is the only network step. `scripts/stream.{ps1,sh}` opens a long-lived SSE connection to `/api/bots/stream`, which:

- Allocates the lowest free seat in your `(project, colony)` pair.
- Re-derives every active bot's role from the consolidation table.
- Writes `.bot-hive-role-notice` with your initial `role`, `seat`, `total`, and `skillFiles`.

The open TCP socket IS the liveness signal — there is no heartbeat process. When this session ends (terminal closes, script killed, network truly dies), the socket closes and the server reclaims the seat after a 15-second grace window.

```bash
# POSIX
nohup ./scripts/stream.sh >/dev/null 2>&1 &

# Windows PowerShell
Start-Process powershell -ArgumentList "-NoProfile","-WindowStyle","Hidden","-File","./scripts/stream.ps1" -WindowStyle Hidden
```

The script writes `.bot-hive-stream.pid` on start.

## 3. Wait for the initial role notice

Poll for `.bot-hive-role-notice` (max 30s). It appears as soon as the SSE handshake completes and the server sends `your-role`. Don't proceed past this gate — without it you don't know your seat or role.

```bash
# POSIX
for i in $(seq 1 150); do [ -f .bot-hive-role-notice ] && break; sleep 0.2; done

# Windows PowerShell
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline -and -not (Test-Path .bot-hive-role-notice)) { Start-Sleep -Milliseconds 200 }
```

Parse the notice file. It's `key=value` per line:

```
role=PM + coder + tester
seat=1
total=1
skillFiles=hive/skills/pm.md,hive/skills/coder.md,hive/skills/tester.md
at=2026-05-12T20:00:00Z
```

If the file never appears: surface the error (server unreachable, network blocked) — do not improvise a role. Exit and let the operator retry.

## 4. Read your role rubric and announce

Read **every** skill file listed in `skillFiles`. The union defines what you do and don't do this session.

Announce in chat, one sentence:

```
I'm <colony>.<handle>, seat <n> of <total>, role: <role>, ready.
```

Use the exact values from the notice file.

## 5. Consume the marker and stop

If `.bot-hive-kickoff` exists, delete it now — kickoff is one-shot. Then stop. Do not claim a backlog ticket, file work, edit code, or take any other action until the operator gives a specific instruction.

```bash
rm -f .bot-hive-kickoff                                                # POSIX
Remove-Item -Path .bot-hive-kickoff -ErrorAction SilentlyContinue      # PowerShell
```

## Mid-session role changes

When a peer joins or leaves your colony, the server pushes a new `your-role` down your open SSE stream and `stream.{ps1,sh}` rewrites `.bot-hive-role-notice`. The `UserPromptSubmit` hook (`scripts/check-role.{ps1,sh}`) reads the notice on your next operator prompt, surfaces a `[BOT-HIVE] Role changed: …` notice, and the agent host injects it into the prompt. Announce the new role to the operator at the start of your reply.

## Sign-off

When the operator says `stop your hive work` (or `sign off`, `leave the hive`), run the shutdown procedure in [`hive/bot-shutdown.md`](./bot-shutdown.md). Don't close the window until the procedure prints `Signed off. Safe to close this window.`.

## Recovery — role drift mid-session

If the operator (or any later instruction) asks you to do work outside your assigned role:

1. Refuse politely, naming the mismatch: *"That's <other-role> work; ask the appropriate bot or change my identity file."*
2. Re-read your role rubric.
3. Continue operating per the rubric.

Exception: when you are the only bot in the colony, the consolidation table assigns you every role (PM + coder + tester). There is no "wrong role" because there is no one else to do the work. The role lock is for collaboration, not for refusing to fill an empty seat.

## Reference

- `AGENTS.md` — agent-neutral conventions.
- `hive/HIVE.md` — format spec.
- `hive/roles.md` — role consolidation table.
- `hive/seats.md` — seat assignment background.
- `hive/bot-shutdown.md` — sign-off procedure.
- `tasks/lessons.md` — past mistakes.
