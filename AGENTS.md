# Bot Hive — way of working

Canonical project rules for **any agent** (AI or human) working on bot-hive. Agent-neutral by design: Claude Code reads this via the `CLAUDE.md` pointer; Codex/Cursor/Aider/Gemini and any future agent should read this directly. Format-neutral guidance for the hive workflow itself lives in `hive/HIVE.md`.

Per-machine local-dev state (in-progress setup notes) lives in `tasks/local-dev-state.md` — never in this file.

---

## Identity (read first)

Every agent has **two identities**: a durable **agent-id** that owns tickets across sessions, and an ephemeral **session handle** that distinguishes concurrent sessions of the same agent in chat / presence / live UI.

| | Agent-id | Session handle |
|---|---|---|
| Stable across sessions | ✓ | — fresh per session |
| Tickets bind to it | ✓ (`Assigned to:`) | — |
| Visible in chat / swarm panel | — | ✓ |
| Visible in `presence.log` | ✓ (with handle) | ✓ (with agent-id) |
| Visible in commit trailers | — | ✓ (`Bot:`) |

### Agent-id (durable)

**On session start, resolve in this order:**

1. `git config bot-hive.agent-id` — preferred. One-time per clone. Lives in `.git/config`, where devs already look for repo-local settings.
2. **Default-derive**: `${git config user.email}@${HOSTNAME}` if no explicit setting. Most users (one agent per laptop) get this for free, no setup.

The agent-id is what `Assigned to:` binds to. It survives session crashes, agent restarts, and handle rotation.

**Two concurrent agents on the same laptop?** Clone the repo twice; set `git config bot-hive.agent-id` differently in each clone:

```bash
cd ~/work/bot-hive-cc1
git config bot-hive.agent-id allavallc-cc1

cd ~/work/bot-hive-cc2
git config bot-hive.agent-id allavallc-cc2
```

Each Claude Code / Codex / Aider / etc. instance opens its own clone. Identity is stable, no env vars, no runtime magic — the filesystem (separate working directories) provides the natural separation.

### Session handle (ephemeral)

**On session start (after agent-id is resolved):**

1. **Auto-pick a handle from the curated list** (random selection):

   ```
   buzz, scout, forager, drone, comb, pollen, nectar, waggle,
   sparrow, finch, robin, wren, fox, otter, badger, mole,
   squirrel, hare, sentinel, pilot, ranger, watcher, kestrel,
   falcon, tern, jay
   ```

2. **Check for collisions** with handles already in active use:
   - Scan recent commit trailers: `git log --grep "Bot: " -n 50` — extract the `Bot: <handle>` values.
   - Scan presence.log for currently-online handles.
   - If your random pick appears in either set, **re-pick**. Repeat up to 10 times.
   - If 10 rolls all collide (extremely unlikely), append a numeric suffix: `scout-2`.

3. **Hold the handle in memory** for the session. Each session is a fresh roll. The handle never appears in `Assigned to:` ticket fields.

4. **Announce** "I'm `<handle>` (agent: `<agent-id>`)" to the user so they can tell sessions apart.

### Resume your previous work

After resolving agent-id and picking a handle, find any tickets owned by your agent-id in `hive/in-progress/` and `hive/in-review/`:

```bash
grep -l "^- \*\*Assigned to\*\*: <your-agent-id>" hive/in-progress/*.md hive/in-review/*.md 2>/dev/null
```

Surface the list to the human as "resuming: HV-X (in-progress), HV-Y (in-review)." This closes the gap where a session that crashes or restarts loses track of its own work.

### Where each appears

| | Agent-id | Session handle |
|---|---|---|
| `Assigned to:` ticket field | `allavallc-cc2 (claude-opus-4-7)` | — never |
| `presence.log` | `... <agent-id>:<handle> online ...` | `... <agent-id>:<handle> online ...` |
| `Bot:` commit trailer | — | `Bot: nectar` |
| Live board UI | — | session colors via `robotColor(handle)` |

### Existing handle-based assignments

Tickets already tagged with a bare handle (e.g., `Assigned to: tern`) from before this convention will get reclaimed by the existing 2h stale-claim cron (HV-066). No data migration step. As tickets cycle through, they pick up the agent-id format naturally.

The earlier `BOT_HIVE_HANDLE` env var override was deprecated as part of the same simplification — agents that locked their handle previously now lock their agent-id via `git config` instead.

Full convention discussion: see `hive/HIVE.md` "Bot identity" section.

---

## Where work goes — all commits via PR + auto-merge

Branch protection on `main` rejects direct pushes for any change. Every commit — source code, `hive/` ticket moves, doc edits, anything — flows through a PR gated by the `ci` status check.

The unified flow:

```bash
git checkout -b hv-XXX-<slug>
# ... edit files ...
git commit -am "..."
git push -u origin hv-XXX-<slug>
gh pr create --title "..." --body "..."
gh pr merge --auto --squash --delete-branch
```

`--auto` queues the merge and fires it the moment CI goes green. No manual step. Total ceremony per change: ~2-3 min of wall time (CI run), ~5s of agent interaction.

### Conceptually: still two lanes

The mental split between coordination metadata and source code is still useful — it determines what the change is *about*, even though both flow through PRs:

| Kind of work | Files | What CI does |
|---|---|---|
| Coordination metadata | `hive/`, this `AGENTS.md`, `README.md`, `docs/`, agent-shim files like `CLAUDE.md` | Runs the full suite, passes trivially (~2 min) since no source changed. |
| Source code | `src/`, `tests/`, `migrations/`, configs, `package.json`, `.github/` | Substantive gate — typecheck/lint/test/build all must pass. |

If CI minutes ever become a concern, we can `paths-ignore` filter the workflow to skip hive-only PRs. Not worth the complexity today.

### Setup details

See `docs/BRANCH_PROTECTION.md` for the exact GitHub settings, the `gh api` automation script, and the verification checklist.

---

## Working in parallel — the swarm protocol

Multiple agents (and humans) work this repo at once. Coordination is **not** centralized — there's no coordinator service. Each agent reads the shared environment (the git tree) and follows local rules. Coordination emerges.

### On every session start

1. `git pull` (subscribe to durable state).
2. Read `hive/focus.md` — that's the standing order. (Empty / missing = "anything in backlog.")
3. Tail the last ~50 lines of `hive/events.log` to see what other agents have done recently.
4. Auto-pick a handle (per the Identity section above). Announce it.
5. Subscribe to the real-time signal stream for the project named in `focus.md` (see "Real-time channel" below). Replay the last ~100 signals as context.

### When the human says "do FS-X" or "work on HV-X"

The agent they're chatting with **also writes that to `hive/focus.md`** so the other agents pick up the same intent on their next session start. The chat message is a hint; `focus.md` is the source of truth across agents.

### Picking what to claim

DAG-walk with cohesion preference:

1. Read `focus.md`.
2. Collect tickets in scope (named FS, named ticket, or all of `backlog/`).
3. Filter out: in-progress, blocked, anything with unfinished `Blocked by:`.
4. From the available leaves, pick the one that **unblocks the most downstream tickets**. Tie-break: lowest ticket ID.
5. Claim it.

This is deterministic enough that two agents usually pick different leaves. If they collide, the git push lock breaks the tie — loser pulls and re-runs.

### One PR per ticket lifecycle transition

The PR that ships the work also performs the ticket-folder move (e.g., `in-progress` → `in-review`). **Don't split "do the work" and "move the ticket" into two separate PRs** — they can race each other, both merge, and end up with the ticket file duplicated across two folders (no merge conflict surfaces because the diffs don't overlap line-wise). The board then renders the same ticket twice, in two different states.

Concretely:

- The PR that lands `src/` changes also moves the ticket from `in-progress/` to `in-review/` in the same commit.
- The PR that ships a doc-only ticket also moves that ticket file in the same commit.
- The optional **claim-PR** (move from `backlog/` to `in-progress/` before any work) is the one allowed exception — it lands first, is small, and is closed cleanly before the work-PR opens. The work-PR is then based on a main where the ticket is already in `in-progress/`.

If you find yourself writing two PRs whose net effect could equally be one PR — collapse them. Race conditions are the failure mode.

### Two channels — durable + real-time

Bot Hive has **two coordination channels**, both project-scoped:

| Channel | What it carries | When you write | When you read |
|---|---|---|---|
| **`hive/events.log`** (durable) | State transitions: claim, in-review, done, accepted, rejected, blocked, reclaim | Every meaningful ticket-state change | Tail on session start to catch up |
| **Real-time signal stream** (ephemeral, ~1 hour TTL) | Live intent + coordination: "I'm starting X", "blocked on Y", "done — Z unblocked", "anyone free for W?" | Anytime during work | Subscribe on session start; act on incoming signals |

Both channels are project-scoped. Both are visible to humans on the live board.

**events.log** is the swarm's memory. **Real-time channel** is its conversation. Don't duplicate signals across the two — durable goes to events.log, ephemeral goes to the channel.

### Real-time channel — what to publish

API: `POST /api/projects/[id]/signals` with `{ type, message, bot, refs? }`. Subscribe via SSE at `GET /api/projects/[id]/signals/stream`.

Signal types and when to use them:

- **`claim`** — when picking up a ticket. Once per ticket. Include the ticket ID in `refs`. Lets other bots see "nectar is on HV-XXX" before they consider claiming it.
- **`done`** — when finishing the work that satisfies a ticket. Once per ticket. Pair with the events.log `done` entry.
- **`blocked`** — when stuck on something another bot might be able to clear (network, env, CI flake, conflict). Don't use for design / spec questions — those go to `hive/questions-for-human.md`.
- **`question`** — quick question to anyone listening. Don't expect an answer; if no one helps in ~5 min, fall back to `hive/questions-for-human.md`.
- **`note`** — anything else worth surfacing. Use sparingly. Status updates, mid-work insight, not internal monologue.
- **`handoff`** — explicit "I just finished X, Y is now unblocked, anyone want it?" — particularly useful when DAG-walk would otherwise miss the handoff timing.

**Don't publish signals for:**
- Internal thinking ("I wonder if I should refactor this") — chat to yourself in your own context, not the channel.
- Mechanical progress ("just finished the imports section") — too granular, becomes noise.
- Anything that should be in the ticket file or events.log instead — durable state goes there.

### Real-time channel — how to subscribe

On session start (after `git pull`, after reading `focus.md`, after tailing `events.log`):

1. Open SSE to `/api/projects/<projectId>/signals/stream` for the project named in `focus.md`.
2. Replay the last ~100 signals as context (the server sends them automatically on connect).
3. Keep the connection open while you work; act on incoming signals as they arrive.

What to do with incoming signals:

- **Another agent's `claim` for a ticket you were about to claim** → pick a different leaf (DAG-walk).
- **`blocked` from another agent** → if you can clear it, do so (or reply with a `note` that you're on it).
- **`question`** → answer if you can, in <30s. Otherwise ignore.
- **`done` for a parent of a ticket you were waiting on** → that's your handoff; claim the unblocked leaf.
- **`note` / `handoff`** → read for context; act if relevant.

### Bot presence — every session announces itself

The signal stream tells you what bots **did**; presence tells you who's **here right now**. Different question, separate file: `hive/presence.log` — append-only, file-based, git-synced like everything else.

**On session start** (after handle pick, after `focus.md` read, after tailing `events.log`): append one line:

```
<ISO timestamp> <handle> online model=<model-id> focus=<focus-id-or-empty>
```

Example: `2026-05-06T03:30:00Z nectar online model=claude-opus-4-7 focus=feature-set-007-parallel-bot-coordination`

**On focus change mid-session**: append another line with `focus=<new-focus>`.

**On session end** (rarely possible — most sessions just stop): append `<ISO> <handle> offline`. Optional.

**Push timing**: the presence line piggybacks on the next commit you make (your first claim PR, doc edit, etc.). If you've been online >5 minutes without any other commit, push a tiny presence-only PR.

**Read it on session start**: filter to entries from the last 1 hour to see who else is online. Stale entries (>24h) may be deleted FIFO by any agent during their session-start procedure to keep the file small.

Why a separate file rather than `events.log`: events.log is the durable lifecycle log (claim, in-review, done). Presence is ephemeral chatter — different contract, different file. Why not the SSE signal stream: bots don't have web-app session auth today (they push via git, not HTTP); when project-scoped bot tokens land, presence will *also* publish on the SSE channel for sub-second visibility.

### Hot-file conflict avoidance — check open PRs before editing canonical docs

A "hot file" is one that multiple parallel agents edit, where parallel PRs reliably go DIRTY at merge time. The fix is a pre-edit check: before opening a PR that touches a hot file, scan the open PR queue for any PR already touching that file, and rebase / wait / pick different work instead of opening a competing edit.

**Hot files in this repo:**

- `AGENTS.md`
- `hive/HIVE.md`
- `hive/events.log`
- `hive/focus.md`
- `hive/presence.log`
- `tasks/lessons.md`
- `render.yaml`
- `package.json`
- `drizzle/migrations/*.sql`

**Pre-edit check** — run this before staging your edits to a hot file:

```bash
./scripts/check-hot-files.sh AGENTS.md hive/HIVE.md
```

The script prints any open PR that already touches the file(s) and exits non-zero if a conflict exists. Equivalent PowerShell: `.\scripts\check-hot-files.ps1`.

**If a conflict is reported:**
1. **Best**: rebase your branch onto the existing PR's branch (`git fetch origin <theirs>`, `git rebase origin/<theirs>`) and add your changes; the second PR replaces the first as the canonical edit.
2. **Acceptable**: wait for the existing PR to merge, then base off updated main.
3. **Last resort**: pick different work and come back when the lock clears.

**If no conflict**: proceed normally.

This is the swarm's pre-flight check, not a hard lock. github's PR queue is the source of truth — the script is just a convenience wrapper. Once bot HTTP auth lands (separate ticket), this convention can absorb sub-second locking via the SSE channel without changing the agent-side rule.

### Stale-PR watchdog — active agents update BEHIND PRs

A long-running session can leave its open PR `BEHIND` (main moved after the PR opened) or `DIRTY` (real conflict). Active agents are stewards of *all* open PRs, not just their own.

**On session start (after the rest of this checklist) and every ~10 minutes while you work:**

```bash
gh pr list --json number,mergeStateStatus,isDraft \
  | jq -r '.[] | select(.isDraft == false) | select(.mergeStateStatus == "BEHIND") | .number'
```

For every PR number returned, run:

```bash
gh pr update-branch <number>
```

GitHub merges current main into the PR's branch. CI re-runs. Auto-merge fires if the result is clean.

**For `DIRTY` PRs (real conflicts), don't touch them.** Conflicts mean someone needs to resolve manually; surface to the human via `hive/questions-for-human.md` rather than guessing a merge.

This is not a chore — it's the swarm tending its own garden. The cost is ~5 seconds; the savings is hours of idle-PR rot when an agent's session ends but its PR stays open.

A convenience helper exists: `scripts/update-stale-prs.sh` (or `.ps1`). HV-051 adds a server-side cron that does the same thing every 10 min as a backstop.

### Pre-action pull — never operate on stale state

A session that started an hour ago has a clone that's an hour out of date. Other agents (and humans) may have pushed conventions, claimed tickets, merged PRs in the meantime. Acting on stale state causes ID collisions, missed convention updates, and edits to files that have moved.

**Rule:** every meaningful action — claiming a ticket, opening a PR, pushing a branch, editing the canonical docs — is preceded by `git pull --rebase` against `origin/main`.

Cheapest correct version of this is a **pre-commit pull**: before any `git commit` that's about to be pushed, run `git pull --rebase` first. If main has advanced, you rebase locally; if the rebase is clean (no conflict markers), continue and push. If the rebase conflicts, fall back to the conflict-response policy below — never guess merges.

In practice:

```bash
# Before claiming a ticket or pushing any branch
git fetch
git pull --rebase   # safe; aborts cleanly if there's nothing to do

# Then your normal flow
git commit -am "..."
git push -u origin <branch>
```

This is the swarm-aligned default: cheap, no daemon, no real-time bus, no new files. Each commit is one extra round-trip to `origin` — negligible at our scale, and it's the exact same primitive (`git pull`) that already does the subscribe step on session start.

Other options were considered and rejected:

- **Heartbeat file** that bumps a timestamp on every push — adds a file, only signals via commits, no advantage over pre-commit pull.
- **Push notification (webhook → bot bus)** — requires real-time infrastructure that the swarm protocol explicitly rejects.
- **Polled `git fetch` daemon** — drifts from "files-and-git only," adds a timer, no obvious win.

The pre-commit pull is the durable choice; the others can come later if scale demands it.

### Publishing events

After every meaningful state transition (claim, in-review, accepted, rejected, blocked, reclaim), append a one-line entry to `hive/events.log`:

```
2026-05-05T15:42:00Z HV-031 done HV-032,HV-033 unblocked nectar
```

Format: `<ISO timestamp> <ticket-id> <action> [<unblocked-list>] <handle>`. The unblocked-list is comma-separated ticket IDs that just became available. Other agents tail this on session start to catch handoffs without re-walking the DAG.

### Stale claims

Every commit an agent makes against an in-progress ticket also updates the ticket's `**Last touched:**` field with the current ISO timestamp. If an agent looks at an in-progress ticket and `Last touched:` is older than **2 hours**, the ticket is stale — that agent may reclaim it (move back to `backlog/` with a `Reclaim reason:`) or take it over (update `Assigned to:`, refresh `Last touched:`). Append the reclaim to `events.log`.

A scheduled job (`.github/workflows/reclaim-stale-claims.yml`) runs every 30 minutes as a backstop: it scans `hive/in-progress/`, finds anything stale, and opens an auto-merging PR returning them to `backlog/`. Active agents may still reclaim manually on session start — the cron is the safety net for when no agents are around. Run `./scripts/reclaim-stale-claims.sh` (no flag, dry-run) to preview what the cron would do.

### Per-FS architecture & decisions log

Each `hive/feature-sets/feature-set-NNN-<slug>.md` carries an **`## Architecture & decisions`** section that bots and humans append to as design choices accumulate. It's the swarm's institutional memory for that feature set — captures the *why*, not just the *what*. Future agents working in that FS read it on session start and don't re-litigate settled questions.

**Entry format** (compact ADR-style; ~10 lines per decision):

```markdown
### YYYY-MM-DD — <one-line headline> (<bot-handle>)

**Choice:** <what we picked>

**Rejected:** <what we considered and why we didn't pick it>

**Why:** <substrate-portable rationale>

**Implications:** <what now changes in the code or convention>

**Reference:** <HV-XXX / PR #N>
```

**Append** an entry whenever you make a non-trivial design choice in an FS. "Non-trivial" = anything you'd debate in a senior code review; pure mechanical edits don't qualify.

**Read** the relevant FS's section on session start, **after** `focus.md` and `events.log`. If `focus.md` names an FS, that FS's decisions are mandatory pre-reading.

**Append-only** by convention. Never edit or delete past decisions — that's audit honesty. If two bots append simultaneously and conflict, both entries land (auto-rebase orders them by timestamp).

### UI changes need explicit visual approval before build

A ticket spec describes *what* a feature does; it does not describe *where it sits on the page* or *how it lays out alongside everything else*. **Approving a ticket is not approving a layout choice.** For any change a human will visually see, the agent must propose placement *before* writing implementation code, and wait for explicit approval — even if the ticket itself is already accepted.

**Concretely**, before claiming a user-facing UI ticket:

1. Read the ticket. Identify which surfaces it touches (board page, dashboard, masthead, modal, etc.).
2. Read the existing layout for those surfaces (what's already there, where, taking what space).
3. Post a short layout proposal in chat: text description + ASCII / Mermaid sketch where helpful. Examples that earn approval:
   - "Add a 32px-tall pill in the top-right of the masthead, between the live-state badge and the user avatar."
   - "Add a new collapsed left rail (40px) below the masthead; toggles to a 320px panel."
4. **Wait for explicit approval.** "Yes" / "go" / "looks right" — anything explicit. Silence or reading the ticket back to the user is not approval.
5. Only after approval: claim the ticket and start implementation.

If the surface is already crowded (right rail occupied by a modal, top of the board owned by another panel), call that out in the proposal — the user can't approve a layout if they don't know what's already there.

This is the UI-specific subcase of the broader pre-build interview rule. Skipping it lands UI that has to be ripped out (HV-020, HV-048 — see `tasks/lessons.md` L9).

### Human rejection and acceptance via the board

Rejections and acceptances happen on the live board — no manual file editing required.

- **Accept**: open an `in-review` card, click **Accept**. The board commits the move to `done/` on the human's behalf via a PR with auto-merge.
- **Reject**: open an `in-review` card, click **Reject**, type a reason, click Confirm. The board commits the move back to `in-progress/` with `Rejected by`, `Rejected`, and `Rejection reason` fields populated.

Commits created by this flow use `Rejected-by: <github-username>` (no `Bot:` trailer — the actor is the human, not an agent).

**Bot-side reaction to rejection**: a bot picking up a rejected ticket (status: in-progress, `Rejected by` populated) should:

1. Read the `Rejection reason` carefully — it is the spec for the next iteration.
2. Append to `events.log`: `<ISO> <hv-id> reclaimed-after-rejection <handle>`.
3. Treat it as a normal in-progress ticket from there.

### Reporting status — don't recite the done list

Status updates focus on **open**, **in-progress**, or **in-flight** work — that's what the user can act on. Once a ticket is accepted/done, mention it once at acceptance and then stop re-listing it. The done list grows long; recasting it every status update is noise, not signal.

If the user asks "what did we ship?" or "show me the done list," then surface it. Otherwise, status reports look forward.

### When you need to ask the human

Append to `hive/questions-for-human.md` rather than blocking on chat. Format: dated heading + question. The human reads on their cadence.

### Conflict response

| Failure | Action |
|---|---|
| Push to main rejected (non-fast-forward) | `git pull --rebase`, retry. |
| Branch rebase against main produces no conflict markers | `git push --force-with-lease`, let CI re-run. |
| Branch rebase produces real conflict markers | **Stop. Don't guess.** Move ticket to `blocked/`, `Failure mode: merge-conflict`, comment PR, append to `events.log`, surface to human. |
| CI fails on PR | Read CI output, attempt fix, push fix, wait. **Two attempts max.** Then `blocked/` with `Failure mode: failed-tests`. |
| Stale claim (`Last touched:` > 2h) | Reclaim per the rule above. |
| ID collision (two agents picked same `HV-N`) | Loser-by-push-time renumbers. The one whose work is shipped or further-along keeps the ID. |
| **Doc collision** (two agents edited same coordination doc) | Reconcile by structural correctness — keep the file's documented heading hierarchy and conventions; merge useful content from the conflicting edit into the appropriate place. Never silently lose work. |

The hard rule across all failures: **agents auto-resolve trivial git mechanics, but escalate substantive conflicts to humans.** Agents NEVER attempt to merge or guess code resolution.

### Always pull before claiming or committing to main

Stale local main = guaranteed push conflict + collision risk. The `git pull` is the subscribe step in our pub/sub model — it's how you find out what other agents have done.

---

## Local dev

- Postgres 16+ native on port 5432 (no Docker).
- `npm run dev` starts the Next.js dev server.
- `npm run typecheck && npm run lint && npm run test` before any PR.
- Migrations: `npm run db:migrate` against local DB.
- See `README.md` for full setup.
- Per-machine in-progress setup state lives in `tasks/local-dev-state.md`.

---

## Testing rules

- **DB-backed tests use the transactional fixture.** Import `test` from `@/lib/test-db` instead of vitest directly. Each test gets a `tx` parameter — a Drizzle transaction that auto-rolls back on test end. No data ever commits, no `afterEach` cleanup needed, no parallelism collisions.
- **No `Date.now()` in test data.** Use stable, explicit IDs. The transactional isolation makes collision impossible by construction; reaching for wall-clock or `Math.random()` to "ensure uniqueness" is a code smell.
- **`randomUUID()` is allowed for unique tokens** (test user IDs, repo names) where collision needs to be cryptographically zero — but never to compensate for missing isolation.
- **Production functions that touch the DB should accept `db: DbHandle = defaultDb`** as an optional parameter, so tests can pass `tx` and have reads see the test's uncommitted writes. See `src/lib/projects.ts` for the pattern.
- **Functions with no DB access** (pure logic, mockable IO) don't need the fixture or the DI parameter. `src/lib/access.test.ts` is the example — it `vi.mock`s `@/db` entirely.

---

## Deploy

- Prod runs on Render at `https://bot-hive-j0ax.onrender.com`. Auto-deploys from `main`.
- Staging environment is being designed in HV-035 (FS-007). Until it lands, prod is the only deploy target.
- Deploy lessons captured in `tasks/lessons.md` — read before any deploy work.

---

## Pointers

- `hive/HIVE.md` — the format spec. Read this if you're touching the hive workflow itself.
- `hive/focus.md` — current standing order from the human (one line).
- `hive/events.log` — append-only event log. Tail on session start.
- `hive/questions-for-human.md` — async escalation channel for blocking questions.
- `hive/feature-sets/` — current feature sets and their goals.
- `tasks/lessons.md` — self-correction log. Read at session start; append after corrections.
- `tasks/local-dev-state.md` — per-machine setup snapshots.
- `README.md` — project overview, quickstart for humans.
- `CLAUDE.md` — Claude Code-specific shim (just points here).
