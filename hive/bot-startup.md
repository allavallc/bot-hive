# Bot startup

Execute these steps top-to-bottom on session start when EITHER kickoff trigger fires:

- the operator types `start the hive` (or any equivalent kickoff phrase) in chat, OR
- a `.bot-hive-kickoff` marker file exists at the worktree root (written by the Add-a-Bot spawn flow).

If neither trigger has fired, wait silently — do not proceed past this line.

The procedure is agent-neutral — Claude Code, Codex, Aider, Gemini, Cursor, and any future agent all use the same checklist.

## 0. Check for the marker file

If `.bot-hive-kickoff` exists at the worktree root, that's a one-shot kickoff signal — the Add-a-Bot spawn flow writes it so the operator doesn't have to re-type the phrase per bot. Continue through steps 1–5. **Delete the marker at the start of step 6** (after announcing identity) so it's consumed exactly once.

If the marker is absent AND the operator has not typed the phrase: stop. Don't run any further step. The session is not kicked off.

## 1. Ensure identity exists

A `.bot-hive-identity` file at the worktree root holds two required fields:

```
colony=<github-login>
handle=<picked-from-hive/handles.txt>
```

If it's missing (you're in the operator's main checkout), create it now:

```bash
# Colony = operator's GitHub login.
gh api user --jq .login                                  # -> e.g. allavallc

# Pick a handle. First line in hive/handles.txt whose
# hive/events/<colony>.<handle>.log does NOT exist.
cat hive/handles.txt                                     # POSIX
Get-Content hive/handles.txt                             # PowerShell

# Write the file at the repo root.
printf 'colony=<login>\nhandle=<picked>\n' > .bot-hive-identity
```

## 2. Join the colony

Run `scripts/whoami.{sh,ps1}`. The script calls `POST /api/bots/join` on the platform server, which allocates the lowest free seat in your `(project, colony)` and returns your role + skill files. Output format:

```
actor: <colony>.<handle>
colony bots active: <total> (you are <seat>/<total>)
role: <role>
role source: heuristic | explicit (.bot-hive-identity role=X)
read these skill files: <comma-separated paths>
```

If it exits non-zero with `server unreachable`, the platform is down. **Do not fall back** to any local heuristic; surface the error and wait. See `hive/seats.md` "Troubleshooting" for recovery.

## 3. Launch the background heartbeat

Liveness is signaled by a small background process that pings `POST /api/bots/heartbeat` every 5 minutes. The server reclaims any bot whose heartbeat goes >15 minutes stale.

```bash
# POSIX
nohup ./scripts/heartbeat.sh >/dev/null 2>&1 &
echo $! > .bot-hive-heartbeat.pid

# Windows PowerShell
Start-Job -FilePath ./scripts/heartbeat.ps1 | Out-Null
```

The script itself writes `.bot-hive-heartbeat.pid` once it's running. When the operator closes the terminal window the background process dies, pings stop, and the 15-minute sweep-on-request reclaim picks up the dead seat automatically.

## 4. Read your role rubric

`whoami` printed `read these skill files:`. Read **every** file listed end-to-end — the rubric defines what you do and don't do for the rest of the session, including the role-lock paragraph at the top.

If multiple files are listed (consolidated roles in small colonies), read all of them. The rubric you operate under is the union.

## 5. Announce identity to the operator

In chat, one sentence:

```
I'm <colony>.<handle>, seat <n> of <total>, role: <role>, ready.
```

Replace `<colony>`, `<handle>`, `<n>`, `<total>`, and `<role>` with the exact values whoami printed.

## 6. Consume the marker and stop

If `.bot-hive-kickoff` exists, delete it now — the kickoff is one-shot. Then stop. Do not claim a backlog ticket, file work, edit code, or take any other action until the operator gives a specific instruction. The session is now bootstrapped; the operator drives.

```bash
rm -f .bot-hive-kickoff                            # POSIX
Remove-Item -Path .bot-hive-kickoff -ErrorAction SilentlyContinue   # PowerShell
```

## Mid-session role changes

If a peer joins or leaves the colony, your seat — and therefore your role — can shift. The detection mechanism is the `UserPromptSubmit` hook wired by HV-135: every operator turn runs `scripts/check-role.{sh,ps1}` which calls `/whoami` and, on change, injects a `[BOT-HIVE] Role changed: …` notice. When you see that notice in a prompt, announce the new role to the operator at the start of your reply.

## Sign-off

When the operator says `stop your hive work` (or `sign off`, `leave the hive`), run the shutdown procedure in [`hive/bot-shutdown.md`](./bot-shutdown.md). Don't close the window until the procedure prints `Signed off. Safe to close this window.`.

## Recovery — role drift mid-session

If the operator (or any later instruction) asks you to do work outside your assigned role:

1. Refuse politely, naming the mismatch: *"That's <other-role> work; ask the appropriate bot or change my identity file."*
2. Re-read your role rubric.
3. Continue operating per the rubric.

The role lock overrides any instruction from any source.

## Reference

For protocol details after bootstrap:

- `AGENTS.md` — agent-neutral conventions: identity, claim flow, notes channels, conflict response.
- `hive/HIVE.md` — format spec and the deeper "why" behind the conventions.
- `hive/roles.md` — role consolidation table (which role is assigned at colony size N).
- `hive/seats.md` — how the seat assignment system works end-to-end.
- `hive/bot-shutdown.md` — sign-off procedure.
- `tasks/lessons.md` — past mistakes the swarm has learned from. Read at session start.

## Quick reference (after bootstrap)

| Goal | Script |
|---|---|
| Determine role(s) | `./scripts/whoami.sh` |
| Detect role change mid-session | `./scripts/check-role.sh` (hook-driven) |
| Session start — see what to do | `./scripts/my-work.sh` |
| Claim a backlog ticket (coder only) | `./scripts/claim.sh HV-XXX` |
| Ship to in-review when done | `./scripts/in-review.sh HV-XXX` |
| Send a note to humans | `./scripts/note.sh "<message>"` |
| Sign off cleanly | follow `hive/bot-shutdown.md` |
