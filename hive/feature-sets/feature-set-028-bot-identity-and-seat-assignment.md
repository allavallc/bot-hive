# [feature-set-028] Bot identity and seat assignment

**Status**: active
**Owner**:

## Goal

Move bot identity, seat allocation, and liveness signaling out of `hive/events/*.log` file scans and into the platform Postgres so a fresh bot's role is correct on boot, surviving bots learn shifted seats automatically, and the operator can sign a bot off cleanly.

## Rationale

The current `scripts/whoami.{sh,ps1}` derives role by scanning each bot's event log for activity in the last 2 hours and ordering by first-seen timestamp. Two failure modes have shown up in production:

1. **First-bootstrap blindness.** A freshly spawned bot has no events yet, so the scan returns `total=1, position=1`. HV-129: buzz announced as `PM + coder + tester` (the 1-bot consolidation) while wren was already active in the same colony. Every bot that joins thinks it is the only bot.
2. **Idle invisibility.** A bot quiet for >2h disappears from the count, silently mis-shifting every survivor's seat.

The substrate — event logs as a liveness proxy — is the problem. This FS replaces it with a DB-backed seat table keyed by `(project_id, colony, handle)` (matching the existing `colony_settings` scoping at `src/db/schema.ts:235–251`), a heartbeat process tied to the terminal session, server-side renumbering when a bot leaves, and a user-prompt hook that detects role changes between turns and prompts the bot to announce.

Design spec: `docs/2026-05-12-bot-seat-assignment-design.md`. Stack reference: `docs/architecture.md`.

## Tickets

- **HV-130** — `bots` table (Drizzle) + `POST /api/bots/join` + `GET /api/bots/whoami` + per-(project,colony) advisory lock
- **HV-131** — `POST /api/bots/heartbeat` + `POST /api/bots/leave` + sweep-on-request reclaim + `bot-left` / `bot-joined` BroadcastEvent
- **HV-132** — `GET /api/bots/colony` + per-project kanban seat strip subscribed via existing `/api/projects/[id]/stream` SSE
- **HV-133** — Rewrite `scripts/whoami.{sh,ps1}`; add `scripts/check-role.{sh,ps1}` and `scripts/heartbeat.{sh,ps1}`
- **HV-134** — Rewrite `hive/bot-startup.md`; new `hive/bot-shutdown.md`; new `hive/seats.md`; sign-off phrases in `AGENTS.md`; narrow `hive/HIVE.md` out-of-scope text; `.gitignore` updates
- **HV-135** — Claude Code `UserPromptSubmit` hook wiring `scripts/check-role`; setup docs for Codex / Cursor / Aider / Gemini equivalents

## Status

Active

## Notes

Ticket flow is sequential on the critical path: 130 → 131 → 133 → 134 / 135. UI ticket 132 runs in parallel with 133 once 131 lands. Hard cutover at the end of HV-133 — no dual-write phase with the old event-log scan.

Out of scope for this FS:
- Commit attribution per bot (that's FS-004).
- Endpoint auth — v1 ships open; follow-up ticket adds Bearer-token auth issued at Add-a-Bot time. Bounded blast radius: an unauthenticated attacker can pollute one project's seat strip; can't read other data.
- Replacing the event-log substrate for ticket lifecycle events (claim/in-review/done/accepted) — those stay file-based; only the identity/role read path moves.
- Multi-instance broadcast. `src/lib/broadcast.ts` is in-process; events don't propagate across server replicas. Render Free is single-instance today.

## Architecture & decisions

### 2026-05-12 — Collapse seat machinery to a single SSE stream (allavallc.wren)

**Choice:** Replace `/join`, `/leave`, `/heartbeat`, `/whoami` and the heartbeat process with one long-lived SSE stream per bot. The open TCP socket is the liveness signal; `onClose` (with a 15 s grace window) drives renumber + role re-derive + push. See HV-136.

**Rejected:**
- *Keep heartbeats, fix the silent `Start-Job` failure.* Doesn't address B1 (seat clobber on `/join`) or B3 (three sources of truth for role). Treats symptoms.
- *Keep four endpoints, add per-endpoint reconciliation.* More code paths, more authorities that can drift. Opposite direction from the fix.
- *Bot picks its own role at spawn; server stores verbatim, no derivation.* Loses the consolidation table behavior the operator explicitly wants (1 bot = PM+coder+tester, etc., auto-rebalanced on add/remove).

**Why:** Three bugs surfaced on first multi-bot use (2026-05-12) — B1 seat clobber, B2 silent heartbeat failure, B3 role-source contradiction. Root cause is structural: liveness and role authority split across DB row + heartbeat timestamp + local PID file + local role override + role table. Collapse the authority surface to one stream and the drift cases disappear. Cost: a `connection_id` column plus a 15 s grace period. Benefit: 4 endpoints + 3 scripts + 2 local-state files deleted, ~250 LOC net.

**Implications:**
- `bots.status` and `bots.lastHeartbeatAt` columns disappear (migration).
- `.bot-hive-identity role=` is no longer honored; spawn flow stops writing it.
- `UserPromptSubmit` hook reads `.bot-hive-role-notice` written by the stream listener instead of polling `/whoami`.
- Removing a middle bot will flip surviving bots' roles (seat 3 becomes seat 2 → different role from the table). Operator-visible but correct.
- Doc rewrite (`hive/seats.md`, `hive/bot-startup.md`, `hive/bot-shutdown.md`, `AGENTS.md`, memory) is explicitly deferred and tracked as a follow-up.

**Reference:** HV-136.
