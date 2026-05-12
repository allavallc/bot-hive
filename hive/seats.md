# Bot seats — how it works

The seat assignment system tracks every active bot in a `(project, colony)` pair so the operator can see who's working, bots derive role from seat, and the swarm self-heals when terminals die.

## Mental model

A colony has N seats. The first bot to boot takes seat 1, the next takes seat 2, etc. Role is **derived** from seat via the table in `hive/roles.md`:

| Active bots | Bot 1 | Bot 2 | Bot 3 | Bot 4+ |
|---|---|---|---|---|
| 1 | PM + coder + tester | — | — | — |
| 2 | PM + tester | coder | — | — |
| 3 | PM | coder | tester | — |
| 4+ | PM | coder | tester | coder (additional) |

When a bot leaves, the server **renumbers** survivors so seats stay contiguous. Bot 4 becomes bot 3, bot 3 becomes bot 2, etc. Survivors detect the change on their next operator turn via a `UserPromptSubmit` hook and announce the new role to the operator.

The source of truth is a Postgres table (`bots`), not a markdown file or event log. Files were tried first (see HV-129) and didn't work — a fresh bot has no events, so it announced as the solo bot even when others were active. Identity, seat, and liveness now live in the platform DB.

For full design context: `docs/2026-05-12-bot-seat-assignment-design.md`. For the stack: `docs/architecture.md`.

## Lifecycle

### Boot
1. Operator triggers kickoff (`start the hive` or `.bot-hive-kickoff` marker file).
2. Bot runs `scripts/whoami.{sh,ps1}` which calls `POST /api/bots/join` and prints seat + role.
3. Bot launches `scripts/heartbeat.{sh,ps1}` as a background process (writes PID to `.bot-hive-heartbeat.pid`).
4. Bot reads its skill rubric and announces: `I'm <colony>.<handle>, seat N of T, role: X, ready.`

### Running
- The background heartbeat pings `POST /api/bots/heartbeat` every 5 minutes.
- Each operator turn, the agent host runs `scripts/check-role.{sh,ps1}` (wired via the `UserPromptSubmit` hook from HV-135). The script compares the current `/whoami` result against `.bot-hive-role-cache`; on change it prints a `[BOT-HIVE] Role changed: …` notice that the host injects into the prompt.

### Sign-off
Operator says one of the trigger phrases below; bot runs the procedure in [`bot-shutdown.md`](./bot-shutdown.md). Server marks the row offline, renumbers survivors, broadcasts `bot-left`.

## Trigger phrases

The operator can use any of these (case-insensitive, listed in `AGENTS.md`):

- `stop your hive work` (canonical)
- `sign off`
- `leave the hive`

To extend the list in your own fork: edit the alias section in `AGENTS.md` plus the regex in your agent host's pre-prompt hook if it parses chat directly.

## Heartbeat cadence

- **Ping**: every 5 minutes (override with `BOT_HIVE_HEARTBEAT_SECONDS` env var).
- **Reclaim threshold**: 15 minutes since last heartbeat.
- **Reclaim mechanism**: sweep-on-request. Inside each `/join`, `/whoami`, `/colony`, and `/leave` request, the server checks the colony for any active row past the threshold and marks it offline + renumbers. There is no separate cron; dead seats in colonies with no consumers don't matter until someone asks.

## Endpoints

All under `/api/bots/`. Auth: none in v1 (a follow-up ticket will add Bearer auth).

| Endpoint | Purpose |
|---|---|
| `POST /join` | Allocate lowest free seat. Returns `{seat, total, role, skill_files}`. |
| `GET /whoami` | Return current seat + role. |
| `POST /heartbeat` | Bump `last_heartbeat_at`. No-op for offline rows. |
| `POST /leave` | Mark offline, renumber survivors, broadcast. |
| `GET /colony` | Full per-colony seat map for a project. Used by the kanban "See Bot Team" modal. |

## UI surface

The kanban project page mounts a fixed-position **"See Bot Team"** button (top-right, below AddBotButton and AdminInbox). Clicking opens a modal listing every active bot in every colony, grouped by colony with seat number + role. The modal subscribes to the existing project SSE stream and updates within ~1s on `bot-joined` and `bot-left` events.

## Hook setup

The mid-session role-change detection requires wiring `scripts/check-role.{sh,ps1}` into the agent host's pre-prompt hook.

### Claude Code

`.claude/settings.json` (per-project — committed to the repo):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "matcher": "*", "command": "scripts/check-role.sh" }
    ]
  }
}
```

On Windows replace `.sh` with `.ps1`. HV-135 ships this config; see that PR for the exact JSON.

### Codex / Cursor / Aider / Gemini

Each host has its own pre-prompt hook mechanism — name, config path, and stdout/inject semantics vary. The contract is identical: **run `scripts/check-role.{sh,ps1}` before every user prompt; any stdout the script emits is appended to the prompt context as a system note.** Consult your host's documentation for the right wiring.

If your host has no pre-prompt hook, the fallback is automatic: `scripts/whoami`, `scripts/my-work`, `scripts/claim` all run the same compare-and-cache check on invocation, so the bot still picks up role changes — just at the next action rather than the next prompt.

## Troubleshooting

### Server is down at boot
`whoami.{sh,ps1}` exits non-zero with `server unreachable; cannot resolve role`. The bot has no fallback — file-scan was the failure mode we left behind in HV-129. Wait for the server to come back, then retry `scripts/whoami`.

### "no project registered for repo"
The `(repo_full_name)` you sent doesn't match any row in the platform's `projects` table. The operator needs to register the project via Add-a-Project before adding bots.

### Heartbeat process kept running after the terminal closed
Rare. Use the OS task manager to kill it manually. The server's 15-minute sweep-on-request reclaim will pick up the dead seat as soon as anyone queries the colony.

### Dead seat won't go away
A bot whose heartbeat stopped >15 minutes ago is reclaimed by the sweep — but only when someone calls `/whoami`, `/colony`, `/join`, or `/leave` for that colony. The kanban "See Bot Team" button triggers `/colony`, so opening it forces a sweep. If a dead seat persists after that, file a ticket — it's a bug.

### Multiple projects per repo
The `projects.githubRepo` column doesn't enforce uniqueness alone (it's unique with `installId`). Today the `/join` endpoint picks the first matching project; if you have multiple installations of the same repo and want to disambiguate, that's a follow-up ticket.
