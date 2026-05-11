# [feature-set-009] Feature-set-first board view

**Status**: active
**Owner**:

## Goal
Reframe Bot Hive's default board from a Jira-style ticket kanban to a feature-set-first hierarchy. Top-level shows feature sets (goal, progress, status); drilling into one shows its tickets. The existing ticket kanban is preserved as a secondary "all tickets" view, not removed.

## Rationale
Tickets are implementation details; feature sets are intent. A human owner asking "what's shipping this week?" wants a feature set, not a list of HV-XXX cards. The current board renders the implementation, not the intent.

This is the natural complement to FS-007 (parallel-bot coordination): bots already operate feature-set-first via the `focus.md` convention; the UI should match how both humans and bots think about work. Aligning the two creates a single mental model — `focus = feature-set-007` reads identically whether you're a bot consuming the file or a human looking at the board.

This also reframes Bot Hive's value proposition: the product isn't "another ticket tracker" — it's "feature-set-driven coordination for human + bot teams." The board should look the part.

## Tickets
- HV-058 — View the board grouped by feature set (toggle on the board header; first cut layout TBD during implementation)

**Future tickets to be planned.** Anticipated scope:

- Default route `/projects/[id]` renders an FS dashboard: each feature set as a card showing goal sentence, ticket count, progress (% done), and status (planning / in-progress / done).
- Drill-down `/projects/[id]/feature-sets/[fs-id]` shows the tickets within a feature set in the existing kanban layout (so the current rendering work is reused, not thrown away).
- Alternate route `/projects/[id]/tickets` (or similar) preserves the existing all-tickets kanban for users who want the flat view.
- Standalone tickets (no feature set) get a default "Standalone" group on the FS dashboard.
- Live SSE updates to the FS dashboard when tickets within an FS change state.

Concrete tickets, ordering, and effort estimates: open question, plan together with CC2.

## Status
Planning — to be ideated and broken into tickets together with CC2
