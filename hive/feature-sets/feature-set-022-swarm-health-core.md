# [feature-set-022] Swarm health monitoring (core)

**Status**: active
**Owner**: allavallc

## Goal
Continuous, system-side health monitoring of the swarm. A periodic job evaluates a small set of always-on data-integrity invariants against repo state + DB, writes anomalies to a `swarm_anomalies` table, and surfaces them in a "Swarm health" panel section. The panel section is gated to `session.user.name === "allavallc"` for now (admin-only during rollout). Other Bot Hive customers see no health panel until we widen access.

## Rationale
Tests run by humans catch state at one point in time. Bot swarms drift continuously: a bot crashes mid-claim and leaves a half-claimed ticket; an FS gets two colony owners; an event log filename uses an old format. Each rung's behavior should ship with the invariants that prove it's still working — but the cron/table/panel scaffolding has to ship first. This FS is that scaffolding plus the invariants that don't depend on any specific rung.

## Tickets (skeletons)
- HV-XXX: Schema — `swarm_anomalies` table (id, project_id, code, severity, message, details_jsonb, first_seen_at, last_seen_at, resolved_at). Drizzle migration. Idempotent.
- HV-XXX: Cron task — `swarm-health` runs every 5 min per project. Reads repo state via the GitHub App. Walks the always-on invariant list. Upserts anomalies (first_seen_at on insert, last_seen_at on every detection). Marks anomalies resolved when no longer detected.
- HV-XXX: Always-on invariants (~7 broad checks):
  1. Every `Assigned to` value on `in-progress/` tickets is qualified `<colony>.<handle>`
  2. Every event log filename matches `<colony>.<handle>.log`
  3. Every FS `Owner:` value matches a known GitHub login pattern (no bare bot handles)
  4. No two FSs claim the same Owner across distinct values that conflict (placeholder; revisit when cross-colony test runs)
  5. Every `in-progress/` ticket has a `Last touched` within 2h, else flag as stale-orphaned (severity: warning)
  6. Every owned FS has activity from that colony within 48h, else flag as dormant (severity: info)
  7. Every claim event in `hive/events/*.log` corresponds to a ticket file in `in-progress/` or later — no half-claims
- HV-XXX: API — `GET /api/projects/[id]/health` returns open anomalies grouped by severity. Gate: `session.user.name === "allavallc"`.
- HV-XXX: Panel — "Swarm health" section on the project page. Renders open anomalies by severity. "Mark resolved" button POSTs to `PATCH /api/projects/[id]/health/[anomalyId]`. Gate: same admin check, hidden for everyone else.

## Done when (rung-1 dependency)
- [ ] `swarm_anomalies` table exists + migration is idempotent
- [ ] Cron job runs every 5 min and writes anomalies for at least one of the always-on checks (verified by intentionally introducing a violation and seeing the row appear)
- [ ] Health panel section renders for `allavallc`, hidden for any other user
- [ ] Panel "Mark resolved" button works
- [ ] **Local test**: trigger a violation (e.g. rename an event log file to bare-handle form), wait 5 min, anomaly appears in panel; rename back, anomaly auto-resolves on next cron run

## Out of scope (this FS)
- Rung-aware role invariants (those ship in FS-023 — role consolidation)
- Cross-colony invariants beyond the bare-handle check (those ship in FS-024 — cascade enforcement)
- Email/Slack alerting (panel-only for v1)
- Wider access than `allavallc` (future)

## Test rung this unlocks
Rung 1 (1 bot end-to-end), in combination with FS-021.

## Severity scheme
`critical` (data corruption), `warning` (drift / stale), `info` (transient / expected). Drives panel sort order.
