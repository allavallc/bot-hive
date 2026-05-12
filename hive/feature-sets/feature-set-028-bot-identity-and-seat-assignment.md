# [feature-set-028] Bot identity and seat assignment

**Status**: active
**Owner**:

## Goal

Move bot identity, seat allocation, and liveness signaling out of `hive/events/*.log` files and into the platform Postgres so a fresh bot's role is correct on boot, surviving bots learn shifted seats automatically, and the operator can sign a bot off cleanly.

## Rationale

The current `scripts/whoami.{sh,ps1}` derives role by scanning each bot's event log for activity in the last 2 hours and ordering by first-seen timestamp. Two failure modes have shown up in production:

1. **First-bootstrap blindness.** A freshly spawned bot has no events yet, so the scan returns `total=1, position=1`. HV-129: buzz announced as `PM + coder + tester` (the 1-bot consolidation) while wren was already active in the same colony. Every bot that joins thinks it is the only bot.
2. **Idle invisibility.** A bot quiet for >2h disappears from the count, silently mis-shifting every survivor's seat.

The substrate — event logs as a liveness proxy — is the problem. This FS replaces it with a DB-backed seat table, a heartbeat process tied to the terminal session, server-side renumbering when a bot leaves, and a user-prompt hook that detects role changes between turns and prompts the bot to announce.

Design spec: `docs/2026-05-12-bot-seat-assignment-design.md`.

## Tickets

- **HV-130** — `bots` table + `POST /api/bots/join` + `GET /api/bots/whoami` + per-colony transaction lock
- **HV-131** — `POST /api/bots/heartbeat` + `POST /api/bots/leave` + reclaim job + `bot.left` SSE event
- **HV-132** — `GET /api/bots/colony` + kanban seat strip UI subscribed to `bot.left`
- **HV-133** — Rewrite `scripts/whoami.{sh,ps1}`; add `scripts/check-role.{sh,ps1}` and `scripts/heartbeat.{sh,ps1}`
- **HV-134** — Rewrite `hive/bot-startup.md`; new `hive/bot-shutdown.md`; new `hive/seats.md`; sign-off phrases in `AGENTS.md`; narrow `hive/HIVE.md` out-of-scope text; `.gitignore` updates
- **HV-135** — Claude Code `UserPromptSubmit` hook wiring `scripts/check-role`; setup docs for Codex / Cursor / Aider / Gemini equivalents

## Status

Active

## Notes

Ticket flow is sequential on the critical path: 130 → 131 → 133 → 134 / 135. UI ticket 132 runs in parallel with 133 once 131 lands. Hard cutover at the end of HV-133 — no dual-write phase with the old event-log scan.

Out of scope for this FS:
- Commit attribution per bot (that's FS-004).
- Multi-colony coordination (tickets and identity remain colony-scoped).
- Replacing the event-log substrate for ticket lifecycle events (claim/in-review/done/accepted) — those stay file-based; only the identity/role read path moves.
