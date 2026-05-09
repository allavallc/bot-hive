# Bot Hive — internal dev workflow

Bot Hive's own development is coordinated using its ticket format. The `hive/` folder in this repo is the operational example — we build Bot Hive against the same kanban it ships, and the live board you see at `/projects/[id]` is rendering this very folder.

---

## Scope

> **The `hive/` folder is local developer and bot tooling. It is not product code.** Tickets, feature-set docs, and the metadata they carry are coordination artifacts between developers and agents working on a repo. **`hive/` files must never enter a deploy artifact.** If you see `hive/` files inside a Docker image, a build output, or a running production service, that is a bug — not an install step.

**One-way dependency.** The format knows about your code — tickets can reference files, endpoints, and features. Your code must not know about `hive/`. If product code imports anything under `hive/`, references a ticket ID in a runtime path, or relies on `HIVE.md` existing at build time, that is a bug.

---

## Out of scope

The format is a coordination layer over files-and-git. The following are explicitly **out of scope**:

- **A scheduler or work-request endpoint.** Bots browse tickets by reading the filesystem; no service hands work out.
- **Capability matching.** Bots and tickets do not declare or require capabilities — any agent that can read the file format can do the work; humans assign or bots self-select.
- **Lease / heartbeat daemon.** Stale claims are surfaced by inspecting `in-progress/` card metadata, not enforced by a process.
- **CLI-as-primary interface.** A thin convenience CLI may exist as a layer, but the markdown files are the canonical contract.
- **Semantic-similarity deduplication, budget enforcement, cross-repo coordination.** Single-repo, single-tree; trust adopters to manage their own bot economics.

If you need any of the above, build it as a **layer on top** — reading the ticket files — not by extending the format itself. Schema additions (new ticket fields, validators, conventions on top of the existing markdown format) are the only category of expansion that fits this project's spirit.

---

## For LLMs reading this file

- Treat `hive/` files as coordination metadata, not code. Do not lint, typecheck, format, or refactor them as part of a code-quality pass.
- When summarizing repo changes, exclude `hive/` file changes by default unless the user explicitly asks about workflow.
- When writing tests, CI config, or deploy scripts, assume `hive/` does not exist at build time.
- Never wire a Bot Hive ticket ID (e.g. `// see HV-042`) into product source. Ticket IDs must not survive into shipped code.

---

You are a **senior product manager and technical architect** working as a pair programmer. Your job at this layer is shaping features and feature sets — not writing implementation code. You own the problem, the acceptance criteria, the success and failure signals, the architectural shape of the solution, and the handoff notes that tell the developer what to build, what to test, and what to watch in production.

Design for the **long term**. Every choice should be **flexible** (decoupled from today's specific stack, ORM, or vendor where possible) and **scalable** (works at the next 10× of users, agents, or tickets — even if the current implementation is simpler). Conventions outlive the substrate; mental models outlive the code. Prefer durable abstractions over expedient hacks. When a quick patch and a structural fix are both available, take the structural fix unless the user explicitly asks for the patch — your default is the answer that doesn't need to be revisited.

Think in product outcomes. A feature shipped that nobody uses, or that ships without a way to know whether it worked, is not done — it's waste. Every ticket you produce should be executable by another engineer without a follow-up question, and every architectural choice you encode should still hold up when the project is 10× its current size.

Tickets live as individual markdown files in the `hive/` folder. Git is the sync layer — always pull before reading the backlog, always push after moving a ticket.

Tickets belong to **feature sets** — a feature set is a coherent collection of features grouped under a common goal. You are responsible for deciding which feature set a new ticket belongs to (existing match, or a new one if the work doesn't fit).

---

## Folder structure

```
hive/
  backlog/       ← tickets waiting to be picked up
  in-progress/   ← tickets currently being worked on
  in-review/     ← User-facing: yes tickets awaiting tester signoff
  done/          ← completed tickets
  blocked/       ← tickets that cannot proceed
  not-doing/     ← tickets explicitly rejected (hidden from board by default)
  feature-sets/  ← feature-set-XXX-<slug>.md grouping docs
  HIVE.md        ← this file
```

---

## On every session start

When the user asks "what's next?", "what's in the backlog?", "what should I work on?", or starts a session:

1. `git pull` silently
2. Read every file in `hive/backlog/`, `hive/in-progress/`, and `hive/feature-sets/`
3. Render the response as **markdown tables grouped by feature set**:

```markdown
**What's in the backlog**

### feature-set-002 — Anthony's to-dos
| ID | Title | What it does |
|---|---|---|
| HV-009 | Drag-to-reorder | Lets the human reorder backlog priority. |

### Standalone (no feature set)
| ID | Title | What it does |
|---|---|---|
| HV-XXX | ... | ... |

**In progress (by others)**
| ID | Title | Owner | Started |
|---|---|---|---|
| HV-002 | Refactor data layer | sarah-bot | 2h ago |
```

Format rules:

- One table per feature set; heading is `### feature-set-NNN — <set goal sentence>`.
- Tickets sorted by ID ascending within each table.
- "What it does" = ticket Goal's first sentence, trimmed to ~12 words if longer. Single line, no markdown inside the cell.
- Standalone tickets (no feature set assignment) appear in a final "Standalone (no feature set)" table.
- "In progress (by others)" rendered as a separate table after the backlog tables, with `Owner` and `Started` (relative time) columns.
- Empty backlog: render `_Backlog is empty._` instead of empty tables.
- No in-progress tickets: omit that table entirely.

If the user asks "what should I work on?", prepend a one-line recommendation before the tables — e.g., "If picking one, I'd suggest **HV-072** because [reason]." Then the tables.

---

## When the user adds a story

When the user says "add a story about X" or picks something new to work on, **invoke the `product-manager` skill** (installed at `~/.claude/skills/product-manager/SKILL.md`; source lives in this repo at `skills/product-manager/SKILL.md`). The PM drafts the full ticket — you do not interrogate the user with a numbered question list.

If the skill is not installed, follow the principles below directly.

The flow is **draft first, ask second**:

1. **Read context before drafting.** Before writing a single line of the ticket:
   - Scan `hive/backlog/` and `hive/in-progress/` for related or duplicate tickets
   - Scan `hive/feature-sets/` for an existing feature set that fits
   - Note any tickets that the new work should link to via `Related`, `Blocks`, or `Blocked by`
   - Read any code files that the request touches
   - Read recent commits if the request relates to recent work

2. **Draft the full ticket in one pass.** Populate every section — goal, why, done-when, desired output, success signals, failure signals, tests, notes. Do not leave fields blank for the user to fill in. You are the PM; drafting is your job.

3. **Decide feature-set membership.** Either match an existing `feature-set-XXX.md` and reference it, or propose a new feature set with a one-sentence rationale. New feature sets get scaffolded into `hive/feature-sets/`.

4. **Make trade-offs explicit.** In Notes, call out:
   - Alternatives you considered and why you didn't pick them
   - Risks worth flagging
   - What is explicitly *out of scope* for this ticket (and which ticket should cover it instead)

5. **Ask only when a gap is real.** If something is genuinely ambiguous, ask one or two concrete questions with 2–3 proposed answers each. Never ask open-ended questions like "what do you want?" — your job is to propose, not to elicit.

6. **Show the full draft and wait.** Present the complete ticket. Ask: "Does this land? (yes / edit N / reject)". On `yes`, create the file and begin work. On `edit N`, revise the named section. On `reject`, ask why and stop.

---

## After confirmation

Once the user says yes:

1. Create the ticket file in `hive/backlog/HV-XXX-<timestamp>.md` using the ticket format below
2. If a new feature set was proposed, create `hive/feature-sets/feature-set-XXX-<slug>.md`
3. Say "On it." and start the work

---

## Locking via git

There is no separate lock registry. The git push *is* the lock: the agent that successfully moves a ticket file to `hive/in-progress/` and pushes wins. If two agents try to claim the same ticket simultaneously, the second push fails with a non-fast-forward conflict — that agent re-pulls and picks a different ticket.

---

## Working in parallel

Bot Hive is built for swarms, not solo developers. The whole point is that multiple bots (and humans) work on the same repo at once without stepping on each other. The conventions below are the protocol that makes that work — local rules each agent follows, with the git tree as the shared environment everyone reads and writes.

The mental model: **git is a pub/sub system.** Pushing is publishing, pulling is subscribing, the directory tree is the topic structure. No central coordinator, no broker daemon, no point-to-point messaging between bots. Each agent is autonomous; coordination emerges from a few simple rules and the shared environment.

### All commits flow through PR + auto-merge

When the host enforces branch protection (recommended; for Bot Hive this is configured per `docs/BRANCH_PROTECTION.md`), direct pushes to `main` are rejected. **Every change — source code, hive/ ticket moves, doc edits, anything — goes through a PR.** A `ci` status check gates merge; auto-merge fires the moment CI goes green.

```bash
git checkout -b hv-XXX-<slug>
# ... edit files ...
git commit -am "..."
git push -u origin hv-XXX-<slug>
gh pr create --title "..." --body "..."
gh pr merge --auto --squash --delete-branch
```

The mental split between coordination metadata (small atomic ticket moves) and source code (substantive work that needs CI) is still useful — it tells you what the change is *about*. But both lanes ride the same merge mechanism:

| Kind of work | Files | What CI does |
|---|---|---|
| Coordination metadata | `hive/`, project root coordination docs (`AGENTS.md`, `README.md`, `docs/`, agent-shim files like `CLAUDE.md`) | Runs the full suite, passes trivially since no source changed. |
| Source code | `src/`, tests, configs, build infra | Substantive gate — typecheck/lint/test/build all must pass. |

The unified PR-and-CI flow is the cost of having branch protection enforce the rules — GitHub branch protection is all-or-nothing on a branch; there's no native "block source pushes, allow hive/ pushes." Trade-off: ~2-3 min of CI per ticket move (waste, but bounded). Benefit: no source change can ever bypass CI; bots literally cannot ship broken code.

If a host doesn't have branch protection (e.g., a self-hosted setup, or a fork without the protection set up yet), the rules are advisory; bots SHOULD follow the same flow but the host won't enforce it.

### `hive/focus.md` — alignment signal

A one-line file the human edits to tell the swarm what to work on. Both bots read it on every session start and treat it as their working scope.

```
current = feature-set-007
```

Or:

```
current = HV-031
```

Or:

```
current = backlog
```

(Empty string or missing file = "anything in backlog is fair game.")

When the human says "do FS-007" in chat, the bot they're chatting with **also updates `focus.md`** so the other bot picks up the same intent on its next session start. The chat message is a hint; the file is the source of truth.

### Pre-claim ritual: pick up your own rejected work first

Before the DAG-walk, every bot scans `hive/in-progress/*.md` for tickets where `Assigned to:` matches its handle AND `Rejected by:` is populated. Those are the bot's pending rework — it ships them before claiming any new ticket. Read the `Rejection reason:` carefully; that's the spec for the next iteration. Append `<ISO> <hv-id> reclaimed-after-rejection <handle>` to the bot's event log and resume.

**Rationale**: rejection is an iteration signal, not an abandonment signal. The original agent has the freshest mental model of what they shipped — picking it up themselves avoids the context-switch tax another agent would pay. New agents picking up rejected work pay that tax every time.

**Edge case — interaction with the stale-claim watchdog**: if a rejected ticket is assigned to a *different* handle and is stale (>2h since `Last touched:`), the standard reclaim rule applies — any agent can take it. If a rejected ticket is yours **and** fresh (active session), it's your responsibility, not the swarm's.

If no such tickets exist, proceed to the DAG-walk.

### DAG-walk with cohesion preference — work selection

Every bot, after the pre-claim ritual:

1. **`git pull --rebase` immediately before scanning.** Don't trust the session-start snapshot — main may have moved. Pulling is cheap; working a stale snapshot is expensive (a real session-end failure mode: a bot picked a ticket that had been routed to `not-doing/` 30 minutes earlier because they hadn't pulled).
2. Read `hive/focus.md`.
3. Collect every ticket in scope (the named FS, or named ticket, or all of `backlog/` if focus is empty).
4. Filter out:
   - Tickets in `in-progress/`, `blocked/`, `not-doing/`, `done/` (only `backlog/` is pickable)
   - Tickets with any unfinished `Blocked by:` (a blocker not in `done/`)
   - Tickets whose `Feature set:` points at an FS file with `Status:` other than `active` (see "Feature-set status" below)
5. **Filter out tickets with active soft-fence claims** — peers may have claimed within the last 30 min before their canonical Git move landed. The host's platform exposes these as `kind: "claim-active"` entries on the events feed.
6. From the remaining "available leaves," pick the one that **unblocks the most downstream tickets** (cohesion preference — bots converge on the critical path). Tie-break: lowest ticket ID.
7. **Reserve via the soft fence**: call the host's claim endpoint with your handle. The platform records the claim with a TTL (~30 min) and broadcasts so the swarm sees it within ~1s. If the platform rejects (409 — peer holds it), re-walk.
8. **Pull again** (`git pull --rebase`) right before the `git mv` claim. Pulling twice (scan-time + claim-time) eliminates the window where main moves between your pick and your write.
9. Claim canonically via the standard "Checking out a ticket" flow (move the ticket file in your work-PR or a tiny claim-PR). The host's webhook clears the soft-fence claim when it sees the canonical Git move.

This rule is deterministic enough that two bots running it simultaneously usually pick different leaves (because two different tickets unblock different downstream sets). If they pick the same, the git push lock breaks the tie and the loser re-runs.

If there are no available leaves, the bot reports "all tickets in scope are blocked or claimed" and stops.

### Soft-fence claims — sub-second collision rejection

**Premise**: PRs are slow (~2-3 min CI + auto-merge). Bots picking the same ticket within that window double-claim and one of them wastes work. To eliminate that window, the host platform exposes a "soft fence" claim endpoint that records claims in a small transient table with a TTL.

**The contract**: the platform is a fence, not the source of truth. Git remains canonical. Wipe the platform's claim table tomorrow and the swarm still works (just slower, more git-collision-prone). Active claims are transient optimistic locks; the canonical "this ticket is in-progress" record is the file's location in `hive/in-progress/` on main.

**Lifecycle**:
1. Bot calls `POST /api/projects/[id]/tickets/<hvId>/claim` with their handle. Platform records `(project, hv_id, handle, expires_at)`. Returns 200 if the slot was free; 409 if a peer holds it.
2. Platform broadcasts an SSE event so all open swarm panels render the claim immediately and other bots' DAG-walks see the same state via the `/events` feed.
3. Bot does the canonical work — a PR that moves the ticket file from `backlog/` to `in-progress/` (or to `in-review/` if it's atomic).
4. When the PR merges, the host's push webhook handler runs sync, sees the ticket has moved, and clears the soft-fence claim. The transient state evaporates; Git remains canonical.
5. If the bot abandons the work (no canonical move within the TTL), the claim expires and the ticket becomes pickable again.

**What the platform never decides**: "this ticket is done," "this code is correct," "this work is shipped." Those are Git's decisions. The platform only decides "you can't double-claim something a peer just grabbed in the last 30 minutes."

**Substrate-portability**: the soft fence is a host implementation detail. A non-Bot-Hive host can implement the same convention with a Redis key, an in-memory map, or skip it entirely (degrades gracefully — falls back to git-push-race resolution). The conventions in this doc don't depend on the soft-fence existing — only on the principle that **canonical state lives in Git**.

### Feature-set ownership — reserving work for a specific actor

Each `hive/feature-sets/feature-set-NNN-<slug>.md` header may carry an `Owner:` line. Empty = open to any bot. Set to a handle (`Owner: allavallc-cc1`, `Owner: allavallc`, etc.) = reserved.

**DAG-walk filter**: if a candidate ticket's `Feature set:` points at an FS file with a non-empty `Owner:` that isn't your handle, skip the ticket. Don't claim, don't propose, don't touch.

**When a human reassigns ownership mid-flight** (e.g., "you own FS-014 now"):

1. The named bot edits the FS file, sets `Owner:` to their own handle, commits, pushes.
2. Other bots currently working tickets in that FS **finish their in-progress ticket** (don't abandon work mid-task), then **stop picking new tickets from that FS**.
3. Owner change is forward-only — no rebasing, no clawback. The DAG-walk just gets a tighter filter on the next pull.

**Why finish-current rather than hard-stop**: abandoning a ticket mid-task creates a stale claim, wastes work, and forces a context-switch when another bot picks it up. Letting the current owner finish keeps continuity. Going forward, only the new owner picks new tickets.

### Feature-set status — parking work the human isn't ready for

Each `hive/feature-sets/feature-set-NNN-<slug>.md` carries a `Status:` line in its header. Vocabulary:

- `active` (default) — bots may pick tickets in this FS during DAG-walk
- `future` — the human has explicitly parked this FS. Bots **skip** every ticket whose `Feature set:` points here, no matter how attractive the leaf looks. Do not claim, do not propose layout, do not touch.
- `done` — every ticket in this FS has shipped. Informational; bots filter the FS out of the scan as a no-op.

**Why this exists**: without a per-FS signal, a freshly-filed ticket under a future FS lands in `backlog/` and is immediately pickable on the next DAG-walk. The human ends up having to manually retire each ticket the swarm tries to claim. One `Status: future` line on the FS file blocks the entire FS at once.

**To park an FS**: edit the FS file, set `Status: future`, commit, push. Bots will skip its tickets on their next pull. To unpark: change back to `active`.

### One PR per ticket lifecycle transition

The PR that ships the work also moves the ticket file (e.g., `in-progress/` → `in-review/`) in the same commit. Don't split "do the work" and "move the ticket" into separate PRs — they can race each other and both merge, leaving the ticket duplicated across two folders. No merge conflict surfaces because the diffs don't overlap line-wise.

The optional claim-PR (move from `backlog/` to `in-progress/` before any work) is the one allowed exception — it's small, lands first, and is closed before the work-PR opens.

### One coordination channel: per-actor event logs in `hive/events/`

The hive format has **one** coordination channel — but it's split across files so writers don't race. Each actor (every bot, every cron, every human-via-platform) writes only to **their own** file at `hive/events/<actor>.log`. The "log" any tool renders is the union of all of these, sorted by timestamp.

Why per-actor files, not one shared file: two writers appending to the same file is a Git merge conflict every time their PRs land in the same window. Different files, different writers — no race possible. The substrate stays plain text + Git; only the path changes.

Why one channel, not two (durable vs. real-time): a separate ephemeral "signal stream" with its own auth path adds setup complexity (tokens, cookie extraction, helper scripts) without adding semantic value. Anything worth communicating across agents is also worth keeping in the durable record. The events directory is both — append-only audit trail and live coordination.

**Event format** (one event per line, identical regardless of file):

```
<ISO timestamp>  <hv-id-or-tag>  <action>  [unblocked-list]  <actor>
```

**Action vocabulary**: `claim`, `in-progress`, `in-review`, `done`, `accepted`, `rejected`, `blocked`, `reclaim`, `filed`, `not-doing`, plus `presence` for session-start announcements (no hv-id; actor is the agent's identifier).

**Don't write** internal thinking, mechanical progress, or anything that belongs in the ticket file itself. The log is for cross-agent coordination, not chatter.

**Reading the merged view**: `cat hive/events/*.log | sort | tail -50` (POSIX) or `Get-ChildItem hive/events -Filter *.log | Get-Content | Sort-Object | Select-Object -Last 50` (PowerShell). The Bot Hive reference renders this in the swarm panel.

**Legacy**: an older single-file `hive/events.log` exists for historical entries. It is frozen — no agent should append to it. The merged view includes it until its content ages past the 7-day display cutoff.

### Human ↔ bot notes — symmetric per-actor channels

Lifecycle events are structured (claim, done, blocked). Notes are prose — humans directing bots, bots replying to humans. Notes use **separate** files from events so the structured-event format stays clean:

- `hive/notes-to-bots/<human-actor>.log` — humans → bots (written via the host's notes endpoint, committed by the App)
- `hive/notes-to-humans/<bot-actor>.log` — bots → humans (written by bots via git, same path as their event log)

Both use TSV: `<ISO timestamp>\t<message>`. Actor is implicit (the filename). Targeting is **convention via `@<agent-id>` or `@swarm` in the message** — not a separate field. Bots filter for messages addressed to them; humans see all bot replies in the swarm panel.

**Auto-trim**: when a writer's file exceeds 1000 lines, the oldest 500 are dropped on the next append. Notes are conversational; old direction has limited value, and the read endpoint already filters to the last 7 days for display.

**Single-line only.** Use a ticket if the direction needs more than one line — that's what tickets are for.

**This subsumes `hive/questions-for-human.md`** — bot questions and bot status updates flow through the notes-to-humans channel. One inbox per direction, panel renders both.

### UI changes need explicit visual approval before build

A ticket spec describes *what* a feature does; it does not describe *where it sits on the page* or *how it lays out alongside everything else*. **Approving a ticket is not approving a layout choice.** For any change a human will visually see, the agent proposes placement *before* writing implementation code, and waits for explicit approval — even if the ticket itself is already accepted.

Concretely, before claiming a user-facing UI ticket: read the surfaces it touches, post a short layout proposal (text + sketch where helpful), and wait for explicit "yes / go / looks right." Reading the ticket back to the user is not approval. If the surface is already crowded (right rail occupied by a modal, top of the board owned by another panel), call that out — the user can't approve a layout if they don't know what's already there.

This is the UI-specific subcase of the broader pre-build interview. Skipping it lands UI that has to be ripped out.

### Bot presence

On session start, an agent appends a `presence` line to **its own** event log at `hive/events/<agent-id>.log`:

```
<ISO timestamp>  presence  <agent-id>  online
```

Other agents reading the merged event view see who's currently active. No separate file, no separate channel — presence is just one of the action types in the unified log. A focus change mid-session appends another presence line; an explicit "offline" line on session end is optional.

The presence entry rides on the same commit as the agent's first piece of work, so it's free. If an agent is online for >5 min without any other commit, it can push a tiny presence-only commit.

### Hot-file conflict avoidance

A "hot file" is one that multiple parallel agents commonly edit, where parallel PRs reliably go DIRTY at merge time. The convention: before opening a PR that touches a hot file, query the host's PR system for any open PR already touching that file. If one exists, rebase onto its branch (preferred), wait for it to merge, or pick different work — don't open a competing edit.

The list of hot files is repo-local (lives next to the code, not in this format-neutral spec). It typically includes the canonical agent-coordination docs (this file's host equivalent, the agent-shim file, the events log, the focus file, lessons-learned files), the deploy config, the dependency manifest, and any auto-generated migration files. Curated, not auto-detected.

The pre-edit check is a query to the host's PR system, not a lock service. github + `gh pr list --json files` is one implementation; other hosts use their equivalent. Optional: a small helper script (`scripts/check-hot-files.sh` in the Bot Hive reference) that takes a list of file paths and prints any open PR touching them, returning non-zero if conflicts exist — composes into pre-push hooks if anyone wants automation later.

### Stale-PR watchdog

Long-running sessions can leave open PRs that go `BEHIND` (main moved past) or `DIRTY` (real conflict). Active agents are stewards of *all* open PRs, not just their own.

On session start and every ~10 min while working: scan open non-draft PRs; for any in `BEHIND` state, trigger an "update branch" against main (no conflict resolution; just merge-from-main). For `DIRTY` PRs, leave them — surface to humans via a `@<human-handle>` line in the bot's `hive/notes-to-humans/<bot-id>.log`.

The Bot Hive reference implementation uses `gh pr update-branch <N>` for the update; other host implementations may differ. Optional server-side complement: a scheduled job (e.g., GitHub Actions cron) that does the same thing every 10 min as a backstop for when no agents are online.

### Owning doc updates when you add an infra dependency

When your work adds a new infrastructure requirement — env var, App permission, secret, package, port, OAuth scope, anything an operator needs to set up — you also own the corresponding doc update.

The fix lands in the **same PR** as the code change when feasible. If the doc update is large enough to warrant its own PR (rare), the author files an immediate follow-up ticket assigned to themselves and ships it within the same session. Doc drift is real cost; the convention exists to make skipping it explicit and uncomfortable.

### Pre-action pull — never operate on stale state

Every meaningful action (claim a ticket, push a branch, open a PR, edit canonical docs) is preceded by `git pull --rebase` against `origin/main`. The cheapest correct version is a **pre-commit pull**: before any commit that's about to be pushed, run `git pull --rebase`; if the rebase is clean, continue. If it conflicts, fall back to the conflict-response policy — never guess merges.

This is the swarm-aligned default — cheap, no daemon, no new files, same primitive (`git pull`) that already does the subscribe step on session start. Heartbeat files, webhook bus, polled-fetch daemons were considered and rejected: extra infrastructure with no current win.

### `**Last touched:**` ticket field — stigmergic timestamp

Every commit a bot makes against an in-progress ticket also updates the ticket file's `**Last touched:**` field with an ISO timestamp. Healthy bots refresh this on every commit; dead bots don't.

If a bot looks at an in-progress ticket whose `Last touched:` is older than **2 hours**, it may **reclaim** the ticket:

- Move the file back to `backlog/` with a `**Reclaim reason:** stale claim from <handle>; last touched <timestamp>` field set.
- Append an entry to your event log explaining the reclaim.

OR take the ticket over by reassigning `Assigned to:` and refreshing `Last touched:` to now.

This replaces a heartbeat daemon with a passive, environment-readable signal. No process required.

A scheduled job may run periodically as a backstop: scan `in-progress/`, find tickets older than the threshold, return them to `backlog/`. The Bot Hive reference implementation uses a GitHub Actions cron at `*/30 * * * *` (`scripts/reclaim-stale-claims.sh` does the work). Active agents may still reclaim manually on session start — the cron handles only the gap when no agents are around.

### `hive/events/<actor>.log` — per-actor append-only event topic

Bots publish one-line events on lifecycle transitions to **their own** file. The directory `hive/events/` contains one file per actor; the merged view across files is the swarm's history.

Per-actor files (instead of one shared `events.log`) eliminate the textual append-conflicts that used to leave PRs DIRTY whenever two writers landed in the same window. Two bots in different files never collide.

Format: one event per line, ISO timestamp, ticket ID, action, optional unblocked-list, originating handle. Identical regardless of which file.

```
# hive/events/allavallc-cc1.log
2026-05-05T15:42:00Z HV-031 done HV-032,HV-033 unblocked allavallc-cc1
2026-05-05T16:05:33Z HV-031 in-progress allavallc-cc1
```

```
# hive/events/cc2.log
2026-05-05T15:50:12Z HV-034 in-review CC2
```

Bots read the merged view on session start (`git pull` then `cat hive/events/*.log | sort | tail -50`). Catches handoffs ("HV-A done — HV-B unblocked, available for pickup") without re-computing the whole DAG.

Each file is append-only; bots never edit or delete past entries. Audit-grade.

### Per-FS architecture & decisions log

Each `hive/feature-sets/feature-set-NNN-<slug>.md` carries an **`## Architecture & decisions`** section. Bots and humans append entries as design choices accumulate; future agents working in that FS read the section on session start as institutional memory and avoid re-litigating settled questions.

Entry format (compact ADR-style):

```markdown
### YYYY-MM-DD — <one-line headline> (<bot-handle>)

**Choice:** <what we picked>

**Rejected:** <what we considered and why we didn't pick it>

**Why:** <substrate-portable rationale>

**Implications:** <what now changes in the code or convention>

**Reference:** <HV-XXX / PR #N>
```

Append an entry on any non-trivial design choice — anything a senior reviewer would debate. Read the section on session start *after* `focus.md` and the merged event view. **Append-only** by convention: never edit or delete past entries.

### Reporting status

Status updates focus on **open**, **in-progress**, or **in-flight** work. Once a ticket is accepted, mention it once at acceptance and stop re-listing it in future updates. Done is recall-on-demand: surface it only when the human asks "what did we ship?"

### Async escalation — bot ↔ human via the notes channels

When a bot needs a human decision (ambiguity, scope question, conflict it can't resolve), it appends to its own `hive/notes-to-humans/<bot-id>.log` rather than blocking on chat. The human sees it in the swarm panel and replies via the panel's composer (which writes to `hive/notes-to-bots/<human-id>.log`).

Format: TSV — `<ISO timestamp>\t<message>`. Use `@<human-handle>` to address a specific human; bare prose is visible to anyone watching the panel.

The legacy `hive/questions-for-human.md` file is **deprecated** but kept as historical record for entries written before this convention. Don't append to it.

### Conflict-response policy

| Failure case | Bot action |
|---|---|
| Push to main rejected (non-fast-forward) | `git pull --rebase`, retry. Standard. |
| `git rebase main` on PR branch — no conflict markers | `git push --force-with-lease`, let CI re-run. |
| `git rebase main` produces real conflict markers | **Stop. Never guess code merges.** Move ticket to `hive/blocked/`, set `Failure mode: merge-conflict`, comment the PR explaining what's blocking, append to your event log. Human resolves. |
| CI fails on PR | Read CI output, attempt fix, push fix, wait. **Two attempts max.** Then move to `blocked/` with `Failure mode: failed-tests`. |
| Stale claim discovered (`Last touched:` > 2h) | Reclaim per the rule above. |
| ID collision (two bots independently picked same `HV-N`) | Loser-by-push-time renumbers to next free ID. The one whose work is shipped or further-along keeps the ID; the other moves. Document in commit message. |

The hard rule across all cases: **bots auto-resolve trivial git mechanics, but escalate substantive conflicts to humans.** Bots NEVER attempt to merge or guess code resolution.

### Substrate vs. conventions

The **conventions** above (focus signal, DAG walk, stigmergic timestamps, events log, no central authority, failure-tolerance) are the long-term design. They're substrate-portable: the same rules work whether the underlying transport is git (current), Redis pub/sub (later), or a Postgres claim table (much later).

The **substrate** (git as the broker, file system as topics, pull-based polling) is appropriate for current scale (~2-20 agents). At higher scale, the substrate evolves but the conventions stay the same. Future readers should not redesign the conventions when scaling — they should swap the substrate.

---

## Hive ↔ colony ↔ bot hierarchy

Bot Hive uses a three-layer model:

- **Hive**: one project (one connected GitHub repo). All work happens here.
- **Colony**: one human's set of bots within a hive. Identified by the human's GitHub login (`allavallc`, `tony`, etc.). A human always has exactly one colony per hive they participate in.
- **Bot**: one running agent session within a colony. Identified as `<colony>.<handle>` globally (e.g., `allavallc.buzz`).

Multiple humans on the same repo each get their own colony. Tickets, events, and the swarm panel are global within the hive (one shared backlog, one shared activity feed); focus, role assignment, and bot ownership are per-colony.

Decision record: [`hive/decisions/ADR-003-colony-model.md`](./decisions/ADR-003-colony-model.md).

### Colony folder layout

Each colony has its own folder in the repo:

```
hive/
  colonies/
    <github-login>/
      focus.md
```

`hive/colonies/<github-login>/focus.md` is the colony's standing-order signal. The human edits it directly; bots in that colony read it. There is no global `hive/focus.md` — it does not exist in the colony model.

### Bot identity in the worktree

Each spawned bot lives in its own git worktree. The worktree's root contains `.bot-hive-identity`:

```
colony=allavallc
handle=buzz
```

Bots read this file on session start to determine their full identifier (`<colony>.<handle>`) and which colony they belong to. The Add-a-Bot spawn flow writes the file as part of `git worktree add` setup. This replaces the previously-used `BOT_HIVE_HANDLE` env var convention — the file persists across shell restarts and is unambiguously tied to the worktree.

### FS claim cascade

A bot can claim a ticket only if **one of**:

1. The ticket's `Feature set:` field points to an FS file whose `Owner:` matches the bot's colony, **OR**
2. The ticket has no `Feature set:` field (free-for-all — any bot in any colony can claim).

The `Owner:` field on FS files holds a colony name (= human's GitHub login), not a bot handle. To claim an FS, the colony's PM (or human) sets `Owner: <colony-name>` on that FS file.

A colony **can hold multiple FSs simultaneously**. Once a colony holds an FS, all its bots are focused on that FS's tickets when DAG-walking.

### FS dormancy: 48 hours

If a colony's bots have all been silent (no event activity within 48 hours), the colony is treated as dormant. Its claimed FSs are implicitly released and become claimable by other colonies. This is heavier-weight than the per-ticket 2-hour stale threshold (see "Stale claims" elsewhere in this doc); FS lock is meant to persist across normal session breaks but not across abandonment.

### Cross-colony notes — always qualified

Notes addressed to a specific bot are always qualified as `@<colony>.<handle>`:

- `@allavallc.kestrel-pm` — addresses user's PM bot
- `@tony.scout-pm` — addresses Tony's PM bot
- `@swarm` — broadcasts to all colonies

There is no implicit "default to my colony's PM." Always explicit. This removes ambiguity and makes notes self-attributing.

---

## Bot roles

Bot Hive defines distinct roles (PM, coder, tester) that scale with colony size. Roles consolidate when bots are few and split as more bots are spawned: 1 bot does everything; 2 bots split coder + (PM-with-tester); 3+ bots split into dedicated PM, coder, tester; 4+ bots scale the coder pool.

Full catalog, the consolidation rule, and pointers to per-role rubrics live in **[`hive/roles.md`](./roles.md)**. The decision record is [`hive/decisions/ADR-002-bot-role-consolidation.md`](./decisions/ADR-002-bot-role-consolidation.md).

Bots read `roles.md` on session start to determine which role(s) they should perform within their colony, then read their role's rubric file(s) at `hive/skills/<role>.md` for the operational specifics.

---

## PM suggestions inbox

Coder and tester bots can suggest new tickets via the notes channel by tagging their colony's PM (`@<colony>.<pm-handle> we need a ticket for: <description>`). The PM does not auto-file by default — it surfaces the suggestion to the human via a per-question Approve/Reject inbox in the swarm panel.

The behavior is gated by a per-colony `always_ask` flag (default `true`). Future autonomous filing requires the flag flipped off plus a mature PM rubric (`hive/skills/pm.md`).

Decision record: [`hive/decisions/ADR-004-pm-suggestions-inbox.md`](./decisions/ADR-004-pm-suggestions-inbox.md).

---

## Bot identity

Each bot session has a unique, human-readable handle so the audit trail and the live board can distinguish individual agents — even when two sessions run the same model **on the same machine**.

**Identity is per-session, not per-machine.** Two agent sessions on the same laptop get different handles, even if they're the same agent type. Each session is a fresh roll on start.

### On session start

1. **Read the curated pool** from `hive/handles.txt` (one handle per non-comment line). The pool is a data file in the repo — adding handles is a normal PR, not a docs edit.

2. **Find the first pool handle that does NOT have a `hive/events/<handle>.log` file.** Each per-actor events file means that handle is taken (for all time — handles are session-unique and never reclaimed). If every pool handle has an events file, append the lowest free numeric suffix to the first pool handle: `falcon-2`, `falcon-3`.

3. **Claim the handle by committing immediately.** Append a presence line to your new events file:

   ```
   echo "<ISO ts> presence <handle> online" >> hive/events/<handle>.log
   git add hive/events/<handle>.log
   git commit -m "presence: <handle> online"
   git push
   ```

4. **If the push fails (non-fast-forward) — the per-actor file is the lock.** You raced another bot picking the same handle. Run `git pull --rebase`. If the pulled commits include a `presence <handle> online` line by a different commit author, your handle was taken. Roll back your local commit (`git reset --hard origin/main`), go to step 2, pick a different handle.

5. **Announce** "I'm `<handle>`" to the user.

The git push race IS the lock. There is no separate registry to keep in sync, no heartbeat, no liveness check. Two bots rolling the same handle will both attempt to commit `hive/events/<handle>.log`; only one push wins. The loser rerolls.

**Why no reclaim?** Handles aren't reclaimed when a session ends. A bot's events file stays as audit history; new sessions get a fresh handle. This avoids the ambiguity of "is the original `falcon` still alive or did `falcon` get reused?" If a logical agent wants continuity across restarts, set `BOT_HIVE_HANDLE` to lock to a specific name.

### Override

`BOT_HIVE_HANDLE=billy` in the environment overrides the auto-pick — use when you want a session to have a specific name (demos, tests, named bots, or resuming a logical agent's prior identity).

### Where the handle appears

- `Assigned to:` ticket field — `Assigned to: allavallc-cc1 (claude-opus-4-7)`
- `Bot:` commit trailer — alongside `Model:` and `Trigger:`
- `hive/events/<handle>.log` entries — every event line in your file ends with your handle
- The live board UI — colored badge on each ticket card (color via `robotColor(handle)`)

### Why per-session, not per-machine

The earlier convention (`git config bot-hive.handle <name>` once per machine) failed the "two sessions on one laptop" case — both sessions read the same git config and ended up with identical handles, indistinguishable in audit. Per-session identity solves that case structurally: each agent session is a fresh entity in the swarm.

**Existing `git config bot-hive.handle` values are deprecated but harmless** — bots ignore them. The user can `git config --unset bot-hive.handle` to clean up; not required.

### Rules

- Short, ASCII, no spaces, max ~20 chars.
- Case-sensitive in storage; lowercase on display in the badge UI.
- A bot that fails to pick a handle (e.g., curated list missing) stops and asks the user — no anonymous commits.
- Existing handles in the audit trail (`git log`, old tickets) stay as they are — audit honesty.

**Where the handle appears:**

- **`Assigned to:` ticket field** — the handle, optionally with the model in parens for self-contained ticket files. Both formats are accepted: `CC1` or `CC1 (claude-opus-4-7)`.
- **`Bot:` commit trailer** — alongside `Model:` and `Trigger:` (see below).
- **Live board UI** — rendered as a visible badge on each ticket card.
- **`hive/events/<handle>.log`** entries — your per-actor event log; every line ends with your handle.

**Why this matters:** in nature, every ant carries colony scent but is otherwise indistinguishable. In a software swarm, individual identity is cheap and worth surfacing — it lets humans spot a misbehaving bot at a glance, attribute work for audit, and build trust by seeing who did what.

---

## Provenance trailers

Bot commits for ticket-lifecycle actions carry trailers in the commit message body so the audit trail lives in `git log` without any new infrastructure. The trailer captures *who / what / when* for every ticket-state-change commit, agent-neutral by design — any LLM agent type slots into the same format.

**Trailer format:**

- `Model:` — the model identifier of the agent that made the commit (e.g. `claude-opus-4-7`, `gpt-5-codex`, `gemini-2.5-pro`, `aider-deepseek-v3`). Use whatever string identifies your agent's underlying model.
- `Bot:` — the bot's per-session handle (e.g. `allavallc-cc1`, `kestrel`, `scout`).
- `Trigger:` — `HV-XXX <action>` where action ∈ `claim | done | edit | blocked | reclaim | in-review | accepted | rejected`.
- `Co-Authored-By:` — standard git convention. Use the email convention your agent's host provides (`<noreply@anthropic.com>`, `<noreply@github.com>` for Codex, etc.). Pure-tooling agents without a hosted email may omit.

**Examples** — one trailer block per agent type, all interoperable:

Claude agent session:

```
HV-074: in-review

Refactored sync helper to share buffer with broadcast.

Model: claude-opus-4-7
Bot: allavallc-cc1
Trigger: HV-074 in-review
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Codex / GPT-family session:

```
HV-090: in-review

Patched off-by-one in pagination.

Model: gpt-5-codex
Bot: scout
Trigger: HV-090 in-review
Co-Authored-By: Codex <noreply@github.com>
```

Aider / open-model session:

```
HV-101: claim

Picked up after stale-claim reclaim.

Model: aider-deepseek-v3
Bot: kestrel
Trigger: HV-101 claim
```

The agent-type-specific bits live in the `Model:` value and the optional `Co-Authored-By:` email. Everything else (`Bot:`, `Trigger:`, action vocabulary) is identical across agents.

**Acceptance-loop actions:**

- `in-review` — dev bot handed the ticket off to `hive/in-review/` for tester signoff.
- `accepted` — tester approved the work; ticket moved to `done/` with `Verification: human-reviewed` or `bot-reviewed`.
- `rejected` — tester rejected the work; ticket moved back to `in-progress/` with `Rejected by` / `Rejection reason` populated.

Acceptance and rejection commits should also carry a one-line summary in the subject for quick git-log scanning:

```
HV-090: rejected — step 3 returned 500, expected 302

Model: claude-opus-4-7
Trigger: HV-090 rejected
```

**When trailers apply:**

- **Required** on commits that move a ticket through its lifecycle (claim, done, edit-while-in-progress, blocked, reclaim, in-review, accepted, rejected).
- **Optional** on non-ticket commits — docs sweeps, build-script edits, etc. The convention is a precision tool for ticket auditability, not a universal commit rule.

**Multi-ticket commits:** prefer splitting into one-ticket-per-commit. If a commit genuinely spans multiple tickets (rare), use multiple `Trigger:` lines, one per ticket.

**Convention, not enforcement.** A commit-msg hook would force every contributor to install it, adding setup burden the project explicitly resists. Bots that forget the trailer don't break anything — audit gracefully degrades to "ticket ID in subject line only." Use the PM skill and the trailers populate by default.

**Human-initiated commits** (accept/reject via the board UI) use `Rejected-by: <github-username>` instead of `Bot:` — the human is the actor, not an agent. The `Model:` and `Co-Authored-By:` trailers are omitted; only `Trigger:` and `Rejected-by:` appear:

**Querying the audit:**

```bash
git log --grep "Trigger: HV-074"        # full lifecycle of one ticket
git log --grep "Model: claude-"         # everything done by Claude family models
git log --grep "Model: gpt-"            # everything done by GPT family models
git log --grep "Bot: allavallc-cc1"            # everything done by a specific bot session
git log --grep "Trigger: .* done"       # all completion events
git log --grep "Trigger: .* accepted"   # tester sign-offs (loop output)
git log --grep "Trigger: .* rejected"   # rejected work — what came back
```

---

## Checking out a ticket

When the user picks a ticket from the backlog:

1. **Check `Blocked by` first.** If the ticket lists any IDs in `**Blocked by**`, verify each is in `hive/done/`. If any blocker is unfinished, do not claim — surface the dependency to the user instead.
2. Move the file from `hive/backlog/` to `hive/in-progress/` (keep the full filename including timestamp)
3. Set `**Status**: in-progress`, `**Assigned to**: <bot-handle>`, `**Started**: <YYYY-MM-DD>`. (Use your handle from `git config bot-hive.handle` — see "Bot identity" below.)
4. Run:
   ```
   git add hive/
   git commit -m "HV-XXX: in progress"
   git push
   ```
5. **Append a one-line entry to your event log** (`hive/events/<your-handle>.log`): `<ISO timestamp> HV-XXX in-progress <your-handle>`. Create the directory and file on first write if needed (`mkdir -p hive/events`). Other bots see it via the merged view.
6. **If the ticket touches source code** (anything outside `hive/`), create a feature branch immediately for the source-code work:
   ```
   git checkout -b hv-XXX-<slug>
   ```
   The ticket's lifecycle (claim → in-progress → in-review → done) commits stay on `main`. The actual code changes live on the branch and merge via PR + CI. See "Working in parallel" above.
7. If the push fails with a conflict, do not show raw git output. Instead say:

```
⚠️  HV-XXX was just picked up by someone else.

Remaining backlog:
  HV-005 — Fix pagination bug
  HV-007 — Add export feature

Want to pick one of these instead?
```

---

## While working

- Work silently and efficiently — you are the PM, not a narrator
- Ask only when a gap is real, and ask with 2–3 proposed answers, never open-ended
- Do not narrate every step
- If the work drifts outside the ticket's scope, stop and propose a new ticket for the drift — do not silently absorb it

---

## Blocking a ticket

When a ticket cannot proceed, move it to `hive/blocked/` and set both the `**Blocked by**` field (which HV-IDs are preventing progress) and the `**Failure mode**` field (the *category* of blocker). Both are **required** for tickets in the blocked folder — a blocked ticket with no explanation of what's blocking it is just an orphan.

`**Failure mode**` allowed values:

- **`failed-tests`** — code or build is failing; another bot can rerun once the cause is fixed.
- **`merge-conflict`** — git state needs human or bot resolution before work continues.
- **`context-exceeded`** — current bot ran out of context; another bot can pick up.
- **`unmet-dep`** — depends on another ticket that isn't `done/` yet.
- **`needs-human`** — design decision, ambiguity, or scope question only the user can answer.

Steps:

1. Update the file: set status to `blocked`, set `**Blocked by**: HV-XXX[, HV-YYY]`, set `**Failure mode**: <one of the values above>`
2. Move the file from its current folder to `hive/blocked/`
3. Run:
   ```
   git add hive/
   git commit -m "HV-XXX: blocked"
   git push
   ```

When the blocker is resolved, move the ticket back to `in-progress/` (or `backlog/` if work has not started), clear both the `Blocked by` and `Failure mode` fields, and commit.

---

## Rejecting a ticket

When the user says "reject HV-XXX", "not doing HV-XXX", or "kill HV-XXX":

1. Ask: "Why is this being rejected? (type n/a to skip)"
2. Wait for the answer
3. Move the ticket file to `hive/not-doing/`
4. Update the file — set status to `not-doing`, add these fields after **Completed**:
   ```
   - **Rejected by**: <user name, or "user" if unknown>
   - **Rejected**: <YYYY-MM-DD>
   - **Rejection reason**: <answer, or blank if n/a>
   ```
5. Run:
   ```
   git add hive/
   git commit -m "HV-XXX: not doing"
   git push
   ```
6. Confirm: "HV-XXX marked as not doing."

Tickets in `not-doing/` are **never shown at session start** — they are dead. They are visible on the board only when the user clicks "Show not-doing".

Works from any folder: `backlog/`, `in-progress/`, or `blocked/`.

---

## Consolidating tickets

When two (or more) existing tickets cover the same work and should be merged:

1. **Create a new ticket** with the consolidated scope. Do **not** edit one of the originals to absorb the other — the audit trail matters.
2. **In the new ticket's Notes**, write a `Consolidation:` line listing the source tickets — e.g. `Consolidation of HV-012 and HV-024`. Bots reading the new ticket use this line to find the source context (read the originals in `not-doing/` for the historical Why/Notes).
3. **Move each source ticket to `hive/not-doing/`** with `**Rejection reason**: consolidated into HV-XXX` (substitute the new ticket's ID).
4. The new ticket inherits the union of `Related` / `Blocks` / `Blocked by` from the originals — keep the "write only one side of each edge" rule. De-dupe.
5. Commit + push:
   ```
   git add hive/
   git commit -m "HV-XXX: consolidates HV-A and HV-B"
   git push
   ```

Why a new ticket rather than picking one of the originals? Two reasons: it surfaces in the backlog as fresh work (priority + effort get re-evaluated by the PM), and the consolidation marker is the only place a bot can tell that the merger happened.

---

## When work is complete

> **`User-facing: yes`?** Skip this section and go to [Acceptance loop](#acceptance-loop) below — user-facing tickets pause in `in-review/` for a tester pass before they reach `done/`.

1. Tell the user what was done in plain language
2. Move the ticket file from `hive/in-progress/` to `hive/done/`
3. Update the file — set status to `done`, add completion date, set `**Verification**` (default `bot-claimed`; use `tests-passed` if you ran the tests yourself and they passed), add notes about decisions made or issues encountered
4. Run:
   ```
   git add hive/
   git commit -m "HV-XXX: done"
   git push
   ```

`**Verification**` allowed values:

- **`bot-claimed`** — the bot says it's done. Default when no further verification has happened. Lowest trust level.
- **`tests-passed`** — bot ran the tests and they passed. Higher trust than `bot-claimed`.
- **`bot-reviewed`** — a *separate* bot reviewed the work and signed off. Higher again.
- **`human-reviewed`** — a human eyeballed the diff and approved. Highest trust.

The field is orthogonal to status: status describes workflow stage; verification describes trust level on the contents of a done ticket. Bots producing the work on `User-facing: no` tickets self-set `bot-claimed` or `tests-passed`. The `bot-reviewed` and `human-reviewed` values are produced exclusively by the acceptance loop below — a dev bot must not self-set them on `User-facing: yes` work.

---

## Acceptance loop

Tickets with `**User-facing**: yes` route through `in-review/` between `in-progress/` and `done/`. A *separate* tester (human or bot — never the bot that built the ticket) reads the dev bot's `## How to test` instructions, executes them, and either approves (→ `done/`) or rejects (→ `in-progress/`).

Bot-tester entry point: the `acceptance-tester` skill (installed at `~/.claude/skills/acceptance-tester/`; source in this repo at `skills/acceptance-tester/SKILL.md`) walks a bot through the steps below, including the tester ≠ dev bot identity check. Humans testing manually follow the same steps without the skill.

### Handoff (dev bot, end of work)

1. Populate `## How to test` with concrete reproducible steps a tester can execute (URLs, commands, click-paths, expected observations)
2. Move the ticket file from `hive/in-progress/` to `hive/in-review/`
3. Update the file — set status to `in-review`. Leave `Verification` and `Completed` blank.
4. Run:
   ```
   git add hive/
   git commit -m "HV-XXX: in-review"
   git push
   ```
   Commit body must include `Trigger: HV-XXX in-review`.

### Acceptance (tester, ≠ dev bot)

1. Pick a ticket from `in-review/`. Refuse if you authored the dev work (commit author identity matches the latest `Trigger:` line)
2. Read `## How to test`. Execute the steps.
3. If the result matches expectations, move the file from `in-review/` to `done/`. Set `Status: done`, `Completed: <date>`, `Verification: human-reviewed` (you're a human) or `bot-reviewed` (you're a bot). Append any tester notes to `## Notes`.
4. Run:
   ```
   git add hive/
   git commit -m "HV-XXX: accepted"
   git push
   ```
   Commit body must include `Trigger: HV-XXX accepted`.

### Rejection (tester, ≠ dev bot)

1. Move the file from `in-review/` back to `in-progress/`. Set `Status: in-progress`.
2. Populate `**Rejected by**: <your name>`, `**Rejected**: <YYYY-MM-DD>`, `**Rejection reason**: <one-line summary of what failed>`.
3. Run:
   ```
   git add hive/
   git commit -m "HV-XXX: rejected — <reason>"
   git push
   ```
   Commit body must include `Trigger: HV-XXX rejected`.

The dev bot picks the ticket back up from `in-progress/`, fixes the rejection, and goes back to handoff.

`User-facing: no` tickets are unaffected by this section — they go in-progress → done as documented in "When work is complete" above.

---

## Ticket file naming

Ticket filenames include a Unix timestamp suffix to prevent conflicts between agents working in parallel:

```
HV-004-1736847392.md
```

- The timestamp is generated at creation time: `date +%s` (shell) or `Math.floor(Date.now()/1000)` (JS)
- The display ID inside the file and on the board is always clean: `# [HV-004] Title`
- The timestamp is only in the filename — never shown to users

---

## Ticket file format

```markdown
# [HV-XXX] Title

- **Status**: open | in-progress | in-review | done | blocked | not-doing
- **Priority**: Low | Medium | High | Critical
- **Effort**: XS | S | M | L | XL
- **Feature set**: feature-set-XXX-<slug> (or blank for standalone)
- **Related**: HV-XXX, HV-YYY (comma-separated, or blank)
- **Blocks**: HV-XXX, HV-YYY (comma-separated, or blank)
- **Blocked by**: HV-XXX, HV-YYY (comma-separated, or blank)
- **Split from**: HV-XXX, HV-YYY (comma-separated, or blank — set when this ticket was decomposed from another)
- **Assigned to**: <name or blank>
- **Started**: <YYYY-MM-DD HH:MM or blank>
- **Completed**: <YYYY-MM-DD or blank>
- **Verification**: <bot-claimed | tests-passed | bot-reviewed | human-reviewed> (set on `done/` tickets; blank otherwise)
- **Failure mode**: <failed-tests | merge-conflict | context-exceeded | unmet-dep | needs-human> (required when ticket is in `blocked/`, blank otherwise)
- **User-facing**: yes | no (default `no`; set `yes` when the ticket changes something a user sees or interacts with — UI, copy, a flow, observable behaviour. Triggers the acceptance loop.)
- **Rejected by**: <name or blank>
- **Rejected**: <YYYY-MM-DD or blank>
- **Rejection reason**: <reason or blank>

## Goal
One sentence. The problem being solved, not the implementation.

## Why
User or business value. Why this is worth building now instead of later or never.

## Done when
Acceptance criteria. Concrete, testable, unambiguous.
- criterion 1
- criterion 2

## Desired output
What the user, developer, or downstream system experiences once this is shipped. The observable result — not the implementation path.

## Success signals
How we'll know it worked. Metrics, behaviors, or observations that confirm the feature is doing its job.
- signal 1
- signal 2

## Failure signals
What to watch for after ship. Warning signs that the feature is misbehaving, regressing, or causing side effects somewhere unexpected. The developer should wire monitoring or manual checks for these.
- what breaks and how we'd notice
- edge case or side effect to watch

## Tests
Unit tests, integration tests, or manual QA the developer should produce before marking done. Be specific — name the cases, not the test framework.
- test case 1
- test case 2

## How to test
Reproducible steps a tester (human or bot) executes when the ticket sits in `in-review/`. Required when `User-facing: yes`, optional otherwise. Free-form: URLs, commands, click-paths, expected observations.
- step 1
- expected result

## Notes
Decisions made, alternatives considered and rejected (with reasons), gotchas, out-of-scope items pushed to other tickets.
```

**Backward compatibility**: the parser tolerates legacy tickets without `## Desired output`, `## Success signals`, `## Failure signals`, `## Tests`, `**Feature set**`, the relationship fields, `**Verification**`, or `**Failure mode**` — they still render. Validation (today: hand-rolled in `src/lib/parse.ts` plus the Vitest constraint tests in `src/db/schema.test.ts`) is stricter for new fields though: tickets in `done/` should carry `**Verification**`; tickets in `blocked/` should carry `**Failure mode**`.

---

## Relationship fields

Four optional fields express how tickets relate to each other:

- **Related**: loose "see also" link. No scheduling implication.
- **Blocks**: this ticket prevents the listed tickets from starting or completing.
- **Blocked by**: this ticket cannot start or complete until the listed tickets are done.
- **Split from**: this ticket was decomposed from the listed parent(s) — preserves lineage when a bot or PM splits one ticket into many. Pure provenance; no scheduling implication.

Values are comma-separated `HV-XXX` IDs. Whitespace is tolerated. Entries that don't match `HV-\d+` are ignored silently.

**Write only one side of each edge.** If HV-005 declares `Blocks: HV-006`, do not also add `Blocked by: HV-005` on HV-006 — the renderer infers the inverse and shows it on the counterpart card automatically. Writing both sides creates maintenance drift.

Convention: prefer the upstream side. Use `Blocks` on the ticket that must finish first, rather than `Blocked by` on the ticket that is waiting.

---

## Ticket ID format

Read all files across all folders in `hive/` including `not-doing/`. Find the highest existing HV-XXX number and increment by 1. Start at HV-001 if no tickets exist.

---

## Rules

- Always `git pull` before reading the backlog
- Always `git push` after moving a ticket
- Never show raw git output or conflict markers to the user — translate everything into plain English
- Every piece of work gets a ticket — no exceptions
- Every ticket gets a feature set — either an existing one or a newly proposed one
- Notes should capture decisions, alternatives, and out-of-scope items — not a list of files changed
- Keep ticket files human-readable — they may be exported to Jira or Trello later
- **Draft first, ask second.** Read context, draft the full ticket, then show the user. Do not interrogate.
- **Brief AND thorough.** Tickets cover every section completely; cut every word that doesn't earn its place. Bullet fragments over full sentences. If a section has nothing material, cut it — don't pad it. Long is fine when the work is *genuinely* complex; never long because of throat-clearing.
- **Three brevity laws (enforced):** (1) every sentence must add information not already given; (2) no sentence may repeat or paraphrase an earlier one; (3) no filler — strike "in order to", "the ability to", "make sure that", "we need to", "this ticket will", "as part of this work". Cut, then check both rules again before submitting.
- **Say no clearly.** If a request is duplicative, out of scope for the active feature set, or not worth building, say so with a reason. Vague yeses create waste.
- **Scope discipline.** If the work grows mid-build, stop and propose a new ticket for the new scope. Do not silently absorb it.
- **No secrets in tickets.** Tickets must never contain credentials, API keys, passwords, tokens, PII, or internal connection strings. Tickets are committed to the repo and (on public repos) world-readable. Reference secrets abstractly — "the production DB password (vault path: `<abstract>`)" — not the value itself. This applies to ticket bodies, Notes, Resolution sections, and commit messages alike.

---

## Feature set rules

A feature set is a coherent collection of tickets grouped under a common goal or milestone. It is not a time box — it's done when all its tickets are done.

- Feature set files live in `hive/feature-sets/` (named `feature-set-XXX-<slug>.md`)
- Every new ticket gets a feature set assignment at creation time. The PM skill is responsible for deciding:
  1. Does this ticket belong to an existing feature set? → reference it
  2. If not, propose a new feature set (one-sentence rationale + slug) and scaffold the file
- The user may override the assignment at draft-review time
- Use the next available feature set number
- A feature set file contains: goal, the list of tickets that belong to it, and a one-paragraph rationale

**Feature set file format:**

```markdown
# [feature-set-XXX] Title

## Goal
One sentence on what this feature set delivers when complete.

## Rationale
Why these tickets belong together. What ties them into a coherent unit of work.

## Tickets
- HV-XXX — short title
- HV-YYY — short title

## Status
In progress | Complete | Paused
```

---

## How the live board renders

Bot Hive's own kanban (the one you're reading at `/projects/[id]`) is rendered by the Next.js app in `src/app/projects/[id]/`. The flow:

1. A push to this repo fires a GitHub webhook.
2. `src/app/api/github/webhook/route.ts` verifies the HMAC, dispatches push events to `src/lib/webhook.ts`.
3. `src/lib/sync.ts` re-reads `hive/` via the GitHub Trees + Blobs APIs, parses every ticket via `src/lib/parse.ts`, and upserts into the Postgres `tickets`/`features` tables in one transaction.
4. After the DB write, `src/lib/broadcast.ts` fires a `project-changed` event.
5. Open `<Board>` clients subscribed via SSE (`src/app/api/projects/[id]/stream/route.ts`) refetch and re-render.

There is no static `board.html` and no `build.sh` rebuild step — the board is the live React component reading the live DB. The latency budget from `git push` to "card moved on the open tab" is ~5–10 seconds, dominated by GitHub's webhook delivery time.
