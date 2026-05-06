# [feature-set-013] User: user dashboard — UI and backend

## Goal
A real user dashboard beyond today's project list — surfaces account settings, profile, integrations, usage, billing summary, and any future user-facing self-service. Today `/dashboard` is a flat list of projects; users have nowhere to manage their account, see their own activity, or change settings without an admin's help.

## Rationale
The current dashboard is a stub: list of projects + a "connect another repo" button. As users do more in Bot Hive, they need to:
- See and update their profile (name, email, GitHub-linked identity)
- Manage their own GitHub OAuth grant (revoke, re-authorize) without going through GitHub's settings
- See their activity (tickets they've authored, projects they've accepted/rejected on)
- Manage integrations (notifications, webhooks, API tokens — eventually)
- See their billing seat (which projects they're billed on, total monthly cost)
- Sign out gracefully without the "stale token" UX surprise we hit today

A dashboard is the standard surface for all of these. Building it incrementally — one user-task per ticket — is the right shape.

## Tickets
**To be planned collaboratively.** Likely scope:

- Profile page (name, email, GitHub identity)
- Settings page (notification prefs, default repo, etc.)
- Activity feed (recent tickets / commits / events touching this user's projects)
- Billing/seats summary (which projects bill to this user; future: payment method)
- Sign-out improvements (clear cache state, optionally revoke GitHub grant on demand)
- API tokens / personal access (later — when there's an external API to expose)

The list above is illustrative — actual ticket breakdown happens once the FS is prioritized.

## Status
Planning — to be ideated and broken into tickets when prioritized

## Notes
- Distinct from FS-012 (admin dashboard) — this is what the *user* sees, FS-012 is what the *operator* sees. Same idea (a dashboard), opposite audiences.
- The current `/dashboard` route stays the project-list landing page; this FS adds new sub-routes (`/dashboard/profile`, `/dashboard/billing`, etc.) that the existing project list links to.
- Out of scope: any UI redesign of the project list itself (FS-009 territory, the feature-set-first board view).
- Out of scope: payment flows (FS-005 territory).
