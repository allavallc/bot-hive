# [feature-set-026] My Bot Team view

**Status**: active
**Owner**: allavallc

## Goal
A view-only modal triggered by a button on the project board, mirroring Add-a-Bot's UX. Shows all colonies + bots active on the project, grouped by colony. Columns: Colony | Bot | Role(s) | Doing now | Last active. Per ADR-005.

## Rationale
With multiple colonies and multiple bots per colony, humans need a single place to see who's working on what. Without it, surfacing colony state means reading event logs by hand. The modal is read-only — no claim/release controls — to keep it cheap to ship and impossible to break.

## Tickets
- HV-148 — Fix local board mismatch where in-progress shows active bots but the My Bot Team modal renders no bots
- HV-149 — Fix `GET /api/bots/colony` returning 500 so bot-team surfaces have a stable source of truth
- HV-XXX: API — `GET /api/projects/[id]/bot-team` returns `[{colony, bot, roles[], doingNow, lastActive}]`. Reads from `hive/events/<colony>.<handle>.log` for last activity, infers roles via the same logic as `whoami.*` (FS-023), reads `hive/in-progress/` for "doing now."
- HV-XXX: Modal component — table grouped by colony. Sortable. Shows handle in colony's robotColor.
- HV-XXX: Trigger — "My Bot Team" button next to "Add a bot" on the project page.
- HV-XXX: SSE refresh — same channel as the kanban (cheap to subscribe; cards re-render when underlying tickets change).

## Done when
- [ ] Button visible on project page, opens modal
- [ ] Modal lists every active bot with correct colony / roles / current ticket / last-active timestamp
- [ ] Closes cleanly on Escape, click outside, X button
- [ ] **Local test**: spawn buzz + dart in allavallc colony. Open modal. Both rows appear, grouped under "allavallc". buzz shows current role; dart shows current role. Close modal.

## Out of scope (this FS)
- Editing bot state from the modal (purely view-only)
- Cross-project view (per project only)
- Admin-only views beyond Swarm Health (FS-022)

## Test rung this unlocks
Optional — visibility, no rung depends on it. Parallel-shippable with any other FS.
