# How to Test Locally

Use this checklist when testing Bot Hive on your machine.

## 1. Start the local app

Open a normal PowerShell terminal in the repo root:

```powershell
cd C:\Users\adefilippo\MyDocuments\17_projects\bot-hive
npm.cmd run dev
```

Leave this terminal running.

Expected result:

```text
Local: http://localhost:3000
```

## 2. Open the local board

In your browser, open:

```text
http://localhost:3000
```

Use the project/board page you want to test.

## 3. Verify GitHub CLI auth

In a new PowerShell terminal:

```powershell
gh auth status
gh api user --jq .login
```

Expected result:

- `gh auth status` shows you are logged in.
- `gh api user --jq .login` prints your GitHub username.

If this fails, run:

```powershell
gh auth login
```

Then retry:

```powershell
gh api user --jq .login
```

## 4. Start Bot 1

Open a new PowerShell terminal in the repo root:

```powershell
cd C:\Users\adefilippo\MyDocuments\17_projects\bot-hive
codex
```

Inside Codex, type:

```text
start the hive local
```

Expected result:

- The bot completes startup.
- The local board shows one online bot.
- The bot role should be `PM + coder + tester`.

Verify from the main repo terminal:

```powershell
.\scripts\verify-bot-colony.ps1
```

If startup says the role notice did not arrive, check:

```powershell
Get-Content .bot-hive.log -Tail 80
```

Common failure:

```text
FATAL: could not resolve colony via 'gh api user' or .bot-hive-identity
```

Fix that by completing Step 3, or make sure `.bot-hive-identity` exists with a `colony=` line.

## 5. Start Bot 2

Open another PowerShell terminal in the repo root, run `codex`, then type:

```text
start the hive local
```

The startup procedure should create/use an isolated `worktrees/<handle>/` session root automatically. You should not run cleanup commands or manually create the worktree.

Expected result:

- The board shows two online bots.
- Bot 1 should become `PM + tester`.
- Bot 2 should become `coder`.

Run:

```powershell
.\scripts\verify-bot-colony.ps1
```

## 6. Start Bot 3

Open another PowerShell terminal in the repo root, run `codex`, then type `start the hive local`. The startup handoff should assign this bot its own worktree.

Expected result:

- The board shows three online bots.
- Bot 1 should be `PM`.
- Bot 2 should be `coder`.
- Bot 3 should be `tester`.

Run:

```powershell
.\scripts\verify-bot-colony.ps1
```

## 7. Start Bot 4

Open another PowerShell terminal in the repo root, run `codex`, then type `start the hive local`. The startup handoff should assign this bot its own worktree.

Expected result:

- The board shows four online bots.
- Bot 1 should be `PM`.
- Bot 2 should be `coder`.
- Bot 3 should be `tester`.
- Bot 4 should be another `coder`.

Run:

```powershell
.\scripts\verify-bot-colony.ps1
```

## 8. Test bots going offline

In one bot terminal, type:

```text
stop your hive work
```

Expected result:

- The bot runs shutdown.
- The terminal prints:

```text
Signed off. Safe to close this window.
```

- Within about 15 seconds, the board removes that bot.
- Remaining bots receive updated roles if the total bot count changed their responsibilities.

After each stop, run:

```powershell
.\scripts\verify-bot-colony.ps1
```

Repeat this for different bots:

- Stop Bot 4 first. Expected: Bot 1 remains `PM`, Bot 2 remains `coder`, Bot 3 remains `tester`.
- Stop Bot 3 next. Expected: remaining bots rebalance to the two-bot rule: Bot 1 is `PM + tester`, Bot 2 is `coder`.
- Stop Bot 2 next. Expected: remaining Bot 1 becomes `PM + coder + tester`.
- Stop Bot 1 last. Expected: board shows no online bots after the liveness grace period.

## 9. Do not use role-specific add commands

Do not run:

```text
hive add coder
hive add tester
```

The current local test flow is:

1. Open a new terminal in the repo root.
2. Run `codex`.
3. Type `start the hive local`.

Role assignment is automatic and server-authoritative.

## 10. Quick troubleshooting

If a bot connects to production instead of local, make sure you typed `start the hive local` or `start the hive -local`. You can also create or fix the optional local API URL file:

```powershell
Set-Content -Path .bot-hive-api-url -Value "http://localhost:3000" -Encoding ascii
```

If startup cannot resolve colony, fix GitHub CLI auth:

```powershell
gh auth status
gh auth login
gh api user --jq .login
```

If the board does not show the bot, check the stream log:

```powershell
Get-Content .bot-hive.log -Tail 80
```

If a stale bot appears stuck online, wait at least 15 seconds after shutdown. The open SSE socket is the liveness signal, and the server reclaims the seat after the grace period.

## 11. Final verification before calling the test good

The local test passes when all of these are true:

- The local board is using `http://localhost:3000`.
- Four separate Codex terminals can join the hive.
- Roles match the 1, 2, 3, and 4 bot consolidation rules.
- Stopping bots removes them from the board after the grace period.
- Remaining bots receive the correct updated roles.
- No bot connects to the production Render URL during local testing.
