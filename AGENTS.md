# Bot Hive — way of working

Canonical project rules for **any agent** (AI or human) working on bot-hive. Agent-neutral by design: Claude Code reads this via the `CLAUDE.md` pointer; Codex/Cursor/Aider/Gemini and any future agent should read this directly. Format-neutral guidance for the hive workflow itself lives in `hive/HIVE.md`.

Per-machine local-dev state (in-progress setup notes) lives in `tasks/local-dev-state.md` — never in this file.

## Kickoff (do this first)

When the operator types `start the hive` (or any equivalent — "kick off the hive", "begin a hive session", etc.) in chat, execute the procedure in [`hive/bot-startup.md`](./hive/bot-startup.md). The procedure is a branchless numbered checklist: ensure `.bot-hive-identity` exists, run `scripts/whoami.{sh,ps1}` to derive role, read the role rubric (which locks you to that role for the session), announce identity, and wait for a task.

Kickoff is the canonical entry point. Do not start work, claim tickets, or edit code before completing it.

## Worktree isolation (preferred)

When the human spawns you via the **"Add a bot"** button on the live board, your session starts in a dedicated git worktree at `worktrees/<your-handle>/` on a feature branch `<handle>-work`. Two bots in two worktrees physically can't edit the same files — coordination protocol catches the rest.

If you weren't spawned via the button (running in the main repo working dir), no harm — Bot Hive's protocol still works without worktrees. The button + worktree flow is a hardening, not a requirement.

## Bot CLI helpers (start here)

Three scripts wrap the protocol so you don't have to construct git/gh calls by hand. Use them for every claim, note, and session start:

- **`scripts/my-work.{sh,ps1}`** — session-start helper. Runs `git pull --rebase`, then surfaces: your rejected work, your in-progress tickets, notes addressed to you, recent swarm events, and available backlog filtered by FS-status and Blocked-by. Run this first every session.
- **`scripts/claim.{sh,ps1}` `<HV-id>`** — claim a backlog ticket end-to-end: pulls fresh, verifies no peer has an open PR for the ticket, creates a branch, moves the file to `in-progress/`, updates the frontmatter (Status / Assigned to / Started / Last touched), appends a `claim` event to your `hive/events/<colony>.<handle>.log`, opens an auto-merging claim PR.
- **`scripts/in-review.{sh,ps1}` `<HV-id>`** — ship a claimed ticket to in-review when work is complete. Moves the file from `in-progress/` to `in-review/`, updates Status / Completed / Last touched, appends an `in-review` event, commits, pushes to the claim branch, and **verifies the file actually landed in `in-review/` on the remote**. Use this — never do the move by hand. Manual `git mv` + commit has been silently dropped during cherry-picks; the helper makes it atomic and verified.
- **`scripts/note.{sh,ps1}` `"<message>"`** — write a note from you to humans. Sanitizes tabs/newlines, appends a TSV line to `hive/notes-to-humans/<colony>.<handle>.log`, opens an auto-merging tiny PR. Use `@<human-handle>` or `@<colony>.<bot-handle>` to address a specific actor.

All three read **`.bot-hive-identity`** at the worktree root for the bot's colony and handle:

```
colony=allavallc
handle=buzz
role=pm            # optional — forces the role, bypassing the tenure heuristic (HV-122)
```

The Add-a-Bot spawn flow writes this file as part of `git worktree add` setup. Bots running in the worktree pick up their identity automatically — no env var to set per shell. The legacy `BOT_HIVE_HANDLE` env var is supported as a transitional fallback while the migration to identity files is in flight.

The optional `role=` line accepts `pm`, `coder`, or `tester`. When set, `scripts/whoami.{sh,ps1}` honors it and skips the tenure-based assignment. Use it whenever the human's intent for role assignment shouldn't depend on which bot has the older event log.

Bot identity is `<colony>.<handle>` globally (e.g., `allavallc.buzz`). See `hive/HIVE.md` for the colony model.

---

## Identity (read first)

Every agent session has a unique handle. **Two sessions on the same machine get different handles** — identity is per-session, not per-machine.

### On session start

1. **Read the curated pool** from `hive/handles.txt` (one handle per non-comment line). The pool is data-as-file — not hardcoded prose — so adding handles is a normal PR.

2. **Find the first pool handle that does NOT have a `hive/events/<handle>.log` file.** Each per-actor events file means that handle is taken (for all time — handles are session-unique and never reclaimed). If every pool handle has an events file, append the lowest free numeric suffix to the first pool handle: `falcon-2`, `falcon-3`.

3. **Claim the handle by committing immediately.** Append a presence line to your new events file:
   ```
   echo "<ISO ts> presence <handle> online" >> hive/events/<handle>.log
   git add hive/events/<handle>.log
   git commit -m "presence: <handle> online"
   git push
   ```

4. **If the push fails (non-fast-forward), the per-actor file is the lock — you collided with a parallel claim.** Run `git pull --rebase`. If the pulled commits include a `presence <handle> online` line by a different commit author, your handle was taken by a parallel bot. Roll back your local commit (`git reset --hard origin/main`), go to step 2, pick a different handle.

5. **Announce** "I'm `<handle>`" to the user so they can tell sessions apart.

The git push race IS the lock. There is no separate registry to keep in sync, no heartbeat, no liveness check. Two bots picking the same handle simultaneously will both attempt to commit `hive/events/<handle>.log`; only one push wins.

### Override

If `.bot-hive-identity` exists in the worktree (written by the Add-a-Bot spawn flow), use the `colony=` and `handle=` values verbatim — skip the pool pick. Lets the human lock a session to a specific identity, surviving shell restarts. Legacy `BOT_HIVE_HANDLE` env var is also honored during the migration window.

### Where the handle appears

- `Assigned to:` ticket field (e.g., `Assigned to: allavallc-cc1 (claude-opus-4-7)`).
- `Bot:` commit trailer (alongside `Model:` and `Trigger:`).
- `hive/events/<your-agent-id>.log` — your own per-actor event log.
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
2. Read `.bot-hive-identity` to get your colony, then read `hive/colonies/<colony>/focus.md` — that's your colony's standing order. (Empty / missing = "anything in backlog.")
3. Read recent activity across all agents — `cat hive/events/*.log | sort | tail -50` — to see what's been happening.
4. Auto-pick a handle (per the Identity section above). Announce it.
5. Subscribe to the real-time signal stream for the project named in your colony's focus file (see "Real-time channel" below). Replay the last ~100 signals as context.
6. **Scan `hive/in-progress/` for your own rejected work.** For each ticket where `Assigned to:` matches your handle AND `Rejected by:` is populated — that's pending rework you own. Resume it before claiming any new ticket. (See "Picking what to claim" below.)
7. **Read notes addressed to you.** Scan `hive/notes-to-bots/*.log` for lines from the last 24h containing `@<your-agent-id>` or `@swarm`. Those are the human's direction — read them, surface them as priority context, factor them into ticket selection. To respond, append to your own `hive/notes-to-humans/<your-agent-id>.log` (TSV: `<ISO ts>\t<message>`). Use `@<human-handle>` to address a specific human; bare prose goes to anyone watching the panel.

### When the human says "do FS-X" or "work on HV-X"

The agent they're chatting with **also writes that to `hive/colonies/<that-human's-colony>/focus.md`** so other agents in that colony pick up the same intent on their next session start. The chat message is a hint; the colony's focus file is the source of truth within the colony.

### Picking what to claim

**0. Pre-claim ritual: pick up your own rejected work first.**

Scan `hive/in-progress/*.md`. For each ticket where the `Assigned to:` field's handle equals **your** session handle AND the `Rejected by:` field is populated:

- This is your pending rework. Read the `Rejection reason:` carefully — that's the spec for the next iteration.
- Resume work on it. Append to your event log: `<ISO> <hv-id> reclaimed-after-rejection <handle>`.
- Skip the rest of the DAG-walk. Don't claim a new ticket while you have rejected work outstanding.

Rationale: rejection is an iteration signal, not an abandonment signal. The original agent has the freshest mental model of what they shipped — picking it up themselves avoids the context-switch tax another agent would pay.

If no such tickets exist, proceed to the DAG-walk.

**Edge case — interaction with the stale-claim watchdog**: if a rejected ticket is assigned to a *different* handle and has been idle (>2h since `Last touched:`), the standard reclaim rule applies — any agent can take it. If a rejected ticket is yours **and** fresh (active session), it's your responsibility, not the swarm's.

**DAG-walk** — once your own rejected work is clear:

1. **`git pull --rebase` immediately before scanning.** Don't trust your session-start snapshot — main may have moved. Stale-clone claims are a real failure mode (a bot picked a ticket that had been routed to `not-doing/` 30 minutes earlier because they hadn't pulled).
2. Read your colony's focus file (`hive/colonies/<colony>/focus.md`).
3. Collect tickets in scope (named FS, named ticket, or all of `backlog/`).
4. Filter out:
   - Tickets in `in-progress/`, `blocked/`, `not-doing/`, `done/` (only `backlog/` is pickable)
   - Anything with unfinished `Blocked by:` (a blocker not in `done/`)
   - **Anything whose `Feature set:` points at an FS file with `Status:` other than `active`.** A `future` or `parked` FS means the human has explicitly said "not yet" — skip every ticket in that FS, regardless of how attractive the leaf looks.
   - **Anything whose `Feature set:` points at an FS file with a non-empty `Owner:` that isn't your handle.** A reserved FS belongs to a specific actor; you finish any in-progress ticket you already hold there, but you don't pick *new* tickets from a non-empty Owner FS. (When a human reassigns ownership: the new owner edits the FS file's `Owner:` line; other bots stop picking from that FS forward but finish their current task.)
5. **Filter out tickets with active soft-fence claims**. Read `GET /api/projects/[id]/events` and skip any entry with `kind: "claim-active"` — a peer just claimed it within the last 30 minutes via the platform's claim endpoint, before their canonical Git move landed.
6. From the available leaves, pick the one that **unblocks the most downstream tickets**. Tie-break: lowest ticket ID.
7. **Reserve via the soft fence first**: `POST /api/projects/[id]/tickets/<hvId>/claim` with `{ "handle": "<your-handle>" }`. The platform records a 30-min claim and broadcasts SSE so the swarm panel + other bots see it within ~1s. If the platform returns 409, a peer beat you to it — re-DAG-walk.
8. **Pull again** (`git pull --rebase`) right before the `git mv` claim, in case main moved during your scan. Then claim canonically by moving the ticket file in a real PR (or in your work-PR's first commit). The webhook clears the soft-fence claim when it sees the canonical move.

This is deterministic enough that two agents usually pick different leaves. If they collide, the git push lock breaks the tie — loser pulls and re-runs.

**Why pull twice (session-start AND before-claim AND before-mv)?** Stale local state is the single failure mode that causes "bot worked on something already retired" — every pull is cheap (one round-trip), every wasted-work session is expensive. Always-pull-before-state-change.

### One PR per ticket lifecycle transition

The PR that ships the work also performs the ticket-folder move (e.g., `in-progress` → `in-review`). **Don't split "do the work" and "move the ticket" into two separate PRs** — they can race each other, both merge, and end up with the ticket file duplicated across two folders (no merge conflict surfaces because the diffs don't overlap line-wise). The board then renders the same ticket twice, in two different states.

Concretely:

- The PR that lands `src/` changes also moves the ticket from `in-progress/` to `in-review/` in the same commit.
- The PR that ships a doc-only ticket also moves that ticket file in the same commit.
- The optional **claim-PR** (move from `backlog/` to `in-progress/` before any work) is the one allowed exception — it lands first, is small, and is closed cleanly before the work-PR opens. The work-PR is then based on a main where the ticket is already in `in-progress/`.

If you find yourself writing two PRs whose net effect could equally be one PR — collapse them. Race conditions are the failure mode.

### One coordination channel: per-actor event logs in `hive/events/`

Each actor (every bot, every cron, every human acting through the platform) writes only to **their own file** at `hive/events/<actor>.log`. The "log" the swarm panel renders is the union of all of these, sorted by timestamp.

Why per-actor files: two writers appending to a single shared file is a Git merge conflict every time their PRs land in the same window. Different files, different writers — no race possible.

Format (one event per line, identical to before):

```
<ISO timestamp>  <hv-id-or-tag>  <action>  [unblocked-list]  <actor>
```

Example — your file at `hive/events/allavallc-cc1.log`:

```
2026-05-06T19:30:00Z  HV-085  claim     allavallc-cc1
2026-05-06T19:45:00Z  HV-085  in-review allavallc-cc1
2026-05-06T19:50:00Z  presence allavallc-cc1 online
```

Append to **your file** on every meaningful event:

- **claim / in-progress / in-review / done / accepted / rejected / blocked / reclaim** — ticket lifecycle.
- **filed / not-doing** — ticket creation / retirement.
- **presence** — session-start announcement (use the literal `presence` action with no hv-id; actor is your agent-id).

Don't write to your event log for internal thinking, mechanical progress, or anything that belongs in the ticket file itself. The log is for cross-agent coordination, not chatter.

Shell append (works the same on POSIX and PowerShell):

```
mkdir -p hive/events
echo "<line>" >> hive/events/<your-agent-id>.log
```

The append rides on the same commit that ships your work (or a tiny dedicated commit if you're starting work and want claim visibility before opening the PR).

### What other agents do with your event lines

On session start, every bot reads the merged view across all agents — `cat hive/events/*.log | sort | tail -50`. While running, every bot subscribes to the project's SSE stream — when an event lands (any actor's file), the swarm panel renders it; bots can also re-tail to react.

Useful reactions:

- **Another agent's `claim` for a ticket you were about to claim** → pick a different leaf (DAG-walk).
- **`done` for a parent of a ticket you were waiting on** → that's your handoff; claim the unblocked leaf.
- **`blocked` from another agent** → if you can clear it, do so (or note it).
- **`accepted` / `rejected` for a ticket you shipped** → human approved / rejected your work; if rejected, re-claim it (HV-052 convention).

### Hot-file conflict avoidance — check open PRs before editing canonical docs

A "hot file" is one that multiple parallel agents edit, where parallel PRs reliably go DIRTY at merge time. The fix is a pre-edit check: before opening a PR that touches a hot file, scan the open PR queue for any PR already touching that file, and rebase / wait / pick different work instead of opening a competing edit.

**Hot files in this repo:**

- `AGENTS.md`
- `hive/HIVE.md`
- `hive/colonies/<your-colony>/focus.md`
- `tasks/lessons.md`
- `render.yaml`
- `package.json`
- `drizzle/migrations/*.sql`

(Note: `hive/events/<actor>.log` is **not** a hot file — each actor only writes to their own. The legacy `hive/events.log` is frozen and no longer written.)

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

**For `DIRTY` PRs (real conflicts), don't touch them.** Conflicts mean someone needs to resolve manually; surface to the human via a `@<human-handle>` note in your `hive/notes-to-humans/<your-id>.log` rather than guessing a merge.

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

After every meaningful state transition (claim, in-review, accepted, rejected, blocked, reclaim), append a one-line entry to **your own** event log at `hive/events/<your-agent-id>.log`:

```
2026-05-05T15:42:00Z HV-031 done HV-032,HV-033 unblocked allavallc-cc1
```

Format: `<ISO timestamp> <ticket-id> <action> [<unblocked-list>] <handle>`. The unblocked-list is comma-separated ticket IDs that just became available. Other agents read the merged view (`cat hive/events/*.log | sort | tail -50`) on session start to catch handoffs without re-walking the DAG.

### Stale claims

Every commit an agent makes against an in-progress ticket also updates the ticket's `**Last touched:**` field with the current ISO timestamp. If an agent looks at an in-progress ticket and `Last touched:` is older than **2 hours**, the ticket is stale — that agent may reclaim it (move back to `backlog/` with a `Reclaim reason:`) or take it over (update `Assigned to:`, refresh `Last touched:`). Append the reclaim to your event log.

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

**Read** the relevant FS's section on session start, **after** your colony's focus file and the merged event view. If the focus file names an FS, that FS's decisions are mandatory pre-reading.

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
2. Append to your event log: `<ISO> <hv-id> reclaimed-after-rejection <handle>`.
3. Treat it as a normal in-progress ticket from there.

### Reporting status — don't recite the done list

Status updates focus on **open**, **in-progress**, or **in-flight** work — that's what the user can act on. Once a ticket is accepted/done, mention it once at acceptance and then stop re-listing it. The done list grows long; recasting it every status update is noise, not signal.

If the user asks "what did we ship?" or "show me the done list," then surface it. Otherwise, status reports look forward.

### When you need to ask the human

Append a `@<human-handle>` line to your `hive/notes-to-humans/<your-id>.log` file (TSV: `<ISO ts>\t<message>`). The human sees it in the swarm panel and replies via the panel's composer (which writes to `hive/notes-to-bots/<their-id>.log`). Don't block on chat.

The legacy `hive/questions-for-human.md` file is **deprecated** — bots use the notes-to-humans channel instead. Existing entries in that file remain as historical record; don't append new ones there.

### Conflict response

| Failure | Action |
|---|---|
| Push to main rejected (non-fast-forward) | `git pull --rebase`, retry. |
| Branch rebase against main produces no conflict markers | `git push --force-with-lease`, let CI re-run. |
| Branch rebase produces real conflict markers | **Stop. Don't guess.** Move ticket to `blocked/`, `Failure mode: merge-conflict`, comment PR, append to your event log, surface to human. |
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
- `hive/colonies/<colony>/focus.md` — current standing order from the human who owns this colony (one line). The colony comes from `.bot-hive-identity` in your worktree.
- `hive/events/` — per-actor event logs, keyed by `<colony>.<handle>.log`. Read the merged view on session start: `cat hive/events/*.log | sort | tail -50`.
- `hive/notes-to-bots/` — humans' notes to bots (one file per human). Scan on session start for `@<your-agent-id>` or `@swarm` mentions.
- `hive/notes-to-humans/` — bots' notes to humans (one file per bot). Append your own replies/questions/status updates here. Format: `<ISO ts>\t<message>`. **Subsumes** the legacy `hive/questions-for-human.md` channel — write here, not there.
- `hive/feature-sets/` — current feature sets and their goals.
- `tasks/lessons.md` — self-correction log. Read at session start; append after corrections.
- `tasks/local-dev-state.md` — per-machine setup snapshots.
- `README.md` — project overview, quickstart for humans.
- `CLAUDE.md` — Claude Code-specific shim (just points here).
