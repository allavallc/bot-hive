# Bot seat assignment

**Date:** 2026-05-12
**Replaces:** event-log role derivation in `scripts/whoami.{sh,ps1}`
**Stack reference:** `docs/architecture.md`

## Why

Today's `whoami` scans `hive/events/*.log` for activity in the last 2h to derive role. A fresh bot has no events, so it announces as the solo bot — even when others are active (HV-129: buzz announced as `PM + coder + tester` while wren was active). The substrate is wrong.

## What changes

Bot identity, seat, and liveness move into the platform Postgres. Tickets stay file-based.

## Schema

```sql
CREATE TABLE IF NOT EXISTS "bots" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id"          uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "colony"              text NOT NULL,
  "handle"              text NOT NULL,
  "seat"                integer NOT NULL CHECK ("seat" >= 1),
  "joined_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "last_heartbeat_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "status"              text NOT NULL DEFAULT 'active'
                        CHECK ("status" IN ('active','offline')),
  CONSTRAINT "bots_project_colony_handle_unique" UNIQUE ("project_id","colony","handle")
);

CREATE UNIQUE INDEX "bots_project_colony_active_seat_uniq"
  ON "bots" ("project_id","colony","seat")
  WHERE "status" = 'active';
```

**Project scoping rationale.** `colony_settings` is already keyed by `(project_id, colony)` (schema.ts:235–251) — the same human can run different bots in different projects. The seat sheet follows the same scope. Each `(project_id, colony)` pair has its own independent seat 1, 2, 3, ….

**Role is derived** from seat via `hive/roles.md` (unchanged). The server parses that markdown table at startup and caches it; the markdown stays the canonical source for humans.

## Endpoints

All endpoints are Next.js Route Handlers at `src/app/api/bots/<segment>/route.ts`. All writes happen inside `db.transaction(async (tx) => …)` and acquire a per-(project, colony) advisory lock at the top of the transaction:

```ts
await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${projectId} || ':' || ${colony}))`);
```

The lock is automatically released at transaction end.

| Endpoint | Purpose |
|---|---|
| `POST /api/bots/join` | Body: `{repo_full_name, colony, handle}`. Server resolves `projects.id` via `githubRepo` lookup, allocates lowest free seat. Returns `{seat, total, role, skill_files}`. Reactivates an offline row for the same `(project_id, colony, handle)`. |
| `GET /api/bots/whoami?repo_full_name=…&colony=…&handle=…` | Returns current seat + role. Always fresh from DB. |
| `POST /api/bots/heartbeat` | Body: `{repo_full_name, colony, handle}`. Bumps `last_heartbeat_at`. No-op for offline rows. |
| `POST /api/bots/leave` | Body: `{repo_full_name, colony, handle}`. Marks offline, renumbers survivors, publishes `bot-left` via `src/lib/broadcast.ts`. |
| `GET /api/bots/colony?repo_full_name=…` | Full seat map across all colonies on this project. |

**Auth (v1).** None. Endpoints accept any caller. Documented as a known limitation; follow-up ticket adds Bearer-token auth per project. Spoofed `/join` calls can only pollute one project's seat strip — bounded blast radius, easy to clean up.

**Sweep-on-request reclaim.** No external cron. Each `GET /whoami`, `GET /colony`, and `POST /join` runs (inside the same advisory lock for the affected colony):

```sql
WITH stale AS (
  SELECT id, seat FROM bots
  WHERE project_id = $1 AND colony = $2
    AND status = 'active'
    AND last_heartbeat_at < now() - interval '15 minutes'
)
-- mark each stale row offline; for each one, renumber survivors.
```

Survivors who never call any seat endpoint stay un-reclaimed — fine, no consumer needs the answer. The cost of reclaim is paid by the next consumer, never by a background process.

Optional follow-up: add `POST /api/bots/reclaim/cron` Bearer-protected endpoint (same pattern as `src/app/api/health/cron/route.ts`) for proactive sweep if we ever want it. Not in this design.

## SSE event

`src/lib/broadcast.ts` defines a typed `BroadcastEvent` union. Extend with:

```ts
| { type: "bot-left"; projectId: string; colony: string; departed: { handle: string; seat: number }; seatMap: SeatMapEntry[] }
| { type: "bot-joined"; projectId: string; colony: string; joined: { handle: string; seat: number }; seatMap: SeatMapEntry[] }
```

The `/api/bots/leave` route calls `broadcast({ type: "bot-left", projectId, ... })`. The `/api/bots/join` route broadcasts `bot-joined` the same way. The kanban (per-project) subscribes via the existing `/api/projects/[id]/stream` SSE, which already uses `subscribe(projectId, fn)` from `src/lib/broadcast.ts`.

In-process pub/sub limitation (see architecture.md): events do not propagate across multiple server instances. Render Free is single-instance, so this is fine today.

## Bot lifecycle

### Boot (revised `hive/bot-startup.md`)
1. Kickoff fires (phrase or marker) — unchanged.
2. Ensure `.bot-hive-identity` exists — unchanged.
3. Determine repo full name: `git remote get-url origin` → parse to `owner/repo`. Or read it from `.bot-hive-identity` if Add-a-Bot wrote it there (extension allowed).
4. Call `POST /api/bots/join` with `{repo_full_name, colony, handle}`. Write `.bot-hive-role-cache` (single line: `seat=N;role=ROLE`).
5. Launch background heartbeat process. Save PID to `.bot-hive-heartbeat.pid`.
6. Read returned skill files end-to-end.
7. Announce: `I'm <colony>.<handle>, seat <n> of <total>, role: <role>, ready.`

### Heartbeat
Background process started at boot. Pings `POST /api/bots/heartbeat` every 5 min. Tied to the terminal — closing the window stops the pings. The next consumer of any seat endpoint reclaims rows older than 15 min during their request's sweep step.

### Role-change announce
A `UserPromptSubmit` hook (`scripts/check-role.{sh,ps1}`) runs each turn:
1. Call `GET /api/bots/whoami`.
2. If seat or role differs from `.bot-hive-role-cache`, inject a note: `[BOT-HIVE] Role changed: seat N, role X. Announce to the operator before continuing.`
3. Update cache.

If the hook isn't registered, every seat-aware script (`my-work.sh`, `claim.sh`) does the same check on invocation.

### Sign-off (new `hive/bot-shutdown.md`)
Trigger phrases (added to `AGENTS.md`): `stop your hive work` (canonical), `sign off`, `leave the hive`.

1. Stop the background heartbeat.
2. `POST /api/bots/leave`.
3. On 200: delete `.bot-hive-role-cache` and `.bot-hive-heartbeat.pid`.
4. Print: `Signed off. Safe to close this window.`

If `/leave` fails, do **not** print the safe-to-close line. Surface the error.

## Files to change

| File | Change |
|---|---|
| `src/db/schema.ts` | Add `bots` pgTable + partial unique index. |
| `drizzle/NNNN_<slug>.sql` | Generated migration (via `npm run db:generate`). |
| `src/app/api/bots/join/route.ts` | New. |
| `src/app/api/bots/whoami/route.ts` | New. |
| `src/app/api/bots/heartbeat/route.ts` | New. |
| `src/app/api/bots/leave/route.ts` | New. |
| `src/app/api/bots/colony/route.ts` | New. |
| `src/lib/seats.ts` | New. Seat allocation + renumber + sweep helpers. All take `DbHandle` so they're testable via the transactional fixture. |
| `src/lib/broadcast.ts` | Extend `BroadcastEvent` with `bot-left` and `bot-joined`. |
| `src/lib/roles.ts` | New. Parse `hive/roles.md` consolidation table at startup; export `roleForSeat(total, position)`. |
| `src/db/schema.test.ts` and new `*.test.ts` files | Vitest, using `import { test } from "@/lib/test-db"` for DB-backed tests. |
| `src/app/projects/[id]/seat-strip.client.tsx` | New. Subscribes to project SSE, renders the live seat strip. |
| `src/app/projects/[id]/page.tsx` (or board) | Mount the seat strip — placement TBD per UI-approval rule. |
| `scripts/whoami.{sh,ps1}` | Replace event-log scan with `GET /whoami`. |
| `scripts/check-role.{sh,ps1}` | New. |
| `scripts/heartbeat.{sh,ps1}` | New. |
| `hive/bot-startup.md` | Rewrite for `/join` + heartbeat launch. |
| `hive/bot-shutdown.md` | New. |
| `hive/seats.md` | New. How-it-works for operators + bots. |
| `AGENTS.md` | Add sign-off phrase list. |
| `hive/HIVE.md` | Narrow out-of-scope text (see below). |
| `.gitignore` | Add `.bot-hive-role-cache`, `.bot-hive-heartbeat.pid`. |
| `.claude/settings.json` | Wire `UserPromptSubmit` hook → `scripts/check-role`. |

## `hive/HIVE.md` revision

Replace this bullet:
> - **Lease / heartbeat daemon.** Stale claims are surfaced by inspecting `in-progress/` card metadata, not enforced by a process.

with:
> - **Lease / heartbeat daemon *for ticket work*.** Stale ticket claims are surfaced by inspecting card metadata. Bot identity and seat *do* use a heartbeat — see `hive/seats.md` — because lifecycle isn't part of the file-based ticket format.

Replace this bullet:
> - **A scheduler or work-request endpoint.** Bots browse tickets by reading the filesystem; no service hands work out.

with:
> - **A scheduler or work-request endpoint *for tickets*.** Bots browse tickets by reading the filesystem. The platform server *does* hand out seat assignments via `/api/bots/join` — that's identity, not ticket work.

## Edge cases

- **Concurrent join/leave** — serialized by `pg_advisory_xact_lock` keyed on `(project_id, colony)`.
- **Heartbeat for an offline row** — no-op. Only `/join` reactivates.
- **Sign-off phrase in the ops terminal** (no identity file) — bot says: *"I'm in the ops terminal, not a bot — nothing to sign off."*
- **Reactivated bot** — keeps `(project_id, colony, handle)` row, gets a new lowest-free seat. Next hook fire announces the new role.
- **Bot joins a project whose `projects.githubRepo` doesn't match an existing row** — 404. The operator has to register the project via the existing Add-a-Project flow first.
- **Multi-instance deploy** — `broadcast.ts` events stay in-process. Not a concern today; flag if we ever scale beyond Render Free.

## Migration

Hard cutover. Ship migration + endpoints + revised scripts together. Existing bots' next bootstrap calls `/join` and registers fresh.

## Known limitations (follow-up tickets)

- **Endpoint auth.** v1 ships unauthenticated. File a follow-up to add Bearer-token auth issued at Add-a-Bot time.
- **Proactive reclaim cron.** Lazy sweep-on-request only. If we want a background sweep (for dashboards showing exact "active bots" on idle colonies), file a follow-up adding `POST /api/bots/reclaim/cron`.
