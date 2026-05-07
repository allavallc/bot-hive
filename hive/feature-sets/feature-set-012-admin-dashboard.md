# [feature-set-012] Admin: admin dashboard — UI and backend

**Status**: active

## Goal
A first-class admin surface for managing the Bot Hive product itself — users, projects, billing/seats, system health, and any future operator concerns. Today there's no admin UI; product administration happens via direct DB access, raw `gh api` calls, and ticket-file edits. As Bot Hive grows past pre-launch, an admin dashboard becomes the durable surface for operator work.

## Rationale
Operating Bot Hive today means SSH'ing to Render's logs, running raw SQL against the prod Postgres, or editing `hive/` files manually. That's fine for a single operator pre-launch — it's hostile when there's a second admin, an on-call rotation, or any compliance need to know "who did what."

An admin dashboard is the standard answer: a small set of pages, gated by an admin-role check, that surface the actions an operator actually performs (suspend a project, transfer billing, see live error rates, replay a webhook). It's the operational counterpart to the user-facing project board.

## Tickets
**To be planned collaboratively.** Likely scope:

- Admin auth / role gate (one user is an admin; later, a list of admins)
- Admin dashboard route (`/admin` or similar) with navigation
- Project list + drill-down (every project, billing owner, install state, last activity)
- User list + drill-down (every user, projects they have access to, last sign-in)
- Webhook delivery log (recent deliveries, statuses, replay button)
- System health (live error rate from Sentry, deploy status, DB stats)
- Audit log surface (who-did-what across admin actions)

The list above is illustrative — actual ticket breakdown happens once the FS is prioritized.

## Pre-attached tickets

- **HV-020** — Billing-seat transfer (UI + endpoint). First attempt landed on the project board page and was ripped out 2026-05-06 because the placement was wrong; re-parked here. Belongs on the admin dashboard surface; needs a layout review before re-implementation.

## Status
Planning — to be ideated and broken into tickets when prioritized

## Notes
- This is operator-facing, not user-facing. Different audience, different design language.
- Likely needs an "admin" role on the user record (or a hardcoded admin list) — design decision deferred to first ticket.
- Out of scope here: billing flows themselves (FS-005 territory), product analytics dashboards (separate FS if needed).
- Filing alongside FS-013 (user dashboard) because they pair conceptually but ship separately.
