# Bot seat assignment

**Date:** 2026-05-12
**Replaces:** event-log role derivation in `scripts/whoami.{sh,ps1}`

## Why

Today's `whoami` scans `hive/events/*.log` for activity in the last 2h to derive role. A fresh bot has no events, so it announces as the solo bot — even when others are active (HV-129: buzz announced as `PM + coder + tester` while wren was active). The substrate is wrong.

## What changes

Bot identity, seat, and liveness move into Postgres. Tickets stay file-based.

## Schema

```sql
CREATE TABLE bots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colony            TEXT NOT NULL,
  handle            TEXT NOT NULL,
  seat              INTEGER NOT NULL CHECK (seat >= 1),
  joined_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','offline')),
  UNIQUE (colony, handle)
);

CREATE UNIQUE INDEX bots_active_seat_uniq
  ON bots (colony, seat) WHERE status = 'active';
```

Role is derived from seat via `hive/roles.md` (unchanged).

## Endpoints

All under `/api/bots/`. All writes use `SELECT … FOR UPDATE` on a per-colony lock row.

| Endpoint | Purpose |
|---|---|
| `POST /join` | Allocate lowest free seat. Returns `{seat, total, role, skill_files}`. Reactivates an offline row for the same `(colony, handle)`. |
| `GET /whoami?colony=X&handle=Y` | Return current seat + role. Always fresh from DB. |
| `POST /heartbeat` | Bump `last_heartbeat_at`. No-op for offline rows. |
| `POST /leave` | Mark offline, renumber survivors (`seat = seat - 1 WHERE seat > departing_seat`), publish `bot.left` SSE. |
| `GET /colony?colony=X` | Full seat map for the UI. |

A background job inside the Flask app runs every 60s: any active row with `last_heartbeat_at < now() - interval '15 minutes'` is reclaimed using the same `/leave` transaction.

## Bot lifecycle

### Boot (revised `hive/bot-startup.md`)
1. Kickoff fires (phrase or marker) — unchanged.
2. Ensure `.bot-hive-identity` exists — unchanged.
3. Call `POST /join`. Write `.bot-hive-role-cache`.
4. Launch background heartbeat process. Save PID to `.bot-hive-heartbeat.pid`.
5. Read returned skill files.
6. Announce: `I'm <colony>.<handle>, seat <n> of <total>, role: <role>, ready.`

### Heartbeat
Background process started at boot. Pings `/heartbeat` every 5 min. Tied to the terminal — closing the window stops the pings. Server reclaims after 15 min.

### Role-change announce
A `UserPromptSubmit` hook (`scripts/check-role.{sh,ps1}`) runs each turn:
1. Call `/whoami`.
2. If seat or role differs from `.bot-hive-role-cache`, inject a prompt: *"Role changed: seat N, role X. Announce to the operator before continuing."*
3. Update cache.

If the hook isn't registered, every seat-aware script (`my-work.sh`, `claim.sh`) does the same check on invocation.

### Sign-off (new `hive/bot-shutdown.md`)
Trigger phrases (added to `AGENTS.md`): `stop your hive work` (canonical), `sign off`, `leave the hive`.

1. Stop the background heartbeat.
2. `POST /leave`.
3. On 200: delete `.bot-hive-role-cache` and `.bot-hive-heartbeat.pid`.
4. Print: `Signed off. Safe to close this window.`

If `/leave` fails, do **not** print the safe-to-close line. Surface the error.

## Files to change

| File | Change |
|---|---|
| `scripts/whoami.{sh,ps1}` | Replace event-log scan with `/whoami` call. Keep output format. |
| `scripts/check-role.{sh,ps1}` | New. Hook script. |
| `scripts/heartbeat.{sh,ps1}` | New. Background loop. |
| `hive/bot-startup.md` | Add `/join` + heartbeat launch + updated announce. |
| `hive/bot-shutdown.md` | New. |
| `hive/seats.md` | New. How-it-works for operators + bots. |
| `AGENTS.md` | Add sign-off phrase list. |
| `hive/HIVE.md` | Narrow out-of-scope text (see below). |
| Flask app | Migration, 5 endpoints, reclaim job, SSE event. |
| Kanban UI | Live seat strip per colony, `bot.left` subscriber. |
| `.gitignore` | Add `.bot-hive-role-cache`, `.bot-hive-heartbeat.pid`. |

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

- **Concurrent join/leave** — serialized by the per-colony `FOR UPDATE` lock.
- **Heartbeat for an offline row** — no-op. Only `/join` reactivates.
- **Sign-off phrase in the ops terminal** (no identity file) — bot says: *"I'm in the ops terminal, not a bot — nothing to sign off."*
- **Reactivated bot** — keeps its handle, gets a new lowest-free seat. Next hook fire announces the new role.

## Migration

Hard cutover. Ship migration + endpoints + revised scripts together. Existing bots' next bootstrap calls `/join` and registers fresh.
