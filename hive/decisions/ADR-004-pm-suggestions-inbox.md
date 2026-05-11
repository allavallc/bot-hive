# ADR-004: PM suggestion inbox + always-ask flag

**Status**: Accepted

**Date**: 2026-05-09

**Authors**: allavallc-cc1 (drafted), allavallc (decided)

---

## Context

In the role architecture (ADR-002), coder and tester bots can **suggest** new tickets via the notes channel; only PM bots actually file tickets. This avoids backlog noise from incidental "while I'm here, here's an idea" suggestions.

The remaining question: when a coder or tester writes `@<colony>.<pm-handle> we need a ticket for X`, does the PM auto-file it, ask the human first, or apply some threshold?

Possibilities considered:

- **Always auto-file**: risk of speculative or low-value suggestions polluting the backlog.
- **Always ask the human**: safe, but the human is in every loop.
- **Threshold-based**: PM auto-files small/clear suggestions, escalates strategic ones. Threshold rules in `hive/skills/pm.md`. Hardest to write, fuzziest behavior.

## Decision

**Default: PM always asks the human.** Auto-filing is gated behind a feature flag for now. The flag will be exposed later when the threshold rubric is mature enough to trust autonomous filing.

### Operational mechanics

1. **`always_ask` flag**: a database value, **scoped per-colony** (not per-user), defaulting to `true`. Bot Hive's settings page (future) lets the colony owner toggle it.

   Per-colony, not per-user: two humans on the same project may have different policies — the user wants to always-ask while Tony wants to auto-file. The flag belongs to the colony's policy, not the human's identity.

2. **Suggestion lifecycle**:
   - Coder/tester bot writes a note: `@<colony>.<pm-handle> we need a ticket for: <description>`
   - PM bot picks up the note on session start (or on each work-cycle check).
   - If `always_ask = true` (default): PM creates a `bot_suggestion` row — pending status, attaches the originating bot's note, surfaces it on the live board.
   - If `always_ask = false` (future): PM applies its rubric to decide whether to auto-file. If auto-filing, PM writes the ticket directly to `hive/backlog/`. If escalating, same path as the always-ask flow.

3. **Approve / reject UX**: suggestions render **inline in the swarm panel** as notes with two extra buttons attached: **Approve** and **Reject**.
   - Approve: PM bot files the ticket. Ticket lands in `hive/backlog/` as a normal new ticket. Suggestion row is marked approved + linked to the ticket id.
   - Reject: human optionally types a one-line reason. PM writes a note back to the suggesting bot's colony — `@<suggesting-colony>.<suggesting-handle> rejected: <reason>` — so the bot doesn't re-suggest the same thing on next session.

4. **Visibility**: the swarm panel header shows an unread-count badge (e.g., "Suggestions: 3"). Clicking scrolls to or filters down to suggestion-type notes. Approved/rejected suggestions disappear from the unread count.

5. **Lightweight feel, not in-review ceremony**: no PR cycle, no commit dance for the suggestion itself. Suggestion is a DB row + an SSE broadcast. Approval triggers ticket-file commit (via App-mediated commit, same path as accept/reject for in-review tickets).

## Consequences

**What becomes easier:**

- Backlog quality stays high: no auto-filed speculation polluting the queue while the system is young.
- Humans see exactly what bots think they should track, in one place, with simple Approve/Reject.
- The path to autonomous PM behavior is incremental: once the rubric in `hive/skills/pm.md` is mature, flip the flag — no architectural change needed.
- Per-colony policy lets two humans coexist with different operating styles.

**What becomes harder:**

- Humans have to triage suggestions actively. If a suggestion sits in the inbox for days, it's noise. The unread badge mitigates but doesn't prevent.
- A new database table (`bot_suggestions`) and a new API surface (submit, list, approve, reject) are introduced.
- The notes channel UX adds buttons to certain note rows — the swarm panel needs to know whether a note is a suggestion vs a regular note. Probably: a `kind` field on notes, or a separate `bot_suggestions` table that the panel renders interleaved with notes.

**Schema sketch** (implementation TBD):

```
bot_suggestions {
  id                uuid pk
  project_id        uuid fk
  suggester_actor   text       -- e.g. "allavallc.buzz"
  target_pm_actor   text       -- e.g. "allavallc.kestrel-pm"
  message           text       -- the suggestion body
  status            text       -- "pending" | "approved" | "rejected"
  rejection_reason  text       -- nullable; populated on reject
  approved_ticket_id text      -- nullable; populated on approve, references the filed HV-id
  created_at        timestamptz
  resolved_at       timestamptz
}

colony_settings {
  project_id       uuid fk
  colony           text       -- github login
  always_ask       boolean    -- default true
  primary key (project_id, colony)
}
```

## Open questions

- Should rejected suggestions be auto-archived after N days, or kept as a permanent log? Recommendation: keep permanent (audit value); UI can hide resolved rows by default and surface on demand.
- Should the human be able to **edit** a suggestion before approving? Useful for "yes but reword as `<better description>`." Recommendation: yes, in v1, via an inline editable text area before Approve.
- Should an approval trigger a notification back to the suggesting bot? Probably yes (`@<suggester>.handle approved: filed as HV-XXX`), so the bot knows their suggestion landed. Same channel as rejection notification.

## What this ADR does NOT decide

- The exact threshold rubric for auto-filing (when `always_ask = false`). That's a later piece of work, in `hive/skills/pm.md`.
- Whether to add similar approval flows for other PM actions (focus changes, FS claim/release). Defer until pattern is proven on suggestions.
