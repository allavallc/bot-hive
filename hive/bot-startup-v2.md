# Bot Startup Procedure

> **Applies to all bot roles:** PM, coder, tester, and any future roles run this same procedure.
> The server assigns your handle and role — you never choose them yourself.

---

## STOP: Check triggers before doing anything

Do not read skill files, claim tickets, or take any action until a trigger fires.

**Valid triggers (either one is sufficient):**

1. The operator types `hive add a bot` in chat *(preferred)* or `start the hive` *(legacy alias)*
2. A `.bot-hive-kickoff` marker file exists at the cwd root

If neither trigger has fired → **wait silently.**

---

## Step 1 — Run the startup wrapper

Run exactly one of these. Do not hand-run `stream.ps1`, `stream.sh`, PID checks, role-notice polling, or identity writes — those are handled internally by the wrapper.

```bash
# POSIX
./scripts/hive.sh add

# Windows PowerShell
./scripts/hive.ps1 add
```

The wrapper handles:
- Duplicate detection for the current terminal/session
- `primary` vs `secondary` assignment
- Spawning the SSE listener
- Waiting for the assigned role notice or secondary handoff
- Registering the session in `.bot-hive-sessions/`
- Reporting the assigned `session_root`

**If the wrapper fails:** surface the error and stop. Do not improvise a fallback.

---

## Step 2 — Read the wrapper output

The wrapper prints `key=value` lines on stdout and a human-readable confirmation on stderr.

| Field | Notes |
|---|---|
| `client_session_id` | |
| `startup_mode` | `primary` or `secondary` — both are valid |
| `session_root` | Your working root for state files. Secondary bots may get a worktree path like `worktrees/<handle>/` |
| `notice_path` | |
| `handle` | Assigned by the server, e.g. `scout` |
| `role` | Assigned by the server, e.g. `coder` |
| `seat` | Your seat number |
| `total` | Total seats in the colony |
| `skillFiles` | Comma-separated paths, e.g. `hive/skills/coder.md` |
| `session_id` | |
| `at` | |
| `departed` | |

---

## Step 3 — Read skill files

Read every file listed in `skillFiles` before doing anything else.

---

## Step 4 — Announce in chat

Post exactly one sentence using this format:

```
I'm <colony>.<handle>, seat <n> of <total>, role: <role>, ready.
```

---

## Step 5 — Clean up and wait

1. If `.bot-hive-kickoff` exists, delete it.
2. **Stop and wait for the operator's next instruction.**

Do not claim a ticket, start work, or edit any file until the operator explicitly instructs you to.

---

## Mid-session role changes

When a peer joins or leaves, the server pushes a new `your-role` event on the open SSE stream. `scripts/check-role.{sh,ps1}` surfaces this at the next operator prompt.

When a role change arrives:
1. Announce the new role at the top of your reply.
2. Re-read any newly listed skill files.
3. Continue under the new role.

---

## Shutdown

Trigger phrases: `hive shutdown`, `sign off`, `leave the hive`, `stop hive`, `stop your hive work`

```bash
# POSIX
./scripts/hive.sh shutdown

# Windows PowerShell
./scripts/hive.ps1 shutdown
```

Do not close the terminal until it prints:

```
Signed off. Safe to close this window.
```

Full procedure: `hive/bot-shutdown.md`

---

## Rules summary

| Rule | Where it applies |
|---|---|
| Never choose your own handle or role | Always |
| Never start work before a trigger fires | Pre-startup |
| Never hand-run internal scripts | Startup |
| Never claim tickets or edit code until instructed | Post-startup |
| Always read all `skillFiles` before announcing | Post-startup |

---

## Reference

- `AGENTS.md` — agent-neutral conventions
- `hive/bot-shutdown.md` — sign-off procedure
- `hive/seats.md` — seat/liveness model
- `scripts/hive.sh` / `scripts/hive.ps1` — canonical startup/shutdown wrappers
