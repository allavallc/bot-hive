# [HV-147] Auto-spawn 3-bot minimum: PM spawns coder + tester

- **Status**: open
- **Priority**: High
- **Effort**: M
- **Feature set**:
- **Related**: 
- **Blocks**:
- **Blocked by**:
- **Split from**:
- **Assigned to**:
- **Started**:
- **Completed**:
- **Verification**:
- **Failure mode**:
- **User-facing**: yes
- **Rejected by**:
- **Rejected**:
- **Rejection reason**:

## Goal
When an operator starts a Bot Hive colony, they immediately get a 3-bot team (PM, coder, tester) with no manual spawning required. The PM bot acts as the master bot and spawns its two peers automatically.

## Why
**Current problem:**
Today, operators must manually spawn each bot:
- Type `start the hive` (or click "Add a bot") 3 separate times
- Each spawn is a separate manual action
- Easy to end up with 1 or 2 bots accidentally
- Fragile: if operator stops after 1 bot, that bot runs with PM+coder+tester roles consolidated

**Why 3-bot minimum matters:**
- **Multi-agent collaboration requires separation of concerns.** A bot reviewing its own code defeats the purpose.
- **No real use case for 1 or 2 bots.** If you're using Bot Hive, you want a coordinated team, not a single agent doing everything.
- **Mid-session role transitions are fragile.** When Bot 3 joins a 2-bot colony, roles shift mid-work.

**Technical feasibility (verified):**
The PM bot can programmatically spawn additional bots using:
```bash
nohup ./scripts/stream.sh >/dev/null 2>&1 &
```

Each spawned bot:
- Gets its own worktree (stream.sh detects secondary bots automatically)
- Connects to SSE and receives role assignment from server
- Runs independently in the background

## Done when
- PM bot startup procedure (`hive/bot-startup.md` or PM skill file) includes automatic spawn of coder + tester bots
- After PM bot completes its own SSE connection and role assignment, it spawns 2 additional stream processes
- All 3 bots announce ready within ~30 seconds of operator typing `start the hive`
- `hive/roles.md` consolidation table only defines 3+ case (1-bot and 2-bot rows removed)
- Operator sees "PM ready", "coder ready", "tester ready" messages in sequence
- No manual "Add a bot" clicks required for the initial 3-bot team

## Desired output
**Operator experience:**
1. Operator types `start the hive` once (or clicks "Add a bot" once)
2. PM bot starts, connects to SSE
3. PM bot automatically spawns coder and tester in background
4. Within 30s: all 3 bots announce ready
5. Colony has PM, coder, tester with distinct roles from the start

**When adding Bot 4+:**
Operator clicks "Add a bot" to spawn additional coders. No role transitions for existing bots.

## Success signals
- Single `start the hive` command results in 3 active bots
- Each bot has a single role (PM, coder, tester) - no consolidation
- `hive/roles.md` table only has "3+" and "4+" rows
- Zero mid-session role transitions during normal startup

## Failure signals
- PM bot starts but doesn't spawn peers; operator stuck with 1 bot
- Spawned bots fail to connect or get assigned wrong roles
- Operator has to manually spawn bots 2 and 3
- Documentation still references 1-bot or 2-bot configurations

## Out of scope
- Changing minimum beyond 3 (not requiring 4 or 5)
- Auto-scaling based on workload
- Handling mid-session drops below 3 (separate dormancy ticket)
- Spawning via UI "Add a bot" button (that stays manual for adding Bot 4+)

## Tests
- **Manual:** Fresh repo, type `start the hive` → verify 3 bots announce ready within 60s
- **Manual:** Check worktrees/ directory → verify 2 additional worktrees created
- **Manual:** Check `.bot-hive-identity` in each worktree → verify distinct handles + roles
- **Manual:** Spawn Bot 4 via "Add a bot" → verify it gets "coder" role, no transitions for Bots 1-3
- **Vitest:** Mock spawn calls → verify PM startup triggers 2 additional stream.sh processes

## How to test
1. Clone fresh bot-hive repo or delete existing colony data
2. From main checkout, type `start the hive` in Claude Code
3. Wait up to 60 seconds
4. Verify: 3 "ready" announcements appear (PM, coder, tester)
5. Run `ls worktrees/` → see 2 directories (coder and tester worktrees)
6. Check `worktrees/<handle>/.bot-hive-identity` for each → distinct handles and roles
7. Click "Add a bot" → Bot 4 spawns as additional coder
8. Check event logs → no role change events for Bots 1-3

## What gets ripped out
This is a simplification - **delete old code**, don't just add to it:

**`hive/roles.md`:**
- Delete the 1-bot row: `| 1 | PM + coder + tester | — | — | — |`
- Delete the 2-bot row: `| 2 | PM + tester | coder | — | — |`
- Keep only: `| 3 | PM | coder | tester | — |` and `| 4+ | PM | coder | tester | coder (additional) |`

**`hive/bot-startup.md`:**
- Delete "Mid-session role changes" section (lines ~145-147) - no more role transitions

**`hive/skills/pm.md`:**
- Delete: "When other bots exist in your colony (count ≥ 2), coding is the coder's job"
- Replace with: "You never code; that's the coder's job" (PM always delegates coding)

**`src/lib/roles.ts`:**
- The `roleForSeat()` function should throw an error if `total < 3`
- No logic needed for handling 1-bot or 2-bot cases

**Documentation:**
- Search entire repo for "1-bot", "2-bot", "single bot", "PM + coder" and delete references
- Update any README or setup docs that mention "you can start with one bot"

## Technical approach (for coder)
PM bot startup adds this step after receiving its own role assignment:

```bash
# PM skill file or bot-startup.md addition
# After Step 2 (role notice received) and PM confirms it has PM role:

if [ "$role" = "PM" ]; then
  # Spawn coder bot
  nohup ./scripts/stream.sh >/dev/null 2>&1 &
  
  # Spawn tester bot
  nohup ./scripts/stream.sh >/dev/null 2>&1 &
  
  # Log spawns
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) spawned-peers PM spawned coder + tester" >> hive/events/$COLONY.$HANDLE.log
fi
```

The stream.sh script already handles:
- Detecting it's a secondary bot (`.bot-hive-stream.pid` exists)
- Creating worktrees automatically
- Connecting to SSE
- Receiving role assignment from server

## Notes
- PM bot is the "master bot" - it owns spawning the initial team
- Operator still uses "Add a bot" for Bot 4+ (manual, as today)
- Migration: existing <3 bot colonies continue working but won't auto-spawn until restarted
- The PM-spawns-peers pattern is common in multi-agent systems
