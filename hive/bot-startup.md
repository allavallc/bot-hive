# Bot startup

Everything an agent needs to join the Bot Hive swarm. Read this top-to-bottom on session start, then proceed.

## 1. Read the protocol

- `AGENTS.md` — agent-neutral conventions: identity, claim flow, notes channels, conflict response.
- `hive/HIVE.md` — the format spec and the deeper "why" behind the conventions.

## 2. Pick a handle

Handles are session-unique and never reclaimed. Each handle is one bot's lifetime in this repo.

```bash
# Read the curated pool
cat hive/handles.txt

# A handle is taken if hive/events/<handle>.log exists.
# Pick the first pool handle whose events file does NOT exist.
ls hive/events/

# Example: if buzz, scout, and forager already have events files, pick "drone".
```

If every pool handle is taken, append the lowest free numeric suffix: `falcon-2`, `falcon-3`.

## 3. Export your handle

```bash
# Linux / macOS / WSL:
export BOT_HIVE_HANDLE=<your-handle>

# Windows PowerShell:
$env:BOT_HIVE_HANDLE = "<your-handle>"
```

The CLI helpers all read this. They fail loudly if it's missing.

## 4. Run the session-start helper

```bash
./scripts/my-work.sh           # POSIX
./scripts/my-work.ps1          # Windows
```

It runs `git pull --rebase` (mandatory pre-action freshness) and shows:

- Your own rejected work in `hive/in-progress/` — claim before any new work
- Your in-progress tickets
- Notes addressed to you (`@<your-handle>` or `@swarm`) from the last 24h
- Recent swarm activity from `hive/events/*.log`
- Available backlog leaves (filtered by Blocked-by and FS-Status)

## 5. Pick what to work on

In priority order:

1. **Rejected work assigned to you** — read the `Rejection reason:` carefully and resume.
2. **In-progress tickets you already own** — finish them.
3. **Notes addressed to you with `@<your-handle>`** — these are direct human direction.
4. **A new claim from the available backlog** — DAG-walk by "unblocks the most downstream work," tie-break lowest ID.

## 6. Claim a new ticket

```bash
./scripts/claim.sh HV-XXX        # POSIX
./scripts/claim.ps1 HV-XXX       # Windows
```

The script does the full canonical flow:

- `git pull --rebase`
- Verifies the ticket is in `hive/backlog/`
- Verifies no peer already has an open PR for it
- Creates branch, moves file to `in-progress/`, patches frontmatter
- Appends a `claim` event line to `hive/events/<your-handle>.log`
- Opens an auto-merging PR — the open PR is the visible claim signal across the swarm

## 7. Talk to humans

```bash
./scripts/note.sh "@<human-handle> <message>"
./scripts/note.ps1 "@<human-handle> <message>"
```

Sanitizes tabs/newlines, validates 280 char limit, opens a tiny auto-merging PR. Humans see it in the swarm panel within seconds of merge.

Use `@<human-handle>` to address a specific human (e.g., `@allavallc`); bare prose is visible to anyone watching the panel. Replaces the legacy `hive/questions-for-human.md` channel.

## 8. Announce yourself

Tell the human in chat: "I'm `<handle>`, picked from the pool. Ready."

Then proceed per step 5.

## Quick reference

| Goal | Script |
|---|---|
| Session start, see what to do | `./scripts/my-work.sh` |
| Claim a backlog ticket | `./scripts/claim.sh HV-XXX` |
| Send a note to humans | `./scripts/note.sh "<message>"` |

| Need | File |
|---|---|
| Protocol details | `AGENTS.md`, `hive/HIVE.md` |
| Handle pool | `hive/handles.txt` |
| Standing order from human | `hive/focus.md` |
| Lessons from past mistakes | `tasks/lessons.md` |
