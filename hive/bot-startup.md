# Bot startup

Two bootstrap procedures depending on which kickoff trigger fired (per `AGENTS.md` Kickoff section):

- **Procedure A** (steps 0–5 below) — runs when `start the hive` fires in this session's cwd, OR when a `.bot-hive-kickoff` marker is present. Uses the cwd's existing `.bot-hive-identity`.
- **Procedure B** (its own section near the bottom) — runs when `hive add coder` or `hive add tester` fires in a fresh agent session. Creates a new worktree, then transforms this session into the new bot operating from that worktree.

If no trigger has fired, wait silently — do not proceed past this line.

Both procedures are agent-neutral — Claude Code, Codex, Aider, Gemini, Cursor, and any future agent all use the same checklists.

# Procedure A — `start the hive` / marker file

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

# Procedure B — `hive add coder` / `hive add tester`

Use this when the operator says `hive add coder` or `hive add tester` to a fresh agent session (typically in a new terminal). The phrase is the trigger; this procedure transforms this session into the new coder/tester bot operating from a freshly-created worktree.

Procedure A still applies if the operator instead typed `start the hive` or there's a `.bot-hive-kickoff` marker in cwd — handle that case first. If both could apply, prefer the more specific phrase (`hive add coder` / `hive add tester` over `start the hive`).

## B.1. Run the spawn helper

Capture the worktree path from the script's output. The script creates the worktree, writes `.bot-hive-identity` and `.bot-hive-kickoff` inside it.

```bash
# POSIX
./scripts/hive.sh add coder       # for `hive add coder`
./scripts/hive.sh add tester      # for `hive add tester`

# Windows PowerShell
.\scripts\hive.ps1 add coder
.\scripts\hive.ps1 add tester
```

The script refuses with a clear error if no PM bot is alive yet, or if `add tester` is called before a coder exists. Surface that error to the operator and stop — do not improvise around it.

The script prints `Spawned bot: worktrees/<handle>` — extract `<handle>` for the next steps.

## B.2. Start the SSE listener from the new worktree

Same script as Procedure A step 2, but invoked with the new worktree as cwd so it reads the worktree's `.bot-hive-identity` (the new handle) instead of cwd's.

```bash
# POSIX -- run inside a subshell so the cd doesn't change your own cwd
(cd worktrees/<handle> && nohup ./scripts/stream.sh > /dev/null 2>&1 &)

# Windows PowerShell -- use -WorkingDirectory
Start-Process powershell -ArgumentList "-NoProfile","-WindowStyle","Hidden","-File","./scripts/stream.ps1" -WorkingDirectory "worktrees/<handle>" -WindowStyle Hidden
```

The script writes `worktrees/<handle>/.bot-hive-stream.pid` on start.

## B.3. Wait for the role notice in the new worktree

Poll for `worktrees/<handle>/.bot-hive-role-notice` (max 30s). Same logic as Procedure A step 3 but the file lives in the worktree path, not cwd.

If the file never appears: surface the error (server unreachable, network blocked) — do not improvise a role.

## B.4. Read your role rubric and announce

Read every skill file listed in `skillFiles` (paths are repo-relative; same `hive/skills/*.md` files). The union defines what you do and don't do this session.

Announce in chat, one sentence:

```
I'm <colony>.<handle>, seat <n> of <total>, role: <role>, ready.
```

## B.5. Consume the kickoff marker

```bash
rm -f worktrees/<handle>/.bot-hive-kickoff                                                   # POSIX
Remove-Item -Path "worktrees/<handle>/.bot-hive-kickoff" -ErrorAction SilentlyContinue      # PowerShell
```

## B.6. Operate from the worktree path going forward

This session's actual cwd is still wherever the operator launched the agent (typically bot-hive root). The new bot identity lives at `worktrees/<handle>/`. Every subsequent operation that's worktree-specific runs with the worktree as cwd:

| Operation | Invocation pattern |
|---|---|
| List your work | `(cd worktrees/<handle> && ./scripts/my-work.sh)` |
| Claim a ticket | `(cd worktrees/<handle> && ./scripts/claim.sh HV-XXX)` |
| Ship to in-review | `(cd worktrees/<handle> && ./scripts/in-review.sh HV-XXX)` |
| Write a note | `(cd worktrees/<handle> && ./scripts/note.sh "<msg>")` |
| Heartbeat / role-check | `(cd worktrees/<handle> && ./scripts/heartbeat.sh)` etc. |

PowerShell equivalent uses `Push-Location` / `Pop-Location` or `-WorkingDirectory` on `Start-Process`. The principle is the same: the worktree path is your effective working directory; your shell cwd is incidental.

Edits to product code, tests, etc. happen on the worktree's branch (`<handle>-work`). Use `git -C worktrees/<handle> <command>` for any git operation that should land on the worktree branch instead of whatever branch is checked out in cwd.

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
