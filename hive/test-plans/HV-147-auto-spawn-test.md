# HV-147 Auto-Spawn Test Plan

## Pre-test setup
1. Clean slate: delete any existing `.bot-hive-*` files in the repo root
2. Ensure Bot Hive server is running
3. Ensure repo is connected to Bot Hive project

## Test: PM auto-spawns 3-bot team

### Steps
1. From the bot-hive repo root, type `start the hive` in Claude Code
2. Watch for PM announcements (should appear within 5 seconds):
   - "I'm the PM bot. Spawning coder bot... Spawning tester bot... Waiting for the team to connect (this takes ~30 seconds)."
3. Wait 30-40 seconds
4. Watch for final announcement:
   - "Team ready: PM (me), coder, tester. Checking the hive board for priority work..."

### Expected results
- 3 bots announce ready (PM, coder, tester)
- `ls worktrees/` shows 2 directories (coder and tester worktrees)
- Each worktree has `.bot-hive-identity` with distinct handles
- No manual "Add a bot" clicks required

### Verify roles
```bash
# Check PM identity
cat .bot-hive-identity
# Should show: colony=<your-github-login>, handle=<some-handle>

# Check coder identity
cat worktrees/*/. bot-hive-identity
# Should show different handles

# Check role assignments
cat .bot-hive-role-notice
cat worktrees/*/.bot-hive-role-notice
# Should show: PM, coder, tester (one each)
```

## Test: Cannot start with <3 bots

### Steps
1. Manually kill 2 of the 3 bots (close their streams)
2. Try to claim a ticket

### Expected result
- Server rejects with error: "Bot Hive requires minimum 3 bots per colony"

## Success criteria
✅ Single `start the hive` command → 3 bots ready  
✅ PM announces spawn progress  
✅ All 3 bots have distinct roles (no consolidation)  
✅ Worktrees created automatically  
✅ Server blocks work with <3 bots
