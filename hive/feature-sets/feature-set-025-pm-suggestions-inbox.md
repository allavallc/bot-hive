# [feature-set-025] PM suggestions inbox

**Status**: active
**Owner**: allavallc

## Goal
Wire the suggestions inbox per ADR-004. Coder/tester bots write suggestions to their PM via the notes channel using qualified mentions (`@<colony>.<pm-handle>`). The PM bot picks them up at session start, applies the colony's `always_ask` policy: if true (default), the PM creates a `bot_suggestions` row that renders inline in the swarm panel with Approve/Reject buttons. On approve, the PM files the ticket. On reject, the PM writes a reason note back. Schema for `bot_suggestions` + `colony_settings.always_ask` already shipped in PR #160.

## Rationale
At 3+ bots per colony, only the PM files tickets. Coders/testers can suggest, but they don't have ticket-writing authority. Without a clean inbox UX, suggestions drift in `notes-to-bots/*.log` files where humans can't easily review them. The inbox renders suggestions as actionable rows in the panel, keeping the human in the loop without forcing them to read every bot↔bot note.

## Tickets (skeletons)
- HV-XXX: API — `POST /api/projects/[id]/suggestions` (called by the PM bot after consuming a `@<colony>.<pm>` note from the notes channel; creates a row), `PATCH /api/projects/[id]/suggestions/[id]/approve` (creates a backlog ticket via the PM's normal file-creation path; sets row status), `PATCH /api/projects/[id]/suggestions/[id]/reject` (records reason; bot writes reason note to suggester on next cycle).
- HV-XXX: Panel UX — Suggestions section above the kanban columns. Each pending suggestion renders as a card: from-bot, target-pm, message, Approve / Reject buttons. Reject opens an inline textarea for the reason. Approve opens an inline ticket-draft form (title, body, FS) prefilled from the suggestion.
- HV-XXX: SSE channel — broadcast suggestion-created / suggestion-resolved so the panel updates without poll.
- HV-XXX: `colony_settings.always_ask` toggle — small UI in the panel header (admin-only, gated to `session.user.name === "allavallc"` for now) to flip the policy per project. Default is true.
- HV-XXX: PM bot logic — PM session start scans `hive/notes-to-bots/<colony>.*.log` for unprocessed `@<colony>.<self>` mentions; per `always_ask`, either creates a suggestion row (true) or files the ticket directly (false). Tracks processed-mention set in a per-PM state file to avoid double-processing.
- HV-XXX: Health invariants (rung-aware):
  - Every suggestion older than 24h with status pending fires an `info` anomaly (PM not responsive)
  - Approved suggestions must have a corresponding new ticket file in `hive/backlog/` referencing the suggestion id within ~5 min

## Done when (rung-4+ dependency)
- [ ] Suggestion API endpoints exist and are gated to project members
- [ ] Panel renders suggestions with Approve/Reject + textarea
- [ ] SSE broadcasts on suggestion changes; panel updates within ~10s
- [ ] PM bot creates suggestions correctly (verified by writing a test note from a coder bot and watching it appear)
- [ ] always_ask toggle persists per-colony and is read by PM
- [ ] **Local test**: spawn buzz, dart, raven (3 bots, allavallc colony). buzz = PM, dart = coder, raven = tester. dart writes `@allavallc.buzz: should we add X?` via note.ps1. Within next session start, suggestion appears in panel. Approve → new HV ticket appears in backlog within ~5 min. Reject with reason → reason note appears in `hive/notes-to-bots/allavallc.buzz.log` for dart to read.

## Out of scope (this FS)
- always_ask = false auto-filing logic (panel toggle exists but the PM rubric for auto-decisions ships later)
- Suggestion threading / replies
- Cross-colony suggestion routing (suggestions stay within colony for v1)

## Test rung this unlocks
Rung 4+ (3+ bots per colony with PM filing suggestions). Depends on FS-023 (role consolidation) so the PM exists as a distinct role.
