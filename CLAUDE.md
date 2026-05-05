# Bot Hive — project rules for Claude sessions

This file is read by every Claude session that opens the bot-hive repo. It encodes the rules specific to *this* project — how we develop bot-hive, not how users use bot-hive in their own repos. Format-neutral guidance for the hive workflow itself lives in `hive/HIVE.md`.

---

## Identity (read first)

Every bot session in this repo has a unique handle.

**On session start:**

```
git config --get bot-hive.handle
```

**If empty, auto-pick from this list and save it:**

```
buzz, scout, forager, drone, comb, pollen, nectar, waggle,
sparrow, finch, robin, wren, fox, otter, badger, mole,
squirrel, hare, sentinel, pilot, ranger, watcher, kestrel,
falcon, tern, jay
```

Pick randomly, then `git config bot-hive.handle <name>`, then announce "I'm <name>" to the user. The handle persists across sessions on this machine.

The user can override anytime: `git config bot-hive.handle billy` — explicit choices win.

The handle appears in:
- `Assigned to:` ticket field
- `Bot:` commit trailer (alongside `Model:` and `Trigger:`)
- The live board UI as a colored badge on each ticket card

Full convention: see `hive/HIVE.md` "Bot identity" section.

---

## Where work goes

The repo splits commits into two lanes:

| Kind of work | Where |
|---|---|
| Coordination metadata: `hive/` ticket files, `hive/HIVE.md`, `hive/focus.md`, `hive/events.log`, `hive/questions-for-human.md`, this `CLAUDE.md`, the `README.md` | Direct to `main`. Tiny atomic commits, ordered by the git push lock. |
| Source code: anything in `src/`, `tests/`, `migrations/`, configs, `package.json`, `.github/` | Feature branch named `hv-XXX-<slug>`, opened as a PR, merged after CI passes. |

The reason for the split: source code can collide between bots (same file, different changes), and CI gates the merge. Coordination metadata is small, atomic, and the push lock handles ordering.

When branch protection lands (HV-033), this split is enforced by GitHub. Until then, follow it by convention.

---

## Working in parallel — the swarm protocol

Multiple bots (CC1, CC2, future CC3) and humans work this repo at once. Coordination is **not** centralized — there's no coordinator service. Each agent reads the shared environment (the git tree) and follows local rules. Coordination emerges.

### On every session start

1. `git pull` (subscribe).
2. Read `hive/focus.md` — that's the standing order. (Empty / missing = "anything in backlog.")
3. Tail the last ~50 lines of `hive/events.log` to see what other bots have done recently.
4. If `git config --get bot-hive.handle` is empty, auto-pick one (per the Identity section) and announce it.

### When the human says "do FS-X" or "work on HV-X"

The bot they're chatting with **also writes that to `hive/focus.md`** so the other bot picks up the same intent on its next session start. The chat message is a hint; `focus.md` is the source of truth across bots.

### Picking what to claim

DAG-walk with cohesion preference:

1. Read `focus.md`.
2. Collect tickets in scope (named FS, named ticket, or all of `backlog/`).
3. Filter out: in-progress, blocked, anything with unfinished `Blocked by:`.
4. From the available leaves, pick the one that **unblocks the most downstream tickets**. Tie-break: lowest ticket ID.
5. Claim it.

This is deterministic enough that two bots usually pick different leaves. If they collide, the git push lock breaks the tie — loser pulls and re-runs.

### Publishing events

After every meaningful state transition (claim, in-review, accepted, rejected, blocked, reclaim), append a one-line entry to `hive/events.log`:

```
2026-05-05T15:42:00Z HV-031 done HV-032,HV-033 unblocked nectar
```

Format: `<ISO timestamp> <ticket-id> <action> [<unblocked-list>] <bot-handle>`. The unblocked-list is comma-separated ticket IDs that just became available (Blocked-by completed). Other bots tail this on session start to catch handoffs without re-walking the DAG.

### Stale claims

Every commit a bot makes against an in-progress ticket also updates the ticket's `**Last touched:**` field with the current ISO timestamp. If a bot looks at an in-progress ticket and `Last touched:` is older than **2 hours**, the ticket is stale — that bot may reclaim it (move back to `backlog/` with a `Reclaim reason:`) or take it over (update `Assigned to:`, refresh `Last touched:`). Append the reclaim to `events.log`.

### When you need to ask the human

Append to `hive/questions-for-human.md` rather than blocking on chat. Format: dated heading + question. The human reads on their cadence.

```markdown
## 2026-05-05T15:30 (nectar) — HV-031

Should the events.log live at hive/events.log or hive/feature-sets/events.log?
```

### Conflict response

| Failure | Action |
|---|---|
| Push to main rejected | `git pull --rebase`, retry. |
| `git rebase main` clean | `git push --force-with-lease`, let CI re-run. |
| `git rebase main` real conflict markers | **Stop. Don't guess.** Move ticket to `blocked/`, `Failure mode: merge-conflict`, comment PR, append to `events.log`, surface to human. |
| CI fails on PR | Fix and push. **Two attempts max.** Then `blocked/` with `Failure mode: failed-tests`. |
| Stale claim (`Last touched:` > 2h) | Reclaim per the rule above. |
| ID collision (two bots picked same `HV-N`) | Loser-by-push-time renumbers. The one whose work is shipped or further-along keeps the ID. |

The hard rule across all failures: **bots auto-resolve trivial git mechanics, but escalate substantive conflicts to humans.** Bots NEVER attempt to merge or guess code resolution.

---

## Always pull before claiming or committing to main

Stale local main = guaranteed push conflict + collision risk. The `git pull` is the subscribe step in our pub/sub model — it's how you find out what other bots have done.

If a push is rejected non-fast-forward, do NOT show raw git output. `git pull --rebase`, retry once. If it conflicts on rebase, see the conflict-response policy in `hive/HIVE.md`.

---

## Conflict response

| Failure | Action |
|---|---|
| Push to main rejected (non-fast-forward) | `git pull --rebase` and retry. |
| Branch rebase against main produces no conflict markers | `git push --force-with-lease`, let CI re-run. |
| Branch rebase produces real conflict markers | **Stop. Never guess code merges.** Move ticket to `hive/blocked/`, set `Failure mode: merge-conflict`, comment the PR, surface to the user. |
| CI fails on PR | Read CI output, attempt fix, push fix, wait. Two attempts max — then `Failure mode: failed-tests`. |
| In-progress ticket with `Last touched:` older than 2 hours (when convention lands) | May reclaim — move back to backlog with `**Reclaim reason:**`. |

The hard rule: **bots auto-resolve trivial git mechanics, but escalate substantive conflicts to humans.**

---

## Local dev

- Postgres 16 native on port 5432 (no Docker — see global rules).
- `npm run dev` starts the Next.js dev server.
- `npm run typecheck && npm run lint && npm run test` before any PR.
- Migrations: `npm run db:migrate` against local DB.
- See `README.md` for full setup.

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
- `hive/feature-sets/` — current feature sets and their goals.
- `tasks/lessons.md` — self-correction log. Read at session start; append after corrections.
- `README.md` — project overview, quickstart for humans.
