# Bot startup

One procedure for all bots. Every session — PM, coder, tester — runs the same startup. The server assigns your handle and role; you do not choose them locally.

---

## STOP: do nothing until a trigger fires

Do not read skill files, claim tickets, start work, or edit code until one of these triggers fires:

1. The operator types `hive add a bot` in chat (preferred) or `start the hive` (legacy alias).
2. A `.bot-hive-kickoff` marker file exists at the cwd root.

If neither trigger has fired, wait silently.

---

## Startup compliance contract

Treat startup as a mandatory checklist, not free-form reasoning.

You must:
- execute the steps below in order
- print the required `Step N: ...` line immediately after completing each step
- stop immediately if any step fails
- treat the wrapper's returned `key=value` output as the only authority for startup success

If startup fails:
- surface the wrapper error
- stop immediately
- do not improvise a fallback procedure
- do not announce success

### Forbidden during startup

These are protocol violations even if the bot eventually connects:
- checking `.bot-hive-stream.pid` to decide whether startup succeeded
- polling temp task files to infer startup state
- running `tasklist`, `ps`, or similar commands to prove startup succeeded
- hand-running `stream.ps1`, `stream.sh`, role-notice polling, or identity writes
- backgrounding the wrapper and reconstructing success from side effects
- reading shared-root artifacts to infer startup success before wrapper failure is established
- announcing startup success without first verifying the required wrapper fields

### Required progress lines

Print these exact lines, in order, only when the corresponding step is actually complete:

```text
Step 1: trigger confirmed.
Step 2: wrapper started.
Step 3: wrapper result captured.
Step 4: startup fields verified.
Step 5: skill files loaded.
Step 6: startup complete.
```

### Final readiness line

After the checklist succeeds, announce exactly:

```text
I'm <colony>.<handle>, seat <n> of <total>, role: <role>, ready.
```

---

## Canonical startup entrypoint

Use exactly one of these canonical wrapper entrypoints:

```bash
# POSIX
./scripts/hive.sh add

# Windows PowerShell
./scripts/hive.ps1 add
```

Compatibility aliases `start` / `start the hive` still route to the same wrapper path, but the preferred human-facing command is `hive add a bot`.

The wrapper is the product startup path. It is responsible for:
- duplicate detection for the current terminal/session
- deciding `primary` vs `secondary`
- spawning the SSE listener
- waiting for the assigned role notice or secondary handoff
- registering the session in `.bot-hive-sessions/`
- reporting the assigned `session_root`

Startup success authority rule:
- the wrapper's returned `key=value` result is the only authority for startup success
- shared-root PID files, temp files, and manual process checks are not authority
- if the wrapper has not returned the required success fields, startup is not complete

---

## Required success fields

The wrapper prints machine-readable `key=value` lines on stdout. It also prints a short human-readable success confirmation on stderr telling the operator that the bot is live and the window should stay open.

Expected fields:

```text
client_session_id=...
startup_mode=primary|secondary
session_root=...
notice_path=...
handle=scout
role=coder
seat=2
total=2
skillFiles=hive/skills/coder.md
session_id=...
at=...
departed=...
```

Startup is successful only if all of these required fields are present:
- `startup_mode`
- `session_root`
- `notice_path`
- `handle`
- `role`
- `seat`
- `total`
- `skillFiles`

Notes:
- `session_root` is the bot's actual working root for state files. For secondary bots this may be a worktree such as `worktrees/<handle>/`.
- `seat`, `total`, `role`, `handle`, and `skillFiles` come from the server-assigned role notice.
- `startup_mode=secondary` is valid and expected when another bot is already alive.

If any required field is missing, startup has failed. Surface the wrapper error and stop.

---

## Required execution order

Follow these steps exactly.

### Step 1 — confirm the trigger

Condition:
- `hive add a bot` / `start the hive` was said in chat, or `.bot-hive-kickoff` exists

Then print exactly:

```text
Step 1: trigger confirmed.
```

### Step 2 — run the canonical wrapper

Run exactly one command:

```bash
# POSIX
./scripts/hive.sh add

# Windows PowerShell
./scripts/hive.ps1 add
```

Then print exactly:

```text
Step 2: wrapper started.
```

### Step 3 — capture the wrapper result

Wait for the wrapper to finish and capture its stdout `key=value` output.

Then print exactly:

```text
Step 3: wrapper result captured.
```

### Step 4 — verify required fields

Verify that the wrapper result contains all required success fields:
- `startup_mode`
- `session_root`
- `notice_path`
- `handle`
- `role`
- `seat`
- `total`
- `skillFiles`

Then print exactly:

```text
Step 4: startup fields verified.
```

### Step 5 — load assigned skill files

Read every skill file listed in `skillFiles` before doing anything else.

Then print exactly:

```text
Step 5: skill files loaded.
```

### Step 6 — announce readiness and stop

Announce in chat, one sentence:

```text
I'm <colony>.<handle>, seat <n> of <total>, role: <role>, ready.
```

If `.bot-hive-kickoff` exists, delete it.

Then print exactly:

```text
Step 6: startup complete.
```

Then stop and wait for the operator's next instruction.

Do not claim a ticket, file work, or edit code until the operator gives a specific instruction.

---

## Invalid startup transcript examples

These are wrong:
- "Let me check `.bot-hive-stream.pid` to confirm startup."
- "Let me inspect tasklist / ps while waiting."
- "The background task should have completed; let me check output files."
- "Startup completed" based only on PID checks or artifact checks.
- any startup transcript that skips the required `Step N: ...` progress lines

Reason:
- these are legacy/shared-root heuristics
- startup is successful only when the wrapper returns the required fields

---

## Mid-session role changes

When a peer joins or leaves your colony, the server pushes a new `your-role` event down the open SSE stream. `scripts/check-role.{sh,ps1}` surfaces that on the next operator prompt.

When that happens:
1. Announce the new role at the start of your reply.
2. Re-read any newly listed skill files.
3. Continue under the new role.

---

## Sign-off

When the operator says `hive shutdown`, `sign off`, `leave the hive`, `stop hive`, or `stop your hive work`, run the shutdown procedure in `hive/bot-shutdown.md` or the wrapper directly:

```bash
# POSIX
./scripts/hive.sh shutdown

# Windows PowerShell
./scripts/hive.ps1 shutdown
```

Do not close the terminal until it prints:

```text
Signed off. Safe to close this window.
```

---

## Reference

- `AGENTS.md` — agent-neutral conventions
- `hive/bot-shutdown.md` — sign-off procedure
- `hive/seats.md` — seat/liveness model
- `scripts/hive.sh` / `scripts/hive.ps1` — canonical startup/shutdown wrappers
