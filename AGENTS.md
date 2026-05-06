# Bot Hive — way of working

Canonical project rules for **any agent** (AI or human) working on bot-hive. Agent-neutral by design: Claude Code reads this via the `CLAUDE.md` pointer; Codex/Cursor/Aider/Gemini and any future agent should read this directly. Format-neutral guidance for the hive workflow itself lives in `hive/HIVE.md`.

Per-machine local-dev state (in-progress setup notes) lives in `tasks/local-dev-state.md` — never in this file.

---

## Identity (read first)

Every agent session has a unique handle. **Two sessions on the same machine get different handles** — identity is per-session, not per-machine.

### On session start

1. **Auto-pick a handle from the curated list** (random selection):

   ```
   buzz, scout, forager, drone, comb, pollen, nectar, waggle,
   sparrow, finch, robin, wren, fox, otter, badger, mole,
   squirrel, hare, sentinel, pilot, ranger, watcher, kestrel,
   falcon, tern, jay
   ```

2. **Check for collisions** with handles already in active use:
   - Scan recent commit trailers: `git log --grep "Bot: " -n 50` — extract the `Bot: <handle>` values.
   - Scan in-progress tickets: read every `hive/in-progress/*.md` and extract the `Assigned to:` field's handle.
   - If your random pick appears in either set, **re-pick**. Repeat up to 10 times.
   - If 10 rolls all collide (extremely unlikely), append a numeric suffix: `scout-2`.

3. **Hold the handle in memory** for the session. **Do not** persist it to `git config` or any file. Each session is a fresh roll.

4. **Announce** "I'm `<handle>`" to the user so they can tell sessions apart.

### Override

If `BOT_HIVE_HANDLE` environment variable is set (e.g., `BOT_HIVE_HANDLE=billy`), use that value verbatim — skip the random pick and the collision check. Lets the human lock a session to a specific name.

### Where the handle appears

- `Assigned to:` ticket field (e.g., `Assigned to: nectar (claude-opus-4-7)`).
- `Bot:` commit trailer (alongside `Model:` and `Trigger:`).
- `hive/events.log` entries.
- Live board UI as a colored badge on each ticket card (color is deterministic via `robotColor(handle)`).

### Existing `git config bot-hive.handle` values

Handles set under the prior convention (`git config bot-hive.handle <name>`) are **deprecated but harmless**. Agents should ignore them. Run `git config --unset bot-hive.handle` to clean up if desired — not required.

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

When the GitHub merge queue is enabled (HV-080 — see `docs/DEPLOY.md` "Step 9"), source PRs are batched: multiple auto-mergeable PRs share a single CI run on a combined branch, then merge atomically. With 5 PRs in flight, total wall time stays ~3 min instead of growing to ~15 min. Coordination-metadata-only PRs (hive/, docs/, tasks/, AGENTS.md, etc.) skip CI entirely (HV-079) and land in seconds regardless.

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
4. Resolve agent-id (from `git config bot-hive.agent-id` or `<email>@<hostname>` per HV-074). Auto-pick a handle for this session (per the Identity section above). Announce both: "I'm `<handle>` (agent: `<agent-id>`)".
5. Subscribe to the real-time signal stream for the project named in `focus.md` (see "Real-time channel" below). Replay the last ~100 signals as context.
6. Run `./scripts/my-work.sh` — any tickets returned are your **active_set**: tickets you currently own across `in-progress/` and `in-review/` and must monitor for the rest of the session.

### When the human says "do FS-X" or "work on HV-X"

The agent they're chatting with **also writes that to `hive/focus.md`** so the other agents pick up the same intent on their next session start. The chat message is a hint; `focus.md` is the source of truth across agents.

### Picking what to claim

DAG-walk with cohesion preference:

1. Read `focus.md`.
2. Collect tickets in scope (named FS, named ticket, or all of `backlog/`).
3. **Filter** by these rules — a candidate is *only* eligible if all hold:
   - Currently in `backlog/` (not in-progress, in-review, blocked, or anywhere else).
   - Every `Blocked by:` reference resolves to a ticket currently in **`done/`**. A blocker in `in-review/` still counts as blocking — the human hasn't approved it yet, so the dependent ticket stays unsafe to start. A blocker in `in-progress/` likewise blocks.
   - No `claim` signal for this ticket from another agent in the last 10 minutes of the SSE buffer (the live lock).
4. From the eligible leaves, pick the one that **unblocks the most downstream tickets**. Tie-break: lowest ticket ID.
5. **Publish a `claim` signal** for it (`./scripts/signal.sh --type=claim --refs=<id>`) — that's the lock. Don't open a PR yet.

**Claim collision resolution:** if two agents claim the same ticket within ~2 seconds (rare), both signals reach the SSE buffer. The agent whose signal has the *earlier* timestamp wins; the loser sees the conflicting claim arrive on its own SSE subscription and re-picks the next eligible leaf. (Pre-HV-085 the lock was the git push; with HV-085's claim-signal-first convention, the lock fires before any push, which is what makes parallel agents safe.)

### One PR per ticket — claim signal first, then work

A ticket lifecycle is **one PR**: backlog → (in-review or done) in a single commit. The board shows the in-progress state visually within ~200ms of the bot's `claim` signal (HV-082's optimistic column placement), so a separate claim PR is unnecessary — and counterproductive, because each extra PR advances main and bumps every other open PR to BEHIND.

The flow:

1. **Pick a ticket** via DAG-walk (per the section above).
2. **Publish a `claim` signal** before any local edits — the live board immediately shows the card in In-Progress with a "claimed by `<handle>` (pending sync)" banner. Use the helper:
   ```bash
   ./scripts/signal.sh --type=claim --refs=HV-XXX
   ```
3. **Do the work locally.** Edit files, write tests, etc.
4. **Open one PR** that moves the ticket file and ships the work. Destination depends on the ticket's `User-facing` tag:
   - **`User-facing: yes`** → `backlog/` → `in-review/`. The ticket waits for the human's accept/reject (HV-046 flow). Examples: any UI affordance, animation, badge, page, button.
   - **`User-facing: no`** → `backlog/` → `done/` directly. Skip in-review entirely; the bot's own typecheck/lint/test/build verification IS the verification, with `Verification:` field set accordingly. Examples: backend APIs, CI workflows, conventions, scripts, doc edits.

   Don't route `User-facing: no` work into `in-review/` — it has no human reviewer waiting and just clutters the queue. If a ticket's `User-facing` is mistagged, fix the tag in the same PR.
5. **Optionally publish a `done` signal** after pushing the PR (`./scripts/signal.sh --type=done --refs=HV-XXX`) — visually flips the card to its destination column without waiting for the PR to merge + Render to redeploy. Optional because the PR-merge SSE refresh handles the same transition; the signal is just faster.

**For `User-facing: yes` work only**, the ticket joins your **active_set** (see "Active set — the tickets you're monitoring" below). Your existing SSE subscription handles the rest.

The earlier 2-PR pattern (claim PR moves backlog → in-progress, then work PR moves in-progress → in-review) is **deprecated** as of HV-085. It existed because the board read state from main only; HV-082 made that obsolete. Tickets currently in flight on the old flow can finish; new claims use the single-PR flow.

**Don't split "do the work" and "move the ticket" into two separate PRs** — they can race each other, both merge, and end up with the ticket file duplicated across two folders (no merge conflict surfaces because the diffs don't overlap line-wise). The board then renders the same ticket twice, in two different states.

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

- **Another agent's `claim` for a ticket you were about to claim** → pick a different leaf (DAG-walk). If the colliding claim arrived within ~2 seconds of yours, the timestamp-loser is the one re-picking.
- **`blocked` from another agent** → if you can clear it, do so (or reply with a `note` that you're on it).
- **`question`** → answer if you can, in <30s. Otherwise ignore.
- **`done` for a parent of a ticket you were waiting on** → that's your handoff; claim the unblocked leaf. Remember: the parent must reach `done/` before this fires — `done` signal from another agent means they shipped to in-review, not approved.
- **`accepted` for a ticket in your active_set** → human approved it. Remove from active_set; stop monitoring.
- **`rejected` for a ticket in your active_set** → human rejected it. Re-claim the ticket (per HV-052), address the rejection reason in `Rejection reason:`, ship a new work PR. The rejected ticket is now back in your queue at the top.
- **`note` / `handoff`** → read for context; act if relevant.

### Active set — the tickets you're monitoring

After session-start `my-work.sh` returns the tickets you own across `in-progress/` and `in-review/`, those become your **active_set** — the tickets you're listening for human accept/reject signals on. The set is maintained passively as part of your existing SSE subscription:

- **Adding** to active_set: when you ship a work PR (in-progress → in-review), the ticket joins active_set.
- **Removing** from active_set: an `accepted` signal for that ticket (or the ticket reaching `done/` via the SSE refresh) — that's your "stop monitoring" cue.
- **Re-engaging**: a `rejected` signal pulls the ticket back into your active work queue; address it before picking a new leaf.

The set survives across sessions because tickets are tagged `Assigned to: <your-agent-id>`. A new session reconstructs active_set the same way: `my-work.sh`. There's no persistent state to keep — the ticket files are the state.

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

### Owning doc updates when you add an infra dependency

When your work adds a new infrastructure requirement — env var, GitHub App permission, secret, package, port, OAuth scope, anything an operator needs to set up — you also own the corresponding doc update.

Concretely:

- New env var → update `.env.example`, `render.yaml`, and `docs/DEPLOY.md`'s env-var checklist.
- New GitHub App permission → update `docs/DEPLOY.md` Step 2 to include the permission, and note that adding a permission to an existing App requires re-approving the install on github.com.
- New required package or version bump → update `README.md` prerequisites.
- New external API or scope → update the secrets list in `docs/DEPLOY.md`.

The fix lands in the **same PR** as the code change when feasible. If the doc update is large enough to warrant its own PR (rare), the author files an immediate follow-up ticket assigned to themselves and ships it within the same session.

**Doc drift is real cost.** The next operator hitting an undocumented dependency pays minutes-to-hours of debugging that the original author could have prevented with a 30-second edit. The convention exists to make skipping it explicit and uncomfortable.

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
